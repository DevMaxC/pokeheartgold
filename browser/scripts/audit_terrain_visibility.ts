/** Finite source/runtime terrain visibility audit; not visual approval.
 * node --experimental-transform-types browser/scripts/audit_terrain_visibility.ts
 * --matrices=0 --cells=0:21,10 --candidate --inventory-only --self-test
 * Reports keep missing physical coverage, camera witnesses, authored lower
 * corridors and unsupported inference separate. No runtime geometry is edited.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises';
import { inflateSync, gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { resolve, dirname, basename, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { repairOriginalAsset, originalMaterial } from '../src/source/render-repair.ts';
import { closeBuildingExterior } from '../src/source/building-exterior.ts';
import { permissionWalkable, tilePermission } from '../src/source/terrain.ts';
import { furnitureObstacles, furnitureBlocksStep } from '../src/source/furniture-collision.ts';
import { fieldCameraObstacles } from '../src/source/camera.ts';
import { forestFoundation } from '../src/source/foundations.ts';
import { shorelineUnderlay } from '../src/source/shoreline.ts';
import { closeBuildingFooting } from '../src/source/building-footing.ts';
import { Terraces, type TerraceData } from '../src/source/ledges.ts';
import { terrainSceneryEntrances } from '../src/source/terrain-scenery.ts';
import { terraceModel, terraceWalls, terraceCliffMaterial } from '../src/source/terrace-model.ts';
import type { Cell, Land, Matrix, SourceMap, SourceIndex } from '../src/source/types.ts';
type Pixels = {
    data: Uint8Array;
    width: number;
    height: number;
};
type Triangle = {
    p: THREE.Vector3[];
    uv: THREE.Vector2[];
    material: THREE.MeshBasicMaterial;
    name: string;
    mesh?: string;
    placement?: string;
    coverageOnly?: boolean;
};
type Context = {
    key: string;
    matrix: number;
    map: number;
    mapName: string;
    mapType: string;
    cell: Cell;
    aliases: number[];
};
type Probe = {
    kind?: 'side' | 'existing-top' | 'inferred-top';
    visual?: {
        source: boolean;
        baseline: boolean;
        candidate?: boolean;
    };
    point: number[];
    normal: number[];
    top: number;
    base: number;
    material: string;
    reason: string;
    component: number;
    physical: {
        source?: boolean;
        baseline: boolean;
        candidate?: boolean;
    };
    camera?: any;
    baselineCamera?: any;
    unsupported?: string;
};
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=')]; }));
const source = new URL('../public/source/', import.meta.url), repo = new URL('../../', import.meta.url), loader = new GLTFLoader(), hashes: Record<string, string> = {};
const digest = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const readJSON = async (path: string) => { const b = await readFile(new URL(path, source)); hashes[path] = digest(b); return JSON.parse(b.toString()); };
const round = (n: number) => Math.round(n * 1e6) / 1e6, xyz = (p: THREE.Vector3) => p.toArray().map(round);
const water = /sea|water|river|pond|swave|wave|lake|foam/i, deco = /tree|bush|leaf|foliage|flower|hana|plant|fence|saku|kage|shadow|hikari/i, bridge = /bridge|hashi|pier|dock|plank|rail/i, geology = /cliff|peak|mount|rock|slope|cave|iwa|yama|earth|soil/i;
const terrain = /cliff|wall|peak|mount|rock|slope|cave|iwa|yama|earth|dirt|grass|road|sand|beach|ground|floor|tile|soil|stone|path|allpeak/i;
// Hash the complete nested application tree, rather than only source/*.ts:
// family dispatchers can import deeper geometry helpers. Also pin the actual
// Three implementation used by Node, including its relative import closure.
// Package locks alone would not detect edited installed dependency bytes.
const browserRoot = fileURLToPath(new URL('../', import.meta.url));
async function nestedSourceFiles(directory: string): Promise<string[]> {
    const entries = await readdir(join(browserRoot, directory), { withFileTypes: true });
    const children = await Promise.all(entries.map(entry => entry.isDirectory()
        ? nestedSourceFiles(join(directory, entry.name))
        : entry.isFile() && !/\.test\.[cm]?[jt]sx?$/.test(entry.name) ? [join(directory, entry.name)] : []));
    return children.flat();
}
async function installedImportClosure(seeds: string[]) {
    const visited = new Set<string>();
    async function visit(url: string): Promise<void> {
        const file = fileURLToPath(url), key = relative(browserRoot, file);
        if (visited.has(key)) return;
        visited.add(key);
        const code = await readFile(file, 'utf8');
        // Installed Three sources use top-level static declarations. Anchoring
        // them avoids interpreting documentation examples/asset URLs as code.
        const imports = [...code.matchAll(/^\s*(?:import|export)\s+(?:(?:\{[^}]*\}|\*[^'";]*|[A-Za-z_$][^'";]*)\s+from\s*)?['"]([^'"]+)['"]/gm)];
        for (const match of imports) {
            const specifier = match[1];
            if (specifier.startsWith('.')) await visit(new URL(specifier, url).href);
            else if (specifier === 'three' || specifier.startsWith('three/')) await visit(import.meta.resolve(specifier));
            else if (!specifier.startsWith('node:')) throw Error('Untracked installed dependency import: ' + specifier);
        }
    }
    for (const seed of seeds) await visit(import.meta.resolve(seed));
    return [...visited];
}
const sourceFiles = [...new Set(['scripts/audit_terrain_visibility.ts', 'package.json', 'package-lock.json',
    ...await nestedSourceFiles('src'),
    ...await installedImportClosure(['three', 'three/addons/loaders/GLTFLoader.js', 'three/addons/utils/SkeletonUtils.js']),
    'node_modules/three/package.json'])].sort();
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (p) => [p, digest(await readFile(new URL('../' + p, import.meta.url)))])));
function png(bytes: Buffer): Pixels {
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw Error('Expected PNG image');
    let width = 0, height = 0, bpp = 0;
    const chunks: Buffer[] = [];
    for (let at = 8; at < bytes.length;) {
        const length = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + length);
        at += length + 12;
        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0)
                throw Error('Audit decoder requires non-interlaced 8-bit RGBA PNG');
            bpp = 4;
        }
        else if (type === 'IDAT')
            chunks.push(data);
    }
    const raw = inflateSync(Buffer.concat(chunks)), stride = width * bpp, data = new Uint8Array(stride * height);
    let offset = 0;
    const paeth = (a: number, b: number, c: number) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
    for (let y = 0; y < height; y++) {
        const filter = raw[offset++];
        if (filter > 4)
            throw Error('Unsupported PNG filter');
        for (let x = 0; x < stride; x++) {
            const left = x >= bpp ? data[y * stride + x - bpp] : 0, up = y ? data[(y - 1) * stride + x] : 0, corner = y && x >= bpp ? data[(y - 1) * stride + x - bpp] : 0;
            data[y * stride + x] = (raw[offset++] + [0, left, up, Math.floor((left + up) / 2), paeth(left, up, corner)][filter]) & 255;
        }
    }
    return { data, width, height };
}
function textures(bytes: Buffer) {
    const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length).toString()), binary = bytes.subarray(28 + length);
    for (const material of json.materials || []) {
        const t = material.pbrMetallicRoughness?.baseColorTexture;
        if (t && (t.texCoord || t.extensions?.KHR_texture_transform))
            throw Error('Audit needs explicit support for this non-native UV set/transform');
    }
    const images = (json.images || []).map((image: any) => { const view = json.bufferViews[image.bufferView]; return png(image.uri ? Buffer.from(image.uri.split(',')[1], 'base64') : binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)); });
    const wrapping = (value = 10497) => {
        const mode = ({ 10497: THREE.RepeatWrapping, 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping } as Record<number, THREE.Wrapping>)[value];
        if (mode === undefined)
            throw Error(`Unknown glTF texture wrap ${value}`);
        return mode;
    };
    return (json.textures || []).map((t: any) => { const image = images[t.source], texture = new THREE.DataTexture(image.data, image.width, image.height), sampler = json.samplers?.[t.sampler] || {}; texture.flipY = false; texture.wrapS = wrapping(sampler.wrapS); texture.wrapT = wrapping(sampler.wrapT); return texture; });
}
function geometryGLB(bytes: Buffer): ArrayBuffer {
    const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + length).toString());
    delete json.images;
    delete json.textures;
    delete json.samplers;
    for (const m of json.materials || []) {
        m.extras = { ...m.extras, auditTextureIndex: m.pbrMetallicRoughness?.baseColorTexture?.index };
        delete m.pbrMetallicRoughness?.baseColorTexture;
        delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
        delete m.normalTexture;
        delete m.occlusionTexture;
        delete m.emissiveTexture;
    }
    let encoded = JSON.stringify(json);
    encoded += ' '.repeat((4 - Buffer.byteLength(encoded) % 4) % 4);
    const header = bytes.subarray(0, 20), rest = bytes.subarray(20 + length), chunk = Buffer.from(encoded), result = Buffer.concat([header, chunk, rest]);
    result.writeUInt32LE(result.length, 8);
    result.writeUInt32LE(chunk.length, 12);
    return result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer;
}
const nativeTemplates = new Map<string, THREE.Group>();
const textureCache = new Map<string, THREE.Texture>(), templates = new Map<string, Promise<THREE.Group>>(), lands = new Map<number, Land>(), matrices = new Map<number, Matrix>(), maps = new Map<number, SourceMap>();
let foliage: Record<string, Record<string, any>> = {}, terraces: Terraces | null = null;
async function asset(path: string): Promise<THREE.Group> {
    if (!templates.has(path))
        templates.set(path, (async () => {
            const bytes = await readFile(new URL(path, source));
            hashes[path] = digest(bytes);
            const parsed = textures(bytes), gltf = await loader.parseAsync(geometryGLB(bytes), '');
            gltf.scene.traverse(o => {
                if (!(o instanceof THREE.Mesh))
                    return;
                const convert = (old: THREE.Material) => {
                    const m = originalMaterial(old as THREE.MeshStandardMaterial), index = old.userData.auditTextureIndex;
                    if (index !== undefined)
                        m.map = parsed[index as number];
                    return m;
                };
                o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
            });
            if (path.startsWith('land/')) {
                const context = path.match(/-(\d+)\.glb$/)![1];
                for (const mesh of meshList(gltf.scene))
                    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                        const entry = foliage[context]?.[m.name];
                        if (!entry)
                            continue;
                        let texture = (m as THREE.MeshBasicMaterial).map;
                        if (entry.asset !== `foliage/${context}-${m.name}.png`) {
                            if (!textureCache.has(entry.asset)) {
                                const b = await readFile(new URL(entry.asset, source));
                                hashes[entry.asset] = digest(b);
                                const image = png(b), t = new THREE.DataTexture(image.data, image.width, image.height);
                                t.flipY = false;
                                textureCache.set(entry.asset, t);
                            }
                            texture = textureCache.get(entry.asset)!;
                        }
                        m.userData.treeInfo = { ...entry, texture };
                    }
            }
            const original = clone(gltf.scene) as THREE.Group;
            for (const mesh of meshList(original))
                mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone();
            nativeTemplates.set(path, original);
            repairOriginalAsset(gltf.scene, path.startsWith('props'));
            return gltf.scene;
        })());
    return templates.get(path)!;
}
function meshList(root: THREE.Object3D) {
    const out: THREE.Mesh[] = [];
    root.traverseVisible(o => {
        if (o instanceof THREE.Mesh)
            out.push(o);
    });
    return out;
}
function triangles(root: THREE.Object3D) {
    root.updateWorldMatrix(true, true);
    root.updateMatrixWorld(true);
    const out: Triangle[] = [];
    for (const o of meshList(root)) {
        if (o instanceof THREE.InstancedMesh)
            continue;
        const g = o.geometry, p = g.getAttribute('position'), uv = g.getAttribute('uv'), index = g.index, materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const group of g.groups.length ? g.groups : [{ start: 0, count: index?.count ?? p.count, materialIndex: 0 }]) {
            const start = Math.max(group.start, g.drawRange.start), end = Math.min(group.start + group.count, index?.count ?? p.count, g.drawRange.start + g.drawRange.count);
            if (end - start < 3)
                continue;
            const material = materials[Array.isArray(o.material) ? group.materialIndex ?? 0 : 0] as THREE.MeshBasicMaterial;
            if (!material)
                throw Error('Invalid actual material group ' + JSON.stringify({ mesh: o.name, groups: g.groups, materialCount: materials.length, group }));
            if (!material.visible || material.opacity < .5)
                continue;
            for (let i = start; i + 2 < end; i += 3) {
                const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j), points = ids.map(id => o.getVertexPosition(id, new THREE.Vector3()).applyMatrix4(o.matrixWorld));
                if (new THREE.Triangle(...points as [
                    THREE.Vector3,
                    THREE.Vector3,
                    THREE.Vector3
                ]).getArea() < 1e-9)
                    continue;
                out.push({ p: points, uv: ids.map(id => uv ? new THREE.Vector2(uv.getX(id), uv.getY(id)) : new THREE.Vector2()), material, name: material.name, mesh: o.name, coverageOnly: Boolean(o.userData.terrainSceneryCoverageOnly) || /^(?:solid-original-terrain|textured-terrain-back|source-shoreline)/.test(o.name) });
            }
        }
    }
    return out;
}
function opaqueAt(material: THREE.MeshBasicMaterial, uv?: THREE.Vector2) {
    if (!material.visible || material.opacity < .98)
        return false;
    if (!material.map || !uv || !material.alphaTest && !material.transparent)
        return true;
    const q = uv.clone();
    material.map.transformUv(q);
    const image = material.map.image as Pixels;
    if (!image?.data)
        throw Error(`Missing decoded alpha for ${material.name}`);
    const x = THREE.MathUtils.clamp(Math.floor(q.x * image.width), 0, image.width - 1), y = THREE.MathUtils.clamp(Math.floor(q.y * image.height), 0, image.height - 1), threshold = material.alphaTest || .98;
    return image.data[(y * image.width + x) * 4 + 3] / 255 * material.opacity >= threshold;
}
function rayHit(objects: THREE.Object3D[], origin: THREE.Vector3, direction: THREE.Vector3, far: number, alpha = true) { const hits = new THREE.Raycaster(origin, direction, .000001, far).intersectObjects(objects, false); return hits.find(h => { const o = h.object as THREE.Mesh, m = (Array.isArray(o.material) ? o.material[h.face?.materialIndex ?? 0] : o.material) as THREE.MeshBasicMaterial; return !alpha || opaqueAt(m, h.uv); }); }
// This broad phase changes no hit coordinates or triangle tests. Every bin
// touched by the finite ray segment is queried, with large faces retained.
const physicalIndexes = new WeakMap<Triangle[], {
    bins: Map<string, Triangle[]>;
    large: Triangle[];
}>();
function physicalCandidates(ts: Triangle[], origin: THREE.Vector3, direction: THREE.Vector3, far: number) {
    if (ts.length < 128)
        return ts;
    let index = physicalIndexes.get(ts);
    if (!index) {
        index = { bins: new Map(), large: [] };
        for (const t of ts) {
            const minX = Math.floor(Math.min(...t.p.map(p => p.x)) / 2), maxX = Math.floor(Math.max(...t.p.map(p => p.x)) / 2), minZ = Math.floor(Math.min(...t.p.map(p => p.z)) / 2), maxZ = Math.floor(Math.max(...t.p.map(p => p.z)) / 2);
            if ((maxX - minX + 1) * (maxZ - minZ + 1) > 4096) {
                index.large.push(t);
                continue;
            }
            for (let z = minZ; z <= maxZ; z++)
                for (let x = minX; x <= maxX; x++) {
                    const key = x + ',' + z, list = index.bins.get(key) ?? [];
                    list.push(t);
                    index.bins.set(key, list);
                }
        }
        physicalIndexes.set(ts, index);
    }
    const end = origin.clone().addScaledVector(direction, far), out = new Set(index.large);
    for (let z = Math.floor(Math.min(origin.z, end.z) / 2); z <= Math.floor(Math.max(origin.z, end.z) / 2); z++)
        for (let x = Math.floor(Math.min(origin.x, end.x) / 2); x <= Math.floor(Math.max(origin.x, end.x) / 2); x++)
            for (const t of index.bins.get(x + ',' + z) ?? [])
                out.add(t);
    return out;
}
/** Watertight shared-edge ray/triangle test. No epsilon or edge allowance. */
function watertightRayTriangle(origin: THREE.Vector3, direction: THREE.Vector3, p: THREE.Vector3[]) {
    const axis = (['x', 'y', 'z'] as const), kz = axis.reduce((a, b) => Math.abs(direction[a]) >= Math.abs(direction[b]) ? a : b);
    if (direction[kz] === 0)
        return null;
    let kx = axis[(axis.indexOf(kz) + 1) % 3], ky = axis[(axis.indexOf(kz) + 2) % 3];
    if (direction[kz] < 0)
        [kx, ky] = [ky, kx];
    const sx = direction[kx] / direction[kz], sy = direction[ky] / direction[kz], sz = 1 / direction[kz], v = p.map(q => q.clone().sub(origin)), x = v.map(q => q[kx] - sx * q[kz]), y = v.map(q => q[ky] - sy * q[kz]), z = v.map(q => q[kz] * sz), u = x[2] * y[1] - y[2] * x[1], vv = x[0] * y[2] - y[0] * x[2], w = x[1] * y[0] - y[1] * x[0];
    if ((u < 0 || vv < 0 || w < 0) && (u > 0 || vv > 0 || w > 0))
        return null;
    const determinant = u + vv + w;
    if (determinant === 0)
        return null;
    const distance = (u * z[0] + vv * z[1] + w * z[2]) / determinant;
    return distance > 0 ? { distance, bary: new THREE.Vector3(u / determinant, vv / determinant, w / determinant) } : null;
}
function physicalHit(ts: Triangle[], origin: THREE.Vector3, direction: THREE.Vector3, far: number, evidence?: Record<string, unknown>, renderSide = false) {
    let best = Infinity;
    for (const t of physicalCandidates(ts, origin, direction, far)) {
        if (renderSide) {
            const normal = new THREE.Triangle(...t.p as [
                THREE.Vector3,
                THREE.Vector3,
                THREE.Vector3
            ]).getNormal(new THREE.Vector3()), dot = normal.dot(direction);
            if (t.material.side === THREE.FrontSide && dot >= 0 || t.material.side === THREE.BackSide && dot <= 0)
                continue;
        }
        const hit = watertightRayTriangle(origin, direction, t.p);
        if (!hit || hit.distance > far || hit.distance >= best)
            continue;
        const b = hit.bary, uv = t.uv[0].clone().multiplyScalar(b.x).addScaledVector(t.uv[1], b.y).addScaledVector(t.uv[2], b.z);
        if (!opaqueAt(t.material, uv))
            continue;
        best = hit.distance;
        if (evidence)
            Object.assign(evidence, { distance: best, material: t.name, mesh: t.mesh, placement: t.placement, point: origin.clone().addScaledVector(direction, best).toArray(), vertices: t.p.map(p => p.toArray()), uv: uv.toArray(), watertight: true, renderSide });
    }
    return best;
}
function treeGround(t: Triangle) {
    return /(?:tree|bush).*_un(?:_|$)/i.test(t.name) && Math.abs(new THREE.Triangle(...t.p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).getNormal(new THREE.Vector3()).y) > .995;
}
function structural(t: Triangle) { return !deco.test(t.name) || treeGround(t); }
type AlphaRect = [
    number,
    number,
    number,
    number
];
const alphaRects = new WeakMap<THREE.Texture, Map<number, AlphaRect[]>>();
function rectangles(map: THREE.Texture, threshold: number) {
    let cache = alphaRects.get(map);
    if (!cache) {
        cache = new Map();
        alphaRects.set(map, cache);
    }
    if (cache.has(threshold))
        return cache.get(threshold)!;
    const image = map.image as Pixels, rects: number[][] = [], active = new Map<string, number[]>();
    for (let y = 0; y < image.height; y++) {
        const current = new Set<string>();
        for (let x = 0; x < image.width;) {
            if (image.data[(y * image.width + x) * 4 + 3] / 255 < threshold) {
                x++;
                continue;
            }
            const left = x;
            while (x < image.width && image.data[(y * image.width + x) * 4 + 3] / 255 >= threshold)
                x++;
            const key = left + ',' + x;
            current.add(key);
            const old = active.get(key);
            if (old)
                old[3] = y + 1;
            else
                active.set(key, [left, y, x, y + 1]);
        }
        for (const [key, rect] of active)
            if (!current.has(key)) {
                rects.push(rect);
                active.delete(key);
            }
    }
    rects.push(...active.values());
    const result = rects.map(r => [r[0] / image.width, r[1] / image.height, r[2] / image.width, r[3] / image.height] as AlphaRect);
    cache.set(threshold, result);
    return result;
}
function clipUV(vertices: {
    p: THREE.Vector3;
    uv: THREE.Vector2;
}[], axis: 'x' | 'y', at: number, sign: number) {
    const out: typeof vertices = [];
    for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length], da = (a.uv[axis] - at) * sign, db = (b.uv[axis] - at) * sign;
        if (da >= 0)
            out.push(a);
        if (da * db < 0) {
            const t = da / (da - db);
            out.push({ p: a.p.clone().lerp(b.p, t), uv: a.uv.clone().lerp(b.uv, t) });
        }
    }
    return out;
}
function degenerateUVFootprint(t: Triangle): {
    triangles: Triangle[];
    unsupported?: string;
} | null {
    const a = t.uv[0], d = t.uv[1].clone().sub(a), e = t.uv[2].clone().sub(a);
    if (d.cross(e) !== 0)
        return null;
    const axis: 'x' | 'y' = Math.max(...t.uv.map(v => v.x)) - Math.min(...t.uv.map(v => v.x)) >= Math.max(...t.uv.map(v => v.y)) - Math.min(...t.uv.map(v => v.y)) ? 'x' : 'y', range = Math.max(...t.uv.map(v => v[axis])) - Math.min(...t.uv.map(v => v[axis]));
    if (range === 0)
        return { triangles: opaqueAt(t.material, a) ? [t] : [] };
    const map = t.material.map!, image = map.image as Pixels, min = Math.min(...t.uv.map(v => v[axis])), max = Math.max(...t.uv.map(v => v[axis])), b = t.uv.find(v => v[axis] !== a[axis])!, delta = b.clone().sub(a), cuts = new Set<number>([min, max]);
    let work = 0;
    for (const component of ['x', 'y'] as const) {
        if (delta[component] === 0)
            continue;
        const size = component === 'x' ? image.width : image.height, low = Math.floor(Math.min(...t.uv.map(v => v[component])) * size), high = Math.ceil(Math.max(...t.uv.map(v => v[component])) * size);
        if ((work += high - low) > 100000)
            return { triangles: [], unsupported: 'Degenerate used UV extent exceeds exact texel interval budget' };
        for (let n = low; n <= high; n++) {
            const at = a[axis] + (n / size - a[component]) * delta[axis] / delta[component];
            if (at > min && at < max)
                cuts.add(at);
        }
    }
    const sorted = [...cuts].sort((a, b) => a - b), out: Triangle[] = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
        const mid = (sorted[i] + sorted[i + 1]) * .5, uv = a.clone().addScaledVector(delta, (mid - a[axis]) / delta[axis]);
        if (!opaqueAt(t.material, uv))
            continue;
        let polygon = t.p.map((p, j) => ({ p, uv: t.uv[j] }));
        polygon = clipUV(polygon, axis, sorted[i], 1);
        polygon = clipUV(polygon, axis, sorted[i + 1], -1);
        for (let j = 1; j + 1 < polygon.length; j++) {
            const v = [polygon[0], polygon[j], polygon[j + 1]], p = v.map(v => v.p);
            if (new THREE.Triangle(...p as [
                THREE.Vector3,
                THREE.Vector3,
                THREE.Vector3
            ]).getArea() > 1e-8)
                out.push({ ...t, p, uv: v.map(v => v.uv) });
        }
    }
    return { triangles: out };
}
function opaqueFootprint(t: Triangle): {
    triangles: Triangle[];
    unsupported?: string;
} {
    const m = t.material;
    if (m.opacity < .98)
        return { triangles: [], unsupported: 'translucent surface does not establish solid terrain' };
    if (!m.map || !m.alphaTest && !m.transparent)
        return { triangles: [t] };
    const threshold = (m.alphaTest || .98) / m.opacity, rects = rectangles(m.map, threshold);
    if (!rects.length)
        return { triangles: [] };
    const image = m.map.image as Pixels, all = rects.length === 1 && rects[0].join(',') === '0,0,1,1';
    if (all)
        return { triangles: [t] };
    const degenerate = degenerateUVFootprint(t);
    if (degenerate)
        return degenerate;
    if (m.map.flipY || m.map.wrapS !== THREE.RepeatWrapping || m.map.wrapT !== THREE.RepeatWrapping)
        return { triangles: [], unsupported: 'mixed-alpha nonrepeat/flipped footprint requires separate contour support' };
    const minU = Math.floor(Math.min(...t.uv.map(v => v.x))), maxU = Math.ceil(Math.max(...t.uv.map(v => v.x))), minV = Math.floor(Math.min(...t.uv.map(v => v.y))), maxV = Math.ceil(Math.max(...t.uv.map(v => v.y)));
    if ((maxU - minU) * (maxV - minV) * rects.length > 100000)
        return { triangles: [], unsupported: 'mixed-alpha used UV region exceeds bounded exact rectangle budget' };
    const out: Triangle[] = [];
    for (let u = minU; u < maxU; u++)
        for (let v = minV; v < maxV; v++)
            for (const r of rects) {
                let polygon = t.p.map((p, i) => ({ p, uv: t.uv[i] }));
                for (const [axis, at, sign] of [['x', r[0] + u, 1], ['x', r[2] + u, -1], ['y', r[1] + v, 1], ['y', r[3] + v, -1]] as const)
                    polygon = clipUV(polygon, axis, at, sign);
                for (let i = 1; i < polygon.length - 1; i++) {
                    const vertices = [polygon[0], polygon[i], polygon[i + 1]], p = vertices.map(v => v.p);
                    if (new THREE.Triangle(...p as [
                        THREE.Vector3,
                        THREE.Vector3,
                        THREE.Vector3
                    ]).getArea() > 1e-8)
                        out.push({ ...t, p, uv: vertices.map(v => v.uv) });
                }
            }
    return { triangles: out };
}
type Boundary = {
    a: THREE.Vector3;
    b: THREE.Vector3;
    triangle: Triangle;
    component: number;
    outward: THREE.Vector3;
};
function boundaries(ts: Triangle[]) {
    const parent = ts.map((_, i) => i), find = (i: number): number => parent[i] === i ? i : parent[i] = find(parent[i]), lines = new Map<string, {
        a: THREE.Vector3;
        b: THREE.Vector3;
        lo: number;
        hi: number;
        sign: number;
        t: number;
    }[]>();
    ts.forEach((t, i) => {
        const p = t.p.slice();
        if (new THREE.Triangle(...p as [
            THREE.Vector3,
            THREE.Vector3,
            THREE.Vector3
        ]).getNormal(new THREE.Vector3()).y < 0)
            p.reverse();
        for (let j = 0; j < 3; j++) {
            const a = p[j], b = p[(j + 1) % 3], d = b.clone().sub(a);
            if (Math.hypot(d.x, d.z) < 1e-6)
                continue;
            d.normalize();
            const k = Math.abs(d.x) > Math.abs(d.z) ? 'x' : 'z', sign = d[k] < 0 ? -1 : 1;
            if (sign < 0)
                d.negate();
            const key = [...d.toArray(), ...a.clone().cross(d).toArray()].map(n => Math.round(n * 1e5)).join(','), list = lines.get(key) || [], lo = Math.min(a.dot(d), b.dot(d)), hi = Math.max(a.dot(d), b.dot(d));
            for (const edge of list)
                if (Math.min(hi, edge.hi) - Math.max(lo, edge.lo) > 1e-6)
                    parent[find(i)] = find(edge.t);
            list.push({ a, b, lo, hi, sign, t: i });
            lines.set(key, list);
        }
    });
    const out: Boundary[] = [];
    for (const list of lines.values()) {
        const ends = [...new Set(list.flatMap(e => [e.lo, e.hi]))].sort((a, b) => a - b);
        for (let i = 0; i < ends.length - 1; i++) {
            const lo = ends[i], hi = ends[i + 1];
            if (hi - lo < 1e-6)
                continue;
            const cover = list.filter(e => e.lo <= (lo + hi) / 2 && e.hi >= (lo + hi) / 2);
            if (!cover.length || cover.some(e => e.sign !== cover[0].sign))
                continue;
            const edge = cover[0], d = edge.b.clone().sub(edge.a).normalize().multiplyScalar(edge.sign), a = edge.a.clone().addScaledVector(d, lo - edge.a.dot(d)), b = edge.a.clone().addScaledVector(d, hi - edge.a.dot(d)), mid = a.clone().add(b).multiplyScalar(.5), centre = ts[edge.t].p.reduce((p, q) => p.add(q), new THREE.Vector3()).multiplyScalar(1 / 3), outward = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
            if (outward.dot(centre.sub(mid)) > 0)
                outward.negate();
            out.push({ a, b, triangle: ts[edge.t], component: find(edge.t), outward });
        }
    }
    return out;
}
const contextList: Context[] = [], bySpace = new Map<string, Map<string, Context>>(), space = (c: Context) => c.matrix + ':' + (matrices.get(c.matrix)!.headers === null ? c.map : 'shared');
function nearby(c: Context, x: number, z: number) { return bySpace.get(space(c))?.get(Math.floor(x / 32) + ',' + Math.floor(z / 32)); }
function heights(c: Context, x: number, z: number) { const cell = c.cell, land = lands.get(cell.land)!; return land.plates.filter(p => x >= cell.x * 32 + 16 + Math.min(p.bounds[0], p.bounds[2]) - .001 && x <= cell.x * 32 + 16 + Math.max(p.bounds[0], p.bounds[2]) + .001 && z >= cell.z * 32 + 16 + Math.min(p.bounds[1], p.bounds[3]) - .001 && z <= cell.z * 32 + 16 + Math.max(p.bounds[1], p.bounds[3]) + .001 && Math.abs(p.normal[1]) > 1e-8).map(p => -(p.constant + p.normal[0] * (x - cell.x * 32 - 16) + p.normal[2] * (z - cell.z * 32 - 16)) / p.normal[1] + cell.altitude * .5 + (c.matrix === 0 ? terraces?.height(x, z) ?? 0 : 0)); }
function floorAt(c: Context, x: number, z: number, below = Infinity) {
    const n = nearby(c, x, z);
    if (!n)
        return null;
    const hs = heights(n, x, z), eligible = hs.filter(y => y < below - .15), reference = n.cell.altitude * .5 + (n.matrix === 0 ? terraces?.height(x, z) ?? 0 : 0);
    return hs.length ? { height: below < Infinity ? (eligible.length ? Math.max(...eligible) : Math.min(...hs)) : hs.reduce((a, b) => Math.abs(a - reference) < Math.abs(b - reference) ? a : b), context: n, heights: hs, permission: tilePermission(lands.get(n.cell.land)!, x, z) } : null;
}
let entrances: Record<number, {
    x: number;
    z: number;
    axis?: 0 | 2;
    sign?: number;
}[]> = {};
let candidateBuilder: ((...args: any[]) => any) | null = null;
const prepared = new Map<string, Promise<{
    group: THREE.Group;
    candidate?: THREE.Group;
    land: Land;
    top: Triangle[];
    sourcePhysical: Triangle[];
    rawPhysical: Triangle[];
    candidatePhysical?: Triangle[];
    addedPhysical: Triangle[];
    physical: Triangle[];
    unsupported: string[];
    inventory: any;
}>>();
const terraceFallback = new THREE.MeshBasicMaterial({ color: '#a77d5a' });
// A real streamed camera window contains up to 25 cells. Keeping fewer would
// evict the previous window as every sector rebuilt it; geometry-only scans
// retain the smaller bound because they never need that simultaneous window.
const preparedLimit = 'no-camera' in args || 'inventory-only' in args ? 24 : 32;
async function terraceDonor(c: Context, template: THREE.Group) {
    let material = terraceCliffMaterial(template);
    if (!material && terraces) {
        const context = c.cell.asset.match(/-(\d+)\.glb$/)![1], path = terraces.data.cliffAssets[context] || terraces.data.cliffAssets['0'];
        if (path)
            try {
                material = terraceCliffMaterial(await asset(path));
            }
            catch { /* Runtime also retains opaque fallback. */ }
    }
    return material ?? terraceFallback;
}
async function preparedCell(c: Context) {
    if (prepared.has(c.key)) {
        const cached = prepared.get(c.key)!;
        prepared.delete(c.key);
        prepared.set(c.key, cached);
        return cached;
    }
    while (prepared.size >= preparedLimit) {
        const key = prepared.keys().next().value!;
        prepared.delete(key);
        propsAdded.delete(key);
    }
    const task = (async () => {
        const template = await asset(c.cell.asset), model = clone(template), group = new THREE.Group(), land = lands.get(c.cell.land)!;
        group.position.set(c.cell.x * 32 + 16, c.cell.altitude * .5, c.cell.z * 32 + 16);
        model.scale.setScalar(1 / 16);
        group.add(model);
        const rawGroup = new THREE.Group(), raw = clone(nativeTemplates.get(c.cell.asset)!);
        rawGroup.position.copy(group.position);
        raw.scale.setScalar(1 / 16);
        rawGroup.add(raw);
        const rawPhysical = triangles(rawGroup).filter(structural);
        let beach: THREE.MeshBasicMaterial | undefined;
        for (const mesh of meshList(template))
            for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
                if (m.name === 'beach01')
                    beach = m as THREE.MeshBasicMaterial;
        if (beach) {
            const underlay = shorelineUnderlay(land, c.cell, beach);
            if (underlay) {
                underlay.userData.terrainSceneryCoverageOnly = true;
                group.add(underlay);
            }
        }
        if (c.matrix === 0 && terraces && [-1, 0, 1].some(dx => [-1, 0, 1].some(dz => terraces!.data.cells[(c.cell.x + dx) + ',' + (c.cell.z + dz)]))) {
            await terraceModel(group, terraces);
            await terraceModel(rawGroup, terraces);
            if (terraces.ledgeCells.has(c.cell.x + ',' + c.cell.z)) {
                const walls = terraceWalls(terraces, c.cell, land, await terraceDonor(c, template));
                if (walls)
                    group.add(walls);
            }
        }
        const sourcePhysical = triangles(rawGroup).filter(structural), expectedPhysical = triangles(group).filter(t => structural(t) && !t.coverageOnly);
        let candidate: THREE.Group | undefined, candidateSummary: any;
        if (candidateBuilder) {
            candidate = clone(group) as THREE.Group;
            const matrix = matrices.get(c.matrix)!, neighbors = new Map<string, {
                cell: Cell;
                land: Land;
            }>();
            for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const x = c.cell.x + dx, z = c.cell.z + dz;
                if (x < 0 || z < 0 || x >= matrix.width || z >= matrix.height)
                    continue;
                const i = z * matrix.width + x, id = matrix.models[i];
                if (id === 65535)
                    continue;
                if (!lands.has(id))
                    lands.set(id, await readJSON(`lands/${id}.json`));
                neighbors.set(x + ',' + z, { cell: { x, z, land: id, altitude: matrix.altitudes[i], props: [], asset: '' }, land: lands.get(id)! });
            }
            candidateSummary = candidateBuilder(candidate, { cell: c.cell, matrix, land, mapType: c.mapType, neighbors, heightOffset: c.matrix === 0 && terraces ? (x: number, z: number) => terraces!.height(x, z) : undefined, entrances: terrainSceneryEntrances(maps.get(c.map)!.events.warps, entrances[c.matrix] ?? []) }, terraceCliffMaterial(template) ?? terraceCliffMaterial(await asset('land/210-0.glb')));
        }
        // Snapshot all physical arrays before any camera search can append props.
        const candidatePhysical = candidate ? triangles(candidate).filter(structural) : undefined, addedPhysical = candidatePhysical?.filter(t => t.mesh?.startsWith('terrain-scenery-')) ?? [];
        if (c.map === 0 && c.cell.land === 208 && c.cell.altitude > 0) {
            const material = terraceCliffMaterial(await asset('land/210-0.glb'));
            if (material) {
                const foundation = forestFoundation(c.cell, matrices.get(c.matrix)!, material);
                if (foundation)
                    group.add(foundation);
            }
        }
        const physical = triangles(group).filter(structural), top: Triangle[] = [], unsupported: string[] = [];
        let sourceTop = 0, unknownTop = 0, mixedAlpha = 0;
        const unknownUpwardMaterials: Record<string, number> = {};
        for (const t of expectedPhysical) {
            const normal = new THREE.Triangle(...t.p as [
                THREE.Vector3,
                THREE.Vector3,
                THREE.Vector3
            ]).getNormal(new THREE.Vector3());
            if (normal.y < .65 || water.test(t.name))
                continue;
            if (bridge.test(t.name)) {
                unsupported.push('authored bridge/deck material ' + t.name);
                continue;
            }
            if (!terrain.test(t.name) && !treeGround(t)) {
                unknownTop++;
                unknownUpwardMaterials[t.name] = (unknownUpwardMaterials[t.name] ?? 0) + 1;
                continue;
            }
            sourceTop++;
            const result = opaqueFootprint(t);
            if (result.unsupported)
                unsupported.push(t.name + ': ' + result.unsupported);
            if (result.triangles.length !== 1 || result.triangles[0] !== t)
                mixedAlpha++;
            top.push(...result.triangles);
        }
        return { group, candidate, land, top, rawPhysical, sourcePhysical, physical, candidatePhysical, addedPhysical, unsupported, inventory: { key: c.key, matrix: c.matrix, map: c.map, mapName: c.mapName, mapType: c.mapType, cell: [c.cell.x, c.cell.z], land: c.cell.land, asset: c.cell.asset, altitude: c.cell.altitude, worldAltitude: c.cell.altitude * .5, sourceSHA256: hashes[c.cell.asset], materials: [...new Set(physical.map(t => t.name))], visibleTerrainTriangles: physical.length, sourceUpwardTriangles: sourceTop, alphaFootprintTriangles: top.length, mixedAlphaSourceTriangles: mixedAlpha, unknownUpwardTriangles: unknownTop, unknownUpwardMaterials, unsupported: [...new Set(unsupported)], candidateSummary } };
    })();
    prepared.set(c.key, task);
    return task;
}
type Reachable = {
    poses: {
        x: number;
        z: number;
        y: number;
        map: number;
        water: boolean;
    }[];
    seeds: number;
    walkable: number;
    reachable: number;
    unanchored: number;
};
const reachable = new Map<string, Reachable>();
function buildReachability(spawns: any) {
    for (const [key, contexts] of bySpace) {
        const list = [...contexts.values()], w = (Math.max(...list.map(c => c.cell.x)) + 1) * 32, h = (Math.max(...list.map(c => c.cell.z)) + 1) * 32, passable = new Uint8Array(w * h), seen = new Uint8Array(w * h), owners = new Int32Array(w * h);
        owners.fill(-1);
        let walkable = 0;
        for (const c of list) {
            if (c.map === 0)
                continue;
            const land = lands.get(c.cell.land)!;
            for (let z = 0; z < 32; z++)
                for (let x = 0; x < 32; x++) {
                    const at = (c.cell.z * 32 + z) * w + c.cell.x * 32 + x;
                    if (permissionWalkable(land.permissions[z * 32 + x] ?? 0x8000, true)) {
                        passable[at] = 1;
                        owners[at] = c.map;
                        walkable++;
                    }
                }
        }
        const queue: number[] = [];
        const seed = (x: number, z: number) => {
            x = Math.floor(x);
            z = Math.floor(z);
            for (let radius = 0; radius <= 2; radius++)
                for (let dz = -radius; dz <= radius; dz++)
                    for (let dx = -radius; dx <= radius; dx++) {
                        const xx = x + dx, zz = z + dz, at = zz * w + xx;
                        if (xx >= 0 && zz >= 0 && xx < w && zz < h && passable[at] && !seen[at]) {
                            seen[at] = 1;
                            queue.push(at);
                            return;
                        }
                    }
        };
        for (const map of new Set(list.map(c => c.map)))
            for (const warp of maps.get(map)?.events.warps ?? [])
                seed(warp.x, warp.z);
        for (const value of Object.values(spawns) as any[])
            for (const kind of ['landing', 'special', 'death']) {
                const p = value[kind];
                if (p && list.some(c => c.map === p.map))
                    seed(p.x, p.z);
            }
        const seeds = queue.length;
        for (let i = 0; i < queue.length; i++) {
            const at = queue[i], x = at % w, z = Math.floor(at / w);
            for (const n of [x > 0 ? at - 1 : -1, x + 1 < w ? at + 1 : -1, z > 0 ? at - w : -1, z + 1 < h ? at + w : -1])
                if (n >= 0 && passable[n] && !seen[n]) {
                    seen[n] = 1;
                    queue.push(n);
                }
        }
        const poses: Reachable['poses'] = [];
        const stride = Number(args['camera-stride'] || 4);
        for (const at of queue) {
            const x = at % w, z = Math.floor(at / w);
            if (x % stride || z % stride)
                continue;
            const c = contexts.get(Math.floor(x / 32) + ',' + Math.floor(z / 32));
            if (!c)
                continue;
            const f = floorAt(c, x + .5, z + .5);
            if (!f || Math.max(...f.heights) - Math.min(...f.heights) > .1)
                continue;
            poses.push({ x: x + .5, z: z + .5, y: f.height, map: owners[at], water: [16, 17, 19, 21].includes(f.permission & 255) });
        }
        reachable.set(key, { poses, seeds, walkable, reachable: queue.length, unanchored: walkable - queue.length });
    }
}
const propsAdded = new Set<string>();
async function renderGroup(c: Context, stage: 'baseline' | 'candidate') {
    const p = await preparedCell(c);
    if (!propsAdded.has(c.key)) {
        for (const [propIndex, prop] of c.cell.props.entries()) {
            const foundation = c.matrix === 0 ? terraces?.data.foundations?.[c.cell.x + ',' + c.cell.z + ':' + propIndex] : undefined, node = clone(await asset(prop.asset));
            node.scale.set(prop.scale[0] / 16, prop.scale[1] / 16, prop.scale[2] / 16);
            node.rotation.set(prop.rotation[0] * Math.PI / 180, prop.rotation[1] * Math.PI / 180, prop.rotation[2] * Math.PI / 180);
            node.position.fromArray(prop.position);
            let offset = 0;
            if (c.matrix === 0 && terraces) {
                const anchor = foundation ?? [c.cell.x * 32 + 16 + prop.position[0], c.cell.z * 32 + 16 + prop.position[2]];
                offset = terraces.height(anchor[0], anchor[1]);
                node.position.y += offset;
            }
            p.group.add(node);
            closeBuildingExterior(node, prop.asset, entrances[c.matrix] ?? []);
            if (c.matrix === 0 && terraces && foundation)
                closeBuildingFooting(node, terraces, offset);
            if (p.candidate)
                p.candidate.add(clone(node));
        }
        propsAdded.add(c.key);
        p.group.updateWorldMatrix(true, true);
        p.group.updateMatrixWorld(true);
        if (p.candidate) {
            p.candidate.updateWorldMatrix(true, true);
            p.candidate.updateMatrixWorld(true);
        }
    }
    return stage === 'candidate' && p.candidate ? p.candidate : p.group;
}
async function witness(c: Context, probe: Probe, stage: 'baseline' | 'candidate') {
    const point = new THREE.Vector3().fromArray(probe.point), available = reachable.get(space(c));
    if (!available?.poses.length)
        return { status: 'unsupported', reason: 'no native warp/Fly-seeded permission component with sampled floor height' };
    const nearest = new Map<number, Reachable['poses'][0]>();
    for (const p of available.poses) {
        if (args['player-maps'] && !args['player-maps'].split(',').includes(String(p.map)) || 'dry-camera' in args && p.water)
            continue;
        if (Math.abs(Math.floor(p.x / 32) - c.cell.x) > 2 || Math.abs(Math.floor(p.z / 32) - c.cell.z) > 2)
            continue;
        const distance = Math.hypot(p.x - point.x, p.z - point.z);
        if (distance < .5 || distance > 112)
            continue;
        const sector = Math.floor((Math.atan2(p.x - point.x, p.z - point.z) + Math.PI) * 4 / Math.PI) % 8, old = nearest.get(sector);
        if (!old || distance < Math.hypot(old.x - point.x, old.z - point.z))
            nearest.set(sector, p);
    }
    let poses = 0, screened = 0, occluded = 0, wrongSide = 0, recesses = 0;
    for (const p of nearest.values()) {
        const groups: THREE.Group[] = [];
        for (const n of bySpace.get(space(c))!.values())
            if (Math.abs(n.cell.x - Math.floor(p.x / 32)) <= 2 && Math.abs(n.cell.z - Math.floor(p.z / 32)) <= 2)
                groups.push(await renderGroup(n, stage));
        const furniture = groups.flatMap(furnitureObstacles);
        if (furnitureBlocksStep(furniture, p.x, p.z, p.x, p.z, p.y, p.y))
            continue;
        const obstacles = groups.flatMap(g => fieldCameraObstacles(g)), visible = groups.flatMap(meshList), target = new THREE.Vector3(p.x, p.y + .9, p.z), baseYaw = Math.atan2(p.x - point.x, p.z - point.z);
        for (const offset of [0, -Math.PI / 4, Math.PI / 4, -Math.PI / 2, Math.PI / 2, Math.PI])
            for (const pitch of [.4, .18, .65, .95])
                for (const distance of [13, 5, 28]) {
                    poses++;
                    const yaw = baseYaw + offset, orbit = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)), collisions = new THREE.Raycaster(target, orbit, .5, distance).intersectObjects(obstacles, false), first = collisions.find(h => h.distance > 1.2), actual = first ? Math.max(2.2, first.distance - .6) : distance, eye = target.clone().addScaledVector(orbit, actual), camera = new THREE.PerspectiveCamera(52, Number(args.aspect || 1.5), .05, 140);
                    if (eye.clone().sub(point).dot(new THREE.Vector3().fromArray(probe.normal)) <= .02) {
                        wrongSide++;
                        continue;
                    }
                    camera.position.copy(eye);
                    camera.lookAt(target);
                    camera.updateMatrixWorld(true);
                    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
                    if (!frustum.containsPoint(point)) {
                        screened++;
                        continue;
                    }
                    const direction = point.clone().sub(eye), far = direction.length();
                    if (far < .1)
                        continue;
                    direction.normalize();
                    const hit = rayHit(visible, eye, direction, Math.max(.00001, far - .02));
                    if (hit) {
                        occluded++;
                        continue;
                    }
                    const continuation = point.clone().addScaledVector(direction, .02), interiorHit = rayHit(visible, continuation, direction, Number(args['hole-depth'] || 1));
                    if (interiorHit) {
                        recesses++;
                        continue;
                    }
                    return { status: 'visible-hole', interiorContinuationTiles: Number(args['hole-depth'] || 1), player: { map: p.map, position: [p.x, p.y, p.z], nativeReachability: 'Warp/Fly-seeded permission component with Surf permitted; geometric over-approximation, sampled standing furniture checked', water: p.water }, eye: xyz(eye), target: xyz(target), yaw, pitch, intendedDistance: distance, collisionShortenedDistance: actual, fov: 52, aspect: camera.aspect, point: probe.point, testedPoses: poses, frustumRejected: screened, opaqueOccluded: occluded, wrongSideRejected: wrongSide, visibleRecesses: recesses, staticOcclusion: 'actual land, native props, repaired closed tree meshes; actors/animated tall grass excluded' };
                }
    }
    return { status: 'no-witness-in-finite-samples', testedPoses: poses, frustumRejected: screened, opaqueOccluded: occluded, wrongSideRejected: wrongSide, visibleRecesses: recesses, anchorSectors: nearest.size };
}
type TopLoop = {
    points: THREE.Vector3[];
    height: number;
    area: number;
    sourceMaterial: string;
    sourceMesh?: string;
};
function polygonAreaXZ(points: THREE.Vector3[]) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        area += a.x * b.z - b.x * a.z;
    }
    return area * .5;
}
function insidePolygonXZ(x: number, z: number, points: THREE.Vector3[]) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x)
            inside = !inside;
    }
    return inside;
}
function strictOpaqueFace(t: Triangle) {
    const footprint = opaqueFootprint(t);
    if (footprint.unsupported)
        return false;
    const area = new THREE.Triangle(...t.p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).getArea(), covered = footprint.triangles.reduce((n, f) => n + new THREE.Triangle(...f.p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).getArea(), 0);
    return area > 1e-10 && Math.abs(area - covered) <= Math.max(1e-10, area * 1e-12);
}
/** Literal boundary of opaque native surfaces. Quantization only joins
 * authored endpoint topology; physical coverage still uses exact vertices. */
