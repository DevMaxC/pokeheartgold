#include "cps/cps_ssl_internal.h"

// SSL handshake: the messages CPS sends (server hello + certificate, client hello, client key
// exchange, change cipher spec + finished) and the client / server handshake sequences.

#pragma force_active on

// server hello, certificate (unless resumed) and server hello done; nonzero: the session is resumed
int send_server_hello(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    u8 *buffer, *cursor;
    CpsSslCertificate *certificate = ssl->serverCertificate;
    int length = certificate ? certificate->length : 0;
    u32 time = date2sec();
    ssl->serverRandom[0] = time >> 24;
    ssl->serverRandom[1] = time >> 16;
    ssl->serverRandom[2] = time >> 8;
    ssl->serverRandom[3] = time;
    set_random(ssl->serverRandom + 4, 28);
    buffer = gCpsAlloc(length + 157);
    if (!buffer) {
        ssl->state = CPS_SSL_STATE_ERROR;
        return 1;
    }
    buffer[5] = 2; // server hello, 70 bytes
    buffer[6] = 0;
    buffer[7] = 0;
    buffer[8] = 70;
    buffer[9] = 3;
    buffer[10] = 0;
    MI_CpuCopy8(ssl->serverRandom, buffer + 11, 32);
    buffer[43] = 32;
    if (ssl->hasSession) {
        MI_CpuCopy8(ssl->sessionId, buffer + 44, 32);
        ssl->resumed = 1;
        cursor = buffer + 76;
    } else {
        // new session id: random, then the session count
        u32 count;
        set_random(buffer + 44, 28);
        cursor = buffer + 76;
        count = gCpsSslRandomState.sessionCount;
        buffer[72] = count >> 24;
        buffer[73] = count >> 16;
        buffer[74] = count >> 8;
        buffer[75] = count;
        MI_CpuCopy8(cursor - 32, ssl->sessionId, 32);
        count = gCpsSslRandomState.sessionCount;
        ssl->resumed = 0;
        gCpsSslRandomState.sessionCount = count + 1;
    }
    cursor[0] = ssl->cipherSuite >> 8;
    cursor[1] = ssl->cipherSuite;
    cursor[2] = 0; // no compression
    cursor += 3;
    if (!ssl->resumed) {
        if (length) {
            int messageLength = length + 6;
            int chainLength = length + 3;
            cursor[0] = 11;
            cursor[1] = messageLength >> 16;
            cursor[2] = messageLength >> 8;
            cursor[3] = messageLength;
            cursor[4] = chainLength >> 16;
            cursor[5] = chainLength >> 8;
            cursor[6] = chainLength;
            cursor[7] = length >> 16;
            cursor[8] = length >> 8;
            cursor[9] = length;
            cursor += 10;
            MI_CpuCopy8(certificate->bytes, cursor, length);
            cursor += length;
        }
        cursor[0] = 14;
        cursor[1] = 0;
        cursor[2] = 0;
        cursor[3] = 0;
        cursor += 4;
    }
    length = cursor - buffer - 5;
    buffer[0] = 22;
    buffer[1] = 3;
    buffer[2] = 0;
    buffer[3] = length >> 8;
    buffer[4] = length;
    update_digest(ssl, buffer + 5, length);
    CPSi_TcpWrite2Raw(buffer, length + 5, NULL, 0, socket);
    gCpsFree(buffer);
    return ssl->resumed;
}

// change cipher spec, then the (encrypted) finished message
void send_change_cipher_spec_and_finished(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    u8 *packet = gCpsAlloc(131);
    if (!packet) {
        ssl->state = CPS_SSL_STATE_ERROR;
        return;
    }
    packet[0] = 20;
    packet[1] = 3;
    packet[2] = 0;
    packet[3] = 0;
    packet[4] = 1;
    packet[5] = 1;
    MI_CpuFill8(ssl->sendSequence, 0, 8);
    packet[6] = 22;
    packet[7] = 3;
    packet[8] = 0;
    packet[9] = 0;
    packet[10] = 40;
    packet[11] = 20; // finished, 36 bytes
    packet[12] = 0;
    packet[13] = 0;
    packet[14] = 36;
    MI_CpuCopy8(&ssl->handshakeMd5, &ssl->md5, sizeof(CpsMd5Context));
    finished_md5(ssl, packet + 15, 0);
    MI_CpuCopy8(&ssl->md5, &ssl->handshakeMd5, sizeof(CpsMd5Context));
    MI_CpuCopy8(&ssl->handshakeSha1, &ssl->sha1, sizeof(CpsSha1Context));
    finished_sha1(ssl, packet + 31, 0);
    MI_CpuCopy8(&ssl->sha1, &ssl->handshakeSha1, sizeof(CpsSha1Context));
    update_digest(ssl, packet + 11, 40);
    CPSi_TcpWrite2Raw(packet, make_ciphertext(ssl, packet + 6) + 6, NULL, 0, socket);
    gCpsFree(packet);
}

