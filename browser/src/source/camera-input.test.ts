import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CameraInput,type CameraOrbit} from './camera-input.ts';

class Target extends EventTarget{
 readonly tracked=new Map<string,Set<EventListenerOrEventListenerObject>>();
 override addEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:AddEventListenerOptions|boolean){super.addEventListener(type,listener,options);if(listener){const set=this.tracked.get(type)??new Set();set.add(listener);this.tracked.set(type,set);}}
 override removeEventListener(type:string,listener:EventListenerOrEventListenerObject|null,options?:EventListenerOptions|boolean){super.removeEventListener(type,listener,options);if(listener)this.tracked.get(type)?.delete(listener);}
 fire(type:string,fields:Record<string,unknown>={}){const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,button:0,clientX:0,clientY:0,deltaMode:0,deltaY:0,...fields});this.dispatchEvent(event);return event;}
 get listenerCount(){return [...this.tracked.values()].reduce((sum,list)=>sum+list.size,0);}
}
function fixture(distance=10){
 const events=new Target(),doc=Object.assign(new Target(),{visibilityState:'visible'});
 class Canvas extends Target{
  ownerDocument=doc;captures=new Set<number>();released:number[]=[];captureFails=false;
  setPointerCapture(id:number){if(this.captureFails)throw Error('Pointer no longer active');this.captures.add(id);}
  hasPointerCapture(id:number){return this.captures.has(id);}
  releasePointerCapture(id:number){this.captures.delete(id);this.released.push(id);this.fire('lostpointercapture',{pointerId:id});}
  lose(id:number){this.captures.delete(id);this.fire('lostpointercapture',{pointerId:id});}
  getBoundingClientRect(){return{height:600};}
 }
 const canvas=new Canvas(),writes:CameraOrbit[]=[];let orbit:CameraOrbit={yaw:1,pitch:.5,distance},allowed=true,sensitivity=1;
 const input=new CameraInput(canvas as unknown as HTMLElement,{allowed:()=>allowed,read:()=>({...orbit}),write:value=>{orbit={...value};writes.push({...value});},sensitivity:()=>sensitivity},events,doc as unknown as Document);
 return{canvas,doc,events,input,writes,get orbit(){return orbit;},set orbit(value:CameraOrbit){orbit={...value};},setAllowed(value:boolean){allowed=value;},setSensitivity(value:number){sensitivity=value;},down(id:number,x:number,y=0){return canvas.fire('pointerdown',{pointerId:id,clientX:x,clientY:y});},move(id:number,x:number,y=0){return canvas.fire('pointermove',{pointerId:id,clientX:x,clientY:y});}};
}
function close(actual:number,expected:number){assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);}

test('single-pointer look preserves production down-drag positive pitch, yaw sign, sensitivity and limits',()=>{
 const f=fixture();try{assert.equal(f.down(1,100,100).defaultPrevented,true);f.move(1,120,120);close(f.orbit.yaw,.88);close(f.orbit.pitch,.56);assert.equal(f.orbit.distance,10);
  f.setSensitivity(2);f.move(1,130,130);close(f.orbit.yaw,.76);close(f.orbit.pitch,.62);f.move(1,130,10000);assert.equal(f.orbit.pitch,.95);f.move(1,130,-10000);assert.equal(f.orbit.pitch,.18);
 }finally{f.input.dispose();}
});

test('two pointers zoom without rotating and clamp reversal rebases immediately instead of creating a dead zone',()=>{
 const f=fixture();try{f.down(1,0);f.down(2,100);f.move(2,200);assert.equal(f.orbit.distance,5);f.move(2,400);assert.equal(f.orbit.distance,5);f.move(2,380);close(f.orbit.distance,5*400/380);f.move(2,1);assert.equal(f.orbit.distance,28);f.move(2,2);assert.equal(f.orbit.distance,14);assert.equal(f.orbit.yaw,1);assert.equal(f.orbit.pitch,.5);
 }finally{f.input.dispose();}
});

test('pinch-to-single drag and replacement second finger rebase at current positions without camera jumps',()=>{
 const f=fixture();try{f.down(1,0,0);f.move(1,10,10);f.down(2,110,10);f.move(1,20,10);close(f.orbit.distance,10*100/90);f.move(2,200,10);close(f.orbit.distance,10*100/180);const before={...f.orbit};f.canvas.fire('pointerup',{pointerId:1});assert.deepEqual([...f.canvas.captures],[2]);f.move(2,205,15);close(f.orbit.yaw,before.yaw-.03);close(f.orbit.pitch,before.pitch+.015);close(f.orbit.distance,before.distance);
  f.down(3,305,15);const distance=f.orbit.distance;f.move(3,405,15);assert.equal(f.orbit.distance,5);assert.ok(distance<10);f.canvas.fire('pointerup',{pointerId:3});f.move(2,210,20);close(f.orbit.yaw,before.yaw-.06);close(f.orbit.pitch,before.pitch+.03);
 }finally{f.input.dispose();}
});

test('coincident/crossing fingers establish a new nonzero pinch baseline without dividing by zero or jumping',()=>{
 const f=fixture(20);try{f.down(1,0);f.down(2,0);f.move(2,100);assert.equal(f.writes.length,0);f.move(2,200);assert.equal(f.orbit.distance,10);f.move(2,0);assert.equal(f.orbit.distance,10);f.move(2,50);assert.equal(f.orbit.distance,10);f.move(2,100);assert.equal(f.orbit.distance,5);assert.ok(f.writes.every(orbit=>Number.isFinite(orbit.distance)));
 }finally{f.input.dispose();}
});

