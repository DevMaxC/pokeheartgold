"""Independent native ABI/pixel checks; no browser or model appearance claim."""
import ctypes
import json
import math
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import unittest
import zlib

from export_azalea_world import ROOT, MODELS, info_block, joint_animation, member, model_rest, pattern_animation, pattern_texture_parameters, sha


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
        source = (ROOT / 'lib/NitroSystem/src/g3d_anm_bca_data.c').read_text()
        c = source[source.index('BOOL getRotDataByIdx_('):source.rindex('#pragma pop')]
        direct = source[source.index('#define ROT_ROW2_FROM_CROSS'):source.index('#define MTX_ROW2_FROM_CROSS')]
        asm = (ROOT / 'lib/asm/nnsys_data.s').read_text().split('gJntAnmPivotMtxIndices:', 1)[1].split('.data', 1)[0]
        values = re.findall(r'0x[0-9A-Fa-f]+', asm)
        self.assertEqual(len(values), 36)
        prefix = '#include <stdint.h>\ntypedef int32_t fx32;typedef int32_t s32;typedef int16_t s16;typedef uint16_t u16;typedef uint8_t u8;typedef uint32_t u32;typedef int BOOL;\n#define TRUE 1\n#define FALSE 0\n#define FX32_ONE 4096\n#define FX32_SHIFT 12\ntypedef struct{fx32 x,y,z;}VecFx32;\ntypedef struct{u8 header[4];u16 numFrame,numNode;u32 flag,ofsRot3,ofsRot5;}G3dResJntAnm;\nvoid(*normalize_callback)(VecFx32*,VecFx32*);\nvoid VEC_Normalize(VecFx32*a,VecFx32*b){normalize_callback(a,b);}\nBOOL getRotDataByIdx_(fx32*,const void*,const void*,u32);\nconst unsigned char gJntAnmPivotMtxIndices[9][4]={' + ','.join(values) + '};\n'
        header = (ROOT / 'lib/include/nnsys/g3d_anm_mat_internal.h').read_text()
        prefix += '\n'.join(re.findall(r'^#define G3D_ANM_TRACK_(?:STEP_MASK|STEP_2|LAST_MASK|LAST_SHIFT)\s+.*$', header, re.M)) + '\n'
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)
            (path / 'sdk.c').write_text(prefix + direct + c)
            subprocess.run(['cc', '-std=c99', '-O0', '-shared', '-fPIC', str(path / 'sdk.c'), '-o', str(path / 'sdk.dylib')], check=True, capture_output=True)
            library = ctypes.CDLL(str(path / 'sdk.dylib'))
            function = library.getRotDataByIdx_
            full = library.getRotData_
            # Original getRotData_ calls original SDK VEC_Normalize. Replay
            # only that function's hardware DIV/SQRT integers on this CPU;
            # no floating normalization and no exporter helper is reused.
            callback_type = ctypes.CFUNCTYPE(None, ctypes.POINTER(ctypes.c_int32), ctypes.POINTER(ctypes.c_int32))
            def normalize(src, dst):
                xyz = [src[i] for i in range(3)]
                squared = sum(value * value for value in xyz)
                quotient = (1 << 56) // squared
                root = math.isqrt(squared * 4)
                for i in range(3):
                    dst[i] = (quotient * root * xyz[i] + (1 << 44)) >> 45
            callback = callback_type(normalize)
            ctypes.c_void_p.in_dll(library, 'normalize_callback').value = ctypes.cast(callback, ctypes.c_void_p).value
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
                    complete = (ctypes.c_int32 * 9)()
                    data_pair = (ctypes.c_uint32 * 2)(info, data)
                    full(complete, frame << 12, data_pair, ctypes.byref(buffer, base))
                    self.assertEqual(list(complete), self.manifest['models']['118']['animations'][0]['nativeFrames'][frame][node]['rotationFx32'])
                    checked += 1
            self.assertEqual(checked, 180)
            # This nonunit pivot is intentionally not an actual resource.
            # It makes omitted per-frame row2 normalization observably fail.
            changed = bytearray(raw)
            info, data = struct.unpack_from('<II', changed, base + offsets[1] + 16)
            struct.pack_into('<H', changed, base + data, 0x8000)
            struct.pack_into('<Hhh', changed, base + pivot_offset, 0, 1000, 2000)
            buffer = ctypes.create_string_buffer(bytes(changed))
            complete = (ctypes.c_int32 * 9)()
            full(complete, 0, (ctypes.c_uint32 * 2)(info, data), ctypes.byref(buffer, base))
            self.assertNotEqual(list(complete)[6:], [0, 2000, 1000])
            self.assertEqual(list(complete), joint_animation(changed)['nativeFrames'][0][1]['rotationFx32'])

    def test_native_rest_and_unsupported_scaling_pat_layout_and_sampling_reject(self):
        for model in MODELS:
            native = member('files/a/1/4/8', model)
            rule, rest = model_rest(native)
            self.assertEqual(rule, 0)
            self.assertEqual(self.manifest['models'][str(model)]['rest'], rest)
            changed = bytearray(native)
            section = struct.unpack_from('<I', native, 16)[0]
            offset = struct.unpack('<I', info_block(native, section + 8, 4)[0][0])[0]
            changed[section + offset + 21] = 1
            with self.assertRaisesRegex(AssertionError, 'Basic'):
                model_rest(changed)
        rail = self.manifest['models']['115']['rest']['nativeFrames'][0][2]
        self.assertEqual(rail['translationFx32'], [0, 0, 0])
        self.assertEqual(rail['scaleFx32'], [0, 0, 0])
        spider = self.manifest['models']['118']['rest']['nativeFrames'][0]
        self.assertEqual(spider[0]['translationFx32'], [0, -8192, 37273])
        self.assertEqual(spider[0]['scaleFx32'], [3686] * 3)
        self.assertEqual(spider[1]['translationFx32'], [-45948, -16144, 22556])
        raw = bytearray(member('files/a/1/0/6', 23))
        base = 68
        record = base + 12
        header = record + 12 + 4 * raw[record + 1]
        struct.pack_into('<I', raw, header + 4, 2)
        with self.assertRaisesRegex(AssertionError, 'multiple PAT'):
            pattern_animation(raw)
        texture = bytearray(member('files/a/0/7/0', 27))
        section = struct.unpack_from('<I', texture, 16)[0]
        dictionary = section + struct.unpack_from('<H', texture, section + 14)[0]
        records = info_block(texture, dictionary, 8)
        index = [name for _, name in records].index('g2switch.1')
        entry = dictionary + 12 + 4 * len(records) + 4 + 8 * index
        params = struct.unpack_from('<I', texture, entry)[0]
        struct.pack_into('<I', texture, entry, params ^ (1 << 29))
        with self.assertRaisesRegex(AssertionError, 'PAT dimensions'):
            pattern_texture_parameters(texture, ['g2switch.1'])

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
                self.assertEqual(len(animation['tracks']), len(native['tracks']))
                for track, original in zip(animation['tracks'], native['tracks']):
                    self.assertEqual(track['material'], original['material'])
                    self.assertEqual(len(track['keys']), len(original['keys']))
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
