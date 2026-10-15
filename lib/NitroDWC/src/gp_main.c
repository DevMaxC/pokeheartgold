#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Presence connection set-up and processing ("gpi.c": create / reset / destroy, the server message loop,
// gpiProcess) and buddy messages ("gpiBuddy.c": "\bm\" send / receive, buddy requests and deletion).

extern const char sStr_TheConnectionHasAlreadyBeenDisconnected[]; // "The connection has already been disconnected."
extern const char sStr_InvalidMessage[]; // "Invalid message."
extern const char sStr_gpiProcess[]; // "gpiProcess"
extern const char sStr_GpiInitialize[]; // "\n\n\n\n\n*************\ngpiInitialize\n"
extern const char sStr_CM[]; // "CM"
extern const char sStr_ThereWasAnErrorReadingFromTheServer[]; // "There was an error reading from the server."
extern const char sKey_final_2[]; // "\\final\\"
extern const char sFmt_CMD[]; // "CMD: %s\n"
extern const char sStr_OutOfMemory[]; // "Out of memory."
extern const char sKey_id[]; // "\\id\\"
extern const char sFmt_NoMatchingOperationFoundForId[]; // "No matching operation found for id %d\n"
extern const char sKey_bm[]; // "\\bm\\"
extern const char sKey_ka[]; // "\\ka\\"
extern const char sStr_ReceivedAnUnrecognizedUnsolicitedMessage[]; // "Received an unrecognized, unsolicited message.\n"
extern const char sStr_TheServerHasClosedTheConnection[]; // "The server has closed the connection."
extern const char sStr_IconnectionConnectStateEqGPI_NOT_CONNECTED_Or[]; // "(iconnection->connectState == GPI_NOT_CONNECTED) || ... || (iconnection->connectState == GPI_DISCONNECTED)"
extern const char sStr_GpiC[]; // "gpi.c"
extern const char sStr_0[]; // "0"
extern const char sStr_gpiDeleteBuddy[]; // "gpiDeleteBuddy"
extern const char sKey_authadd[]; // "\\authadd\\"
extern const char sKey_sesskey_2[]; // "\\sesskey\\"
extern const char sKey_fromprofileid[]; // "\\fromprofileid\\"
extern const char sKey_sig[]; // "\\sig\\"
extern const char sKey_final_3[]; // "\\final\\"
extern const char sKey_bm_2[]; // "\\bm\\"
extern const char sStr_UnexpectedDataWasReceivedFromTheServer[]; // "Unexpected data was received from the server."
extern const char sKey_f[]; // "\\f\\"
extern const char sKey_date[]; // "\\date\\"
extern const char sStr_OutOfMemory_2[]; // "Out of memory."
extern const char sKey_msg[]; // "\\msg\\"
extern const char sStr_Signed[]; // "|signed|"
extern const char sStr_PipeS_Pipe[]; // "|s|"
extern const char sStr_PipeSsPipe[]; // "|ss|"
extern const char sStr_PipeLsPipe[]; // "|ls|"
extern const char sStr_PipeIpPipe[]; // "|ip|"
extern const char sStr_PipeP_Pipe[]; // "|p|"
extern const char sStr_PipeL_Pipe[]; // "|l|"
extern const char sStr_1[]; // "1"
extern const char sKey_t[]; // "\\t\\"
extern const char sStr_InvalidProfile[]; // "Invalid profile."
extern const char sKey_delbuddy[]; // "\\delbuddy\\"
extern const char sKey_delprofileid[]; // "\\delprofileid\\"
extern const char sStr_IndexGe0[]; // "index >= 0"
extern const char sStr_GpiBuddyC[]; // "gpiBuddy.c"
extern const char sStr_IconnectionProfileListNumBuddiesGe0[]; // "iconnection->profileList.numBuddies >= 0"

