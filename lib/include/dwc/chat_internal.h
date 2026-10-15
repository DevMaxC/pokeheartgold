#ifndef POKEHEARTGOLD_LIB_INCLUDE_DWC_CHAT_INTERNAL_H
#define POKEHEARTGOLD_LIB_INCLUDE_DWC_CHAT_INTERNAL_H

// Chat client of the OVY_45 network library (src/chat_callbacks.c, src/chat_channel.c, src/chat_cipher.c,
// ...): the connection object, the queue of pending user callbacks and the table of joined channels with their
// users.

// A user callback waiting to be called: its kind, the function, a heap copy of its arguments (an array
// of words; string arguments are duplicated) and the user data passed back to it.
typedef struct ChatCallback {
    int type; // 0 .. 31, selects the argument layout
    void *callback;
    void *param; // u32 array of the arguments
    void *user;
    int id;        // 0 = not tied to a request
    char *channel; // NULL = not tied to a channel
} ChatCallback;

// The callback signatures by number of word arguments (connection first, user data last).
typedef void (*ChatCallbackFunc1)(void *, u32, void *);
typedef void (*ChatCallbackFunc2)(void *, u32, u32, void *);
typedef void (*ChatCallbackFunc3)(void *, u32, u32, u32, void *);
typedef void (*ChatCallbackFunc4)(void *, u32, u32, u32, u32, void *);
typedef void (*ChatCallbackFunc5)(void *, u32, u32, u32, u32, u32, void *);
typedef void (*ChatCallbackFunc6)(void *, u32, u32, u32, u32, u32, u32, void *);
typedef void (*ChatCallbackFunc7)(void *, u32, u32, u32, u32, u32, u32, u32, void *);

// Success flag of some chat functions (an enum, not BOOL: the conditional selects are emitted in a
// different order for an int result).
typedef enum ChatResult {
    CHAT_FAILURE,
    CHAT_SUCCESS,
} ChatResult;

// Callbacks the user registered for one channel (copied into the channel when it is entered).
typedef struct ChatChannelCallbacks {
    void *message;         // callback type 4: a message to the channel (ChatChannelMessageArgs)
    void *kicked;          // callback type 5: the own user was kicked (ChatKickedArgs)
    void *userJoined;      // callback type 6: a user entered the channel (ChatUserJoinedArgs)
    void *userLeft;        // callback type 7: a user left the channel (ChatUserLeftArgs)
    void *nickChanged;     // callback type 8: a user of the channel changed the nick
    void *topicChanged;    // callback type 9: the topic changed (ChatTopicArgs)
    void *modeChanged;     // callback type 10: the mode of the channel changed (ChatChannelModeChangedArgs)
    void *userModeChanged; // callback type 11: a user's mode in the channel changed
    void *usersChanged;    // callback type 12: the user list changed (argument: the channel)
    void *unk_24;
    void *broadcastKeyChanged; // callback type 28: a broadcast key changed (ChatBroadcastKeyArgs)
    void *param;               // user data passed to the callbacks
} ChatChannelCallbacks;

// A user in a channel (element of ChatChannel.users, keyed by the nick).
typedef struct ChatChannelUser {
    char nick[128];
    char user[24];
    char address[64];
    BOOL hasUserInfo; // user and address are known
    int mode;         // 0 .. 3
} ChatChannelUser;

// A joined channel (element of ChatConnection.channels, keyed by the name).
typedef struct ChatChannel {
    char name[257];
    u8 unk_101[3];
    ChatChannelCallbacks callbacks;
    void *users; // hash table of ChatChannelUser
    u8 mode[32];
    BOOL hasMode; // mode is valid
    char *topic;
    BOOL joined;
    char key[128];
} ChatChannel;

// State of the connection's stream cipher (chat_cipher.c).
typedef struct ChatCipher {
    u8 state[256];
    u8 x;
    u8 y;
} ChatCipher;

#include "dwc/chat_connection.h"

