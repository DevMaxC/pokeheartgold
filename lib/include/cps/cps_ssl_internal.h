#ifndef POKEHEARTGOLD_CPS_SSL_INTERNAL_H
#define POKEHEARTGOLD_CPS_SSL_INTERNAL_H

#include <nitro.h>
#include <nitro/rtc.h>

#include "cps/cps_crypto.h"
#include "cps/cps_internal.h"

// libCPS SSL 3.0 (client and server, RSA key exchange, RC4 with MD5 or SHA-1 MACs). A socket uses SSL
// when CpsSocket.sslEnabled is set; CpsSocket.ssl then points to its CpsSsl connection state. The
// handshake runs in the thread that connects / listens (CPSi_SslConnect / CPSi_SslListen); records
// are read whole (parse_record) and application data is handed out from the decrypted record.

// RSA public key of a trusted root certificate (CPS_SetRootCa), looked up by the issuer name of the
// server certificate. CpsSsl.issuerKey has the same layout (name unused).
typedef struct CpsRootCa {
    const char *name;   // 0x00, distinguished name, as built by make_dn
    int modulusLength;  // 0x04
    u8 *modulus;        // 0x08, big endian
    int exponentLength; // 0x0C
    u8 *exponent;       // 0x10
} CpsRootCa;

// RSA private key of an SSL server (CpsSsl.serverKey), in Chinese remainder form.
typedef struct CpsRsaPrivateKey {
    int length;            // 0x00, modulus bytes
    u8 *modulus;           // 0x04
    int prime1Length;      // 0x08
    u8 *prime1;            // 0x0C, p
    int prime2Length;      // 0x10
    u8 *prime2;            // 0x14, q
    int exponent1Length;   // 0x18
    u8 *exponent1;         // 0x1C, d mod (p - 1)
    int exponent2Length;   // 0x20
    u8 *exponent2;         // 0x24, d mod (q - 1)
    int coefficientLength; // 0x28
    u8 *coefficient;       // 0x2C, q^-1 mod p
} CpsRsaPrivateKey;

// DER encoded certificate chain an SSL server sends (CpsSsl.serverCertificate).
typedef struct CpsSslCertificate {
    int length;
    u8 *bytes;
} CpsSslCertificate;

// CpsSsl.state
#define CPS_SSL_STATE_START             0
#define CPS_SSL_STATE_CLIENT_HELLO      1 // server: a client hello with a cipher suite we know
#define CPS_SSL_STATE_SERVER_HELLO      2
#define CPS_SSL_STATE_CERTIFICATE       3 // the certificate chain was accepted
#define CPS_SSL_STATE_SERVER_HELLO_DONE 4
#define CPS_SSL_STATE_KEY_EXCHANGE      5 // server: client key exchange received
#define CPS_SSL_STATE_FINISHED          6 // the peer's finished message is correct
#define CPS_SSL_STATE_CHANGE_CIPHER     7 // the peer sent change cipher spec
#define CPS_SSL_STATE_ESTABLISHED       8
#define CPS_SSL_STATE_ERROR             9

// CpsSsl.cipherSuite
#define CPS_SSL_RSA_RC4_128_MD5 4
#define CPS_SSL_RSA_RC4_128_SHA 5

// cert_item object identifiers (index in gCpsCertOids)
#define CPS_OID_RSA_ENCRYPTION 1
#define CPS_OID_RSA            2
#define CPS_OID_MD5_WITH_RSA   3
#define CPS_OID_SHA1_WITH_RSA  4
#define CPS_OID_COMMON_NAME    5

// auth_cert / rcv_certificate result: the low byte is 0 (verified), 1 (issuer is not a root CA we
// know), 2 (bad signature), 3 (unknown signature algorithm) or 4 (no public key); flags on top
#define CPS_CERT_BAD_NAME 0x4000 // the server name does not match the common name
#define CPS_CERT_EXPIRED  0x8000 // outside its validity period

