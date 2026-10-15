#include <string.h>

#include "cps/cps_ssl_internal.h"

// SSL 3.0 key derivation: the RSA decryption of the pre-master secret (server), the master secret,
// the key block and the finished message hashes.

#pragma force_active on

// server: RSA decryption (Chinese remainder theorem) of the client key exchange into the pre-master
// secret (the last 48 bytes of the result)
void decrypt_premaster_secret(u8 *out, const u8 *input, CpsRsaPrivateKey *key) {
    int digits, priority;
    u16 *x, *operand, *product, *m1, *m2, *modulus, *remainder, *scratch;
    if (!key || !key->length) {
        return;
    }
    digits = ((key->length << 1) / 2) + 1;
    x = gCpsAlloc(digits * 20);
    if (!x) {
        return;
    }
    operand = x + digits;
    product = operand + digits;
    m1 = product + digits;
    m2 = m1 + digits;
    modulus = m2 + digits;
    remainder = modulus + digits;
    scratch = remainder + digits;
    CPSi_big_from_char(x, input, key->length, digits);
    CPSi_big_from_char(operand, key->exponent1, key->exponent1Length, digits);
    CPSi_big_from_char(modulus, key->prime1, key->prime1Length, digits);
    priority = enter_computebound();
    CPSi_big_montpower(m1, x, operand, digits, modulus); // c^dP mod p
    CPSi_big_from_char(operand, key->exponent2, key->exponent2Length, digits);
    CPSi_big_from_char(modulus, key->prime2, key->prime2Length, digits);
    CPSi_big_montpower(m2, x, operand, digits, modulus); // c^dQ mod q
    exit_computebound(priority);
    // m = m2 + q * (qInv * (m1 - m2)) mod n
    CPSi_big_sub(x, m1, m2, digits);
    CPSi_big_from_char(operand, key->coefficient, key->coefficientLength, digits);
    CPSi_big_mult(product, x, operand, digits);
    CPSi_big_from_char(operand, key->prime2, key->prime2Length, digits);
    CPSi_big_mult(x, product, operand, digits);
    CPSi_big_add(product, x, m2, digits);
    CPSi_big_from_char(operand, key->modulus, key->length, digits);
    if (CPSi_big_sign(product, digits) < 0) {
        CPSi_big_negate(product, digits);
        CPSi_big_div(NULL, product, operand, remainder, digits, scratch);
        CPSi_big_sub(remainder, operand, remainder, digits);
    } else {
        CPSi_big_div(NULL, product, operand, remainder, digits, scratch);
    }
    CPSi_char_from_big(out, remainder, 48, digits);
    gCpsFree(x);
}

// 16 bytes of the master secret: MD5(pre-master + SHA-1(label + pre-master + randoms))
void create_ms_sub(u8 *out, const char *label, CpsSsl *ssl) {
    u8 digest[20];
    CPSi_sha1_init(&ssl->sha1);
    CPSi_sha1_calc(&ssl->sha1, (const u8 *)label, strlen(label));
    CPSi_sha1_calc(&ssl->sha1, ssl->masterSecret, 48);
    CPSi_sha1_calc(&ssl->sha1, ssl->clientRandom, 64); // the client and server randoms
    CPSi_sha1_result(&ssl->sha1, digest);
    CPSi_md5_init(&ssl->md5);
    CPSi_md5_calc(&ssl->md5, ssl->masterSecret, 48);
    CPSi_md5_calc(&ssl->md5, digest, 20);
    CPSi_md5_result(&ssl->md5, out);
}

void create_master_secret(CpsSsl *ssl) {
    u8 secret[48];
    create_ms_sub(secret, gCpsSslLabelA, ssl);
    create_ms_sub(secret + 16, gCpsSslLabelBB, ssl);
    create_ms_sub(secret + 32, gCpsSslLabelCCC, ssl);
    MI_CpuCopy8(secret, ssl, 48);
}

#pragma push
#pragma opt_arithtransformation off
#pragma opt_propagation off

