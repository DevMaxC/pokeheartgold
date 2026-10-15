#include <nitro/types.h>
#include <nitro/rtc/ARM9/api.h>
#include <nitro/rtc/ARM9/convert.h>
#include <nitro/code32.h>

s32 RTCi_ConvertTimeToSecond(const RTCTime *time);
void RTC_ConvertDayToDate(RTCDate *date, s32 day);
void RTCi_ConvertSecondToTime(RTCTime *time, s32 sec);
RTCWeek RTC_GetDayOfWeek(RTCDate *date);

s32 sDayOfYear[12] = {
      0, // Jan
     31, // Feb
     59, // Mar
     90, // Apr
    120, // May
    151, // Jun
    181, // Jul
    212, // Aug
    243, // Sep
    273, // Oct
    304, // Nov
    334, // Dec
};

static inline BOOL RTCi_IsLeapYear(u32 year)
{
    return !((year & 0x03));
}

s32 RTC_ConvertDateToDay(const RTCDate * date)
{
    if (date->year >= 100
     || date->month < 1
     || date->month > 12
     || date->day < 1
     || date->day > 31
     || date->week >= RTC_WEEK_MAX
     || date->month < 1   // can't be
     || date->month > 12  // too sure
    )
        return -1;
    s32 dayNum = (s32)(date->day - 1);
    dayNum += sDayOfYear[date->month - 1];
    if (date->month >= 3 && RTCi_IsLeapYear(date->year))
        dayNum++;
    dayNum += date->year * 365;
    dayNum += (date->year + 3) / 4;
    return dayNum;
}

s32 RTCi_ConvertTimeToSecond(const RTCTime * time)
{
    return (s32)((time->hour * 60 + time->minute) * 60 + time->second);
}
