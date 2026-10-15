#pragma force_active on
#include <string.h>

#include "global.h"

#include "dwc/gp_internal.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>

// Presence connection: the rest of "gpiInfo.c" (setting the own profile info through "\updatepro\" /
// "\updateui\", "\getprofile\", the profile info cache) and "gpiOperation.c" (the pending operations:
// create, find, process the replies, fail, destroy).

extern const char sKey_profileid_2[]; // "\\profileid\\"
extern const char sKey_nick_2[]; // "\\nick\\"
extern const char sKey_uniquenick_2[]; // "\\uniquenick\\"
extern const char sKey_email_2[]; // "\\email\\"
extern const char sKey_firstname[]; // "\\firstname\\"
extern const char sKey_lastname[]; // "\\lastname\\"
extern const char sKey_icquin[]; // "\\icquin\\"
extern const char sKey_homepage[]; // "\\homepage\\"
extern const char sKey_zipcode[]; // "\\zipcode\\"
extern const char sKey_countrycode[]; // "\\countrycode\\"
extern const char sKey_sex[]; // "\\sex\\"
extern const char sKey_aim[]; // "\\aim\\"
extern const char sKey_pic[]; // "\\pic\\"
extern const char sKey_occ[]; // "\\occ\\"
extern const char sKey_ind[]; // "\\ind\\"
extern const char sKey_inc[]; // "\\inc\\"
extern const char sKey_mar[]; // "\\mar\\"
extern const char sKey_chc[]; // "\\chc\\"
extern const char sKey_i1[]; // "\\i1\\"
extern const char sStr_OutOfMemory_6[]; // "Out of memory."
extern const char sStr_UpdateproSesskey[]; // "\\updatepro\\\\sesskey\\"
extern const char sKey_final_5[]; // "\\final\\"
extern const char sStr_UpdateuiSesskey[]; // "\\updateui\\\\sesskey\\"
extern const char sStr_InvalidZipcode[]; // "Invalid zipcode."
extern const char sFmt_Int_3[]; // "%d"
extern const char sStr_0_2[]; // "0"
extern const char sStr_1_2[]; // "1"
extern const char sStr_2[]; // "2"
extern const char sStr_InvalidSex[]; // "Invalid sex."
extern const char sKey_cpubrandid[]; // "\\cpubrandid\\"
extern const char sKey_cpuspeed[]; // "\\cpuspeed\\"
extern const char sKey_memory[]; // "\\memory\\"
extern const char sKey_videocard1ram[]; // "\\videocard1ram\\"
extern const char sKey_videocard2ram[]; // "\\videocard2ram\\"
extern const char sKey_connectionid[]; // "\\connectionid\\"
extern const char sKey_connectionspeed[]; // "\\connectionspeed\\"
extern const char sKey_hasnetwork[]; // "\\hasnetwork\\"
extern const char sStr_InvalidInfo[]; // "Invalid info."
extern const char sStr_InvalidValue[]; // "Invalid value."
extern const char sKey_password[]; // "\\password\\"
extern const char sStr_InvalidCountrycode[]; // "Invalid countrycode."
extern const char sKey_videocard1string[]; // "\\videocard1string\\"
extern const char sKey_videocard2string[]; // "\\videocard2string\\"
extern const char sKey_osstring[]; // "\\osstring\\"
extern const char sStr_GetprofileSesskey[]; // "\\getprofile\\\\sesskey\\"
extern const char sKey_id_2[]; // "\\id\\"
extern const char sStr_gpiDestroyOperation[]; // "gpiDestroyOperation"
extern const char sStr_gpiFailedOpCallback[]; // "gpiFailedOpCallback"
extern const char sStr_gpiProcessOperation[]; // "gpiProcessOperation"
extern const char sStr_ConnectionNeNULL[]; // "connection != NULL"
extern const char sStr_GpiOperationC[]; // "gpiOperation.c"
extern const char sStr_ConnectionNeNULL_2[]; // "*connection != NULL"
extern const char sStr_OperationNeNULL[]; // "operation != NULL"
extern const char sStr_OutOfMemory_7[]; // "Out of memory."
extern const char sStr_0_3[]; // "0"
extern const char sStr_IconnectionNumSearchesGe0[]; // "iconnection->numSearches >= 0"
extern const char sFmt_GpiProcessOperationWasPassedAnOperationWithAn[]; // "gpiProcessOperation was passed an operation with an invalid type (%d)\n"
extern const u8 __upper_mapC[];

