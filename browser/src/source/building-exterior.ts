import type * as THREE from 'three';
import {closeBuildingBack,type BuildingEntrance} from './render-repair.ts';
import {closeHouseBuildingShell} from './house-building-shells.ts';
import {closeSpecialBuildingShell} from './special-building-shells.ts';
import {closeLandmarkBuildingShell} from './landmark-building-shells.ts';
import {closeCivicBuildingShell} from './civic-building-shells.ts';
import {closeStationBuildingShell} from './station-building-shells.ts';
import {closeBurnedTowerShell} from './burned-tower-shells.ts';
import {closeUrbanBuildingShell} from './urban-building-shells.ts';
import {closeFacilityBuildingShell} from './facility-building-shells.ts';
import {closeGymBuildingShell} from './gym-building-shells.ts';
import {closeMiscBuildingShell} from './misc-building-shells.ts';
import {closeIndustrialBuildingShell} from './industrial-building-shells.ts';
import {closePagodaBuildingShell} from './pagoda-building-shells.ts';
import {closePokeathlonBuildingShell} from './pokeathlon-building-shells.ts';
import {closeShrineBuildingShell} from './shrine-building-shells.ts';
import {closeDecorativeBuildingShell} from './decorative-building-shells.ts';
import {closeSmallBuildingShell} from './small-building-shells.ts';
import {closeGateBuildingShell} from './gate-building-shells.ts';
import {closeLandmarkAnnexShell} from './landmark-annex-shells.ts';
import {closeFrontierBuildingShell} from './frontier-building-shells.ts';
import {closeNameRaterGameBuildingShell} from './name-rater-game-building-shells.ts';
import {closeAquaticGateBuildingShell} from './aquatic-gate-building-shells.ts';

export type BuildingExterior={genericPanels:number;generatedGenericPanels:number;family:'house'|'special'|'landmark'|'civic'|'station'|'burned-tower'|'urban'|'facility'|'gym'|'misc'|'industrial'|'pagoda'|'pokeathlon'|'shrine'|'decorative'|'small'|'gate'|'landmark-annex'|'frontier'|'name-rater-game'|'aquatic-gate'|null};
const resourcePrefixes=['house-','special-building-','landmark-building-','civic-building-','station-building-','burned-tower-','urban-building-','facility-building-','gym-building-','misc-building-','industrial-building-','pagoda-building-','pokeathlon-building-','shrine-building-','decorative-building-','small-building-','gate-building-','landmark-annex-','frontier-building-','name-rater-game-building-','aquatic-gate-building-'];

/** Run on the placed clone, after its source transform and before terrain
 * footings. The gallery, audit and game share this exact repair order. Family
 * shells hide the old mirrored caps; the generic pass must not run after them. */
export function closeBuildingExterior(root:THREE.Object3D,asset:string,doors:BuildingEntrance[]):BuildingExterior{
  const previous=root.userData.buildingExterior as BuildingExterior|undefined;if(previous)return previous;
  const generatedGenericPanels=closeBuildingBack(root,doors);
  let family:BuildingExterior['family']=null;
  if(closeHouseBuildingShell(root,asset,doors))family='house';
  else if(closeSpecialBuildingShell(root,asset,doors))family='special';
  else if(closeLandmarkBuildingShell(root,asset,doors))family='landmark';
  else if(closeCivicBuildingShell(root,asset,doors))family='civic';
  else if(closeStationBuildingShell(root,asset,doors))family='station';
  else if(closeBurnedTowerShell(root,asset,doors))family='burned-tower';
  else if(closeUrbanBuildingShell(root,asset,doors))family='urban';
  else if(closeFacilityBuildingShell(root,asset,doors))family='facility';
  else if(closeGymBuildingShell(root,asset,doors))family='gym';
  else if(closeMiscBuildingShell(root,asset,doors))family='misc';
  else if(closeIndustrialBuildingShell(root,asset,doors))family='industrial';
  else if(closePagodaBuildingShell(root,asset,doors))family='pagoda';
  else if(closePokeathlonBuildingShell(root,asset,doors))family='pokeathlon';
  else if(closeShrineBuildingShell(root,asset,doors))family='shrine';
  else if(closeDecorativeBuildingShell(root,asset,doors))family='decorative';
  else if(closeSmallBuildingShell(root,asset,doors))family='small';
  else if(closeGateBuildingShell(root,asset,doors))family='gate';
  else if(closeLandmarkAnnexShell(root,asset,doors))family='landmark-annex';
  else if(closeFrontierBuildingShell(root,asset,doors))family='frontier';
  else if(closeNameRaterGameBuildingShell(root,asset,doors))family='name-rater-game';
  else if(closeAquaticGateBuildingShell(root,asset,doors))family='aquatic-gate';
  let genericPanels=0;root.traverseVisible(object=>{if(object.name==='entrance-rear-wall')genericPanels++;});
  return root.userData.buildingExterior={genericPanels,generatedGenericPanels,family};
}

/** Only these per-placement meshes own their buffers and material clones.
 * Source/template geometry and all texture maps remain shared. */
export function ownsBuildingExteriorResources(name:string){
  return name==='entrance-rear-wall'||resourcePrefixes.some(prefix=>name.startsWith(prefix));
}