extern long atol(const char *);
extern char *strstr(const char *, const char *);
extern int strncmp(const char *, const char *, size_t);
extern void srand(unsigned int);
extern void __msl_assertion_failed(const char *, const char *, const char *, int);
extern void *DWCi_GsMalloc(u32 size);
extern void *DWCi_GsRealloc(void *p, int size);
extern void DWCi_GsFree(void *p);
extern void TableFree(void *table);
extern u32 current_time(void);
extern void msleep(int ms);
extern void SocketStartUp(void);
extern char *goastrdup(const char *string);
extern int current_time_seconds(int);
extern void gpiCallErrorCallback(GpConnection **connection, int result, int fatal);
extern int gpiAddCallback(GpConnection **connection, GpCallback callback, void *arg, GpOperation *operation, int type);

// Argument of the buddy message callback.
typedef struct GpBuddyMessageArg {
    int profile;
    int date;
    char *message;
} GpBuddyMessageArg;

// Argument of the buddy request callback.
typedef struct GpBuddyRequestArg {
    int profile;
    int date;
    char reason[0x401];
} GpBuddyRequestArg;

// Argument of the game invite callback.
typedef struct GpGameInviteArg {
    int profile;
    int productId;
    char location[0x100];
} GpGameInviteArg;

// Sets the "unexpected data" error and disconnects.
#define GP_PARSE_ERROR(connection)                   \
    {                                                \
        gpiSetError(connection, 1, sStr_UnexpectedDataWasReceivedFromTheServer); \
        gpiCallErrorCallback(connection, 3, 1);             \
        return 3;                                    \
    }

#define GP_OUT_OF_MEMORY(connection)              \
    {                                             \
        gpiSetErrorString(connection, sStr_OutOfMemory_2); \
        return 1;                                 \
    }

// Sends a buddy message.
int gpSendBuddyMessageA(GpConnection **connection, int profile, const char *message) {
    if (!connection || !*connection) {
        return GP_PARAMETER_ERROR;
    }
    if ((*connection)->simulation) {
        return GP_NO_ERROR;
    }
    if ((*connection)->connectState == GP_DISCONNECTED) {
        gpiSetErrorString(connection, sStr_TheConnectionHasAlreadyBeenDisconnected);
        return GP_PARAMETER_ERROR;
    }
    if (!message) {
        gpiSetErrorString(connection, sStr_InvalidMessage);
        return GP_PARAMETER_ERROR;
    }
    return gpiSendBuddyMessage(connection, profile, 1, message);
}

// Allocates and initialises a connection ("gpiInitialize").
int gpiInitialize(GpConnection **connection, int arg1, int arg2) {
    GpConnection *iconnection;
    int i, result;
    *connection = 0;
    iconnection = DWCi_GsMalloc(sizeof(GpConnection));
    if (iconnection == 0) {
        return 1;
    }
    memset(iconnection, 0, sizeof(GpConnection));
    iconnection->errorString[0] = 0;
    iconnection->errorCode = 0;
    iconnection->cacheProfileInfo = 1;
    iconnection->cacheBuddyOnly = 0;
    iconnection->simulation = 0;
    iconnection->firewall = 0;
    iconnection->productId = arg1;
    iconnection->namespaceId = arg2;
    if (gpiInitProfiles(&iconnection) == 0) {
        DWCi_GsFree(iconnection);
        iconnection = 0;
        return 1;
    }
    iconnection->unk_420 = 0;
    for (i = 0; i < GP_CALLBACK_COUNT; i++) {
        iconnection->callbacks[i].callback = 0;
        iconnection->callbacks[i].param = 0;
    }
    iconnection->unk_460 = 0;
    gpiDebug(&iconnection, sStr_GpiInitialize);
    result = gpiReset(&iconnection);
    if (result) {
        gpiDestroy(&iconnection);
        return result;
    }
    SocketStartUp();
    srand(current_time());
    *connection = iconnection;
    return 0;
}

void gpiDestroy(GpConnection **connection) {
    GpConnection *iconnection = *connection;
    gpiDisconnect(connection, 1);
    DWCi_GsFree(iconnection->unk_460);
    iconnection->unk_460 = 0;
    TableFree(iconnection->profileTable);
    DWCi_GsFree(iconnection);
    *connection = 0;
}

