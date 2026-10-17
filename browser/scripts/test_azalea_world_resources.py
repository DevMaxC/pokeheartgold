"""Independent native ABI/pixel checks; no browser or model appearance claim."""
import ctypes
import json
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import unittest
import zlib

from export_azalea_world import ROOT, MODELS, info_block, joint_animation, member, pattern_animation, sha


def png_rgba(raw):
    pos, data = 8, b''
    while pos < len(raw):
        size = struct.unpack_from('>I', raw, pos)[0]
        tag, payload = raw[pos + 4:pos + 8], raw[pos + 8:pos + 8 + size]
        if tag == b'IHDR':
            width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', payload)
            assert (depth, color, interlace) == (8, 6, 0)
        if tag == b'IDAT':
            data += payload
        pos += size + 12
    data = zlib.decompress(data)
    result, previous, cursor = bytearray(), bytearray(width * 4), 0
    for _ in range(height):
        mode = data[cursor]
        row = bytearray(data[cursor + 1:cursor + 1 + width * 4])
        cursor += width * 4 + 1
        for i in range(len(row)):
            a, b, c = row[i - 4] if i >= 4 else 0, previous[i], previous[i - 4] if i >= 4 else 0
            if mode == 1:
                predict = a
            elif mode == 2:
                predict = b
            elif mode == 3:
                predict = (a + b) // 2
            elif mode == 4:
                p = a + b - c
                distances = [abs(p - a), abs(p - b), abs(p - c)]
                predict = [a, b, c][distances.index(min(distances))]
            else:
                assert mode == 0
                predict = 0
            row[i] = (row[i] + predict) & 255
        result += row
        previous = row
    return width, height, bytes(result)