// The users of a channel, collected for a ChatUserListFunc.
typedef struct ChatUserList {
    ChatConnection *chat;
    int count;
    ChatChannelUser **users;
    int *modes;
} ChatUserList;

typedef void (*ChatUserListFunc)(ChatConnection *chat, const char *channel, int count, ChatChannelUser **users, int *modes, int param);
typedef void (*ChatUserSearchFunc)(ChatConnection *chat, const char *nick, ChatChannel *channel, void *param);

// Search of one nick in all channels.
typedef struct ChatUserSearch {
    ChatConnection *chat;
    char *nick;
    ChatUserSearchFunc callback;
    void *param;
    char buffer[sizeof(ChatChannelUser)];
} ChatUserSearch;

typedef struct ChatNickChange {
    ChatConnection *chat;
    const char *oldNick;
    const char *newNick;
} ChatNickChange;

// Arguments of the nick changed callback.
typedef struct ChatNickChangeArgs {
    const char *channel;
    const char *oldNick;
    const char *newNick;
} ChatNickChangeArgs;

// Arguments of the user mode changed callback.
typedef struct ChatUserModeArgs {
    const char *channel;
    const char *nick;
    int mode;
} ChatUserModeArgs;

typedef struct ChatUserInfo {
    const char *nick;
    const char *user;
    const char *address;
} ChatUserInfo;

// chat_callbacks.c
void ciFreeCallbackData(ChatCallback *callback);
ChatResult ciInitCallbacks(ChatConnection *chat);
void ciCleanupCallbacks(ChatConnection *chat);
BOOL ciAddCallback_(ChatConnection *chat, int type, void *func, u32 *src, void *user, int id, char *channel, int size);
void ciCallCallback(ChatConnection *chat, ChatCallback *callback);
void ciCallCallbacks(ChatConnection *chat, int id);
int ciGetCallbackIndexByID(ChatConnection *chat, int id);
ChatResult ciCheckCallbacksForID(ChatConnection *chat, int id);

// Defined before chat_callbacks.c: frees one queued callback (array element destructor).
void ciCallbacksArrayElementFreeFn(void *element);

// chat_channel.c
int ciHashString(const signed char *s, int numBuckets);
ChatChannel *ciGetChannel(ChatConnection *chat, const char *channel);
int ciChannelTableHashFn(const void *element, int numBuckets);
int ciChannelTableCompareFn(const void *first, const void *second);
void ciChannelTableElementFreeFn(void *element);
int ciUserTableHashFn(const void *element, int numBuckets);
int ciUserTableCompareFn(const void *first, const void *second);
void ciUserTableElementFreeFn(void *element);
BOOL ciInitChannels(ChatConnection *chat);
void ciCleanupChannels(ChatConnection *chat);
void ciChannelEntering(ChatConnection *chat, const char *channel);
int ciEnteringChannelCompareFn(const void *a, const void *b);
BOOL ciIsEnteringChannel(ChatConnection *chat, const char *channel);
void ciChannelEntered(ChatConnection *chat, const char *name, const ChatChannelCallbacks *callbacks);
void ciChannelLeft(ChatConnection *chat, const char *name);
ChatChannelCallbacks *ciGetChannelCallbacks(ChatConnection *chat, const char *name);
void ciChannelListUsersMap(void *element, void *arg);
void ciChannelListUsers(ChatConnection *chat, const char *name, ChatUserListFunc callback, int param);
BOOL ciInChannel(ChatConnection *chat, const char *name);
BOOL ciGetChannelMode(ChatConnection *chat, const char *name, void *mode);
void ciSetChannelMode(ChatConnection *chat, const char *name, const void *mode);
void ciSetChannelPassword(ChatConnection *chat, const char *name, const char *topic);
void ciJoinCallbackCalled(ChatConnection *chat, const char *name);
BOOL ciWasJoinCallbackCalled(ChatConnection *chat, const char *name);
void ciSetChannelTopic(ChatConnection *chat, const char *name, const char *key);
int ciGetChannelNumUsers(ChatConnection *chat, const char *name);
void ciUserEnteredChannel(ChatConnection *chat, const char *nick, const char *name, int mode, const char *user, const char *address);
void ciUserLeftChannel(ChatConnection *chat, const char *nick, const char *name);
void ciUserEnumChannelsMap(void *element, void *arg);
void ciUserEnumChannels(ChatConnection *chat, const char *nick, ChatUserSearchFunc callback, void *param);
void ciUserChangeNickMap(void *element, void *arg);
void ciUserChangedNick(ChatConnection *chat, const char *oldNick, const char *newNick);
void ciUserChangedMode(ChatConnection *chat, const char *nick, const char *name, int mode, BOOL set);
void ciSetUserBasicInfoMap(void *element, void *arg);
void ciSetUserBasicInfo(ChatConnection *chat, const char *nick, const char *user, const char *address);

