import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {hasOutdoorSky,mapWeather,skyKeyframes,skyNoise,weatherKind} from './atmosphere.ts';
import {WorldSky} from './sky.ts';
import type {SourceMap} from './types.ts';

const map=(weather=0,key='MAP_ROUTE_29',mapType='MAP_TYPE_ROUTE')=>({key,mapType,fields:{weather:String(weather)}} as SourceMap);
test('original weather dispatch distinguishes rain, snow, mist and cave darkness',()=>{
 assert.deepEqual(Array.from({length:14},(_,i)=>weatherKind(i)),['clear','rain','rain','rain','snow','snow','blizzard','clear','diamond-dust','mist','mist','dark','dark','dark']);
 assert.equal(hasOutdoorSky(map()),true);assert.equal(hasOutdoorSky(map(0,'MAP_HOME','MAP_TYPE_INTERIOR')),false);assert.equal(hasOutdoorSky(map(11,'MAP_DARK_CAVE','MAP_TYPE_CAVE')),false);assert.equal(hasOutdoorSky(map(5,'MAP_MOUNT_SILVER_CAVE_SUMMIT','MAP_TYPE_CAVE')),true);
});
test('source rain and snow maps use their original headers rather than random global weather',async()=>{
 for(const [id,weather]of [[37,1],[88,1],[465,5],[521,5],[67,0]]){const source=JSON.parse(await readFile(new URL(`../../public/source/maps/${id}.json`,import.meta.url),'utf8'));assert.equal(mapWeather(source,{flags:{}},new Date(2026,9,15,12)),weather);}
});
test('native summit diamond-dust dates, Lake of Rage Wednesday and field flags override map weather',()=>{
 const summit=map(5,'MAP_MOUNT_SILVER_CAVE_SUMMIT','MAP_TYPE_CAVE');
 for(const [month,day]of [[1,1],[1,31],[2,1],[2,29],[3,15],[10,10],[12,3],[12,31]])assert.equal(mapWeather(summit,{flags:{}},new Date(2024,month-1,day,12)),8);
 assert.equal(mapWeather(summit,{flags:{}},new Date(2026,9,15,12)),5);
 const lake=map(1,'MAP_LAKE_OF_RAGE'),wednesday=new Date(2026,9,14,12);assert.equal(mapWeather(lake,{flags:{}},wednesday),1);assert.equal(mapWeather(lake,{flags:{FLAG_ROCKET_HIDEOUT_CLEARED:true}},wednesday),0);assert.equal(mapWeather(lake,{flags:{FLAG_ROCKET_HIDEOUT_CLEARED:true}},new Date(2026,9,15,12)),1);
 assert.equal(mapWeather(map(11),{flags:{FLAG_SYS_FLASH:true}}),12);assert.equal(mapWeather(map(9),{flags:{FLAG_SYS_DEFOG:true}}),0);assert.equal(mapWeather(map(10),{flags:{FLAG_SYS_DEFOG:true}}),10);
});
test('sky palettes wrap at midnight and interpolate continuously through dawn and dusk',()=>{
 assert.deepEqual(skyKeyframes(24),skyKeyframes(0));assert.deepEqual(skyKeyframes(-1),skyKeyframes(23));assert.equal(skyKeyframes(12).a.period,'day');assert.equal(skyKeyframes(18).a.period,'sunset');assert.equal(skyKeyframes(23).a.stars,1);
 for(const h of [4,6,10,16,18,20,22]){const before=skyKeyframes(h-1e-7),after=skyKeyframes(h);assert.equal(before.b.zenith,after.a.zenith);assert.ok(before.t>.999999);assert.equal(after.t,0);}
 for(let i=0;i<100;i++){assert.equal(skyNoise(i),skyNoise(i));assert.ok(skyNoise(i)>=0&&skyNoise(i)<1);}
});
test('sky follows the camera, hides indoors and keeps source precipitation in the field',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),sky=new WorldSky(scene,camera,()=>new Date(2026,9,15,12));camera.position.set(50,7,22);sky.enter(map(1),1);sky.update(.016,48,2,20);
 assert.deepEqual(sky.group.position.toArray(),camera.position.toArray());assert.equal(sky.status.particles,180);assert.equal(sky.status.clouds,24);assert.ok(scene.fog);assert.equal(sky.status.kind,'rain');
 sky.enter(map(0,'MAP_CENTER','MAP_TYPE_INTERIOR'),0);sky.update(.016,8,0,19);assert.equal(sky.group.visible,false);assert.equal(sky.status.particles,0);assert.equal(scene.fog,null);assert.deepEqual(sky.fieldTint.value.toArray(),[1,1,1]);
 sky.enter(map(5,'MAP_MOUNT_SILVER_CAVE_SUMMIT','MAP_TYPE_CAVE'),5);sky.update(.016,8,80,19);assert.equal(sky.status.kind,'snow');assert.equal(sky.status.particles,190);assert.equal(sky.group.visible,true);
});
test('night adds stars and a moon, colours the field and preserves prior material shader hooks',()=>{
 const scene=new THREE.Scene(),sky=new WorldSky(scene,new THREE.PerspectiveCamera(),()=>new Date(2026,9,15,23));const material=new THREE.MeshBasicMaterial();let compiled=false;material.onBeforeCompile=shader=>{compiled=true;shader.uniforms.sourceGrass={value:1};};material.customProgramCacheKey=()=> 'source-grass';scene.add(new THREE.Mesh(new THREE.PlaneGeometry(),material));sky.enter(map(),0);sky.update(.016,0,0,0);
 assert.ok(sky.fieldTint.value.r<.4);assert.equal(material.customProgramCacheKey(),'source-grass|johto-field-tint-v1');const shader={uniforms:{},fragmentShader:'#include <tonemapping_fragment>'};material.onBeforeCompile(shader as never,{} as never);assert.equal(compiled,true);assert.equal((shader.uniforms as Record<string,unknown>).fieldSkyTint,sky.fieldTint);assert.ok(shader.fragmentShader.includes('gl_FragColor.rgb *= fieldSkyTint;'));
 const visible=sky.group.children.filter(c=>c.visible);assert.ok(visible.some(c=>c instanceof THREE.Points));const moon=visible.find(c=>c instanceof THREE.Sprite);assert.ok(moon&&moon.position.y>0);
 const hook=material.onBeforeCompile;sky.update(11,0,0,0);assert.equal(material.onBeforeCompile,hook);
});
test('cloud and weather instances stay finite and cloud surfaces have depth',()=>{
 const scene=new THREE.Scene(),sky=new WorldSky(scene,new THREE.PerspectiveCamera());sky.enter(map(),0);sky.update(.016,0,0,0);let instances=0;
 scene.traverse(object=>{if(!(object instanceof THREE.InstancedMesh))return;instances++;assert.ok(Array.from(object.instanceMatrix.array).every(Number.isFinite));object.geometry.computeBoundingBox();assert.ok(object.geometry.boundingBox!.getSize(new THREE.Vector3()).z>0);});assert.equal(instances,3);
});
test('camera-facing tree shaders receive the same night tint as the terrain',()=>{
 const scene=new THREE.Scene(),sky=new WorldSky(scene,new THREE.PerspectiveCamera(),()=>new Date(2026,9,15,23)),material=new THREE.ShaderMaterial({fragmentShader:'void main(){gl_FragColor=vec4(1.);\n#include <tonemapping_fragment>\n}'}),tree=new THREE.Mesh(new THREE.PlaneGeometry(),material);tree.name='camera-facing-original-trees';scene.add(tree);sky.enter(map(),0);sky.update(.016,0,0,0);assert.equal(material.uniforms.fieldSkyTint,sky.fieldTint);assert.ok(material.fragmentShader.includes('gl_FragColor.rgb *= fieldSkyTint;'));const source=material.fragmentShader;sky.update(.016,0,0,0);assert.equal(material.fragmentShader,source);
});
test('celestial art tests scene depth so transparent render ordering cannot paint stars over buildings',()=>{
 const sky=new WorldSky(new THREE.Scene(),new THREE.PerspectiveCamera());const celestial=sky.group.children.filter(c=>c instanceof THREE.Sprite||c instanceof THREE.Points);assert.equal(celestial.length,3);for(const object of celestial){const material=(object as THREE.Sprite).material;assert.equal(material.depthTest,true);assert.equal(material.depthWrite,false);}
});
