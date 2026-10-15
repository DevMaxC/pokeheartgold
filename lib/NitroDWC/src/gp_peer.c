#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Presence connection: direct connections to other profiles ("gpiPeer.c": connect / accept with the
// "\auth\" handshake, buddy messages and transfers, queued messages) and the start of "gpiProfile.c" (the
// profile table, the "\npr\" reply).

extern const char sStr_gpiRemovePeer[]; // "gpiRemovePeer"
extern const char sStr_gpiProcessPeer[]; // "gpiProcessPeer"
extern const char sStr_gpiPeerAddMessage[]; // "gpiPeerAddMessage"
extern const char sStr_gpiPeerStartTransferMessage[]; // "gpiPeerStartTransferMessage"
extern const char sStr_gpiPeerFinishTransferMessage[]; // "gpiPeerFinishTransferMessage"
extern const char sStr_gpiProcessPeerAcceptingConnection[]; // "gpiProcessPeerAcceptingConnection"
extern const char sStr_gpiProcessPeerInitiatingConnection[]; // "gpiProcessPeerInitiatingConnection"
extern const char sStr_ErrorConnectingToA_Peer[]; // "Error connecting to a peer."
extern const char sKey_auth[]; // "\\auth\\"
extern const char sKey_pid_2[]; // "\\pid\\"
extern const char sKey_nick_3[]; // "\\nick\\"
extern const char sKey_sig_3[]; // "\\sig\\"
extern const char sKey_final_6[]; // "\\final\\"
extern const char sStr_PR[]; // "PR"
extern const char sKey_anack[]; // "\\anack\\"
extern const char sStr_ErrorGettingBuddyAuthorization[]; // "Error getting buddy authorization."
extern const char sKey_aack[]; // "\\aack\\"
extern const char sStr_ErrorParsingBuddyMessage[]; // "Error parsing buddy message."
extern const char sStr_0_4[]; // "0"
extern const char sStr_GpiPeerC[]; // "gpiPeer.c"
extern const char sStr_PeerStateEqGPI_PEER_WAITING[]; // "peer->state == GPI_PEER_WAITING"
extern const char sFmt_StrIntInt[]; // "%s%d%d"
extern const char sStr_OutOfMemory_8[]; // "Out of memory."
extern const char sStr_1_3[]; // "1"
extern const char sStr_PeerStateNeGPI_PEER_NOT_CONNECTED[]; // "peer->state != GPI_PEER_NOT_CONNECTED"
extern const char sStr_PeerNeNULL[]; // "peer != NULL"
extern const char sStr_TriedToRemovePeerNotInList[]; // "Tried to remove peer not in list."
extern const char sStr_ThereWasAnErrorCreatingA_Socket_2[]; // "There was an error creating a socket."
extern const char sStr_ThereWasAnErrorMakingA_SocketNonBlocking_2[]; // "There was an error making a socket non-blocking."
extern const char sStr_ThereWasAnErrorConnectingA_Socket_2[]; // "There was an error connecting a socket."
extern const char sStr_MessageNeNULL[]; // "message != NULL"
extern const char sKey_m_2[]; // "\\m\\"
extern const char sKey_len_2[]; // "\\len\\"
extern const char sKey_msg_3[]; // "\\msg\\\n"
extern const char sStr_transferID[]; // "transferID"
extern const char sFmt_M_Xfer[]; // "\\m\\%d\\xfer\\%d %u %u"
extern char sStr_Empty_7[];       // ""
extern const char sFmt_LenMsg[]; // "\\len\\%d\\msg\\\n"
extern const char sKey_npr[]; // "\\npr\\"
extern const char sStr_UnexpectedDataWasReceivedFromTheServer_4[]; // "Unexpected data was received from the server."
extern const char sKey_profileid_3[]; // "\\profileid\\"
extern const char sStr_OutOfMemory_9[]; // "Out of memory."

typedef struct SocketAddress {
    u8 len;
    u8 family;
    u16 port;
    u32 addr;
} SocketAddress;

