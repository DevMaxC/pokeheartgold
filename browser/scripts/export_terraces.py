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
# 1/256 of a tile is 1/16 of a source pixel: ample precision for synthetic
# relief, while substantially reducing the transfer size after compression.
SCALE = 256


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

    rank = np.zeros(count+1, dtype=np.uint8)

    def find(a):
        path, node = [], a
        while parent[node] != node:
            path.append(node)
            node = int(parent[node])
        delta = 0
        for item in reversed(path):
            delta += potential[item]
            parent[item], potential[item] = node, delta
        return node, potential[a]

    def join(a, b, delta):
        # h[a] - h[b] == delta; weighted union keeps large flat plots shallow.
        ra, da = find(a)
        rb, db = find(b)
        if ra == rb:
            if abs(da-db-delta) > 1e-5:
                raise ValueError(f'Inconsistent native ledge constraints: {matrix_id}, {a}, {b}')
            return
        value = delta-da+db
        if rank[ra] < rank[rb]:
            parent[ra], potential[ra] = rb, value
        else:
            parent[rb], potential[rb] = ra, -value
            if rank[ra] == rank[rb]:
                rank[ra] += 1

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
    # Rigid source architecture needs a flat presentation offset beneath it.
    # Tie nearby centres, then flatten their shared half-tile support nodes below.
    foundation_path = ROOT / f'terraces/foundations-{matrix_id}.json'
    foundations = json.loads(foundation_path.read_text())['structures'] if foundation_path.exists() else []
    if matrix_id == 0 and not foundations:
        raise ValueError('Run export_foundations.ts before generating main-world terraces')
    water = np.isin(permissions & 255, [16, 17, 19, 21, 23])
    foundation_nodes = {}
    for building in foundations:
        x1, z1, x2, z2 = building['bounds']
        tiles = [(x,z) for z in range(max(0,int(np.floor(z1-.5))),min(height,int(np.ceil(z2+.5))))
                 for x in range(max(0,int(np.floor(x1-.5))),min(width,int(np.ceil(x2+.5))))
                 if x1-.5 <= x+.5 <= x2+.5 and z1-.5 <= z+.5 <= z2+.5 and domain[z,x] and not water[z,x]]
        if not tiles:
            continue
        ax,az = map(int,building['anchor'])
        first = int(ids[az,ax]) if domain[az,ax] else count
        try:
            for x,z in tiles:
                join(first,int(ids[z,x]),0)
            for pz in range(int(np.ceil((z1-.5)*2)),int(np.floor((z2+.5)*2))+1):
                for px in range(int(np.ceil((x1-.5)*2)),int(np.floor((x2+.5)*2))+1):
                    key = (px,pz)
                    if key in foundation_nodes:
                        join(first,foundation_nodes[key],0)
                    foundation_nodes[key] = first
                    # Water nodes and unchanged domain edges remain zero.
                    for tx in ([px//2-1,px//2] if px%2==0 else [px//2]):
                        for tz in ([pz//2-1,pz//2] if pz%2==0 else [pz//2]):
                            if 0<=tx<width and 0<=tz<height and (water[tz,tx] or not domain[tz,tx]):
                                join(first,count,0)
        except ValueError as error:
            raise ValueError(f"Foundation crosses a native height seam: {building['key']} {building['asset']} {building['bounds']}") from error
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
    # Every rendered triangle intersecting a rigid building must share its
    # displacement. Half-tile support nodes form a short, continuous apron;
    # this avoids flattening a distant ledge merely because its endpoint lies
    # one full tile outside a roof. Apply shared nodes identically on all tiles.
    flattened = {}
    for building in foundations:
        x1,z1,x2,z2 = building['bounds']
        ax,az = building['anchor']
        value = centres[int(az),int(ax)]
        for pz in range(int(np.ceil((z1-.5)*2)),int(np.floor((z2+.5)*2))+1):
            for px in range(int(np.ceil((x1-.5)*2)),int(np.floor((x2+.5)*2))+1):
                key = (px,pz)
                if key in flattened and abs(flattened[key]-value)>1e-5:
                    raise ValueError(f"Overlapping foundations disagree: {building['key']}")
                flattened[key] = value
    for (px,pz),value in flattened.items():
        x,z = px//2,pz//2
        for tx in ([x-1,x] if px%2==0 else [x]):
            for tz in ([z-1,z] if pz%2==0 else [z]):
                if 0<=tx<width and 0<=tz<height and valid[tz,tx]:
                    points[tz,tx,(pz-tz*2)*3+px-tx*2] = value
    # A flattened building may touch a ledge's free endpoint, but must never
    # remove its physical drop at the midpoint of the authored jump edge.
    for x,z,behaviour in jumps:
        dx,dz = DIRECTIONS[behaviour]
        upper_slot = {56:5,57:3,58:1,59:7}[behaviour]
        lower_slot = {56:3,57:5,58:7,59:1}[behaviour]
        visual_drop = native[z,x]+points[z,x,upper_slot]-native[z+dz,x+dx]-points[z+dz,x+dx,lower_slot]
        if visual_drop < .8:
            raise ValueError(f'Foundation obscures native ledge: {x}, {z}, drop {visual_drop}')
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
    output = {'version':2,'scale':SCALE,'cells':cells,'ledges':jumps,'cliffAssets':cliff_assets,'foundations':{building['key']:building['anchor'] for building in foundations}}
    folder = ROOT / 'terraces'; folder.mkdir(exist_ok=True)
    (folder/f'{matrix_id}.json').write_text(json.dumps(output,separators=(',',':'))+'\n')
    print(f'Matrix {matrix_id}: {len(jumps)} raised ledges, {len(cells)} height cells, range {points.min():.3f}..{points.max():.3f}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('matrices', type=int, nargs='*', default=[0])
    for matrix in parser.parse_args().matrices:
        export(matrix)
