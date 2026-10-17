"""Native binary/importer regression tests; Python standard library only."""
from copy import deepcopy
from pathlib import Path
import json
import struct
import unittest

from native_shoreline_srt import narc_members, land_model, translations, tag_glb

ROOT = Path(__file__).resolve().parents[2]


def document(raw):
    count = struct.unpack_from('<I', raw, 12)[0]
    return json.loads(raw[20:20 + count]), raw[20 + count:]


def encode(doc, tail):
    data = json.dumps(doc, separators=(',', ':')).encode()
    data += b' ' * (-len(data) % 4)
    return struct.pack('<IIIII', 0x46546c67, 2, 20 + len(data) + len(tail), len(data), 0x4e4f534a) + data + tail


class NativeShorelineTranslation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = narc_members((ROOT / 'files/a/0/6/5').read_bytes())
        cls.model = land_model(cls.archive[4])
        cls.asset = (ROOT / 'browser/public/source/land/4-2.glb').read_bytes()

    def test_native_surf_translation_matches_literal_mat_record(self):
        # Literal map16_12c material record, independently located by its exact
        # fixed header/flags. The translation words follow the 44-byte header.
        needle = bytes.fromhex('0000340039e7ff7f0000000081801f00fff81f3f00000340ffffffff0000c71f200020000010000000100000')
        self.assertEqual(self.model.count(needle), 1)
        offset = self.model.index(needle) + len(needle)
        self.assertEqual(struct.unpack_from('<ii', self.model, offset), (0, 2458))
        self.assertEqual(translations(self.model)['swave_p']['translationFx32'], [0, 2458])
        self.assertEqual(translations(land_model(self.archive[5])), {})

    def test_patch_is_idempotent_and_changes_only_standard_transform_metadata(self):
        fixed, tail = document(self.asset)
        old = deepcopy(fixed)
        for name in ['extensionsRequired', 'extensionsUsed']:
            old[name].remove('KHR_texture_transform')
            if not old[name]:
                del old[name]
        for material in old['materials']:
            texture = material.get('pbrMetallicRoughness', {}).get('baseColorTexture', {})
            if 'KHR_texture_transform' in texture.get('extensions', {}):
                del texture['extensions']['KHR_texture_transform']
                if not texture['extensions']:
                    del texture['extensions']
        corrected = tag_glb(encode(old, tail), self.model)
        actual, actual_tail = document(corrected)
        self.assertEqual(actual, fixed)
        self.assertEqual(actual_tail, tail)  # every attribute/index/buffer byte
        self.assertEqual(tag_glb(corrected, self.model), corrected)
        self.assertEqual(actual['images'], old['images'])
        self.assertEqual(actual['textures'], old['textures'])
        self.assertEqual(actual['samplers'], old['samplers'])
        self.assertEqual(actual['accessors'], old['accessors'])
        self.assertEqual(actual['meshes'], old['meshes'])
        self.assertEqual(actual['animations'] if 'animations' in actual else None, old.get('animations'))

    def test_existing_translation_scale_or_animation_state_is_not_overwritten(self):
        doc, tail = document(self.asset)
        surf = next(m for m in doc['materials'] if m['name'] == 'swave_p')
        tex = surf['pbrMetallicRoughness']['baseColorTexture']
        for conflict in [{'offset': [0, .5]}, {'offset': [0, 2458/4096], 'scale': [1, 2]}, {'rotation': .2}]:
            tex['extensions']['KHR_texture_transform'] = conflict
            with self.assertRaisesRegex(ValueError, 'Conflicting pre-existing'):
                tag_glb(encode(doc, tail), self.model)
            self.assertEqual(tex['extensions']['KHR_texture_transform'], conflict)

    def test_inventory_covers_all_source_translations_and_all_current_variants(self):
        native = {}
        for i, data in enumerate(self.archive):
            if len(data) < 20:
                continue
            try:
                matrices = translations(land_model(data))
            except (ValueError, IndexError, struct.error):
                continue
            if matrices:
                native[i] = matrices
        self.assertEqual(len(native), 27)
        assets = []
        for path in (ROOT / 'browser/public/source/land').glob('*.glb'):
            doc, _ = document(path.read_bytes())
            transformed = [m for m in doc.get('materials', []) if m.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('extensions', {}).get('KHR_texture_transform')]
            if not transformed:
                continue
            model_id = int(path.stem.split('-')[0])
            self.assertIn(model_id, native)
            self.assertEqual(len(transformed), 1)
            self.assertEqual(transformed[0]['name'], 'swave_p')
            self.assertEqual(tag_glb(path.read_bytes(), land_model(self.archive[model_id])), path.read_bytes())
            assets.append(path.name)
        self.assertEqual(len(assets), 27)
        self.assertEqual({int(name.split('-')[0]) for name in assets}, set(native))


if __name__ == '__main__':
    unittest.main()