// chat_cipher.c
void gs_prepare_key(const u8 *key, int keyLength, ChatCipher *cipher);
void gs_crypt(u8 *data, int length, ChatCipher *cipher);
void gs_xcode_buf(s8 *data, int length, const s8 *key);

#define CHAT_REQUEST_TYPE_COUNT 17

// A request sent to the server whose answer is still awaited (element of ChatConnection.requests).
struct ChatRequest {
    int type;       // 0 .. 16, selects data and the callback type (ciFinishFilter)
    u32 expireTime; // current_time time after which the request is ended without an answer
    char *name;     // e.g. the channel or the nick
    char *name2;
    void *callback;  // request type 0: called for each channel of the list
    void *callback2; // request type 0: called with the whole list at the end
    void *param;     // user data passed to the callback
    void *data;      // ChatRequestData, results collected so far
    int id;
    ChatRequest *next;
};

// Key of ciFindFilter.
typedef struct ChatRequestKey {
    int type;
    const char *name;
    const char *name2;
} ChatRequestKey;

// Request type 0: the channels collected so far.
typedef struct ChatChannelListData {
    BOOL started; // the start of the list (321) was received
    int count;
    char **names;
    int *numUsers;
    char **topics;
} ChatChannelListData;

// Request type 1: entering a channel.
typedef struct ChatEnterData {
    ChatChannelCallbacks callbacks;
    BOOL joined; // the JOIN of the own user was received
    char password[32];
} ChatEnterData;

// Request types 3 and 15: the nicks collected so far.
typedef struct ChatNickListData {
    int capacity; // size of nicks and modes
    int count;
    char **nicks;
    int *modes;
} ChatNickListData;

// Request type 4: a WHOIS of a nick.
typedef struct ChatWhoisData {
    char *user;
    char *realName;
    char *address;
    int channelCount;
    char **channels;
} ChatWhoisData;

// Request type 7: a ban by nick (the address of the nick is asked for first).
typedef struct ChatBanData {
    char *channel;
} ChatBanData;

// Request type 8: the ban list of a channel.
typedef struct ChatBanListData {
    int count;
    char **bans;
} ChatBanListData;

// Request types 12, 13 and 14: keys.
typedef struct ChatKeysData {
    int count;
    char **keys;

    union {
        char *channel;      // type 12: all users of the channel (NULL = one user)
        BOOL allUsers;      // type 13
        BOOL broadcastKeys; // type 14
    } arg;

    BOOL broadcastKeys; // type 13
} ChatKeysData;

typedef union ChatRequestData {
    ChatChannelListData channels;
    ChatEnterData enter;
    ChatNickListData nicks;
    ChatWhoisData whois;
    ChatBanData ban;
    ChatBanListData banList;
    ChatKeysData keys;
} ChatRequestData;

