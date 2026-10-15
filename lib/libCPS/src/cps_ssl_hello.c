#include <string.h>

#include "cps/cps_ssl_internal.h"

// Hello messages: the server hello (client side) and the client hello in SSL 3.0 and SSL 2.0 format
// (server side); the cipher suite is the first of gCpsSslConfig.cipherSuites the peer offers.

#pragma force_active on

void rcv_server_hello(CpsSsl *ssl, u8 *message) {
    int hadSession, idLength;
    MI_CpuCopy8(message + 2, ssl->serverRandom, 32);
    hadSession = ssl->hasSession;
    idLength = message[34];
    message = (u8 *)((u32)message + 35);
    if (hadSession && idLength == 32 && !memcmp(ssl->sessionId, message, 32)) {
        ssl->resumed = 1;
    } else {
        if (hadSession) {
            purge_session(ssl);
        }
        if (idLength) {
            MI_CpuCopy8(message, ssl->sessionId, 32);
            ssl->hasSession = 1;
        } else {
            ssl->hasSession = 0;
        }
        ssl->resumed = 0;
    }
    {
        u8 *cipherSuite = message + idLength;
        ssl->cipherSuite = (cipherSuite[0] << 8) + cipherSuite[1];
    }
    ssl->state = CPS_SSL_STATE_SERVER_HELLO;
}

// whether the list of count cipher suites (width bytes each, big endian) holds the suite
int has_method(u8 *list, int count, int width, int suite) {
    int i;
    for (i = 0; i < count; i++, list += width) {
        int x = (list[0] << 8) + list[1];
        if (width == 3) {
            x = (x << 8) + list[2];
        }
        if (x == suite) {
            return 1;
        }
    }
    return 0;
}

int select_method(u8 *list, int count, int width) {
    u32 i;
    for (i = 0; i < 2; i++) {
        if (has_method(list, count, width, gCpsSslConfig.cipherSuites[i])) {
            return gCpsSslConfig.cipherSuites[i];
        }
    }
    return 0;
}

int version_ok(int major, int minor) {
    return major == 3;
}

// SSL 2.0 client hello (after the message type): no session, the challenge is the client random
void client_hello_v2(CpsSsl *ssl, u8 *message) {
    int suitesLength, idLength, challengeLength, offset;
    u16 suite;
    {
        int valid = version_ok(message[0], message[1]);
        if (valid == 0) {
            return;
        }
    }
    suitesLength = (message[2] << 8) + message[3];
    suite = select_method(message + 8, suitesLength / 3, 3);
    if (suite == 0) {
        return;
    }
    ssl->cipherSuite = suite;
    challengeLength = message[4];
    idLength = (challengeLength << 8) + message[5];
    challengeLength = (message[6] << 8) + message[7];
    ssl->hasSession = 0;
    offset = suitesLength + 8 + idLength;
    if (challengeLength >= 32) {
        MI_CpuCopy8(message + offset, ssl->clientRandom, 32);
    } else {
        MI_CpuFill8(ssl->clientRandom, 0, 32 - challengeLength);
        MI_CpuCopy8(message + offset, ssl->clientRandom + 32 - challengeLength, challengeLength);
    }
    ssl->state = CPS_SSL_STATE_CLIENT_HELLO;
    return;
}

void client_hello(CpsSsl *ssl, u8 *message) {
    int idLength, suitesLength;
    u16 suite;
    {
        int valid = version_ok(message[0], message[1]);
        if (valid == 0) {
            return;
        }
    }
    MI_CpuCopy8(message + 2, ssl->clientRandom, 32);
    idLength = message[34];
    message = (u8 *)((u32)message + 35);
    if (idLength != 32) {
        ssl->hasSession = 0;
    } else {
        MI_CpuCopy8(message, ssl->sessionId, 32);
        find_session_from_id(ssl);
    }
    {
        u8 *suites = message + idLength;
        suitesLength = (suites[0] << 8) + suites[1];
        suite = select_method(suites + 2, suitesLength / 2, 2);
    }
    ssl->cipherSuite = suite;
    if (suite) {
        ssl->state = CPS_SSL_STATE_CLIENT_HELLO;
        return;
    }
    return;
}
