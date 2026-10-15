import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canStand, moveWithCollision, movementVector, groundHeight, seededRandom } from './world.ts';
test('blocks buildings, shoreline, pond, and world boundaries', () => {
  for (const [x, z] of [[7, -13], [40, 0], [-66, -22], [-100, 0]]) assert.equal(canStand(x, z), false);
  assert.equal(canStand(9, 4), true);
});
test('movement slides along walls and cannot tunnel through a house', () => {
  const result = moveWithCollision({x: 7, z: 3}, 0, -30);
  assert.ok(result.z > -9.2);
  const slide = moveWithCollision({x: 7, z: -9.1}, 1, -1);
  assert.ok(slide.x > 7);
});
test('camera-relative movement normalizes diagonals and rotates correctly', () => {
  const diagonal = movementVector(1, 1, 0);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-8);
  const rotated = movementVector(0, 1, Math.PI / 2);
  assert.ok(Math.abs(rotated.x + 1) < 1e-8);
  assert.ok(Math.abs(rotated.z) < 1e-8);
});
test('scenery generation and terrain elevation are deterministic', () => {
  const a = seededRandom(29), b = seededRandom(29);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.equal(groundHeight(9, 4), 0);
  assert.ok(groundHeight(-60, 4) > 0);
});