extern int strncmp(const char *, const char *, unsigned);
extern int sprintf(char *, const char *, ...);
extern long atol(const char *);
extern char *strstr(const char *, const char *);
extern void __msl_assertion_failed(const char *, const char *, const char *, int);
extern void *DWCi_GsMalloc(u32 size);
extern void DWCi_GsFree(void *p);
extern void *ArrayNew(int elemSize, int count, void (*freeElem)(void *));
extern void ArrayFree(void *array);
extern void *ArrayNth(void *array, int i);
extern void ArrayAppend(void *array, void *elem);
extern void ArrayDeleteAt(void *array, int i);
extern void *TableNew(int elemSize, int numBuckets, int (*hash)(GpProfile *, int), int (*compare)(GpProfile *, GpProfile *), void (*freeElem)(GpProfile *));
extern int ArrayLength(void *array);
extern void MD5Digest(const char *data, int len, char *md5);
extern char *goastrdup(const char *string);
extern int SetSockBlocking(int sock, int blocking);
extern void SetReceiveBufferSize(int sock, int size);
extern void SetSendBufferSize(int sock, int size);
extern void GetReceiveBufferSize(int sock);
extern void GetSendBufferSize(int sock);
extern int CanReceiveOnSocket(int sock);
extern int gsSocketCreate(int domain, int type, int protocol);
extern void gsSocketClose(int sock);
extern void gsSocketShutdown(int sock, int how);
extern int gsSocketConnect(int sock, SocketAddress *address, int len);
extern int gsSocketAccept(int sock, void *address, int *len);
extern int gsSocketGetLastError(int sock);
extern int current_time_seconds(int);
extern void gpiCallErrorCallback(GpConnection **connection, int result, int fatal);
extern int gpiSendOrBufferString(GpConnection **connection, GpPeer *peer, char *string);
extern int gpiAddCallback(GpConnection **connection, GpCallback callback, void *arg, GpOperation *operation, int type);

// Argument of the peer buddy message callback.
typedef struct GpPeerMessageArg {
    int profile;
    int date;
    char *message;
} GpPeerMessageArg;

int gpiPeerStartTransferMessage(GpConnection **connection, GpPeer *peer, int type, int *values);
int gpiPeerFinishTransferMessage(GpConnection **connection, GpPeer *peer, char *buffer, int len);

// "gpiProcessPeerInitiatingConnection": gets the peer's signature, connects and authenticates.
int gpiProcessPeerInitiatingConnection(GpConnection **connection, GpPeer *peer) {
    GpConnection *iconnection = *connection;

    struct {
        GpProfile *profile;
        int closed, bytesRead, state;
    } local;

    int result;
    switch (peer->state) {
    case GP_PEER_GETTING_SIG:
        break;
    case GP_PEER_GOT_SIG:
        result = gpiPeerStartConnect(connection, peer);
        if (result) {
            return result;
        }
        break;
    case GP_PEER_CONNECTING:
        result = gpiCheckSocketConnect(connection, peer->sock, &local.state);
        if (result) {
            return result;
        }
        if (local.state == 4) {
            gpiSetErrorString(connection, sStr_ErrorConnectingToA_Peer);
            return GP_NETWORK_ERROR;
        }
        if (local.state == 3) {
            BOOL freeSig = TRUE;
            GpPeer *other;
            if (!gpiGetProfile(connection, peer->profile, &local.profile)) {
                gpiSetErrorString(connection, sStr_ErrorConnectingToA_Peer);
                return GP_NETWORK_ERROR;
            }
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_auth);
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_pid_2);
            gpiAppendIntToBuffer(connection, &peer->outputBuffer, iconnection->profileId);
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_nick_3);
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, iconnection->nick);
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_sig_3);
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, local.profile->peerSig);
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_final_6);
            for (other = iconnection->peers; other; other = other->next) {
                if (other->profile == peer->profile && other != peer && other->state <= GP_PEER_CONNECTING) {
                    freeSig = FALSE;
                }
            }
            if (freeSig) {
                DWCi_GsFree(local.profile->peerSig);
                local.profile->peerSig = 0;
                if (gpiCanFreeProfile(local.profile)) {
                    gpiRemoveProfile(connection, local.profile);
                }
            }
            peer->state = GP_PEER_WAITING;
        }
        break;
    case GP_PEER_WAITING:
        result = gpiRecvToBuffer(connection, peer->sock, &peer->inputBuffer, &local.bytesRead, &local.closed, sStr_PR);
        if (result) {
            return result;
        }
        {
            char *end = strstr(peer->inputBuffer.buffer, sKey_final_6);
            if (end) {
                char *line;
                *end = 0;
                line = peer->inputBuffer.buffer;
                if (!strncmp(line, sKey_anack, 7)) {
                    if (++peer->nackCount > 1) {
                        gpiSetErrorString(connection, sStr_ErrorGettingBuddyAuthorization);
                        return GP_NETWORK_ERROR;
                    }
                    result = gpiPeerGetSig(connection, peer);
                    if (result) {
                        return result;
                    }
                } else if (strncmp(line, sKey_aack, 6)) {
                    gpiSetErrorString(connection, sStr_ErrorParsingBuddyMessage);
                    return GP_NETWORK_ERROR;
                }
                peer->state = GP_PEER_CONNECTED;
                peer->inputBuffer.len = 0;
            }
        }
        break;
    default:
        __msl_assertion_failed(sStr_0_4, sStr_GpiPeerC, sStr_gpiProcessPeerInitiatingConnection, 159);
        break;
    }
    if (peer->outputBuffer.len > 0) {
        result = gpiSendFromBuffer(connection, peer->sock, &peer->outputBuffer, &local.closed, 1, sStr_PR);
        if (local.closed || result) {
            peer->state = GP_PEER_DISCONNECTED;
        }
    }
    return GP_NO_ERROR;
}

