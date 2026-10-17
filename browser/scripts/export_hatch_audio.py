"""Export native hatch cries from SDAT WAVE_ARC_PVxxx PCM8 samples.

Uses the same lossless signed-PCM8 conversion as export_opening_assets.py.
Requires ndspy. Run from any directory; --output permits a reproducibility check.
"""
from pathlib import Path
import argparse, hashlib, json, struct, wave
from ndspy.soundArchive import SDAT

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
output = args.output or root / 'browser/public/source/hatching'
output.mkdir(parents=True, exist_ok=True)
source = root / 'files/data/sound/gs_sound_data.sdat'
native = source.read_bytes()
archive = SDAT(native)
cries = {}
for species in [175]:
    name = f'WAVE_ARC_PV{species:03}'
    bank = next(bank for key, bank in archive.waveArchives if key == name)
    assert len(bank.waves) == 1
    sample = bank.waves[0]
    assert int(sample.waveType) == 0 and not sample.isLooped, 'Expected native unlooped PCM8 cry'
    pcm = sample.data
    offset = native.find(pcm)
    assert offset >= 12 and native.find(pcm, offset + 1) == -1, 'Source PCM must have one literal location'
    swar = native.rfind(b'SWAR', 0, offset)
    assert swar >= 0 and struct.unpack_from('<I', native, swar + 0x38)[0] == 1
    assert swar + struct.unpack_from('<I', native, swar + 0x3c)[0] + 12 == offset
    assert native[offset - 12] == 0 and struct.unpack_from('<H', native, offset - 10)[0] == sample.sampleRate
    target = output / f'cry-{species}.wav'
    with wave.open(str(target), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(1)
        wav.setframerate(sample.sampleRate)
        wav.writeframes(bytes((value + 128) & 255 for value in pcm))
    cries[str(species)] = {'file': target.name, 'archive': name, 'wave': 0,
        'sampleRate': sample.sampleRate, 'frames': len(pcm), 'durationSeconds': len(pcm) / sample.sampleRate,
        'sourceSWAROffset': swar, 'sourcePCMOffset': offset,
        'signedPCMSourceSHA256': hashlib.sha256(pcm).hexdigest(),
        'wavSHA256': hashlib.sha256(target.read_bytes()).hexdigest()}
manifest = {'source': str(source.relative_to(root)), 'sourceSHA256': hashlib.sha256(native).hexdigest(),
    'conversion': 'Native mono signed PCM8 -> unsigned PCM8 WAV; original rate and all sample bytes retained.',
    'cries': cries}
(output / 'audio.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(cries))
