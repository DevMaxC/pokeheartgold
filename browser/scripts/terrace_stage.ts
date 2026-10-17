import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export type TerraceGeneration={matrix:number;inputs:Record<string,string|null>};
/** Exact source inputs used by the Python solve, including absent optional
 * floors/foundations and the full native cliff-asset inventory. */
export async function currentTerraceGeneration(browser:URL,matrix:number):Promise<TerraceGeneration>{
 const matrixPath=`public/source/matrices/${matrix}.json`,data=JSON.parse(await readFile(new URL(matrixPath,browser),'utf8'));
 const paths=['scripts/export_terraces.py','scripts/ledge_corner_topology.py',matrixPath,`public/source/terraces/foundations-${matrix}.json`,...[...new Set<number>(data.models)].filter(id=>id!==65535).map(id=>`public/source/lands/${id}.json`),...(await readdir(new URL('public/source/land/',browser))).filter(name=>name.endsWith('.glb')).sort().map(name=>'public/source/land/'+name)];
 const inputs:Record<string,string|null>={};for(const path of paths){try{inputs[path]=createHash('sha256').update(await readFile(new URL(path,browser))).digest('hex');}catch(error){if((error as {code?:string}).code!=='ENOENT'||!/^public\/source\/(lands\/\d+\.json|terraces\/foundations-\d+\.json)$/.test(path))throw error;inputs[path]=null;}}
 return{matrix,inputs};
}
export async function assertFreshTerraceGeneration(browser:URL,matrix:number,proof:TerraceGeneration|undefined){
 if(!proof||proof.matrix!==matrix||!proof.inputs)throw Error('Missing terrace generation source proof; rerun export_terraces.py');
 const actual=await currentTerraceGeneration(browser,matrix),paths=[...new Set([...Object.keys(actual.inputs),...Object.keys(proof.inputs)])];
 for(const path of paths)if(actual.inputs[path]!==proof.inputs[path])throw Error('Stale terrace stage input '+path+'; rerun export_terraces.py');
}
