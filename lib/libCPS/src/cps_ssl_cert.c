#include <string.h>

#include "cps/cps_ssl_internal.h"

// Server certificate chain: a small DER walker (cert_item) collects the names, validity, public key
// and signature of a certificate; auth_cert checks the signature with the root CA named as issuer,
// rcv_certificate walks the chain (each certificate checked with the key of the next one).

#pragma force_active on

CpsRootCa *get_rootCA(CpsSsl *ssl, const char *name) {
    int i;
    CpsRootCa **rootCas;
    int count;
    count = ssl->rootCaCount;
    i = 0;
    if (count > 0) {
        rootCas = ssl->rootCas;
        do {
            CpsRootCa *rootCa = rootCas[i];
            if (!strcmp(rootCa->name, name)) {
                return rootCa;
            }
            i++;
        } while (i < count);
    }
    return NULL;
}

// DER length; advances *input past it. -1: too long
int cert_item_len(u8 **input) {
    u8 *p = *input;
    u32 length = *p++;
    if (length & 0x80) {
        int bytes = length & 0x7F;
        length = 0;
        while (bytes--) {
            if (length & 0xFF000000) {
                return -1;
            }
            length = (*p++) + (length << 8);
        }
    }
    *input = p;
    return length;
}

// appends ", " and the name (at most 255 characters in all)
void make_dn(char *out, const char *name, int length) {
    char *start = out;
    if (*out) {
        while (*++out) {}
        if (out - start >= 255) {
            return;
        }
        *out = ',';
        out[1] = ' ';
        out += 2;
    }
    while (length-- && out - start < 255) {
        *out++ = *name++;
    }
    *out = 0;
}

// UTCTime (tag 23, two-digit year) or GeneralizedTime: year << 16 | month << 8 | day
u32 parse_time(const u8 *text, int tag) {
    u32 year = text[0] * 10 + text[1] - '0' * 11;
    text += 2;
    if (tag == 23) {
        if (year < 50) {
            year += 2000;
        } else {
            year += 1900;
        }
    } else {
        u32 low = text[0] * 10 + text[1] - '0' * 11;
        text += 2;
        year = year * 100 + low;
    }
    return (year << 16) + ((text[0] * 10 + text[1] - '0' * 11) << 8) + (text[2] * 10 + text[3] - '0' * 11);
}

