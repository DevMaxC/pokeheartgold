"""Export native Azalea topology and fixed-point movement fixtures; no renderer."""
import hashlib
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def native_data():
    path = ROOT / 'src/field/gymmick/azalea.c'
    source = path.read_text()
    routes = {}
    for name, body in re.findall(r'static const AzaleaGymmickSpinarakRouteNode (sSpinarakRoute_\w+)\[\] = \{(.*?)\n\};', source, re.S):
        routes[name.removeprefix('sSpinarakRoute_')] = [[int(x), int(z)] for x, z in re.findall(r'\{\s*(\d+),\s*(\d+)\s*\}', body)]
    positions = re.search(r'sSpinarakInitialPositions\[\] = \{(.*?)\n\};', source, re.S)[1]
    stations = [[int(x), int(z)] for x, z in re.findall(r'\{\s*(\d+),\s*(\d+)\s*\}', positions)]
    slots = []
    for station in range(1, 13):
        body = re.search(r'sSpinarakRoutes_From' + str(station) + r'\[\] = \{(.*?)\n\};', source, re.S)[1]
        entries = re.findall(r'\{([^{}]*)\}', body)
        row = []
        for entry in entries:
            if not entry.strip():
                row.append(None)
                continue
            length_name, destination, route_name = re.fullmatch(r'\s*NELEMS\((sSpinarakRoute_\w+)\),\s*(\d+),\s*(sSpinarakRoute_\w+)\s*', entry).groups()
            assert length_name == route_name
            row.append({'route': route_name.removeprefix('sSpinarakRoute_'), 'destination': int(destination)})
        assert len(row) == 4
        slots.append(row)
    init = (ROOT / 'src/gymmick_init.c').read_text()
    spiders = [int(value) for _, value in re.findall(r'data->azalea.spiders\[(\d)\] = (\d+);', init)]
    assert len(routes) == 8 and len(stations) == 12 and spiders == [0, 1, 2, 7]
    assert 'data->azalea.switches = 0;' in init
    assert 'VEC_MultAdd(FX32_CONST(2)' in source
    refs = ['src/field/gymmick/azalea.c', 'src/gymmick_init.c', 'include/gymmick.h',
            'src/save_gymmick.c', 'src/field_warp_tasks.c', 'src/main.c',
            'lib/NitroSDK/src/fx/fx_vec_normalize.c', 'lib/NitroSDK/src/fx/fx_vec_mult_add.c']
    return {'model': 118, 'asset': 'props/0-118-27.glb', 'nativeUnitsPerTile': 16, 'fixedOne': 4096,
            'movementUnitsPerTick': 2, 'ticksPerSecond': 30,
            'initial': {'spiders': spiders, 'switches': 0}, 'stations': stations, 'routes': routes, 'slots': slots,
            'reverseStations': [3, 4, 5, 9, 10, 11],
            'phases': {'afterBoardWaitTicks': 5, 'dockTicks': 1, 'shakeTicks': 7, 'beforeDisembarkWaitTicks': 9,
                       'shakeOffsetTicks': [1, 3, 5, 7], 'shakeNativeUnits': 1},
            'sources': [{'path': ref, 'sha256': hashlib.sha256((ROOT / ref).read_bytes()).hexdigest()} for ref in refs]}


def replay(points):
    """Independent Python replay of SDK integer normalize and source case5."""
    position = [points[0][0] * 16 * 4096, points[0][1] * 16 * 4096]
    poses, segments = [position[:]], []
    for start, end in zip(points, points[1:]):
        delta = [(end[i] - start[i]) * 4096 for i in range(2)]
        length = sum(value * value for value in delta)
        factor = ((1 << 56) // length) * math.isqrt(length << 2)
        velocity = [2 * ((factor * value + (1 << 44)) >> 45) for value in delta]
        initial_velocity = velocity[:]
        target = [value * 16 * 4096 for value in end]
        ticks = 0
        while True:
            ticks += 1
            assert ticks < 10000
            done = [1 if position[i] + velocity[i] == target[i] else
                    2 if (position[i] + velocity[i] > target[i] if delta[i] >= 0 else position[i] + velocity[i] < target[i]) else 0
                    for i in range(2)]
            velocity = [0 if done[i] == 2 else velocity[i] for i in range(2)]
            if all(done):
                position = target[:]
            else:
                position = [position[i] + velocity[i] for i in range(2)]
            poses.append(position[:])
            if all(done):
                break
        segments.append({'ticks': ticks, 'velocity': initial_velocity})
    sample_ticks = sorted({0, 1, (len(poses) - 1) // 2, len(poses) - 1})
    return {'ticks': len(poses) - 1, 'segments': segments,
            'samples': [{'tick': tick, 'fixed': poses[tick]} for tick in sample_ticks]}


def main():
    data = native_data()
    destination = ROOT / 'browser/src/source/azalea-gym-rules.ts'
    destination.write_text('// Generated from the original C/SDK by browser/scripts/export_azalea_gym.py.\n'
                           'export const NATIVE_AZALEA_GYM=' + json.dumps(data, separators=(',', ':')) + ' as const;\n')
    fixtures = {name: {'forward': replay(points), 'reverse': replay(list(reversed(points)))} for name, points in data['routes'].items()}
    (ROOT / 'browser/public/source/azalea-gym-fixtures.json').write_text(json.dumps(fixtures, separators=(',', ':')) + '\n')
    print(json.dumps({'routes': len(data['routes']), 'stations': len(data['stations']),
                      'slots': sum(map(len, data['slots'])), 'usableSlots': sum(slot is not None for row in data['slots'] for slot in row)}))


if __name__ == '__main__':
    main()
