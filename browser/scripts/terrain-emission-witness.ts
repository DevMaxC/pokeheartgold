/** Offline exact arithmetic receipts. This does not establish native terrain
 * authority: the independent auditor must supply literal admissible domains,
 * excluded native coverage and source-derived construction expressions. */
export type Exact = number | { n: string; d: string };
export type Expression = number | { op: '+' | '-' | '*' | '/'; a: Expression; b: Expression };
export type Vec3 = readonly [number, number, number];
export type Point2 = readonly [Exact, Exact];
type Q = { n: bigint; d: bigint };
type P = readonly [Q, Q];
const abs = (n: bigint) => n < 0n ? -n : n;
function q(n: bigint, d = 1n): Q {
 if (!d) throw Error('Zero rational denominator');
 if (d < 0n) { n = -n; d = -d; }
 let a = abs(n), b = d; while (b) [a, b] = [b, a % b];
 return { n: n / (a || 1n), d: d / (a || 1n) };
}
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const magnitude = (a: Q) => q(abs(a.n), a.d);
const compare = (a: Q, b: Q) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
const max = (a: Q, b: Q) => compare(a, b) >= 0 ? a : b;
const encoded = (a: Q) => ({ n: a.n.toString(), d: a.d.toString() });
function numberQ(x: number): Q {
 if (!Number.isFinite(x)) throw Error('Non-finite geometry');
 if (x === 0) return q(0n);
 const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, x);
 const bits = view.getBigUint64(0), exponent = Number((bits >> 52n) & 2047n), fraction = bits & ((1n << 52n) - 1n);
 const significand = (exponent ? (1n << 52n) : 0n) + fraction, shift = exponent ? exponent - 1075 : -1074;
 return q((bits >> 63n ? -1n : 1n) * significand * (shift >= 0 ? 1n << BigInt(shift) : 1n), shift < 0 ? 1n << BigInt(-shift) : 1n);
}
const exact = (x: Exact) => typeof x === 'number' ? numberQ(x) : q(BigInt(x.n), BigInt(x.d));
type Evaluation = { ideal: Q; actual: number };
function evaluate(expression: Expression, memo = new WeakMap<Exclude<Expression, number>, Evaluation>()): Evaluation {
 if (typeof expression === 'number') return { ideal: numberQ(expression), actual: expression };
 const cached = memo.get(expression); if (cached) return cached;
 const a = evaluate(expression.a, memo), b = evaluate(expression.b, memo);
 const ideal = ({ '+': add, '-': sub, '*': mul, '/': div }[expression.op])(a.ideal, b.ideal);
 const actual = expression.op === '+' ? a.actual + b.actual : expression.op === '-' ? a.actual - b.actual : expression.op === '*' ? a.actual * b.actual : a.actual / b.actual;
 if (!Number.isFinite(actual)) throw Error('Non-finite construction');
 const result = { ideal, actual }; memo.set(expression, result); return result;
}
const cross = (a: P, b: P, p: P) => sub(mul(sub(b[0], a[0]), sub(p[1], a[1])), mul(sub(b[1], a[1]), sub(p[0], a[0])));
const signed = (poly: P[]) => poly.reduce((area, p, i) => add(area, sub(mul(p[0], poly[(i + 1) % poly.length][1]), mul(p[1], poly[(i + 1) % poly.length][0]))), q(0n));
function clip(poly: P[], a: P, b: P, positive = true): P[] {
 const out: P[] = [];
 for (let i = 0; i < poly.length; i++) {
  const p = poly[i], next = poly[(i + 1) % poly.length];
  let d = cross(a, b, p), e = cross(a, b, next);
  if (!positive) { d = q(-d.n, d.d); e = q(-e.n, e.d); }
  if (d.n >= 0n) out.push(p);
  if ((d.n < 0n && e.n > 0n) || (d.n > 0n && e.n < 0n)) { const t = div(d, sub(d, e)); out.push([add(p[0], mul(sub(next[0], p[0]), t)), add(p[1], mul(sub(next[1], p[1]), t))]); }
 }
 return out;
}
function canonical(poly: P[]): P[] {
 if (poly.length < 3 || !signed(poly).n) throw Error('Degenerate proof polygon');
 if (signed(poly).n < 0n) poly = [...poly].reverse();
 for (let i = 0; i < poly.length; i++) for (const p of poly) if (cross(poly[i], poly[(i + 1) % poly.length], p).n < 0n) throw Error('Proof domains must be convex');
 return poly;
}
function intersection(poly: P[], other: P[]) { for (let i = 0; i < other.length && poly.length; i++) poly = clip(poly, other[i], other[(i + 1) % other.length]); return poly; }
function subtract(poly: P[], other: P[]) {
 const out: P[][] = [];
 for (let i = 0; i < other.length && poly.length; i++) {
  const outside = clip(poly, other[i], other[(i + 1) % other.length], false);
  if (outside.length >= 3 && signed(outside).n) out.push(outside);
  poly = clip(poly, other[i], other[(i + 1) % other.length]);
 }
 return out;
}
function hull(points: P[]): P[] {
 points = [...points].sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]));
 const half = (list: P[]) => { const out: P[] = []; for (const p of list) { while (out.length > 1 && cross(out[out.length - 2], out[out.length - 1], p).n <= 0n) out.pop(); out.push(p); } return out; };
 const lower = half(points), upper = half([...points].reverse()); return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