// Profile table iterator: forgets the buddy data.
int gpiResetProfile(GpConnection **connection, GpProfile *profile, void *data) {
    profile->buddyStatus = 0;
    profile->authSig = 0;
    profile->requestCount = 0;
    profile->peerSig = 0;
    return 1;
}

// Resets the connection state (also after a disconnect).
int gpiReset(GpConnection **connection) {
    GpConnection *iconnection = *connection;
    iconnection->nick[0] = 0;
    iconnection->uniquenick[0] = 0;
    iconnection->email[0] = 0;
    iconnection->sock = INVALID_SOCKET;
    iconnection->connectState = GP_NOT_CONNECTED;
    iconnection->inputBuffer.len = 0;
    iconnection->inputBuffer.pos = 0;
    iconnection->inputBuffer.size = 0;
    DWCi_GsFree(iconnection->inputBuffer.buffer);
    iconnection->inputBuffer.buffer = 0;
    iconnection->lineBufferSize = 0;
    DWCi_GsFree(iconnection->lineBuffer);
    iconnection->lineBuffer = 0;
    iconnection->outputBuffer.len = 0;
    iconnection->outputBuffer.pos = 0;
    iconnection->outputBuffer.size = 0;
    DWCi_GsFree(iconnection->outputBuffer.buffer);
    iconnection->outputBuffer.buffer = 0;
    iconnection->updateproBuffer.len = 0;
    iconnection->updateproBuffer.pos = 0;
    iconnection->updateproBuffer.size = 0;
    DWCi_GsFree(iconnection->updateproBuffer.buffer);
    iconnection->updateproBuffer.buffer = 0;
    iconnection->updateuiBuffer.len = 0;
    iconnection->updateuiBuffer.pos = 0;
    iconnection->updateuiBuffer.size = 0;
    DWCi_GsFree(iconnection->updateuiBuffer.buffer);
    iconnection->updateuiBuffer.buffer = 0;
    iconnection->peerSocket = INVALID_SOCKET;
    iconnection->nextOperationId = 2;
    while (iconnection->operations) {
        gpiRemoveOperation(connection, iconnection->operations);
    }
    iconnection->operations = 0;
    iconnection->numBuddies = 0;
    gpiProfileMap(connection, gpiResetProfile, 0);
    iconnection->userId = 0;
    iconnection->profileId = 0;
    iconnection->sessKey = 0;
    iconnection->numSearches = 0;
    iconnection->fatalError = 0;
    iconnection->peers = 0;
    iconnection->lastStatus = -1;
    iconnection->lastStatusString[0] = 0;
    iconnection->lastLocationString[0] = 0;
    return 0;
}

