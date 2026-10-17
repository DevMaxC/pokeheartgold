import {nativeUpwardJoinDomains,proveNativeUpwardJoin,type UpwardJoinInput} from './native-upward-joint-authority.ts';
import type {NativeJointFace,Point3} from './terrain-deformation-joint.ts';
export type NativeOwnedOutput={mesh:string;owner:number;p:readonly Point3[];bary:readonly(readonly number[])[]};
/** Ownership labels are diagnostic only. The caller must compare every output
 * buffer against the actual uninstrumented native pipeline before using them. */
export function nativeUpwardInputs(raw:readonly NativeJointFace[],actual:readonly NativeOwnedOutput[],cellOrigin:Point3,reliefSHA256:string){
 const edges=new Map<string,NativeJointFace[]>(),same=(a:Point3,b:Point3)=>a.every((n,i)=>n===b[i]);
 for(const face of raw)for(let i=0;i<3;i++){const edge=[face.p[i],face.p[(i+1)%3]].map(p=>JSON.stringify(p)).sort().join('|'),key=JSON.stringify([face.asset,face.sourceSHA256,face.placement,face.mesh,face.material,edge]);edges.set(key,[...edges.get(key)??[],face]);}
 const byOwner=new Map<string,NativeOwnedOutput[]>();for(const row of actual){const key=JSON.stringify([row.mesh,row.owner]);byOwner.set(key,[...byOwner.get(key)??[],row]);}
 const inputs:UpwardJoinInput[]=[];for(const faces of edges.values()){if(faces.length!==2)continue;const[a,b]=faces,common=a.p.filter(p=>b.p.some(q=>same(p,q)));if(common.length!==2)continue;
  const profile=(face:NativeJointFace)=>{const opposite=face.p.findIndex(p=>!common.some(q=>same(p,q))),out:(readonly[Point3,Point3])[]=[];for(const row of byOwner.get(JSON.stringify([face.mesh,face.triangleIndex]))??[])for(let j=0;j<3;j++){const k=(j+1)%3;if(row.bary[j][opposite]===0&&row.bary[k][opposite]===0&&!same(row.p[j],row.p[k]))out.push([row.p[j],row.p[k]]);}return out;};
  const input:UpwardJoinInput={first:a,second:b,profiles:[profile(a),profile(b)],cellOrigin,reliefSHA256};if(nativeUpwardJoinDomains(input).proved)inputs.push(input);
 }
 return inputs;
}
export function proveUpwardTriangle(inputs:readonly UpwardJoinInput[],candidate:readonly Point3[],existing:readonly(readonly Point3[])[]=[]){
 const matches=inputs.flatMap(input=>{const authority=nativeUpwardJoinDomains(input);if(!authority.proved||candidate.some(p=>p[authority.fixed!]!==authority.plane))return[];const excluded=existing.filter(tri=>tri.every(p=>p[authority.fixed!]===authority.plane)).map(tri=>tri.map(p=>[p[authority.axis!],p[1]]as const)).filter(tri=>{const[a,b,c]=tri;return(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])!==0;});return[{...proveNativeUpwardJoin(input,candidate,excluded),input}];});
 return{proved:matches.some(result=>result.proved),matches};
}
