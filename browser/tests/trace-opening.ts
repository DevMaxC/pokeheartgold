import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadData,newState,createMon,giveMon} from '../src/source/data.ts';
import {ScriptVM,type ScriptHooks} from '../src/source/script.ts';
import {FieldObjects} from '../src/source/objects.ts';
import {movementAction} from '../src/source/movement.ts';
import {sourceJSON,type SourceMap} from '../src/source/types.ts';

globalThis.fetch=async input=>new Response(await readFile(new URL('../public'+String(input),import.meta.url)));
export async function openingFixture(options:{starter?:number;gender?:'boy'|'girl';battleWon?:boolean;motherSaving?:boolean;log?:boolean}={}){
const data=await loadData(),state=newState(data,options.gender==='girl'?'Lyra':'Ethan',options.gender||'boy'),objects=new FieldObjects(data,state);let current:SourceMap,currentStep='',tutorials=0;const messages:string[]=[],battles:{id:number;canLose:boolean}[]=[],checkpoints:Record<string,typeof state>={};
const deltas=[[0,-1],[0,1],[-1,0],[1,0]];
const hooks:ScriptHooks={message:async text=>{messages.push(text);},choice:async()=>currentStep==='Mother savings'&&options.motherSaving===false?1:0,coordinates:id=>{const n=objects.get(id);return n?{x:Math.floor(n.x),z:Math.floor(n.z)}:{x:255,z:255};},nameRival:async()=>'Silver',whiteOut:async()=>{},catchingTutorial:async()=>{tutorials++;},move:async(object,label,map)=>{
  for(let pc=map.scripts.labels[label];pc<map.scripts.instructions.length;pc++){const [command,args]=map.scripts.instructions[pc],action=movementAction(command,args);if(action.end)break;
    if(object==='obj_player'){if(action.facing!==null){state.facing=action.facing;state.x+=deltas[action.facing][0]*action.distance*action.repeats;state.z+=deltas[action.facing][1]*action.distance*action.repeats;}}
    else if(object!=='obj_partner_poke'){const actor=objects.get(object);if(!actor)throw Error('Missing source actor '+object);if(action.facing!==null){actor.facingDirection=action.facing;actor.x+=deltas[action.facing][0]*action.distance*action.repeats;actor.z+=deltas[action.facing][1]*action.distance*action.repeats;}}
  }
},position:(id,x,z,facing)=>{if(id==='obj_player'){state.x=x+.5;state.z=z+.5;if(facing!==undefined)state.facing=facing;}else objects.position(id,x,z,facing);},face:()=>{},visible:(id,visible)=>objects.show(id,visible),chooseStarter:async()=>{giveMon(state,createMon(data,options.starter||155,5,state.name,()=>.5));},nickname:async()=>{},refresh:async()=>{},battle:async(id,settings)=>{battles.push({id,canLose:!!settings?.canLose});return options.battleWon!==false;},warp:async()=>{}};
const vm=new ScriptVM(data,state,hooks);
const steps:[string,number,number,number,number][]=[
  ['Mother introduction',63,1,3,3],['Marill introduction',60,4,695,397],['Elm introduction',61,12,4,10],['Starter device',61,13,8,5],['Aide gift',61,4,4,11],['Friend meets starter',60,9,684,394],['Mother Pokégear',63,2,8,4],['West exit',60,3,676,400],['Cherrygrove guide',67,2,566,398],['Map Card',67,3,549,385],['Apricorn man',34,3,559,354],['Mr. Pokémon and Oak',143,2,5,6],['Elm panic call',34,2,553,291],['Rival battle',67,4,575,399],['Police and Egg delivery',61,3,4,10],['Mother savings',63,2,8,4],['Catching demonstration',33,2,666,399],
];
for(const [title,id,entry,x,z]of steps){
  currentStep=title;state.x=x+.5;state.z=z+.5;
  if(current?.id!==id){current=await sourceJSON<SourceMap>(`maps/${id}.json`);state.map=id;objects.load(current.events.objects);for(const event of ['OnTransition','OnResume','OnLoad'])if(current.initScripts[event])await vm.run(current,current.initScripts[event]);}
  state.x=x+.5;state.z=z+.5;
  await vm.run(current,entry);state.objectEvents=objects.save(id);checkpoints[title]=structuredClone(state);if(options.log)console.log('PASS',title,{party:state.party.length,position:[state.x,state.z]});
}

return {state,data,objects,vm,messages,battles,checkpoints,tutorials};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await openingFixture({log:true}),out=process.argv.indexOf('--export');if(out>=0)await writeFile(process.argv[out+1],JSON.stringify(result.checkpoints));}