test('wheel and external camera zoom during a pinch are preserved by subsequent incremental touch motion',()=>{
 const f=fixture();try{f.down(1,0);f.down(2,100);f.canvas.fire('wheel',{deltaY:200});assert.equal(f.orbit.distance,12);f.move(2,120);assert.equal(f.orbit.distance,10);f.orbit={...f.orbit,distance:24};f.move(2,240);assert.equal(f.orbit.distance,12);
 }finally{f.input.dispose();}
});

test('right button, duplicate pointer, failed capture and third finger never corrupt the owned pair',()=>{
 const f=fixture(20);try{assert.equal(f.canvas.fire('pointerdown',{button:2}).defaultPrevented,false);assert.equal(f.canvas.captures.size,0);f.canvas.captureFails=true;f.down(1,0);f.move(1,100);assert.equal(f.writes.length,0);f.canvas.captureFails=false;
  f.down(1,0);f.down(1,9999);f.down(2,100);assert.equal(f.down(3,300).defaultPrevented,false);f.canvas.fire('pointerup',{pointerId:3});f.move(2,200);assert.equal(f.orbit.distance,10);assert.deepEqual([...f.canvas.captures],[1,2]);
 }finally{f.input.dispose();}
});

test('lost capture and local/global cancellation release only the affected pointer and permit smooth remaining drag',()=>{
 for(const release of['lost','pointercancel','global-up','global-cancel']){const f=fixture();try{f.down(1,0);f.down(2,100);if(release==='lost')f.canvas.lose(1);else if(release==='global-up')f.events.fire('pointerup',{pointerId:1});else if(release==='global-cancel')f.events.fire('pointercancel',{pointerId:1});else f.canvas.fire('pointercancel',{pointerId:1});assert.deepEqual([...f.canvas.captures],[2]);f.move(1,500);assert.equal(f.writes.length,0);f.move(2,110,10);close(f.orbit.yaw,.94);close(f.orbit.pitch,.53);f.events.fire('pointerup',{pointerId:2});f.canvas.fire('pointerup',{pointerId:2});assert.equal(f.canvas.released.filter(id=>id===2).length,1);assert.equal(f.canvas.captures.size,0);
 }finally{f.input.dispose();}}
});

test('disabled contexts synchronously release captures via sync/down/move/wheel and old gestures cannot resume',()=>{
 for(const mode of['sync','down','move','unknown-move','wheel']){const f=fixture();try{f.down(1,0);f.setAllowed(false);if(mode==='sync')f.input.sync();else if(mode==='down')f.down(2,100);else if(mode==='move')f.move(1,100);else if(mode==='unknown-move')f.move(99,100);else assert.equal(f.canvas.fire('wheel',{deltaY:100}).defaultPrevented,false);assert.equal(f.canvas.captures.size,0);assert.equal(f.writes.length,0);f.setAllowed(true);f.move(1,1000);assert.equal(f.writes.length,0);f.down(2,10);f.move(2,20);close(f.orbit.yaw,.94);
 }finally{f.input.dispose();}}
});

test('blur/pagehide/resize/orientation and hidden visibility reset every capture without changing the orbit',()=>{
 for(const reason of['blur','pagehide','resize','orientationchange','hidden']){const f=fixture();try{f.down(1,0);f.down(2,100);const before={...f.orbit};if(reason==='hidden'){f.doc.visibilityState='hidden';f.doc.fire('visibilitychange');}else f.events.fire(reason);assert.equal(f.canvas.captures.size,0);assert.deepEqual(f.orbit,before);assert.equal(f.writes.length,0);f.move(1,1000);f.move(2,2000);assert.equal(f.writes.length,0);f.input.reset();assert.equal(f.canvas.released.length,2);
 }finally{f.input.dispose();}}
});

test('visible document notifications preserve a legitimate gesture and unrelated controller pointers are ignored',()=>{
 const f=fixture();try{f.down(1,0);f.doc.fire('visibilitychange');f.events.fire('pointerup',{pointerId:99});f.move(99,100);f.events.fire('pointermove',{pointerId:99,clientX:500});assert.equal(f.writes.length,0);f.move(1,10);close(f.orbit.yaw,.94);assert.deepEqual([...f.canvas.captures],[1]);
 }finally{f.input.dispose();}
});

test('wheel pixel/line/page units and bounds match production positive-scroll zoom out',()=>{
 for(const[mode,delta,expected]of[[0,100,11],[1,1,10.16],[2,1,16],[0,10000,28],[0,-10000,5]]){const f=fixture();try{assert.equal(f.canvas.fire('wheel',{deltaMode:mode,deltaY:delta}).defaultPrevented,true);close(f.orbit.distance,expected);assert.equal(f.orbit.yaw,1);assert.equal(f.orbit.pitch,.5);}finally{f.input.dispose();}}
});

test('dispose is idempotent, releases captures and removes all event handlers across canvas/window/document',()=>{
 const f=fixture();f.down(1,0);f.down(2,100);assert.ok(f.canvas.listenerCount>0);assert.ok(f.events.listenerCount>0);assert.ok(f.doc.listenerCount>0);f.input.dispose();f.input.dispose();assert.equal(f.canvas.captures.size,0);assert.equal(f.canvas.listenerCount,0);assert.equal(f.events.listenerCount,0);assert.equal(f.doc.listenerCount,0);assert.equal(f.down(1,100).defaultPrevented,false);f.move(1,200);assert.equal(f.canvas.fire('wheel',{deltaY:100}).defaultPrevented,false);assert.equal(f.canvas.fire('contextmenu').defaultPrevented,false);f.events.fire('blur');f.input.sync();assert.equal(f.writes.length,0);
});
