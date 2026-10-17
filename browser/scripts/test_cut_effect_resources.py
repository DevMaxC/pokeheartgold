"""Independent actual-resource/SDK-C checks; no browser or game build."""
from pathlib import Path
import copy, ctypes, hashlib, json, re, struct, subprocess, tempfile, unittest, wave
import export_cut_effect as cut

ROOT = cut.ROOT
OUT = ROOT / 'browser/public/source/cut'
MANIFEST = json.loads((OUT / 'resources.json').read_text())
ARCHIVE = (ROOT / 'files/a/1/3/4').read_bytes()


def function(path, name):
    text = (ROOT / path).read_text()
    start = re.search(r'(?:void|u16|u32|s32)\s+' + re.escape(name) + r'\(', text).start()
    opened = text.index('{', start)
    depth = 1
    end = opened + 1
    while depth:
        depth += (text[end] == '{') - (text[end] == '}')
        end += 1
    return text[start:end]


class JointHeader(ctypes.Structure):
    _fields_ = [('magic', ctypes.c_uint32), ('numFrame', ctypes.c_uint16), ('numNode', ctypes.c_uint16), ('flag', ctypes.c_uint32), ('ofsRot3', ctypes.c_uint32), ('ofsRot5', ctypes.c_uint32)]


class TextureInput(ctypes.Structure):
    _fields_ = [('origWidth', ctypes.c_int32), ('origHeight', ctypes.c_int32), ('sinR', ctypes.c_int32), ('cosR', ctypes.c_int32)]