// key block (MD5(master + SHA-1("A" + master + server random + client random)), "BB", ...): the MAC
// secrets, then the RC4 keys; the client's first, so a server swaps send and receive
void create_key_block(CpsSsl *ssl) {
    struct {
        int key, hash;
    } length;

    u8 salt[21]; // the letters, then the SHA-1 digest
    int iv;
    int n;
    int i;
    u8 *out;
    u8 *block;
    int j;
    int offset;
    CpsSha1Context *sha1;
    switch (ssl->cipherSuite) {
    case CPS_SSL_RSA_RC4_128_MD5:
        length.hash = 16;
        length.key = 16;
        iv = 0;
        break;
    case CPS_SSL_RSA_RC4_128_SHA:
        length.hash = 20;
        length.key = 16;
        iv = 0;
        break;
    }
    int total = (length.hash + length.key + iv) * 2;
    i = 0;
    if (total > 0) {
        out = ssl->keyBlock;
        sha1 = &ssl->sha1;
        offset = 0;
        do {
            CPSi_sha1_init(sha1);
            salt[0] = 'A' + i;
            j = 0;
            n = i + 1;
            if (n > 0) {
                do {
                    CPSi_sha1_calc(sha1, salt, 1);
                    j++;
                } while (j < n);
            }
            CPSi_sha1_calc(sha1, ssl->masterSecret, 48);
            CPSi_sha1_calc(sha1, ssl->serverRandom, 32);
            CPSi_sha1_calc(sha1, ssl->clientRandom, 32);
            CPSi_sha1_result(sha1, salt + 1);
            CPSi_md5_init(&ssl->md5);
            CPSi_md5_calc(&ssl->md5, ssl->masterSecret, 48);
            CPSi_md5_calc(&ssl->md5, salt + 1, 20);
            CPSi_md5_result(&ssl->md5, out + offset);
            offset += 16;
            i++;
        } while (offset < total);
    }
    block = ssl->keyBlock;
    if (ssl->isServer) {
        ssl->recvMacSecret = block;
        ssl->recvKey = block + length.hash * 2;
        ssl->sendMacSecret = block + length.hash;
        ssl->sendKey = block + length.hash + length.hash + length.key;
    } else {
        ssl->sendMacSecret = block;
        ssl->sendKey = block + length.hash * 2;
        ssl->recvMacSecret = block + length.hash;
        ssl->recvKey = block + length.hash + length.hash + length.key;
    }
    CPSi_rc4_init(&ssl->recvRc4, ssl->recvKey, 16);
    CPSi_rc4_init(&ssl->sendRc4, ssl->sendKey, 16);
}

#pragma pop

// server: the client key exchange holds the RSA encrypted pre-master secret
void rcv_client_key_exchange(CpsSsl *ssl, u8 *message) {
    decrypt_premaster_secret(ssl->masterSecret, message, ssl->serverKey);
    create_master_secret(ssl);
    cache_session(ssl, 0, 0);
    create_key_block(ssl);
    ssl->state = CPS_SSL_STATE_KEY_EXCHANGE;
}

// MD5 part of a finished message, from handshakeMd5 (which it uses up). peer: the peer's message
void finished_md5(CpsSsl *ssl, u8 *out, int peer) {
    u8 pad[48];
    if ((ssl->isServer ^ peer) != 0) {
        CPSi_md5_calc(&ssl->handshakeMd5, gCpsSslSenderServer, 4);
    } else {
        CPSi_md5_calc(&ssl->handshakeMd5, gCpsSslSenderClient, 4);
    }
    CPSi_md5_calc(&ssl->handshakeMd5, ssl->masterSecret, 48);
    MI_CpuFill8(pad, 0x36, 48);
    CPSi_md5_calc(&ssl->handshakeMd5, pad, 48);
    CPSi_md5_result(&ssl->handshakeMd5, out);
    CPSi_md5_init(&ssl->handshakeMd5);
    CPSi_md5_calc(&ssl->handshakeMd5, ssl->masterSecret, 48);
    MI_CpuFill8(pad, 0x5C, 48);
    CPSi_md5_calc(&ssl->handshakeMd5, pad, 48);
    CPSi_md5_calc(&ssl->handshakeMd5, out, 16);
    CPSi_md5_result(&ssl->handshakeMd5, out);
}

void finished_sha1(CpsSsl *ssl, u8 *out, int peer) {
    u8 pad[40];
    if ((ssl->isServer ^ peer) != 0) {
        CPSi_sha1_calc(&ssl->handshakeSha1, gCpsSslSenderServer, 4);
    } else {
        CPSi_sha1_calc(&ssl->handshakeSha1, gCpsSslSenderClient, 4);
    }
    CPSi_sha1_calc(&ssl->handshakeSha1, ssl->masterSecret, 48);
    MI_CpuFill8(pad, 0x36, 40);
    CPSi_sha1_calc(&ssl->handshakeSha1, pad, 40);
    CPSi_sha1_result(&ssl->handshakeSha1, out);
    CPSi_sha1_init(&ssl->handshakeSha1);
    CPSi_sha1_calc(&ssl->handshakeSha1, ssl->masterSecret, 48);
    MI_CpuFill8(pad, 0x5C, 40);
    CPSi_sha1_calc(&ssl->handshakeSha1, pad, 40);
    CPSi_sha1_calc(&ssl->handshakeSha1, out, 20);
    CPSi_sha1_result(&ssl->handshakeSha1, out);
}

// checks the peer's finished message (the handshake hashes are saved in the scratch contexts)
void rcv_finished(CpsSsl *ssl, u8 *message) {
    u8 digest[20];
    MI_CpuCopy8(&ssl->handshakeMd5, &ssl->md5, sizeof(CpsMd5Context));
    finished_md5(ssl, digest, 1);
    MI_CpuCopy8(&ssl->md5, &ssl->handshakeMd5, sizeof(CpsMd5Context));
    if (memcmp(message, digest, 16)) {
        ssl->state = CPS_SSL_STATE_ERROR;
        return;
    }
    MI_CpuCopy8(&ssl->handshakeSha1, &ssl->sha1, sizeof(CpsSha1Context));
    finished_sha1(ssl, digest, 1);
    MI_CpuCopy8(&ssl->sha1, &ssl->handshakeSha1, sizeof(CpsSha1Context));
    if (memcmp(message + 16, digest, 20)) {
        ssl->state = CPS_SSL_STATE_ERROR;
    } else {
        ssl->state = CPS_SSL_STATE_FINISHED;
    }
}