extern int sprintf(char *, const char *, ...);
extern long atol(const char *);
extern void __msl_assertion_failed(const char *, const char *, const char *, int);
extern void *DWCi_GsMalloc(u32 size);
extern void DWCi_GsFree(void *p);
extern char *goastrdup(const char *string);
extern void _strlwr(char *string);
extern void gsSocketClose(int sock);
extern void gsSocketShutdown(int sock, int how);
extern int gpiAddCallback(GpConnection **connection, GpCallback callback, void *arg, GpOperation *operation, int type);

// Profile info fields of gpiSetInfoi / gpiSetInfos.
enum {
    GP_INFO_NICK = 1792,
    GP_INFO_UNIQUENICK,
    GP_INFO_EMAIL,
    GP_INFO_PASSWORD,
    GP_INFO_FIRSTNAME,
    GP_INFO_LASTNAME,
    GP_INFO_ICQUIN,
    GP_INFO_HOMEPAGE,
    GP_INFO_ZIPCODE,
    GP_INFO_COUNTRYCODE,
    GP_INFO_1802,
    GP_INFO_SEX,
    GP_INFO_CPUBRANDID,
    GP_INFO_CPUSPEED,
    GP_INFO_MEMORY,
    GP_INFO_VIDEOCARD1STRING,
    GP_INFO_VIDEOCARD1RAM,
    GP_INFO_VIDEOCARD2STRING,
    GP_INFO_VIDEOCARD2RAM,
    GP_INFO_CONNECTIONID,
    GP_INFO_CONNECTIONSPEED,
    GP_INFO_HASNETWORK,
    GP_INFO_OSSTRING,
    GP_INFO_AIM,
    GP_INFO_PIC,
    GP_INFO_OCCUPATION,
    GP_INFO_INDUSTRY,
    GP_INFO_INCOME,
    GP_INFO_MARRIED,
    GP_INFO_CHILDCOUNT,
    GP_INFO_INTERESTS1,
};

// sex values of the profile info
enum {
    GP_MALE = 1280,
    GP_FEMALE,
    GP_PAT,
};

// Failed-operation callback arguments of the types that carry only the result.
typedef struct GpResultArg8 {
    int result;
    int unk_04;
} GpResultArg8;

typedef struct GpResultArg16 {
    int result;
    int unk_04;
    int unk_08;
    int unk_0C;
} GpResultArg16;

// Appends the pending "\updatepro\" / "\updateui\" requests to outputBuffer.
int gpiAddLocalInfo(GpConnection **connection, GpBuffer *outputBuffer) {
    GpConnection *iconnection = *connection;
    if (iconnection->updateproBuffer.len > 0) {
        gpiAppendStringToBuffer(connection, outputBuffer, sStr_UpdateproSesskey);
        gpiAppendIntToBuffer(connection, outputBuffer, iconnection->sessKey);
        gpiAppendStringToBuffer(connection, outputBuffer, iconnection->updateproBuffer.buffer);
        gpiAppendStringToBuffer(connection, outputBuffer, sKey_final_5);
        iconnection->updateproBuffer.len = 0;
    }
    if (iconnection->updateuiBuffer.len > 0) {
        gpiAppendStringToBuffer(connection, outputBuffer, sStr_UpdateuiSesskey);
        gpiAppendIntToBuffer(connection, outputBuffer, iconnection->sessKey);
        gpiAppendStringToBuffer(connection, outputBuffer, iconnection->updateuiBuffer.buffer);
        gpiAppendStringToBuffer(connection, outputBuffer, sKey_final_5);
        iconnection->updateuiBuffer.len = 0;
    }
    return 0;
}

