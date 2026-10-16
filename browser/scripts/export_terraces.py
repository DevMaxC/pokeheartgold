"""Add presentation height to native ledges without changing their XY layout.

The DS collision plates leave most ledges flat. Solve a smooth displacement
field with exact upper/lower constraints, cutting the ground at each native
ledge's downhill edge. Open paths around the ends remain smooth ramps.
Requires numpy/scipy; generated files are committed runtime assets.
"""
from pathlib import Path
import argparse, base64, json, struct
import numpy as np
from scipy.ndimage import distance_transform_cdt
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve

ROOT = Path(__file__).resolve().parents[1] / 'public/source'
DIRECTIONS = {56: (1, 0), 57: (-1, 0), 58: (0, -1), 59: (0, 1)}
SCALE = 4096


def export(matrix_id):
    matrix = json.loads((ROOT / f'matrices/{matrix_id}.json').read_text())
    height, width = matrix['height'] * 32, matrix['width'] * 32
    permissions = np.full((height, width), 0x8000, dtype=np.uint16)
    native = np.zeros((height, width))
    valid = np.zeros((height, width), dtype=bool)
    for i, land_id in enumerate(matrix['models']):
        path = ROOT / f'lands/{land_id}.json'
        if land_id == 65535 or not path.exists():
            continue
        land = json.loads(path.read_text())
        cz, cx = divmod(i, matrix['width'])
        for z in range(32):
            for x in range(32):
                xx, zz = cx * 32 + x, cz * 32 + z
                permissions[zz, xx] = land['permissions'][z * 32 + x]
                valid[zz, xx] = True
                values = []
                for plate in land['plates']:
                    x1, z1, x2, z2 = plate['bounds']
                    nx, ny, nz = plate['normal']
                    if abs(ny) > 1e-6 and min(x1, x2) <= x-15.5 <= max(x1, x2) and min(z1, z2) <= z-15.5 <= max(z1, z2):
                        values.append(-(plate['constant'] + nx*(x-15.5) + nz*(z-15.5))/ny)
                native[zz, xx] = (min(values, key=abs) if values else 0) + matrix['altitudes'][i]*.5
    ledges = np.isin(permissions & 255, list(DIRECTIONS))
    if not ledges.any():
        return
    domain = (distance_transform_cdt(~ledges, metric='taxicab') <= 28) & valid
    ids = np.full((height, width), -1, dtype=np.int32)
    ids[domain] = np.arange(domain.sum())
    count = int(domain.sum())
    parent = np.arange(count+1)
    potential = np.zeros(count+1)

    def find(a):
        if parent[a] != a:
            root, delta = find(int(parent[a]))
            potential[a] += delta
            parent[a] = root
        return int(parent[a]), potential[a]

    def join(a, b, delta):
        # h[a] - h[b] == delta
        ra, da = find(a)
        rb, db = find(b)
        if ra == rb:
            if abs(da-db-delta) > 1e-5:
                raise ValueError(f'Inconsistent native ledge constraints: {matrix_id}, {a}, {b}')
            return
        parent[ra] = rb
        potential[ra] = delta-da+db

    seams, jumps = set(), []
    for z, x in np.argwhere(ledges):
        dx, dz = DIRECTIONS[int(permissions[z, x] & 255)]
        ux, uz, lx, lz = x-dx, z-dz, x+dx, z+dz
        if not (0 <= ux < width and 0 <= lx < width and 0 <= uz < height and 0 <= lz < height and domain[uz, ux] and domain[lz, lx]):
            raise ValueError(f'Ledge without imported neighboring terrain: {matrix_id}, {x}, {z}')
        drop = native[uz, ux]-native[lz, lx]
        if drop >= .8:
            continue  # Retain an existing native physical drop.
        upper, edge, lower = int(ids[uz, ux]), int(ids[z, x]), int(ids[lz, lx])
        join(edge, upper, native[uz, ux]-native[z, x])
        join(upper, lower, 1.05-drop)
        seams.add(tuple(sorted(((int(x), int(z)), (int(lx), int(lz))))))
        jumps.append([int(x), int(z), int(permissions[z, x] & 255)])
    # Open water stays at its original height. Domain boundaries are fixed zero
    # so a streamed cell can meet an unchanged cell without a crack.
    water = np.isin(permissions & 255, [16, 17, 19, 21, 23])
    for z, x in np.argwhere(domain):
        boundary = any(not (0 <= x+dx < width and 0 <= z+dz < height and domain[z+dz, x+dx]) for dx, dz in [(1,0),(-1,0),(0,1),(0,-1)])
        if boundary or water[z, x]:
            join(int(ids[z, x]), count, 0)
    fixed, fixed_delta = find(count)
    roots, deltas = zip(*(find(a) for a in range(count)))
    roots, deltas = np.array(roots), np.array(deltas)
    unique = sorted(set(roots)-{fixed})
    variables = {root: i for i, root in enumerate(unique)}
    rows, cols, data, rhs = [], [], [], np.zeros(len(unique))

    def equation(terms, target, weight):
        coeff = {}
        for a, coefficient in terms:
            root, offset = int(roots[a]), deltas[a]
            if root == fixed:
                target -= coefficient * (offset-fixed_delta)
            else:
                index = variables[root]
                coeff[index] = coeff.get(index, 0)+coefficient
                target -= coefficient*offset
        for i, ci in coeff.items():
            rhs[i] += weight*ci*target
            for j, cj in coeff.items():
                rows.append(i); cols.append(j); data.append(weight*ci*cj)

    for z, x in np.argwhere(domain):
        a = int(ids[z, x])
        equation([(a, 1)], 0, .005)
        for dx, dz in [(1,0),(0,1)]:
            if x+dx >= width or z+dz >= height or not domain[z+dz, x+dx]:
                continue
            if tuple(sorted(((int(x), int(z)), (int(x+dx), int(z+dz))))) in seams:
                continue
            equation([(a, 1), (int(ids[z+dz, x+dx]), -1)], 0, 1)
    system = coo_matrix((data, (rows, cols)), shape=(len(unique), len(unique))).tocsr()
    solution = spsolve(system, rhs)
    centres = np.zeros((height, width))
    centres[domain] = [((solution[variables[int(root)]]+delta) if root != fixed else delta-fixed_delta) for root, delta in zip(roots, deltas)]
    corners = np.zeros((height, width, 4))  # NW, NE, SE, SW
    # Corners are shared across every intact edge, split only at a ledge seam.
    # At a free endpoint the four sectors reconnect, tapering into a ramp.
    for z in range(height+1):
        for x in range(width+1):
            incident = [(x-1,z-1,2),(x,z-1,3),(x,z,0),(x-1,z,1)]
            incident = [(tx,tz,c) for tx,tz,c in incident if 0 <= tx < width and 0 <= tz < height]
            remaining = set(range(len(incident)))
            while remaining:
                component, queue = set(), [remaining.pop()]
                while queue:
                    a = queue.pop(); component.add(a)
                    ax, az, _ = incident[a]
                    for b in list(remaining):
                        bx, bz, _ = incident[b]
                        if abs(ax-bx)+abs(az-bz) == 1 and tuple(sorted(((ax,az),(bx,bz)))) not in seams:
                            remaining.remove(b); queue.append(b)
                value = 0 if any(water[incident[a][1],incident[a][0]] for a in component) else np.mean([centres[incident[a][1], incident[a][0]] for a in component])
                for a in component:
                    tx,tz,c = incident[a]; corners[tz,tx,c] = value
    points = np.zeros((height,width,9))  # NW,N,NE,W,centre,E,SW,S,SE
    points[:,:,0],points[:,:,2],points[:,:,8],points[:,:,6] = [corners[:,:,i] for i in range(4)]
    points[:,:,4] = centres
    for z,x in np.argwhere(domain):
        for dx,dz,slot in [(0,-1,1),(-1,0,3),(1,0,5),(0,1,7)]:
            nx,nz = x+dx,z+dz
            inside = 0 <= nx < width and 0 <= nz < height
            split = tuple(sorted(((int(x),int(z)),(int(nx),int(nz))))) in seams
            value = centres[z,x] if split else (centres[z,x]+(centres[nz,nx] if inside else 0))*.5
            if water[z,x] or (inside and water[nz,nx] and not split):
                value = 0
            points[z,x,slot] = value
    quantized = np.rint(points*SCALE).astype('<i2')
    if not np.isfinite(points).all() or np.abs(points).max() >= 7.9:
        raise ValueError('Terrain field exceeds finite signed texture range')
    cells = {}
    for cz in range(matrix['height']):
        for cx in range(matrix['width']):
            values = quantized[cz*32:cz*32+32,cx*32:cx*32+32]
            if values.any():
                cells[f'{cx},{cz}'] = base64.b64encode(values.tobytes()).decode()
    cliff_assets = {}
    for path in sorted((ROOT/'land').glob('*.glb')):
        context = path.stem.split('-')[-1]
        if context in cliff_assets:
            continue
        blob = path.read_bytes()
        length = struct.unpack_from('<I', blob, 12)[0]
        asset = json.loads(blob[20:20+length])
        if any(material.get('name') == 'cliff01' for material in asset.get('materials', [])):
            cliff_assets[context] = 'land/'+path.name
    output = {'version':2,'scale':SCALE,'cells':cells,'ledges':jumps,'cliffAssets':cliff_assets}
    folder = ROOT / 'terraces'; folder.mkdir(exist_ok=True)
    (folder/f'{matrix_id}.json').write_text(json.dumps(output,separators=(',',':'))+'\n')
    print(f'Matrix {matrix_id}: {len(jumps)} raised ledges, {len(cells)} height cells, range {points.min():.3f}..{points.max():.3f}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('matrices', type=int, nargs='*', default=[0])
    for matrix in parser.parse_args().matrices:
        export(matrix)
