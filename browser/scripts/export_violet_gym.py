"""Export the dynamically spawned Violet Gym platform, not an outdoor model111.

Usage: python3 browser/scripts/export_violet_gym.py --apicula PATH
Uses only the repository's original NARCs and the existing apicula converter.
"""
from pathlib import Path
import argparse, base64, hashlib, json, struct, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]


def member(path, index):
    raw = (ROOT / path).read_bytes()
    assert raw[:4] == b'NARC'
    cursor = struct.unpack_from('<H', raw, 12)[0]
    offsets = payload = None
    while cursor < len(raw):
        magic, size = struct.unpack_from('<4sI', raw, cursor)
        if magic == b'BTAF':
            count = struct.unpack_from('<H', raw, cursor + 8)[0]
            assert index < count
            offsets = struct.unpack_from('<II', raw, cursor + 12 + index * 8)
        if magic == b'GMIF':
            payload = raw[cursor + 8:cursor + size]
        cursor += size
    assert offsets is not None and payload is not None
    return payload[offsets[0]:offsets[1]]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apicula', type=Path, default=ROOT / '.local-tools/apicula/target/release/apicula')
    args = parser.parse_args()
    # area_data.c selects the ROOM archive for buildModelKind0. Area28's
    # prop texture is26. violet.c dynamically loads room model111 at runtime.
    header = member('files/a/0/4/2', 28)
    prop_texture, _, _, build_kind, _ = struct.unpack('<HHHBB', header)
    assert (prop_texture, build_kind) == (26, 0)
    props = member('files/a/0/4/3', prop_texture)
    prop_count = struct.unpack_from('<H', props)[0]
    assert 111 in struct.unpack_from('<' + 'H' * prop_count, props, 2)
    # Shape count0 means MapPropManager_Draw renders the complete model.
    # A nonzero table entry would require preserving its explicit shape list.
    shapes = (ROOT / 'files/fielddata/build_model/bm_room_matshp.dat').read_bytes()
    assert struct.unpack_from('<H', shapes, 4 + 111 * 4)[0] == 0
    model = member('files/a/1/4/8', 111)
    texture = member('files/a/0/7/0', prop_texture)
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        (folder / 'model.nsbmd').write_bytes(model)
        (folder / 'texture.nsbtx').write_bytes(texture)
        subprocess.run([str(args.apicula), 'convert', '-f=glb', str(folder / 'model.nsbmd'), str(folder / 'texture.nsbtx'), '-o', str(folder / 'out')], check=True, capture_output=True)
        paths = list((folder / 'out').glob('*.glb'))
        assert len(paths) == 1
        raw = paths[0].read_bytes()
        size = struct.unpack_from('<I', raw, 12)[0]
        doc = json.loads(raw[20:20 + size])
        for image in doc.get('images', []):
            if 'uri' in image:
                image['uri'] = 'data:image/png;base64,' + base64.b64encode((paths[0].parent / image['uri']).read_bytes()).decode()
        encoded = json.dumps(doc, separators=(',', ':')).encode()
        encoded += b' ' * (-len(encoded) % 4)
        tail = raw[20 + size:]
        packed = struct.pack('<III', 0x46546c67, 2, 20 + len(encoded) + len(tail)) + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded + tail
    output = ROOT / 'browser/public/source/props/0-111-26.glb'
    output.write_bytes(packed)
    print(json.dumps({'asset': str(output.relative_to(ROOT)), 'modelSHA256': hashlib.sha256(model).hexdigest(), 'textureSHA256': hashlib.sha256(texture).hexdigest(), 'glbSHA256': hashlib.sha256(packed).hexdigest()}))


if __name__ == '__main__':
    main()
