/** Local receiver for frames rendered by the T3-controlled inspection gallery.
 * No browser automation runs here. Bind localhost only; never deploy this tool.
 * node --experimental-transform-types scripts/building_gallery_capture_server.ts <immutable-commit> [output-folder] [port]
 * Add --exploratory for explicitly uncommitted diagnostic frames, never approvals.
 */
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const browser=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(browser,'..');
const revision=process.argv[2],output=resolve(process.argv[3]??resolve(browser,'reviews/building-gallery',revision??'missing-revision')),port=Number(process.argv[4]??5186),exploratory=process.argv.includes('--exploratory');
if(!revision||!/^[a-f\d]{40}$/.test(revision))throw Error('Pass the full immutable renderer commit SHA.');
const currentRevision=()=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(currentRevision()!==revision)throw Error(`HEAD ${currentRevision()} differs from requested capture revision ${revision}.`);
const plan=JSON.parse(await readFile(resolve(browser,'reviews/building-gallery-plan.json'),'utf8'));
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const currentHashes=async()=>{
 const graph=new Set<string>();async function visit(name:string){if(graph.has(name))return;graph.add(name);const path=resolve(browser,'src/source',name),code=await readFile(path,'utf8');for(const match of code.matchAll(/\b(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){const dependency=resolve(dirname(path),match[1]);if(dependency.endsWith('.ts')&&dependency.startsWith(resolve(browser,'src/source')+'/'))await visit(dependency.slice(resolve(browser,'src/source').length+1));}}
 await visit('building-gallery.ts');return Object.fromEntries(await Promise.all([...graph].sort().map(async name=>[name,sha(await readFile(resolve(browser,'src/source',name)))])));
};
const frozenHashes=await currentHashes();
if(!exploratory&&JSON.stringify(frozenHashes)!==JSON.stringify(plan.rendererSourceHashes))throw Error('Capture plan renderer hashes are stale. Regenerate the gallery inventory and plan before committing the immutable candidate.');
// Prove that these renderer bytes are part of the supplied immutable commit,
// rather than merely hashing a dirty working tree and calling that a release.
for(const [name,hash]of Object.entries(exploratory?{}:frozenHashes)){
 const committed=execFileSync('git',['show',`${revision}:browser/src/source/${name}`],{cwd:root,maxBuffer:20*1024*1024});
 if(sha(committed)!==hash)throw Error(`Uncommitted renderer bytes: ${name}. Commit before capturing.`);
}
const assertFrozen=async()=>{if(!exploratory&&(currentRevision()!==revision||JSON.stringify(await currentHashes())!==JSON.stringify(frozenHashes)))throw Error('Renderer revision changed during capture. Start a new immutable capture batch.');};
await mkdir(output,{recursive:true});
const manifest={version:1,status:exploratory?'Exploratory working renderer; no immutable release or approval claim.':'Immutable committed renderer.',rendererCommit:revision,rendererIsCommitted:!exploratory,rendererSourceHashesAtReceiverStart:frozenHashes,nativeDataSourceCommit:plan.nativeDataSourceCommit,planSHA256:sha(await readFile(resolve(browser,'reviews/building-gallery-plan.json'))),createdAt:new Date().toISOString(),method:'Actual WebGL renderer PNGs, rendered and controlled exclusively through T3 preview. One exact native placement per row; six source cameras per row. This receiver only verifies and stores frames.',expectedPlacements:plan.placements,expectedPages:plan.pageCount,views:plan.views,captures:[]as any[]};
const manifestPath=resolve(output,'capture-manifest.json');
try{await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});}catch{throw Error(`Capture folder already has a manifest: ${output}. Use a new folder; existing evidence stays immutable.`);}
await writeFile(resolve(output,'capture-plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
const flush=async()=>{const path=manifestPath+'.tmp';await writeFile(path,JSON.stringify(manifest,null,2)+'\n');await rename(path,manifestPath);};
const allowedOrigins=new Set(['http://127.0.0.1:5185','http://localhost:5185']);
function respond(response:ServerResponse,status:number,value:unknown){response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(value));}
async function body(request:IncomingMessage){let size=0;const chunks:Buffer[]=[];for await(const part of request){const bytes=Buffer.from(part);size+=bytes.length;if(size>16*1024*1024)throw Error('Frame payload exceeds 16 MB.');chunks.push(bytes);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
let writing=false;
const server=createServer(async(request,response)=>{
 const origin=request.headers.origin;if(origin&&!allowedOrigins.has(origin)){respond(response,403,{error:'This inspection receiver accepts only the local gallery origin.'});return;}
 if(origin)response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Access-Control-Allow-Headers','Content-Type');response.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
 if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
 try{
  if(request.method==='GET'&&request.url==='/status'){await assertFrozen();respond(response,200,{rendererCommit:revision,output,pages:manifest.captures.length,expectedPages:manifest.expectedPages});return;}
  if(request.method!=='POST'||request.url!=='/capture'){respond(response,404,{error:'Unknown receiver endpoint.'});return;}
  if(writing){respond(response,409,{error:'A frame is already being stored. Send captures sequentially.'});return;}writing=true;
  try{
   await assertFrozen();const payload=await body(request),allItems=plan.pages.flatMap((p:any)=>p.items),page=exploratory?{id:payload.name,items:(payload.items??[]).map((item:any)=>{const match=allItems.find((known:any)=>known.asset===item.asset&&known.placement===item.placement);if(!match)throw Error('Unknown exploratory placement.');return match;})}:plan.pages[payload.page];if(!page||!/^[a-z\d_-]{1,90}$/.test(page.id)||!page.items.length||page.items.length>6)throw Error('Unknown capture page or invalid exploratory name.');
   if(manifest.captures.some(c=>c.id===page.id))throw Error('This page already has immutable evidence.');
   if(!exploratory&&payload.mode!=='candidate')throw Error('Frozen batch requires the runtime dispatcher candidate mode.');
   if(!exploratory&&payload.views?.some((view:any)=>view.camera?.projection!=='orthographic'))throw Error('Frozen six-view batch requires the standard orthographic cameras; perspective diagnostics are separate exploratory evidence.');
   if(!['candidate','source','repaired'].includes(payload.mode))throw Error('Unknown renderer mode.');
   const expected=page.items.flatMap((item:any)=>plan.views.map((view:string)=>({asset:item.asset,placement:item.placement,view})));
   const actual=(payload.views??[]).map((v:any)=>({asset:v.asset,placement:v.placement,view:v.view}));if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Frame assets, placements or cameras differ from the capture plan.');
   for(const view of payload.views){const item=page.items.find((item:any)=>item.asset===view.asset&&item.placement===view.placement);if(JSON.stringify(view.assemblies??[])!==JSON.stringify((item.assemblies??[]).map((part:any)=>part.asset)))throw Error('Rendered native assembly differs from the plan.');if(!Array.isArray(view.attachments)||view.attachments.some((asset:string)=>!(item.attachments??[]).some((part:any)=>part.asset===asset)))throw Error('Rendered attachment is absent from the native placement candidates.');}
   for(const item of page.items)for(const part of [item,...item.assemblies??[],...item.attachments??[]]){const bytes=await readFile(resolve(browser,'public/source',part.asset));if(sha(bytes)!==part.assetSHA256)throw Error(`Native asset changed: ${part.asset}`);}
   if(typeof payload.png!=='string'||!payload.png.startsWith('data:image/png;base64,'))throw Error('Expected the actual PNG canvas export.');const png=Buffer.from(payload.png.slice(22),'base64');
   if(png.length<24||png.readUInt32BE(0)!==0x89504e47||png.readUInt32BE(4)!==0x0d0a1a0a)throw Error('Frame is not a PNG.');
   const width=png.readUInt32BE(16),height=png.readUInt32BE(20);if(!exploratory&&(width<1440||height<1440||Math.abs(width-height)>4))throw Error(`Frozen contact sheet must be square with at least 240 pixels per view; got ${width}×${height}.`);
   await assertFrozen();const filename=page.id+'.png',path=resolve(output,filename);await writeFile(path,png,{flag:'wx'});
   const record={page:payload.page??null,id:page.id,artifact:path,sha256:sha(png),bytes:png.length,width,height,capturedAt:payload.capturedAt,receivedAt:new Date().toISOString(),mode:payload.mode,rendererSourceHashesAtReceipt:exploratory?await currentHashes():frozenHashes,items:page.items,views:actual,renderedSceneParts:payload.views.map((view:any)=>({asset:view.asset,placement:view.placement,view:view.view,assemblies:view.assemblies,attachments:view.attachments,camera:view.camera}))};manifest.captures.push(record);await flush();
   respond(response,200,{page:payload.page,artifact:path,sha256:record.sha256,bytes:record.bytes,storedPages:manifest.captures.length});
  }finally{writing=false;}
 }catch(error){respond(response,400,{error:String(error)});}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({listening:`http://127.0.0.1:${port}`,rendererCommit:revision,output,expectedPages:manifest.expectedPages,expectedPlacements:manifest.expectedPlacements})));
