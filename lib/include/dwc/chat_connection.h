#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_CHAT_CONNECTION_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_CHAT_CONNECTION_H

// Connection object of the chat client in the OVY_45 network library (src/chat_main.c, src/chat_socket.c):
// the server socket with its line buffers, the login data and the user callbacks.
// Included by dwc/chat_internal.h (after ChatCipher).

typedef struct ChatRequest ChatRequest; // defined in dwc/chat_internal.h

// A growing byte buffer of the socket (size is a multiple of 0x2000, data has size + 1 bytes).
typedef struct ChatBuffer {
    char *data;
    int length;
    int size;
} ChatBuffer;

// One line received from the server, split into its parts (heap strings owned by the message):
// [":" prefix] command [middle] [":" trailing], the prefix split into nick "!" user "@" host.
typedef struct ChatMessage {
    char *text; // the whole line
    char *prefix;
    char *nick;
    char *user;
    char *host;
    char *command;
    char *middle;
    char *trailing;
    char **params; // the words of middle and the trailing part
    int paramCount;
} ChatMessage;

// The connection to the chat server.
typedef struct ChatSocket {
    int handle; // -1 = none
    u32 state;  // 0 = not connected, 1 = connected, 2 = disconnected
    char host[256];
    ChatBuffer input;  // received bytes, NUL terminated
    ChatBuffer output; // bytes waiting to be sent
    BOOL encrypted;    // both directions go through the ciphers
    ChatCipher inputCipher;
    ChatCipher outputCipher;
    ChatMessage message; // the last line returned by ciSocketRecv
} ChatSocket;

// Address given to the OVY_0 connect function (8 bytes, port in network byte order).
typedef struct ChatSocketAddress {
    u8 length;
    u8 family; // 2
    u16 port;
    u32 address;
} ChatSocketAddress;

// Result of the host name lookup.
typedef struct ChatHostEntry {
    char *name;
    char **aliases;
    u16 type;
    u16 length;
    u32 **addresses;
} ChatHostEntry;

// Callbacks given to the connect functions, kept for the whole connection.
typedef struct ChatGlobalCallbacks {
    void *raw;            // callback type 0: every received line
    void *disconnected;   // callback type 1: the connection was lost (with the reason)
    void *privateMessage; // callback type 2: a message from a user
    void *invited;        // callback type 3: an invitation into a channel (ChatInviteArgs)
    void *param;          // user data passed to the callbacks
} ChatGlobalCallbacks;

typedef struct ChatConnection {
    BOOL connected;
    BOOL connecting;           // cleared when the connect attempt ends
    BOOL disconnected;         // the disconnected callback was queued
    void *nickErrorCallback;   // callback type 25: the nick was refused
    void *fillInUserCallback; // when set, the address of the user is asked for first
    void *connectedCallback;   // (chat, success, failureReason, param)
    void *connectParam;        // user data of the three callbacks above
    ChatSocket socket;
    char nick[64];
    char realName[128];
    char user[128];
    int accountSpace;     // login types 1 and 2
    char email[64];       // login type 2
    char accountNick[32]; // login type 2
    char registeredNick[64];
    char password[32];    // login types 1 and 2
    char authTicket[256]; // login type 3
    char partnerKey[256]; // login type 3
    u32 unk_770;
    char serverAddress[128];
    int serverPort;
    ChatGlobalCallbacks globalCallbacks;
    void *channels;           // hash table of ChatChannel
    void *enteringChannels;   // array of ChatChannel records (name only) of channels being entered
    ChatRequest *requests;    // list of the requests waiting for an answer (chat_requests.c)
    ChatRequest *lastRequest; // its last element
    int nextRequestId;        // starts at 1, wraps from 0x7FFFFFFF to 1
    void *callbacks;          // array of ChatCallback
    int unk_824;
    char gameKey[128];
    int loginType; // 0 = nick only, 1 = registered nick, 2 = email and nick, 3 = pre-authenticated
    u32 loginIds[2];
} ChatConnection;

// Handler of one server command (table ciServerMessageHandlers, ciNumServerMessageHandlers entries).
typedef struct ChatServerCommand {
    const char *command;
    void (*handler)(ChatConnection *chat, ChatMessage *message);
} ChatServerCommand;