// Parses the DER item at *input (nesting: depth, ordinal: index in its parent) and advances past it.
// mode 0: the certificate to check, keeps a copy of its public key; mode 1: a later certificate of the
// chain; mode 2: only points issuerKey at the public key. Nonzero: malformed.
int cert_item(CpsSsl *ssl, u8 **input, int nesting, int ordinal, int mode) {
    u8 *payload = *input;
    int tag = *payload++;
    int length = cert_item_len(&payload);
    if (length < 0 || length > 2000) {
        return 1;
    }
    switch (tag & 0x1F) {
    case 2: // INTEGER: modulus, exponent
        if (ssl->keyEncoding) {
            if (ordinal == 0) {
                while (*payload == 0) {
                    payload++;
                    length--;
                }
                switch (mode) {
                case 0:
                    if (length <= 256) {
                        MI_CpuCopy8(payload, ssl->modulus, length);
                        ssl->modulusLength = length;
                    }
                    break;
                case 2:
                    ssl->issuerKey.modulusLength = length;
                    ssl->issuerKey.modulus = payload;
                    break;
                }
            } else if (ordinal == 1) {
                while (*payload == 0) {
                    payload++;
                    length--;
                }
                switch (mode) {
                case 0:
                    if (length <= 8) {
                        MI_CpuCopy8(payload, ssl->exponent, length);
                        ssl->exponentLength = length;
                    }
                    break;
                case 2:
                    ssl->issuerKey.exponentLength = length;
                    ssl->issuerKey.exponent = payload;
                    break;
                }
            }
        }
        payload += length;
        break;
    case 3: // BIT STRING: signature, or the encoded public key
        if (nesting == 1 && mode != 2) {
            ssl->signature = payload + 1;
            ssl->signatureLength = (u32)length - 1;
        }
        if (ssl->keyEncoding) {
            payload++;
            if (cert_item(ssl, &payload, nesting, 0, mode)) {
                return 1;
            }
            ssl->keyEncoding = 0;
        } else {
            payload += length;
        }
        break;
    case 6: { // OBJECT IDENTIFIER
        int oid = 0;
        u8 *encoded = payload;
        for (; oid < 6; oid++) {
            const char *known = gCpsCertOids[oid];
            if (memcmp(encoded, known, strlen(known)) == 0) {
                switch (oid) {
                case CPS_OID_RSA_ENCRYPTION:
                case CPS_OID_RSA:
                    if (mode == 0) {
                        ssl->keyType = oid;
                    }
                    ssl->keyEncoding = oid;
                    break;
                case CPS_OID_MD5_WITH_RSA:
                case CPS_OID_SHA1_WITH_RSA:
                    if (mode != 2) {
                        ssl->signatureType = oid;
                    }
                    break;
                case CPS_OID_COMMON_NAME:
                    if (mode != 2) {
                        ssl->nameType = oid;
                    }
                    break;
                }
                break;
            }
        }
        payload += length;
        break;
    }
    case 12: // UTF8String, PrintableString, T61String, IA5String
    case 19:
    case 20:
    case 22:
        if (mode != 2) {
            if (ssl->inSubject) {
                make_dn(ssl->subject, (char *)payload, length);
                if (ssl->nameType == CPS_OID_COMMON_NAME && length <= 79) {
                    MI_CpuCopy8(payload, ssl->commonName, length);
                    ssl->commonName[length] = 0;
                }
            } else {
                make_dn(ssl->issuer, (char *)payload, length);
            }
        }
        ssl->nameType = 0;
        payload += length;
        break;
    case 23: // UTCTime, GeneralizedTime: notBefore, notAfter (the subject follows)
    case 24:
        if (mode != 2) {
            u32 date = parse_time(payload, tag & 0x1F);
            if (ordinal == 0) {
                if (ssl->today >= date) {
                    ssl->validNow = 1;
                }
            } else if (ssl->today > date) {
                ssl->validNow = 0;
            }
        }
        payload += length;
        ssl->inSubject = 1;
        break;
    case 16: { // SEQUENCE
        u8 *end;
        int child;
        if (nesting == 0 && ordinal == 0 && mode != 2) {
            ssl->tbsBegin = payload;
        }
        end = payload + length;
        child = 0;
        while (payload < end) {
            int result = cert_item(ssl, &payload, nesting + 1, child, mode);
            child++;
            if (result) {
                return 1;
            }
        }
        if (nesting == 1 && ordinal == 0 && mode != 2) {
            ssl->tbsEnd = payload;
        }
        break;
    }
    case 17: { // SET
        u8 *end = payload + length;
        while (payload < end) {
            if (cert_item(ssl, &payload, nesting + 1, 0, mode)) {
                return 1;
            }
        }
        break;
    }
    default:
        if (tag == 0xA0) { // [0]: version, extensions
            u8 *end = payload + length;
            while (payload < end) {
                if (cert_item(ssl, &payload, nesting + 1, 0, mode)) {
                    return 1;
                }
            }
        } else {
            payload += length;
        }
        break;
    }
    *input = payload;
    return 0;
}

// RSA signature check of ssl->digest; 0: good, 2: bad
int validate_signature(CpsSsl *ssl, CpsRootCa *key) {
    u16 *buffer, *signature, *exponent, *modulus;
    int digits, result, priority;
    if (!ssl->signature || !ssl->signatureLength || !key->exponent || !key->exponentLength || !key->modulus || !key->modulusLength) {
        return 2;
    }
    digits = (key->modulusLength * 2) / 2;
    buffer = gCpsAlloc(digits * 8);
    if (!buffer) {
        return 2;
    }
    signature = buffer + digits;
    exponent = signature + digits;
    modulus = exponent + digits;
    CPSi_big_from_char(signature, ssl->signature, ssl->signatureLength, digits);
    CPSi_big_from_char(exponent, key->exponent, key->exponentLength, digits);
    CPSi_big_from_char(modulus, key->modulus, key->modulusLength, digits);
    priority = enter_computebound();
    CPSi_big_power(buffer, signature, exponent, digits, modulus);
    exit_computebound(priority);
    CPSi_char_from_big((u8 *)signature, buffer, key->modulusLength, digits);
    result = 0;
    // PKCS #1 block type 1: 00 01 FF .. FF 00, then the DigestInfo (a SEQUENCE) ending in the digest
    if (((u8 *)signature)[0] != 0 || ((u8 *)signature)[1] != 1) {
        result = 2;
    } else {
        int length = key->modulusLength, i = 2;
        while (i < length) {
            if (*(u8 *)((u32)signature + i) != 0xFF) {
                break;
            }
            i++;
        }
        if (i + 1 >= length || ((u8 *)signature)[i] != 0 || ((u8 *)signature)[i + 1] != 0x30 || memcmp(ssl->digest, (u8 *)signature + length - ssl->digestLength, ssl->digestLength)) {
            result = 2;
        }
    }
    gCpsFree(buffer);
    return result;
}