class Resources(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / 'browser/public/source/azalea-gym/resources.json').read_text())

    def test_actual_archive_id_flags_frame_counts_and_invalid_abi(self):
        frames = 0
        for model, ids in MODELS.items():
            entry = self.manifest['models'][str(model)]
            self.assertEqual(entry['modelSHA256'], sha(member('files/a/1/4/8', model)))
            self.assertEqual(entry['animationListFlags'], list(member('files/a/1/0/8', model)[:4]))
            for index, archive in enumerate(ids):
                raw = member('files/a/1/0/6', archive)
                actual = entry['animations'][index]
                self.assertEqual(actual['archive'], archive)
                self.assertEqual(actual['nativeSHA256'], sha(raw))
                # Native resource header/JNT/PAT info block is one entry here;
                # these values come from literal binary offsets, not rule JSON.
                self.assertEqual(actual['frameCount'], struct.unpack_from('<H', raw, 72)[0])
                if raw[:4] == b'BCA0':
                    frames += actual['frameCount']
                    changed = bytearray(raw)
                    struct.pack_into('<I', changed, 76, 1)
                    with self.assertRaises(AssertionError):
                        joint_animation(changed)
        self.assertEqual(frames, 42)
        rail = self.manifest['models']['115']['animations'][0]['nativeFrames'][0]
        self.assertEqual(rail[2]['scaleFx32'], [0, 0, 0])
        self.assertEqual(rail[2]['translationFx32'], [0, -36806, 0])

    def test_sdk_original_rotation_c_matches_all_native_spider_samples(self):
        # Compile the ORIGINAL pure SDK function unchanged. The only supplied
        # definitions are primitive typedefs and the literal assembly table.
        c = (ROOT / 'lib/NitroSystem/src/g3d_anm_bca_data.c').read_text()
        c = c[c.index('BOOL getRotDataByIdx_('):c.rindex('#pragma pop')]
        asm = (ROOT / 'lib/asm/nnsys_data.s').read_text().split('gJntAnmPivotMtxIndices:', 1)[1].split('.data', 1)[0]
        values = re.findall(r'0x[0-9A-Fa-f]+', asm)
        self.assertEqual(len(values), 36)
        prefix = '#include <stdint.h>\ntypedef int32_t fx32;typedef int32_t s32;typedef int16_t s16;typedef uint32_t u32;typedef int BOOL;\n#define TRUE 1\n#define FALSE 0\n#define FX32_ONE 4096\nconst unsigned char gJntAnmPivotMtxIndices[9][4]={' + ','.join(values) + '};\n'
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            (path / 'sdk.c').write_text(prefix + c)
            subprocess.run(['cc', '-std=c99', '-O0', '-shared', '-fPIC', str(path / 'sdk.c'), '-o', str(path / 'sdk.dylib')], check=True, capture_output=True)
            library = ctypes.CDLL(str(path / 'sdk.dylib'))
            function = library.getRotDataByIdx_
            raw = member('files/a/1/0/6', 43)
            buffer = ctypes.create_string_buffer(raw)
            base = 68
            pivot_offset, basis_offset = struct.unpack_from('<II', raw, base + 12)
            offsets = struct.unpack_from('<7H', raw, base + 20)
            checked = 0
            for node in range(1, 7):
                info, data = struct.unpack_from('<II', raw, base + offsets[node] + 16)
                self.assertEqual(info, 30 << 16)
                for frame in range(30):
                    index = struct.unpack_from('<H', raw, base + data + frame * 2)[0]
                    out = (ctypes.c_int32 * 9)()
                    two_rows = function(out, ctypes.byref(buffer, base + pivot_offset), ctypes.byref(buffer, base + basis_offset), index)
                    result = list(out)
                    if two_rows:
                        result[6:] = [(result[1] * result[5] - result[2] * result[4]) >> 12,
                                      (result[2] * result[3] - result[0] * result[5]) >> 12,
                                      (result[0] * result[4] - result[1] * result[3]) >> 12]
                    self.assertEqual(result, self.manifest['models']['118']['animations'][0]['nativeFrames'][frame][node]['rotationFx32'])
                    checked += 1
            self.assertEqual(checked, 180)

    def test_every_actual_pat_pixel_uses_its_literal_texture_and_palette(self):
        texture = member('files/a/0/7/0', 27)
        base = struct.unpack_from('<I', texture, 16)[0]
        texture_dict = struct.unpack_from('<H', texture, base + 14)[0]
        data_offset = struct.unpack_from('<I', texture, base + 20)[0]
        palette_dict, palette_data = struct.unpack_from('<II', texture, base + 52)
        textures = {name: struct.unpack('<II', data)[0] for data, name in info_block(texture, base + texture_dict, 8)}
        palettes = {name: struct.unpack('<HH', data)[0] * 8 for data, name in info_block(texture, base + palette_dict, 4)}
        checked = 0
        for model in [117, 122]:
            entry = self.manifest['models'][str(model)]
            images = []
            for animation in entry['animations']:
                native = pattern_animation(member('files/a/1/0/6', animation['archive']))
                self.assertEqual(native['frameCount'], 2)
                for track, original in zip(animation['tracks'], native['tracks']):
                    self.assertEqual(track['material'], original['material'])
                    for key, expected in zip(track['keys'], original['keys']):
                        self.assertEqual({k: key[k] for k in ['frame', 'texture', 'palette']}, expected)
                        params = textures[key['texture']]
                        self.assertEqual((params >> 26) & 7, 3)
                        width, height = 8 << ((params >> 20) & 7), 8 << ((params >> 23) & 7)
                        data = base + data_offset + (params & 65535) * 8
                        palette = base + palette_data + palettes[key['palette']]
                        pixels = bytearray()
                        for i in range(width * height):
                            index = (texture[data + i // 2] >> ((i % 2) * 4)) & 15
                            rgb = struct.unpack_from('<H', texture, palette + index * 2)[0]
                            for shift in [0, 5, 10]:
                                color = (rgb >> shift) & 31
                                pixels.append((color << 3) | (color >> 2))
                            pixels.append(0 if index == 0 and params & (1 << 29) else 255)
                        png = (ROOT / 'browser/public/source' / key['asset']).read_bytes()
                        self.assertEqual(png_rgba(png), (width, height, bytes(pixels)))
                        images.append(bytes(pixels))
                        checked += width * height
            self.assertNotEqual(images[0], images[1], 'native two switch states must have distinct art')
        self.assertEqual(checked, 4096)


if __name__ == '__main__':
    unittest.main()
