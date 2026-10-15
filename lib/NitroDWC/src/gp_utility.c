#pragma force_active on
#include <stdarg.h>
#include <string.h>

#include "global.h"

#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Presence / buddy connection: processing of the pending searches, the "\rn\" and "\error\" server
// replies, and the string helpers ("\key\value" parsing, bounded copy).

extern const char sStr_gpiProcessSearches[]; // "gpiProcessSearches"
extern const char sStr_OutOfMemory_10[]; // "Out of memory."
extern const char sStr_GpiSearchC[]; // "gpiSearch.c"
extern const char sStr_NumLtIconnectionNumSearches[]; // "num < iconnection->numSearches"
extern const char sStr_Empty_8[]; // ""
extern const char sFmt_VersionResult[]; // "\\version\\%d\\result\\%d"
extern const char sKey_xfer[]; // "\\xfer\\"
extern const char sFmt_IntSpaceUintSpaceUint[]; // "%d %u %u"
extern const char sKey_rn[]; // "\\rn\\"
extern const char sStr_UnexpectedDataWasReceivedFromTheServer_5[]; // "Unexpected data was received from the server."
extern const char sStr_OutOfMemory_11[]; // "Out of memory."
extern const char sStr_strzcpy[]; // "strzcpy"
extern const char sStr_gpiValueForKey[]; // "gpiValueForKey"
extern const char sStr_gpiReadKeyAndValue[]; // "gpiReadKeyAndValue"
extern const char sStr_DestNeNULL[]; // "dest != NULL"
extern const char sStr_GpiUtilityC[]; // "gpiUtility.c"
extern const char sStr_SrcNeNULL[]; // "src != NULL"
extern const char sKey_error[]; // "\\error\\"
extern const char sKey_err[]; // "\\err\\"
extern const char sKey_errmsg[]; // "\\errmsg\\"
extern const char sKey_fatal_2[]; // "\\fatal\\"
extern const char sStr_CommandNeNULL[]; // "command != NULL"
extern const char sStr_KeyNeNULL[]; // "key != NULL"
extern const char sStr_ValueNeNULL[]; // "value != NULL"
extern const char sStr_LenGt0[]; // "len > 0"
extern const char sStr_ErrorConnecting[]; // "Error connecting\n"
extern const char sStr_ThereWasAnErrorCheckingForA_CompletedConnection[]; // "There was an error checking for a completed connection."
extern const char sStr_ConnectionRejected[]; // "Connection rejected\n"
extern const char sStr_ConnectionAccepted[]; // "Connection accepted\n"
extern const char sStr_BufferNeNULL[]; // "buffer != NULL"
extern const char sStr_ParseError[]; // "Parse Error."

extern int sprintf(char *, const char *, ...);
extern int strncmp(const char *, const char *, size_t);
extern int sscanf(const char *, const char *, ...);
extern long atol(const char *);
extern void __msl_assertion_failed(const char *, const char *, const char *, int);
extern void *DWCi_GsMalloc(u32 size);
extern void DWCi_GsFree(void *p);
extern int GSISocketSelect(int a, int b, int *x, int *y);
extern int gpiSendOrBufferString(GpConnection **connection, void *operation, char *buf);
extern void gpiCallErrorCallback(GpConnection **connection, int a, int b);
extern int gpiAddCallback(GpConnection **connection, GpPair pair, int *p, void *operation, int z);
extern int gpiPeerStartTransferMessage(GpConnection **connection, void *operation, int code, void *values);
extern int gpiPeerFinishTransferMessage(GpConnection **connection, void *operation, const char *s, int n);

// Sets the parse error and disconnects.
#define GP_PARSE_ERROR(connection)                   \
    {                                                \
        gpiSetError(connection, 1, sStr_ParseError); \
        gpiCallErrorCallback(connection, 3, 1);             \
        return 3;                                    \
    }