function literalWallTopLoops(native: Triangle[]) {
    const walls = native.filter(t => structural(t) && geology.test(t.name) && !water.test(t.name) && !bridge.test(t.name) && Math.abs(new THREE.Triangle(...t.p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).getNormal(new THREE.Vector3()).y) < .995), faces = walls.filter(strictOpaqueFace), unknownWallFaces = walls.length - faces.length;
    type Edge = {
        a: THREE.Vector3;
        b: THREE.Vector3;
        d: THREE.Vector3;
        lo: number;
        hi: number;
        sign: number;
        t: Triangle;
    };
    const lines = new Map<string, Edge[]>();
    for (const t of faces)
        for (let i = 0; i < 3; i++) {
            const a = t.p[i], b = t.p[(i + 1) % 3], d = b.clone().sub(a);
            if (d.lengthSq() < 1e-14)
                continue;
            d.normalize();
            const axis = (['x', 'y', 'z'] as const).reduce((a, b) => Math.abs(d[a]) >= Math.abs(d[b]) ? a : b), sign = d[axis] < 0 ? -1 : 1;
            if (sign < 0)
                d.negate();
            const key = [...d.toArray(), ...a.clone().cross(d).toArray()].map(v => Math.round(v * 1e5)).join(','), list = lines.get(key) ?? [];
            list.push({ a, b, d, lo: Math.min(a.dot(d), b.dot(d)), hi: Math.max(a.dot(d), b.dot(d)), sign, t });
            lines.set(key, list);
        }
    const edges: {
        a: THREE.Vector3;
        b: THREE.Vector3;
        t: Triangle;
    }[] = [];
    for (const line of lines.values()) {
        const endpoints = [...new Set(line.flatMap(e => [e.lo, e.hi]))].sort((a, b) => a - b);
        for (let i = 0; i + 1 < endpoints.length; i++) {
            const lo = endpoints[i], hi = endpoints[i + 1];
            if (hi - lo < 1e-7)
                continue;
            const overlap = line.filter(e => e.lo <= (lo + hi) * .5 && e.hi >= (lo + hi) * .5);
            if (!overlap.length || overlap.some(e => e.sign !== overlap[0].sign))
                continue;
            const e = overlap[0], a = e.a.clone().addScaledVector(e.d, lo - e.a.dot(e.d)), b = e.a.clone().addScaledVector(e.d, hi - e.a.dot(e.d));
            if (Math.abs(a.y - b.y) > 1e-6 || Math.hypot(a.x - b.x, a.z - b.z) < 1e-7 || !geology.test(e.t.name) || Math.abs(new THREE.Triangle(...e.t.p as [
                THREE.Vector3,
                THREE.Vector3,
                THREE.Vector3
            ]).getNormal(new THREE.Vector3()).y) > .995)
                continue;
            edges.push({ a, b, t: e.t });
        }
    }
    const key = (p: THREE.Vector3) => p.toArray().map(v => Math.round(v * 1e5)).join(','), links = new Map<string, typeof edges>();
    for (const edge of edges)
        for (const p of [edge.a, edge.b]) {
            const list = links.get(key(p)) ?? [];
            list.push(edge);
            links.set(key(p), list);
        }
    const visited = new Set<typeof edges[number]>(), loops: TopLoop[] = [], unsupported: {
        reason: string;
        point: number[];
    }[] = [];
    const minimum = faces.length ? Math.min(...faces.flatMap(t => t.p.map(p => p.y))) : Infinity;
    for (const first of edges) {
        if (visited.has(first))
            continue;
        let current = first, point = first.a, closed = false;
        const points: THREE.Vector3[] = [];
        for (let limit = 0; limit <= edges.length; limit++) {
            if (visited.has(current)) {
                closed = key(point) === key(first.a);
                break;
            }
            visited.add(current);
            points.push(point);
            point = key(point) === key(current.a) ? current.b : current.a;
            const next = links.get(key(point)) ?? [];
            if (next.length !== 2)
                break;
            current = next.find(e => e !== current)!;
        }
        if (!closed) {
            unsupported.push({ reason: 'Native geological upper-wall boundary does not form a literal closed loop', point: xyz(first.a) });
            continue;
        }
        if (points.length < 3)
            continue;
        const height = points[0].y;
        if (height <= minimum + .15 || points.some(p => Math.abs(p.y - height) > 1e-6))
            continue;
        const area = Math.abs(polygonAreaXZ(points));
        if (area < .02)
            continue;
        const clean = points.filter((p, i) => { const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length]; return Math.abs((p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x)) > 1e-9; });
        if (clean.length < 3)
            continue;
        loops.push({ points: clean, height, area, sourceMaterial: first.t.name, sourceMesh: first.t.mesh });
    }
    return { loops, unsupported, sourceOpaqueFaces: faces.length, unknownWallFaces };
}
function clipXZ(poly: THREE.Vector2[], axis: 'x' | 'y', at: number, sign: number) {
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length], da = (a[axis] - at) * sign, db = (b[axis] - at) * sign;
        if (da >= 0)
            out.push(a);
        if (da * db < 0)
            out.push(a.clone().lerp(b, da / (da - db)));
    }
    return out;
}
function areaXZ2(poly: THREE.Vector2[]) {
    let area = 0;
    for (let i = 0; i < poly.length; i++)
        area += poly[i].cross(poly[(i + 1) % poly.length]);
    return Math.abs(area) * .5;
}
function clipPlate(poly: THREE.Vector2[], rect: number[]) {
    for (const [axis, at, sign] of [['x', rect[0], 1], ['x', rect[2], -1], ['y', rect[1], 1], ['y', rect[3], -1]] as const)
        poly = clipXZ(poly, axis, at, sign);
    return poly;
}
function subtractPlate(poly: THREE.Vector2[], rect: number[]) {
    const pieces: THREE.Vector2[][] = [];
    for (const [axis, at, sign] of [['x', rect[0], 1], ['x', rect[2], -1], ['y', rect[1], 1], ['y', rect[3], -1]] as const) {
        const outside = clipXZ(poly, axis, at, -sign);
        if (areaXZ2(outside) > 1e-12)
            pieces.push(outside);
        poly = clipXZ(poly, axis, at, sign);
        if (poly.length < 3)
            break;
    }
    return pieces;
}
function polygonSelfCrosses(poly: THREE.Vector3[]) {
    const orient = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    for (let i = 0; i < poly.length; i++)
        for (let j = i + 2; j < poly.length; j++) {
            if (i === 0 && j === poly.length - 1)
                continue;
            const a = poly[i], b = poly[(i + 1) % poly.length], c = poly[j], d = poly[(j + 1) % poly.length], ab1 = orient(a, b, c), ab2 = orient(a, b, d), cd1 = orient(c, d, a), cd2 = orient(c, d, b);
            if (ab1 * ab2 < 0 && cd1 * cd2 < 0)
                return true;
            if (Math.abs(ab1) + Math.abs(ab2) < 1e-12 && Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) >= Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) && Math.min(Math.max(a.z, b.z), Math.max(c.z, d.z)) >= Math.max(Math.min(a.z, b.z), Math.min(c.z, d.z)))
                return true;
        }
    return false;
}
function provenTopDomains(c: Context, native: Triangle[]) {
    const inferred = literalWallTopLoops(native), unsupported = inferred.unsupported.map(v => ({ ...v, kind: 'native-upper-rim' })), land = lands.get(c.cell.land)!, ox = c.cell.x * 32 + 16, oz = c.cell.z * 32 + 16, oy = c.cell.altitude * .5;
    const loops = inferred.loops.filter(loop => {
        if (polygonSelfCrosses(loop.points)) {
            unsupported.push({ reason: 'Self-intersecting native upper-wall loop', point: xyz(loop.points[0]), kind: 'native-upper-rim' });
            return false;
        }
        return true;
    });
    const parents = loops.map((loop, i) => { const possible = loops.map((outer, j) => ({ outer, j })).filter(v => v.j !== i && Math.abs(v.outer.height - loop.height) < 1e-6 && v.outer.area > loop.area + 1e-9 && insidePolygonXZ(loop.points[0].x, loop.points[0].z, v.outer.points)).sort((a, b) => a.outer.area - b.outer.area); return possible[0]?.j ?? -1; }), depth = (i: number): number => parents[i] < 0 ? 0 : 1 + depth(parents[i]);
    const domains: {
        triangles: THREE.Vector3[][];
        loop: TopLoop;
        holes: TopLoop[];
        matchingPlateIndices: number[];
    }[] = [];
    const plateRect = (p: Land['plates'][number]) => [ox + Math.min(p.bounds[0], p.bounds[2]), oz + Math.min(p.bounds[1], p.bounds[3]), ox + Math.max(p.bounds[0], p.bounds[2]), oz + Math.max(p.bounds[1], p.bounds[3])];
    const nativeHeight = (p: Land['plates'][number], x: number, z: number) => -(p.constant + p.normal[0] * (x - ox) + p.normal[2] * (z - oz)) / p.normal[1] + oy;
    for (let i = 0; i < loops.length; i++) {
        if (depth(i) % 2)
            continue;
        const loop = loops[i], holes = loops.filter((_, j) => parents[j] === i), vertices = [...loop.points, ...holes.flatMap(h => h.points)], triangles = THREE.ShapeUtils.triangulateShape(loop.points.map(p => new THREE.Vector2(p.x, p.z)), holes.map(h => h.points.map(p => new THREE.Vector2(p.x, p.z)))).map(ids => ids.map(index => vertices[index]));
        if (!triangles.length) {
            unsupported.push({ reason: 'Native closed upper-wall loop could not be triangulated', point: xyz(loop.points[0]), kind: 'native-upper-rim' });
            continue;
        }
        if (/CAVE|UNDERGROUND/.test(c.mapType)) {
            unsupported.push({ reason: 'Closed native upper-wall loop is in cave/underground context; authored roof/opening review required', point: xyz(loop.points[0]), kind: 'native-upper-rim' });
            continue;
        }
        const matching = land.plates.map((p, index) => ({ p, index })).filter(({ p }) => Math.abs(p.normal[1]) > 1e-8 && vertices.every(v => Math.abs(nativeHeight(p, v.x, v.z) - loop.height) < 1e-5));
        let uncoveredArea = 0;
        for (const t of triangles) {
            let remaining = [t.map(v => new THREE.Vector2(v.x, v.z))];
            for (const { p } of matching)
                remaining = remaining.flatMap(poly => subtractPlate(poly, plateRect(p)));
            uncoveredArea += remaining.reduce((n, p) => n + areaXZ2(p), 0);
        }
        if (uncoveredArea > 1e-9) {
            unsupported.push({ reason: 'Literal wall-top loop lacks matching native movement-plate coverage; no inferred roof', point: xyz(loop.points[0]), kind: 'native-upper-rim' });
            continue;
        }
        const hasEntrance = [...(maps.get(c.map)?.events.warps ?? []).map(w => ({ x: w.x + .5, z: w.z + .5 })), ...entrances[c.matrix] ?? []].some(e => triangles.some(t => areaXZ2(clipPlate(t.map(p => new THREE.Vector2(p.x, p.z)), [e.x - .5, e.z - .5, e.x + .5, e.z + .5])) > 1e-10));
        let lowerAccessible = false;
        for (const p of land.plates) {
            if (Math.abs(p.normal[1]) < 1e-8)
                continue;
            const rect = plateRect(p);
            for (const triangle of triangles) {
                const intersection = clipPlate(triangle.map(v => new THREE.Vector2(v.x, v.z)), rect);
                if (areaXZ2(intersection) < 1e-10 || !intersection.some(v => nativeHeight(p, v.x, v.y) < loop.height - .35))
                    continue;
                const minX = Math.floor(Math.min(...intersection.map(v => v.x))), maxX = Math.ceil(Math.max(...intersection.map(v => v.x))), minZ = Math.floor(Math.min(...intersection.map(v => v.y))), maxZ = Math.ceil(Math.max(...intersection.map(v => v.y)));
                for (let z = minZ; z < maxZ && !lowerAccessible; z++)
                    for (let x = minX; x < maxX; x++)
                        if (permissionWalkable(tilePermission(land, x + .5, z + .5), true) && areaXZ2(clipPlate(intersection, [x, z, x + 1, z + 1])) > 1e-10) {
                            lowerAccessible = true;
                            break;
                        }
            }
        }
        if (hasEntrance || lowerAccessible) {
            unsupported.push({ reason: hasEntrance ? 'Actual source entrance lies within native upper-wall loop' : 'Walkable lower native plate beneath upper-wall loop preserves a possible passage', point: xyz(loop.points[0]), kind: 'native-upper-rim' });
            continue;
        }
        domains.push({ triangles, loop, holes, matchingPlateIndices: matching.map(v => v.index) });
    }
    return { domains, unsupported, nativeLoops: loops, literalLoops: loops.length, sourceOpaqueWallFaces: inferred.sourceOpaqueFaces, unknownWallFaces: inferred.unknownWallFaces };
}
type OpeningRay = {
    origin: THREE.Vector3;
    direction: THREE.Vector3;
    far: number;
    reason: string;
    point: number[];
    evidence: any;
};
function checkOpening(ray: OpeningRay, source: Triangle[], baseline: Triangle[], candidate: Triangle[] | null, added: Triangle[]) {
    const sourceBlocked = Number.isFinite(physicalHit(source, ray.origin, ray.direction, ray.far));
    if (sourceBlocked && !ray.evidence.functionalWarp)
        return null;
    return { reason: ray.reason, point: ray.point, evidence: ray.evidence, ray: { origin: ray.origin.toArray(), direction: ray.direction.toArray(), far: ray.far }, sourceClear: !sourceBlocked, functionalEntrance: Boolean(ray.evidence.functionalWarp), baselineBlocked: Number.isFinite(physicalHit(baseline, ray.origin, ray.direction, ray.far)), candidateBlocked: candidate ? Number.isFinite(physicalHit(candidate, ray.origin, ray.direction, ray.far)) : null, newCandidateGeometryBlocks: Number.isFinite(physicalHit(added, ray.origin, ray.direction, ray.far)) };
}
function checkSurface(point: THREE.Vector3, normal: THREE.Vector3, direction: THREE.Vector3, kind: 'side' | 'existing-top' | 'inferred-top', meta: any, source: Triangle[], baseline: Triangle[], candidate: Triangle[] | null): Probe {
    const origin = kind === 'side' ? point.clone().addScaledVector(normal, -.08) : point.clone().addScaledVector(direction, -.08), visualDirection = kind === 'side' ? normal.clone().negate() : direction, visualOrigin = kind === 'side' ? point.clone().addScaledVector(normal, .08) : origin;
    const physical = { source: Number.isFinite(physicalHit(source, origin, direction, .16)), baseline: Number.isFinite(physicalHit(baseline, origin, direction, .16)), ...candidate ? { candidate: Number.isFinite(physicalHit(candidate, origin, direction, .16)) } : {} }, visual = { source: Number.isFinite(physicalHit(source, visualOrigin, visualDirection, .16, undefined, true)), baseline: Number.isFinite(physicalHit(baseline, visualOrigin, visualDirection, .16, undefined, true)), ...candidate ? { candidate: Number.isFinite(physicalHit(candidate, visualOrigin, visualDirection, .16, undefined, true)) } : {} };
    return { kind, ...meta, point: xyz(point), normal: xyz(normal), physical, visual, ray: { origin: origin.toArray(), direction: direction.toArray(), far: .16 }, visualRay: { origin: visualOrigin.toArray(), direction: visualDirection.toArray(), far: .16 } } as Probe;
}
function surfaceCovered(p: Probe, stage: 'source' | 'baseline' | 'candidate') { return Boolean(p.physical[stage] && p.visual?.[stage]); }
function possibleLowerChannel(c: Context, top: THREE.Vector3, outward: THREE.Vector3) {
    const a = top.clone().addScaledVector(outward, -.3), b = top.clone().addScaledVector(outward, .3), inside = floorAt(c, a.x, a.z), outside = floorAt(c, b.x, b.z);
    if (!inside || !outside || !permissionWalkable(inside.permission, true) || !permissionWalkable(outside.permission, true))
        return [];
    const pairs = inside.heights.flatMap(y => outside.heights.filter(z => y < top.y - .35 && z < top.y - .35 && Math.abs(y - z) < .2).map(z => ({ inside: y, outside: z })));
    const rays: OpeningRay[] = [];
    for (const pair of pairs)
        for (const height of [.25, .8, 1.3]) {
            const y = Math.max(pair.inside, pair.outside) + height;
            if (y > top.y - .08)
                continue;
            const point = new THREE.Vector3(top.x, y, top.z);
            rays.push({ origin: point.clone().addScaledVector(outward, -.55), direction: outward, far: 1.1, point: xyz(point), reason: 'Native passable lower floor across raised boundary', evidence: { insideFloor: pair.inside, outsideFloor: pair.outside, insidePermission: inside.permission, outsidePermission: outside.permission, surfPermitted: true, actualBoundary: xyz(top) } });
        }
    for (const pair of pairs)
        for (const along of [-.3, 0, .3]) {
            const point = new THREE.Vector3(top.x + outward.x * along, Math.max(pair.inside, pair.outside) + .02, top.z + outward.z * along);
            rays.push({ origin: point, direction: new THREE.Vector3(0, 1, 0), far: 1.63, point: xyz(point), reason: 'Native lower-passage headroom', evidence: { insideFloor: pair.inside, outsideFloor: pair.outside, insidePermission: inside.permission, outsidePermission: outside.permission, surfPermitted: true, headroom: true, actualBoundary: xyz(top) } });
        }
    return rays;
}
function sourceEntranceRays(c: Context) {
    const rays: OpeningRay[] = [], seen = new Set<string>(), entries = [...maps.get(c.map)!.events.warps.map(w => ({ x: w.x + .5, z: w.z + .5, axis: undefined as 0 | 2 | undefined, sign: undefined as number | undefined })), ...entrances[c.matrix] ?? []];
    const add = (point: THREE.Vector3, direction: THREE.Vector3, far: number, origin: THREE.Vector3, evidence: any) => {
        const key = origin.toArray().concat(direction.toArray(), far).join(',');
        if (seen.has(key))
            return;
        seen.add(key);
        rays.push({ origin, direction, far, point: xyz(point), reason: 'Actual centred native warp/entrance body and headroom', evidence });
    };
    for (const e of entries) {
        if (Math.floor(e.x / 32) !== c.cell.x || Math.floor(e.z / 32) !== c.cell.z)
            continue;
        const floor = floorAt(c, e.x, e.z);
        if (!floor)
            continue;
        const existing = (entrances[c.matrix] ?? []).find(v => Math.hypot(v.x - e.x, v.z - e.z) < .01), axis = e.axis ?? existing?.axis, sign = e.sign ?? existing?.sign, evidence = { entrance: { x: e.x, z: e.z, axis, sign }, floor: floor.height, permission: floor.permission };
        const dirs = axis !== undefined && sign !== undefined ? [new THREE.Vector3(axis === 0 ? sign : 0, 0, axis === 2 ? sign : 0)] : [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
        for (const dir of dirs)
            for (const offset of [-.45, 0, .45])
                for (const height of [.3, .85, 1.35]) {
                    const point = new THREE.Vector3(e.x - dir.z * offset, floor.height + height, e.z + dir.x * offset);
                    add(point, dir, 1, point.clone().addScaledVector(dir, -.5), { ...evidence, functionalWarp: true, lateralOffset: offset });
                }
        for (const x of [-.45, 0, .45])
            for (const z of [-.45, 0, .45]) {
                const origin = new THREE.Vector3(e.x + x, floor.height + .02, e.z + z);
                add(origin, new THREE.Vector3(0, 1, 0), 1.63, origin, { ...evidence, functionalWarp: true, headroom: true, tileOffset: [x, z] });
            }
    }
    return rays;
}
function topProbeSamples(c: Context, prepared: Awaited<ReturnType<typeof preparedCell>>) {
    const samples: {
        point: THREE.Vector3;
        normal: THREE.Vector3;
        kind: 'existing-top' | 'inferred-top';
        meta: any;
    }[] = [], bins = new Set<string>(), stride = Number(args['top-stride'] || 2);
    for (const t of prepared.top) {
        const point = t.p.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / 3), key = [Math.floor(point.x / stride), Math.floor(point.z / stride), Math.floor(point.y * 8)].join(',');
        if (bins.has(key))
            continue;
        bins.add(key);
        samples.push({ point, normal: new THREE.Triangle(...t.p as [
                THREE.Vector3,
                THREE.Vector3,
                THREE.Vector3
            ]).getNormal(new THREE.Vector3()), kind: 'existing-top', meta: { top: point.y, base: point.y - .16, material: t.name, reason: 'Actual opaque upward native-used-UV terrain surface', component: -1, sourceTriangle: t.p.map(p => p.toArray()) } });
    }
    const inferred = provenTopDomains(c, prepared.rawPhysical);
    for (const [component, domain] of inferred.domains.entries())
        for (const triangle of domain.triangles)
            for (const weights of [[.6, .2, .2], [.2, .6, .2], [.2, .2, .6], [1 / 3, 1 / 3, 1 / 3]]) {
                const native = triangle.reduce((p, v, i) => p.addScaledVector(v, weights[i]), new THREE.Vector3()), point = native.clone();
                if (c.matrix === 0)
                    point.y += terraces?.height(point.x, point.z) ?? 0;
                samples.push({ point, normal: new THREE.Vector3(0, 1, 0), kind: 'inferred-top', meta: { top: point.y, base: point.y - .16, material: domain.loop.sourceMaterial, reason: 'Literal closed native wall rim plus continuous matching movement-plate coverage', component: -2 - component, proof: { rim: domain.loop.points.map(p => p.toArray()), holes: domain.holes.map(h => h.points.map(p => p.toArray())), matchingPlateIndices: domain.matchingPlateIndices } } });
            }
    return { samples, inferred };
}
async function inspect(c: Context) {
    const placed = await preparedCell(c), edges = boundaries(placed.top), components = new Map<number, {
        edges: Boundary[];
        bases: number[];
        evidence: any[];
        propagates?: boolean;
    }>();
    for (const edge of edges) {
        const entry = components.get(edge.component) ?? { edges: [], bases: [], evidence: [] };
        entry.edges.push(edge);
        const mid = edge.a.clone().add(edge.b).multiplyScalar(.5), outside = mid.clone().addScaledVector(edge.outward, .3), floor = floorAt(c, outside.x, outside.z, mid.y);
        if (floor && floor.height < mid.y - .15) {
            entry.bases.push(floor.height);
            entry.evidence.push({ boundary: xyz(mid), lowerSample: xyz(outside), height: floor.height, cell: [floor.context.cell.x, floor.context.cell.z], land: floor.context.cell.land, evidence: 'Native adjacent lower floor at actual placed height' });
        }
        components.set(edge.component, entry);
    }
    for (const v of components.values()) {
        const points = v.edges.flatMap(e => [e.a, e.b]), levels = points.map(p => p.y - (c.matrix === 0 ? terraces?.height(p.x, p.z) ?? 0 : 0));
        v.propagates = placed.land.permissions.every(p => Boolean(p & 0x8000)) && Math.max(...levels) - Math.min(...levels) < 1e-6 && points.every(p => heights(c, p.x, p.z).some(y => Math.abs(y - p.y) < .03));
    }
    const probes: Probe[] = [], unsupported: any[] = [...new Set(placed.unsupported)].map(reason => ({ reason })), classified: any[] = [], openingRays: OpeningRay[] = sourceEntranceRays(c);
    if (!placed.top.length && placed.land.plates.length && c.cell.altitude > 0)
        unsupported.push({ reason: 'Raised native plate has no classified opaque cap; geological volume unproven', materials: placed.inventory.materials });
    const neighbors = [...bySpace.get(space(c))!.values()].filter(n => Math.abs(n.cell.x - c.cell.x) <= 1 && Math.abs(n.cell.z - c.cell.z) <= 1), neighborPrepared = await Promise.all(neighbors.map(preparedCell)), raw = neighborPrepared.flatMap((p, i) => p.sourcePhysical.map(t => ({ ...t, placement: neighbors[i].key }))), baseline = neighborPrepared.flatMap((p, i) => p.physical.map(t => ({ ...t, placement: neighbors[i].key }))), candidate = placed.candidate ? neighborPrepared.flatMap((p, i) => (p.candidatePhysical ?? p.physical).map(t => ({ ...t, placement: neighbors[i].key }))) : null, added = neighborPrepared.flatMap(p => p.addedPhysical);
    for (const [id, component] of components)
        for (const edge of component.edges)
            for (const along of [.25, .5, .75]) {
                const top = edge.a.clone().lerp(edge.b, along), outside = top.clone().addScaledVector(edge.outward, .3), floor = floorAt(c, outside.x, outside.z, top.y), inside = top.clone().addScaledVector(edge.outward, -.25), lower = floorAt(c, inside.x, inside.z);
                openingRays.push(...possibleLowerChannel(c, top, edge.outward));
                let base = floor?.height, reason = 'Adjacent native lower floor';
                if (floor && floor.heights.some(y => y >= top.y - .15) && floor.heights.some(y => y < top.y - .15)) {
                    unsupported.push({ component: id, point: xyz(top), reason: 'Overlapping upper/lower adjacent native plates require layered volume adjudication', floorHeights: floor.heights });
                    continue;
                }
                if (base === undefined && component.propagates && component.bases.length) {
                    base = Math.max(...component.bases);
                    reason = 'Fully blocked inverse-deformed flat cap with matching own plate and conservative proven adjacent support';
                }
                if (base === undefined) {
                    unsupported.push({ component: id, point: xyz(top), reason: 'No proven lower source support; open map edge is not an inferred wall' });
                    continue;
                }
                if (top.y - base < .15) {
                    classified.push({ component: id, point: xyz(top), reason: 'Adjacent native plate reaches cap height; no exposed side established', floorHeights: floor?.heights });
                    continue;
                }
                if (bridge.test(edge.triangle.name) || lower && permissionWalkable(lower.permission, true) && lower.heights.some(y => y < top.y - .35)) {
                    unsupported.push({ component: id, point: xyz(top), reason: 'Passable lower floor beneath cap preserves possible cave/bridge/Surf passage', floorHeights: lower?.heights, permission: lower?.permission });
                    continue;
                }
                if (/CAVE|UNDERGROUND/.test(c.mapType)) {
                    unsupported.push({ component: id, point: xyz(top), reason: 'Cave/underground solid volume requires authored opening review' });
                    continue;
                }
                for (const height of [.2, .5, .8]) {
                    const point = top.clone();
                    point.y = base + (top.y - base) * height;
                    probes.push(checkSurface(point, edge.outward, edge.outward, 'side', { top: top.y, base, material: edge.triangle.name, reason, component: id }, raw, baseline, candidate));
                }
            }
    const top = topProbeSamples(c, placed);
    unsupported.push(...top.inferred.unsupported);
    if (top.inferred.unknownWallFaces)
        unsupported.push({ reason: 'Mixed-alpha or unreadable native wall faces do not prove roof enclosure', faces: top.inferred.unknownWallFaces });
    const topDirections = [new THREE.Vector3(0, -1, 0), new THREE.Vector3(.6, -.8, 0), new THREE.Vector3(-.6, -.8, 0), new THREE.Vector3(0, -.8, .6), new THREE.Vector3(0, -.8, -.6)];
    for (const sample of top.samples)
        for (const direction of topDirections)
            probes.push(checkSurface(sample.point, sample.normal, direction, sample.kind, sample.meta, raw, baseline, candidate));
    // A nested literal source rim is an opening candidate only when its actual
    // original geometry is clear. It never becomes an implicit filled roof.
    for (const hole of top.inferred.nativeLoops.filter(inner => top.inferred.nativeLoops.filter(outer => outer.area > inner.area + 1e-9 && Math.abs(outer.height - inner.height) < 1e-6 && insidePolygonXZ(inner.points[0].x, inner.points[0].z, outer.points)).length % 2 === 1))
        for (const ids of THREE.ShapeUtils.triangulateShape(hole.points.map(p => new THREE.Vector2(p.x, p.z)), [])) {
            const point = ids.reduce((p, i) => p.add(hole.points[i]), new THREE.Vector3()).multiplyScalar(1 / 3);
            if (c.matrix === 0)
                point.y += terraces?.height(point.x, point.z) ?? 0;
            openingRays.push({ origin: point.clone().add(new THREE.Vector3(0, .12, 0)), direction: new THREE.Vector3(0, -1, 0), far: .62, point: xyz(point), reason: 'Nested literal native wall-rim opening', evidence: { ring: hole.points.map(p => p.toArray()) } });
        }
    const openingChecks = openingRays.map(r => checkOpening(r, raw, baseline, candidate, added)).filter((v): v is NonNullable<typeof v> => Boolean(v)), missing = probes.filter(p => !surfaceCovered(p, candidate ? 'candidate' : 'baseline')), witnesses: any[] = [], baselineWitnesses: any[] = [];
    if (!('no-camera' in args)) {
        const select = (a: Probe[]) => a.sort((a, b) => (b.top - b.base) - (a.top - a.base) || b.point[1] - a.point[1]).filter((p, i, a) => a.findIndex(q => Math.hypot(q.point[0] - p.point[0], q.point[2] - p.point[2]) < .4 && Math.abs(q.point[1] - p.point[1]) < .4) === i).slice(0, Number(args['max-view-probes'] || 8));
        for (const p of select(probes.filter(p => !surfaceCovered(p, 'baseline')))) {
            p.baselineCamera = await witness(c, p, 'baseline');
            if (p.baselineCamera.status === 'visible-hole') {
                baselineWitnesses.push({ ...p.baselineCamera, candidatePhysicallyCovered: candidate ? surfaceCovered(p, 'candidate') : null });
                if (baselineWitnesses.length >= Number(args['max-witnesses'] || 2))
                    break;
            }
        }
        for (const p of select(missing)) {
            p.camera = candidate ? await witness(c, p, 'candidate') : p.baselineCamera ?? await witness(c, p, 'baseline');
            if (p.camera.status === 'visible-hole') {
                witnesses.push(p.camera);
                if (witnesses.length >= Number(args['max-witnesses'] || 2))
                    break;
            }
        }
    }
    const baselineBlockerSamples = probes.filter(p => p.kind === 'side' && surfaceCovered(p, 'baseline')).slice(0, 6).map(p => { const evidence = {}, ray = (p as any).ray; physicalHit(baseline, new THREE.Vector3().fromArray(ray.origin), new THREE.Vector3().fromArray(ray.direction), ray.far, evidence); return { expectedPoint: p.point, normal: p.normal, blocker: evidence }; });
    return { ...placed.inventory, boundarySegments: edges.length, components: [...components].map(([id, v]) => ({ id, propagationProven: v.propagates, lowerFloorEvidence: v.evidence })), topCoverage: { existingSamples: top.samples.filter(s => s.kind === 'existing-top').length, literalNativeWallLoops: top.inferred.literalLoops, provenMissingCapDomains: top.inferred.domains.length, unknownNativeWallFaces: top.inferred.unknownWallFaces }, expectedSurfaceRays: probes.length, sideExpectedRays: probes.filter(p => p.kind === 'side').length, topExpectedRays: probes.filter(p => p.kind !== 'side').length, sourceMissingRays: probes.filter(p => !surfaceCovered(p, 'source')).length, baselineMissingRays: probes.filter(p => !surfaceCovered(p, 'baseline')).length, candidateMissingRays: candidate ? probes.filter(p => !surfaceCovered(p, 'candidate')).length : null, candidateRegressions: probes.filter(p => surfaceCovered(p, 'baseline') && candidate && !surfaceCovered(p, 'candidate')).length, openingPreservationRays: openingChecks.length, newBlockedOpenings: openingChecks.filter(p => p.newCandidateGeometryBlocks).length, baselineBlockerSamples, cameraVisibleWitnesses: witnesses.length, baselineCameraVisibleWitnesses: baselineWitnesses.length, unsupported, classified, probes, openingChecks, witnesses, baselineWitnesses };
}
async function initialize() {
    const index = await readJSON('index.json') as SourceIndex;
    foliage = await readJSON('foliage.json');
    entrances = await readJSON('entrances.json');
    terraces = new Terraces(await readJSON('terraces/0.json') as TerraceData);
    for (const meta of Object.values(index.maps)) {
        if (meta.mapType === 'MAP_TYPE_INTERIOR' || meta.mapType === 'MAP_TYPE_INVALID')
            continue;
        const map = await readJSON(`maps/${meta.id}.json`) as SourceMap;
        maps.set(map.id, map);
        if (!matrices.has(map.matrix))
            matrices.set(map.matrix, await readJSON(`matrices/${map.matrix}.json`));
        const matrix = matrices.get(map.matrix)!;
        for (const cell of map.cells) {
            const owner = matrix.headers?.[cell.z * matrix.width + cell.x] ?? map.id;
            if (owner !== map.id)
                continue;
            const key = map.matrix + ':' + (matrix.headers === null ? map.id + ':' : '') + cell.x + ',' + cell.z + ':' + cell.asset, c: Context = { key, matrix: map.matrix, map: map.id, mapName: map.name, mapType: map.mapType, cell, aliases: [map.id] };
            contextList.push(c);
            if (!lands.has(cell.land))
                lands.set(cell.land, await readJSON(`lands/${cell.land}.json`));
            const group = bySpace.get(space(c)) ?? new Map();
            group.set(cell.x + ',' + cell.z, c);
            bySpace.set(space(c), group);
        }
    }
    buildReachability(await readJSON('spawns.json'));
    if ('candidate' in args) {
        const path = new URL('../src/source/terrain-scenery.ts', import.meta.url);
        const module = await import(path.href);
        candidateBuilder = module.closeTerrainScenery;
        if (typeof candidateBuilder !== 'function')
            throw Error('Candidate terrain module does not export closeTerrainScenery');
    }
}
if ('self-test' in args) {
    const opaque = new THREE.MeshBasicMaterial(), partial = new THREE.MeshBasicMaterial({ transparent: true, opacity: .2 });
    assert.equal(opaqueAt(opaque), true);
    assert.equal(opaqueAt(partial), false);
    const square = [new THREE.Vector3(0, 7, 0), new THREE.Vector3(1, 7, 0), new THREE.Vector3(1, 7, 1), new THREE.Vector3(0, 7, 1)], ts = [[0, 1, 2], [0, 2, 3]].map(ids => ({ p: ids.map(i => square[i]), uv: ids.map(() => new THREE.Vector2()), material: opaque, name: 'cliff01' }));
    assert.equal(boundaries(ts).length, 4);
    assert.equal(physicalHit(ts, new THREE.Vector3(.5, 4, -.1), new THREE.Vector3(0, 0, 1), .2), Infinity);
    const wall = { ...ts[0], p: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0), new THREE.Vector3(1, 7, 0)] };
    assert.ok(Number.isFinite(physicalHit([wall], new THREE.Vector3(.8, 4, -.1), new THREE.Vector3(0, 0, 1), .2)));
    const image = { data: new Uint8Array([255, 255, 255, 255, 255, 255, 255, 0, 255, 255, 255, 255, 255, 255, 255, 0]), width: 2, height: 2 }, texture = new THREE.DataTexture(image.data, 2, 2);
    texture.flipY = false;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    assert.deepEqual(rectangles(texture, .5), [[0, 0, .5, 1]]);
    const squareAt = (x: number, z: number, w = 1, h = 1): Triangle[] => { const p = [new THREE.Vector3(x, 7, z), new THREE.Vector3(x + w, 7, z), new THREE.Vector3(x + w, 7, z + h), new THREE.Vector3(x, 7, z + h)]; return [[0, 1, 2], [0, 2, 3]].map(ids => ({ p: ids.map(i => p[i]), uv: ids.map(i => new THREE.Vector2(p[i].x, p[i].z)), material: opaque, name: 'cliff01' })); };
    const concave = [...squareAt(0, 0), ...squareAt(1, 0), ...squareAt(0, 1)], concaveEdges = boundaries(concave);
    assert.equal(concaveEdges.reduce((n, e) => n + e.a.distanceTo(e.b), 0), 8, 'native L-shaped perimeter retains concavity');
    assert.equal(physicalHit(concave, new THREE.Vector3(1.5, 8, 1.5), new THREE.Vector3(0, -1, 0), 2), Infinity, 'missing L corner never becomes a convex-hull roof');
    const splitEdges = boundaries([...squareAt(0, 0, 1, 2), ...squareAt(1, 0), ...squareAt(1, 1)]);
    assert.ok(!splitEdges.some(e => e.a.x === 1 && e.b.x === 1), 'T-junction subdivisions cancel internal edges');
    const mask = new THREE.MeshBasicMaterial({ map: texture, alphaTest: .5 }), masked = { ...squareAt(0, 0)[0], material: mask };
    assert.ok(Math.abs(opaqueFootprint(masked).triangles.reduce((n, t) => n + new THREE.Triangle(...t.p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).getArea(), 0) - .125) < 1e-12, 'MASK triangle footprint clips to actual opaque texels');
    assert.equal(physicalHit([masked], new THREE.Vector3(.75, 8, .1), new THREE.Vector3(0, -1, 0), 2), Infinity, 'transparent texel is no blocker');
    assert.ok(Number.isFinite(physicalHit([masked], new THREE.Vector3(.25, 8, .1), new THREE.Vector3(0, -1, 0), 2)), 'opaque texel blocks');
    const indexed: Triangle[] = [];
    for (let z = -6; z < 6; z++)
        for (let x = -6; x < 6; x++)
            indexed.push(...squareAt(x, z));
    assert.equal(physicalHit(indexed, new THREE.Vector3(-1.75, 8, 3.25), new THREE.Vector3(0, -1, 0), 2), 1, 'spatial broad phase retains negative coordinates and actual opaque intersections');
    const material = new THREE.MeshBasicMaterial(), contour = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], native: Triangle[] = [];
    material.name = 'cliff01';
    for (let i = 0; i < contour.length; i++) {
        const a = contour[i], b = contour[(i + 1) % contour.length], pa = new THREE.Vector3(a[0], 0, a[1]), pb = new THREE.Vector3(b[0], 0, b[1]), qa = pa.clone().setY(3), qb = pb.clone().setY(3);
        for (const p of [[pa, pb, qb], [pa, qb, qa]])
            native.push({ p, uv: p.map(() => new THREE.Vector2()), material, name: 'cliff01' });
    }
    const loops = literalWallTopLoops(native);
    assert.equal(loops.loops.length, 1);
    assert.equal(loops.loops[0].area, 3);
    const cap = new THREE.MeshBasicMaterial();
    cap.name = 'grass01';
    const points = contour.map(a => new THREE.Vector3(a[0], 3, a[1]));
    for (const ids of THREE.ShapeUtils.triangulateShape(contour.map(a => new THREE.Vector2(...a)), [])) {
        const p = ids.map(i => points[i]);
        if (new THREE.Triangle(...p as [
            THREE.Vector3,
            THREE.Vector3,
            THREE.Vector3
        ]).getNormal(new THREE.Vector3()).y > 0)
            p.reverse();
        native.push({ p, uv: p.map(() => new THREE.Vector2()), material: cap, name: 'grass01' });
    }
    assert.equal(literalWallTopLoops(native).loops.length, 1, 'wall-only rim remains independently measurable when native cap exists');
    console.log('native literal missing-top concave loop and authored-cap cancellation PASS');
    const cx: Context = { key: 'test', matrix: -1, map: -1, mapName: 'test', mapType: 'MAP_TYPE_ROUTE', aliases: [], cell: { x: 0, z: 0, land: -1, altitude: 0, asset: 'test', props: [] } }, testLand: Land = { permissions: Array(1024).fill(0x8000), plates: [{ bounds: [-16, -16, 16, 16], normal: [0, 1, 0], constant: -3 }] };
    lands.set(-1, testLand);
    const domain = provenTopDomains(cx, native);
    assert.equal(domain.domains.length, 1);
    assert.equal(domain.domains[0].triangles.reduce((n, p) => n + new THREE.Triangle(...p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).getArea(), 0), 3);
    assert.ok(domain.domains[0].triangles.every(p => !new THREE.Triangle(...p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).containsPoint(new THREE.Vector3(1.5, 3, 1.5))));
    lands.set(-1, { ...testLand, plates: [] });
    assert.equal(provenTopDomains(cx, native).domains.length, 0, 'closed-wall shape without actual plate cannot infer a roof');
    lands.set(-1, testLand);
    entrances[-1] = [{ x: .5, z: .5 }];
    assert.equal(provenTopDomains(cx, native).domains.length, 0, 'actual source entrance preserves opening');
    entrances[-1] = [];
    lands.set(-1, { ...testLand, permissions: Array(1024).fill(0), plates: [...testLand.plates, { bounds: [-16, -16, 16, 16], normal: [0, 1, 0], constant: 0 }] });
    assert.equal(provenTopDomains(cx, native).domains.length, 0, 'walkable lower floor preserves passage');
    lands.set(-1, testLand);
    assert.equal(provenTopDomains({ ...cx, mapType: 'MAP_TYPE_CAVE' }, native).domains.length, 0, 'cave roof unsupported');
    console.log('matching-plate continuous footprint, concavity, active entrance, lower passage, cave guards PASS');
    const inward = { p: [new THREE.Vector3(0, 2, 1), new THREE.Vector3(0, 2, -1), new THREE.Vector3(0, 0, -1)], uv: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()], material: new THREE.MeshBasicMaterial({ side: THREE.FrontSide }), name: 'cliff01' };
    const inwardCoverage = checkSurface(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), 'side', { top: 2, base: 0, material: 'cliff01', reason: 'test', component: 0 }, [], [], [inward]);
    assert.equal(inwardCoverage.physical.candidate, true);
    assert.equal(inwardCoverage.visual?.candidate, false, 'inward-cull native skin cannot count as exterior visual coverage');
    const gridCell: Matrix = { width: 1, height: 1, headers: [-1], models: [-1], altitudes: [0] };
    matrices.set(-1, gridCell);
    bySpace.set('-1:shared', new Map([['0,0', cx]]));
    maps.set(-1, { events: { warps: [{ x: 0, z: 0, header: 'test', anchor: 0, y: 0 }], objects: [], bgs: [], coords: [] } } as unknown as SourceMap);
    lands.set(-1, { permissions: Array(1024).fill(0), plates: [{ bounds: [-16, -16, 16, 16], normal: [0, 1, 0], constant: 0 }, { bounds: [-16, -16, 16, 16], normal: [0, 1, 0], constant: -3 }] });
    const lowerChannels = possibleLowerChannel(cx, new THREE.Vector3(1, 3, 1), new THREE.Vector3(1, 0, 0));
    assert.equal(lowerChannels.length, 6);
    const newWall = { ...inward, p: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 3, 0), new THREE.Vector3(1, 3, 2)], material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }) };
    assert.ok(lowerChannels.some(ray => checkOpening(ray, [], [], [newWall, { ...newWall, p: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 3, 2), new THREE.Vector3(1, 0, 2)] }], [newWall, { ...newWall, p: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 3, 2), new THREE.Vector3(1, 0, 2)] }])?.newCandidateGeometryBlocks), 'new wall over source-clear passable lower corridor must fail');
    lands.set(-1, { permissions: Array(1024).fill(16), plates: [{ bounds: [-16, -16, 16, 16], normal: [0, 1, 0], constant: 0 }, { bounds: [-16, -16, 16, 16], normal: [0, 1, 0], constant: -3 }] });
    assert.equal(possibleLowerChannel(cx, new THREE.Vector3(1, 3, 1), new THREE.Vector3(1, 0, 0)).length, 6, 'Surf lower passages have the same independent opening proof');
    entrances[-1] = [{ x: .5, z: .5, axis: 0, sign: 1 }];
    const warpRays = sourceEntranceRays(cx), sliver: Triangle = { p: [new THREE.Vector3(.9, 1, .9), new THREE.Vector3(1, 1, .9), new THREE.Vector3(1, 1, 1)], uv: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()], material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), name: 'cliff01' };
    assert.ok(warpRays.some(ray => ray.evidence.headroom && checkOpening(ray, [], [], [sliver], [sliver])?.newCandidateGeometryBlocks), 'thin warp-tile corner roof is caught by full-tile headroom grid');
    assert.ok(warpRays.every(ray => ray.evidence.entrance.x === .5 && ray.evidence.entrance.z === .5), 'warp corners become centres exactly once');
    entrances[-1] = [];
    maps.set(-1, { events: { warps: [], objects: [], bgs: [], coords: [] } } as unknown as SourceMap);
    lands.set(-1, testLand);
    const ringWalls = (ring: number[][]) => {
        const faces: Triangle[] = [];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i], b = ring[(i + 1) % ring.length], p = new THREE.Vector3(a[0], 0, a[1]), q = new THREE.Vector3(b[0], 0, b[1]), u = p.clone().setY(3), v = q.clone().setY(3);
            for (const points of [[p, q, v], [p, v, u]])
                faces.push({ p: points, uv: points.map(() => new THREE.Vector2()), material, name: 'cliff01' });
        }
        return faces;
    };
    const rings = [...ringWalls([[0, 0], [4, 0], [4, 4], [0, 4]]), ...ringWalls([[1, 1], [3, 1], [3, 3], [1, 3]])], nested = provenTopDomains(cx, rings);
    assert.equal(nested.domains.length, 1);
    assert.equal(nested.domains[0].holes.length, 1);
    assert.equal(nested.domains[0].triangles.reduce((n, p) => n + new THREE.Triangle(...p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).getArea(), 0), 12, 'native inner ring stays an actual hole in continuous plate proof');
    const closingCap: Triangle = { p: [new THREE.Vector3(0, 3, 0), new THREE.Vector3(4, 3, 0), new THREE.Vector3(4, 3, 4)], uv: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()], material: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), name: 'cliff01' };
    assert.equal(checkOpening({ origin: new THREE.Vector3(2, 3.12, 2), direction: new THREE.Vector3(0, -1, 0), far: .62, reason: 'nested hole', point: [2, 3, 2], evidence: {} }, rings, rings, [...rings, closingCap], [closingCap])?.newCandidateGeometryBlocks, true, 'new cap across native inner hole fails opening preservation');
    const lineUV = { ...masked, uv: [new THREE.Vector2(.25, 0), new THREE.Vector2(.75, 0), new THREE.Vector2(.25, 0)] }, pointUV = { ...masked, uv: [new THREE.Vector2(0, 0), new THREE.Vector2(0, 0), new THREE.Vector2(0, 0)] };
    assert.ok(Math.abs(opaqueFootprint(lineUV).triangles.reduce((n, t) => n + new THREE.Triangle(...t.p as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
    ]).getArea(), 0) - .375) < 1e-12, 'collapsed texture-row UVs preserve exact opaque intervals');
    assert.equal(opaqueFootprint(pointUV).triangles.length, 1, 'one opaque native texel can legitimately cover a full triangle');
    const functional = warpRays.find(ray => ray.evidence.functionalWarp && !ray.evidence.headroom)!;
    const doorCard: Triangle[] = [{ ...sliver, p: [new THREE.Vector3(.5, 0, -.5), new THREE.Vector3(.5, 2, -.5), new THREE.Vector3(.5, 2, 1.5)] }, { ...sliver, p: [new THREE.Vector3(.5, 0, -.5), new THREE.Vector3(.5, 2, 1.5), new THREE.Vector3(.5, 0, 1.5)] }];
    const functionalCheck = checkOpening(functional, doorCard, doorCard, doorCard, doorCard);
    assert.ok(functionalCheck && functionalCheck.sourceClear === false && functionalCheck.newCandidateGeometryBlocks, 'native functional entry authority survives an opaque source door/cave card');
    console.log('terrain audit self-test passed: alpha rectangles, nonconvex boundary cancellation, missing side and real physical coverage');
    process.exit(0);
}
await initialize();
if ('gate' in args && !['regression', 'closed'].includes(args.gate))
    throw Error('--gate must be regression or closed');
