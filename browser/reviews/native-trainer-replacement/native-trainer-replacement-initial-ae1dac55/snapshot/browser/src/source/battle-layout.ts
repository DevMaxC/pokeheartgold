type Point={x:number;z:number;y:number};
type Field={height(x:number,z:number,currentY?:number,fromX?:number,fromZ?:number):number;walkable(x:number,z:number,fromX?:number,fromZ?:number,currentY?:number):boolean};
const directions=[{x:0,z:-1},{x:0,z:1},{x:-1,z:0},{x:1,z:0}];
function connectedPoint(field:Field,from:Point,x:number,z:number){
 let last=from;const count=Math.max(1,Math.ceil(Math.hypot(x-from.x,z-from.z)/.4));
 for(let i=1;i<=count;i++){
  const p={x:from.x+(x-from.x)*i/count,z:from.z+(z-from.z)*i/count,y:0};p.y=field.height(p.x,p.z,last.y,last.x,last.z);
  if(!field.walkable(p.x,p.z,last.x,last.z,last.y)||Math.abs(p.y-last.y)>.35)return null;last=p;
 }
 return last;
}
/** Place the presentation on one continuous nearby patch. The combat engine
 * never uses these coordinates to decide an encounter or battle outcome. */
export function fieldBattleLayout(field:Field,hero:Point&{facing:number},clearPresentation:(p:Point)=>boolean=()=>true){
 const preferred=directions[hero.facing]??directions[0];let best=-Infinity,result:{positions:[Point,Point];axis:{x:number;z:number};safe:boolean}|undefined;
 for(const [ox,oz]of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]])for(const axis of directions)for(const gap of [3.4,2.6,1.8,.8]){
  const x=hero.x+ox-(gap<1?axis.x*.4:0),z=hero.z+oz-(gap<1?axis.z*.4:0),start=connectedPoint(field,hero,x,z);if(!start)continue;let last=start,clear=true;
  const count=Math.ceil(gap/.4),width=gap<1?.2:.45;
  for(let i=0;i<=count&&clear;i++){
   const p={x:x+axis.x*gap*i/count,z:z+axis.z*gap*i/count,y:0};p.y=field.height(p.x,p.z,last.y,last.x,last.z);
   if(!field.walkable(p.x,p.z,last.x,last.z,last.y)||Math.abs(p.y-last.y)>.35){clear=false;break;}
   for(const side of [-width,width]){const sx=p.x-axis.z*side,sz=p.z+axis.x*side,sy=field.height(sx,sz,p.y,p.x,p.z);if(!field.walkable(sx,sz,p.x,p.z,p.y)||Math.abs(sy-p.y)>.35){clear=false;break;}}
   last=p;
  }
  if(!clear||!clearPresentation(start)||!clearPresentation(last))continue;
  const score=gap*4-Math.hypot(ox,oz)-Math.abs(start.y-hero.y)*2+(axis===preferred?1:0);
  if(score>best){best=score;result={positions:[start,last],axis,safe:true};}
 }
 if(result)return result;
 // Forced battles can begin on a special/blocked tile. Keep both figures on
 // that occupied tile instead of putting one across a cliff or inside a wall.
 const points=[-.35,.35].map(t=>{const x=hero.x+preferred.x*t,z=hero.z+preferred.z*t;return{x,z,y:field.height(x,z,hero.y,hero.x,hero.z)};}) as [Point,Point];
 return{positions:points,axis:preferred,safe:false};
}
export function battleTrainerSpot(field:Field,home:Point,axis:{x:number;z:number},side:number){
 for(const [back,lateral]of [[1.6,.9],[.8,1.1],[0,1.1],[-.8,1.1],[0,-1.1],[.4,.4]]){
  const x=home.x-axis.x*side*back+axis.z*side*lateral,z=home.z-axis.z*side*back-axis.x*side*lateral,p=connectedPoint(field,home,x,z);
  if(p&&Math.abs(p.y-home.y)<.35)return p;
 }
 return{...home};
}
