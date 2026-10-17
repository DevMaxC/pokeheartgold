"""Encode verified native field renders for on-demand mobile playback.

AAC/M4A128k primary, MP3 fallback; standard48000Hz codec input. Native render
time remains32768Hz, so original loop points retain their source seconds.
Keep lossless render cache offline; --output is the small deployable catalog.
"""
from pathlib import Path
import argparse
import gzip
import hashlib
import io
import json
import subprocess
import tempfile
import time
import wave
import sys
import importlib.metadata
import inspect
import numpy as np

SHA = lambda value: hashlib.sha256(value).hexdigest()
INITIAL_CODEC_RECIPE = 'c1480038c80c28e94fc9165f7d7c335c1303316b3751ab15ec52d9659f728a97'
INITIAL_FFMPEG = 'ffmpeg version 8.0.1 Copyright (c) 2000-2025 the FFmpeg developers'


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def encode(row, source, output):
    wave_format = next(item for item in row['formats'] if item['codec'] == 'gzip-wav')
    compressed = (source / wave_format['file']).read_bytes()
    check(SHA(compressed) == wave_format['sha256'], 'Changed native render cache')
    original_wave = gzip.decompress(compressed)
    check(SHA(original_wave) == wave_format['decodedSHA256'], 'Changed original RIFF bytes')
    with wave.open(io.BytesIO(original_wave), 'rb') as original:
        check(original.getframerate() == 32768 and original.getnchannels() == 2 and original.getsampwidth() == 2, 'Unexpected native PCM format')
        full_pcm = original.readframes(original.getnframes())
    check(SHA(full_pcm) == row['pcmSHA256'], 'Original rendered PCM proof changed')
    # Preserve the entire original intro/first pass AND the verified second
    # steady cycle. Remove only the unused post-loop release tail, never splice
    # out a pass that may carry different notes/envelopes from the intro.
    frames = row['loopFrames'][1] if row['loopFrames'] else row['frames']
    pcm = full_pcm[:frames * 4]
    formats, receipts = [], []
    with tempfile.TemporaryDirectory(prefix='native-music-encode-') as temp:
        temp = Path(temp)
        wav = temp / 'native.wav'
        with wave.open(str(wav), 'wb') as file:
            file.setnchannels(2)
            file.setsampwidth(2)
            file.setframerate(32768)
            file.writeframes(pcm)
        reference = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(wav), '-ar', '48000', '-f', 's16le', '-'])
        reference_signal = np.frombuffer(reference, dtype='<i2').reshape(-1, 2).astype(np.float64).mean(axis=1)[:240000]
        reference_signal -= reference_signal.mean()
        fft_length = 1 << (len(reference_signal) * 2 - 1).bit_length()
        fft_reference = np.fft.rfft(reference_signal, fft_length)
        for codec, extension in [('aac', 'm4a'), ('libmp3lame', 'mp3')]:
            name = f"{row['id']}-{row['key']}.{extension}"
            target = output / name
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-map_metadata', '-1', '-ar', '48000',
                            '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', codec, '-b:a', '128k',
                            *(['-movflags', '+faststart'] if codec == 'aac' else []), str(target)], check=True)
            decoded = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(target), '-f', 's16le', '-c:a', 'pcm_s16le', '-'])
            signal = np.frombuffer(decoded, dtype='<i2').reshape(-1, 2).astype(np.float64).mean(axis=1)[:len(reference_signal)]
            check(len(signal) == len(reference_signal), 'Compressed cue lost the beginning of native audio')
            signal -= signal.mean()
            correlation = np.fft.irfft(np.fft.rfft(signal, fft_length) * np.conj(fft_reference), fft_length)
            shifts = np.arange(-2048, 2049)
            shift = int(shifts[np.argmax(correlation[shifts % fft_length])])
            pearson = float(np.dot(reference_signal, signal) / (np.linalg.norm(reference_signal) * np.linalg.norm(signal)))
            check(abs(shift) <= 1 and pearson >= .90, f'Unverified codec alignment: {codec} shift={shift} correlation={pearson}')
            packets = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_packets', '-show_streams', '-select_streams', 'a:0',
                '-show_entries', 'packet=pts,duration,side_data_list:stream=codec_name,sample_rate,duration,start_time,nb_frames', '-of', 'json', str(target)]))
            decoded_frames = len(decoded) // 4
            check(abs(decoded_frames - len(reference) // 4) <= 1024, 'Unexpected untrimmed codec priming/padding')
            entry = {'codec': 'aac' if codec == 'aac' else 'mp3', 'file': name, 'bytes': target.stat().st_size,
                     'sha256': SHA(target.read_bytes()), 'decodedSampleRate': 48000, 'decodedFrames': decoded_frames,
                     'leadingFrames': max(0, shift)}
            formats.append(entry)
            receipts.append({'codec': entry['codec'], 'decodedFrames': decoded_frames, 'resampledReferenceFrames': len(reference) // 4,
                             'alignmentLagFrames48000': shift, 'firstFiveSecondsPearson': pearson,
                             'stream': packets['streams'][0], 'firstPacket': packets['packets'][0], 'lastPacket': packets['packets'][-1]})
    return {**row, 'frames': frames, 'untrimmedRenderFrames': row['frames'], 'formats': formats,
            'encodedContentPCMSHA256': SHA(pcm), 'encoding': {'sampleRate': 48000, 'bitrate': 128000,
            'lossy': True, 'preservedIntroAndFirstPass': True, 'trimmedOnlyUnusedPostLoopTail': bool(row['loopFrames']),
            'codecReceipts': receipts, 'browserAudition': 'not performed; mobile decoder/loop listening remains pending'}}


def compatible_cache(previous, row, recipe, ffmpeg, adopt_initial=False):
    provenance = previous.get('codecProvenance', {})
    producer = provenance.get('recipeSHA256') == recipe and (provenance.get('ffmpeg') == ffmpeg or (provenance.get('ffmpeg') is None and provenance.get('compatibleInitialCacheAdopted') and provenance.get('adoptedUnderFFmpeg') == ffmpeg))
    legacy = adopt_initial and not provenance and recipe == INITIAL_CODEC_RECIPE and ffmpeg == INITIAL_FFMPEG
    frames = row['loopFrames'][1] if row.get('loopFrames') else row['frames']
    return ((producer or legacy) and previous.get('pcmSHA256') == row['pcmSHA256']
            and previous.get('untrimmedRenderFrames') == row['frames']
            and previous.get('loopFrames') == row.get('loopFrames') and previous.get('frames') == frames)


def validate_input(row, catalog):
    exporter = catalog.get('exporter', {})
    current = exporter.get('scriptSHA256')
    check(current and current in (row.get('validatedByScriptSHA256'), row.get('renderProducerScriptSHA256')),
          'Native cue lacks current exporter validation receipt')
    check(row.get('renderRecipeSHA256') == exporter.get('renderRecipeSHA256'), 'Native render recipe receipt mismatch')
    flow = row.get('controlFlow', {})
    check(flow.get('method') == 'literal-offset-conservative-static-control-flow-v3' and flow.get('literalOffsetsAndOperandsVerified'),
          'Native cue lacks current literal control-flow proof')
    proof = row.get('loopProof', {})
    check(proof.get('looping') == bool(row.get('loopFrames')), 'Native cue lacks current loop proof')
    if row.get('loopFrames'):
        check(proof.get('allNoteRestTracksLoop') and proof.get('allTracksAlreadyOnSecondPass'), 'Native steady loop tracks not verified')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--watch', action='store_true')
    parser.add_argument('--adopt-initial-cache', action='store_true', help='Explicit same codec-recipe migration; original wrapper hash not retained')
    parser.add_argument('--receipts', type=Path, help='Offline encoder receipt cache; defaults beside output')
    parser.add_argument('--max-wait', type=float, default=5400)
    args = parser.parse_args()
    source, output = args.source.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    receipt_dir = args.receipts.resolve() if args.receipts else output / 'encoding-receipts'
    receipt_dir.mkdir(exist_ok=True)
    recipe = SHA(inspect.getsource(encode).rstrip('\n').encode())
    ffmpeg_version = subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0]
    started = time.monotonic()
    while True:
        try:
            catalog = json.loads((source / 'catalog.json').read_text())
        except json.JSONDecodeError:
            check(time.monotonic() - started < args.max_wait, 'Timed out reading render catalog')
            time.sleep(.25)
            continue
        for sid, row in catalog['tracks'].items():
            if row['status'] != 'ready':
                continue
            validate_input(row, catalog)
            receipt = receipt_dir / (sid + '.json')
            if receipt.exists():
                previous = json.loads(receipt.read_text())
                provenance = previous.get('codecProvenance', {})
                if provenance.get('compatibleInitialCacheAdopted') and provenance.get('producerScriptSHA256') is None and provenance.get('ffmpeg'):
                    provenance['adoptedUnderFFmpeg'] = provenance['ffmpeg']
                    provenance['ffmpeg'] = None
                    receipt.write_text(json.dumps(previous, indent=2) + '\n')
                if compatible_cache(previous, row, recipe, ffmpeg_version, args.adopt_initial_cache) and all((output / fmt['file']).exists() and SHA((output / fmt['file']).read_bytes()) == fmt['sha256'] for fmt in previous['formats']):
                    if not previous.get('codecProvenance'):
                        previous['codecProvenance'] = {'recipeSHA256': recipe, 'ffmpeg': None, 'adoptedUnderFFmpeg': ffmpeg_version, 'producerScriptSHA256': None, 'compatibleInitialCacheAdopted': True}
                        receipt.write_text(json.dumps(previous, indent=2) + '\n')
                    continue
            result = encode(row, source, output)
            result['codecProvenance'] = {'recipeSHA256': recipe, 'ffmpeg': ffmpeg_version, 'producerScriptSHA256': SHA(Path(__file__).read_bytes())}
            receipt.write_text(json.dumps(result, indent=2) + '\n')
            print(json.dumps({'id': row['id'], 'key': row['key'], 'encodedBytes': sum(f['bytes'] for f in result['formats']),
                              'alignment': [r['alignmentLagFrames48000'] for r in result['encoding']['codecReceipts']]}), flush=True)
        pending = [row for row in catalog['tracks'].values() if row.get('reason') == 'Native cue has not been exported']
        if not pending or not args.watch:
            break
        check(time.monotonic() - started < args.max_wait, 'Timed out waiting for native renders')
        time.sleep(1)
    tracks = {}
    for sid, row in catalog['tracks'].items():
        receipt = receipt_dir / (sid + '.json')
        if row['status'] == 'ready' and receipt.exists():
            encoded = json.loads(receipt.read_text())
            check(encoded['pcmSHA256'] == row['pcmSHA256'], 'Stale encoder proof for native cue ' + sid)
            tracks[sid] = {**row, **{key: encoded[key] for key in ['frames', 'untrimmedRenderFrames', 'formats', 'encodedContentPCMSHA256', 'encoding', 'codecProvenance']}, 'renderProof': {'offlineOnly': True, 'frames': row['frames'], 'pcmSHA256': row['pcmSHA256'], 'losslessFormats': row['formats']}}
        else:
            tracks[sid] = row
    # Same original audio is legitimately assigned to several named cues. Keep
    # every native ID/dependency receipt, but deploy each byte-identical codec
    # payload once. Filename identity never decides musical equivalence.
    unique, duplicate_files = {}, 0
    for row in tracks.values():
        for index, fmt in enumerate(row.get('formats', [])):
            key = (fmt['codec'], fmt['sha256'])
            if key in unique:
                check(fmt['bytes'] == unique[key]['bytes'], 'Hash-equivalent payload size changed')
                row['formats'][index] = {**fmt, 'file': unique[key]['file']}
                duplicate_files += 1
            else:
                unique[key] = fmt

    final = {**catalog, 'tracks': tracks, 'surfSuppressionFlagId': 0x99A,
             'delivery': {'primary': 'aac', 'fallback': 'mp3', 'bitrate': 128000, 'sampleRate': 48000, 'onDemand': True, 'uniqueFiles': len(unique), 'duplicateCueFilesSuppressed': duplicate_files, 'totalBytes': sum(fmt['bytes'] for fmt in unique.values()), 'tools': {'ffmpeg': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0], 'ffprobe': subprocess.check_output(['ffprobe', '-version'], text=True).splitlines()[0], 'python': sys.version, 'numpy': importlib.metadata.version('numpy')}, 'encoderSHA256': SHA(Path(__file__).read_bytes())},
             'limitations': ['Original native SSEQ/banks rendered by pinned emulator; not a bit-exact hardware/DAC/shared-channel capture.',
                             'Delivery is lossy AAC/MP3; original render/FLAC PCM equality proofs are retained separately, not claimed for lossy files.',
                             'FFmpeg gapless/priming, alignment and decoded-frame receipts are offline evidence, not actual Safari/browser audition.',
                             'Unexported or unsupported cue IDs remain explicit; no replacement tune is used.']}
    proof = json.dumps(final, indent=2) + '\n'
    (output / 'catalog-proof.json').write_text(proof)
    runtime_keys = ['version', 'maps', 'storyOverrides', 'surf', 'surfSuppressionFlag', 'surfSuppressionFlagId', 'nightHours', 'battle']
    runtime = {key: final[key] for key in runtime_keys}
    runtime['tracks'] = {sid: {key: row[key] for key in ['id', 'key', 'status', 'reason', 'sampleRate', 'frames', 'channels', 'loopFrames', 'formats'] if key in row} for sid, row in tracks.items()}
    runtime['sourceProofSHA256'] = SHA(proof.encode())
    runtime['delivery'] = {key: final['delivery'][key] for key in ['primary', 'fallback', 'onDemand', 'uniqueFiles', 'duplicateCueFilesSuppressed', 'totalBytes']}
    target = output / 'catalog-final.json'
    target.write_text(json.dumps(runtime, indent=2) + '\n')
    print(json.dumps({'catalog': str(target), 'tracks': len(tracks), 'ready': sum(r['status'] == 'ready' for r in tracks.values()),
                      'pendingRender': len(pending), 'bytes': sum(f['bytes'] for r in tracks.values() for f in r.get('formats', []))}), flush=True)


if __name__ == '__main__':
    main()
