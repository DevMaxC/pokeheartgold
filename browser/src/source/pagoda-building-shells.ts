import * as THREE from 'three';
import type {BuildingEntrance} from './render-repair.ts';

export type PagodaBuildingShell={family:'bell-tower'|'sprout-tower';preservedRoofs:number;removedPanels:number;triangles:0};
const profiles={9:{family:'bell-tower',roof:'en_suzu1',wall:'en_suzu2',eaves:[57,95.703125,133.875,172.78125,211.5625,250.34375,289.84375,329.328125,368.640625]},54:{family:'sprout-tower',roof:'kk_mada_a',wall:'kk_mada_b',eaves:[57,95.703125,134.953125]}} as const;
const near=(a:number,b:number)=>Math.abs(a-b)<.035;

/** EN_SUZU and KK_MADA already contain every rear wall and all their complete
 * projecting roofs. A generic entrance silhouette mistakenly stretches the
 * complete tower height into one flat rear panel, masking the authored
 * pagoda. Preserve those native tiers; remove only that added panel.
 * No replacement geometry, materials, textures or roof boxes are necessary. */
export function closePagodaBuildingShell(root:THREE.Object3D,asset:string,_doors:BuildingEntrance[]=[]):PagodaBuildingShell|null{
 const match=asset.match(/(?:^|\/)1-(9|54)-\d+\.glb$/);if(!match)return null;const profile=profiles[Number(match[1]) as 9|54],eaves:readonly number[]=profile.eaves;
 const previous=root.userData.pagodaBuildingShell as PagodaBuildingShell|undefined;if(previous)return previous;
 root.updateWorldMatrix(true,true);root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),rearRoofs=new Set<number>();let rearBody=false;
 root.traverse(object=>{
  if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||!object.visible||object.name.startsWith('3d-')||object.name==='entrance-rear-wall')return;
  const g=object.geometry,p=g.getAttribute('position'),index=g.index,materials=Array.isArray(object.material)?object.material:[object.material];
  for(const group of g.groups.length?g.groups:[{start:0,count:index?.count??p.count,materialIndex:0}]){
   const material=materials[group.materialIndex??0];if(!material.visible||material.opacity<.5||material.name!==profile.roof&&material.name!==profile.wall)continue;
   for(let i=group.start;i<group.start+group.count;i+=3){const points=[0,1,2].map(j=>object.getVertexPosition(index?index.getX(i+j):i+j,new THREE.Vector3()).applyMatrix4(object.matrixWorld).applyMatrix4(inverse));
    if(material.name===profile.roof&&points.every(q=>q.z<=.001)&&points.some(q=>q.z<-45))for(const y of eaves)if(points.some(q=>near(q.y,y)))rearRoofs.add(y);
    if(material.name===profile.wall&&points.every(q=>near(q.z,-38))&&points.some(q=>near(q.y,8))&&points.some(q=>near(q.y,33.84375)))rearBody=true;
   }
  }
 });
 // A changed or incomplete source variant must not lose its fallback cap.
 if(rearRoofs.size!==eaves.length||!rearBody)return null;
 let removedPanels=0;root.traverse(object=>{if(object instanceof THREE.Mesh&&object.name==='entrance-rear-wall'&&object.visible){object.visible=false;removedPanels++;}});
 const summary:PagodaBuildingShell={family:profile.family,preservedRoofs:eaves.length,removedPanels,triangles:0};root.userData.pagodaBuildingShell=summary;return summary;
}