// digest of the signed part, then the signature check with the issuer's root CA
u32 auth_cert(CpsSsl *ssl) {
    int flags = ssl->validNow ? 0 : CPS_CERT_EXPIRED;
    CpsRootCa *rootCa;
    if (ssl->keyType == -1) {
        return flags | 4;
    }
    switch (ssl->signatureType) {
    case CPS_OID_MD5_WITH_RSA:
        CPSi_md5_init(&ssl->md5);
        CPSi_md5_calc(&ssl->md5, ssl->tbsBegin, ssl->tbsEnd - ssl->tbsBegin);
        CPSi_md5_result(&ssl->md5, ssl->digest);
        ssl->digestLength = 16;
        break;
    case CPS_OID_SHA1_WITH_RSA:
        CPSi_sha1_init(&ssl->sha1);
        CPSi_sha1_calc(&ssl->sha1, ssl->tbsBegin, ssl->tbsEnd - ssl->tbsBegin);
        CPSi_sha1_result(&ssl->sha1, ssl->digest);
        ssl->digestLength = 20;
        break;
    default:
        return flags | 3;
    }
    rootCa = get_rootCA(ssl, ssl->issuer);
    if (!rootCa) {
        return flags | 1;
    }
    return flags | validate_signature(ssl, rootCa);
}

// length of the first label of a host name
int chars_till_end(const char *name) {
    const char *start = name;
    while (*name != '.' && *name) {
        name++;
    }
    return name - start;
}

// 0: the host name matches the pattern (a "*" matches one label)
int compare_fqdn(const char *name, const char *pattern) {
    int ch, other;
    for (;;) {
        int first, second;
        while ((other = *name++) == (ch = *pattern++)) {
            if (other == 0) {
                return 0;
            }
        }
        if (ch != '*') {
            return 1;
        }
        name--;
        first = chars_till_end(name);
        second = chars_till_end(pattern);
        if (second > first) {
            return 1;
        }
        name += first - second;
    }
}

// Certificate message: the server certificate (mode 0), then each next certificate checks the
// previous one's signature (mode 1, the next one's key parsed with mode 2) until one is signed by a
// root CA. The application's authCallback may override each result.
void rcv_certificate(CpsSsl *ssl, u8 *message) {
    RTCDate date;
    u32 mode;
    u32 result;
    u32 length;
    u32 left;
    int index;
    left = message[2] + (((message[0] << 8) + message[1]) << 8);
    message += 3;
    ssl->keyType = -1;
    RTC_GetDate(&date);
    ssl->today = (((u32)date.year + 2000) << 16) + ((u32)date.month << 8) + date.day;
    mode = 0;
    ssl->subject[0] = 0;
    ssl->exponentLength = 0;
    ssl->modulusLength = 0;
    index = 0;
    for (;;) {
        length = message[2] + (((message[0] << 8) + message[1]) << 8);
        message += 3;
        left -= length + 3;
        ssl->signatureType = -1;
        ssl->keyEncoding = 0;
        ssl->inSubject = 0;
        ssl->validNow = 0;
        ssl->subject[0] = 0;
        ssl->issuer[0] = 0;
        ssl->commonName[0] = 0;
        ssl->certificate = message;
        ssl->certificateLength = length;
        if (cert_item(ssl, &message, 0, 0, mode) != 0 || ssl->modulusLength < 51 || ssl->exponentLength == 0) {
            ssl->state = CPS_SSL_STATE_ERROR;
            return;
        }
        result = auth_cert(ssl);
        if (index == 0 && ssl->serverName != NULL) {
            if (compare_fqdn(ssl->serverName, ssl->commonName) != 0) {
                result |= CPS_CERT_BAD_NAME;
            }
        }
        mode = result & 0xFF;
        if (mode == 1 && left != 0) {
            // not signed by a root CA: check the signature with the next certificate's key
            u8 *next = message + 3;
            ssl->keyEncoding = 0;
            if (cert_item(ssl, &next, 0, 0, 2) != 0) {
                ssl->state = CPS_SSL_STATE_ERROR;
                return;
            }
            result = (result & ~0xFF) | validate_signature(ssl, &ssl->issuerKey);
        }
        if (ssl->authCallback) {
            result = ssl->authCallback(result, ssl, index);
        }
        index++;
        if (mode == 0 || result != 0 || left == 0) {
            break;
        }
        mode = 1;
    }
    if (result == 0) {
        ssl->state = CPS_SSL_STATE_CERTIFICATE;
    } else {
        ssl->state = CPS_SSL_STATE_ERROR;
    }
}