for (const key of ['top-stride', 'camera-stride', 'max-view-probes', 'max-witnesses', 'aspect', 'hole-depth'])
    if (key in args && !(Number(args[key]) > 0))
        throw Error('--' + key + ' must be positive');
const chosen = contextList.filter(c => (!args.matrices || args.matrices.split(',').includes(String(c.matrix))) && (!args.cells || args.cells.split(';').some(v => v === c.matrix + ':' + c.cell.x + ',' + c.cell.z)));
const outputPath = resolve(args.output || fileURLToPath(new URL('../reviews/terrain-visibility-audit.json', import.meta.url))), chunkDir = resolve(args['checkpoint-dir'] || outputPath.replace(/\.json$/, '') + '.chunks'), manifestPath = join(chunkDir, 'manifest.json');
await mkdir(chunkDir, { recursive: true });
const normalize = (value: any): any => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalize(v)])) : value, stableJSON = (value: unknown) => JSON.stringify(normalize(value)), runConfig = Object.fromEntries(Object.entries(args).filter(([key]) => !['output', 'checkpoint-dir', 'resume'].includes(key))), signature = digest(stableJSON({ version: 2, sourceHashes, config: runConfig, selected: chosen.map(c => c.key) }));
async function atomicJSON(path: string, value: unknown) { await mkdir(dirname(path), { recursive: true }); const temp = path + '.tmp-' + process.pid; await writeFile(temp, JSON.stringify(value, null, 2) + '\n'); await rename(temp, path); }
function summarizeContext(result: any) {
    const counts: Record<string, number> = {};
    for (const item of result.unsupported ?? [])
        counts[item.reason] = (counts[item.reason] ?? 0) + 1;
    const { probes, openingChecks, unsupported, components, classified, ...rest } = result;
    const candidateSummary = rest.candidateSummary;
    if (candidateSummary) {
        rest.candidateSummary = { ...candidateSummary, unsupported: undefined, supportPropagations: undefined, unsupportedCount: candidateSummary.unsupported?.length ?? 0, supportPropagationCount: candidateSummary.supportPropagations?.length ?? 0, unsupportedSamples: candidateSummary.unsupported?.slice(0, 6), supportPropagationSamples: candidateSummary.supportPropagations?.slice(0, 3) };
    }
    return { ...rest, unsupportedCount: unsupported?.length ?? 0, unsupportedByReason: counts, unsupportedSamples: unsupported?.slice(0, 6), classifiedCount: classified?.length ?? 0, candidateRegressions: result.candidateRegressions ?? 0 };
}
let checkpoint: any = { version: 2, signature, sourceRevision, sourceHashes, runConfig, selected: chosen.map(c => c.key), dataSHA256: { ...hashes }, completed: [], status: 'in-progress' };
const results: any[] = [];
if ('resume' in args) {
    const previous = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (previous.signature !== signature || stableJSON(previous.sourceHashes) !== stableJSON(sourceHashes) || previous.status === 'invalidated')
        throw Error('Checkpoint source graph, selection or sampling config differs; refusing mixed resume');
    for (const [path, hash] of Object.entries(previous.dataSHA256) as [
        string,
        string
    ][]) {
        if (digest(await readFile(new URL(path, source))) !== hash)
            throw Error('Checkpoint native input changed: ' + path);
        hashes[path] = hash;
    }
    for (const entry of previous.completed) {
        const bytes = await readFile(join(chunkDir, entry.file));
        if (digest(bytes) !== entry.sha256)
            throw Error('Checkpoint chunk bytes changed: ' + entry.file);
        const result = JSON.parse(gunzipSync(bytes).toString());
        if (result.key !== entry.key)
            throw Error('Checkpoint context identity changed');
        results.push({ ...summarizeContext(result), chunk: { file: entry.file, sha256: entry.sha256, compressedBytes: bytes.length } });
    }
    checkpoint = previous;
    checkpoint.resumeRevision = sourceRevision;
    checkpoint.status = 'in-progress';
}
const completed = new Set(results.map(r => r.key));
console.log(JSON.stringify({ phase: 'native-inventory', contexts: contextList.length, uniqueAssets: new Set(contextList.map(c => c.cell.asset)).size, selected: chosen.length, resumed: completed.size, spaces: bySpace.size, reachableTiles: [...reachable.values()].reduce((n, v) => n + v.reachable, 0), manifest: manifestPath }));
for (const c of chosen) {
    if (completed.has(c.key))
        continue;
    let result: any;
    try {
        result = 'inventory-only' in args ? (await preparedCell(c)).inventory : await inspect(c);
    }
    catch (error) {
        result = { key: c.key, asset: c.cell.asset, status: 'unsupported-error', error: error instanceof Error ? error.stack : String(error) };
    }
    const file = 'context-' + String(chosen.indexOf(c)).padStart(4, '0') + '-' + digest(c.key).slice(0, 12) + '.json.gz', bytes = gzipSync(Buffer.from(JSON.stringify(result))), temp = join(chunkDir, file + '.tmp-' + process.pid);
    await writeFile(temp, bytes);
    await rename(temp, join(chunkDir, file));
    const entry = { key: c.key, file, sha256: digest(bytes), compressedBytes: bytes.length };
    checkpoint.completed.push(entry);
    checkpoint.dataSHA256 = { ...hashes };
    const changedNow: string[] = [];
    for (const [p, hash] of Object.entries(sourceHashes))
        if (digest(await readFile(new URL('../' + p, import.meta.url))) !== hash)
            changedNow.push(p);
    if (changedNow.length) {
        checkpoint.status = 'invalidated';
        checkpoint.changedSourceFiles = changedNow;
    }
    await atomicJSON(manifestPath, checkpoint);
    results.push({ ...summarizeContext(result), chunk: entry });
    if ('inventory-only' in args)
        prepared.delete(c.key);
    if (results.length % 25 === 0 || changedNow.length)
        console.log(JSON.stringify({ phase: 'auditing', completed: results.length, total: chosen.length, newBlockedOpenings: results.reduce((n, r) => n + (r.newBlockedOpenings || 0), 0), regressions: results.reduce((n, r) => n + (r.candidateRegressions || 0), 0), changedSourceFiles: changedNow }));
    if (changedNow.length)
        break;
}
const sourceHashesAfter = Object.fromEntries(await Promise.all(Object.keys(sourceHashes).map(async (p) => [p, digest(await readFile(new URL('../' + p, import.meta.url)))]))), changed = Object.keys(sourceHashes).filter(p => sourceHashes[p] !== sourceHashesAfter[p]), sourceRevisionAfter = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), sum = (key: string) => results.reduce((n, r) => n + (r[key] || 0), 0), summary = { contexts: contextList.length, uniqueAssets: new Set(contextList.map(c => c.cell.asset)).size, selected: chosen.length, completed: results.length, tested: results.filter(r => r.expectedSurfaceRays > 0).length, unsupportedContexts: results.filter(r => r.status === 'unsupported-error' || r.unsupportedCount).length, expectedSurfaceRays: sum('expectedSurfaceRays'), sideExpectedRays: sum('sideExpectedRays'), topExpectedRays: sum('topExpectedRays'), openingPreservationRays: sum('openingPreservationRays'), newBlockedOpenings: sum('newBlockedOpenings'), sourceMissingRays: sum('sourceMissingRays'), baselineMissingRays: sum('baselineMissingRays'), candidateMissingRays: candidateBuilder ? sum('candidateMissingRays') : null, baselineCameraVisibleWitnesses: sum('baselineCameraVisibleWitnesses'), candidateRegressions: sum('candidateRegressions'), candidateUnknownSupports: results.reduce((n, r) => n + (r.candidateSummary?.unknownSupports || 0), 0), candidateUnsupported: results.reduce((n, r) => n + (r.candidateSummary?.unsupportedCount || 0), 0), cameraVisibleContexts: results.filter(r => r.cameraVisibleWitnesses > 0).length, cameraVisibleWitnesses: sum('cameraVisibleWitnesses') };
const dataHashesAfter = Object.fromEntries(await Promise.all(Object.keys(hashes).map(async (p) => [p, digest(await readFile(new URL(p, source)))]))), changedData = Object.keys(hashes).filter(p => hashes[p] !== dataHashesAfter[p]), gateReasons: string[] = [];
if (changedData.length)
    gateReasons.push('Native GLB/PNG/JSON inputs changed during audit');