// Sends what is buffered for the server and handles every complete "...\final\" message received.
int gpiProcessConnectionManager(GpConnection **connection) {
    GpOperation *operation;
    int len;
    int closed = 0;
    int result, more;
    GpConnection *iconnection = *connection;
    char *end, *line;
    do {
        gpiAddLocalInfo(connection, &iconnection->outputBuffer);
        result = gpiSendFromBuffer(connection, iconnection->sock, &iconnection->outputBuffer, &closed, 1, sStr_CM);
        if (result) {
            return result;
        }
        result = gpiRecvToBuffer(connection, iconnection->sock, &iconnection->inputBuffer, &len, &closed, sStr_CM);
        if (result) {
            if (result != GP_NETWORK_ERROR) {
                return result;
            }
            gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorReadingFromTheServer);
            gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
            return GP_NETWORK_ERROR;
        }
        end = strstr(iconnection->inputBuffer.buffer, sKey_final_2);
        while (end) {
            *end = 0;
            gpiDebug(connection, sFmt_CMD, iconnection->inputBuffer.buffer);
            len = end - iconnection->inputBuffer.buffer;
            if (len > iconnection->lineBufferSize) {
                iconnection->lineBufferSize += len < 2048 ? 2048 : len;
                line = DWCi_GsRealloc(iconnection->lineBuffer, iconnection->lineBufferSize + 1);
                if (!line) {
                    gpiSetErrorString(connection, sStr_OutOfMemory);
                    return GP_MEMORY_ERROR;
                }
                iconnection->lineBuffer = line;
            }
            memcpy(iconnection->lineBuffer, iconnection->inputBuffer.buffer, len + 1);
            iconnection->inputBuffer.len -= end + 7 - iconnection->inputBuffer.buffer;
            memmove(iconnection->inputBuffer.buffer, end + 7, iconnection->inputBuffer.len + 1);
            line = iconnection->lineBuffer;
            end = strstr(line, sKey_id);
            if (end) {
                int id = atol(end + 4);
                if (!gpiFindOperationByID(connection, &operation, id)) {
                    gpiDebug(connection, sFmt_NoMatchingOperationFoundForId, id);
                } else {
                    result = gpiProcessOperation(connection, operation, iconnection->lineBuffer);
                    if (result) {
                        return result;
                    }
                }
            } else {
                if (gpiCheckForError(connection, line, 1)) {
                    return GP_SERVER_ERROR;
                }
                line = iconnection->lineBuffer;
                if (!strncmp(line, sKey_bm, 4)) {
                    result = gpiProcessRecvBuddyMessage(connection, line);
                    if (result) {
                        return result;
                    }
                } else if (strncmp(line, sKey_ka, 10)) {
                    gpiDebug(connection, sStr_ReceivedAnUnrecognizedUnsolicitedMessage);
                }
            }
            end = strstr(iconnection->inputBuffer.buffer, sKey_final_2);
        }
        if (closed) {
            gpiSetError(connection, GP_CONNECTION_CLOSED, sStr_TheServerHasClosedTheConnection);
            gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
            return GP_NO_ERROR;
        }
        more = gpiOperationsAreBlocking(connection);
        if (more) {
            msleep(10);
        }
    } while (more);
    return GP_NO_ERROR;
}

// "gpiProcess": runs the connection; with blocking set, waits until the connect attempt is over.
int gpiProcess(GpConnection **connection, int blocking) {
    GpConnection *iconnection = *connection;
    int result = 0;
    GpOperation *operation;
    if ((u32)iconnection->connectState > GP_DISCONNECTED) {
        __msl_assertion_failed(sStr_IconnectionConnectStateEqGPI_NOT_CONNECTED_Or, sStr_GpiC, sStr_gpiProcess, 0x1b6);
    }
    if (iconnection->connectState == GP_CONNECTING) {
        int again;
        do {
            result = gpiCheckConnect(connection);
            if (result == 0 && blocking && iconnection->connectState == GP_CONNECTING) {
                again = 1;
            } else {
                again = 0;
            }
            if (again) {
                msleep(10);
            }
        } while (again);
        if (result) {
            if (gpiFindOperationByID(connection, &operation, 1)) {
                operation->result = 4;
            } else {
                __msl_assertion_failed(sStr_0, sStr_GpiC, sStr_gpiProcess, 0x1dc);
            }
        }
    }
    if (iconnection->connectState == GP_NEGOTIATING || iconnection->connectState == GP_CONNECTED) {
        if (!result) {
            result = gpiProcessConnectionManager(connection);
        }
        if (!result) {
            result = gpiProcessPeers(connection);
        }
    }
    if (!result) {
        result = gpiProcessSearches(connection);
    }
    operation = iconnection->operations;
    while (operation) {
        if (operation->result == 0) {
            operation = operation->next;
        } else {
            gpiFailedOpCallback(connection, operation);
            {
                GpOperation *done = operation;
                operation = operation->next;
                gpiRemoveOperation(connection, done);
            }
        }
    }
    {
        int status = gpiProcessCallbacks(connection, blocking);
        if (status) {
            return status;
        }
    }
    if (iconnection->fatalError) {
        gpiDisconnect(connection, 0);
    }
    return result;
}

// Accepts the buddy request of profile ("\authadd\").
int gpiSendAuthBuddyRequest(GpConnection **connection, GpProfile *profile) {
    GpConnection *iconnection = *connection;
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_authadd);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_sesskey_2);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, iconnection->sessKey);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_fromprofileid);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, profile->profileId);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_sig);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, profile->authSig);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_final_3);
    return 0;
}