// "gpiProcessPeerAcceptingConnection": checks the "\auth\" of a peer that connected to us.
int gpiProcessPeerAcceptingConnection(GpConnection **connection, GpPeer *peer) {
    GpConnection *iconnection = *connection;

    struct {
        int closed, bytesRead;
        char sigCheck[33], sig[33], nick[31], number[16], buffer[256];
    } local;

    char *end, *line;
    int result, profileId;
    if (peer->state != GP_PEER_WAITING) {
        __msl_assertion_failed(sStr_PeerStateEqGPI_PEER_WAITING, sStr_GpiPeerC, sStr_gpiProcessPeerAcceptingConnection, 193);
    }
    result = gpiRecvToBuffer(connection, peer->sock, &peer->inputBuffer, &local.bytesRead, &local.closed, sStr_PR);
    if (result) {
        return result;
    }
    if (local.closed) {
        peer->state = GP_PEER_DISCONNECTED;
        return GP_NO_ERROR;
    }
    end = strstr(peer->inputBuffer.buffer, sKey_final_6);
    if (end) {
        *end = 0;
        line = peer->inputBuffer.buffer;
        if (!strncmp(line, sKey_auth, 6)) {
            if (!gpiValueForKey(line, sKey_pid_2, local.number, 16)) {
                peer->state = GP_PEER_DISCONNECTED;
                return GP_NO_ERROR;
            }
            profileId = atol(local.number);
            if (!gpiValueForKey(peer->inputBuffer.buffer, sKey_nick_3, local.nick, 31)) {
                peer->state = GP_PEER_DISCONNECTED;
                return GP_NO_ERROR;
            }
            if (!gpiValueForKey(peer->inputBuffer.buffer, sKey_sig_3, local.sig, 33)) {
                peer->state = GP_PEER_DISCONNECTED;
                return GP_NO_ERROR;
            }
            sprintf(local.buffer, sFmt_StrIntInt, iconnection->password, iconnection->profileId, profileId);
            MD5Digest(local.buffer, strlen(local.buffer), local.sigCheck);
            if (strcmp(local.sig, local.sigCheck)) {
                gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_anack);
                gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_final_6);
                peer->state = GP_PEER_DISCONNECTED;
                return GP_NO_ERROR;
            }
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_aack);
            gpiAppendStringToBuffer(connection, &peer->outputBuffer, sKey_final_6);
            peer->state = GP_PEER_CONNECTED;
            peer->profile = profileId;
        } else {
            peer->state = GP_PEER_DISCONNECTED;
            return GP_NO_ERROR;
        }
        peer->inputBuffer.len = 0;
    }
    return GP_NO_ERROR;
}

// Sends the queued messages until one does not go out completely.
int gpiPeerSendMessages(GpConnection **connection, GpPeer *peer) {
    int closed;
    GpPeerMessage *message;
    int result;
    if (peer->outputBuffer.len) {
        return 0;
    }
    if (ArrayLength(peer->messages)) {
        do {
            message = ArrayNth(peer->messages, 0);
            result = gpiSendFromBuffer(connection, peer->sock, &message->buffer, &closed, 0, sStr_PR);
            if (closed || result) {
                peer->state = GP_PEER_DISCONNECTED;
                return 0;
            }
            if (message->buffer.pos != message->buffer.len) {
                break;
            }
            ArrayDeleteAt(peer->messages, 0);
        } while (ArrayLength(peer->messages));
    }
    return 0;
}