if (!chosen.length)
    gateReasons.push('No native contexts selected');
if (results.length !== chosen.length)
    gateReasons.push('Context selection was not completed');
if (args.gate && summary.expectedSurfaceRays === 0)
    gateReasons.push('Gate has no proven expected-surface samples');
if (results.some(r => r.status === 'unsupported-error'))
    gateReasons.push('Actual geometry/material contexts could not be audited');
if (changed.length || sourceRevision !== sourceRevisionAfter)
    gateReasons.push('Source graph or revision changed during audit');
if (args.gate && !candidateBuilder)
    gateReasons.push('Regression/closure gate requires --candidate');
if (args.gate && summary.candidateRegressions)
    gateReasons.push('Candidate introduced ' + summary.candidateRegressions + ' missing physical/render-side samples where baseline was solid');
if (args.gate === 'closed' && summary.candidateMissingRays)
    gateReasons.push('Candidate retains ' + summary.candidateMissingRays + ' expected surface misses');
if (args.gate && summary.newBlockedOpenings)
    gateReasons.push('Candidate blocked ' + summary.newBlockedOpenings + ' source-proven opening rays');
if (args.gate && summary.cameraVisibleWitnesses)
    gateReasons.push('Finite actual player-camera continuation rays expose unresolved holes');
if ('fail-unsupported' in args && summary.unsupportedContexts)
    gateReasons.push('Unsupported contexts require explicit adjudication');