// Handles a "\bm\" message from the server: 1 buddy message, 2 buddy request, 100 buddy status,
// 101 game invite, 102 ping (answered).
int gpiProcessRecvBuddyMessage(GpConnection **connection, char *input) {
    char buffer[4096], string[256], number[16];
    int profileId, type, date, result;
    GpCallback messageCallback, inviteCallback, statusCallback, requestCallback;
    GpProfile *profile;
    GpBuddyStatus *status;
    GpBuddyMessageArg *arg;
    char *signature;
    GpConnection *iconnection = *connection;
    if (!gpiValueForKey(input, sKey_bm_2, buffer, 4096)) {
        GP_PARSE_ERROR(connection);
    }
    type = atol(buffer);
    if (!gpiValueForKey(input, sKey_f, buffer, 4096)) {
        GP_PARSE_ERROR(connection);
    }
    profileId = atol(buffer);
    if (gpiValueForKey(input, sKey_date, buffer, 4096)) {
        date = atol(buffer);
    } else {
        date = current_time_seconds(0);
    }
    switch (type) {
    case 1: {
        messageCallback = iconnection->callbacks[GP_CALLBACK_BUDDY_MESSAGE];
        if (!messageCallback.callback) {
            break;
        }
        arg = DWCi_GsMalloc(sizeof(GpBuddyMessageArg));
        if (!arg) {
            GP_OUT_OF_MEMORY(connection);
        }
        if (!gpiValueForKey(input, sKey_msg, buffer, 4096)) {
            GP_PARSE_ERROR(connection);
        }
        arg->message = DWCi_GsMalloc(strlen(buffer) + 1);
        if (!arg->message) {
            GP_OUT_OF_MEMORY(connection);
        }
        strcpy(arg->message, buffer);
        arg->profile = profileId;
        arg->date = date;
        result = gpiAddCallback(connection, messageCallback, arg, 0, GPI_ADD_MESSAGE);
        if (result) {
            return result;
        }
        break;
    }
    case 2: {
        GpBuddyRequestArg *request;
        profile = gpiProfileListAdd(connection, profileId);
        if (!profile) {
            GP_OUT_OF_MEMORY(connection);
        }
        if (!gpiValueForKey(input, sKey_msg, buffer, 4096)) {
            GP_PARSE_ERROR(connection);
        }
        signature = strstr(buffer, sStr_Signed);
        if (!signature) {
            GP_PARSE_ERROR(connection);
        }
        *signature = 0;
        if (strlen(signature + 8) != 32) {
            GP_PARSE_ERROR(connection);
        }
        DWCi_GsFree(profile->authSig);
        profile->authSig = 0;
        profile->authSig = goastrdup(signature + 8);
        profile->requestCount++;
        requestCallback = iconnection->callbacks[GP_CALLBACK_BUDDY_REQUEST];
        if (!requestCallback.callback) {
            break;
        }
        request = DWCi_GsMalloc(sizeof(GpBuddyRequestArg));
        if (!request) {
            GP_OUT_OF_MEMORY(connection);
        }
        strzcpy(request->reason, buffer, sizeof(request->reason));
        request->profile = profileId;
        request->date = date;
        result = gpiAddCallback(connection, requestCallback, request, 0, 6);
        if (result) {
            return result;
        }
        break;
    }
    case 100: {
        profile = gpiProfileListAdd(connection, profileId);
        if (!profile) {
            GP_OUT_OF_MEMORY(connection);
        }
        if (!profile->buddyStatus) {
            profile->buddyStatus = DWCi_GsMalloc(sizeof(GpBuddyStatus));
            if (!profile->buddyStatus) {
                GP_OUT_OF_MEMORY(connection);
            }
            memset(profile->buddyStatus, 0, sizeof(GpBuddyStatus));
            profile->buddyStatus->buddyIndex = iconnection->numBuddies++;
        }
        status = profile->buddyStatus;
        if (!gpiValueForKey(input, sKey_msg, buffer, 4096)) {
            GP_PARSE_ERROR(connection);
        }
        if (!gpiValueForKey(buffer, sStr_PipeS_Pipe, number, 16)) {
            GP_PARSE_ERROR(connection);
        }
        status->status = atol(number);
        DWCi_GsFree(status->statusString);
        status->statusString = 0;
        if (!gpiValueForKey(buffer, sStr_PipeSsPipe, string, 256)) {
            string[0] = 0;
        }
        status->statusString = goastrdup(string);
        if (!status->statusString) {
            GP_OUT_OF_MEMORY(connection);
        }
        DWCi_GsFree(status->locationString);
        status->locationString = 0;
        if (!gpiValueForKey(buffer, sStr_PipeLsPipe, string, 256)) {
            string[0] = 0;
        }
        status->locationString = goastrdup(string);
        if (!status->locationString) {
            GP_OUT_OF_MEMORY(connection);
        }
        if (gpiValueForKey(buffer, sStr_PipeIpPipe, number, 16)) {
            u32 a = atol(number), b = atol(number), c = atol(number), d = atol(number);
            status->ip = ((c >> 24) & 255) | ((d >> 8) & 0xff00) | ((b << 8) & 0xff0000) | ((a << 24) & 0xff000000);
        } else {
            status->ip = 0;
        }
        if (gpiValueForKey(buffer, sStr_PipeP_Pipe, number, 16)) {
            u16 port = atol(number);
            status->port = (u16)(((port >> 8) & 255) | ((port << 8) & 0xff00));
        } else {
            status->port = 0;
        }
        statusCallback = iconnection->callbacks[GP_CALLBACK_BUDDY_STATUS];
        if (!statusCallback.callback) {
            break;
        }
        arg = DWCi_GsMalloc(12);
        if (!arg) {
            GP_OUT_OF_MEMORY(connection);
        }
        arg->profile = profileId;
        arg->message = (char *)status->buddyIndex;
        arg->date = date;
        result = gpiAddCallback(connection, statusCallback, arg, 0, GPI_ADD_STATUS);
        if (result) {
            return result;
        }
        break;
    }
    case 101: {
        GpGameInviteArg *invite;
        int productId;
        if (!gpiValueForKey(input, sKey_msg, buffer, 4096)) {
            GP_PARSE_ERROR(connection);
        }
        signature = strstr(buffer, sStr_PipeP_Pipe);
        if (!signature) {
            GP_PARSE_ERROR(connection);
        }
        if (!signature[3]) {
            GP_PARSE_ERROR(connection);
        }
        productId = atol(signature + 3);
        signature = strstr(buffer, sStr_PipeL_Pipe);
        if (!signature) {
            string[0] = 0;
        } else {
            strzcpy(string, signature + 3, 256);
        }
        inviteCallback = iconnection->callbacks[GP_CALLBACK_GAME_INVITE];
        if (!inviteCallback.callback) {
            break;
        }
        invite = DWCi_GsMalloc(sizeof(GpGameInviteArg));
        if (!invite) {
            GP_OUT_OF_MEMORY(connection);
        }
        invite->profile = profileId;
        invite->productId = productId;
        strcpy(invite->location, string);
        result = gpiAddCallback(connection, inviteCallback, invite, 0, GPI_ADD_NORMAL);
        if (result) {
            return result;
        }
        break;
    }
    case 102:
        if (!gpiValueForKey(input, sKey_msg, buffer, 4096)) {
            GP_PARSE_ERROR(connection);
        }
        gpiSendBuddyMessage(connection, profileId, 0x67, sStr_1);
        break;
    default:
        break;
    }
    return GP_NO_ERROR;
}

