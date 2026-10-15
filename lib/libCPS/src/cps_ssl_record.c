#include <string.h>

#include "cps/cps_ssl_internal.h"

// SSL records: RC4 decryption / encryption with the MD5 or SHA-1 MAC (SSL 3.0 MAC: hash(secret + pad2
// + hash(secret + pad1 + sequence + type + length + data))), and reading a whole record from the
// socket and acting on it.

#pragma force_active on

// increments the 8-byte big endian counter that ends at end
void add1_be8(u8 *end) {
    int n = 8;
    do {
        u8 byte;
        --end;
        byte = *end + 1;
        *end = byte;
        if (byte) {
            return;
        }
    } while (--n);
}

int decrypt(CpsSsl *ssl, u8 *data, int length) {
    CPSi_rc4_crypt(&ssl->recvRc4, data, length);
    return length;
}

// decrypts the record in place and checks its MAC (error state if wrong); returns its new size
int make_plaintext(CpsSsl *ssl, u8 *record) {
    u8 digest[20];
    u8 pad[48];
    int length = decrypt(ssl, record + 5, (record[3] << 8) + record[4]);
    int macLength;
    switch (ssl->cipherSuite) {
    case CPS_SSL_RSA_RC4_128_MD5:
        length -= 16;
        record[3] = length >> 8;
        record[4] = length;
        CPSi_md5_init(&ssl->md5);
        CPSi_md5_calc(&ssl->md5, ssl->recvMacSecret, 16);
        MI_CpuFill8(pad, 0x36, 48);
        CPSi_md5_calc(&ssl->md5, pad, 48);
        CPSi_md5_calc(&ssl->md5, ssl->recvSequence, 8);
        CPSi_md5_calc(&ssl->md5, record, 1);
        CPSi_md5_calc(&ssl->md5, record + 3, length + 2);
        CPSi_md5_result(&ssl->md5, digest);
        CPSi_md5_init(&ssl->md5);
        CPSi_md5_calc(&ssl->md5, ssl->recvMacSecret, 16);
        MI_CpuFill8(pad, 0x5C, 48);
        CPSi_md5_calc(&ssl->md5, pad, 48);
        CPSi_md5_calc(&ssl->md5, digest, 16);
        CPSi_md5_result(&ssl->md5, digest);
        macLength = 16;
        break;
    case CPS_SSL_RSA_RC4_128_SHA:
        length -= 20;
        record[3] = length >> 8;
        record[4] = length;
        CPSi_sha1_init(&ssl->sha1);
        CPSi_sha1_calc(&ssl->sha1, ssl->recvMacSecret, 20);
        MI_CpuFill8(pad, 0x36, 40);
        CPSi_sha1_calc(&ssl->sha1, pad, 40);
        CPSi_sha1_calc(&ssl->sha1, ssl->recvSequence, 8);
        CPSi_sha1_calc(&ssl->sha1, record, 1);
        CPSi_sha1_calc(&ssl->sha1, record + 3, length + 2);
        CPSi_sha1_result(&ssl->sha1, digest);
        CPSi_sha1_init(&ssl->sha1);
        CPSi_sha1_calc(&ssl->sha1, ssl->recvMacSecret, 20);
        MI_CpuFill8(pad, 0x5C, 40);
        CPSi_sha1_calc(&ssl->sha1, pad, 40);
        CPSi_sha1_calc(&ssl->sha1, digest, 20);
        CPSi_sha1_result(&ssl->sha1, digest);
        macLength = 20;
        break;
    }
    if (memcmp(record + 5 + length, digest, macLength)) {
        ssl->state = CPS_SSL_STATE_ERROR;
    }
    add1_be8(ssl->recvSequence + 8);
    return length + 5;
}

