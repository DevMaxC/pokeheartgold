export type CameraOrbit={yaw:number;pitch:number;distance:number};
export type CameraInputPorts={allowed:()=>boolean;read:()=>CameraOrbit;write:(orbit:CameraOrbit)=>void;sensitivity:()=>number};
/** One finger looks; two fingers zoom. Pointer ownership is separate from the
 * virtual controller, so walking and looking work at the same time. */
export class CameraInput{
 private pointers=new Map<number,{x:number;y:number}>();
 private pinchPixels:number|null=null;
 private cleanup:(()=>void)[]=[];
 private disposed=false;
 constructor(private canvas:HTMLElement,private ports:CameraInputPorts,events:EventTarget=window,doc:Document=canvas.ownerDocument){
  const listen=(target:EventTarget,type:string,listener:(event:Event)=>void)=>{target.addEventListener(type,listener,{passive:false});this.cleanup.push(()=>target.removeEventListener(type,listener));};
  listen(canvas,'pointerdown',event=>this.down(event as PointerEvent));listen(canvas,'pointermove',event=>this.move(event as PointerEvent));
  for(const name of['pointerup','pointercancel','lostpointercapture'])listen(canvas,name,event=>this.release((event as PointerEvent).pointerId));
  for(const name of['pointerup','pointercancel'])listen(events,name,event=>this.release((event as PointerEvent).pointerId));
  for(const name of['blur','pagehide','resize','orientationchange'])listen(events,name,()=>this.reset());
  listen(doc,'visibilitychange',()=>{if(doc.visibilityState==='hidden')this.reset();});
  listen(canvas,'contextmenu',event=>event.preventDefault());
  listen(canvas,'wheel',event=>{if(this.disposed||!this.ports.allowed()){this.reset();return;}event.preventDefault();const wheel=event as WheelEvent,orbit=this.ports.read(),units=wheel.deltaMode===1?16:wheel.deltaMode===2?this.canvas.getBoundingClientRect().height:1;this.ports.write({...orbit,distance:Math.max(5,Math.min(28,orbit.distance+wheel.deltaY*units*.01))});});
 }
 private down(event:PointerEvent){
  if(this.disposed||!this.ports.allowed()){this.reset();return;}
  if(event.button!==0||this.pointers.has(event.pointerId)||this.pointers.size>=2)return;
  event.preventDefault();try{this.canvas.setPointerCapture(event.pointerId);}catch{return;}
  this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(this.pointers.size===2){const [a,b]=[...this.pointers.values()],pixels=Math.hypot(a.x-b.x,a.y-b.y);this.pinchPixels=pixels>0?pixels:null;}
 }
 private move(event:PointerEvent){
  if(this.disposed||!this.ports.allowed()){this.reset();return;}
  const previous=this.pointers.get(event.pointerId);if(!previous)return;
  event.preventDefault();this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const orbit=this.ports.read();
  if(this.pointers.size===2){
   const[a,b]=[...this.pointers.values()],pixels=Math.hypot(a.x-b.x,a.y-b.y);
   if(pixels===0){this.pinchPixels=null;return;}
   if(this.pinchPixels!==null)this.ports.write({...orbit,distance:Math.max(5,Math.min(28,orbit.distance*this.pinchPixels/pixels))});
   // Incremental live distance preserves wheel/external changes, responds as
   // soon as a pinch reverses at a limit, and rebases after overlapping fingers.
   this.pinchPixels=pixels;return;
  }
  const sensitivity=this.ports.sensitivity();this.ports.write({...orbit,yaw:orbit.yaw-(event.clientX-previous.x)*.006*sensitivity,pitch:Math.max(.18,Math.min(.95,orbit.pitch+(event.clientY-previous.y)*.003*sensitivity))});
 }
 private release(id:number){if(!this.pointers.delete(id))return;this.pinchPixels=null;try{if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);}catch{/* A browser cancellation may already have released it. */}}
 sync(){if(this.disposed||!this.ports.allowed())this.reset();}
 reset(){for(const id of [...this.pointers.keys()])this.release(id);this.pinchPixels=null;}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;for(const remove of this.cleanup)remove();this.cleanup=[];}
}
