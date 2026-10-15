#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/dwc_main_internal.h"
#include "dwc/net_common_internal.h"
#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

#pragma warn_unusedvar off
#pragma warn_uninitializedvar off

// Log-in: authentication with the Nintendo server (unless the user data holds an authenticated login
// id), connecting to the GameSpy presence server with the token, and checking that the profile is the
// one stored in the user data (a temporary login id is replaced by the real one on the first log-in).

extern char sStr_Empty_3[]; // ""

extern int gt2GetSocketSOCKET(void *socket);
extern int gsSocketGetLastError(int error);
extern void DWCi_TransportPingCallback(void *connection, void *data, int size, int unused);
extern int gpProcess(GPConnection *connection);
extern int gpConnectPreAuthenticatedA(GPConnection *connection, const char *token, const char *challenge, int flag, int unused, GPCallback callback, void *param);
extern void gpDisconnect(GPConnection *connection);
extern int gpGetInfo(GPConnection *connection, int profileId, int unk_02, int unk_03, GPCallback callback, void *param);
extern int gpSetInfosA(GPConnection *connection, int info, const char *value);

void DWCi_GT2PingCallback(void *connection, void *data, int size, int unused) {
    DWCi_TransportPingCallback(connection, data, size, unused);
}

// GT2 socket error.
void DWCi_GT2SocketErrorCallback(void *socket) {
    int error = gsSocketGetLastError(gt2GetSocketSOCKET(socket));
    ((int *)&gDwcControl)[1] = error;
    DWCi_SetError(9, -97003);
    gDwcControl->socket = NULL;
}

void DWCi_LoginInit(LoginState *login, DwcUserData *userData, GPConnection *connection, int productId, u32 gameCode, u16 *playerName, DwcResultCallback callback, void *param) {
    gDwcLogin.state = login;
    MI_CpuFill8(login, 0, sizeof(LoginState));
    gDwcLogin.state->connection = connection;
    gDwcLogin.state->state = 0;
    gDwcLogin.state->productId = productId;
    gDwcLogin.state->gameCode = gameCode;
    gDwcLogin.state->playerName = playerName;
    gDwcLogin.state->callback = callback;
    gDwcLogin.state->param = param;
    gDwcLogin.state->userData = userData;
}

void DWCi_LoginAsync(void) {
    DWCi_StartAuth(DWCi_LoginAuthCallback, NULL);
    gDwcLogin.state->state = 1;
    gDwcLogin.state->pending = 0;
}

void DWCi_LoginProcess(void) {
    LoginState *login = gDwcLogin.state;
    if (!login) {
        return;
    }
    if (DWCi_IsError()) {
        return;
    }
    login = gDwcLogin.state;
    switch (login->state) {
    case 0:
    case 5:
        break;
    case 1:
        DWCi_ProcessAuth();
        break;
    case 2:
    case 3:
    case 4:
        if (login->connection && *login->connection) {
            gpProcess(login->connection);
        }
        if (gDwcLogin.state->pending) {
            if (((OS_GetTick() - gDwcLogin.state->connectTick) << 6) / 33514 > 60000) {
                DWCi_StopLogin(6, -61070);
                gDwcLogin.state->pending = 0;
            }
        }
        break;
    }
}

DwcUserData *DWCi_GetUserData(void) {
    return gDwcLogin.state ? gDwcLogin.state->userData : NULL;
}

// Log-in failed.
void DWCi_StopLogin(int kind, int code) {
    if (!gDwcLogin.state || !kind) {
        return;
    }
    DWCi_SetError(kind, code);
    if (gDwcLogin.state->callback) {
        gDwcLogin.state->callback(kind, 0, gDwcLogin.state->param);
    }
    DWCi_ResetLogin();
}

void DWCi_ShutdownLogin(void) {
    if (gDwcLogin.state->auth) {
        DWCi_Auth_Abort();
        DWCi_Auth_Destroy();
        DWC_Free(0, gDwcLogin.state->auth, 0);
        gDwcLogin.state->auth = NULL;
    }
    gDwcLogin.state = NULL;
}

void DWCi_ResetLogin(void) {
    if (!gDwcLogin.state) {
        return;
    }
    gDwcLogin.state->state = 0;
    gDwcLogin.state->pending = 0;
}

