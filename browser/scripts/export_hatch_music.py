"""Render the two original hatch sequences with pinned native banks/samples.

No MIDI conversion, alternate instruments, normalization or composed audio.
Requires Python3.10+, numpy==2.2.6, ndspy==4.2.0 and a clean checkout of
https://github.com/TetraSsky/DualRip at RENDERER_COMMIT below. This is an
offline source-sequence emulator render, not a bit-exact DS hardware capture.
--output permits a second byte-for-byte reproducibility run.
"""
from pathlib import Path
import argparse, hashlib, importlib.metadata, json, struct, subprocess, sys

RENDERER_COMMIT = '80f878b0ebf100f391028bcef69f7c5743473770'
def check(condition, message):
    if not condition:
        raise SystemExit(message)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--renderer', type=Path, required=True)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
renderer = args.renderer.resolve()
check(subprocess.check_output(['git', '-C', str(renderer), 'rev-parse', 'HEAD'], text=True).strip() == RENDERER_COMMIT, 'Native hatch export source/renderer validation failed: 18')
check(not subprocess.check_output(['git', '-C', str(renderer), 'status', '--porcelain', '--untracked-files=no'], text=True).strip(), 'Renderer must be unchanged')
check(importlib.metadata.version('numpy') == '2.2.6', 'Native hatch export source/renderer validation failed: 20')
check(importlib.metadata.version('ndspy') == '4.2.0', 'Native hatch export source/renderer validation failed: 21')
sys.path.insert(0, str(renderer))
import numpy as np
from dualrip.formats.sdat.sdat import SdatFile
from dualrip.engine.sdat.render import LiveRenderer, estimate_end_sample
from dualrip.export import write_wav
from ndspy.soundArchive import SDAT

root = Path(__file__).resolve().parents[2]
source = root / 'files/data/sound/gs_sound_data.sdat'
native = source.read_bytes()
output = args.output or root / 'browser/public/source/hatching/music'
output.mkdir(parents=True, exist_ok=True)
hash_bytes = lambda data: hashlib.sha256(data).hexdigest()
u16 = lambda offset: struct.unpack_from('<H', native, offset)[0]
u32 = lambda offset: struct.unpack_from('<I', native, offset)[0]
symb, info, fat = u32(0x10), u32(0x18), u32(0x20)
def record(section, table, index):
    table_offset = section + u32(section + 8 + table * 4)
    check(index < u32(table_offset), 'Native hatch export source/renderer validation failed: 40')
    return section + u32(table_offset + 4 + index * 4)
def symbol(table, index):
    offset = record(symb, table, index)
    return native[offset:native.index(b'\0', offset)].decode('ascii')
def resource(file_id):
    offset, size = u32(fat + 12 + file_id * 16), u32(fat + 16 + file_id * 16)
    return {'fileId': file_id, 'offset': offset, 'size': size,
            'sha256': hash_bytes(native[offset:offset + size])}

