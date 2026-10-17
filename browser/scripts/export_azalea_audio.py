#!/usr/bin/env python3
"""Export original Azalea SSEQ cues with source PLAYER provenance. No composition."""
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
CUES = {1561: 'SEQ_SE_DP_KI_GASYAN', 2171: 'SEQ_SE_GS_ITOMARU_ROBO'}
sha = lambda data: hashlib.sha256(data).hexdigest()


def export(output, renderer):
    assert importlib.metadata.version('ndspy') == '4.2.0'
    assert importlib.metadata.version('numpy') == '2.2.6'
    assert subprocess.check_output(['git', '-C', str(renderer), 'rev-parse', 'HEAD'], text=True).strip() == RENDERER
    assert not subprocess.check_output(['git', '-C', str(renderer), 'status', '--porcelain', '--untracked-files=no'], text=True).strip()
    sys.path.insert(0, str(renderer))
    import numpy as np
    from ndspy.soundArchive import SDAT
    from dualrip.formats.sdat.sdat import SdatFile
    from dualrip.engine.sdat.render import LiveRenderer
    from dualrip.export import write_wav
    source = ROOT / 'files/data/sound/gs_sound_data.sdat'
    raw = source.read_bytes()
    u16 = lambda offset: struct.unpack_from('<H', raw, offset)[0]
    u32 = lambda offset: struct.unpack_from('<I', raw, offset)[0]
    symb, info, fat = (u32(offset) for offset in (0x10, 0x18, 0x20))

    def record(section, table, index):
        start = section + u32(section + 8 + table * 4)
        assert index < u32(start)
        relative = u32(start + 4 + index * 4)
        return section + relative if relative else None

    def symbol(table, index):
        offset = record(symb, table, index)
        return raw[offset:raw.index(b'\0', offset)].decode('ascii') if offset else None

    def resource(file_id):
        offset, size = u32(fat + 12 + file_id * 16), u32(fat + 16 + file_id * 16)
        return {'fileId': file_id, 'offset': offset, 'size': size, 'sha256': sha(raw[offset:offset + size])}

    original, archive = SDAT(raw), SdatFile(str(source))
    player_rec = record(info, 4, 3)
    player_bytes = raw[player_rec:player_rec + 8]
    player = {'id': 3, 'maxSequences': raw[player_rec], 'channelMask': u16(player_rec + 2), 'heapSize': u32(player_rec + 4), 'recordOffset': player_rec, 'recordSHA256': sha(player_bytes)}
    assert (player['maxSequences'], player['heapSize']) == (1, 2000)
    assert original.sequencePlayers[3][1].maxSequences == 1
    catalog = {}
    for index, (name, seq) in enumerate(original.sequences):
        if seq is None or seq.playerID != 3:
            continue
        rec = record(info, 0, index)
        assert name == symbol(0, index)
        catalog[str(index)] = {'id': index, 'key': name, 'bank': u16(rec + 4), 'volume': raw[rec + 6], 'channelPriority': raw[rec + 7], 'playerPriority': raw[rec + 8], 'player': raw[rec + 9], 'recordOffset': rec, 'recordSHA256': sha(raw[rec:rec + 12])}
    allowed = {'DefineTracksSequenceEvent', 'BeginTrackSequenceEvent', 'MonoPolySequenceEvent', 'TempoSequenceEvent', 'InstrumentSwitchSequenceEvent', 'TrackVolumeSequenceEvent', 'PanSequenceEvent', 'PortamentoRangeSequenceEvent', 'PortamentoSequenceEvent', 'NoteSequenceEvent', 'RestSequenceEvent', 'EndTrackSequenceEvent', 'JumpSequenceEvent', 'VibratoSpeedSequenceEvent', 'VibratoRangeSequenceEvent', 'VibratoDepthSequenceEvent'}
    sounds = {}
    output.mkdir(parents=True, exist_ok=True)
    for id, name in CUES.items():
        meta = catalog[str(id)]
        assert (meta['key'], meta['bank'], meta['player'], meta['channelPriority'], meta['playerPriority']) == (name, 750, 3, 89, 64)
        seq = original.sequences[id][1]
        seq.parse()
        event_counts = {}
        for event in seq.events:
            kind = type(event).__name__
            assert kind in allowed or kind == 'RawDataSequenceEvent' and not bytes(event.data).strip(b'\xff\x00'), kind
            event_counts[kind] = event_counts.get(kind, 0) + 1
        assert event_counts.get('JumpSequenceEvent', 0) == (1 if id == 2171 else 0)
        arc = archive.sequence(id)
        entry = arc.entries[0]
        rec = record(info, 0, id)
        sequence = resource(u16(rec))
        event_offset = sequence['offset'] + u32(sequence['offset'] + 24)
        assert arc.blob == raw[event_offset:sequence['offset'] + sequence['size']]
        assert (entry.bank_id, entry.volume, entry.cpr) == (meta['bank'], meta['volume'], meta['channelPriority'])
        bank, waves = archive.bank(entry.bank_id)
        # Two traversals retain an actual second loop, including prior voice state.
        render = LiveRenderer(arc.blob, entry.offset, bank, waves, entry.volume, 32768, player_prio=entry.cpr, loop_passes=2 if id == 2171 else 1)
        chunks = []
        while not render.finished:
            value = render.step()
            if value is not None:
                chunks.append(value)
            assert render.emitted < 32768 * 60, 'Unexpected native cue duration'
        pcm = np.concatenate(chunks)
        loop = list(render.loop_marks) if render.loop_marks else None
        assert (loop is not None) == (id == 2171)
        if loop:
            assert 0 < loop[0] < loop[1] <= len(pcm)
            assert render.ply.loop_end2_sample is not None
        assert np.max(np.abs(pcm.astype(np.int32))) > 0
        target = output / f'{id}-{name}.wav'
        write_wav(str(target), pcm, 32768, loop)
        bank_rec = record(info, 2, 750)
        wave_ids = [u16(bank_rec + 4 + slot * 2) for slot in range(4)]
        wave_resources = [{'id': wid, 'key': symbol(3, wid), **resource(u16(record(info, 3, wid)))} for wid in wave_ids if wid != 65535]
        sounds[str(id)] = {**meta, 'file': target.name, 'sampleRate': 32768, 'frames': len(pcm), 'channels': 2, 'loopFrames': loop, 'wavSHA256': sha(target.read_bytes()), 'pcmSHA256': sha(pcm.tobytes()), 'sequence': sequence, 'eventPayloadOffset': event_offset, 'eventPayloadSHA256': sha(arc.blob), 'events': event_counts, 'bankResource': resource(u16(bank_rec)), 'waveArchives': wave_resources, 'rendererLoopPasses': 2 if id == 2171 else 1}
    engine_files = sorted((renderer / 'dualrip/engine/sdat').glob('*.py')) + sorted((renderer / 'dualrip/formats/sdat').glob('*.py')) + [renderer / 'dualrip/export.py']
    sources = ['src/field/gymmick/azalea.c', 'src/sound_playback.c', 'src/sound.c', 'src/main.c', 'lib/NitroSystem/src/snd_player.c', 'lib/NitroSystem/src/snd_fader.c', 'lib/NitroSystem/src/snd_arc_player.c', 'lib/include/nnsys/snd/seqdata.h']
    manifest = {'version': 1, 'player': player, 'playerSequences': catalog, 'sounds': sounds, 'sourceSDATSHA256': sha(raw), 'sourceFiles': {path: sha((ROOT / path).read_bytes()) for path in sources}, 'renderer': {'commit': RENDERER, 'ndspy': '4.2.0', 'numpy': '2.2.6', 'files': {str(path.relative_to(renderer)): sha(path.read_bytes()) for path in engine_files}, 'limitation': 'Original SSEQ/sample emulator render, not DS hardware/DAC/global channel-pool capture. Robot loops the actual second rendered SSEQ traversal; WebAudio does not execute SSEQ live or reproduce all hardware mixer/voice allocation effects.'}}
    data = json.dumps(manifest, indent=2) + '\n'
    (output / 'resources.json').write_text(data)
    if output.resolve() == (ROOT / 'browser/public/source/azalea-audio').resolve():
        (ROOT / 'browser/src/source/azalea-audio-data.ts').write_text('// Generated by export_azalea_audio.py from the original SDAT.\nexport const AZALEA_AUDIO_MANIFEST_SHA256=' + repr(sha(data.encode())) + ';\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--renderer', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'browser/public/source/azalea-audio')
    args = parser.parse_args()
    result = export(args.output, args.renderer)
    print(json.dumps({'playerSequences': len(result['playerSequences']), 'sounds': {id: {key: value[key] for key in ['frames', 'loopFrames', 'wavSHA256']} for id, value in result['sounds'].items()}}, indent=2))