// Channel mode letters (ciParseMode).
enum ChatModeType {
    CHAT_MODE_END = 0,
    CHAT_MODE_BAN,                   // b
    CHAT_MODE_INVITE_ONLY,           // i
    CHAT_MODE_LIMIT,                 // l
    CHAT_MODE_PRIVATE,               // p
    CHAT_MODE_SECRET,                // s
    CHAT_MODE_KEY,                   // k
    CHAT_MODE_MODERATED,             // m
    CHAT_MODE_NO_EXTERNAL_MESSAGES,  // n
    CHAT_MODE_ONLY_OPS_CHANGE_TOPIC, // t
    CHAT_MODE_OP,                    // o
    CHAT_MODE_VOICE,                 // v
    CHAT_MODE_U,                     // u
    CHAT_MODE_W,                     // w
    CHAT_MODE_E,                     // e
};

// One change of a parsed channel mode string.
typedef struct ChatModeChange {
    int type; // ChatModeType
    BOOL set;
    const char *arg; // letters b, k, l, o and v
} ChatModeChange;

// chat_requests.c
ChatRequest *ciFindFilter(ChatConnection *chat, int count, const ChatRequestKey *keys);
ChatRequest *ciFindGetKeyFilter(ChatConnection *chat, const char *channel);
void ciDestroyFilter(ChatRequest *request);
void ciRemoveFilter(ChatConnection *chat, ChatRequest *target);
void ciFinishFilter(ChatConnection *chat, ChatRequest *request, u32 *results);
void ciFilterTimedout(ChatConnection *chat, ChatRequest *request);
int ciAddFilter(ChatConnection *chat, int type, const char *name, const char *name2, void *callback, void *callback2, void *param, void *data);
ChatModeChange *ciParseMode(const char *modes, const char **args, int argCount);
void ciApplyChangesToMode(ChatChannelMode *mode, ChatModeChange *changes);

// Message types of the message callbacks (server commands PRIVMSG, CTCP ACTION, NOTICE, UTM, ATM).
enum ChatMessageType {
    CHAT_MESSAGE_NORMAL,
    CHAT_MESSAGE_ACTION,
    CHAT_MESSAGE_NOTICE,
    CHAT_MESSAGE_UTM,
    CHAT_MESSAGE_ATM,
};

// Why a user left a channel (ChatUserLeftArgs.reason: server commands PART, QUIT, KICK, KILL).
enum ChatUserLeftReason {
    CHAT_LEFT_PART,
    CHAT_LEFT_QUIT,
    CHAT_LEFT_KICK,
    CHAT_LEFT_KILL,
};

// Arguments of the private message callback (ChatGlobalCallbacks.privateMessage).
typedef struct ChatPrivateMessageArgs {
    const char *nick; // NULL for a message from the server
    const char *message;
    int type; // ChatMessageType
} ChatPrivateMessageArgs;

// Arguments of the invited callback (ChatGlobalCallbacks.invited, callback type 3).
typedef struct ChatInviteArgs {
    const char *channel;
    const char *nick;
} ChatInviteArgs;

// Arguments of the kicked callback (ChatChannelCallbacks.kicked).
typedef struct ChatKickedArgs {
    const char *channel;
    const char *kicker;
    const char *reason;
} ChatKickedArgs;

// Arguments of the user joined callback (ChatChannelCallbacks.userJoined).
typedef struct ChatUserJoinedArgs {
    const char *channel;
    const char *nick;
    int mode; // 0 .. 2
} ChatUserJoinedArgs;

// Arguments of the user left callback (ChatChannelCallbacks.userLeft).
typedef struct ChatUserLeftArgs {
    const char *channel;
    const char *nick;
    int reason;          // ChatUserLeftReason
    const char *message; // part / quit message or reason
    const char *kicker;  // CHAT_LEFT_KICK
} ChatUserLeftArgs;

// Arguments of the topic changed callback (ChatChannelCallbacks.topicChanged).
typedef struct ChatTopicArgs {
    const char *channel;
    const char *topic;
} ChatTopicArgs;

// Arguments of the mode changed callback (ChatChannelCallbacks.modeChanged).
typedef struct ChatChannelModeChangedArgs {
    const char *channel;
    ChatChannelMode *mode;
} ChatChannelModeChangedArgs;

