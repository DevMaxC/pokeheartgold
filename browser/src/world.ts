export type Point = { x: number; z: number };
export type Obstacle = Point & { radius: number };
export const WORLD = { minX: -88, maxX: 31, minZ: -35, maxZ: 33 };
export const BUILDINGS = [
  { x: 7, z: -13, width: 11, depth: 7, height: 4.5, roof: '#587e89', name: 'Professor Elm’s Lab', kind: 'lab' },
  { x: 16, z: 17, width: 7, depth: 6, height: 3.2, roof: '#c06d54', name: 'Your home', kind: 'home' },
  { x: -6, z: 17, width: 7, depth: 6, height: 3.2, roof: '#b87a58', name: 'A neighbor’s home', kind: 'neighbor' },
  { x: -9, z: -15, width: 7, depth: 6, height: 3.4, roof: '#668984', name: 'A quiet home', kind: 'neighbor' },
] as const;
export function groundHeight(x: number, z: number): number {
  const route = Math.max(0, Math.min(1, (-x - 24) / 20));
  return route * (1.1 + Math.sin(x * 0.065) * 0.55 + Math.sin(z * 0.12) * 0.3);
}
export function pathCenter(x: number): number { return 3 + Math.sin(Math.min(x + 17, 0) * 0.09) * 4; }
export function onPath(x: number, z: number): boolean {
  return Math.abs(z - pathCenter(x)) < 2.5 || (x > -16 && Math.abs(x - 5) < 2.7 && z > -12 && z < 23)
    || (x > -13 && x < 21 && z > 10 && z < 13);
}
export function isWater(x: number, z: number): boolean {
  return x > 31 + Math.sin(z * 0.15) * 1.4 || ((x + 66) ** 2 / 110 + (z + 22) ** 2 / 32 < 1);
}
export function canStand(x: number, z: number, obstacles: Obstacle[] = []): boolean {
  if (x < WORLD.minX || x > WORLD.maxX || z < WORLD.minZ || z > WORLD.maxZ || isWater(x, z)) return false;
  if (BUILDINGS.some(b => Math.abs(x - b.x) < b.width / 2 + 0.35 && Math.abs(z - b.z) < b.depth / 2 + 0.35)) return false;
  return !obstacles.some(o => (x - o.x) ** 2 + (z - o.z) ** 2 < (o.radius + 0.32) ** 2);
}
export function moveWithCollision(position: Point, dx: number, dz: number, obstacles: Obstacle[] = []): Point {
  // Substeps prevent tunneling when a tab stalls or a player sprints.
  let { x, z } = position;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  for (let i = 0; i < steps; i++) {
    if (canStand(x + dx / steps, z, obstacles)) x += dx / steps;
    if (canStand(x, z + dz / steps, obstacles)) z += dz / steps;
  }
  return { x, z };
}
export function movementVector(horizontal: number, forward: number, yaw: number): Point {
  const length = Math.hypot(horizontal, forward) || 1;
  const x = horizontal / length, z = -forward / length;
  return { x: x * Math.cos(yaw) + z * Math.sin(yaw), z: -x * Math.sin(yaw) + z * Math.cos(yaw) };
}
export function seededRandom(seed: number): () => number {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
