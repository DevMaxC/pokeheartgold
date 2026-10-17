#!/usr/bin/env python3
"""Independent binary/SDK oracle gates for the two native Azalea cues."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'browser/public/source/azalea-audio'
MANIFEST = json.loads((ASSETS / 'resources.json').read_text())
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def body(text, name):
    start = text.index(name + '(')
    start = text.rfind('\n', 0, start) + 1
    opening = text.index('{', start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[start:end]


class NativeAzaleaAudioTests(unittest.TestCase):
    def test_original_binary_player_and_all_sequence_records(self):
        raw = (ROOT / 'files/data/sound/gs_sound_data.sdat').read_bytes()
        self.assertEqual(sha(raw), MANIFEST['sourceSDATSHA256'])
        u16 = lambda at: struct.unpack_from('<H', raw, at)[0]
        u32 = lambda at: struct.unpack_from('<I', raw, at)[0]
        info, fat = u32(0x18), u32(0x20)
        def record(table, index):
            table = info + u32(info + 8 + table * 4)
            return info + u32(table + 4 + index * 4)
        player = record(4, 3)
        self.assertEqual((raw[player], u16(player + 2), u32(player + 4)), (1, MANIFEST['player']['channelMask'], 2000))
        self.assertEqual(sha(raw[player:player + 8]), MANIFEST['player']['recordSHA256'])
        for key, value in MANIFEST['playerSequences'].items():
            rec = record(0, int(key))
            self.assertEqual((u16(rec + 4), *raw[rec + 6:rec + 10]), (value['bank'], value['volume'], value['channelPriority'], value['playerPriority'], 3))
            self.assertEqual(sha(raw[rec:rec + 12]), value['recordSHA256'])
        for sound in MANIFEST['sounds'].values():
            for res in [sound['sequence'], sound['bankResource'], *sound['waveArchives']]:
                at = fat + 12 + res['fileId'] * 16
                self.assertEqual((u32(at), u32(at + 4)), (res['offset'], res['size']))
                self.assertEqual(sha(raw[res['offset']:res['offset'] + res['size']]), res['sha256'])
            seq = sound['sequence']
            self.assertEqual(sound['eventPayloadOffset'], seq['offset'] + u32(seq['offset'] + 24))
            self.assertEqual(sha(raw[sound['eventPayloadOffset']:seq['offset'] + seq['size']]), sound['eventPayloadSHA256'])

    def test_original_resource_wav_and_loop_chunks(self):
        for sound in MANIFEST['sounds'].values():
            raw = (ASSETS / sound['file']).read_bytes()
            self.assertEqual(sha(raw), sound['wavSHA256'])
            self.assertEqual(raw[:4], b'RIFF')
            self.assertEqual(struct.unpack_from('<I', raw, 4)[0], len(raw) - 8)
            chunks, at = {}, 12
            while at < len(raw):
                size = struct.unpack_from('<I', raw, at + 4)[0]
                chunks[raw[at:at + 4]] = raw[at + 8:at + 8 + size]
                at += 8 + size + size % 2
            self.assertEqual(sha(chunks[b'data']), sound['pcmSHA256'])
            self.assertEqual(len(chunks[b'data']), sound['frames'] * 4)
            self.assertEqual(struct.unpack_from('<HHIIHH', chunks[b'fmt ']), (1, 2, 32768, 131072, 4, 16))
            if sound['id'] == 2171:
                self.assertEqual(struct.unpack_from('<6I', chunks[b'smpl'], 36), (0, 0, 16729, 33457, 0, 0))
                self.assertEqual(sound['events']['JumpSequenceEvent'], 1)
                self.assertEqual(sound['rendererLoopPasses'], 2)
            else:
                self.assertNotIn(b'smpl', chunks)
                self.assertNotIn('JumpSequenceEvent', sound['events'])

    def test_pinned_renderer_reproduces_all_exported_bytes(self):
        spec = importlib.util.spec_from_file_location('export_azalea_audio', ROOT / 'browser/scripts/export_azalea_audio.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            module.export(output, Path('/tmp/hg-dualrip-native-audio'))
            for name in ['resources.json', *(value['file'] for value in MANIFEST['sounds'].values())]:
                self.assertEqual((output / name).read_bytes(), (ASSETS / name).read_bytes())

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
SndPlayerInfo gSndPlayerInfo[4]; NNSSndSeqPlayer existing,allocated;int stops;
void NNS_SndHandleReleaseSeq(NNSSndHandle*h){h->player=0;}
NNSSndSeqPlayer* NNS_FndGetNextListObject(List*l,void*p){return l->numObjects?&existing:0;}
void ForceStopSeq(NNSSndSeqPlayer*p){stops++;gSndPlayerInfo[3].playerList.numObjects=0;}
NNSSndSeqPlayer* AllocSeqPlayer(int priority){allocated.priority=priority;return &allocated;}
void InsertPlayerList(SndPlayerInfo*info,NNSSndSeqPlayer*p){info->playerList.numObjects++;}
'''
        # Original allocation sets player->handle after admission.
        declarations = declarations.replace('struct NNSSndSeqPlayer {int priority;}', 'struct NNSSndSeqPlayer {int priority;void*handle;}')
        source = declarations + fader.replace('#include <nitro.h>', '').replace('#include <nnsys/snd_internal.h>', '') + '\n' + body(player, 'NNSSndSeqPlayer *NNSi_SndPlayerAllocSeqPlayer') + '''
int main(void){
 SndFader f;NNSi_SndFaderInit(&f);NNSi_SndFaderSet(&f,127<<8,1);NNSi_SndFaderUpdate(&f);assert(NNSi_SndFaderGet(&f)==127<<8);
 NNSi_SndFaderSet(&f,0,1);assert(!NNSi_SndFaderIsFinished(&f));assert(NNSi_SndFaderGet(&f)==127<<8);NNSi_SndFaderUpdate(&f);assert(NNSi_SndFaderIsFinished(&f));assert(NNSi_SndFaderGet(&f)==0);
 NNSSndHandle h={0};gSndPlayerInfo[3].playableSeqCount=1;gSndPlayerInfo[3].playerList.numObjects=1;existing.priority=74;
 assert(NNSi_SndPlayerAllocSeqPlayer(&h,3,64)==0);assert(stops==0);assert(gSndPlayerInfo[3].playerList.numObjects==1);
 existing.priority=64;assert(NNSi_SndPlayerAllocSeqPlayer(&h,3,64)==&allocated);assert(stops==1);
 existing.priority=0;assert(NNSi_SndPlayerAllocSeqPlayer(&h,3,54)==&allocated);assert(stops==2);
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
