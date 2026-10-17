"""Export Azalea's native room models and literal integer-frame BCA/PAT poses.

No route or gameplay source is synthesized here. The supported JNT ABI is
deliberately bounded to these actual files; unknown curve encodings reject.
"""
from pathlib import Path
import argparse, base64, hashlib, json, re, struct, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]
MODELS = {115: [25, 26], 116: [27, 28], 117: [23, 24], 118: [43], 122: [41, 42]}
PIVOTS = [(4, 5, 7, 8), (3, 5, 6, 8), (3, 4, 6, 7), (1, 2, 7, 8),
          (0, 2, 6, 8), (0, 1, 6, 7), (1, 2, 4, 5), (0, 2, 3, 5), (0, 1, 3, 4)]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def member(path, index):
    b = (ROOT / path).read_bytes()
    assert b[:4] == b'NARC'
    cursor = struct.unpack_from('<H', b, 12)[0]
    offsets = payload = None
    while cursor < len(b):
        kind, size = struct.unpack_from('<4sI', b, cursor)
        assert size >= 8 and cursor + size <= len(b)
        if kind == b'BTAF':
            assert index < struct.unpack_from('<H', b, cursor + 8)[0]
            offsets = struct.unpack_from('<II', b, cursor + 12 + index * 8)
        if kind == b'GMIF':
            payload = b[cursor + 8:cursor + size]
        cursor += size
    assert offsets is not None and payload is not None
    return payload[offsets[0]:offsets[1]]


def info_block(b, offset, width):
    count = b[offset + 1]
    header = offset + 12 + 4 * count
    size, _ = struct.unpack_from('<HH', b, header)
    assert size == width
    data = header + 4
    names = data + count * width
    return [(b[data + i * width:data + (i + 1) * width],
             b[names + i * 16:names + (i + 1) * 16].rstrip(b'\0').decode('ascii')) for i in range(count)]


def animation_base(b, section):
    offset = struct.unpack_from('<I', b, 16)[0]
    assert b[offset:offset + 4] == section
    records = info_block(b, offset + 8, 4)
    assert len(records) == 1
    value, name = records[0]
    return offset + struct.unpack('<I', value)[0], name


def rotation(b, base, pivots, bases, index):
    """Literal getRotDataByIdx_ and its integer-frame cross product."""
    if index & 0x8000:
        mode, a, c = struct.unpack_from('<Hhh', b, base + pivots + 6 * (index & 0x7fff))
        pivot = mode & 15
        assert pivot < 9
        out = [0] * 9
        out[pivot] = -4096 if mode & 16 else 4096
        i, j, k, l = PIVOTS[pivot]
        out[i], out[j], out[k], out[l] = a, c, -c if mode & 32 else c, -a if mode & 64 else a
        return out
    p = struct.unpack_from('<5h', b, base + bases + 10 * index)
    c = 0
    for value in [p[4], p[0], p[1], p[2], p[3]]:
        c = (c << 3) | (value & 7)
    c &= 8191
    if c & 4096:
        c -= 8192
    out = [p[0] >> 3, p[1] >> 3, p[2] >> 3, p[3] >> 3, p[4] >> 3, c]
    out += [(out[1] * out[5] - out[2] * out[4]) >> 12,
            (out[2] * out[3] - out[0] * out[5]) >> 12,
            (out[0] * out[4] - out[1] * out[3]) >> 12]
    return out


