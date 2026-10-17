"""Reproduce the struct-only SDAT cry provenance check, without ndspy/exporter.

Run with Python3 from any directory inside the checkout. No audio rendering,
network, game build or browser is involved. Prints a receipt, writes no files.
"""
from pathlib import Path
import hashlib, json, struct, wave

ROOT = Path(__file__).resolve().parents[3]
raw = (ROOT / 'files/data/sound/gs_sound_data.sdat').read_bytes()
manifest = json.loads((ROOT / 'browser/public/source/cut/resources.json').read_text())
u16 = lambda offset: struct.unpack_from('<H', raw, offset)[0]
u32 = lambda offset: struct.unpack_from('<I', raw, offset)[0]
assert raw[:4] == b'SDAT'
symb, info, fat = u32(0x10), u32(0x18), u32(0x20)


def record(section, table, index):
    table_offset = section + u32(section + 8 + table * 4)
    assert index < u32(table_offset)
    return section + u32(table_offset + 4 + 4 * index)


def symbol(table, index):
    offset = record(symb, table, index)
    return raw[offset:raw.index(b'\0', offset)].decode('ascii')


def resource(file_id):
    assert file_id < u32(fat + 8)
    offset, size = struct.unpack_from('<II', raw, fat + 12 + file_id * 16)
    assert offset + size <= len(raw)
    return offset, size


sequence_record = record(info, 0, 2)
sequence, sequence_size = resource(u32(sequence_record))
events = raw[sequence + u32(sequence + 24):sequence + sequence_size]
assert symbol(0, 2) == 'SEQ_PV'
assert raw[sequence_record + 6] == 120
assert events.hex() == 'e164008100c17fc0403c7f00ffff0000'
for species in range(1, 495):
    entry = manifest['audio']['cries'][str(species)]
    bank_record = record(info, 2, species)
    assert [u16(bank_record + 4 + 2 * slot) for slot in range(4)] == [species, 65535, 65535, 65535]
    bank, bank_size = resource(u32(bank_record))
    assert raw[bank:bank + 4] == b'SBNK' and u32(bank + 0x38) == 1
    instrument = raw[bank + 0x3c:bank + 0x40]
    assert instrument[0] == 1
    note = bank + int.from_bytes(instrument[1:4], 'little')
    assert raw[note:note + 10].hex() == '000000003c7f7f7f7f40'
    swar, swar_size = resource(u32(record(info, 3, species)))
    assert raw[swar:swar + 4] == b'SWAR' and u32(swar + 0x38) == 1
    sample = swar + u32(swar + 0x3c)
    assert raw[sample:sample + 2] == b'\0\0'
    assert u16(sample + 6) == 0
    rate, frames = u16(sample + 2), u32(sample + 8) * 4
    assert sample + 12 + frames <= swar + swar_size
    pcm = raw[sample + 12:sample + 12 + frames]
    assert (entry['bank'], entry['waveArchive'], entry['nativePCMOffset'], entry['frames'], entry['sampleRate']) == (species, species, sample + 12, frames, rate)
    assert entry['bankName'] == symbol(2, species) and entry['waveArchiveName'] == symbol(3, species)
    assert hashlib.sha256(pcm).hexdigest() == entry['signedPCMSourceSHA256']
    with wave.open(str(ROOT / 'browser/public/source/cut' / entry['file'])) as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()) == (1, 1, rate, frames)
        assert wav.readframes(frames) == bytes((value + 128) & 255 for value in pcm)
print(json.dumps({
    'sourceSHA256': hashlib.sha256(raw).hexdigest(),
    'speciesBanksVerified': 494,
    'method': 'Independent struct-only original SYMB/INFO/FAT→SBNK instrument0→SWAR wave0 mapping; no ndspy/exporter import',
    'verified': {
        'speciesBankOverrideMapsSameWaveArchiveId': True,
        'literalSinglePcmInstrument': True,
        'noteDefinitionHex': '000000003c7f7f7f7f40',
        'nativePCMFrameSizeAndOffset': True,
        'genericCrySequenceId': 2,
        'genericCrySymbol': 'SEQ_PV',
        'genericCrySequenceVolume': 120,
        'literalCryEventPayloadHex': events.hex(),
    },
    'limits': ['Does not emulate DS hardware timer/mixer or custom Chatot recordings; runtime source scope remains pattern0 only.'],
}, indent=2))
