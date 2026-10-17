"""Export original mapped field SSEQ/banks as on-demand lossless music.

Pinned DualRip, numpy2.2.6, ndspy4.2.0; ffmpeg FLAC plus compressed exact WAV
fallback. No MIDI, replacement instrument bank, normalization or composed tune.
This is sample/sequence emulation, not a DS hardware/shared-channel DSP capture.
"""
from pathlib import Path
import argparse
import concurrent.futures
import gzip
import hashlib
import importlib.metadata
import json
import re
import struct
import subprocess
import sys
import tempfile
import platform
import inspect

ROOT = Path(__file__).resolve().parents[2]
PIN = '80f878b0ebf100f391028bcef69f7c5743473770'
RATE = 32768
SHA = lambda value: hashlib.sha256(value).hexdigest()
INITIAL_RENDER_RECIPE = 'e17cb8889e5aa0111de016ac0b7d66cb1939e7cdc3b5f927d8946178fd3410d7'


def check(condition, reason):
    if not condition:
        raise RuntimeError(reason)


def definitions(path):
    return {key: int(value, 0) for key, value in re.findall(r'^#define\s+(\w+)\s+(0x[0-9A-Fa-f]+|\d+)\b', path.read_text(), re.M)}


def initialize(renderer, output):
    global ARCHIVE, NATIVE, DEST
    sys.path.insert(0, renderer)
    from dualrip.formats.sdat.sdat import SdatFile
    DEST = Path(output)
    source = ROOT / 'files/data/sound/gs_sound_data.sdat'
    NATIVE = source.read_bytes()
    ARCHIVE = SdatFile(str(source))


def u16(offset):
    return struct.unpack_from('<H', NATIVE, offset)[0]


def u32(offset):
    return struct.unpack_from('<I', NATIVE, offset)[0]


def record(section, table, index):
    offset = section + u32(section + 8 + table * 4)
    check(index < u32(offset), 'Native SDAT table index out of range')
    return section + u32(offset + 4 + index * 4)


def resource(file_id):
    fat = u32(32)
    offset, size = u32(fat + 12 + file_id * 16), u32(fat + 16 + file_id * 16)
    return {'fileId': file_id, 'offset': offset, 'bytes': size, 'sha256': SHA(NATIVE[offset:offset + size])}


def track_metadata(cue):
    sid, key = cue['id'], cue['key']
    info = u32(24)
    rec = record(info, 0, sid)
    archive = ARCHIVE.sequence(sid)
    entry = archive.entries[0]
    check(entry.name == key, 'Native cue symbol mismatch')
    sequence = resource(u16(rec))
    start = sequence['offset']
    payload = NATIVE[start + u32(start + 0x18):start + sequence['bytes']]
    check(bytes(archive.blob) == payload, 'Renderer event bytes differ from original FAT SSEQ')
    check(entry.bank_id == u16(rec + 4), 'Native INFO bank mismatch')
    bank_record = record(info, 2, entry.bank_id)
    waves = [u16(bank_record + 4 + slot * 2) for slot in range(4)]
    deps = {'sequence': sequence, 'eventsSHA256': SHA(payload),
            'bank': {'id': entry.bank_id, **resource(u16(bank_record))},
            'waveArchives': [{'id': wid, **resource(u16(record(info, 3, wid)))} for wid in waves if wid != 65535]}
    from field_music_sequence import prove_payload
    proof = prove_payload(payload, entry.offset)
    counts = proof['reachableEventCounts']
    base = {**cue, 'native': deps, 'eventCounts': counts, 'controlFlow': proof,
            'volume': entry.volume, 'channelPriority': entry.cpr, 'player': NATIVE[rec + 9]}
    return base, archive, entry