// Arguments of the broadcast key changed callback (ChatChannelCallbacks.broadcastKeyChanged).
typedef struct ChatBroadcastKeyArgs {
    const char *channel;
    const char *nick; // NULL for a key of the channel
    const char *key;
    const char *value;
} ChatBroadcastKeyArgs;

// Arguments of the per channel callback of a channel list request (ChatRequest.callback, callback type 13).
typedef struct ChatChannelListEntryArgs {
    BOOL success;
    int index;
    const char *channel;
    const char *topic;
    int numUsers;
    int unk_14;
} ChatChannelListEntryArgs;

// ChatConnection.fillInUserCallback: gets the own address (from the 302 reply) and may write a user name.
typedef void (*ChatFillInUserFunc)(ChatConnection *chat, int address, char *user, void *param);

// Result of an enter request (request type 1, second result word).
enum ChatEnterResult {
    CHAT_ENTER_SUCCESS,
    CHAT_ENTER_NO_SUCH_CHANNEL,   // 403
    CHAT_ENTER_CHANNEL_FULL,      // 471
    CHAT_ENTER_INVITE_ONLY,       // 473
    CHAT_ENTER_BANNED,            // 474
    CHAT_ENTER_BAD_PASSWORD,      // 475
    CHAT_ENTER_TOO_MANY_CHANNELS, // 405
    CHAT_ENTER_TIMED_OUT,         // no answer
    CHAT_ENTER_BAD_CHANNEL_NAME,  // 476
};

