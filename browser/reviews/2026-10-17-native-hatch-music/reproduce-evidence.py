"""Read-only reproduction of this review bundle's source and export proofs.

No application build, tests or browser. Default checks recorded artifact hashes,
the committed source/asset hashes, and original FAT event bytes. --renderer also
compares the pinned parser's actual payload. --render-loop explicitly opts into
an offline render with in-memory trace instrumentation; it changes no source.
"""
from pathlib import Path
import argparse
import hashlib
import importlib.metadata
import json
import struct
import subprocess
import sys


def check(condition, message):
    if not condition:
        raise SystemExit(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    evidence = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=evidence.parents[2])
    parser.add_argument('--renderer', type=Path)
    parser.add_argument('--compare-export', type=Path, action='append', default=[])
    parser.add_argument('--render-loop', action='store_true')
    args = parser.parse_args()
    repo = args.repo.resolve()
    receipt = json.loads((evidence / 'review-manifest.json').read_text())

    for line in (evidence / 'SHA256SUMS').read_text().splitlines():
        expected, name = line.split('  ', 1)
        check(sha((evidence / name).read_bytes()) == expected, f'Changed evidence: {name}')
    for name, expected in receipt['finalSourceHashes'].items():
        check(sha((repo / name).read_bytes()) == expected, f'Changed reviewed source: {name}')
    for name, expected in receipt['nativeSourceHashes'].items():
        check(sha((repo / name).read_bytes()) == expected, f'Changed native source: {name}')

    assets = repo / 'browser/public/source/hatching/music'
    manifest = json.loads((assets / 'manifest.json').read_text())
    for directory in args.compare_export:
        for name in receipt['exportOutputHashes']:
            check((directory / name).read_bytes() == (assets / name).read_bytes(),
                  f'Non-identical export: {directory / name}')

    native = (repo / manifest['source']).read_bytes()
    check(sha(native) == manifest['sourceSHA256'], 'Changed native SDAT')
    u16 = lambda offset: struct.unpack_from('<H', native, offset)[0]
    u32 = lambda offset: struct.unpack_from('<I', native, offset)[0]
    info, fat = u32(24), u32(32)
    table = info + u32(info + 8)
    payloads, proof = {}, []
    for sid in (1011, 1188):
        record = info + u32(table + 4 + sid * 4)
        file_id = u16(record)
        offset, size = u32(fat + 12 + file_id * 16), u32(fat + 16 + file_id * 16)
        event_offset = u32(offset + 0x18)
        payload = native[offset + event_offset:offset + size]
        payloads[sid] = payload
        proof.append({'id': sid, 'fileId': file_id, 'nativeFileOffset': offset,
                      'nativeFileBytes': size, 'eventsOffsetWithinSSEQ': event_offset,
                      'nativeEventsBytes': len(payload), 'nativeEventsSHA256': sha(payload)})
    recorded = json.loads((evidence / 'native-event-payload-proof.json').read_text())
    check(len(proof) == len(recorded['sequences']), 'Changed native payload proof count')
    for row, expected in zip(proof, recorded['sequences']):
        check(all(row[key] == expected[key] for key in row), f'Changed native payload: {row["id"]}')

    if args.renderer:
        renderer = args.renderer.resolve()
        check(subprocess.check_output(['git', '-C', str(renderer), 'rev-parse', 'HEAD'],
                                     text=True).strip() == manifest['renderer']['commit'], 'Unpinned renderer')
        check(not subprocess.check_output(['git', '-C', str(renderer), 'status', '--porcelain',
                                          '--untracked-files=no'], text=True).strip(), 'Modified renderer')
        for name, expected in manifest['renderer']['files'].items():
            check(sha((renderer / name).read_bytes()) == expected, f'Changed renderer: {name}')
        for name in ('numpy', 'ndspy'):
            check(importlib.metadata.version(name) == manifest['renderer'][name], f'Wrong {name} version')
        sys.path.insert(0, str(renderer))
        from dualrip.formats.sdat.sdat import SdatFile
        archive = SdatFile(str(repo / manifest['source']))
        for row in proof:
            payload = bytes(archive.sequence(row['id']).blob)
            check(payload == payloads[row['id']], f'Renderer changed native event bytes: {row["id"]}')
            row.update(renderEventsBytes=len(payload), renderEventsSHA256=sha(payload), equal=True)

        if args.render_loop:
            import numpy as np
            from dualrip.engine.sdat.render import LiveRenderer
            from dualrip.engine.sdat.sequencer import Player
            records, chunks = [], []
            original = Player.mark_loop

            def measured(self, start, end, track=None):
                records.append({'track': track.num if track else None, 'start': start,
                                'end': end, 'length': end - start})
                return original(self, start, end, track)

            Player.mark_loop = measured
            try:
                arc = archive.sequence(1011)
                entry = arc.entries[0]
                bank, waves = archive.bank(entry.bank_id)
                render = LiveRenderer(arc.blob, entry.offset, bank, waves, entry.volume,
                                      32768, player_prio=entry.cpr, loop_passes=2)
                while not render.finished:
                    chunk = render.step()
                    if chunk is not None:
                        chunks.append(chunk)
                    check(render.emitted < 32768 * 180, 'Unexpected loop render duration')
                actual = {'owner': render.ply._loop_owner.num, 'marks': list(render.loop_marks),
                          'records': records, 'pcmHash': sha(np.concatenate(chunks).tobytes())}
            finally:
                Player.mark_loop = original
            check(actual == json.loads((evidence / 'native-loop-proof.json').read_text()),
                  'Loop trace or PCM differs from the recorded render')
    else:
        check(not args.render_loop, '--render-loop requires --renderer')

    print(json.dumps({'evidenceHashes': 'verified', 'sourceHashes': 'verified',
                      'nativePayloads': proof, 'comparedExports': len(args.compare_export),
                      'loopRender': 'matched recorded trace and PCM' if args.render_loop else 'not rerun'}, indent=2))


if __name__ == '__main__':
    main()