// client hello: offers the cached session of the server, if any
void send_client_hello(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    u8 *packet, *p;
    u32 now, i;
    int length;
    packet = gCpsAlloc(152);
    if (!packet) {
        ssl->state = CPS_SSL_STATE_ERROR;
        return;
    }
    packet[9] = 3;
    packet[10] = 0;
    now = date2sec();
    ssl->clientRandom[0] = now >> 24;
    ssl->clientRandom[1] = now >> 16;
    ssl->clientRandom[2] = now >> 8;
    ssl->clientRandom[3] = now;
    set_random(ssl->clientRandom + 4, 28);
    MI_CpuCopy8(ssl->clientRandom, packet + 11, 32);
    find_session_from_IP(ssl, socket->remoteIp, socket->remotePort);
    if (ssl->hasSession) {
        packet[43] = 32;
        MI_CpuCopy8(ssl->sessionId, packet + 44, 32);
        p = packet + 76;
    } else {
        packet[43] = 0;
        p = packet + 44;
    }
    p[0] = 0;
    p[1] = 4;
    p += 2;
    for (i = 0; i < 2; i++) {
        p[0] = gCpsSslConfig.cipherSuites[i] >> 8;
        p[1] = gCpsSslConfig.cipherSuites[i];
        p += 2;
    }
    p[0] = 1; // one compression method: none
    p[1] = 0;
    length = (u32)(p + 2) - (u32)packet - 5;
    packet[0] = 22;
    packet[1] = 3;
    packet[2] = 0;
    packet[3] = length >> 8;
    packet[4] = length;
    packet[5] = 1;
    packet[6] = (length - 4) >> 16;
    packet[7] = (length - 4) >> 8;
    packet[8] = length - 4;
    CPSi_TcpWrite2Raw(packet, length + 5, NULL, 0, socket);
    update_digest(ssl, packet + 5, length);
    gCpsFree(packet);
}

// client key exchange: the pre-master secret (version 3.0 + 46 random bytes) RSA encrypted with the
// server certificate's key (PKCS #1 block type 2); a no_certificate alert first if the server asked
// for a certificate
void send_client_key_exchange(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    u16 *work;
    u16 *modulus;
    u8 *p;
    int priority;
    u8 *out;
    int i;
    int digits;
    u8 *encoded;
    u16 *plain;
    int bytes;
    u16 *exponent;
    if (ssl->inSubject) {
        CPSi_TcpWrite2Raw(gCpsSslNoCertificateAlert, 7, NULL, 0, socket);
    }
    ssl->masterSecret[0] = 3;
    ssl->masterSecret[1] = 0;
    set_random(ssl->masterSecret + 2, 46);
    bytes = ssl->modulusLength;
    digits = (s32)((u32)bytes * 2) / 2;
    encoded = gCpsAlloc(bytes);
    if (!encoded) {
        ssl->state = CPS_SSL_STATE_ERROR;
        return;
    }
    encoded[0] = 0;
    encoded[1] = 2;
    set_random(encoded + 2, (s32)((u32)bytes - 51));
    encoded[(s32)((u32)bytes - 49)] = 0;
    MI_CpuCopy8(ssl->masterSecret, encoded + bytes - 48, 48);
    work = gCpsAlloc((s32)((u32)digits << 3));
    if (!work) {
        gCpsFree(encoded);
        ssl->state = CPS_SSL_STATE_ERROR;
        return;
    }
    plain = work + digits;
    exponent = plain + digits;
    modulus = exponent + digits;
    CPSi_big_from_char(plain, encoded, bytes, digits);
    CPSi_big_from_char(exponent, ssl->exponent, ssl->exponentLength, digits);
    CPSi_big_from_char(modulus, ssl->modulus, bytes, digits);
    priority = enter_computebound();
    CPSi_big_power(work, plain, exponent, digits, modulus);
    exit_computebound(priority);
    out = gCpsAlloc((s32)((u32)bytes + 73));
    if (!out) {
        gCpsFree(encoded);
        gCpsFree(work);
        ssl->state = CPS_SSL_STATE_ERROR;
        return;
    }
    out[0] = 22;
    out[1] = 3;
    out[2] = 0;
    out[3] = (bytes + 4) >> 8;
    out[4] = bytes + 4;
    out[5] = 16;
    out[6] = bytes >> 16;
    out[7] = bytes >> 8;
    out[8] = bytes;
    p = out + 9;
    if (bytes & 1) {
        out[9] = work[bytes / 2];
        p = out + 10;
    }
    for (i = bytes / 2 - 1; i >= 0; i--) {
        p[0] = work[i] >> 8;
        p[1] = work[i];
        p += 2;
    }
    CPSi_TcpWrite2Raw(out, (s32)((u32)bytes + 9), NULL, 0, socket);
    update_digest(ssl, out + 5, (s32)((u32)bytes + 4));
    gCpsFree(out);
    gCpsFree(work);
    gCpsFree(encoded);
}