// chat_handlers.c (server line handlers, table ciServerMessageHandlers)
void ciPrivmsgHandler(ChatConnection *chat, ChatMessage *message);
void ciNoticeHandler(ChatConnection *chat, ChatMessage *message);
void ciUTMHandler(ChatConnection *chat, ChatMessage *message);
void ciATMHandler(ChatConnection *chat, ChatMessage *message);
void ciPingHandler(ChatConnection *chat, ChatMessage *message);
void ciNickHandler(ChatConnection *chat, ChatMessage *message);
void ciJoinHandler(ChatConnection *chat, ChatMessage *message);
void ciPartHandler(ChatConnection *chat, ChatMessage *message);
void ciKickHandler(ChatConnection *chat, ChatMessage *message);
void ciQuitEnumChannelsCallback(ChatConnection *chat, const char *nick, ChatChannel *channel, void *param);
void ciQuitHandler(ChatConnection *chat, ChatMessage *message);
void ciKillEnumChannelsCallback(ChatConnection *chat, const char *nick, ChatChannel *channel, void *param);
void ciKillHandler(ChatConnection *chat, ChatMessage *message);
void ciTopicHandler(ChatConnection *chat, ChatMessage *message);
void ciModeHandler(ChatConnection *chat, ChatMessage *message);
void ciErrorHandler(ChatConnection *chat, ChatMessage *message);
void ciInviteHandler(ChatConnection *chat, ChatMessage *message);
void ciNameReplyHandler(ChatConnection *chat, ChatMessage *message);
void ciEndOfNamesHandler(ChatConnection *chat, ChatMessage *message);
void ciRplTopicHandler(ChatConnection *chat, ChatMessage *message);
void ciRplNoTopicHandler(ChatConnection *chat, ChatMessage *message);
void ciErrNickInUseHandler(ChatConnection *chat, ChatMessage *message);
void ciRplWhoReplyHandler(ChatConnection *chat, ChatMessage *message);
void ciRplEndOfWhoHandler(ChatConnection *chat, ChatMessage *message);
char *ciParseValue(const char *text, int *length);
void ciRplGetKeyHandler(ChatConnection *chat, ChatMessage *message);
void ciRplEndGetKeyHandler(ChatConnection *chat, ChatMessage *message);
void ciRplGetCKeyHandler(ChatConnection *chat, ChatMessage *message);
void ciRplEndGetCKeyHandler(ChatConnection *chat, ChatMessage *message);
void ciRplGetChanKeyHandler(ChatConnection *chat, ChatMessage *message);
void ciRplUserIPHandler(ChatConnection *chat, ChatMessage *message);
void ciRplListStartHandler(ChatConnection *chat, ChatMessage *message);
void ciRplListHandler(ChatConnection *chat, ChatMessage *message);
void ciRplListEndHandler(ChatConnection *chat, ChatMessage *message);
void ciRplChannelModeIsHandler(ChatConnection *chat, ChatMessage *message);
void ciRplWhoisUserHandler(ChatConnection *chat, ChatMessage *message);
void ciRplWhoisChannelsHandler(ChatConnection *chat, ChatMessage *message);
void ciRplEndOfWhoisHandler(ChatConnection *chat, ChatMessage *message);
void ciRplBanListHandler(ChatConnection *chat, ChatMessage *message);
void ciRplEndOfBanListHandler(ChatConnection *chat, ChatMessage *message);
void ciRplWelcomeHandler(ChatConnection *chat, ChatMessage *message);
void ciRplSecureKeyHandler(ChatConnection *chat, ChatMessage *message);
void ciRplCDKeyHandler(ChatConnection *chat, ChatMessage *message);
void ciRplLoginHandler(ChatConnection *chat, ChatMessage *message);
void ciErrNoSuchChannelHandler(ChatConnection *chat, ChatMessage *message);
void ciErrTooManyChannelsHandler(ChatConnection *chat, ChatMessage *message);
void ciErrChannelIsFullHandler(ChatConnection *chat, ChatMessage *message);
void ciErrInviteOnlyChanHandler(ChatConnection *chat, ChatMessage *message);
void ciErrBannedFromChanHandler(ChatConnection *chat, ChatMessage *message);
void ciErrBadChannelKeyHandler(ChatConnection *chat, ChatMessage *message);
void ciErrBadChanMaskHandler(ChatConnection *chat, ChatMessage *message);
void ciErrNoSuchNickHandler(ChatConnection *chat, ChatMessage *message);
void ciErrErroneusNicknameHandler(ChatConnection *chat, ChatMessage *message);
void ciErrLoginFailedHandler(ChatConnection *chat, ChatMessage *message);
void ciErrNoUniqueNickHandler(ChatConnection *chat, ChatMessage *message);
void ciErrUniqueNickExpiredHandler(ChatConnection *chat, ChatMessage *message);
void ciErrRegisterNickFailedHandler(ChatConnection *chat, ChatMessage *message);

// OVY_0 network library functions used by the chat client
u32 current_time(void);
void *DWCi_GsMalloc(int size);
void *DWCi_GsRealloc(void *ptr, int size);
void DWCi_GsFree(void *ptr);
void *ArrayNew(int elemSize, int count, void (*freeElement)(void *));
void ArrayFree(void *array);
void *ArrayNth(void *array, int i);
void ArrayAppend(void *array, void *elem);
void ArrayRemoveAt(void *array, int i);
void ArrayDeleteAt(void *array, int i);
int ArraySearch(void *array, const void *key, int (*compare)(const void *, const void *), int start, int sorted);
void *TableNew2(int elemSize, int numBuckets, int unused, int (*hash)(const void *, int), int (*compare)(const void *, const void *), void (*freeElement)(void *));
void TableFree(void *table);
int TableCount(void *table);
void TableEnter(void *table, void *elem);
int TableRemove(void *table, void *elem);
void *TableLookup(void *table, const void *key);
void TableMap(void *table, void (*func)(void *element, void *arg), void *arg);
int ArrayLength(void *array);
char *goastrdup(const char *str);

// MSL functions without a header here
int strnicmp(const char *a, const char *b);
extern u8 __lower_mapC[];

#endif // POKEHEARTGOLD_LIB_INCLUDE_DWC_CHAT_INTERNAL_H
