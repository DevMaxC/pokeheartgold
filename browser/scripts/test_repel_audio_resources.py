#!/usr/bin/env python3
"""Independent native SDAT/WAV and playback-dispatch receipts for Repel sounds."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'browser/public/source/repel-audio'
MANIFEST = json.loads((ASSETS / 'resources.json').read_text())
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def body(text, signature):
    start = text.index(signature)
    at = text.index('{', start)
    depth, end = 1, at + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[start:end]


class RepelResourceTests(unittest.TestCase):
    def test_binary_records_names_fat_and_player_separation(self):
        raw = (ROOT / 'files/data/sound/gs_sound_data.sdat').read_bytes()
        self.assertEqual(sha(raw), MANIFEST['sourceSDATSHA256'])
        u16 = lambda at: struct.unpack_from('<H', raw, at)[0]
        u32 = lambda at: struct.unpack_from('<I', raw, at)[0]
        info, symb, fat = u32(0x18), u32(0x10), u32(0x20)
        def rec(section, table, index):
            table = section + u32(section + 8 + table * 4)
            return section + u32(table + 4 + index * 4)
        for player in (3, 4):
            p = rec(info, 4, player)
            self.assertEqual((raw[p], u16(p + 2), u32(p + 4)), (1, 55296, 2000))
            self.assertEqual(sha(raw[p:p + 8]), MANIFEST['players'][str(player)]['recordSHA256'])
        for key, row in MANIFEST['playerSequences'].items():
            at = rec(info, 0, int(key))
            name = rec(symb, 0, int(key))
            self.assertEqual(raw[name:raw.index(b'\0', name)].decode(), row['key'])
            self.assertEqual((u16(at + 4), *raw[at + 6:at + 10]), (row['bank'], row['volume'], row['channelPriority'], row['playerPriority'], row['player']))
            self.assertEqual(sha(raw[at:at + 12]), row['recordSHA256'])
        for key, player, volume in [('1500', 4, 54), ('1535', 3, 110)]:
            row = MANIFEST['sounds'][key]
            self.assertEqual((row['player'], row['bank'], row['volume'], row['channelPriority'], row['playerPriority']), (player, 700, volume, 104, 64))
            for resource in [row['sequence'], row['bankResource'], *row['waveArchives']]:
                at = fat + 12 + resource['fileId'] * 16
                self.assertEqual((u32(at), u32(at + 4)), (resource['offset'], resource['size']))
                self.assertEqual(sha(raw[resource['offset']:resource['offset'] + resource['size']]), resource['sha256'])
            seq = row['sequence']
            self.assertEqual(row['eventPayloadOffset'], seq['offset'] + u32(seq['offset'] + 24))
            self.assertEqual(sha(raw[row['eventPayloadOffset']:seq['offset'] + seq['size']]), row['eventPayloadSHA256'])
        self.assertNotEqual(MANIFEST['sounds']['1500']['player'], MANIFEST['sounds']['1535']['player'])

    def test_finite_original_wav_pcm_and_all_source_pins(self):
        for name, expected in MANIFEST['sourceFiles'].items():
            self.assertEqual(sha((ROOT / name).read_bytes()), expected, name)
        for key, frames in [('1500', 25776), ('1535', 22362)]:
            row = MANIFEST['sounds'][key]
            raw = (ASSETS / row['file']).read_bytes()
            self.assertEqual(sha(raw), row['wavSHA256'])
            self.assertEqual(raw[:4], b'RIFF')
            self.assertEqual(struct.unpack_from('<I', raw, 4)[0], len(raw) - 8)
            chunks, at = {}, 12
            while at < len(raw):
                length = struct.unpack_from('<I', raw, at + 4)[0]
                chunks[raw[at:at + 4]] = raw[at + 8:at + 8 + length]
                at += 8 + length + length % 2
            self.assertEqual(struct.unpack_from('<HHIIHH', chunks[b'fmt ']), (1, 2, 32768, 131072, 4, 16))
            self.assertEqual(len(chunks[b'data']), frames * 4)
            self.assertEqual(sha(chunks[b'data']), row['pcmSHA256'])
            self.assertTrue(any(chunks[b'data']))
            self.assertNotIn(b'smpl', chunks)
            self.assertIsNone(row['loopFrames'])
            self.assertEqual(row['rendererLoopPasses'], 1)
            self.assertEqual(row['events']['EndTrackSequenceEvent'], 1)
            self.assertNotIn('JumpSequenceEvent', row['events'])
        self.assertEqual(MANIFEST['sounds']['1500']['events']['SweepPitchSequenceEvent'], 2)

    def test_repeatable_renderer_and_optimized_export_preserve_every_byte(self):
        script = ROOT / 'browser/scripts/export_repel_audio.py'
        spec = importlib.util.spec_from_file_location('export_repel', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temporary:
            p = Path(temporary)
            module.export(p / 'ordinary', Path('/tmp/hg-dualrip-native-audio'))
            subprocess.run([sys.executable, '-O', str(script), '--renderer', '/tmp/hg-dualrip-native-audio', '--output', str(p / 'optimized')], check=True, capture_output=True)
            for name in ['resources.json', *(row['file'] for row in MANIFEST['sounds'].values())]:
                self.assertEqual((p / 'ordinary' / name).read_bytes(), (ASSETS / name).read_bytes())
                self.assertEqual((p / 'optimized' / name).read_bytes(), (ASSETS / name).read_bytes())

    def test_original_playse_c_uses_player_metadata_and_preallocation_select_gate(self):
        source = (ROOT / 'src/sound_playback.c').read_text()
        funcs = body(source, 'BOOL PlaySE(u16 seqNo) {') + '\n' + body(source, 'BOOL PlaySEEx(enum SoundHandleNo handleNo, int playerNo, int bankNo, int playerPrio, int seqNo) {')
        harness = '''#include <assert.h>
#include <stdio.h>
typedef unsigned short u16;typedef unsigned int u32;typedef int BOOL;
#define FALSE 0
#define SEQ_SE_DP_SELECT 1500
enum SoundHandleNo {HANDLE3=3,HANDLE4=4};
int muted,starts,selected,failed,allow=1;
int Sound_IsSelectSEMuted(void){return muted;}
int GF_GetPlayerNoBySeq(int seq){return seq==1500?4:3;}
enum SoundHandleNo GF_GetSndHandleByPlayerNo(int player){return (enum SoundHandleNo)player;}
int Sound_StartSeq(int handle,int player,int bank,int priority,int seq,int unused){assert(player==-1&&bank==-1&&priority==-1&&unused==0);starts++;selected=handle;return allow;}
void Sound_ApplyVoiceChatVolume(int seq,int handle){}
void GF_SndOnStartSeqFailed(int seq){failed++;}
BOOL PlaySEEx(enum SoundHandleNo,int,int,int,int);
'''
        harness += funcs + '''
int main(void){assert(PlaySE(1500)&&selected==4&&starts==1);assert(PlaySE(1535)&&selected==3&&starts==2);muted=1;assert(!PlaySE(1500)&&starts==2);assert(PlaySE(1535)&&starts==3);allow=0;assert(!PlaySE(1535)&&starts==4&&failed==1);puts("literal PlaySE: PLAYER4/3, SELECT-only gate before allocation, native no-voice PASS");}
'''
        with tempfile.TemporaryDirectory() as temporary:
            p = Path(temporary)
            (p / 'oracle.c').write_text(harness)
            subprocess.run(['clang', '-std=c99', '-Wall', '-Wextra', '-Wno-unused-parameter', '-Werror', str(p / 'oracle.c'), '-o', str(p / 'oracle')], check=True, capture_output=True)
            result = subprocess.run([str(p / 'oracle')], check=True, capture_output=True, text=True)
            self.assertIn('PASS', result.stdout)


    def test_original_sdk_c_fader_and_priority_oracle(self):
        fader = (ROOT / 'lib/NitroSystem/src/snd_fader.c').read_text()
        player = (ROOT / 'lib/NitroSystem/src/snd_player.c').read_text()
        declarations = '''#include <stdio.h>
#include <assert.h>
typedef int s32; typedef int BOOL;
typedef struct {s32 target,origin,frames,counter;} SndFader;
s32 NNSi_SndFaderGet(SndFader*);
typedef struct NNSSndSeqPlayer {int priority;} NNSSndSeqPlayer;
typedef struct {int numObjects;} List;
typedef struct {List playerList;int playableSeqCount;} SndPlayerInfo;
typedef struct {NNSSndSeqPlayer *player;} NNSSndHandle;
SndPlayerInfo gSndPlayerInfo[5]; NNSSndSeqPlayer existing,allocated;int stops;
void NNS_SndHandleReleaseSeq(NNSSndHandle*h){h->player=0;}
NNSSndSeqPlayer* NNS_FndGetNextListObject(List*l,void*p){return l->numObjects?&existing:0;}
void ForceStopSeq(NNSSndSeqPlayer*p){stops++;gSndPlayerInfo[4].playerList.numObjects=0;}
NNSSndSeqPlayer* AllocSeqPlayer(int priority){allocated.priority=priority;return &allocated;}
void InsertPlayerList(SndPlayerInfo*info,NNSSndSeqPlayer*p){info->playerList.numObjects++;}
'''
        # Original allocation sets player->handle after admission.
        declarations = declarations.replace('struct NNSSndSeqPlayer {int priority;}', 'struct NNSSndSeqPlayer {int priority;void*handle;}')
        source = declarations + fader.replace('#include <nitro.h>', '').replace('#include <nnsys/snd_internal.h>', '') + '\n' + body(player, 'NNSSndSeqPlayer *NNSi_SndPlayerAllocSeqPlayer') + '''
int main(void){
 SndFader f;NNSi_SndFaderInit(&f);NNSi_SndFaderSet(&f,127<<8,1);NNSi_SndFaderUpdate(&f);assert(NNSi_SndFaderGet(&f)==127<<8);
 NNSi_SndFaderSet(&f,0,1);assert(!NNSi_SndFaderIsFinished(&f));assert(NNSi_SndFaderGet(&f)==127<<8);NNSi_SndFaderUpdate(&f);assert(NNSi_SndFaderIsFinished(&f));assert(NNSi_SndFaderGet(&f)==0);
 NNSSndHandle h={0};gSndPlayerInfo[4].playableSeqCount=1;gSndPlayerInfo[4].playerList.numObjects=1;existing.priority=64;
 assert(NNSi_SndPlayerAllocSeqPlayer(&h,4,54)==0);assert(stops==0);assert(gSndPlayerInfo[4].playerList.numObjects==1);
 existing.priority=64;assert(NNSi_SndPlayerAllocSeqPlayer(&h,4,64)==&allocated);assert(stops==1);
 existing.priority=0;assert(NNSi_SndPlayerAllocSeqPlayer(&h,4,54)==&allocated);assert(stops==2);
 puts("original SDK C: fade1 / lower-priority reject / equal replace / fade-priority replace PASS");
}
'''
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)
            (path / 'oracle.c').write_text(source)
            subprocess.run(['clang', '-std=c99', '-Werror', str(path / 'oracle.c'), '-o', str(path / 'oracle')], check=True, capture_output=True)
            result = subprocess.run([str(path / 'oracle')], check=True, capture_output=True, text=True)
            self.assertIn('PASS', result.stdout)

if __name__ == '__main__':
    unittest.main()
