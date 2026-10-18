import * as THREE from 'three';
import {WorldEvolutionView,type EvolutionArt,type EvolutionField,type EvolutionFieldWorld} from './evolution-view.ts';
import type {BattleEvolutionScene,EvolutionMonSnapshot} from './battle-evolution-types.ts';

export function evolutionScene():BattleEvolutionScene{const before:EvolutionMonSnapshot={species:155,form:0,level:14,name:'Cyndaquil',gender:'male',id:0x12345678,personality:0xabcddcba,hp:34,maxHP:40,exp:2700,ivs:[1,2,3,4,5,6],evs:[0,0,0,0,0,0],nature:1,status:'',sleepTurns:0,moves:[{id:33,pp:30,maxPP:35}],stats:{atk:22,def:22,spatk:22,spdef:22,speed:22},friendship:80,heldItem:null,ot:'Gold'};return{flags:3,partyIndex:0,before,after:{...structuredClone(before),species:156,name:'Quilava',maxHP:45,hp:39},method:4,methodKey:'EVO_LEVEL',param:14};}
export function viewFixture(artPort?:(path:string,signal:AbortSignal)=>Promise<EvolutionArt>){
 const camera=new THREE.PerspectiveCamera(52,1,.05,140),target=new THREE.Vector3(12.5,3.9,9.5),actors=[new THREE.Group(),new THREE.Group()];actors[1].visible=false;let current=true;
 const field:EvolutionField={map:67,x:12.5,y:3,z:9.5,actors:actors.map(object=>({object,current:()=>current}))};
 const world:EvolutionFieldWorld={scene:new THREE.Scene(),camera,target,yaw:1.1,pitch:.45,distance:13,cells:new Map(),fieldEffect:null,battleStage:null,scriptCameraPosition:null};camera.position.set(20,9,16);camera.lookAt(target);
 const oldArt:EvolutionArt={texture:new THREE.Texture(),aspect:.8,uv:[.1,.05,.9,.95]},newArt:EvolutionArt={texture:new THREE.Texture(),aspect:1.2,uv:[0,0,1,1]},requests:string[]=[];
 const view=new WorldEvolutionView(world,()=>field,{art:artPort??(async path=>{requests.push(path);return path.includes('/155-')?oldArt:newArt;})});
 return{world,field,actors,view,requests,oldArt,newArt,stale(){current=false;}};
}
