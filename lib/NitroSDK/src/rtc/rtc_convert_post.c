#include <nitro/types.h>
#include <nitro/rtc/ARM9/api.h>
#include <nitro/rtc/ARM9/convert.h>
#include <nitro/code32.h>

s32 RTCi_ConvertTimeToSecond(const RTCTime *time);
void RTC_ConvertDayToDate(RTCDate *date, s32 day);
void RTCi_ConvertSecondToTime(RTCTime *time, s32 sec);
RTCWeek RTC_GetDayOfWeek(RTCDate *date);

extern s32 sDayOfYear[12];

static inline BOOL RTCi_IsLeapYear(u32 year)
{
    return !((year & 0x03));
}

void RTC_ConvertDayToDate(RTCDate * date, s32 day)
{
    u32 year;
    s32 month;

    if (day < 0)
    {
        day = 0;
    }
    if (day > 36524) // max number of days that can be recorded
    {
        day = 36524;
    }
    date->week = (RTCWeek)((day + 6) % 7);
    for (year = 0; year < 99; year++)
    {
        s32 prev = day;
        day -= (RTCi_IsLeapYear(year)) ? 366 : 365;
        if (day < 0)
        {
            day = prev;
            break;
        }
    }
    if (day > 365)
    {
        day = 365;
    }
    date->year = year;
    if (RTCi_IsLeapYear(year))
    {
        if (day < 31 + 29)
        {
            if (day < 31)
            {
                month = 1;
            }
            else
            {
                month = 2;
                day -= 31;
            }
            date->month = (u32)month;
            date->day = (u32)(day + 1);
            return;
        }
        else
        {
            day--;
        }
    }
    for (month = 11; month >= 0; month--)
    {
        if (day >= sDayOfYear[month])
        {
            date->month = (u32)(month + 1);
            date->day = (u32)(day - sDayOfYear[month] + 1);
            return;
        }
    }
    // Internal Error.
}

void RTCi_ConvertSecondToTime(RTCTime * time, s32 sec)
{
    if (sec < 0)
        sec = 0;
    if (sec > 86399)
        sec = 86399;
    time->second = (u32)(sec % 60);
    sec /= 60;
    time->minute = (u32)(sec % 60);
    sec /= 60;
    time->hour = (u32)sec;
}

void RTC_ConvertSecondToDateTime(RTCDate * date, RTCTime * time, s64 sec)
{
    if (sec < 0)
        sec = 0;
    else if (sec > 3155759999)
        sec = 3155759999;
    RTCi_ConvertSecondToTime(time, (s32)(sec % 86400));
    RTC_ConvertDayToDate(date, (s32)(sec / 86400));
}

RTCWeek RTC_GetDayOfWeek(RTCDate * date)
{
    int cent;
    int year = (int)(2000 + date->year);
    int month = (int)date->month;
    int day = (int)date->day;

    month -= 2;
    if (month < 1)
    {
        month += 12;
        --year;
    }
    cent = year / 100;
    year %= 100;
    return (RTCWeek)(((26 * month - 2) / 10 + day + year + year / 4 + cent / 4 + 5 * cent) % 7);
}