int gpiSendLocalInfo(GpConnection **connection, const char *key, const char *value) {
    GpConnection *iconnection = *connection;
    int result = gpiAppendStringToBuffer(connection, &iconnection->updateproBuffer, key);
    if (result) {
        return result;
    }
    result = gpiAppendStringToBuffer(connection, &iconnection->updateproBuffer, value);
    if (result) {
        return result;
    }
    return GP_NO_ERROR;
}

int gpiSendUserInfo(GpConnection **connection, const char *key, const char *value) {
    GpConnection *iconnection = *connection;
    int result = gpiAppendStringToBuffer(connection, &iconnection->updateuiBuffer, key);
    if (result) {
        return result;
    }
    result = gpiAppendStringToBuffer(connection, &iconnection->updateuiBuffer, value);
    if (result) {
        return result;
    }
    return GP_NO_ERROR;
}

// Sets an integer profile info field.
int gpiSetInfoi(GpConnection **connection, int info, int value) {
    char buffer[16];
    int result;
    switch (info) {
    case GP_INFO_ZIPCODE:
        if (value < 0) {
            gpiSetErrorString(connection, sStr_InvalidZipcode);
            return GP_PARAMETER_ERROR;
        }
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_zipcode, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_SEX:
        switch (value) {
        case GP_MALE:
            result = gpiSendLocalInfo(connection, sKey_sex, sStr_0_2);
            if (result) {
                return result;
            }
            break;
        case GP_FEMALE:
            result = gpiSendLocalInfo(connection, sKey_sex, sStr_1_2);
            if (result) {
                return result;
            }
            break;
        case GP_PAT:
            result = gpiSendLocalInfo(connection, sKey_sex, sStr_2);
            if (result) {
                return result;
            }
            break;
        default:
            gpiSetErrorString(connection, sStr_InvalidSex);
            return GP_PARAMETER_ERROR;
        }
        break;
    case GP_INFO_ICQUIN:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_icquin, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_CPUBRANDID:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendUserInfo(connection, sKey_cpubrandid, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_CPUSPEED:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendUserInfo(connection, sKey_cpuspeed, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_MEMORY:
        sprintf(buffer, sFmt_Int_3, value / 16);
        result = gpiSendUserInfo(connection, sKey_memory, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_VIDEOCARD1RAM:
        sprintf(buffer, sFmt_Int_3, value / 4);
        result = gpiSendUserInfo(connection, sKey_videocard1ram, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_VIDEOCARD2RAM:
        sprintf(buffer, sFmt_Int_3, value / 4);
        result = gpiSendUserInfo(connection, sKey_videocard2ram, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_CONNECTIONID:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendUserInfo(connection, sKey_connectionid, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_CONNECTIONSPEED:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendUserInfo(connection, sKey_connectionspeed, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_HASNETWORK:
        if (value) {
            value = 1;
        }
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendUserInfo(connection, sKey_hasnetwork, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_PIC:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_pic, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_OCCUPATION:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_occ, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_INDUSTRY:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_ind, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_INCOME:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_inc, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_MARRIED:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_mar, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_CHILDCOUNT:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_chc, buffer);
        if (result) {
            return result;
        }
        break;
    case GP_INFO_INTERESTS1:
        sprintf(buffer, sFmt_Int_3, value);
        result = gpiSendLocalInfo(connection, sKey_i1, buffer);
        if (result) {
            return result;
        }
        break;
    default:
        gpiSetErrorString(connection, sStr_InvalidInfo);
        return GP_PARAMETER_ERROR;
    }
    return GP_NO_ERROR;
}

static inline int ToUpper(int c) {
    return (c < 0 || c >= 128) ? c : __upper_mapC[c];
}

// Sets a string profile info field (nick / uniquenick / email / password are also kept in the connection).
int gpiSetInfos(GpConnection **connection, int info, const char *value) {
    GpConnection *iconnection = *connection;
    char buffer[256];
    int result;
    if (value == NULL) {
        gpiSetErrorString(connection, sStr_InvalidValue);
        return GP_PARAMETER_ERROR;
    }
    switch (info) {
    case GP_INFO_NICK:
        if (value[0] == 0) {
            gpiSetErrorString(connection, sStr_InvalidValue);
            return GP_PARAMETER_ERROR;
        }
        strzcpy(buffer, value, 31);
        strzcpy(iconnection->nick, buffer, 31);
        result = gpiSendLocalInfo(connection, sKey_nick_2, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_UNIQUENICK:
        if (value[0] == 0) {
            gpiSetErrorString(connection, sStr_InvalidValue);
            return GP_PARAMETER_ERROR;
        }
        strzcpy(buffer, value, 21);
        strzcpy(iconnection->uniquenick, buffer, 21);
        result = gpiSendLocalInfo(connection, sKey_uniquenick_2, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_EMAIL:
        if (value[0] == 0) {
            gpiSetErrorString(connection, sStr_InvalidValue);
            return GP_PARAMETER_ERROR;
        }
        strzcpy(buffer, value, 51);
        _strlwr(buffer);
        strzcpy(iconnection->email, buffer, 51);
        result = gpiSendUserInfo(connection, sKey_email_2, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_PASSWORD:
        if (value[0] == 0) {
            gpiSetErrorString(connection, sStr_InvalidValue);
            return GP_PARAMETER_ERROR;
        }
        strzcpy(buffer, value, 31);
        strzcpy(iconnection->password, buffer, 31);
        result = gpiSendUserInfo(connection, sKey_password, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_FIRSTNAME:
        strzcpy(buffer, value, 31);
        result = gpiSendLocalInfo(connection, sKey_firstname, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_LASTNAME:
        strzcpy(buffer, value, 31);
        result = gpiSendLocalInfo(connection, sKey_lastname, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_HOMEPAGE:
        strzcpy(buffer, value, 76);
        result = gpiSendLocalInfo(connection, sKey_homepage, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_ZIPCODE:
        strzcpy(buffer, value, 11);
        result = gpiSendLocalInfo(connection, sKey_zipcode, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_COUNTRYCODE:
        if (strlen(value) != 2) {
            gpiSetErrorString(connection, sStr_InvalidCountrycode);
            return GP_PARAMETER_ERROR;
        }
        strzcpy(buffer, value, 3);
        result = gpiSendLocalInfo(connection, sKey_countrycode, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_SEX: {
        char sex = ToUpper(value[0]);
        if (sex == 'M') {
            memcpy(buffer, sStr_0_2, 2);
        } else if (sex == 'F') {
            memcpy(buffer, sStr_1_2, 2);
        } else {
            memcpy(buffer, sStr_2, 2);
        }
        result = gpiSendLocalInfo(connection, sKey_sex, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    }
    case GP_INFO_ICQUIN:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_icquin, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_CPUSPEED:
        result = gpiSetInfoi(connection, GP_INFO_CPUSPEED, atol(value));
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_MEMORY:
        result = gpiSetInfoi(connection, GP_INFO_MEMORY, atol(value));
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_VIDEOCARD1STRING:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_videocard1string, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_VIDEOCARD1RAM:
        result = gpiSetInfoi(connection, GP_INFO_VIDEOCARD1RAM, atol(value));
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_VIDEOCARD2STRING:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_videocard2string, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_VIDEOCARD2RAM:
        result = gpiSetInfoi(connection, GP_INFO_VIDEOCARD2RAM, atol(value));
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_CONNECTIONSPEED:
        result = gpiSetInfoi(connection, GP_INFO_CONNECTIONSPEED, atol(value));
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_HASNETWORK:
        result = gpiSetInfoi(connection, GP_INFO_HASNETWORK, atol(value));
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_OSSTRING:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_osstring, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_AIM:
        strzcpy(buffer, value, 51);
        result = gpiSendLocalInfo(connection, sKey_aim, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_PIC:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_pic, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_OCCUPATION:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_occ, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_INDUSTRY:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_ind, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_INCOME:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_inc, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_MARRIED:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_mar, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_CHILDCOUNT:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_chc, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    case GP_INFO_INTERESTS1:
        strzcpy(buffer, value, 256);
        result = gpiSendLocalInfo(connection, sKey_i1, buffer);
        if (result != GP_NO_ERROR) {
            return result;
        }
        break;
    default:
        gpiSetErrorString(connection, sStr_InvalidInfo);
        return GP_PARAMETER_ERROR;
    }
    return GP_NO_ERROR;
}

// Sends "\getprofile\".
int gpiSendGetInfo(GpConnection **connection, int profileId, int id) {
    GpConnection *iconnection = *connection;
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sStr_GetprofileSesskey);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, iconnection->sessKey);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_profileid_2);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, profileId);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_id_2);
    gpiAppendIntToBuffer(connection, &iconnection->outputBuffer, id);
    gpiAppendStringToBuffer(connection, &iconnection->outputBuffer, sKey_final_5);
    return 0;
}

// Gets the info of a profile: answered from the cache when allowed (checkCache == 1), else requested.
int gpiGetInfo(GpConnection **connection, int profileId, int checkCache, int blocking, void *callback, void *param) {
    struct {
        GpOperation *operation;
        GpProfile *profile;
    } frame;

    GpCallback pair;
    int useCache, id, result;
    GpConnection *iconnection = *connection;
    frame.operation = 0;
    useCache = (checkCache == 1);
    if (!iconnection->cacheProfileInfo) {
        useCache = 0;
    }
    if (callback && useCache && gpiGetProfile(connection, profileId, &frame.profile) && frame.profile->cache) {
        GpInfoArg *arg = DWCi_GsMalloc(sizeof(GpInfoArg));
        if (!arg) {
            gpiSetErrorString(connection, sStr_OutOfMemory_6);
            return GP_MEMORY_ERROR;
        }
        gpiInfoCacheToArg(frame.profile->cache, arg);
        arg->result = 0;
        arg->profile = profileId;
        pair.callback = callback;
        pair.param = param;
        result = gpiAddOperation(connection, GP_OPERATION_GET_INFO, 0, &frame.operation, 1, callback, param);
        if (result) {
            return result;
        }
        id = frame.operation->id;
        result = gpiAddCallback(connection, pair, arg, frame.operation, GPI_ADD_NORMAL);
        if (result) {
            return result;
        }
        gpiRemoveOperation(connection, frame.operation);
    } else {
        result = gpiAddOperation(connection, GP_OPERATION_GET_INFO, 0, &frame.operation, blocking, callback, param);
        if (result) {
            return result;
        }
        id = frame.operation->id;
        result = gpiSendGetInfo(connection, profileId, id);
        if (result) {
            return result;
        }
    }
    if (blocking) {
        result = gpiProcess(connection, id);
        if (result) {
            return result;
        }
    }
    return GP_NO_ERROR;
}

// Caches a copy of the received profile info (with its strings).
int gpiSetInfoCache(GpConnection **connection, GpProfile *profile, GpInfo *info) {
    GpInfo *cache;
    if (!(*connection)->cacheProfileInfo) {
        return 1;
    }
    gpiFreeInfoCache(profile);
    cache = profile->cache = DWCi_GsMalloc(sizeof(GpInfo));
    if (cache) {
        *cache = *info;
        profile->cache->nick = goastrdup(info->nick);
        profile->cache->uniquenick = goastrdup(info->uniquenick);
        profile->cache->email = goastrdup(info->email);
        profile->cache->firstname = goastrdup(info->firstname);
        profile->cache->lastname = goastrdup(info->lastname);
        profile->cache->homepage = goastrdup(info->homepage);
        profile->cache->aimname = goastrdup(info->aimname);
    }
    return profile->cache != 0;
}

void gpiFreeInfoCache(GpProfile *profile) {
    if (!profile->cache) {
        return;
    }
    DWCi_GsFree(profile->cache->nick);
    profile->cache->nick = 0;
    DWCi_GsFree(profile->cache->uniquenick);
    profile->cache->uniquenick = 0;
    DWCi_GsFree(profile->cache->email);
    profile->cache->email = 0;
    DWCi_GsFree(profile->cache->firstname);
    profile->cache->firstname = 0;
    DWCi_GsFree(profile->cache->lastname);
    profile->cache->lastname = 0;
    DWCi_GsFree(profile->cache->homepage);
    profile->cache->homepage = 0;
    DWCi_GsFree(profile->cache->aimname);
    profile->cache->aimname = 0;
    DWCi_GsFree(profile->cache);
    profile->cache = 0;
}

// "gpiFailedOpCallback": tells the operation's callback about its error.
int gpiFailedOpCallback(GpConnection **connection, GpOperation *operation) {
    GpConnection *iconnection = *connection;
    GpCallback callback;
    if (!connection) {
        __msl_assertion_failed(sStr_ConnectionNeNULL, sStr_GpiOperationC, sStr_gpiFailedOpCallback, 34);
    }
    if (!*connection) {
        __msl_assertion_failed(sStr_ConnectionNeNULL_2, sStr_GpiOperationC, sStr_gpiFailedOpCallback, 35);
    }
    if (!operation) {
        __msl_assertion_failed(sStr_OperationNeNULL, sStr_GpiOperationC, sStr_gpiFailedOpCallback, 36);
    }
    callback = operation->callback;
    if (callback.callback) {
        switch (operation->type) {
        case GP_OPERATION_CONNECT: {
            GpConnectArg *arg = DWCi_GsMalloc(sizeof(GpConnectArg));
            if (!arg) {
                gpiSetErrorString(connection, sStr_OutOfMemory_7);
                return 1;
            }
            memset(arg, 0, sizeof(GpConnectArg));
            arg->result = operation->result;
            if (iconnection->errorCode == 0x201) {
                arg->profile = iconnection->profileId;
                iconnection->profileId = 0;
            }
            {
                int result = gpiAddCallback(connection, callback, arg, operation, GPI_ADD_NORMAL);
                if (result) {
                    return result;
                }
            }
            break;
        }
        case GP_OPERATION_NEW_PROFILE: {
            GpResultArg8 *arg = DWCi_GsMalloc(sizeof(GpResultArg8));
            if (!arg) {
                gpiSetErrorString(connection, sStr_OutOfMemory_7);
                return 1;
            }
            memset(arg, 0, sizeof(GpResultArg8));
            arg->result = operation->result;
            {
                int result = gpiAddCallback(connection, callback, arg, operation, GPI_ADD_NORMAL);
                if (result) {
                    return result;
                }
            }
            break;
        }
        case GP_OPERATION_GET_INFO: {
            GpInfoArg *arg = DWCi_GsMalloc(sizeof(GpInfoArg));
            if (!arg) {
                gpiSetErrorString(connection, sStr_OutOfMemory_7);
                return 1;
            }
            memset(arg, 0, sizeof(GpInfoArg));
            arg->result = operation->result;
            {
                int result = gpiAddCallback(connection, callback, arg, operation, GPI_ADD_NORMAL);
                if (result) {
                    return result;
                }
            }
            break;
        }
        case GP_OPERATION_SEARCH: {
            GpResultArg16 *arg = DWCi_GsMalloc(sizeof(GpResultArg16));
            if (!arg) {
                gpiSetErrorString(connection, sStr_OutOfMemory_7);
                return 1;
            }
            memset(arg, 0, sizeof(GpResultArg16));
            arg->result = operation->result;
            arg->unk_0C = 0;
            {
                int result = gpiAddCallback(connection, callback, arg, operation, GPI_ADD_NORMAL);
                if (result) {
                    return result;
                }
            }
            break;
        }
        case GP_OPERATION_4: {
            int *arg = DWCi_GsMalloc(sizeof(int));
            if (!arg) {
                gpiSetErrorString(connection, sStr_OutOfMemory_7);
                return 1;
            }
            memset(arg, 0, sizeof(int));
            *arg = operation->result;
            {
                int result = gpiAddCallback(connection, callback, arg, operation, GPI_ADD_NORMAL);
                if (result) {
                    return result;
                }
            }
            break;
        }
        default:
            __msl_assertion_failed(sStr_0_3, sStr_GpiOperationC, sStr_gpiFailedOpCallback, 107);
        }
    }
    return 0;
}

// Adds an operation (id 1 for the connect operation).
int gpiAddOperation(GpConnection **connection, int type, void *data, GpOperation **operation, int blocking, void *callback, void *param) {
    GpConnection *iconnection = *connection;
    GpOperation *op = DWCi_GsMalloc(sizeof(GpOperation));
    if (!op) {
        gpiSetErrorString(connection, sStr_OutOfMemory_7);
        return GP_MEMORY_ERROR;
    }
    op->type = type;
    op->data = data;
    op->blocking = blocking;
    op->state = GPI_START;
    if (type == GP_OPERATION_CONNECT) {
        op->id = 1;
    } else {
        op->id = iconnection->nextOperationId++;
        if (iconnection->nextOperationId < 2) {
            iconnection->nextOperationId = 2;
        }
    }
    op->result = 0;
    op->callback.callback = callback;
    op->callback.param = param;
    op->next = iconnection->operations;
    iconnection->operations = op;
    *operation = op;
    return GP_NO_ERROR;
}

// "gpiDestroyOperation"
void gpiDestroyOperation(GpConnection **connection, GpOperation *operation) {
    GpConnection *iconnection = *connection;
    if (operation->type == GP_OPERATION_SEARCH) {
        GpSearchData *data = operation->data;
        if (--iconnection->numSearches < 0) {
            __msl_assertion_failed(sStr_IconnectionNumSearchesGe0, sStr_GpiOperationC, sStr_gpiDestroyOperation, 0xb6);
        }
        gsSocketShutdown(data->sock, 2);
        gsSocketClose(data->sock);
        DWCi_GsFree(data->outputBuffer.buffer);
        data->outputBuffer.buffer = 0;
        DWCi_GsFree(data->inputBuffer.buffer);
        data->inputBuffer.buffer = 0;
    }
    DWCi_GsFree(operation->data);
    operation->data = 0;
    DWCi_GsFree(operation);
}

// Unlinks and destroys an operation.
void gpiRemoveOperation(GpConnection **connection, GpOperation *operation) {
    GpConnection *iconnection = *connection;
    GpOperation *op = iconnection->operations, *prev = 0;
    while (op) {
        if (op == operation) {
            if (!prev) {
                iconnection->operations = op->next;
            } else {
                prev->next = operation->next;
            }
            gpiDestroyOperation(connection, operation);
            return;
        }
        prev = op;
        op = op->next;
    }
}

// Finds the operation with the given id.
int gpiFindOperationByID(GpConnection **connection, GpOperation **operation, int id) {
    GpOperation *op = (*connection)->operations;
    while (op) {
        if (op->id == id) {
            if (operation) {
                *operation = op;
            }
            return 1;
        }
        op = op->next;
    }
    if (operation) {
        *operation = 0;
    }
    return 0;
}

// Whether a blocking operation (other than a search) is pending.
int gpiOperationsAreBlocking(GpConnection **connection) {
    GpOperation *op = (*connection)->operations;
    while (op) {
        if (op->blocking && op->type != GP_OPERATION_SEARCH) {
            return 1;
        }
        op = op->next;
    }
    return 0;
}

// "gpiProcessOperation": hands a server reply to its operation.
int gpiProcessOperation(GpConnection **connection, GpOperation *operation, char *input) {
    int result = 0;
    switch (operation->type) {
    case GP_OPERATION_CONNECT:
        result = gpiProcessConnect(connection, operation, input);
        break;
    case GP_OPERATION_NEW_PROFILE:
        result = gpiProcessNewProfile(connection, operation, input);
        break;
    case GP_OPERATION_GET_INFO:
        result = gpiProcessGetInfo(connection, operation, input);
        break;
    case GP_OPERATION_4:
        result = gpiProcessRegisterUniqueNick(connection, operation, input);
        break;
    default:
        gpiDebug(connection, sFmt_GpiProcessOperationWasPassedAnOperationWithAn, operation->type);
        __msl_assertion_failed(sStr_0_3, sStr_GpiOperationC, sStr_gpiProcessOperation, 326);
    }
    if (result) {
        operation->result = result;
    }
    return result;
}
