#!/usr/bin/env python3
"""Compile literal SDK stop/fader/PlayerMain bodies; hardware/list primitives are stubs."""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]


def function(source, signature):
    start = source.index(signature + '(')
    start = source.rfind('\n', 0, start) + 1
    opening = source.index('{', start)
    depth, end = 1, opening + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


def main():
    player_path, fader_path = (ROOT / name for name in ['lib/NitroSystem/src/snd_player.c', 'lib/NitroSystem/src/snd_fader.c'])
    player, fader = player_path.read_text(), fader_path.read_text()
    harness = '''#include <stdint.h>
#include <stdio.h>
#include <assert.h>
typedef int32_t s32;typedef uint32_t u32;typedef int BOOL;
#define TRUE 1
#define FALSE 0
#define SND_SEQ_PLAYER_STATUS_FREE 0
#define SND_SEQ_PLAYER_STATUS_PLAY 1
#define SND_SEQ_PLAYER_STATUS_FADEOUT 2
typedef struct {s32 target,origin,frames,counter;} SndFader;
typedef struct {int volume;} SndPlayerInfo;
typedef struct {int isStarted,isPrepared,prepareTag,playerNo,extVolume,initVolume,volume,status,priority;SndFader fader;SndPlayerInfo *playerInfo;} NNSSndSeqPlayer;
typedef struct {int value;} Count;
int gSndSeqPlayerPrioList,_0210D750[128],stopCount,shutdownCount;u32 hardwareStatus;
Count gSndPlayerInfoNumPlaying[16];SndPlayerInfo info={127};NNSSndSeqPlayer instance;
s32 NNSi_SndFaderGet(SndFader*);
NNSSndSeqPlayer* NNS_FndGetNextListObject(int*list,NNSSndSeqPlayer*prev){return prev||instance.status==SND_SEQ_PLAYER_STATUS_FREE?0:&instance;}
u32 SND_GetPlayerStatus(void){return hardwareStatus;}
int SND_IsFinishedCommandTag(int tag){return TRUE;}
void SND_SetPlayerVolume(int player,int volume){}
void SND_StartPreparedSeq(int player){}
void ShutdownPlayer(NNSSndSeqPlayer*p){shutdownCount++;p->status=SND_SEQ_PLAYER_STATUS_FREE;gSndPlayerInfoNumPlaying[3].value=0;}
void ForceStopSeq(NNSSndSeqPlayer*p){stopCount++;ShutdownPlayer(p);}
void SetPlayerPriority(NNSSndSeqPlayer*p,int priority){p->priority=priority;}
'''
    harness += fader.replace('#include <nitro.h>', '').replace('#include <nnsys/snd_internal.h>', '')
    for signature in ['static inline int CombineDecibels', 'void NNSi_SndPlayerMain', 'void NNSi_SndPlayerStopSeq', 'int NNS_SndPlayerCountPlayingSeqByPlayerNo']:
        harness += '\n' + function(player, signature)
    harness += '''
void begin(void){instance=(NNSSndSeqPlayer){0};instance.isStarted=TRUE;instance.playerNo=3;instance.playerInfo=&info;instance.extVolume=127;instance.initVolume=127;instance.status=SND_SEQ_PLAYER_STATUS_PLAY;instance.priority=64;NNSi_SndFaderInit(&instance.fader);NNSi_SndFaderSet(&instance.fader,127<<8,1);NNSi_SndFaderUpdate(&instance.fader);hardwareStatus=1U<<3;gSndPlayerInfoNumPlaying[3].value=1;}
int main(void){
 begin();NNSi_SndPlayerStopSeq(&instance,1);assert(stopCount==0);assert(instance.priority==0);assert(NNS_SndPlayerCountPlayingSeqByPlayerNo(3)==1);assert(NNSi_SndFaderGet(&instance.fader)==127<<8);
 NNSi_SndPlayerMain();assert(stopCount==1);assert(NNS_SndPlayerCountPlayingSeqByPlayerNo(3)==0);NNSi_SndPlayerMain();assert(stopCount==1);
 begin();hardwareStatus=0;assert(NNS_SndPlayerCountPlayingSeqByPlayerNo(3)==1);NNSi_SndPlayerMain();assert(shutdownCount==2);assert(NNS_SndPlayerCountPlayingSeqByPlayerNo(3)==0);
 begin();NNSi_SndPlayerStopSeq(&instance,0);assert(stopCount==2);assert(NNS_SndPlayerCountPlayingSeqByPlayerNo(3)==0);
 puts("PASS: literal StopSeq fade1 retains count/priority0 until next PlayerMain; idle update once; natural end retires at PlayerMain; fade0 immediate");
}
'''
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder)
        (path / 'oracle.c').write_text(harness)
        subprocess.run(['clang', '-std=c99', '-Werror', str(path / 'oracle.c'), '-o', str(path / 'oracle')], check=True, capture_output=True)
        output = subprocess.check_output([str(path / 'oracle')], text=True).strip()
    print(json.dumps({'status': output, 'sourceSHA256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [player_path, fader_path]}, 'harnessSHA256': hashlib.sha256(harness.encode()).hexdigest(), 'limitation': 'Original C control flow/fader/count bodies with explicit single-player list and hardware I/O stubs, not hardware/DAC/global scheduler emulation.'}, indent=2))


if __name__ == '__main__':
    main()