def joint_animation(b):
    base, name = animation_base(b, b'JNT0')
    magic, frames, nodes, flags, pivots, bases = struct.unpack_from('<4sHHIII', b, base)
    assert magic == b'J\0AC' and flags == 0 and 0 < frames <= 30
    offsets = struct.unpack_from('<' + 'H' * nodes, b, base + 20)
    poses = []
    identity = [4096, 0, 0, 0, 4096, 0, 0, 0, 4096]
    for frame in range(frames):
        row = []
        for node, offset in enumerate(offsets):
            cursor = base + offset
            tag = struct.unpack_from('<I', b, cursor)[0]
            assert tag >> 24 == node
            cursor += 4
            trans, rot, scale, inv = [0, 0, 0], identity[:], [4096] * 3, [4096] * 3
            if not tag & 1:
                assert not tag & (4 | 128 | 1024), 'model-relative curves need a separate native implementation'
                if not tag & 2:
                    for axis, bit in enumerate([8, 16, 32]):
                        assert tag & bit, 'sampled translations are not used by Azalea'
                        trans[axis] = struct.unpack_from('<i', b, cursor)[0]
                        cursor += 4
                if not tag & 64:
                    if tag & 256:
                        index = struct.unpack_from('<H', b, cursor)[0]
                        cursor += 4
                    else:
                        info, data = struct.unpack_from('<II', b, cursor)
                        cursor += 8
                        assert info == frames << 16, 'only native per-frame rotation tracks are supported'
                        index = struct.unpack_from('<H', b, base + data + frame * 2)[0]
                    rot = rotation(b, base, pivots, bases, index)
                if not tag & 512:
                    for axis, bit in enumerate([2048, 4096, 8192]):
                        assert tag & bit, 'sampled scales are not used by Azalea'
                        scale[axis], inv[axis] = struct.unpack_from('<ii', b, cursor)
                        cursor += 8
            row.append({'translationFx32': trans, 'rotationFx32': rot, 'scaleFx32': scale, 'inverseScaleFx32': inv})
        poses.append(row)
    return {'kind': 'joint', 'name': name, 'frameCount': frames, 'nativeFrames': poses}


def pattern_animation(b):
    base, name = animation_base(b, b'PAT0')
    magic, frames, nt, np, to, po = struct.unpack_from('<4sHBBHH', b, base)
    assert magic == b'M\0PT' and 0 < frames <= 30
    def names(offset, count):
        return [b[base + offset + i * 16:base + offset + (i + 1) * 16].rstrip(b'\0').decode('ascii') for i in range(count)]
    textures, palettes = names(to, nt), names(po, np)
    tracks = []
    for data, material in info_block(b, base + 12, 8):
        count, _, offset = struct.unpack('<IHH', data)
        keys = []
        for i in range(count):
            frame, ti, pi = struct.unpack_from('<HBB', b, base + offset + i * 4)
            assert ti < nt and pi < np and frame < frames
            keys.append({'frame': frame, 'texture': textures[ti], 'palette': palettes[pi]})
        tracks.append({'material': material, 'keys': keys})
    return {'kind': 'pattern', 'name': name, 'frameCount': frames, 'tracks': tracks}