// Sends and receives on a connected peer and handles its messages.
int gpiProcessPeerConnected(GpConnection **connection, GpPeer *peer) {
    int bytesRead;
    int closed;
    GpCallback callback;
    char *buffer;
    int type;
    int len;
    GpConnection *iconnection = *connection;
    if (peer->outputBuffer.len) {
        int result = gpiSendFromBuffer(connection, peer->sock, &peer->outputBuffer, &closed, 1, sStr_PR);
        if (closed || result) {
            peer->state = GP_PEER_DISCONNECTED;
            return GP_NO_ERROR;
        }
    }
    if (!peer->outputBuffer.len) {
        int result = gpiPeerSendMessages(connection, peer);
        if (result) {
            return result;
        }
        if (peer->state == GP_PEER_DISCONNECTED) {
            return GP_NO_ERROR;
        }
    }
    if (gpiRecvToBuffer(connection, peer->sock, &peer->inputBuffer, &bytesRead, &closed, sStr_PR)) {
        peer->state = GP_PEER_DISCONNECTED;
        return GP_NO_ERROR;
    }
    if (bytesRead > 0) {
        peer->timeout = current_time_seconds(0) + 300;
    }
    do {
        int result = gpiReadMessage(connection, &peer->inputBuffer, &buffer, &type, &len);
        if (result) {
            return result;
        }
        if (buffer) {
            switch (type) {
            case 1:
                callback = iconnection->callbacks[GP_CALLBACK_BUDDY_MESSAGE];
                if (callback.callback) {
                    GpPeerMessageArg *arg = DWCi_GsMalloc(sizeof(GpPeerMessageArg));
                    if (!arg) {
                        gpiSetErrorString(connection, sStr_OutOfMemory_8);
                        return GP_MEMORY_ERROR;
                    }
                    arg->profile = peer->profile;
                    arg->message = goastrdup(buffer);
                    arg->date = current_time_seconds(0);
                    result = gpiAddCallback(connection, callback, arg, 0, GPI_ADD_MESSAGE);
                    if (result) {
                        return result;
                    }
                }
                break;
            case 102:
                gpiSendBuddyMessage(connection, peer->profile, 103, sStr_1_3);
                break;
            case 200:
            case 201:
            case 202:
            case 203:
            case 204:
            case 205:
            case 206:
            case 207:
            case 208:
                gpiHandleTransferMessage(connection, peer, type, peer->inputBuffer.buffer, buffer, len);
                break;
            }
            gpiClipBufferToPosition(connection, &peer->inputBuffer);
        }
    } while (buffer);
    if (closed) {
        peer->state = GP_PEER_DISCONNECTED;
    }
    return GP_NO_ERROR;
}

// "gpiProcessPeer"
int gpiProcessPeer(GpConnection **connection, GpPeer *peer) {
    int result = GP_NO_ERROR;
    if (peer->state == GP_PEER_NOT_CONNECTED) {
        __msl_assertion_failed(sStr_PeerStateNeGPI_PEER_NOT_CONNECTED, sStr_GpiPeerC, sStr_gpiProcessPeer, 0x1d9);
    }
    if (peer->state != GP_PEER_CONNECTED) {
        if (peer->initiated) {
            result = gpiProcessPeerInitiatingConnection(connection, peer);
        } else {
            result = gpiProcessPeerAcceptingConnection(connection, peer);
        }
    }
    if (!result && peer->state == GP_PEER_CONNECTED) {
        result = gpiProcessPeerConnected(connection, peer);
    }
    return result;
}

// Closes and frees a peer.
void gpiDestroyPeer(GpConnection **connection, GpPeer *peer) {
    gsSocketShutdown(peer->sock, 2);
    gsSocketClose(peer->sock);
    DWCi_GsFree(peer->inputBuffer.buffer);
    peer->inputBuffer.buffer = 0;
    DWCi_GsFree(peer->outputBuffer.buffer);
    peer->outputBuffer.buffer = 0;
    if (peer->messages) {
        ArrayFree(peer->messages);
        peer->messages = 0;
    }
    DWCi_GsFree(peer);
}

