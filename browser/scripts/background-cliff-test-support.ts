import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

/** Test-only byte qualification of the three authorized integration edits. */
export function withoutBackgroundCliffIntegration(code:string){
 return code.replace("import {backgroundCliffShell} from './background-cliff-shells.ts';\n",'')
 .replace("'source-background-foundation','source-background-cliff-shell'","'source-background-foundation'")
 .replace("        if(!this.terrainSceneryEnabled&&matrixID===0&&owner===0&&landID===210&&(cell.x===21&&cell.z===10&&cell.altitude===14||cell.x===22&&cell.z===11&&cell.altitude===4||cell.x===23&&cell.z===11&&cell.altitude===6)){\n          const shell=backgroundCliffShell(group,cell,matrix,land,await this.land(208),await doors(),terraces??undefined,await this.asset('land/112-9.glb'));if(shell)group.add(shell);\n        }\n",'');
}

/** Run the exact old production World, relocating only module URLs. */
export async function backgroundCliffBeforeWorld(){
 const code=await readFile(new URL('../reviews/background-cliff-shells/source/world-before-1f83.ts.txt',import.meta.url),'utf8');
 if(createHash('sha256').update(code).digest('hex')!=='f9fd0e75a55c95a9f4baac426aa8b2ab25cb5e137b3cf3131c0e9806d726d79d')throw Error('Original 1f83 World fixture changed');
 const directory=await mkdtemp(join(tmpdir(),'hg-background-before-')),file=join(directory,'world.mts'),source=new URL('../src/source/',import.meta.url);
 const relocated=code.replace(/from ['"]([^'"]+)['"]/g,(_all,specifier:string)=>`from '${specifier==='three'||specifier.startsWith('three/')?import.meta.resolve(specifier):new URL(specifier,source).href}'`);
 try{await writeFile(file,relocated);return(await import(pathToFileURL(file).href)).OriginalWorld as typeof import('../src/source/world.ts').OriginalWorld;}finally{await rm(directory,{recursive:true,force:true});}
}

/** Exact reviewed281 helper as a test-only visual-art negative control. */
export async function backgroundCliffPreviousShell(version:'281'|'982'='281'){
 const code=await readFile(new URL('../reviews/background-cliff-cladding/source/helper-before-'+version+'.ts.txt',import.meta.url),'utf8');if(createHash('sha256').update(code).digest('hex')!==(version==='281'?'5a741c3cbe6836facd165bd0e9fd33da89248da88e0c14d743cd87578a13d7ca':'4f4fa230011efab1ecb4452cb1d32c5e9a2ada95e7533aa8490d9bbc20bc93eb'))throw Error('Original'+version+' helper changed');
 const directory=await mkdtemp(join(tmpdir(),'hg-cliff-old-art-')),file=join(directory,'shell.mts'),source=new URL('../src/source/',import.meta.url),relocated=code.replace(/from ['"]([^'"]+)['"]/g,(_all,specifier:string)=>`from '${specifier==='three'||specifier.startsWith('three/')?import.meta.resolve(specifier):new URL(specifier,source).href}'`);
 try{await writeFile(file,relocated);return(await import(pathToFileURL(file).href)).backgroundCliffShell as typeof import('../src/source/background-cliff-shells.ts').backgroundCliffShell;}finally{await rm(directory,{recursive:true,force:true});}
}