def export_track(cue):
    import numpy as np
    from dualrip.engine.sdat.render import LiveRenderer
    from dualrip.engine.sdat.sequencer import Player
    from dualrip.export import write_wav
    base, archive, entry = track_metadata(cue)
    sid, key = cue['id'], cue['key']
    counts = base['eventCounts']
    if not counts.get('NoteSequenceEvent'):
        return {**base, 'status': 'silence', 'reason': 'Native sequence contains no musical notes', 'renderRecipeSHA256': render_recipe(), 'renderProducerScriptSHA256': SHA(Path(__file__).read_bytes())}
    bank, wave_data = ARCHIVE.bank(entry.bank_id)
    records = []
    original = Player.mark_loop

    def measured(self, begin, end, track=None):
        records.append({'track': track.num if track else None, 'start': begin, 'end': end, 'period': end - begin})
        return original(self, begin, end, track)

    Player.mark_loop = measured
    try:
        render = LiveRenderer(archive.blob, entry.offset, bank, wave_data, entry.volume,
                              RATE, player_prio=entry.cpr, loop_passes=2)
        chunks = []
        while not render.finished:
            chunk = render.step()
            if chunk is not None:
                chunks.append(chunk)
            check(render.emitted < RATE * 360, 'Native sequence exceeded bounded six-minute render')
    finally:
        Player.mark_loop = original
    audio = np.concatenate(chunks)
    check(np.max(np.abs(audio.astype(np.int32))) > 0, 'Native musical sequence rendered silent')
    marks = render.loop_marks
    loop_proof = validate_loop(records, marks, base['controlFlow'])
    with tempfile.TemporaryDirectory(prefix='native-field-cue-') as temp:
        temp = Path(temp)
        wav, flac = temp / 'native.wav', temp / 'native.flac'
        write_wav(str(wav), audio, RATE, marks)
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
                        '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
                        '-c:a', 'flac', '-compression_level', '8', str(flac)], check=True)
        pcm = subprocess.check_output(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(flac),
                                       '-f', 's16le', '-c:a', 'pcm_s16le', '-'])
        check(pcm == audio.tobytes(), 'Lossless FLAC decoded PCM differs from native render')
        compressed_wav = gzip.compress(wav.read_bytes(), compresslevel=9, mtime=0)
        check(gzip.decompress(compressed_wav) == wav.read_bytes(), 'Compressed WAV roundtrip failed')
        name = f'{sid}-{key}'
        flac_name, wave_name = name + '.flac', name + '.wav.gz'
        (DEST / flac_name).write_bytes(flac.read_bytes())
        (DEST / wave_name).write_bytes(compressed_wav)
        formats = [{'codec': 'flac', 'file': flac_name, 'bytes': flac.stat().st_size, 'sha256': SHA(flac.read_bytes())},
                   {'codec': 'gzip-wav', 'file': wave_name, 'bytes': len(compressed_wav), 'sha256': SHA(compressed_wav),
                    'decodedBytes': wav.stat().st_size, 'decodedSHA256': SHA(wav.read_bytes())}]
    return {**base, 'status': 'ready', 'sampleRate': RATE, 'channels': 2, 'frames': len(audio),
            'loopFrames': list(marks) if marks else None, 'loopRecords': records, 'pcmSHA256': SHA(audio.tobytes()),
            'losslessFLACRoundtripVerified': True, 'formats': formats, 'loopProof': loop_proof,
            'renderRecipeSHA256': render_recipe(), 'renderProducerScriptSHA256': SHA(Path(__file__).read_bytes())}


def render_recipe():
    source = inspect.getsource(export_track)
    return SHA(source[source.index('    bank, wave_data = ARCHIVE.bank(entry.bank_id)'):source.index('    marks = render.loop_marks')].encode())


def validate_loop(records, marks, control_flow):
    if not marks:
        return {'looping': False}
    period = marks[1] - marks[0]
    groups = {}
    for row in records:
        groups.setdefault(row['track'], []).append(row)
    for track, rows in groups.items():
        check(len(rows) >= 2, f'Unverified steady loop for track {track}')
        check(abs(rows[-1]['period'] - period) <= 1, f'Unverified differing track loop period {track}')
        check(rows[-1]['start'] <= marks[0], f'Track {track} loop starts after selected steady window')
        check(rows[-1]['end'] >= marks[1], f'Track {track} ends inside selected steady loop')
    immediate = []
    for track in control_flow['trackFlows']:
        if track['track'] not in groups:
            counts = track['eventCounts']
            check(not counts.get('NoteSequenceEvent') and not counts.get('RestSequenceEvent'),
                  f'Unverified nonlooping timed/voiced track {track["track"]}')
            immediate.append(track['track'])
    return {'looping': True, 'loopingTracks': sorted(groups), 'nonloopingImmediateUnvoicedTracks': immediate,
            'allNoteRestTracksLoop': True, 'allLoopsEnterBeforeSelectedWindow': True, 'allTracksAlreadyOnSecondPass': True}


