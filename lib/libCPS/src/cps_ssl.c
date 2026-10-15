#include "cps/cps_ssl_internal.h"

// SSL socket interface used by the CPS socket API for sockets with sslEnabled: reading decrypted
// application data, writing records, shutdown, and the periodic session / handshake time-outs.

#pragma force_active on

// blocks until an application data record is there; returns its unread data (*length 0: closed)
void *CPSi_SslRead(u32 *length, CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    if (ssl->record && !ssl->recordReady) {
        // a record try_fill_record started
        if (tcp_read_raw_nbytes(ssl->record + ssl->recordOffset, ssl->recordSize - ssl->recordOffset, socket)) {
            gCpsFree(ssl->record);
            ssl->record = NULL;
            *length = 0;
            return NULL;
        }
        parse_record_in_buf(ssl, ssl->record);
        if (!ssl->recordReady) {
            ssl->record = NULL;
        }
    }
    while (!ssl->record) {
        if (parse_record(socket) == CPS_SSL_STATE_ERROR) {
            *length = 0;
            return NULL;
        }
    }
    *length = ssl->recordSize - ssl->recordOffset;
    return ssl->record + ssl->recordOffset;
}

void CPSi_SslConsume(u32 length, CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    if (length >= ssl->recordSize - ssl->recordOffset) {
        if (ssl->record) {
            gCpsFree(ssl->record);
        }
        ssl->record = NULL;
        return;
    }
    ssl->recordOffset += length;
}

// non-blocking: moves what the socket received into the record being read (recordOffset counts the
// bytes so far) and parses it once complete
void try_fill_record(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    u32 size;
    u8 *data;
    int complete;
    if (ssl->record == NULL) {
        if ((u32)socket->recvLength < 5) {
            return;
        }
        data = CPSi_TcpReadRaw(&size, socket);
        size = (data[3] << 8) + data[4] + 5;
        if (size > 0x4000 + 2048 + 5) {
            ssl->state = CPS_SSL_STATE_ERROR;
            return;
        }
        ssl->record = gCpsAlloc(size);
        if (ssl->record == NULL) {
            ssl->state = CPS_SSL_STATE_ERROR;
            return;
        }
        ssl->recordSize = size;
        ssl->recordOffset = 0;
        ssl->recordReady = 0;
    } else if (socket->recvLength == 0) {
        return;
    }
    data = CPSi_TcpReadRaw(&size, socket);
    if (size >= ssl->recordSize - ssl->recordOffset) {
        size = ssl->recordSize - ssl->recordOffset;
        complete = 1;
    } else {
        complete = 0;
    }
    MI_CpuCopy8(data, ssl->record + ssl->recordOffset, size);
    CPSi_SocConsumeRaw(size, socket);
    if (complete) {
        parse_record_in_buf(ssl, ssl->record);
        if (ssl->recordReady == 0) {
            ssl->record = NULL;
        }
    } else {
        ssl->recordOffset += size;
    }
}

// bytes of application data readable without blocking; -1: closed or failed
int CPSi_SslGetLength(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    if (!ssl->record || !ssl->recordReady) {
        try_fill_record(socket);
    }
    if (ssl->record && ssl->recordReady) {
        return ssl->recordSize - ssl->recordOffset;
    }
    if (!ssl->record && (socket->state != CPS_STATE_ESTABLISHED || ssl->state == CPS_SSL_STATE_ERROR)) {
        return -1;
    }
    return 0;
}

// sends the two buffers as application data records (at most 2895 bytes each); returns the bytes sent
int CPSi_SslWrite2(u8 *data, u32 length, u8 *data2, int length2, CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    int total = 0;
    u8 *record;
    int left = length + length2;
    int first;
    do {
        int n = left > 2895 ? 2895 : left;
        record = gCpsAlloc(n + 25);
        int second;
        if (!record) {
            break;
        }
        first = length >= (u32)n ? n : length;
        second = n - first;
        MI_CpuCopy8(data, record + 5, first);
        data += first;
        length -= first;
        MI_CpuCopy8(data2, record + 5 + first, second);
        record[0] = 23;
        record[1] = 3;
        record[2] = 0;
        record[3] = n >> 8;
        data2 += second;
        record[4] = n;
        first = make_ciphertext(ssl, record);
        if (CPSi_TcpWrite2Raw(record, first, NULL, 0, socket) < (u32)first) {
            n = 0;
        }
        gCpsFree(record);
        left -= n;
        total += n;
        if (!left || !n) {
            break;
        }
    } while (1);
    return total;
}

// sends a close_notify alert
void CPSi_SslShutdown(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    u8 packet[28];
    if (ssl->state == CPS_SSL_STATE_ESTABLISHED) {
        int length;
        packet[0] = 21;
        packet[1] = 3;
        packet[2] = 0;
        packet[3] = 0;
        packet[4] = 2;
        packet[5] = 1;
        packet[6] = 0;
        length = make_ciphertext(ssl, packet);
        CPSi_TcpWrite2Raw(packet, length, NULL, 0, socket);
    }
    ssl->state = CPS_SSL_STATE_START;
}

void CPSi_SslClose(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    ssl->state = CPS_SSL_STATE_START;
    if (ssl->record) {
        gCpsFree(ssl->record);
    }
    ssl->record = NULL;
}

// SSL on / off for the calling thread's socket
void CPS_SetSsl(int enable) {
    CpsSocket *socket;
    OSi_ReferSymbol(_version_UBIQUITOUS_SSL);
    socket = CpsThread_GetSocket(OSi_ThreadInfo.current);
    if (socket) {
        socket->sslEnabled = enable;
    }
}

// (scavenger, now = OS_GetTick() >> 16) expires cached sessions and wakes the threads whose handshake
// takes too long
void CPSi_SslPeriodical(int now) {
    OSIntrMode enabled = OS_DisableInterrupts();
    int i;
    CpsSslSession *session = gCpsSslSessionCache;
    OSThread *thread;
    CpsSocket *socket;
    for (i = 0; i < 4; i++, session++) {
        if (session->valid && (int)(now - session->tick) > 957) {
            session->valid = 0;
        }
    }
    OS_RestoreInterrupts(enabled);
    for (thread = OSi_ThreadInfo.list; thread; thread = thread->next) {
        socket = CpsThread_GetSocket(thread);
        if (socket && socket->thread && socket->sslEnabled && socket->state == CPS_STATE_ESTABLISHED && ((CpsSsl *)socket->ssl)->state < CPS_SSL_STATE_ESTABLISHED && (int)(now - socket->tick) > 239 && socket->waiting == CPS_WAIT_DATA) {
            socket->state = CPS_STATE_CLOSED;
            socket->waiting = 0;
            OS_WakeupThreadDirect(socket->thread);
        }
    }
}

void CPSi_SslCleanup(void) {
    MI_CpuFill8(gCpsSslSessionCache, 0, sizeof(gCpsSslSessionCache));
}

void char_from_long(void *dest, const void *src, int size) {
    MI_CpuCopy8(src, dest, size);
}

void long_from_char(void *dest, const void *src, int size) {
    MI_CpuCopy8(src, dest, size);
}