int gpiProcessSearches(GpConnection **connection) {
    GpConnection *iconnection = *connection;
    int num = 0;
    GpOperation **searches;
    GpOperation *search;
    int i;
    int result;
    if (iconnection->numSearches > 0) {
        searches = DWCi_GsMalloc(iconnection->numSearches * 4);
        if (!searches) {
            gpiSetErrorString(connection, sStr_OutOfMemory_10);
            return GP_MEMORY_ERROR;
        }
        for (search = iconnection->operations; search; search = search->next) {
            if (search->type == GP_OPERATION_SEARCH && search->state != GPI_FINISHING && ((GpSearchData *)search->data)->busy == 0) {
                if (!(num < iconnection->numSearches)) {
                    __msl_assertion_failed(sStr_NumLtIconnectionNumSearches, sStr_GpiSearchC, sStr_gpiProcessSearches, 0x563);
                }
                searches[num++] = search;
                ((GpSearchData *)search->data)->busy = 1;
            }
        }
        for (i = 0; i < num; i++) {
            result = gpiProcessSearch(connection, searches[i]);
            if (result) {
                searches[i]->result = result;
            }
        }
        for (i = 0; i < num; i++) {
            GpSearchData *data = searches[i]->data;
            data->busy = 0;
            if (data->done) {
                gpiRemoveOperation(connection, searches[i]);
            }
        }
        DWCi_GsFree(searches);
    }
    return GP_NO_ERROR;
}

int gpiSendTransferReply(GpConnection **connection, int *values, void *operation, int result, const char *message) {
    char buf[0x20];
    int err;
    if (!message) {
        message = sStr_Empty_8;
    }
    err = gpiPeerStartTransferMessage(connection, operation, 0xc9, values);
    if (err) {
        return err;
    }
    sprintf(buf, sFmt_VersionResult, 1, result);
    err = gpiSendOrBufferString(connection, operation, buf);
    if (err) {
        return err;
    }
    err = gpiPeerFinishTransferMessage(connection, operation, message, -1);
    if (err) {
        return err;
    }
    return 0;
}

// Handles a "\xfer\" message of a peer.
void gpiHandleTransferMessage(GpConnection **connection, void *peer, int type, const char *headers, char *buffer, int len) {
    char buf[0x40];
    int values[3];
    if (!gpiValueForKey(headers, sKey_xfer, buf, 0x40)) {
        return;
    }
    if (sscanf(buf, sFmt_IntSpaceUintSpaceUint, &values[0], &values[1], &values[2]) != 3) {
        return;
    }
    gpiSendTransferReply(connection, values, peer, 2, 0);
}

int gpiProcessRegisterUniqueNick(GpConnection **connection, GpOperation *operation, char *message) {
    GpPair pair;
    int *p;
    int err;
    if (gpiCheckForError(connection, message, 1)) {
        return GP_SERVER_ERROR;
    }
    if (strncmp(message, sKey_rn, 4) != 0) {
        gpiSetError(connection, GP_PARSE, sStr_UnexpectedDataWasReceivedFromTheServer_5);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
        return GP_NETWORK_ERROR;
    }
    pair = *(GpPair *)&operation->callback;
    if (pair.a) {
        p = DWCi_GsMalloc(4);
        if (!p) {
            gpiSetErrorString(connection, sStr_OutOfMemory_11);
            return GP_MEMORY_ERROR;
        }
        *p = 0;
        err = gpiAddCallback(connection, pair, p, operation, GPI_ADD_NORMAL);
        if (err) {
            return err;
        }
    }
    gpiRemoveOperation(connection, operation);
    return GP_NO_ERROR;
}

void strzcpy(char *dest, const char *src, int len) {
    if (!dest) {
        __msl_assertion_failed(sStr_DestNeNULL, sStr_GpiUtilityC, sStr_strzcpy, 0x2f);
    }
    if (!src) {
        __msl_assertion_failed(sStr_SrcNeNULL, sStr_GpiUtilityC, sStr_strzcpy, 0x30);
    }
    strncpy(dest, src, len);
    *(dest + len - 1) = 0;
}

void gpiDebug(GpConnection **connection, const char *format, ...) {
}