// "gpiRemovePeer": unlinks a peer; its unsent buddy messages go through the server instead.
void gpiRemovePeer(GpConnection **connection, GpPeer *peer) {
    GpConnection *iconnection = *connection;
    GpPeer *prev, *next;
    int i, j;
    if (!peer) {
        __msl_assertion_failed(sStr_PeerNeNULL, sStr_GpiPeerC, sStr_gpiRemovePeer, 0x213);
    }
    prev = iconnection->peers;
    if (prev == peer) {
        iconnection->peers = peer->next;
    } else {
        next = prev->next;
        while (next != peer) {
            if (!next) {
                __msl_assertion_failed(sStr_0_4, sStr_GpiPeerC, sStr_gpiRemovePeer, 0x225);
                gpiDebug(connection, sStr_TriedToRemovePeerNotInList);
                return;
            }
            prev = next;
            next = next->next;
        }
        prev->next = peer->next;
    }
    if (ArrayLength(peer->messages)) {
        i = 0;
        j = 0;
        do {
            GpPeerMessage *message = ArrayNth(peer->messages, j);
            if (message->type < 100) {
                gpiSendServerBuddyMessage(connection, peer->profile, message->type, message->buffer.buffer + message->start);
            }
            ArrayDeleteAt(peer->messages, i);
        } while (ArrayLength(peer->messages));
    }
    gpiDestroyPeer(connection, peer);
}

// Socket buffer sizes for peers.
void gpiSetPeerSocketSizes(int sock) {
    SetReceiveBufferSize(sock, 16384);
    SetReceiveBufferSize(sock, 32768);
    SetReceiveBufferSize(sock, 65536);
    SetReceiveBufferSize(sock, 131072);
    SetReceiveBufferSize(sock, 262144);
    SetSendBufferSize(sock, 16384);
    SetSendBufferSize(sock, 32768);
    SetSendBufferSize(sock, 65536);
    GetReceiveBufferSize(sock);
    GetSendBufferSize(sock);
}

// Accepts new peers and processes the existing ones, removing those that are done or timed out.
int gpiProcessPeers(GpConnection **connection) {
    GpConnection *iconnection = *connection;
    GpPeer *peer, *next;
    int sock, result;
    if (iconnection->peerSocket != INVALID_SOCKET && CanReceiveOnSocket(iconnection->peerSocket)) {
        sock = gsSocketAccept(iconnection->peerSocket, 0, 0);
        if (sock != INVALID_SOCKET) {
            peer = gpiAddPeer(connection, -1, 0);
            if (peer) {
                peer->state = GP_PEER_WAITING;
                peer->sock = sock;
                SetSockBlocking(sock, 0);
                gpiSetPeerSocketSizes(peer->sock);
            } else {
                gsSocketClose(sock);
            }
        }
    }
    for (peer = iconnection->peers; peer; peer = next) {
        next = peer->next;
        result = gpiProcessPeer(connection, peer);
        if (peer->state == GP_PEER_DISCONNECTED || result != 0 || current_time_seconds(0) > peer->timeout) {
            gpiRemovePeer(connection, peer);
        }
    }
    return 0;
}

// The connected peer of a profile.
GpPeer *gpiGetPeerByProfile(GpConnection **connection, int profile) {
    GpPeer *peer = (*connection)->peers;
    while (peer) {
        if (peer->profile == profile && peer->state == GP_PEER_CONNECTED) {
            return peer;
        }
        peer = peer->next;
    }
    return 0;
}

// Frees the buffer of a queued message (message array element destructor).
void gpiFreeMessage(void *message) {
    DWCi_GsFree(*(void **)message);
    *(void **)message = 0;
}

GpPeer *gpiAddPeer(GpConnection **connection, int profile, int initiated) {
    GpConnection *iconnection = *connection;
    GpPeer *peer = DWCi_GsMalloc(sizeof(GpPeer));
    if (!peer) {
        return 0;
    }
    memset(peer, 0, sizeof(GpPeer));
    peer->state = GP_PEER_NOT_CONNECTED;
    peer->initiated = initiated;
    peer->sock = INVALID_SOCKET;
    peer->profile = profile;
    peer->timeout = current_time_seconds(0) + 300;
    peer->next = iconnection->peers;
    peer->messages = ArrayNew(sizeof(GpPeerMessage), 0, gpiFreeMessage);
    iconnection->peers = peer;
    return peer;
}