// Sends a "\bm\" message through the server.
int gpiSendServerBuddyMessage(GpConnection **connection, int profile, int type, const char *message) {
    char buffer[3504];
    GpConnection *iconnection = *connection;
    strzcpy(buffer, message, 3501);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_bm_2);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, type);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_sesskey_2);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, iconnection->sessKey);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_t);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, profile);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_msg);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, buffer);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_final_3);
    return 0;
}

// Sends a buddy message directly to the peer when one is (or can be) connected, else through the server.
int gpiSendBuddyMessage(GpConnection **connection, int profileId, int type, const char *message) {
    GpProfile *profile;
    GpPeer *peer = gpiGetPeerByProfile(connection, profileId);
    int result;
    if (!peer) {
        if (!gpiGetProfile(connection, profileId, &profile) || !profile->buddyStatus || !profile->buddyStatus->port) {
            return gpiSendServerBuddyMessage(connection, profileId, type, message);
        }
        peer = gpiAddPeer(connection, profileId, 1);
        if (!peer) {
            return 1;
        }
        if (!profile->peerSig) {
            result = gpiPeerGetSig(connection, peer);
            if (result) {
                return result;
            }
        } else {
            result = gpiPeerStartConnect(connection, peer);
            if (result) {
                return result;
            }
        }
    }
    result = gpiPeerAddMessage(connection, peer, type, message);
    if (!result) {
        return 0;
    }
    return result;
}