// Reports a GameSpy presence error during the log-in.
int DWCi_LoginHandleGPError(int error) {
    int kind, code;
    if (!error) {
        return GP_NO_ERROR;
    }
    switch (error) {
    case GP_MEMORY_ERROR:
        kind = 9;
        code = -1;
        break;
    case GP_PARAMETER_ERROR:
        kind = 9;
        code = -2;
        break;
    case GP_NETWORK_ERROR:
        kind = 6;
        code = -10;
        break;
    case GP_SERVER_ERROR:
        kind = 6;
        code = -20;
        break;
    }
    DWCi_StopLogin(kind, code - 61000);
    return error;
}

// Reply to the connect request.
void DWCi_GPConnectCallback(GPConnection *connection, void *arg, void *param) {
    LoginConnectResult *result = arg;
    gDwcLogin.state->pending = 0;
    if (result->result == 0) {
        {
            LoginConnectResult *source = result;
            LoginConnectResult *dest = &gDwcLogin.state->response;
            *dest = *source;
        }
        if (gDwcLogin.state->state == 2) {
            if (gDwcLogin.state->userData->gsProfileId == result->profileId) {
                int error;
                gDwcLogin.state->state = 5;
                error = DWCi_SetGPStatus(DWC_STATUS_ONLINE, sStr_Empty_3, NULL);
                if (DWCi_LoginHandleGPError(error)) {
                    return;
                }
                gDwcLogin.state->callback(0, result->profileId, gDwcLogin.state->param);
                if (DWCi_CreateGT2Socket()) {
                    return;
                }
                if (DWCi_QR2Startup(result->profileId)) {
                    return;
                }
            } else {
                DWCi_StopLogin(6, -60000);
            }
        } else if (gDwcLogin.state->state == 3) {
            int error = gpGetInfo(connection, result->profileId, 0, 0, DWCi_GPGetInfoCallback, NULL);
            if (DWCi_LoginHandleGPError(error)) {
                return;
            }
        }
    } else {
        DWCi_LoginHandleGPError(result->result);
    }
}

void DWCi_LoginAuthCallback(const char *token, const char *challenge, void *param) {
    DWCi_GPConnect(token, challenge, DWCi_GPConnectCallback, 2);
}

void DWCi_GPConnect(const char *token, const char *challenge, GPCallback callback, int state) {
    LoginState *login;
    strcpy(gDwcLogin.state->token, token);
    strcpy(gDwcLogin.state->challenge, challenge);
    login = gDwcLogin.state;
    login->connectTick = OS_GetTick();
    login->pending = 1;
    if (DWCi_LoginHandleGPError(gpConnectPreAuthenticatedA(gDwcLogin.state->connection, gDwcLogin.state->token, gDwcLogin.state->challenge, 1, 0, callback, NULL)) == 0) {
        gDwcLogin.state->state = state;
    }
}

// Starts the authentication; callback gets the token and challenge.
void DWCi_StartAuth(void (*callback)(const char *token, const char *challenge, void *param), void *param) {
    AuthParams params;
    NasHttp *auth;
    MI_CpuFill8(&params, 0, sizeof(params));
    gDwcLogin.authCallback = callback;
    gDwcLogin.authParam = param;
    if (DWCi_Acc_IsAuthentic(gDwcLogin.state->userData)) {
        DWCi_Acc_LoginIdToUserName(&gDwcLogin.state->userData->loginId, gDwcLogin.state->userData->gameCode, gDwcLogin.state->userName);
    } else {
        if (!DWCi_Acc_IsValidLoginId(&gDwcLogin.state->loginId)) {
            if (DWCi_Acc_CheckConsoleUserId(&gDwcLogin.state->userData->tempLoginId)) {
                gDwcLogin.state->loginId = gDwcLogin.state->userData->tempLoginId;
            } else {
                DWCi_Acc_CreateTempLoginId(&gDwcLogin.state->loginId);
            }
        } else {
            DWCi_Acc_SetPlayerId(&gDwcLogin.state->loginId, (u32)((OS_GetTick() * 0x5D588B656C078965 + 0x269EC3) >> 32));
        }
        DWCi_Acc_LoginIdToUserName(&gDwcLogin.state->loginId, gDwcLogin.state->gameCode, gDwcLogin.state->userName);
    }
    MI_CpuCopy8(gDwcLogin.state->playerName, params.ingamesn, DWCi_WStrLen(gDwcLogin.state->playerName) * 2 + 2);
    strcpy(params.gsbrcd, gDwcLogin.state->gsbrcd);
    params.alloc = (NasAllocFunc)DWC_Alloc;
    params.free = (NasFreeFunc)DWC_Free;
    auth = DWC_AllocEx(0, sizeof(NasHttp), 4);
    gDwcLogin.state->auth = auth;
    gDwcLogin.state->authTick = OS_GetTick();
    DWCi_Auth_Start(&params, auth);
}