archive = SdatFile(str(source))
parsed = SDAT(native)
# All executable musical commands in these two assets are supported by the
# pinned interpreter. Raw-data suffixes are unreachable FF end/padding bytes.
commands = {0x80, 0x81, 0x93, 0x94, 0x95, 0xC0, 0xC1, 0xC4, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCC, 0xCD, 0xE0, 0xE1, 0xFD, 0xFE, 0xFF}
tracks = {}
for sid, key in [(1011, 'SEQ_GS_SHINKA'), (1188, 'SEQ_ME_SHINKAOME')]:
    check(symbol(0, sid) == key, 'Native hatch export source/renderer validation failed: 58')
    seq_record = record(info, 0, sid)
    bank_id = u16(seq_record + 4)
    check(bank_id == 700 and symbol(2, bank_id) == 'BANK_BASIC', 'Native hatch export source/renderer validation failed: 61')
    seq = parsed.sequences[sid][1]
    seq.parse()
    event_counts = {}
    for event in seq.events:
        name = type(event).__name__
        event_counts[name] = event_counts.get(name, 0) + 1
        if name == 'RawDataSequenceEvent':
            check(bytes(event.data).strip(b'\xff\x00') == b'', 'Native hatch export source/renderer validation failed: 69')
        else:
            opcode = event.type
            check(opcode < 0x80 or opcode in commands, (key, name, opcode))
    arc = archive.sequence(sid)
    entry = arc.entries[0]
    check(entry.name == key and entry.bank_id == bank_id and entry.volume == native[seq_record + 6], 'Native hatch export source/renderer validation failed: 75')
    bank, waves = archive.bank(bank_id)  # no heuristic bank remapping
    render = LiveRenderer(arc.blob, entry.offset, bank, waves, entry.volume,
                          32768, player_prio=entry.cpr, loop_passes=2)
    chunks = []
    while not render.finished:
        chunk = render.step()
        if chunk is not None:
            chunks.append(chunk)
        check(render.emitted < 32768 * 180, 'Unexpected sequence duration')
    audio = np.concatenate(chunks)
    check(np.max(np.abs(audio.astype(np.int32))) > 0, 'Native hatch export source/renderer validation failed: 86')
    marks = render.loop_marks
    check(bool(marks) == (sid == 1011), 'Native hatch export source/renderer validation failed: 88')
    sequence_end = None if marks else estimate_end_sample(arc.blob, entry.offset, 32768, player_prio=entry.cpr)
    completion = len(audio) if marks else max(len(audio), sequence_end + 32768 // 2)
    target = output / f'{sid}-{key}.wav'
    write_wav(str(target), audio, 32768, marks)
    bank_record = record(info, 2, bank_id)
    wave_ids = [u16(bank_record + 4 + slot * 2) for slot in range(4)]
    resources = []
    for wid in wave_ids:
        if wid == 65535:
            continue
        check(wid == 700 and symbol(3, wid) == 'WAVE_ARC_BASIC', 'Native hatch export source/renderer validation failed: 99')
        resources.append({'id': wid, 'name': symbol(3, wid), **resource(u16(record(info, 3, wid)))})
    tracks[str(sid)] = {'id': sid, 'key': key, 'file': target.name,
        'sampleRate': 32768, 'channels': 2, 'bitsPerSample': 16,
        'frames': len(audio), 'loopFrames': list(marks) if marks else None,
        'sequenceEndFrame': sequence_end, 'completionFrame': completion,
        'volume': entry.volume, 'channelPriority': entry.cpr,
        'player': native[seq_record + 9], 'eventCounts': event_counts,
        'sequence': resource(u16(seq_record)),
        'bank': {'id': bank_id, 'name': symbol(2, bank_id), **resource(u16(bank_record))},
        'waveArchives': resources, 'wavSHA256': hash_bytes(target.read_bytes())}
    print(json.dumps({'id': sid, 'frames': len(audio), 'loopFrames': tracks[str(sid)]['loopFrames'], 'wavSHA256': tracks[str(sid)]['wavSHA256']}), flush=True)
engine_files = sorted((renderer / 'dualrip/engine/sdat').glob('*.py')) + sorted((renderer / 'dualrip/formats/sdat').glob('*.py'))
manifest = {'source': str(source.relative_to(root)), 'sourceSHA256': hash_bytes(native),
    'renderer': {'repository': 'https://github.com/TetraSsky/DualRip', 'commit': RENDERER_COMMIT,
                 'license': 'MIT', 'numpy': '2.2.6', 'ndspy': '4.2.0',
                 'files': {str(path.relative_to(renderer)): hash_bytes(path.read_bytes()) for path in engine_files}},
    'policy': 'Native SSEQ + exact INFO bank/SWAR sample dependencies; no MIDI, substitute instruments, normalization, fades or composed replacement.',
    'limitations': ['Emulated sequence/sample rendering, not a bit-exact DS hardware/DAC or shared-channel mixer capture.',
                    'Only cues1011 and1188 are exported; general field/radio/surf music playback is not implemented.',
                    'Fanfare completion includes native sound_playback.c fifteen-frame post-sequence wait at the source thirty-Hz app cadence.'],
    'tracks': tracks}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
