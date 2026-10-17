/** Verify a complete gallery batch, without assigning visual verdicts.
 * node --experimental-transform-types scripts/validate_building_gallery_capture.ts <capture-folder>
 * --exploratory permits a complete working-tree diagnostic batch.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const browser=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(browser,'..');
if(!process.argv[2])throw Error('Pass the capture folder, containing capture-plan.json and capture-manifest.json.');
const folder=resolve(process.argv[2]),exploratory=process.argv.includes('--exploratory');
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const planBytes=await readFile(resolve(folder,'capture-plan.json')),manifestBytes=await readFile(resolve(folder,'capture-manifest.json'));
const plan=JSON.parse(planBytes.toString()),manifest=JSON.parse(manifestBytes.toString());
assert.equal(sha(planBytes),manifest.planSHA256,'The saved capture plan differs from the receiver plan.');
assert.equal(manifest.expectedPages,plan.pages.length);
assert.equal(manifest.expectedPlacements,plan.placements);
assert.equal(manifest.captures.length,plan.pages.length,'The batch is incomplete or contains unrelated diagnostic frames.');
if(!exploratory)assert.equal(manifest.rendererIsCommitted,true,'A final batch must use a committed renderer.');
const canonical=(value:Record<string,string>)=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
const hashes=manifest.rendererSourceHashesAtReceiverStart;
assert.equal(canonical(hashes),canonical(plan.rendererSourceHashes),'The plan was not prepared from this renderer graph.');
for(const [name,hash]of Object.entries(hashes)){
 if(!exploratory){const bytes=execFileSync('git',['show',`${manifest.rendererCommit}:browser/src/source/${name}`],{cwd:root,maxBuffer:20*1024*1024});assert.equal(sha(bytes),hash,`Renderer file is not in the recorded commit: ${name}`);}
 assert.equal(sha(await readFile(resolve(browser,'src/source',name))),hash,`Renderer changed after capture: ${name}`);
}
const seenPages=new Set<number>(),seenPlacements=new Set<string>(),nativeHashes=new Map<string,string>();
let pngBytes=0,viewCount=0;
for(const capture of manifest.captures){
 assert.ok(Number.isInteger(capture.page)&&capture.page>=0&&capture.page<plan.pages.length,'Every complete-batch frame needs its exact plan page index.');
 assert.ok(!seenPages.has(capture.page),'A page was captured twice.');seenPages.add(capture.page);
 const page=plan.pages[capture.page];
 assert.deepEqual(capture.items,page.items,'A captured placement/transform differs from the frozen plan.');
 assert.equal(capture.mode,'candidate','A complete candidate batch contains a non-candidate frame.');
 assert.equal(canonical(capture.rendererSourceHashesAtReceipt),canonical(hashes),'Renderer bytes changed within the batch.');
 const expectedViews=page.items.flatMap((item:any)=>plan.views.map((view:string)=>({asset:item.asset,placement:item.placement,view})));
 assert.deepEqual(capture.views,expectedViews,'Camera order or exact source placements differ from the plan.');
 assert.equal(capture.renderedSceneParts.length,expectedViews.length,'Actual rendered attachment/camera receipts are missing.');
 for(const [index,parts]of capture.renderedSceneParts.entries()){
  const expected=expectedViews[index],item=page.items.find((item:any)=>item.asset===expected.asset&&item.placement===expected.placement);
  assert.equal(parts.asset,expected.asset);assert.equal(parts.placement,expected.placement);assert.equal(parts.view,expected.view);
  assert.equal(parts.camera.projection,'orthographic','Perspective diagnostics cannot replace the six-view batch.');
  assert.deepEqual(parts.assemblies,(item.assemblies??[]).map((part:any)=>part.asset),'A native multipart assembly was omitted.');
  assert.ok(Array.isArray(parts.attachments)&&parts.attachments.every((asset:string)=>(item.attachments??[]).some((part:any)=>part.asset===asset)),'A rendered attachment is not a source placement candidate.');
 }
 const filename=basename(capture.artifact);assert.equal(filename,capture.id+'.png');
 const image=await readFile(resolve(folder,filename));assert.equal(sha(image),capture.sha256,`PNG changed: ${filename}`);
 assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(image.readUInt32BE(16),plan.canvas.width);assert.equal(image.readUInt32BE(20),plan.canvas.height);
 assert.equal(capture.width,plan.canvas.width);assert.equal(capture.height,plan.canvas.height);assert.equal(capture.bytes,image.length);
 pngBytes+=image.length;viewCount+=capture.views.length;
 for(const item of page.items){
  assert.ok(!seenPlacements.has(item.placement),'A source placement was rendered twice.');seenPlacements.add(item.placement);
  for(const part of [item,...item.assemblies??[],...item.attachments??[]]){if(!nativeHashes.has(part.asset))nativeHashes.set(part.asset,sha(await readFile(resolve(browser,'public/source',part.asset))));assert.equal(nativeHashes.get(part.asset),part.assetSHA256,`Native source asset changed: ${part.asset}`);}
 }
}
assert.equal(seenPlacements.size,plan.placements);assert.equal(viewCount,plan.placements*plan.views.length);
const report={version:1,status:'Capture completeness and provenance verified; manual visual verdicts remain separate.',validatedAt:new Date().toISOString(),rendererCommit:manifest.rendererCommit,rendererIsCommitted:manifest.rendererIsCommitted,manifestSHA256:sha(manifestBytes),planSHA256:sha(planBytes),rendererGraphSHA256:sha(canonical(hashes)),pages:seenPages.size,placements:seenPlacements.size,views:viewCount,pngBytes,nativeAssetsVerified:nativeHashes.size,projection:'orthographic',allPNGHashesVerified:true,workingRendererMatchesCapture:true,manualApprovalClaim:false};
await writeFile(resolve(folder,'capture-completeness.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