typedef void (*ChatConnectedFunc)(ChatConnection *chat, BOOL success, int failureReason, void *param);

// Arguments of the nick error callback.
typedef struct ChatNickErrorArgs {
    int type;
    const char *nick;
    int numSuggestedNicks;
    int suggestedNicks;
} ChatNickErrorArgs;

// Arguments of the channel message callback.
typedef struct ChatChannelMessageArgs {
    const char *channel;
    const char *sender;
    const char *message;
    int type; // 0 .. 4, see chatSendChannelMessageA
} ChatChannelMessageArgs;

// Arguments of the channel mode callback.
typedef struct ChatChannelModeArgs {
    BOOL success;
    const char *channel;
    void *mode;
} ChatChannelModeArgs;

typedef void (*ChatEnumUsersFunc)(ChatConnection *chat, BOOL success, const char *channel, int count, ChatChannelUser **users, int *modes, void *param);

typedef struct ChatEnumUsers {
    ChatEnumUsersFunc callback;
    void *param;
} ChatEnumUsers;

// Mode of a channel (the 0x20 bytes of ChatChannel.mode).
typedef struct ChatChannelMode {
    BOOL inviteOnly;
    BOOL private;
    BOOL secret;
    BOOL moderated;
    BOOL noExternalMessages;
    BOOL onlyOpsChangeTopic;
    BOOL opsObeyChannelLimit; // mode letter e
    int limit;   // 0 = none
} ChatChannelMode;

typedef struct ChatBytes2 {
    char bytes[2];
} ChatBytes2;

typedef struct ChatBytes3 {
    char bytes[3];
} ChatBytes3;

// chat_main.c
int ciProcessServerMessage(ChatConnection *chat, ChatMessage *message);
BOOL ciCheckForID(ChatConnection *chat, int id);
void ciHandleDisconnect(ChatConnection *chat, const char *reason);
void ciThink(ChatConnection *chat, int id);
void ciSendNick(ChatConnection *chat);
void ciSendUser(ChatConnection *chat);
void ciSendNickAndUser(ChatConnection *chat);
void ciSendLogin(ChatConnection *chat);
ChatConnection *chatConnectDoit(int loginType, const char *serverAddress, int serverPort, const char *nick, const char *user, const char *realName, int accountSpace, const char *email, const char *accountNick, const char *registeredNick, const char *password, const char *authTicket, const char *partnerKey, const char *gameName, const char *gameKey, const ChatGlobalCallbacks *callbacks, void *nickErrorCallback, void *fillInUserCallback, void *connectedCallback, void *connectParam, BOOL blocking);
ChatConnection *chatConnectSpecialA(const char *serverAddress, int serverPort, const char *nick, const char *realName, const char *gameName, const char *gameKey, const ChatGlobalCallbacks *callbacks, void *nickErrorCallback, void *fillInUserCallback, void *connectedCallback, void *connectParam, BOOL blocking);
void chatRetryWithNickA(ChatConnection *chat, const char *nick);
void chatRegisterUniqueNickA(ChatConnection *chat, int accountSpace, const char *nick, const char *cdKey);
void chatDisconnect(ChatConnection *chat);
void chatThink(ChatConnection *chat);
void chatEnumChannelsA(ChatConnection *chat, const char *filter, void *callbackEach, void *callbackAll, void *param, BOOL blocking);
void chatEnterChannelA(ChatConnection *chat, const char *channel, const char *password, const ChatChannelCallbacks *callbacks, void *callback, void *param, BOOL blocking);
void chatLeaveChannelA(ChatConnection *chat, const char *channel, const char *reason);
void chatSendChannelMessageA(ChatConnection *chat, const char *channel, const char *message, u32 type);
void chatSetChannelModeA(ChatConnection *chat, const char *channel, const ChatChannelMode *mode);
void chatGetChannelModeA(ChatConnection *chat, const char *channel, void *callback, void *param, BOOL blocking);
void chatSetChannelLimitA(ChatConnection *chat, const char *channel, int limit);
int chatGetChannelNumUsersA(ChatConnection *chat, const char *channel);
BOOL chatInChannelA(ChatConnection *chat, const char *channel);
void ciEnumUsersCallback(ChatConnection *chat, const char *channel, int count, ChatChannelUser **users, int *modes, ChatEnumUsers *volatile enumUsers);
void chatEnumUsersA(ChatConnection *chat, const char *channel, ChatEnumUsersFunc callback, void *param, BOOL blocking);
void chatSendUserMessageA(ChatConnection *chat, const char *nick, const char *message, u32 type);
char *ciGetNextCookie(void);
void chatSetChannelKeysA(ChatConnection *chat, const char *channel, const char *nick, int count, const char **keys, const char **values);
BOOL ciSendGetChannelKey(ChatConnection *chat, const char *channel, const char *nick, const char *cookie, int count, const char **keys);
void chatGetChannelKeysA(ChatConnection *chat, const char *channel, const char *nick, int count, const char **keys, void *callback, void *param, BOOL blocking);
int ciNickIsValid(const char *nick);
void ciNickError(ChatConnection *chat, int type, const char *nick, int unk_0C, int unk_10);

