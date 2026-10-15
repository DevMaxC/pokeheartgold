#include "nitrocrypto_bn.h"

// RSA signature check: SHA-1 of the data, RSA public-key operation, PKCS#1 padding and ASN.1 DigestInfo parsing.

// MWCC 1.2 emits a file's functions in reverse order: the functions are defined last-to-first here
// (link order is bottom-up).

u32 CRYPTOi_RSA(u8 *out, int outSize, const u8 *in, int inSize, const u8 *modulus, int modulusSize, int exponent) {
    BIGNUM base;
    BIGNUM result;
    BIGNUM exp;
    BIGNUM mod;
    BN_CTX *ctx;
    u32 ret;

    if (out == NULL || in == NULL || modulus == NULL) {
        return -3;
    }

    ctx = BN_CTX_new();

    BN_init(&base);
    BN_init(&result);
    BN_init(&exp);
    BN_init(&mod);

    if (ctx == NULL) {
        ret = -2;
    } else if (BN_bin2bn(in, inSize, &base) == NULL) {
        ret = -2;
    } else if (!BN_set_word(&exp, exponent)) {
        ret = -2;
    } else if (BN_bin2bn(modulus, modulusSize, &mod) == NULL) {
        ret = -2;
    } else if (!BN_mod_exp(&result, &base, &exp, &mod, ctx)) {
        ret = -2;
    } else {
        if (BN_num_bytes(&result) > outSize) {
            ret = -1;
        } else {
            ret = BN_bn2bin(&result, out);
        }
    }

    BN_free(&base);
    BN_free(&result);
    BN_free(&exp);
    BN_free(&mod);

    if (ctx != NULL) {
        BN_CTX_free(ctx);
    }

    return ret;
}

BOOL ASN1Skip(u8 **cursor, u32 *remaining, int tag, u32 *length) {
    u8 *p = *cursor;
    u32 len = 0;
    u32 rest;
    u32 size = *remaining;
    if (*p++ != tag) {
        return FALSE;
    }

    if (size < 1) {
        return FALSE;
    }

    u32 avail = size - 1;
    u8 lenByte = *p;

    if (lenByte & 0x80) {
        lenByte &= 0x7F;
        if (avail < lenByte + 1) {
            return FALSE;
        }
        rest = avail - lenByte;
        if (length != NULL) {
            p++;
            do {
                len = (p[0] & 0x7F) + (len << 7);
                lenByte--;
            } while (lenByte != 0);
        } else {
            p += lenByte;
        }
    } else {
        p++;
        len = lenByte;
        if (avail < 1) {
            return FALSE;
        }
        rest = avail - 1;
    }

    *cursor = p;
    *remaining = rest;
    if (length != NULL) {
        *length = len;
    }

    return TRUE;
}

BOOL SkipPadding(u8 *block, u32 size, u8 **payload, u32 *payloadSize) {
    if (size < 10) {
        return FALSE;
    }

    u8 *end = block + size;

    if (*block != 1) {
        return FALSE;
    }

    u8 *p = block + 1;

    for (int i = 0; i < 8; i++) {
        if (*p++ != 0xFF) {
            return FALSE;
        }
    }

    while (p != end) {
        if (*p != 0xFF) {
            break;
        }
        p++;
    }

    if (p == end) {
        return FALSE;
    }

    if (*p) {
        return FALSE;
    }

    *payloadSize = (int)(end - (p + 1));
    *payload = p + 1;

    return TRUE;
}

BOOL ParseSignHash(u8 *data, u32 size, u8 **oid, int *oidSize, u8 **hash, int *hashSize) {
    u32 len;

    if (!ASN1Skip(&data, &size, 0x30, 0)) {
        return FALSE;
    }
    if (!ASN1Skip(&data, &size, 0x30, 0)) {
        return FALSE;
    }
    if (!ASN1Skip(&data, &size, 6, &len)) {
        return FALSE;
    }

    if (oid != NULL) {
        *oid = data;
    }
    if (oidSize != NULL) {
        *oidSize = len;
    }

    data += len;
    if (size < len) {
        return FALSE;
    }
    size -= len;

    if (!ASN1Skip(&data, &size, 5, &len)) {
        return FALSE;
    }

    data += len;
    if (size < len) {
        return FALSE;
    }
    size -= len;

    if (!ASN1Skip(&data, &size, 4, &len)) {
        return FALSE;
    }

    if (hash != NULL) {
        *hash = data;
    }
    if (hashSize != NULL) {
        *hashSize = len;
    }

    return TRUE;
}

BOOL CRYPTO_VerifySignatureWithHash(u8 *hash, const u8 *sign, const u8 *pubkey) {
    u8 *payload;
    u32 payloadSize = 0;
    u8 *signHash;
    int signHashSize = 0;
    u8 block[0x100];
    u32 blockSize = CRYPTOi_RSA(block, 0x100, sign, 0x80, pubkey, 0x80, 0x10001);

    if (!SkipPadding(block, blockSize, &payload, &payloadSize)) {
        return FALSE;
    }

    if (!ParseSignHash(payload, payloadSize, NULL, NULL, &signHash, &signHashSize)) {
        return FALSE;
    }

    if (signHashSize != 20) {
        return FALSE;
    }

    for (int i = 0; i < 20; i++) {
        u8 a = signHash[i];
        u8 b = *hash;
        if (a != b) {
            return FALSE;
        }
        hash++;
    }

    return TRUE;
}

BOOL CRYPTO_VerifySignature(const void *data, u32 dataLength, const u8 *sign, const u8 *pubkey) {
    u8 hash[MATH_SHA1_DIGEST_SIZE];

    MATH_CalcSHA1(hash, data, dataLength);
    return CRYPTO_VerifySignatureWithHash(hash, sign, pubkey);
}