// Connection state of an SSL socket (CpsSocket.ssl). The application allocates it and sets the
// server name, callback, root CAs and server key / certificate; the rest is CPS's.
typedef struct CpsSsl {
    u8 masterSecret[48]; // 0x000, the pre-master secret until create_master_secret
    u8 hasSession;       // 0x030, sessionId is valid (cached, or sent by the server)
    u8 resumed;          // 0x031, the server resumed the session (abbreviated handshake)
    u16 cipherSuite;     // 0x032, CPS_SSL_RSA_*
    u8 clientRandom[32]; // 0x034
    u8 serverRandom[32]; // 0x054

    union {
        u8 sessionId[32]; // 0x074
        u8 keyBlock[72];  // 0x074, create_key_block (after the session was cached)
    };

    u8 *sendMacSecret; // 0x0BC
    u8 *sendKey;       // 0x0C0
    u8 unk_0C4[4];
    CpsRc4Context sendRc4; // 0x0C8
    u8 unk_1CA[2];
    u8 sendSequence[8]; // 0x1CC, big endian record counter
    u8 *recvMacSecret;  // 0x1D4, NULL until the keys are made
    u8 *recvKey;        // 0x1D8
    u8 unk_1DC[4];
    CpsRc4Context recvRc4; // 0x1E0
    u8 unk_2E2[2];
    u8 recvSequence[8];           // 0x2E4
    CpsSha1Context handshakeSha1; // 0x2EC, of all handshake messages
    CpsSha1Context sha1;          // 0x348, scratch
    CpsMd5Context handshakeMd5;   // 0x3A4
    CpsMd5Context md5;            // 0x3FC, scratch
    u8 isServer;                  // 0x454
    u8 state;                     // 0x455, CPS_SSL_STATE_*
    u8 recordReady;               // 0x456, record holds application data
    // certificate parse state (cert_item, auth_cert, rcv_certificate)
    int signatureType;                                              // 0x458, CPS_OID_MD5/SHA1_WITH_RSA, -1: none
    int keyType;                                                    // 0x45C, CPS_OID_RSA*, -1: none
    u8 *tbsBegin;                                                   // 0x460, the signed part (TBSCertificate)
    u8 *tbsEnd;                                                     // 0x464
    u8 digest[20];                                                  // 0x468, of the signed part
    int digestLength;                                               // 0x47C
    CpsRootCa issuerKey;                                            // 0x480, public key of the next certificate in the chain
    u8 modulus[256];                                                // 0x494, public key of the server certificate
    u32 modulusLength;                                              // 0x594
    u8 exponent[8];                                                 // 0x598
    int exponentLength;                                             // 0x5A0
    u8 *signature;                                                  // 0x5A4
    int signatureLength;                                            // 0x5A8
    u8 inSubject;                                                   // 0x5AC, names are the subject's (also: the server asked for a certificate)
    u8 keyEncoding;                                                 // 0x5AD, inside a public key (CPS_OID_RSA*)
    u8 nameType;                                                    // 0x5AE, the attribute of the next name (CPS_OID_COMMON_NAME)
    u8 validNow;                                                    // 0x5AF, inside the validity period
    char issuer[256];                                               // 0x5B0
    char subject[256];                                              // 0x6B0
    char commonName[80];                                            // 0x7B0
    char *serverName;                                               // 0x800, compared with the common name (NULL: not checked)
    u8 *certificate;                                                // 0x804, the certificate being parsed
    u32 certificateLength;                                          // 0x808
    u32 today;                                                      // 0x80C, year << 16 | month << 8 | day
    u32 (*authCallback)(u32 result, struct CpsSsl *ssl, int index); // 0x810, per certificate of the chain
    CpsRootCa **rootCas;                                            // 0x814
    int rootCaCount;                                                // 0x818
    CpsRsaPrivateKey *serverKey;                                    // 0x81C
    CpsSslCertificate *serverCertificate;                           // 0x820
    u8 *record;                                                     // 0x824, alloc'ed record (header included)
    u32 recordSize;                                                 // 0x828
    u32 recordOffset;                                               // 0x82C, bytes consumed
} CpsSsl;

// Cached session (gCpsSslSessionCache). A server's sessions have no address.
typedef struct CpsSslSession {
    u8 id[32];           // 0x00
    u8 masterSecret[48]; // 0x20
    u32 tick;            // 0x50, OS_GetTick() >> 16 at the last use
    u32 address;         // 0x54, server address (client side)
    u16 port;            // 0x58
    u8 valid;            // 0x5A
} CpsSslSession;

typedef struct CpsRandom {
    u64 state, mul, add;
} CpsRandom;

typedef struct CpsSslConfig {
    u16 cipherSuites[2];   // preference order
    u32 handshakePriority; // thread priority for the RSA computations, >= 32: unchanged
} CpsSslConfig;

