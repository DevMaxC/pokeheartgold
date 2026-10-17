import {readFile,mkdtemp,writeFile,rm}from'node:fs/promises';
import {tmpdir}from'node:os';
import {join}from'node:path';
import {pathToFileURL}from'node:url';
import {createHash}from'node:crypto';
/** Execute the exact production333 deformer and World. Only module URLs are
 * relocated; the baseline never imports the candidate deformer or new joint. */
export async function productionTerrainBaseline(baseline:'production333'|'campaign5298'='production333'){
 const source=new URL('../src/source/',import.meta.url),evidence=new URL('../reviews/native-terrain-deformation/',import.meta.url),deformer=await readFile(new URL(baseline==='campaign5298'?'campaign-integration/terrace-model-before-5298dc0c.ts.txt':'production-terrace-model-333423a4.ts.txt',evidence),'utf8'),world=await readFile(new URL(baseline==='campaign5298'?'campaign-integration/world-before-5298dc0c.ts.txt':'production-world-333423a4.ts.txt',evidence),'utf8');
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');if(sha(deformer)!==(baseline==='campaign5298'?'d4b0754f0603ac83ce4bcd2dbef9b286cb70a8a09239830e166cc8d1f5d568dc':'65375b1a2d33b8663774ec08e4c392454d8becc26d78956202c0ec7af71aadbc'))throw Error(baseline+' deformer fixture changed');
 if(sha(world)!==(baseline==='campaign5298'?'ca0699f0b3a544a8c48cbfdc375087e771700470d7c84e78581e7bab0c37ebdd':'09ba6bdeeacacf239c56484af19f5bc0e21be6f9e2ff4ddd97fc8ec2e9c380e5'))throw Error(baseline+' World fixture changed');
 const directory=await mkdtemp(join(tmpdir(),'hg-production-native-world-')),terraceFile=join(directory,'terrace.mts'),worldFile=join(directory,'world.mts');
 const relocate=(code:string,isWorld=false)=>code.replace(/from ['"]([^'"]+)['"]/g,(_all,specifier:string)=>`from '${isWorld&&specifier==='./terrace-model.ts'?pathToFileURL(terraceFile).href:specifier==='three'||specifier.startsWith('three/')?import.meta.resolve(specifier):new URL(specifier,source).href}'`);
 try{await writeFile(terraceFile,relocate(deformer));await writeFile(worldFile,relocate(world,true));return{terrace:await import(pathToFileURL(terraceFile).href)as typeof import('../src/source/terrace-model.ts'),OriginalWorld:(await import(pathToFileURL(worldFile).href)).OriginalWorld as typeof import('../src/source/world.ts').OriginalWorld,worldSHA256:sha(world),deformerSHA256:sha(deformer)};}finally{await rm(directory,{recursive:true,force:true});}
}