class SDKResources(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        directory = Path(cls.temporary.name)
        defines = '\n'.join(line for line in (ROOT / 'lib/include/nnsys/g3d_anm_mat_internal.h').read_text().splitlines() if line.startswith('#define G3D_'))
        header = '''#include <stdint.h>
typedef int16_t s16;typedef uint8_t u8;typedef uint16_t u16;typedef uint32_t u32;typedef int32_t s32;typedef int64_t s64;typedef int32_t fx32;
typedef struct {u32 magic;u16 numFrame,numNode;u32 flag,ofsRot3,ofsRot5;} G3dResJntAnm;
typedef void G3dResMatCAnm;
typedef struct {s32 origWidth,origHeight,sinR,cosR;} G3dMatAnmResult;
typedef struct {s32 _00,_01,_02,_03,_10,_11,_12,_13,_20,_21,_22,_23,_30,_31,_32,_33;} MtxFx44;
#define FX32_SHIFT 12
#define FX32_ONE 4096
#define GX_RGB_R_MASK 0x001f
#define GX_RGB_G_MASK 0x03e0
#define GX_RGB_B_MASK 0x7c00
static s32 ratio;
static void FX_DivAsync(s32 a,s32 b){ratio=((int64_t)a<<12)/b;}
static s32 FX_GetDivResult(void){return ratio;}
'''
        functions = [('lib/NitroSystem/src/g3d_anm_bca_trans.c', 'getTransData_'), ('lib/NitroSystem/src/g3d_anm_bca_scale.c', 'getScaleData_'), ('lib/NitroSystem/src/g3d_anm_bma.c', 'GetMatColAnmValue_'), ('lib/NitroSystem/src/g3d_anm_bma.c', 'GetMatColAnmuAlphaValue_'), ('lib/NitroSystem/src/g3d_anm_bta_sincos.c', 'GetTexSRTAnmSinCosVal_'), ('lib/NitroSystem/src/g3d_cgtool_maya_tex.c', 'texmtxCalc_flagTS_')]
        source = header + defines + '\n' + '\n'.join(function(*value) for value in functions)
        (directory / 'actual.c').write_text(source)
        compiled = subprocess.run(['cc', '-std=c99', '-O0', '-shared', '-fPIC', str(directory / 'actual.c'), '-o', str(directory / 'actual.so')], capture_output=True)
        if compiled.returncode:
            raise RuntimeError(compiled.stderr.decode())
        cls.sdk = ctypes.CDLL(str(directory / 'actual.so'))
        cls.sdk.getTransData_.argtypes = [ctypes.POINTER(ctypes.c_int32), ctypes.c_int32, ctypes.POINTER(ctypes.c_uint32), ctypes.c_void_p]
        cls.sdk.getScaleData_.argtypes = cls.sdk.getTransData_.argtypes
        for name in ['GetMatColAnmValue_', 'GetMatColAnmuAlphaValue_']:
            getattr(cls.sdk, name).argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32]
            getattr(cls.sdk, name).restype = ctypes.c_uint16
        cls.sdk.GetTexSRTAnmSinCosVal_.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_uint32]
        cls.sdk.GetTexSRTAnmSinCosVal_.restype = ctypes.c_uint32
        cls.sdk.texmtxCalc_flagTS_.argtypes = [ctypes.POINTER(ctypes.c_int32), ctypes.POINTER(TextureInput)]

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_source_and_every_native_member_hash(self):
        for path, expected in MANIFEST['sources'].items():
            self.assertEqual(cut.sha((ROOT / path).read_bytes()), expected, path)
        for key, expected in MANIFEST['nativeMemberSHA256'].items():
            self.assertEqual(cut.sha(cut.member(ARCHIVE, int(key))), expected)
        self.assertEqual(cut.sha((OUT / 'model.glb').read_bytes()), MANIFEST['glbSHA256'])

    def test_literal_native_light_magnification_position_scale_and_actual_glb_palette_uv_skin(self):
        raw = cut.member(ARCHIVE, 3)
        base, _ = cut.resource_base(raw, b'MDL0')
        self.assertEqual(struct.unpack_from('<ii', raw, base + 28), (32768, 512))
        self.assertEqual((MANIFEST['nativePositionScaleFx32'], MANIFEST['nativeInversePositionScaleFx32']), (32768, 512))
        _, _, materials = cut.model_info(raw)
        self.assertEqual(materials, MANIFEST['materials'])
        self.assertEqual([materials[name]['lightMask'] for name in ['ha1', 'ha2', 'ha3', 'lambert2', 'lambert3']], [1, 1, 1, 0, 0])
        for material in materials.values():
            self.assertEqual(material['magnificationFx32'], [4096, 4096])
        glb = (OUT / 'model.glb').read_bytes()
        size = struct.unpack_from('<I', glb, 12)[0]
        doc, binary = json.loads(glb[20:20 + size]), glb[28 + size:]
        def accessor(index):
            data = doc['accessors'][index]
            view = doc['bufferViews'][data['bufferView']]
            width = {'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16, 'SCALAR': 1}[data['type']]
            fmt = {5126: 'f', 5121: 'B', 5123: 'H'}[data['componentType']]
            stride = view.get('byteStride', width * struct.calcsize(fmt))
            offset = view.get('byteOffset', 0) + data.get('byteOffset', 0)
            return [struct.unpack_from('<' + fmt * width, binary, offset + row * stride) for row in range(data['count'])]
        self.assertTrue(all('KHR_materials_unlit' in material['extensions'] for material in doc['materials']))
        self.assertEqual([node['extras']['nativeCutJoint'] for node in doc['nodes'][:12]], list(range(12)))
        for mesh in doc['meshes']:
            for primitive in mesh['primitives']:
                attributes = primitive['attributes']
                self.assertEqual(set(accessor(attributes['COLOR_0'])), {(255, 255, 255)}, 'Tint is NOT baked by NORMAL-cleared converter vertices')
                self.assertEqual(set(accessor(attributes['TEXCOORD_0'])), {(0., 0.), (1., 0.), (0., 1.), (1., 1.)})
                self.assertEqual(set(accessor(attributes['WEIGHTS_0'])), {(255, 0, 0, 0)})
                self.assertTrue(all(0 <= joint < len(doc['skins'][0]['joints']) for row in accessor(attributes['JOINTS_0']) for joint in row))
                self.assertIn((0., 0., 1.), accessor(attributes['NORMAL']))
        # Changed native encodings must reject rather than lose their extra scale.
        altered = bytearray(raw);struct.pack_into('<i', altered, base + 28, 4096)
        with self.assertRaises(AssertionError):
            cut.model_info(altered)

    def test_all_45_frames_all_12_joint_translations_scales_inverses_against_original_sdk_c(self):
        raw = cut.member(ARCHIVE, 0)
        base, _ = cut.resource_base(raw, b'JNT0')
        data = ctypes.create_string_buffer(raw[base:])
        for frame in range(45):
            for node, offset in enumerate(struct.unpack_from('<12H', raw, base + 20)):
                tag = struct.unpack_from('<I', raw, base + offset)[0]
                expected = MANIFEST['joint']['nativeFrames'][frame][node]
                if tag & 1:
                    self.assertEqual(expected['translationFx32'], [0] * 3)
                    self.assertEqual(expected['scaleFx32'], [4096] * 3)
                    continue
                self.assertTrue(tag & 64, 'actual Cut rotations are identity')
                cursor = base + offset + 4
                for axis, bit in enumerate([8, 16, 32]):
                    if tag & 2:
                        value = 0
                    elif tag & bit:
                        value = struct.unpack_from('<i', raw, cursor)[0];cursor += 4
                    else:
                        words = (ctypes.c_uint32 * 2)(*struct.unpack_from('<II', raw, cursor));cursor += 8
                        result = ctypes.c_int32()
                        self.sdk.getTransData_(ctypes.byref(result), frame << 12, words, data)
                        value = result.value
                    self.assertEqual(value, expected['translationFx32'][axis], (frame, node, axis))
                for axis, bit in enumerate([2048, 4096, 8192]):
                    if tag & 512:
                        values = [4096, 4096]
                    elif tag & bit:
                        values = list(struct.unpack_from('<ii', raw, cursor));cursor += 8
                    else:
                        words = (ctypes.c_uint32 * 2)(*struct.unpack_from('<II', raw, cursor));cursor += 8
                        result = (ctypes.c_int32 * 2)()
                        self.sdk.getScaleData_(result, frame << 12, words, data)
                        values = list(result)
                    self.assertEqual(values, [expected['scaleFx32'][axis], expected['inverseScaleFx32'][axis]], (frame, node, axis))

    def test_every_original_sdk_color_and_alpha_value(self):
        raw = cut.member(ARCHIVE, 1)
        base, _ = cut.resource_base(raw, b'MAT0')
        data = ctypes.create_string_buffer(raw[base:])
        for values, name in cut.dictionary(raw, base + 8, 20):
            words = struct.unpack('<5I', values)
            for frame in range(45):
                expected = MANIFEST['color']['tracks'][name]
                self.assertEqual([self.sdk.GetMatColAnmValue_(data, word, frame) & 32767 for word in words[:4]], expected['colors'])
                self.assertEqual(self.sdk.GetMatColAnmuAlphaValue_(data, words[4], frame), expected['alpha'][frame])

    def test_every_original_sdk_texture_sincos_and_maya_texel_matrix(self):
        raw = cut.member(ARCHIVE, 2)
        base, _ = cut.resource_base(raw, b'SRT0')
        data = ctypes.create_string_buffer(raw[base:])
        for words, name in cut.dictionary(raw, base + 8, 40):
            info, offset = struct.unpack_from('<II', words, 16)
            for frame in range(45):
                packed = self.sdk.GetTexSRTAnmSinCosVal_(data, info, offset, frame)
                sine = ctypes.c_int16(packed & 65535).value
                cosine = ctypes.c_int16(packed >> 16).value
                value, matrix = TextureInput(8, 8, sine, cosine), (ctypes.c_int32 * 16)()
                self.sdk.texmtxCalc_flagTS_(matrix, ctypes.byref(value))
                self.assertEqual([matrix[i] for i in [0, 1, 4, 5, 12, 13]], MANIFEST['texture']['tracks'][name]['matricesFx32'][frame])

    def test_all_494_cries_are_literal_original_pcm8_at_actual_fat_swar_offsets(self):
        raw = (ROOT / 'files/data/sound/gs_sound_data.sdat').read_bytes()
        self.assertEqual(cut.sha(raw), MANIFEST['audio']['sourceSDATSHA256'])
        self.assertEqual(len(MANIFEST['audio']['cries']), 494)
        for species, entry in MANIFEST['audio']['cries'].items():
            pcm = raw[entry['nativePCMOffset']:entry['nativePCMOffset'] + entry['frames']]
            self.assertEqual(cut.sha(pcm), entry['signedPCMSourceSHA256'], species)
            file = entry['waveResource']
            self.assertEqual(raw[file['offset']:file['offset'] + 4], b'SWAR')
            self.assertEqual(cut.sha(raw[file['offset']:file['offset'] + file['size']]), file['sha256'])
            native = entry['nativePCMOffset'] - 12
            self.assertEqual(struct.unpack_from('<BBH', raw, native), (0, 0, entry['sampleRate']))
            with wave.open(str(OUT / entry['file'])) as decoded:
                self.assertEqual((decoded.getnchannels(), decoded.getsampwidth(), decoded.getframerate(), decoded.getnframes()), (1, 1, entry['sampleRate'], entry['frames']))
                self.assertEqual(decoded.readframes(entry['frames']), bytes((value + 128) & 255 for value in pcm))
            self.assertEqual(cut.sha((OUT / entry['file']).read_bytes()), entry['wavSHA256'])

    def test_cut_sound_uses_literal_original_sseq_event_payload_and_is_shorter_than_visual(self):
        raw = (ROOT / 'files/data/sound/gs_sound_data.sdat').read_bytes()
        sound = MANIFEST['audio']['sound']
        file = sound['sequence']
        payload = raw[sound['eventPayloadOffset']:file['offset'] + file['size']]
        self.assertEqual(cut.sha(payload), sound['eventPayloadSHA256'])
        self.assertEqual((sound['id'], sound['bank'], sound['player']), (1610, 750, 3))
        for dependency in [file, sound['bankResource'], *sound['waveArchives']]:
            self.assertEqual(cut.sha(raw[dependency['offset']:dependency['offset'] + dependency['size']]), dependency['sha256'])
        with wave.open(str(OUT / sound['file'])) as decoded:
            self.assertEqual((decoded.getnchannels(), decoded.getframerate(), decoded.getnframes()), (2, 32768, 21850))
        self.assertLess(sound['frames'] / sound['sampleRate'], 45 / 30)

    def test_unsupported_animation_abis_fail_instead_of_omitting_a_track(self):
        raw = bytearray(cut.member(ARCHIVE, 0));base, _ = cut.resource_base(raw, b'JNT0')
        raw[base + 4:base + 6] = struct.pack('<H', 44)
        with self.assertRaises(AssertionError):
            cut.joint_frames(raw)
        raw = bytearray(cut.member(ARCHIVE, 1));base, _ = cut.resource_base(raw, b'MAT0')
        materials = copy.deepcopy(MANIFEST['materials']);materials['ha1']['colors'][0] = 0
        with self.assertRaises(AssertionError):
            cut.material_frames(raw, materials)
        materials = copy.deepcopy(MANIFEST['materials']);materials['ha1']['dimensions'] = [16, 8]
        with self.assertRaises(AssertionError):
            cut.texture_frames(cut.member(ARCHIVE, 2), materials)


if __name__ == '__main__':
    unittest.main()