const contained = (poly: P[], domain: P[]) => poly.every(p => domain.every((a, i) => cross(a, domain[(i + 1) % domain.length], p).n >= 0n));
/** Exact construction inspection for offline native provenance replay. */
export function terrainExpressionValue(expression: Expression) { const value = evaluate(expression); return { ideal: encoded(value.ideal), actual: value.actual }; }
/** Retain exact overlap vertices instead of rounding away sub-texel witnesses. */
export function terrainExactIntersection(a: readonly Point2[], b: readonly Point2[]) {
 const first = canonical(a.map(p => [exact(p[0]), exact(p[1])] as P)), second = canonical(b.map(p => [exact(p[0]), exact(p[1])] as P));
 const polygon = intersection(first, second); return polygon.length >= 3 && signed(polygon).n ? polygon.map(p => p.map(encoded)) : [];
}
export type TerrainEmissionInput = {
 /** Exact source-derived arithmetic, in cell-local coordinates. No arbitrary
  * ideal points: the auditor must retain the native clipping provenance. */
 construction: readonly (readonly [Expression, Expression, Expression])[];
 rawLocal: readonly Vec3[];
 emittedWorld: readonly Vec3[];
 cellOrigin: Vec3;
 /** Current proof supports axis-aligned side planes. Other orientations are
  * explicitly unsupported, rather than projected into a fabricated plane. */
 projectedAxis: 0 | 2;
 nativePlane: { axis: 0 | 2; coordinate: Exact };
 /** Independent exact cell-local support/boundary domains and native art. */
 admittedDomains: readonly (readonly Point2[])[];
 excludedNative: readonly (readonly Point2[])[];
 /** Each strict overlap violation, in the same cell-local projection. */
 strictViolations: readonly (readonly Point2[])[];
 nativeAuthority: string;
};
export function terrainEmissionWitness(input: TerrainEmissionInput) {
 const reasons: string[] = [], coordinates: any[] = [], vertexCount = input.construction.length;
 const fail = (reason: string) => { if (!reasons.includes(reason)) reasons.push(reason); };
 try {
  if (!input.nativeAuthority || !input.admittedDomains.length) fail('No independent native admissibility authority');
  if (vertexCount < 3 || input.rawLocal.length !== vertexCount || input.emittedWorld.length !== vertexCount) throw Error('Mismatched construction/emission vertices');
  const memo = new WeakMap<Exclude<Expression, number>, Evaluation>();
  const ideal3 = input.construction.map(p => p.map(e => evaluate(e, memo))), axis = input.projectedAxis, fixed = axis === 0 ? 2 : 0;
  if (ideal3.some(p => compare(p[fixed].ideal, ideal3[0][fixed].ideal))) fail('Non-axis native plane requires a separate exact proof');
  if (input.nativePlane.axis !== fixed || ideal3.some(p => compare(p[fixed].ideal, exact(input.nativePlane.coordinate)))) fail('Intended polygon is outside the independently supplied literal native side plane');
  const intended = canonical(ideal3.map(p => [p[axis].ideal, p[1].ideal] as P));
  const admitted = input.admittedDomains.map(poly => canonical(poly.map(p => [exact(p[0]), exact(p[1])] as P)));
  const excluded = input.excludedNative.map(poly => canonical(poly.map(p => [exact(p[0]), exact(p[1])] as P)));
  let remainder = [intended]; for (const domain of admitted) remainder = remainder.flatMap(poly => subtract(poly, domain));
  if (remainder.some(poly => signed(poly).n)) fail('Intended polygon has pre-existing inadmissible support/domain area');
  if (excluded.some(poly => { const overlap = intersection(intended, poly); return overlap.length >= 3 && signed(overlap).n; })) fail('Intended polygon already overlaps literal native coverage');
  const bounds = [q(0n), q(0n), q(0n)];
  for (let i = 0; i < vertexCount; i++) for (let c = 0; c < 3; c++) {
   const value = ideal3[i][c], raw = input.rawLocal[i][c], emitted = input.emittedWorld[i][c], rounded = Math.fround(raw), expectedWorld = rounded + input.cellOrigin[c];
   if (raw !== value.actual) fail('Raw Float64 point does not match supplied source construction');
   if (emitted !== expectedWorld) fail('Emission is not nearest Float32 local encoding followed by world translation');
   const origin = numberQ(input.cellOrigin[c]), constructionError = magnitude(sub(numberQ(raw), value.ideal)), encodingError = magnitude(sub(numberQ(rounded), numberQ(raw))), translationError = magnitude(sub(numberQ(expectedWorld), add(numberQ(rounded), origin))), bound = add(add(constructionError, encodingError), translationError);
   bounds[c] = max(bounds[c], bound);
   coordinates.push({ vertex: i, coordinate: c, ideal: encoded(value.ideal), rawLocal: raw, roundedLocal: rounded, emittedWorld: emitted, constructionError: encoded(constructionError), encodingError: encoded(encodingError), worldTranslationError: encoded(translationError), bound: encoded(bound) });
  }
  // A projected overlap receipt cannot certify a polygon that left the actual
  // native side plane. Construction error in the fixed axis is not authority.
  if (input.emittedWorld.some(p => compare(sub(numberQ(p[fixed]), numberQ(input.cellOrigin[fixed])), exact(input.nativePlane.coordinate)))) fail('Actual emitted polygon leaves the independently supplied literal native side plane');
  const displaced: P[] = [];
  for (const p of intended) for (const x of [-1, 1]) for (const y of [-1, 1]) displaced.push([add(p[0], q(BigInt(x) * bounds[axis].n, bounds[axis].d)), add(p[1], q(BigInt(y) * bounds[1].n, bounds[1].d))]);
  const envelope = hull(displaced);
  const emitted = canonical(input.emittedWorld.map(p => [sub(numberQ(p[axis]), numberQ(input.cellOrigin[axis])), sub(numberQ(p[1]), numberQ(input.cellOrigin[1]))] as P));
  for (const raw of input.strictViolations) {
   const violation = canonical(raw.map(p => [exact(p[0]), exact(p[1])] as P));
   if (!contained(violation, emitted)) fail('Strict violation is not contained by the actual emitted polygon');
   if (!contained(violation, envelope)) fail('Strict violation extends outside the derived coordinate displacement envelope');
  }
  return { classification: reasons.length ? 'unclassified' : 'bounded-numerical-emission-diagnostic', eligible: reasons.length === 0, reasons, nativeAuthority: input.nativeAuthority, intendedAdmissible: !reasons.some(r => /Intended|admissibility|Non-axis/.test(r)), strictViolationCount: input.strictViolations.length, coordinates, projectedDisplacementEnvelope: envelope.map(p => p.map(encoded)), envelopeIsIndependentAuthority: false, scope: 'Exact arithmetic conditional receipt; strict overlaps remain. Envelope follows the supplied construction/emission errors and is not independent admissibility evidence. No zero-overlap, continuous-seal, visibility or whole-map approval.' };
 } catch (error) { fail(error instanceof Error ? error.message : String(error)); return { classification: 'unclassified', eligible: false, reasons, nativeAuthority: input.nativeAuthority, strictViolationCount: input.strictViolations.length, coordinates, scope: 'Incomplete/invalid exact emission proof; no numerical exemption.' }; }
}