def safe_export(cue):
    try:
        return export_track(cue)
    except Exception as error:
        return {**cue, 'status': 'unsupported', 'reason': type(error).__name__ + ': ' + str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--renderer', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='Offline lossless render cache (not deployed assets)')
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--ids', type=int, nargs='*')
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--adopt-initial-cache', action='store_true', help='Explicitly migrate initial same-recipe corpus; revalidate native flow/loop proof')
    args = parser.parse_args()
    renderer, output = args.renderer.resolve(), args.output.resolve()
    check(subprocess.check_output(['git', '-C', str(renderer), 'rev-parse', 'HEAD'], text=True).strip() == PIN, 'Unpinned renderer')
    check(not subprocess.check_output(['git', '-C', str(renderer), 'status', '--porcelain', '--untracked-files=no'], text=True).strip(), 'Modified renderer')
    for key, version in [('numpy', '2.2.6'), ('ndspy', '4.2.0')]:
        check(importlib.metadata.version(key) == version, 'Wrong native renderer dependency ' + key)
    check(1 <= args.workers <= 8, 'Use one to eight offline render workers')
    constants = {**definitions(ROOT / 'include/constants/maps.h'), **definitions(ROOT / 'include/constants/sndseq.h')}
    maps = {}
    headers = (ROOT / 'src/data/map_headers.h').read_text()
    for key, body in re.findall(r'\[(MAP_\w+)\]\s*=\s*\{(.*?)\}', headers, re.S):
        fields = dict(re.findall(r'\.(\w+)\s*=\s*(\w+)', body))
        maps[str(constants[key])] = {phase: {'id': constants[fields[phase + 'MusicId']], 'key': fields[phase + 'MusicId']} for phase in ('day', 'night')}
    check(len(maps) == 540, 'Changed native map inventory; review scope before exporting')
    overrides = [{'map': constants[map_key], 'mapKey': map_key, 'flag': flag, 'flagId': definitions(ROOT / 'include/constants/flags.h')[flag],
                  'cue': {'id': constants[key], 'key': key}}
                 for map_key, flag, key in re.findall(r'\{\s*(MAP_\w+),\s*(FLAG_\w+),\s*(SEQ_\w+)\s*\}', (ROOT / 'src/sys_flags.c').read_text())]
    check(len(overrides) == 13, 'Changed native story-music override table')
    cues = {cue['id']: cue for row in maps.values() for cue in row.values()}
    cues.update({row['cue']['id']: row['cue'] for row in overrides})
    surf = {'id': constants['SEQ_GS_NAMINORI'], 'key': 'SEQ_GS_NAMINORI'}
    cues[surf['id']] = surf
    battle_source = (ROOT / 'src/battle_intro_config.c').read_text()
    def array(name, count):
        match = re.search(r'\b' + name + r'\[' + str(count) + r'\]\s*=\s*\{(.*?)\n\};', battle_source, re.S)
        check(match is not None, 'Changed native battle music table ' + name)
        return match.group(1)
    battle_definitions = {**constants, **definitions(ROOT / 'include/constants/trainer_class.h'),
                          **definitions(ROOT / 'include/constants/species.h')}
    trainer_rows = [{'key': key, 'id': battle_definitions[key], 'param': int(param)}
                    for key, param in re.findall(r'\{\s*(TRAINERCLASS_\w+),\s*(\d+)\s*\}', array('_020FC3CA', 32))]
    species_rows = [{'key': key, 'id': battle_definitions[key], 'param': int(param)}
                    for key, param in re.findall(r'\{\s*(SPECIES_\w+),\s*(\d+)\s*\}', array('_020FC3B4', 11))]
    music_rows = [{'transition': int(transition, 0), 'cue': {'id': constants[key], 'key': key}}
                  for transition, key in re.findall(r'\{\s*(0x[0-9a-f]+|\d+),\s*(SEQ_\w+)\s*\}', array('_020FC40A', 45))]
    check((len(trainer_rows), len(species_rows), len(music_rows)) == (32, 11, 45), 'Changed battle selector inventory')
    regions = {}
    for key, body in re.findall(r'\[(MAP_\w+)\]\s*=\s*\{(.*?)\}', headers, re.S):
        region = re.search(r'\.regionNo\s*=\s*(MAP_REGION_\w+)', body).group(1)
        check(region in ('MAP_REGION_JOHTO', 'MAP_REGION_KANTO'), 'Unknown native music region')
        regions[str(constants[key])] = 0 if region == 'MAP_REGION_JOHTO' else 1
    flags = definitions(ROOT / 'include/constants/flags.h')
    flypoint = flags['FLAG_SYS_FLYPOINT_PALLET'] + 5
    check(flypoint == flags['FLAG_SYS_FLYPOINT_VERMILION'], 'Changed native battle region flag ABI')
    remaps = {str(value): {'id': value + 9, 'key': next(key for key, sid in constants.items() if sid == value + 9 and key.startswith('SEQ_'))}
              for value in (0x45c, 0x45d)}
    battle = {'trainerClasses': trainer_rows, 'wildSpecies': species_rows, 'parameters': music_rows, 'mapRegions': regions,
              'palParkMap': constants['MAP_PAL_PARK'], 'kantoFlypointFlag': 'FLAG_SYS_FLYPOINT_VERMILION',
              'kantoFlypointFlagId': flypoint, 'regionRemaps': remaps,
              'alwaysTrueGymGuard': True, 'source': 'src/battle_intro_config.c'}
    cues.update({row['cue']['id']: row['cue'] for row in music_rows})
    cues.update({cue['id']: cue for cue in remaps.values()})
    inputs = ['src/battle_intro_config.c', 'include/constants/trainer_class.h', 'include/constants/species.h', 'include/map_header.h',
              'files/data/sound/gs_sound_data.sdat' , 'src/data/map_headers.h', 'src/field_bgm.c', 'src/sys_flags.c',
              'src/gf_rtc.c', 'include/constants/maps.h', 'include/constants/sndseq.h', 'include/constants/flags.h']
    rtc_source = (ROOT / 'src/gf_rtc.c').read_text()
    time_table = re.search(r'sTimeOfDayByHour\[24\]\s*=\s*\{(.*?)\}', rtc_source, re.S)
    check(time_table is not None, 'Changed native RTC hour table')
    phases = re.findall(r'RTC_TIMEOFDAY_\w+', time_table.group(1))
    check(len(phases) == 24, 'Changed native RTC hour inventory')
    night_function = re.search(r'BOOL IsNighttime\(void\)\s*\{(.*?)\n\}', rtc_source, re.S)
    night_phases = re.findall(r'case\s+(RTC_TIMEOFDAY_\w+):', night_function.group(1))
    check(night_phases == ['RTC_TIMEOFDAY_NITE', 'RTC_TIMEOFDAY_LATE'], 'Changed native nighttime selector')
    night_hours = [hour for hour, phase in enumerate(phases) if phase in night_phases]
    source_hashes = {name: SHA((ROOT / name).read_bytes()) for name in inputs}
    engine_files = sorted((renderer / 'dualrip/engine/sdat').glob('*.py')) + sorted((renderer / 'dualrip/formats/sdat').glob('*.py')) + [renderer / 'dualrip/export.py']
    import ndspy.soundSequence, ndspy.soundArchive
    parser_dependencies = {module.__name__: SHA(Path(module.__file__).read_bytes()) for module in (ndspy.soundSequence, ndspy.soundArchive)}
    metadata = {'version': 1, 'sourceHashes': source_hashes, 'exporter': {'scriptSHA256': SHA(Path(__file__).read_bytes()), 'renderRecipeSHA256': render_recipe(), 'sequenceProofSHA256': SHA((Path(__file__).parent / 'field_music_sequence.py').read_bytes()), 'parserFiles': parser_dependencies, 'python': sys.version, 'machine': platform.machine()}, 'renderer': {'repository': 'https://github.com/TetraSsky/DualRip', 'commit': PIN,
                'numpy': '2.2.6', 'ndspy': '4.2.0', 'files': {str(p.relative_to(renderer)): SHA(p.read_bytes()) for p in engine_files}},
                'ffmpeg': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0],
                'battle': battle, 'maps': maps, 'storyOverrides': overrides, 'surf': surf, 'surfSuppressionFlag': 'FLAG_UNK_99A',
                'nightHours': night_hours,
                'limitations': ['Original sequence and sample-bank emulation, not a bit-exact DS hardware/DAC/shared-channel capture.',
                               'Offline lossless FLAC/compressed WAV render proof; encode separately for on-demand AAC/MP3 delivery.',
                               'Only catalogued cues supported. Script/radio/battle callers must pass their actual original cue; missing cues reject explicitly.',
                               'No browser playback or cross-platform render determinism is asserted by offline export proofs.']}
    output.mkdir(parents=True, exist_ok=True)
    catalog_path = output / 'catalog.json'
    previous = json.loads(catalog_path.read_text()) if args.resume and catalog_path.exists() else {}
    reusable = (previous.get('sourceHashes', {}).get('files/data/sound/gs_sound_data.sdat') == source_hashes['files/data/sound/gs_sound_data.sdat'] and previous.get('renderer') == metadata['renderer'])
    initialize(str(renderer), str(output))
    tracks = {}
    for sid, cue in sorted(cues.items()):
        old = previous.get('tracks', {}).get(str(sid)) if reusable else None
        base, _, _ = track_metadata(cue)
        compatible_inputs = old and old.get('native') == base['native'] and old.get('volume') == base['volume'] and old.get('channelPriority') == base['channelPriority'] and old.get('controlFlow', {}).get('entryOffset', 0) == base['controlFlow']['entryOffset']
        compatible_notes = old and ((old.get('status') == 'silence') == (not base['eventCounts'].get('NoteSequenceEvent')))
        compatible_recipe = old and (old.get('renderRecipeSHA256') == render_recipe() or (args.adopt_initial_cache and render_recipe() == INITIAL_RENDER_RECIPE and not old.get('renderRecipeSHA256')))
        if compatible_inputs and compatible_notes and compatible_recipe and old.get('key') == cue['key'] and old.get('status') in ('ready', 'silence') and all((output / f['file']).exists() and SHA((output / f['file']).read_bytes()) == f['sha256'] for f in old.get('formats', [])):
            loop_proof = validate_loop(old.get('loopRecords', []), old.get('loopFrames'), base['controlFlow'])
            provenance = {} if old.get('renderRecipeSHA256') else {'renderProducerScriptSHA256': None, 'compatibleInitialCacheAdopted': True}
            tracks[str(sid)] = {**old, **base, **provenance, 'renderRecipeSHA256': render_recipe(), 'loopProof': loop_proof, 'validatedByScriptSHA256': SHA(Path(__file__).read_bytes())}
        else:
            tracks[str(sid)] = {**cue, 'status': 'unsupported', 'reason': 'Native cue has not been exported'}

    def save():
        temporary = catalog_path.with_suffix('.tmp')
        temporary.write_text(json.dumps({**metadata, 'tracks': tracks}, indent=2) + '\n')
        temporary.replace(catalog_path)

    save()
    pending = [cue for sid, cue in sorted(cues.items()) if tracks[str(sid)]['status'] == 'unsupported' and (args.ids is None or sid in args.ids)]
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers, initializer=initialize, initargs=(str(renderer), str(output))) as pool:
        tasks = {pool.submit(safe_export, cue): cue for cue in pending}
        for future in concurrent.futures.as_completed(tasks):
            result = future.result()
            tracks[str(result['id'])] = result
            save()
            print(json.dumps({key: result.get(key) for key in ('id', 'key', 'status', 'frames', 'reason')}), flush=True)
    print(json.dumps({'maps': len(maps), 'cues': len(cues), 'ready': sum(row['status'] == 'ready' for row in tracks.values()),
                      'silence': sum(row['status'] == 'silence' for row in tracks.values()),
                      'unsupported': sum(row['status'] == 'unsupported' for row in tracks.values())}), flush=True)


if __name__ == '__main__':
    main()