// Requests the profile info of the peer, for its signature.
int gpiPeerGetSig(GpConnection **connection, GpPeer *peer) {
    GpOperation *operation;
    int result = gpiAddOperation(connection, GP_OPERATION_GET_INFO, 0, &operation, 0, 0, 0);
    if (result != 0) {
        return result;
    }
    result = gpiSendGetInfo(connection, peer->profile, operation->id);
    if (result == 0) {
        peer->state = GP_PEER_GETTING_SIG;
        result = 0;
    }
    return result;
}

// Connects to the peer at the address of its buddy status.
int gpiPeerStartConnect(GpConnection **connection, GpPeer *peer) {
    struct {
        GpProfile *profile;
        SocketAddress address;
    } frame;

    if (gpiGetProfile(connection, peer->profile, &frame.profile) == 0) {
        gpiSetErrorString(connection, sStr_ErrorConnectingToA_Peer);
        return GP_NETWORK_ERROR;
    }
    peer->sock = gsSocketCreate(AF_INET, SOCK_STREAM, 0);
    if ((int)peer->sock == INVALID_SOCKET) {
        gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorCreatingA_Socket_2);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_NON_FATAL);
        return GP_NETWORK_ERROR;
    }
    if (SetSockBlocking(peer->sock, 0) == 0) {
        gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorMakingA_SocketNonBlocking_2);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_NON_FATAL);
        return GP_NETWORK_ERROR;
    }
    gpiSetPeerSocketSizes(peer->sock);
    {
        SocketAddress *p = &frame.address;
        *(u32 *)p = 0;
        p->addr = 0;
    }
    frame.address.family = AF_INET;
    frame.address.addr = frame.profile->buddyStatus->ip;
    frame.address.port = frame.profile->buddyStatus->port;
    if (gsSocketConnect(peer->sock, &frame.address, 8) == SOCKET_ERROR) {
        int error = gsSocketGetLastError(peer->sock);
        if (error != -6 && error != -26 && error != -76) {
            gpiSetError(connection, GP_NETWORK, sStr_ThereWasAnErrorConnectingA_Socket_2);
            gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
            return GP_NETWORK_ERROR;
        }
    }
    peer->state = GP_PEER_CONNECTING;
    return GP_NO_ERROR;
}

// "gpiPeerAddMessage": queues "\m\<type>\len\<n>\msg\\n<message>\0".
int gpiPeerAddMessage(GpConnection **connection, GpPeer *peer, int type, const char *message) {
    int len, result;
    volatile GpPeerMessage queued;
    if (peer == NULL) {
        __msl_assertion_failed(sStr_PeerNeNULL, sStr_GpiPeerC, sStr_gpiPeerAddMessage, 0x340);
    }
    if (message == NULL) {
        __msl_assertion_failed(sStr_MessageNeNULL, sStr_GpiPeerC, sStr_gpiPeerAddMessage, 0x341);
    }
    len = strlen(message);
    memset((void *)&queued, 0, sizeof(queued));
    queued.type = type;
    result = gpiAppendStringToBuffer(connection, (GpBuffer *)&queued.buffer, sKey_m_2);
    if (result) {
        return result;
    }
    result = gpiAppendIntToBuffer(connection, (GpBuffer *)&queued.buffer, type);
    if (result) {
        return result;
    }
    result = gpiAppendStringToBuffer(connection, (GpBuffer *)&queued.buffer, sKey_len_2);
    if (result) {
        return result;
    }
    result = gpiAppendIntToBuffer(connection, (GpBuffer *)&queued.buffer, len);
    if (result) {
        return result;
    }
    result = gpiAppendStringToBuffer(connection, (GpBuffer *)&queued.buffer, sKey_msg_3);
    if (result) {
        return result;
    }
    queued.start = queued.buffer.len;
    result = gpiAppendStringToBufferLen(connection, (GpBuffer *)&queued.buffer, message, len);
    if (result) {
        return result;
    }
    result = gpiAppendCharToBuffer(connection, (GpBuffer *)&queued.buffer, 0);
    if (result) {
        return result;
    }
    ArrayAppend(peer->messages, (void *)&queued);
    peer->timeout = current_time_seconds(0) + 300;
    return GP_NO_ERROR;
}