/** Strict exact-area inspection. The caller supplies independent native
 * domains/negative coverage; this does not derive or waive their authority. */
export function terrainExactCoverage(candidate:readonly Point2[],domains:readonly(readonly Point2[])[],excluded:readonly(readonly Point2[])[]=[]){
 const clean=(p:P[])=>p.filter((v,i)=>compare(v[0],p[(i+1)%p.length][0])!==0||compare(v[1],p[(i+1)%p.length][1])!==0);const poly=canonical(clean(candidate.map(p=>[exact(p[0]),exact(p[1])]as P))),admitted=domains.map(d=>canonical(clean(d.map(p=>[exact(p[0]),exact(p[1])]as P))));let remaining=[poly];for(const domain of admitted)remaining=remaining.flatMap(p=>subtract(p,domain));const remainderArea=remaining.reduce((n,p)=>add(n,q(signed(p).n<0n?-signed(p).n:signed(p).n,signed(p).d*2n)),q(0n));
 const overlaps=excluded.map(d=>intersection(poly,canonical(clean(d.map(p=>[exact(p[0]),exact(p[1])]as P))))).filter(p=>p.length>=3&&signed(p).n);return{inside:remainderArea.n===0n,overlap:overlaps.length>0,remainingArea:encoded(remainderArea),remaining:remaining.map(poly=>poly.map(p=>p.map(encoded))),overlaps:overlaps.map(poly=>poly.map(p=>p.map(encoded)))};
}