// appends the MAC to the record (header + data) and encrypts it in place; returns its new size
int make_ciphertext(CpsSsl *ssl, u8 *record) {
    u8 pad[48];
    u8 *data = record + 5;
    int length = (record[3] << 8) + record[4];
    switch (ssl->cipherSuite) {
    case CPS_SSL_RSA_RC4_128_MD5:
        CPSi_md5_init(&ssl->md5);
        CPSi_md5_calc(&ssl->md5, ssl->sendMacSecret, 16);
        MI_CpuFill8(pad, 0x36, 48);
        CPSi_md5_calc(&ssl->md5, pad, 48);
        CPSi_md5_calc(&ssl->md5, ssl->sendSequence, 8);
        CPSi_md5_calc(&ssl->md5, record, 1);
        CPSi_md5_calc(&ssl->md5, record + 3, length + 2);
        CPSi_md5_result(&ssl->md5, data + length);
        CPSi_md5_init(&ssl->md5);
        CPSi_md5_calc(&ssl->md5, ssl->sendMacSecret, 16);
        MI_CpuFill8(pad, 0x5C, 48);
        CPSi_md5_calc(&ssl->md5, pad, 48);
        CPSi_md5_calc(&ssl->md5, data + length, 16);
        CPSi_md5_result(&ssl->md5, data + length);
        length += 16;
        break;
    case CPS_SSL_RSA_RC4_128_SHA:
        CPSi_sha1_init(&ssl->sha1);
        CPSi_sha1_calc(&ssl->sha1, ssl->sendMacSecret, 20);
        MI_CpuFill8(pad, 0x36, 40);
        CPSi_sha1_calc(&ssl->sha1, pad, 40);
        CPSi_sha1_calc(&ssl->sha1, ssl->sendSequence, 8);
        CPSi_sha1_calc(&ssl->sha1, record, 1);
        CPSi_sha1_calc(&ssl->sha1, record + 3, length + 2);
        CPSi_sha1_result(&ssl->sha1, data + length);
        CPSi_sha1_init(&ssl->sha1);
        CPSi_sha1_calc(&ssl->sha1, ssl->sendMacSecret, 20);
        MI_CpuFill8(pad, 0x5C, 40);
        CPSi_sha1_calc(&ssl->sha1, pad, 40);
        CPSi_sha1_calc(&ssl->sha1, data + length, 20);
        CPSi_sha1_result(&ssl->sha1, data + length);
        length += 20;
        break;
    }
    record[3] = length >> 8;
    record[4] = length;
    CPSi_rc4_crypt(&ssl->sendRc4, record + 5, length);
    add1_be8(ssl->sendSequence + 8);
    return length + 5;
}

// reads exactly length bytes from the TCP stream; -1: the connection ended
int tcp_read_raw_nbytes(u8 *out, int length, CpsSocket *socket) {
    u32 size;
    do {
        void *data = CPSi_TcpReadRaw(&size, socket);
        if (size == 0) {
            return -1;
        }
        if (size > length) {
            size = length;
        }
        MI_CpuCopy8(data, out, size);
        CPSi_SocConsumeRaw(size, socket);
        length -= size;
        out += size;
    } while (length > 0);
    return 0;
}

// adds a handshake message to the finished hashes
void update_digest(CpsSsl *ssl, const void *message, int length) {
    CPSi_sha1_calc(&ssl->handshakeSha1, message, length);
    CPSi_md5_calc(&ssl->handshakeMd5, message, length);
}