def pack_glb(path, joint_count):
    b = path.read_bytes()
    size = struct.unpack_from('<I', b, 12)[0]
    doc = json.loads(b[20:20 + size])
    for image in doc.get('images', []):
        if 'uri' in image:
            image['uri'] = 'data:image/png;base64,' + base64.b64encode((path.parent / image['uri']).read_bytes()).decode()
    # Stable native index survives GLTFLoader duplicate-name sanitization.
    for i in range(joint_count):
        doc['nodes'][i].setdefault('extras', {})['nativeAzaleaJoint'] = i
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    tail = b[20 + size:]
    result = struct.pack('<III', 0x46546c67, 2, 20 + len(encoded) + len(tail)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + tail
    return result, doc


def export(apicula):
    output = ROOT / 'browser/public/source'
    directory = output / 'azalea-gym'
    directory.mkdir(exist_ok=True)
    header = member('files/a/0/4/2', 29)
    prop_texture, _, _, build_kind, _ = struct.unpack('<HHHBB', header)
    assert (prop_texture, build_kind) == (27, 0)
    props = member('files/a/0/4/3', 27)
    assert set(MODELS) <= set(struct.unpack_from('<' + 'H' * struct.unpack_from('<H', props)[0], props, 2))
    shape_data = (ROOT / 'files/fielddata/build_model/bm_room_matshp.dat').read_bytes()
    texture = member('files/a/0/7/0', 27)
    manifest = {'version': 1, 'map': 180, 'key': 'MAP_AZALEA_GYM', 'matrix': 105, 'area': 29, 'roomKind': 0, 'texture': 27, 'ticksPerSecond': 30, 'apiculaFramesPerSecond': 60, 'converter': {'tool': 'apicula', 'binarySHA256': sha(apicula.read_bytes()), 'playback': 'Original SDK integer-frame tables; converter clips retained for inspection only'}, 'models': {}, 'sources': {}}
    for path in ['browser/scripts/export_azalea_world.py', 'browser/public/source/maps/180.json', 'src/field/gymmick/azalea.c', 'src/field/area_data.c', 'src/field/map_prop_animation.c', 'src/field/map_prop_render.c', 'lib/include/nnsys/g3d_anm_internal.h', 'lib/asm/nnsys_data.s', 'lib/NitroSystem/src/g3d_anm_bca.c', 'lib/NitroSystem/src/g3d_anm_bca_data.c', 'lib/NitroSystem/src/g3d_anm_btp.c', 'files/a/0/4/2', 'files/a/0/4/3', 'files/fielddata/build_model/bm_room_matshp.dat', 'files/a/1/0/8', 'files/a/1/0/6', 'files/a/1/4/8', 'files/a/0/7/0']:
        manifest['sources'][path] = sha((ROOT / path).read_bytes())
    with tempfile.TemporaryDirectory() as temporary:
        for model, expected in MODELS.items():
            folder = Path(temporary) / str(model)
            folder.mkdir()
            native = member('files/a/1/4/8', model)
            listing = member('files/a/1/0/8', model)
            assert list(struct.unpack_from('<4i', listing, 8)) == expected + [-1] * (4 - len(expected))
            assert struct.unpack_from('<H', shape_data, 4 + model * 4)[0] == 0
            (folder / 'model.nsbmd').write_bytes(native)
            (folder / 'texture.nsbtx').write_bytes(texture)
            animation_paths, animations = [], []
            for archive_id in expected:
                raw = member('files/a/1/0/6', archive_id)
                path = folder / ('animation-' + str(archive_id) + '.bin')
                path.write_bytes(raw)
                animation_paths.append(str(path))
                animation = joint_animation(raw) if raw[:4] == b'BCA0' else pattern_animation(raw)
                animation.update({'archive': archive_id, 'nativeSHA256': sha(raw)})
                animations.append(animation)
            subprocess.run([str(apicula), 'convert', '-f=glb', str(folder / 'model.nsbmd'), str(folder / 'texture.nsbtx'), *animation_paths, '-o', str(folder / 'out')], check=True, capture_output=True)
            paths = list((folder / 'out').glob('*.glb'))
            assert len(paths) == 1
            joint_count = len(animations[0]['nativeFrames'][0]) if animations[0]['kind'] == 'joint' else 1
            packed, doc = pack_glb(paths[0], joint_count)
            model_base, _ = animation_base(native, b'MDL0')
            native_nodes = [name for _, name in info_block(native, model_base + 64, 4)]
            assert len(native_nodes) == joint_count
            assert [node['name'] for node in doc['nodes'][:joint_count]] == native_nodes, 'converter skeleton must retain literal native object ordering'
            # Existing static-room exports stay immutable; dedicated authored
            # assets carry pose metadata and are owned by the dedicated loader.
            asset = 'props/0-118-27.glb' if model == 118 else 'azalea-gym/model-' + str(model) + '.glb'
            (output / asset).write_bytes(packed)
            for animation in animations:
                if animation['kind'] != 'pattern':
                    continue
                for track in animation['tracks']:
                    for key in track['keys']:
                        png = folder / 'out' / (re.sub('[^a-zA-Z0-9_]', '_', key['texture']) + '.png')
                        assert png.exists()
                        target = 'azalea-gym/' + str(model) + '-' + str(animation['archive']) + '.png'
                        (output / target).write_bytes(png.read_bytes())
                        key['asset'], key['imageSHA256'] = target, sha(png.read_bytes())
            manifest['models'][str(model)] = {'asset': asset, 'glbSHA256': sha(packed), 'modelSHA256': sha(native), 'textureSHA256': sha(texture), 'animationListSHA256': sha(listing), 'animationListFlags': list(listing[:4]), 'nativeJointCount': joint_count, 'nativeNodeNames': native_nodes, 'animations': animations}
    (directory / 'resources.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apicula', type=Path, default=ROOT / '.local-tools/apicula/target/release/apicula')
    args = parser.parse_args()
    manifest = export(args.apicula)
    print(json.dumps({'models': len(manifest['models']), 'jointFrames': sum(a['frameCount'] for m in manifest['models'].values() for a in m['animations'] if a['kind'] == 'joint'), 'patternAnimations': 4}))
