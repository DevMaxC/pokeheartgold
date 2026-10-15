#pragma force_active on
#include "global.h"

// The code below is compiled as ARM (32-bit) code.
#include <nitro/code32.h>
#include <nitro/rtc.h>
s32 RTCi_ConvertTimeToSecond(const RTCTime *);

s64 RTC_ConvertDateTimeToSecond(const RTCDate *d, const RTCTime *t) {
    s32 day = RTC_ConvertDateToDay(d);
    s32 sec;
    if (day == -1) {
        return -1;
    }
    sec = RTCi_ConvertTimeToSecond(t);
    if (sec == -1) {
        return -1;
    }
    return (s64)day * 86400 + sec;
}
