"""Run original PlayFanfare/Wait bodies with only device-admission stubs.

This proves the literal timer/pause FSM, not hardware audio or browser timing.
No original C function body is translated or rewritten.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / 'src/sound_playback.c').read_text()


def body(name):
    match = re.search(r'\b(?:BOOL|void)\s+' + name + r'\([^;{}]*\)\s*\{', SOURCE)
    if not match:
        raise AssertionError('Original function missing: ' + name)
    depth, end = 1, match.end()
    while depth:
        depth += (SOURCE[end] == '{') - (SOURCE[end] == '}')
        end += 1
    return SOURCE[match.start():end]


NAMES = ['StartFanfareWaitTimer', 'PlayFanfare',
         'IsFanfarePlayingOrWaiting', 'StopFanfare', 'IsFanfarePlaying']
BODIES = '\n\n'.join(body(name) for name in NAMES)
PREFIX = r'''
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
typedef uint8_t u8; typedef uint16_t u16; typedef int BOOL;
#define TRUE 1
#define FALSE 0
enum SoundHandleNo {SND_HANDLE_ME = 2};
static u16 timer;
static int attr, handle, player, admission, voices;
static int fieldPaused, radioPaused, fieldPauseCalls, radioPauseCalls;
static int starts, stops;
void *GF_SdatGetAttrPtr(int id) {return id == 14 ? (void *)&timer : (void *)&attr;}
void GF_GetBankInfoBySeqNo(u16 seq) {assert(seq == 1188);}
int GF_GetCurrentPlayingBGM(void) {return 1011;}
u8 GF_GetPlayerNoBySeq(int seq) {assert(seq == 1011);return player;}
void Sound_SetPlayerPause(u8 id, BOOL pause) {
    assert(id == player);fieldPaused = pause;fieldPauseCalls++;
}
void SndRadio_PausePlayer(BOOL pause) {radioPaused = pause;radioPauseCalls++;}
void GF_Snd_SaveState(void *state) {assert(state);}
void GF_Snd_LoadSeqEx(u16 seq, int mode) {assert(seq == 1188 && mode == 3);}
BOOL Sound_StartSeq(enum SoundHandleNo h, int p, int b, int priority, u16 seq, u8 gb) {
    assert(h == SND_HANDLE_ME && p == -1 && b == -1 && priority == -1);
    assert(seq == 1188 && gb == 0 && timer == 15);
    assert(player == 255 ? radioPaused : fieldPaused);
    starts++;return admission;
}
void Sound_ApplyVoiceChatVolume(u16 seq, enum SoundHandleNo h) {
    assert(seq == 1188 && h == SND_HANDLE_ME);
}
int GF_SndPlayerCountPlayingSeqByPlayerNo(int p) {assert(p == 2);return voices;}
void *GF_GetSoundHandle(enum SoundHandleNo h) {assert(h == SND_HANDLE_ME);return &handle;}
void NNS_SndPlayerStopSeq(void *h, int fade) {assert(h == &handle && fade == 0);stops++;}
int Sound_GetSavedHeapLevel(int slot) {assert(slot == 6);return 7;}
void GF_Snd_LoadState(int level) {assert(level == 7);}
'''
SUFFIX = r'''
static void scenario(const char *name, int p, int accepts, int playingPolls) {
    player=p;admission=accepts;voices=accepts;timer=0;
    fieldPaused=radioPaused=fieldPauseCalls=radioPauseCalls=starts=stops=0;
    assert(PlayFanfare(1188) == accepts);
    assert(timer == 15 && starts == 1 && stops == 0);
    for(int i=0;i<playingPolls;i++) {
        assert(IsFanfarePlaying() == TRUE && timer == 15 && stops == 0);
    }
    voices=0;
    for(int i=0;i<15;i++) {
        assert(IsFanfarePlaying() == TRUE && timer == 14-i && stops == 0);
        assert(player == 255 ? radioPaused : fieldPaused);
    }
    assert(IsFanfarePlaying() == FALSE);
    assert(timer == 0 && stops == 1 && fieldPaused == 0 && radioPaused == 0);
    assert(player == 255 ? fieldPauseCalls == 0 && radioPauseCalls == 2
                         : fieldPauseCalls == 2 && radioPauseCalls == 1);
    printf("{\"case\":\"%s\",\"admission\":%d,\"playingPolls\":%d,"
           "\"timerTruePolls\":15,\"terminalFalse\":true,\"resumed\":true}",
           name,accepts,playingPolls);
}
int main(void) {
    printf("[");scenario("failed-field",1,0,0);printf(",");
    scenario("failed-radio",255,0,0);printf(",");
    scenario("admitted-sequence",1,1,9);printf("]\n");return 0;
}
'''


class OriginalHatchFanfareTimer(unittest.TestCase):
    def test_original_c_failed_admission_and_active_sequence(self):
        wrapper = PREFIX + BODIES + SUFFIX
        with tempfile.TemporaryDirectory(prefix='hg-hatch-fanfare-c-') as directory:
            source, executable = Path(directory) / 'oracle.c', Path(directory) / 'oracle'
            source.write_text(wrapper)
            subprocess.run(['cc', '-std=c11', '-Werror', str(source), '-o', str(executable)], check=True)
            output = subprocess.check_output([str(executable)], text=True)
        cases = json.loads(output)
        self.assertEqual([case['timerTruePolls'] for case in cases], [15, 15, 15])
        self.assertEqual(cases[2]['playingPolls'], 9)
        print(json.dumps({'nativeSourceSHA256': hashlib.sha256(SOURCE.encode()).hexdigest(),
                          'nativeBodySHA256': {name: hashlib.sha256(body(name).encode()).hexdigest() for name in NAMES},
                          'wrapperSHA256': hashlib.sha256(wrapper.encode()).hexdigest(),
                          'cases': cases}, sort_keys=True))

    def test_hatch_ignores_admission_and_falls_through_to_native_wait(self):
        hatch = (ROOT / 'src/hatch_egg_app.c').read_text()
        self.assertRegex(hatch, r'PlayFanfare\(SEQ_ME_SHINKAOME\);\s*app->state\+\+;\s*case 9:\s*if \(IsFanfarePlaying\(\)\)')
        self.assertLess(body('PlayFanfare').index('StartFanfareWaitTimer'), body('PlayFanfare').index('Sound_StartSeq'))
        self.assertLess(body('PlayFanfare').index('Sound_SetPlayerPause'), body('PlayFanfare').index('Sound_StartSeq'))


if __name__ == '__main__':
    unittest.main()