int mustget_change_cipher_spec_and_finished(CpsSocket *socket) {
    if (parse_record(socket) != CPS_SSL_STATE_CHANGE_CIPHER) {
        return 1;
    }
    return parse_record(socket) != CPS_SSL_STATE_FINISHED;
}

// nonzero: failed
int ssl_listen_try(CpsSocket *socket) {
    if (parse_record(socket) != CPS_SSL_STATE_CLIENT_HELLO) {
        return 1;
    }
    if (send_server_hello(socket)) {
        create_key_block(socket->ssl);
        send_change_cipher_spec_and_finished(socket);
        if (mustget_change_cipher_spec_and_finished(socket)) {
            return 1;
        }
    } else {
        if (parse_record(socket) != CPS_SSL_STATE_KEY_EXCHANGE) {
            return 1;
        }
        if (mustget_change_cipher_spec_and_finished(socket)) {
            return 1;
        }
        send_change_cipher_spec_and_finished(socket);
    }
    return 0;
}

// accepts connections until one completes the server handshake
void CPSi_SslListen(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    for (;;) {
        CPSi_TcpListenRaw(socket);
        ssl->state = CPS_SSL_STATE_START;
        ssl->recvMacSecret = NULL;
        ssl->isServer = 1;
        CPSi_sha1_init(&ssl->handshakeSha1);
        CPSi_md5_init(&ssl->handshakeMd5);
        if (!ssl_listen_try(socket)) {
            ssl->state = CPS_SSL_STATE_ESTABLISHED;
            return;
        }
        CPSi_TcpShutdownRaw(socket);
        socket->remotePort = socket->boundRemotePort;
        socket->remoteIp = socket->boundRemoteIp;
    }
}

int ssl_connect_try(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    int state;
    send_client_hello(socket);
    do {
        state = parse_record(socket);
        if (state == CPS_SSL_STATE_ERROR) {
            return 1;
        }
    } while (state != CPS_SSL_STATE_SERVER_HELLO_DONE && ssl->resumed == 0);
    if (ssl->resumed) {
        create_key_block(ssl);
        if (mustget_change_cipher_spec_and_finished(socket)) {
            return 1;
        }
        send_change_cipher_spec_and_finished(socket);
    } else {
        send_client_key_exchange(socket);
        create_master_secret(ssl);
        if (ssl->hasSession) {
            cache_session(ssl, socket->remoteIp, socket->remotePort);
        }
        create_key_block(ssl);
        send_change_cipher_spec_and_finished(socket);
        if (mustget_change_cipher_spec_and_finished(socket)) {
            return 1;
        }
    }
    ssl->state = CPS_SSL_STATE_ESTABLISHED;
    return 0;
}

// connects (unless connected) and runs the client handshake; nonzero: failed
int CPSi_SslConnect(CpsSocket *socket) {
    CpsSsl *ssl = socket->ssl;
    if (socket->state != CPS_STATE_ESTABLISHED && CPSi_TcpConnectRaw(socket) != 0) {
        return 1;
    }
    ssl->state = CPS_SSL_STATE_START;
    ssl->recvMacSecret = NULL;
    ssl->isServer = 0;
    CPSi_sha1_init(&ssl->handshakeSha1);
    CPSi_md5_init(&ssl->handshakeMd5);
    return ssl_connect_try(socket);
}
