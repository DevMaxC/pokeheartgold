#!/usr/bin/env python3
"""Render two original Repel SEs; preserve their distinct native PLAYER3/4 IDs."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
RENDERER = '80f878b0ebf100f391028bcef69f7c5743473770'
CUES = {1500: ('SEQ_SE_DP_SELECT', 4, 54), 1535: ('SEQ_SE_DP_CARD2', 3, 110)}
sha = lambda data: hashlib.sha256(data).hexdigest()


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def export(output, renderer):
    require(importlib.metadata.version('ndspy') == '4.2.0', 'Pinned ndspy required')
    require(importlib.metadata.version('numpy') == '2.2.6', 'Pinned numpy required')
    require(subprocess.check_output(['git', '-C', str(renderer), 'rev-parse', 'HEAD'], text=True).strip() == RENDERER, 'Pinned renderer commit required')
    require(not subprocess.check_output(['git', '-C', str(renderer), 'status', '--porcelain', '--untracked-files=no'], text=True).strip(), 'Renderer tracked files must be clean')
    sys.path.insert(0, str(renderer))
    import numpy as np
    from ndspy.soundArchive import SDAT
    from dualrip.formats.sdat.sdat import SdatFile
    from dualrip.engine.sdat.render import LiveRenderer
    from dualrip.export import write_wav
    source = ROOT / 'files/data/sound/gs_sound_data.sdat'
    raw = source.read_bytes()
    u16 = lambda at: struct.unpack_from('<H', raw, at)[0]
    u32 = lambda at: struct.unpack_from('<I', raw, at)[0]
    symb, info, fat = (u32(at) for at in (0x10, 0x18, 0x20))

    def record(section, table, index):
        start = section + u32(section + 8 + table * 4)
        require(index < u32(start), 'Missing native record')
        relative = u32(start + 4 + index * 4)
        return section + relative if relative else None

    def symbol(table, index):
        at = record(symb, table, index)
        return raw[at:raw.index(b'\0', at)].decode('ascii') if at else None

    def resource(file_id):
        at, size = u32(fat + 12 + file_id * 16), u32(fat + 16 + file_id * 16)
        return {'fileId': file_id, 'offset': at, 'size': size, 'sha256': sha(raw[at:at + size])}

    original, archive = SDAT(raw), SdatFile(str(source))
    players = {}
    for id in (3, 4):
        rec = record(info, 4, id)
        require(rec is not None, 'Missing native SE player')
        players[str(id)] = {'id': id, 'maxSequences': raw[rec], 'channelMask': u16(rec + 2), 'heapSize': u32(rec + 4), 'recordOffset': rec, 'recordSHA256': sha(raw[rec:rec + 8])}
        require((raw[rec], u32(rec + 4), original.sequencePlayers[id][1].maxSequences) == (1, 2000, 1), 'Unexpected native SE capacity')
    catalog = {}
    for id, (name, seq) in enumerate(original.sequences):
        if seq is None or seq.playerID not in (3, 4):
            continue
        rec = record(info, 0, id)
        require(name == symbol(0, id), 'SYMB/independent sequence name mismatch')
        catalog[str(id)] = {'id': id, 'key': name, 'bank': u16(rec + 4), 'volume': raw[rec + 6], 'channelPriority': raw[rec + 7], 'playerPriority': raw[rec + 8], 'player': raw[rec + 9], 'recordOffset': rec, 'recordSHA256': sha(raw[rec:rec + 12])}
    allowed = {'MonoPolySequenceEvent', 'TempoSequenceEvent', 'InstrumentSwitchSequenceEvent', 'TrackVolumeSequenceEvent', 'PortamentoRangeSequenceEvent', 'SweepPitchSequenceEvent', 'PortamentoSequenceEvent', 'NoteSequenceEvent', 'RestSequenceEvent', 'EndTrackSequenceEvent', 'PanSequenceEvent', 'VibratoDepthSequenceEvent'}
    sounds = {}
    output.mkdir(parents=True, exist_ok=True)
    for id, (name, player, volume) in CUES.items():
        meta = catalog[str(id)]
        require((meta['key'], meta['bank'], meta['player'], meta['volume'], meta['channelPriority'], meta['playerPriority']) == (name, 700, player, volume, 104, 64), 'Unexpected literal Repel metadata')
        seq = original.sequences[id][1]
        seq.parse()
        events = {}
        for event in seq.events:
            kind = type(event).__name__
            require(kind in allowed or kind == 'RawDataSequenceEvent' and not bytes(event.data).strip(b'\xff\x00'), 'Unreviewed source sequence event: ' + kind)
            events[kind] = events.get(kind, 0) + 1
        require(events.get('EndTrackSequenceEvent') == 1 and not events.get('JumpSequenceEvent'), 'Repel SE must be finite')
        arc = archive.sequence(id)
        entry = arc.entries[0]
        rec = record(info, 0, id)
        sequence = resource(u16(rec))
        offset = sequence['offset'] + u32(sequence['offset'] + 24)
        require(arc.blob == raw[offset:sequence['offset'] + sequence['size']], 'Renderer event payload differs from original FAT SSEQ')
        require((entry.bank_id, entry.volume, entry.cpr) == (700, volume, 104), 'Renderer metadata differs from native INFO')
        bank, waves = archive.bank(entry.bank_id)
        # SSEQ note/volume/sweep/portamento/sample events, not synthesized tones.
        render = LiveRenderer(arc.blob, entry.offset, bank, waves, volume, 32768, player_prio=entry.cpr, loop_passes=1)
        chunks = []
        while not render.finished:
            chunk = render.step()
            if chunk is not None:
                chunks.append(chunk)
            require(render.emitted < 32768 * 10, 'Unexpected finite native SE duration')
        pcm = np.concatenate(chunks)
        require(not render.loop_marks and len(pcm) > 0 and np.max(np.abs(pcm.astype(np.int32))) > 0, 'Native SE must be finite/nonempty/nonzero')
        target = output / f'{id}-{name}.wav'
        write_wav(str(target), pcm, 32768, None)
        bank_rec = record(info, 2, 700)
        wave_ids = [u16(bank_rec + 4 + slot * 2) for slot in range(4)]
        waves = [{'id': wid, 'key': symbol(3, wid), **resource(u16(record(info, 3, wid)))} for wid in wave_ids if wid != 65535]
        sounds[str(id)] = {**meta, 'file': target.name, 'sampleRate': 32768, 'frames': len(pcm), 'channels': 2, 'loopFrames': None, 'wavSHA256': sha(target.read_bytes()), 'pcmSHA256': sha(pcm.tobytes()), 'sequence': sequence, 'eventPayloadOffset': offset, 'eventPayloadSHA256': sha(arc.blob), 'events': events, 'bankResource': resource(u16(bank_rec)), 'waveArchives': waves, 'rendererLoopPasses': 1}
    engine_files = sorted((renderer / 'dualrip/engine/sdat').glob('*.py')) + sorted((renderer / 'dualrip/formats/sdat').glob('*.py')) + [renderer / 'dualrip/export.py']
    source_files = ['src/application/bag/bag_app.c', 'src/field/field_move_cut_in_effects.c', 'files/fielddata/script/scr_seq/scr_seq_0003.s', 'include/constants/sndseq.h', 'src/sound_playback.c', 'src/sound_system.c', 'src/sound_gb.c', 'src/sound.c', 'src/main.c', 'lib/NitroSystem/src/snd_player.c', 'lib/NitroSystem/src/snd_fader.c', 'lib/NitroSystem/src/snd_arc_player.c', 'lib/include/nnsys/snd/seqdata.h']
    manifest = {'version': 1, 'players': players, 'playerSequences': catalog, 'sounds': sounds, 'sourceSDATSHA256': sha(raw), 'sourceFiles': {p: sha((ROOT / p).read_bytes()) for p in source_files}, 'renderer': {'commit': RENDERER, 'ndspy': '4.2.0', 'numpy': '2.2.6', 'files': {str(p.relative_to(renderer)): sha(p.read_bytes()) for p in engine_files}, 'limitation': 'Pinned original SSEQ/sample emulator render; not DS hardware/DAC/global16-channel capture. SELECT is native PLAYER4, CARD2 PLAYER3. Finite voices are not timers; completion remains counted until injected source sound-update boundary.'}}
    encoded = (json.dumps(manifest, indent=2) + '\n').encode()
    (output / 'resources.json').write_bytes(encoded)
    if output.resolve() == (ROOT / 'browser/public/source/repel-audio').resolve():
        (ROOT / 'browser/src/source/repel-audio-data.ts').write_text('// Generated from original SDAT by export_repel_audio.py.\nexport const REPEL_AUDIO_MANIFEST_SHA256=' + repr(sha(encoded)) + ';\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--renderer', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'browser/public/source/repel-audio')
    args = parser.parse_args()
    result = export(args.output, args.renderer)
    print(json.dumps({'players': result['players'], 'sounds': {id: {key: row[key] for key in ['player', 'frames', 'loopFrames', 'wavSHA256']} for id, row in result['sounds'].items()}}, indent=2))