int gpiCheckForError(GpConnection **connection, const char *message, int callback) {
    char buf[0x10];
    GpConnection *iconnection = *connection;
    if (strncmp(message, sKey_error, 7) == 0) {
        if (gpiValueForKey(message, sKey_err, buf, 0x10)) {
            iconnection->errorCode = atol(buf);
        }
        if (!gpiValueForKey(message, sKey_errmsg, iconnection->errorString, 0x100)) {
            iconnection->errorString[0] = 0;
        }
        if (callback) {
            gpiCallErrorCallback(connection, GP_SERVER_ERROR, (strstr(message, sKey_fatal_2) != NULL ? 1 : 0) ? 1 : 0);
        }
        return 1;
    }
    return 0;
}

int gpiValueForKey(const char *command, const char *key, char *value, int len) {
    char term;
    const char *p;
    int i;
    char ch;
    if (!command) {
        __msl_assertion_failed(sStr_CommandNeNULL, sStr_GpiUtilityC, sStr_gpiValueForKey, 0x10d);
    }
    if (!key) {
        __msl_assertion_failed(sStr_KeyNeNULL, sStr_GpiUtilityC, sStr_gpiValueForKey, 0x10e);
    }
    if (!value) {
        __msl_assertion_failed(sStr_ValueNeNULL, sStr_GpiUtilityC, sStr_gpiValueForKey, 0x10f);
    }
    if (!(len > 0)) {
        __msl_assertion_failed(sStr_LenGt0, sStr_GpiUtilityC, sStr_gpiValueForKey, 0x110);
    }
    term = key[0];
    p = strstr(command, key);
    if (!p) {
        return 0;
    }
    p += strlen(key);
    for (i = 0; i < len - 1 && (ch = p[i]) != 0 && ch != term; i++) {
        value[i] = ch;
    }
    value[i] = 0;
    return 1;
}

int gpiCheckSocketConnect(GpConnection **connection, int socket, int *result) {
    int accepted = 0;
    int rejected = 0;
    int r = GSISocketSelect(socket, 0, &accepted, &rejected);
    if (r == -1) {
        gpiDebug(connection, sStr_ErrorConnecting);
        gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorCheckingForA_CompletedConnection);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
        return GP_NETWORK_ERROR;
    }
    if (r > 0) {
        if (rejected) {
            gpiDebug(connection, sStr_ConnectionRejected);
            *result = GP_DISCONNECTED;
            return GP_NO_ERROR;
        }
        if (accepted) {
            gpiDebug(connection, sStr_ConnectionAccepted);
            *result = GP_CONNECTED;
            return GP_NO_ERROR;
        }
    }
    *result = GP_NOT_CONNECTED;
    return GP_NO_ERROR;
}

int gpiReadKeyAndValue(GpConnection **connection, const char *buffer, int *index, char *key, char *value) {
    const char *start;
    char c;
    int i;
    int j;
    if (buffer == NULL) {
        __msl_assertion_failed(sStr_BufferNeNULL, sStr_GpiUtilityC, sStr_gpiReadKeyAndValue, 0x199);
    }
    if (key == NULL) {
        __msl_assertion_failed(sStr_KeyNeNULL, sStr_GpiUtilityC, sStr_gpiReadKeyAndValue, 0x19a);
    }
    if (value == NULL) {
        __msl_assertion_failed(sStr_ValueNeNULL, sStr_GpiUtilityC, sStr_gpiReadKeyAndValue, 0x19b);
    }
    if (buffer[*index] != '\\') {
        GP_PARSE_ERROR(connection);
    }
    start = buffer + *index;
    buffer = start + 1;
    c = *buffer++;
    i = 0;
    while (c != '\\') {
        if (c == 0) {
            GP_PARSE_ERROR(connection);
        }
        if (i == 0x1ff) {
            GP_PARSE_ERROR(connection);
        }
        *key++ = c;
        c = *buffer++;
        i++;
    }
    *key = 0;
    j = 0;
    while ((c = *buffer++) != '\\' && c != 0) {
        if (j == 0x1ff) {
            GP_PARSE_ERROR(connection);
        }
        *value++ = c;
        j++;
    }
    *value = 0;
    *index += (buffer - start) - 1;
    return 0;
}