// Accepts a pending buddy request.
int gpiAuthBuddyRequest(GpConnection **connection, int profileId) {
    GpConnection *iconnection = *connection;
    GpProfile *profile;
    int result;
    if (!gpiGetProfile(connection, profileId, &profile)) {
        gpiSetErrorString(connection, sStr_InvalidProfile);
        return GP_PARAMETER_ERROR;
    }
    if (!profile->authSig) {
        gpiSetErrorString(connection, sStr_InvalidProfile);
        return GP_PARAMETER_ERROR;
    }
    result = gpiSendAuthBuddyRequest(connection, profile);
    if (result) {
        return result;
    }
    profile->requestCount--;
    if (!iconnection->cacheProfileInfo && profile->requestCount <= 0) {
        DWCi_GsFree(profile->authSig);
        profile->authSig = 0;
        if (gpiCanFreeProfile(profile)) {
            gpiRemoveProfile(connection, profile);
        }
    }
    return GP_NO_ERROR;
}

// Profile table iterator: moves the buddies after a deleted one down by one index.
int gpiFixBuddyIndices(GpConnection **connection, GpProfile *profile, void *index) {
    GpBuddyStatus *status = profile->buddyStatus;
    if (status) {
        if (status->buddyIndex > (int)index) {
            status->buddyIndex--;
        }
    }
    return 1;
}

// "gpiDeleteBuddy"
int gpiDeleteBuddy(GpConnection **connection, int profileId) {
    GpConnection *iconnection = *connection;
    GpProfile *profile;
    if (!gpiGetProfile(connection, profileId, &profile)) {
        gpiSetErrorString(connection, sStr_InvalidProfile);
        return GP_PARAMETER_ERROR;
    }
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_delbuddy);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_sesskey_2);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, iconnection->sessKey);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_delprofileid);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, profile->profileId);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_final_3);
    if (profile->buddyStatus) {
        int index = profile->buddyStatus->buddyIndex;
        if (index < 0) {
            __msl_assertion_failed(sStr_IndexGe0, sStr_GpiBuddyC, sStr_gpiDeleteBuddy, 0x1fd);
        }
        DWCi_GsFree(profile->buddyStatus->statusString);
        profile->buddyStatus->statusString = 0;
        DWCi_GsFree(profile->buddyStatus->locationString);
        profile->buddyStatus->locationString = 0;
        DWCi_GsFree(profile->buddyStatus);
        profile->buddyStatus = 0;
        if (gpiCanFreeProfile(profile)) {
            gpiRemoveProfile(connection, profile);
        }
        if (--iconnection->numBuddies < 0) {
            __msl_assertion_failed(sStr_IconnectionProfileListNumBuddiesGe0, sStr_GpiBuddyC, sStr_gpiDeleteBuddy, 0x204);
        }
        gpiProfileMap(connection, gpiFixBuddyIndices, (void *)index);
    }
    return GP_NO_ERROR;
}
