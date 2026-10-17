import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

/** Tests execute the byte-pinned original algorithm against the CURRENT
 * production field. Only module specifiers are relocated; no old-field proof
 * is promoted to candidate authority, and no baseline is bundled at runtime. */
export async function nativeTerraceBaseline(){
 const original=await readFile(new URL('../reviews/terrain-native-joints/terrace-model-before.ts.txt',import.meta.url),'utf8');
 if(createHash('sha256').update(original).digest('hex')!=='8517b3fda9e8d8cc7f678b34a4f29f40071de99d040370ca215ae4fde19f3632')throw Error('Original terrace algorithm fixture changed');
 const source=new URL('../src/source/',import.meta.url),directory=await mkdtemp(join(tmpdir(),'hg-native-terrace-before-')),file=join(directory,'baseline.mts');
 const code=original.replace(/from ['"]([^'"]+)['"]/g,(_all,specifier:string)=>`from '${specifier==='three'?import.meta.resolve('three'):new URL(specifier,source).href}'`);
 try{await writeFile(file,code);return(await import(pathToFileURL(file).href)).terraceModel as typeof import('../src/source/terrace-model.ts').terraceModel;}finally{await rm(directory,{recursive:true,force:true});}
}

/** Ownership-only diagnostic module. Tests must compare every emitted buffer
 * with the real uninstrumented function before consuming these labels. */
export async function tracedNativeTerrace(before=false){
 const source=new URL('../src/source/',import.meta.url),raw=before?await readFile(new URL('../reviews/terrain-native-joints/terrace-model-before.ts.txt',import.meta.url),'utf8'):await readFile(new URL('terrace-model.ts',source),'utf8');
 let code=raw;
 if(before)code=code.replace('color:a.color.clone().lerp(b.color,t)}','color:a.color.clone().lerp(b.color,t),bary:a.bary?.clone().lerp(b.bary!,t)}');
 if(!code.includes('activeSourceFace=-1'))code=code.replace('let work=0;','let work=0,activeSourceFace=-1;');
 if(!code.includes('activeSourceFace=i;'))code=code.replace('for(let i=start;i+2<end;i+=3){','for(let i=start;i+2<end;i+=3){activeSourceFace=i;');
 code=code.replace('triangle=[0,1,2].map(j=>vertex(index?index.getX(i+j):i+j));','triangle=[0,1,2].map(j=>({...vertex(index?index.getX(i+j):i+j),bary:new THREE.Vector3().setComponent(j,1)}));');
 const changes=[['colors:[] as number[]}','colors:[] as number[],owners:[] as number[],barys:[] as number[][]}'],['data.positions.push(...p.toArray());','data.positions.push(...p.toArray());data.owners.push(activeSourceFace/3);data.barys.push(v.bary?.toArray()??[]);'],["replacement.name='source-terrace-surface';","replacement.name='source-terrace-surface';replacement.userData.fixtureOriginalMesh=mesh.name;replacement.userData.fixtureFaceOwners=attributes.flatMap(d=>d.owners);replacement.userData.fixtureBary=attributes.flatMap(d=>d.barys);"]];
 for(const[from,to]of changes){if(code.split(from).length!==2)throw Error('Ownership-only instrumentation does not match exact runtime source');code=code.replace(from,to);}
 code=code.replace(/from ['"]([^'"]+)['"]/g,(_all,specifier:string)=>`from '${specifier==='three'?import.meta.resolve('three'):new URL(specifier,source).href}'`);
 const directory=await mkdtemp(join(tmpdir(),'hg-native-terrace-trace-')),file=join(directory,'trace.mts');
 try{await writeFile(file,code);return(await import(pathToFileURL(file).href)).terraceModel as typeof import('../src/source/terrace-model.ts').terraceModel;}finally{await rm(directory,{recursive:true,force:true});}
}