// Polls the authentication.
void DWCi_ProcessAuth(void) {
    AuthResult success, failure;
    AuthParams params;
    if (DWCi_Auth_GetState() == 21) {
        DWCi_Auth_GetResult(&success);
        strcpy(gDwcLogin.state->token, success.token);
        strcpy(gDwcLogin.state->challenge, success.challenge);
        DWCi_Auth_Destroy();
        DWC_Free(0, gDwcLogin.state->auth, 0);
        gDwcLogin.state->auth = NULL;
        if (DWCi_Acc_IsAuthentic(gDwcLogin.state->userData)) {
            gDwcLogin.authCallback(gDwcLogin.state->token, gDwcLogin.state->challenge, gDwcLogin.authParam);
            return;
        }
        DWCi_GPConnect(gDwcLogin.state->token, gDwcLogin.state->challenge, DWCi_GPConnectCallback, 3);
        return;
    }
    if (DWCi_Auth_GetState() == 0) {
        return;
    }
    if (((OS_GetTick() - gDwcLogin.state->authTick) << 6) / 33514 > 10000) {
        DWCi_Auth_GetResult(&failure);
        DWCi_Auth_Destroy();
        DWC_Free(0, gDwcLogin.state->auth, 0);
        gDwcLogin.state->auth = NULL;
        DWCi_StopLogin(2, failure.error);
        return;
    }
    // retry
    DWCi_Auth_Destroy();
    MI_CpuFill8(&params, 0, sizeof(params));
    MI_CpuCopy8(gDwcLogin.state->playerName, params.ingamesn, DWCi_WStrLen(gDwcLogin.state->playerName) * 2 + 2);
    strcpy(params.gsbrcd, gDwcLogin.state->gsbrcd);
    params.alloc = (NasAllocFunc)DWC_Alloc;
    params.free = (NasFreeFunc)DWC_Free;
    DWCi_Auth_Start(&params, gDwcLogin.state->auth);
}

// Profile information of the logged-in profile: checks its user name against the login id.
void DWCi_GPGetInfoCallback(GPConnection *connection, void *arg, void *param) {
    FriendProfileInfo *info = arg;
    int error;
    char tempUserName[21], userName[21], unused[21];
    if (info->result) {
        return;
    }
    if (gDwcLogin.state->state == 3) {
        if (info->userName[0] == 0) {
            DWCi_Acc_LoginIdToUserName(&gDwcLogin.state->userData->tempLoginId, gDwcLogin.state->gameCode, tempUserName);
            error = gpSetInfosA(connection, 0x705, tempUserName);
            if (DWCi_LoginHandleGPError(error)) {
                return;
            }
            gDwcLogin.state->state = 4;
            error = gpGetInfo(connection, info->profileId, 0, 0, DWCi_GPGetInfoCallback, NULL);
            if (DWCi_LoginHandleGPError(error)) {
                return;
            }
        } else {
            gpDisconnect(connection);
            DWCi_StartAuth(DWCi_LoginAuthCallback, NULL);
            gDwcLogin.state->state = 1;
        }
    } else if (gDwcLogin.state->state == 4) {
        DWCi_Acc_LoginIdToUserName(&gDwcLogin.state->userData->tempLoginId, gDwcLogin.state->gameCode, userName);
        if (strcmp(info->userName, userName) == 0) {
            DWCi_Acc_LoginIdToUserName(&gDwcLogin.state->loginId, gDwcLogin.state->gameCode, unused);
            DWCi_Acc_SetLoginIdToUserData(gDwcLogin.state->userData, &gDwcLogin.state->loginId, info->profileId);
            gDwcLogin.state->state = 2;
            DWCi_GPConnectCallback(connection, &gDwcLogin.state->response, NULL);
        } else {
            error = gpGetInfo(connection, info->profileId, 0, 0, DWCi_GPGetInfoCallback, NULL);
            if (DWCi_LoginHandleGPError(error)) {
                return;
            }
        }
    }
}
