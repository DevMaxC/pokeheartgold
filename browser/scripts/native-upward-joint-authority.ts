/** Offline UP↔UP authority, deliberately separate from the historical native
 * UP↔vertical chord-ribbon proof. Actual profiles must be independently read
 * from unchanged upward output in the byte-pinned native pipeline. */
import {createHash} from 'node:crypto';
import {terrainExpressionValue,terrainExactCoverage,type Exact,type Expression,type Point2} from './terrain-emission-witness.ts';
import type {Point3,NativeJointFace} from './terrain-deformation-joint.ts';
export type UpwardJoinInput={first:NativeJointFace;second:NativeJointFace;profiles:readonly[readonly(readonly[Point3,Point3])[],readonly(readonly[Point3,Point3])[]];cellOrigin:Point3;reliefSHA256:string};
const equal=(a:Point3,b:Point3)=>a.every((v,i)=>v===b[i]);
const binary=(op:'+'|'-'|'*'|'/',a:Expression,b:Expression):Expression=>({op,a,b});
const ideal=(e:Expression)=>terrainExpressionValue(e).ideal as Exact;
const fraction=(x:Exact)=>typeof x==='number'?terrainExpressionValue(x).ideal as {n:string;d:string}:x;
const compare=(a:Exact,b:Exact)=>{const x=fraction(a),y=fraction(b),d=BigInt(x.n)*BigInt(y.d)-BigInt(y.n)*BigInt(x.d);return d<0n?-1:d>0n?1:0;};
export function nativeUpwardJoinDomains(input:UpwardJoinInput){
 const{first:a,second:b,profiles,cellOrigin:o}=input;const fail=(reason:string)=>({proved:false,reason,domains:[]as Point2[][],nativeAuthority:''});
 if(!/^[a-f0-9]{64}$/.test(input.reliefSHA256)||a.asset!==b.asset||a.sourceSHA256!==b.sourceSHA256||a.placement!==b.placement||a.mesh!==b.mesh||a.triangleIndex===b.triangleIndex)return fail('Foreign native mesh/placement/data cannot lend upward-strip authority');
 if([a,b].some(f=>f.alphaMode!=='OPAQUE'||!/^[a-f0-9]{64}$/.test(f.sourceSHA256)||!/^land\//.test(f.asset)||!f.mesh||!f.placement||!Number.isInteger(f.triangleIndex)||f.triangleIndex<0||!/cliff|wall|peak|mount|slope|grass|ground|soil|earth/i.test(f.material)||/water|sea|pond|river|bridge|hashi|flower|tree|bush|shadow|kage/i.test(f.material))||a.material!==b.material)return fail('Two same-material opaque original geological faces are required');
 const common=a.p.filter(p=>b.p.some(q=>equal(p,q)));if(common.length!==2)return fail('No exact complete shared raw edge');const[u,v]=common,axis=u[0]!==v[0]?0:2,fixed=axis===0?2:0;if(u[fixed]!==v[fixed]||u[axis]===v[axis])return fail('Only native axis edges are supported');
 const orientation=(f:NativeJointFace)=>{const[p,q,r]=f.p;return(q[2]-p[2])*(r[0]-p[0])-(q[0]-p[0])*(r[2]-p[2]);};const side=(f:NativeJointFace)=>{const p=f.p.find(p=>!common.some(q=>equal(p,q)))!;return(v[0]-u[0])*(p[2]-u[2])-(v[2]-u[2])*(p[0]-u[0]);};if(orientation(a)<=0||orientation(b)<=0||side(a)*side(b)>=0)return fail('Native upward faces must adjoin on opposite sides');
 const min=Math.min(u[axis],v[axis])-o[axis],max=Math.max(u[axis],v[axis])-o[axis],plane=u[fixed]-o[fixed];
 if(profiles.some(p=>!p.length||p.some(s=>s.some(p=>p[fixed]!==plane||p[axis]<min||p[axis]>max)||s[0][axis]===s[1][axis])))return fail('Actual profile leaves its literal source edge');
 const cuts=[...new Set(profiles.flatMap(p=>p.flatMap(s=>s.map(v=>v[axis]))))].sort((a,b)=>a-b);if(cuts[0]!==min||cuts.at(-1)!==max)return fail('Actual profiles do not cover the whole raw edge');
 const height=(s:readonly[Point3,Point3],t:number)=>ideal(binary('+',s[0][1],binary('*',binary('-',s[1][1],s[0][1]),binary('/',binary('-',t,s[0][axis]),binary('-',s[1][axis],s[0][axis])))));
 const domains:Point2[][]=[];for(let i=0;i<cuts.length-1;i++){const lo=cuts[i],hi=cuts[i+1],sample=(p:typeof profiles[number])=>{const spans=p.filter(s=>Math.min(s[0][axis],s[1][axis])<=lo&&Math.max(s[0][axis],s[1][axis])>=hi);if(!spans.length)return null;const y=[height(spans[0],lo),height(spans[0],hi)];return spans.every(s=>compare(height(s,lo),y[0])===0&&compare(height(s,hi),y[1])===0)?y:null;};const x=sample(profiles[0]),y=sample(profiles[1]);if(!x||!y)return fail('Incomplete or ambiguous actual upward branch');const d=x.map((p,j)=>compare(p,y[j]));if(d[0]*d[1]<0)return fail('Crossing branches require a separate exact construction');if(d.every(v=>v===0))continue;const upper=d.some(v=>v>0)?x:y,lower=upper===x?y:x;domains.push([[lo,upper[0]],[hi,upper[1]],[hi,lower[1]],[lo,lower[0]]]);}
 const nativeAuthority=createHash('sha256').update(JSON.stringify(input)).digest('hex');return{proved:domains.length>0,reason:domains.length?'':'No missing upward strip',domains,nativeAuthority,axis,fixed,plane};
}
export function proveNativeUpwardJoin(input:UpwardJoinInput,candidate:readonly Point3[],excluded:readonly(readonly Point2[])[]=[]){const authority=nativeUpwardJoinDomains(input);if(!authority.proved||candidate.some(p=>p[authority.fixed!]!==authority.plane))return{proved:false,reason:authority.reason||'Candidate left the exact native side plane',authority};const coverage=terrainExactCoverage(candidate.map(p=>[p[authority.axis!],p[1]]as Point2),authority.domains,excluded);return{proved:coverage.inside&&!coverage.overlap,coverage,authority};}