// line buffer functions (chat_socket_buffer.c, after chat_main.c)
BOOL ciBufferInit(ChatBuffer *buffer);
void ciBufferFree(ChatBuffer *buffer);
BOOL ciBufferPreAppend(ChatBuffer *buffer, int length);
void ciBufferClipFront(ChatBuffer *buffer, int length);
int ciSocketInit(ChatSocket *socket, const char *name); // name: not used

// chat_socket.c
BOOL ciSocketConnect(ChatSocket *socket, const char *address, int port);
void ciSocketDisconnect(ChatSocket *socket);
void ciSocketSelect(int handle, BOOL *readable, BOOL *writable, BOOL *except);
void ciSocketThinkSend(ChatSocket *socket);
void ciSocketThinkRecv(ChatSocket *socket);
void ciSocketThink(ChatSocket *socket);
BOOL ciSocketSend(ChatSocket *socket, const char *line);
BOOL ciSocketSendf(ChatSocket *socket, const char *format, ...);
BOOL ciParseUser(char *prefix, ChatMessage *message);
BOOL ciAddParam(const char *param, ChatMessage *message);
BOOL ciParseParam(const char *params, ChatMessage *message);
BOOL ciParseMessage(ChatSocket *socket, char *line);

// after chat_socket.c (ciSocketParseNextLine.c)
BOOL ciSocketParseNextLine(ChatSocket *socket);
ChatMessage *ciSocketRecv(ChatSocket *socket);

// request functions defined before chat_main.c
void ciFilterThink(ChatConnection *chat);
int ciGetNextID(ChatConnection *chat);
BOOL ciCheckFiltersForID(ChatConnection *chat, int id);
void ciCleanupFilters(ChatConnection *chat);
int ciAddLISTFilter(ChatConnection *chat, void *callbackEach, void *callbackAll, void *param);
int ciAddJOINFilter(ChatConnection *chat, const char *channel, void *callback, void *param, const ChatChannelCallbacks *callbacks, const char *password);
int ciAddNAMESFilter(ChatConnection *chat, const char *channel, ChatEnumUsersFunc callback, void *param);
int ciAddCMODEFilter(ChatConnection *chat, const char *channel, void *callback, void *param);
int ciAddGETCKEYFilter(ChatConnection *chat, const char *cookie, int count, const char **keys, BOOL allUsers, BOOL broadcastKeys, void *callback, void *param);
int ciAddGETCHANKEYFilter(ChatConnection *chat, const char *cookie, int count, const char **keys, BOOL broadcastKeys, void *callback, void *param);

// OVY_0 network library functions used by chat_main.c and chat_socket.c
int GSISocketSelect(int socket, int *readable, int *writable, int *except);
int gsSocketCreate(int domain, int type, int protocol);
void gsSocketClose(int socket);
void gsSocketShutdown(int socket, int how);
int gsSocketConnect(int socket, const ChatSocketAddress *address, int length);
int gsSocketRecv(int socket, void *buf, int len, int flags);
int gsSocketSend(int socket, const char *buf, int len, int flags);
int gsSocketInetAddr(const char *address);
void MD5Digest(const void *data, int length, char *out);
void msleep(int milliseconds);
void SocketStartUp(void);
void SocketShutDown(void);

// command handler table
extern ChatServerCommand ciServerMessageHandlers[];
extern int ciNumServerMessageHandlers;

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_CHAT_CONNECTION_H