// Acts on a whole record (alloc'ed, header included): handshake messages move the state on, an
// application data record is kept in ssl->record (otherwise the record is freed).
void parse_record_in_buf(CpsSsl *ssl, u8 *record) {
    int state = ssl->state, type;
    u8 *p;
    int length;
    if (state == CPS_SSL_STATE_ERROR) {
        gCpsFree(record);
        return;
    }
    length = (record[3] << 8) + record[4] + 5;
    type = record[0];
    // encrypted after change cipher spec (an unencrypted alert is 7 bytes)
    if (((u8)(state + 0x100 - CPS_SSL_STATE_CHANGE_CIPHER) <= 1 && type != 21) || (type == 21 && (u32)length > 7)) {
        length = make_plaintext(ssl, record);
        state = ssl->state;
        if (state == CPS_SSL_STATE_ERROR) {
            gCpsFree(record);
            return;
        }
    }
    p = record + 5;
    length -= 5;
    switch (type) {
    case 20: // change cipher spec
        if (!ssl->recvMacSecret) {
            ssl->state = CPS_SSL_STATE_ERROR;
        } else {
            MI_CpuFill8(ssl->recvSequence, 0, 8);
            ssl->state = CPS_SSL_STATE_CHANGE_CIPHER;
        }
        break;
    case 21:           // alert
        if (*p == 2) { // fatal
            ssl->state = CPS_SSL_STATE_ERROR;
        }
        break;
    case 22: // handshake
        do {
            int message = p[0];
            u32 size = (p[1] << 16) + (p[2] << 8) + p[3];
            p += 4;
            switch (message) {
            case 1:
                if (ssl->isServer && state == CPS_SSL_STATE_START) {
                    client_hello(ssl, p);
                }
                break;
            case 16:
                rcv_client_key_exchange(ssl, p);
                break;
            case 2:
                rcv_server_hello(ssl, p);
                break;
            case 11:
                rcv_certificate(ssl, p);
                ssl->inSubject = 0; // from here: certificate requested
                break;
            case 13: // certificate request
                ssl->inSubject = 1;
                break;
            case 14:
                ssl->state = CPS_SSL_STATE_SERVER_HELLO_DONE;
                break;
            case 20:
                rcv_finished(ssl, p);
                break;
            default:
                ssl->state = CPS_SSL_STATE_ERROR;
                break;
            }
            update_digest(ssl, p - 4, size + 4);
            p += size;
            length -= size + 4;
            if (!length) {
                break;
            }
            state = ssl->state;
        } while (state != CPS_SSL_STATE_ERROR);
        break;
    case 23: // application data
        ssl->record = record;
        ssl->recordOffset = 5;
        ssl->recordSize = length + 5;
        ssl->recordReady = 1;
        return;
    default:
        ssl->state = CPS_SSL_STATE_ERROR;
        break;
    }
    gCpsFree(record);
}

// reads the next record (an SSL 2.0 client hello too) and acts on it; returns the new state
int parse_record(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    u32 size;
    u8 *data, *record;
    for (;;) {
        data = CPSi_TcpReadRaw(&size, socket);
        if (!size) {
            ssl->state = CPS_SSL_STATE_ERROR;
            return CPS_SSL_STATE_ERROR;
        }
        if (size >= 5) {
            break;
        }
    }
    if (data[0] == 0x80) {
        // SSL 2.0 record header (2 bytes)
        if (ssl->isServer && !ssl->state) {
            size = data[1];
            CPSi_SocConsumeRaw(2, socket);
            record = gCpsAlloc(size);
            if (!record) {
                ssl->state = CPS_SSL_STATE_ERROR;
                return CPS_SSL_STATE_ERROR;
            }
            if (tcp_read_raw_nbytes(record, size, socket) == 0 && record[0] == 1) {
                client_hello_v2(ssl, record + 1);
            } else {
                ssl->state = CPS_SSL_STATE_ERROR;
            }
            update_digest(ssl, record, size);
            gCpsFree(record);
        } else {
            ssl->state = CPS_SSL_STATE_ERROR;
        }
    } else {
        size = (data[3] << 8) + data[4] + 5;
        if (size > 0x4000 + 2048 + 5) {
            ssl->state = CPS_SSL_STATE_ERROR;
            return CPS_SSL_STATE_ERROR;
        }
        record = gCpsAlloc(size);
        if (!record) {
            ssl->state = CPS_SSL_STATE_ERROR;
            return CPS_SSL_STATE_ERROR;
        }
        if (tcp_read_raw_nbytes(record, size, socket)) {
            gCpsFree(record);
            ssl->state = CPS_SSL_STATE_ERROR;
            return CPS_SSL_STATE_ERROR;
        }
        parse_record_in_buf(ssl, record);
    }
    return ssl->state;
}
