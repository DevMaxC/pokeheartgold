"""Preserve the native, static Maya texture translation omitted by apicula.

This adapter is deliberately limited to the source swave_p surf material with
scale one and rotation zero. It records original FX32 values, never guesses a
shore polygon or changes native geometry/UV/image bytes. Run without --write
for a read-only inventory; the normal source importer also calls tag_glb.
"""
from pathlib import Path
import argparse
import hashlib
import json
import struct

EXTENSION = 'KHR_texture_transform'


def narc_members(data):
    if data[:4] != b'NARC':
        raise ValueError('Expected native NARC archive')
    offset = struct.unpack_from('<H', data, 12)[0]
    fat = image = None
    for _ in range(struct.unpack_from('<H', data, 14)[0]):
        magic, size = struct.unpack_from('<4sI', data, offset)
        if size < 8 or offset + size > len(data):
            raise ValueError('Invalid NARC section')
        if magic == b'BTAF':
            count = struct.unpack_from('<H', data, offset + 8)[0]
            fat = [struct.unpack_from('<II', data, offset + 12 + i * 8) for i in range(count)]
        if magic == b'GMIF':
            image = data[offset + 8:offset + size]
        offset += size
    if fat is None or image is None:
        raise ValueError('Missing NARC allocation/image section')
    return [image[start:end] for start, end in fat]


def land_model(member):
    permissions, props, model, _ = struct.unpack_from('<4I', member)
    sound = struct.unpack_from('<I', member, 16)[0] >> 16
    start = 20 + sound + permissions + props
    result = member[start:start + model]
    if result[:4] != b'BMD0':
        raise ValueError('Expected native land BMD0 model')
    return result


def info_block(data, offset):
    count = data[offset + 1]
    cursor = offset + 12 + count * 4
    size = struct.unpack_from('<H', data, cursor)[0]
    if data[offset] != 0 or size != 4:
        raise ValueError('Unsupported native dictionary layout')
    cursor += 4
    names = cursor + count * size
    return [(data[names + i * 16:names + (i + 1) * 16].split(b'\0')[0].decode('ascii'),
             struct.unpack_from('<I', data, cursor + i * size)[0]) for i in range(count)]


def translations(model):
    if model[:4] != b'BMD0':
        raise ValueError('Expected BMD0')
    section = struct.unpack_from('<I', model, 16)[0]
    if model[section:section + 4] != b'MDL0':
        raise ValueError('Expected MDL0')
    result = {}
    for _, offset in info_block(model, section + 8):
        base = section + offset
        # NNSG3dResMdlInfo at model+20: sbcType, scalingRule, texMtxMode.
        mode = model[base + 22]
        materials = base + struct.unpack_from('<I', model, base + 8)[0]
        for name, offset in info_block(model, materials + 4):
            if name != 'swave_p':
                continue
            start = materials + offset
            flags = struct.unpack_from('<H', model, start + 30)[0]
            if not flags & 1 or flags & 8:
                continue  # no matrix, or explicit zero translation
            if mode != 0 or flags & 7 != 7:
                raise ValueError('Unsupported non-translation Maya surf matrix')
            value = struct.unpack_from('<ii', model, start + 44)
            result[name] = {'version': 1, 'mode': 'maya-translation',
                            'translationFx32': list(value),
                            'sourceModelSHA256': hashlib.sha256(model).hexdigest()}
    return result


def tag_glb(glb, model):
    native = translations(model)
    length, kind = struct.unpack_from('<II', glb, 12)
    if glb[:4] != b'glTF' or kind != 0x4e4f534a:
        raise ValueError('Expected GLB JSON chunk')
    document = json.loads(glb[20:20 + length])
    changed = False
    for material in document.get('materials', []):
        entry = native.get(material.get('name'))
        if entry is None or 'baseColorTexture' not in material.get('pbrMetallicRoughness', {}):
            continue
        # Maya's translation-only native matrix: U -= transS, V += transT.
        # Both glTF UVs and the embedded image use top-to-bottom V; GLTFLoader
        # sets flipY=false. Do not negate T or modify the original UV accessor.
        trans_s, trans_t = entry['translationFx32']
        transform = {'offset': [-trans_s / 4096, trans_t / 4096]}
        texture = material['pbrMetallicRoughness']['baseColorTexture']
        extensions = texture.setdefault('extensions', {})
        if EXTENSION in extensions and extensions[EXTENSION] != transform:
            raise ValueError('Conflicting pre-existing texture transform; refuse to overwrite')
        if extensions.get(EXTENSION) != transform:
            extensions[EXTENSION] = transform
            changed = True
        for declaration in ['extensionsUsed', 'extensionsRequired']:
            names = document.setdefault(declaration, [])
            if EXTENSION not in names:
                names.append(EXTENSION)
                changed = True
    if not changed:
        return glb
    encoded = json.dumps(document, separators=(',', ':'), ensure_ascii=False).encode()
    encoded += b' ' * (-len(encoded) % 4)
    tail = glb[20 + length:]
    return (struct.pack('<III', 0x46546c67, 2, 20 + len(encoded) + len(tail)) +
            struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + tail)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--report')
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    archive = (root / 'files/a/0/6/5').read_bytes()
    members = narc_members(archive)
    entries = []
    for path in sorted((root / 'browser/public/source/land').glob('*.glb')):
        model = land_model(members[int(path.stem.split('-')[0])])
        native = translations(model)
        if not native:
            continue
        before = path.read_bytes()
        after = tag_glb(before, model)
        row = {'asset': str(path.relative_to(root)), 'native': native,
               'beforeSHA256': hashlib.sha256(before).hexdigest(),
               'afterSHA256': hashlib.sha256(after).hexdigest(),
               'changed': before != after}
        entries.append(row)
        if options.write and before != after:
            path.write_bytes(after)
    report = {'archiveSHA256': hashlib.sha256(archive).hexdigest(),
              'write': options.write, 'assets': entries}
    if options.report:
        Path(options.report).write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'nativeTranslatedAssets': len(entries),
                      'changed': sum(row['changed'] for row in entries),
                      'write': options.write}))


if __name__ == '__main__':
    main()