// "gpiPeerStartTransferMessage"
int gpiPeerStartTransferMessage(GpConnection **connection, GpPeer *peer, int type, int *values) {
    int b, a, c;
    a = *(volatile int *)values;
    b = values[1];
    c = values[2];
    char buffer[64];
    if (values == NULL) {
        __msl_assertion_failed(sStr_transferID, sStr_GpiPeerC, sStr_gpiPeerStartTransferMessage, 0x376);
    }
    sprintf(buffer, sFmt_M_Xfer, type, a, b, c);
    return gpiSendOrBufferString(connection, peer, buffer);
}

// "gpiPeerFinishTransferMessage"
int gpiPeerFinishTransferMessage(GpConnection **connection, GpPeer *peer, char *message, int len) {
    char buffer[32];
    int result;
    if (!peer) {
        __msl_assertion_failed(sStr_PeerNeNULL, sStr_GpiPeerC, sStr_gpiPeerFinishTransferMessage, 0x389);
    }
    if (!message) {
        message = sStr_Empty_7;
    }
    if (len == -1) {
        len = strlen(message);
    }
    sprintf(buffer, sFmt_LenMsg, len);
    result = gpiSendOrBufferString(connection, peer, buffer);
    if (result) {
        return result;
    }
    result = gpiSendOrBufferStringLen(connection, peer, message, len);
    if (result) {
        return result;
    }
    result = gpiSendOrBufferChar(connection, peer, 0);
    if (result) {
        return result;
    }
    peer->timeout = current_time_seconds(0) + 300;
    return GP_NO_ERROR;
}

// Profile table hash.
int gpiProfilesTableHash(GpProfile *profile, int numBuckets) {
    return profile->profileId % numBuckets;
}

// Profile table compare.
int gpiProfilesTableCompare(GpProfile *a, GpProfile *b) {
    return a->profileId - b->profileId;
}

// Profile table element destructor.
void gpiProfilesTableFree(GpProfile *profile) {
    if (profile->buddyStatus) {
        DWCi_GsFree(profile->buddyStatus->statusString);
        profile->buddyStatus->statusString = 0;
        DWCi_GsFree(profile->buddyStatus->locationString);
        profile->buddyStatus->locationString = 0;
        DWCi_GsFree(profile->buddyStatus);
        profile->buddyStatus = 0;
    }
    gpiFreeInfoCache(profile);
    DWCi_GsFree(profile->authSig);
    profile->authSig = 0;
    DWCi_GsFree(profile->peerSig);
    profile->peerSig = 0;
}

// Creates the profile table.
int gpiInitProfiles(GpConnection **connection) {
    GpConnection *iconnection = *connection;
    iconnection->numBuddies = 0;
    iconnection->numProfiles = 0;
    iconnection->profileTable = TableNew(sizeof(GpProfile), 4, gpiProfilesTableHash, gpiProfilesTableCompare, gpiProfilesTableFree);
    return iconnection->profileTable != 0;
}

// Handles the "\npr\" (new profile) reply.
int gpiProcessNewProfile(GpConnection **connection, GpOperation *operation, char *input) {
    char buffer[16];
    GpCallback callback;
    int profileId, result;
    int *arg;
    if (gpiCheckForError(connection, input, 1) != 0) {
        return GP_SERVER_ERROR;
    }
    if (strncmp(input, sKey_npr, 5) != 0) {
        gpiSetError(connection, GP_PARSE, sStr_UnexpectedDataWasReceivedFromTheServer_4);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
        return GP_NETWORK_ERROR;
    }
    if (gpiValueForKey(input, sKey_profileid_3, buffer, 16) == 0) {
        gpiSetError(connection, GP_PARSE, sStr_UnexpectedDataWasReceivedFromTheServer_4);
        gpiCallErrorCallback(connection, GP_NETWORK_ERROR, GP_FATAL);
        return GP_NETWORK_ERROR;
    }
    profileId = atol(buffer);
    callback.callback = operation->callback.callback;
    callback.param = operation->callback.param;
    if (callback.callback) {
        arg = DWCi_GsMalloc(8);
        if (arg == 0) {
            gpiSetErrorString(connection, sStr_OutOfMemory_9);
            return GP_MEMORY_ERROR;
        }
        arg[1] = profileId;
        arg[0] = 0;
        result = gpiAddCallback(connection, callback, arg, operation, GPI_ADD_NORMAL);
        if (result != GP_NO_ERROR) {
            return result;
        }
    }
    gpiRemoveOperation(connection, operation);
    return GP_NO_ERROR;
}