const gate = { mode: args.gate || 'diagnostic', passed: !gateReasons.length, scope: 'Only measured selected surfaces and source-proven openings; not whole-volume approval', coverageComplete: summary.unsupportedContexts === 0 && summary.candidateUnknownSupports === 0 && summary.candidateUnsupported === 0, reasons: gateReasons, unsupportedDoNotCountAsPass: true };
const report = { version: 2, gate, status: 'Finite scoped terrain evidence. Unsupported geological volumes and independent actual visual approval remain separate.', sourceRevision, sourceRevisionAfter, sourceHashes, sourceHashesAfter, changedSourceFiles: changed, codeSnapshotStable: !changed.length && sourceRevision === sourceRevisionAfter, dataSHA256: hashes, dataSHA256After: dataHashesAfter, changedDataFiles: changedData, dataSnapshotStable: !changedData.length, method: { runConfig, expected: 'Literal opaque upward source-used-UV surfaces after actual terrace deformation; T-junction-aware boundaries with matching native support. Missing tops require literal native wall loops plus continuous plate footprint proof, with nested holes preserved.', topSamplingStrideTiles: Number(args['top-stride'] || 2), topRayDirections: [[0, -1, 0], [.6, -.8, 0], [-.6, -.8, 0], [0, -.8, .6], [0, -.8, -.6]], strictRayTolerance: 0, rayIntersection: 'Watertight shared-edge triangle projection, with no epsilon or near-edge allowance; physical and exterior render-side coverage are separate', physicalProbeBandTiles: .16, minExposedHeight: .15, openingProof: 'Actual centred source entrances, source-clear passable lower-floor channels including Surf, nested native upper-rim holes. Candidate-generated triangle blockers are tested independently of skipped solid-volume expectations.', reachability: 'Warp/Fly/blackout-seeded native permission components with Surf allowed; geometric over-approximation. Multiheight ambiguous camera floors are excluded; sampled standing furniture collisions checked. Ledge/HM/story/actor availability is not asserted.', camera: 'Runtime52degree camera; yaw sectors, pitches.18/.4/.65/.95, distances5/13/28 and runtime collision shortening. Actual alpha/static-geometry line of sight plus one-tile continuation distinguishes a gap from an inset skin.', limitations: ['Finite surface/camera samples do not prove continuous all-angle coverage.', 'Unknown mixed-alpha walls, open native boundary chains, caves and unmatched movement plates remain unsupported.', 'Short-band misses on arbitrary sloping forms require geometric adjudication.', 'NPCs and animated vegetation are not permanent occluders.'] }, summary, reachability: Object.fromEntries([...reachable].map(([k, v]) => [k, { ...v, poses: undefined, sampledPoses: v.poses.length }])), chunkDirectory: chunkDir, checkpointManifest: manifestPath, placements: results, inventory: results };
await atomicJSON(outputPath, report);
checkpoint.status = gateReasons.some(r => r.includes('changed')) ? 'invalidated' : 'complete';
checkpoint.summary = summary;
checkpoint.gate = gate;
checkpoint.finalReportSHA256 = digest(await readFile(outputPath));
checkpoint.dataSHA256After = dataHashesAfter;
await atomicJSON(manifestPath, checkpoint);
console.log(JSON.stringify({ ...summary, gate, output: outputPath, manifest: manifestPath }));
if (!gate.passed)
    process.exitCode = 2;