extern CpsSslSession gCpsSslSessionCache[4];
extern CpsRandom gCpsRandom; // gCpsState.random
extern u8 gCpsSslRandomPool[20];
extern u8 gCpsSslRandomPoolLast[]; // gCpsSslRandomPool + 19
extern CpsSslConfig gCpsSslConfig;
extern const char *gCpsCertOids[6];
extern const char gCpsSslLabelA[];
extern const char gCpsSslLabelBB[];
extern const char gCpsSslLabelCCC[];
extern const u8 gCpsSslSenderServer[4]; // "SRVR"
extern const u8 gCpsSslSenderClient[4]; // "CLNT"
extern const u8 gCpsSslNoCertificateAlert[7];
extern const char _version_UBIQUITOUS_SSL[];
RTCResult RTC_GetDate(RTCDate *date);
RTCResult RTC_GetTime(RTCTime *time);

// cps_ssl_session.c
void find_session_from_id(CpsSsl *ssl);
void find_session_from_IP(CpsSsl *ssl, u32 address, int port);
void cache_session(CpsSsl *ssl, u32 address, u16 port);
void purge_session(CpsSsl *ssl);

// cps_ssl_util.c
u32 date2sec(void);
u32 CPS_GetSslHandshakePriority(void);
void CPS_SetSslHandshakePriority(u32 priority);
u32 enter_computebound(void);
void exit_computebound(u32 priority);
void CPS_SetRootCa(CpsRootCa **rootCas, int count);

// cps_ssl_cert.c
CpsRootCa *get_rootCA(CpsSsl *ssl, const char *name);
int cert_item_len(u8 **input);
void make_dn(char *out, const char *name, int length);
u32 parse_time(const u8 *text, int tag);
int cert_item(CpsSsl *ssl, u8 **input, int nesting, int ordinal, int mode);
int validate_signature(CpsSsl *ssl, CpsRootCa *key);
u32 auth_cert(CpsSsl *ssl);
int chars_till_end(const char *name);
int compare_fqdn(const char *name, const char *pattern);
void rcv_certificate(CpsSsl *ssl, u8 *message);

// cps_ssl_hello.c
void rcv_server_hello(CpsSsl *ssl, u8 *message);
int has_method(u8 *list, int count, int width, int suite);
int select_method(u8 *list, int count, int width);
int version_ok(int major, int minor);
void client_hello_v2(CpsSsl *ssl, u8 *message);
void client_hello(CpsSsl *ssl, u8 *message);

// cps_ssl_keys.c
void decrypt_premaster_secret(u8 *out, const u8 *input, CpsRsaPrivateKey *key);
void create_ms_sub(u8 *out, const char *label, CpsSsl *ssl);
void create_master_secret(CpsSsl *ssl);
void create_key_block(CpsSsl *ssl);
void rcv_client_key_exchange(CpsSsl *ssl, u8 *message);
void finished_md5(CpsSsl *ssl, u8 *out, int peer);
void finished_sha1(CpsSsl *ssl, u8 *out, int peer);
void rcv_finished(CpsSsl *ssl, u8 *message);

// cps_ssl_record.c
void add1_be8(u8 *end);
int decrypt(CpsSsl *ssl, u8 *data, int length);
int make_plaintext(CpsSsl *ssl, u8 *record);
int make_ciphertext(CpsSsl *ssl, u8 *record);
int tcp_read_raw_nbytes(u8 *out, int length, CpsSocket *socket);
void update_digest(CpsSsl *ssl, const void *message, int length);
void parse_record_in_buf(CpsSsl *ssl, u8 *record);
int parse_record(CpsSocket *socket);

// cps_ssl_random.c
void set_random(u8 *out, int count);
void CPS_SslAddRandomSeed(const void *seed, int length);

// cps_ssl_handshake.c
int send_server_hello(CpsSocket *socket);
void send_change_cipher_spec_and_finished(CpsSocket *socket);
void send_client_hello(CpsSocket *socket);
void send_client_key_exchange(CpsSocket *socket);
int mustget_change_cipher_spec_and_finished(CpsSocket *socket);
int ssl_listen_try(CpsSocket *socket);
int ssl_connect_try(CpsSocket *socket);

// cps_ssl.c (and the CPSi_Ssl* interface in cps_internal.h)
void try_fill_record(CpsSocket *socket);

#endif // POKEHEARTGOLD_CPS_SSL_INTERNAL_H
