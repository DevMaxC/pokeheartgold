export type TreeShape={footV:number;footU?:number;topV?:number;crownWidth?:number;crownCenterU?:number;region?:readonly[number,number,number,number]};
export type TreePixels={data:Uint8Array|Uint8ClampedArray;width:number;height:number};
const readableImages=new WeakMap<object,TreePixels>();
type TreeSprite={data:Uint8Array;width:number;height:number;nativeAlpha:Uint8Array;bounds:readonly[number,number,number,number];shape:{footV:number;footU:number;topV:number;crownWidth:number;crownCenterU:number}};
const sprites=new WeakMap<TreePixels['data'],Map<string,TreeSprite>>(),components=new WeakMap<TreePixels['data'],Map<string,number[][]>>();
/** The renderer receives both decoded DataTextures and browser images. A
 * typed pixel image is already readable and must never go through drawImage. */
export function treeImagePixels(value:unknown):TreePixels|null{
 if(!value||typeof value!=='object')return null;const cached=readableImages.get(value);if(cached)return cached;
 const image=value as {data?:unknown;width?:number;height?:number;naturalWidth?:number;naturalHeight?:number;complete?:boolean},width=image.naturalWidth||image.width||0,height=image.naturalHeight||image.height||0;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)return null;let result:TreePixels|null=null;
 if(image.data instanceof Uint8Array||image.data instanceof Uint8ClampedArray){if(image.data.length===width*height*4)result={data:image.data,width,height};}
 else if(image.complete!==false&&(!('naturalWidth'in image)||!!image.naturalWidth)&&typeof document!=='undefined')try{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});if(context){context.drawImage(value as CanvasImageSource,0,0);result={data:context.getImageData(0,0,width,height).data,width,height};}}catch{/* Keep source art when its actual pixels cannot be read. */}
 if(result)readableImages.set(value,result);return result;
}
/** Disconnected atlas plants are selected by the card's used UV rectangle.
 * Ordinary connected sprites keep their complete crown even at a clipped
 * forest strip edge. Tiny separated pixels are still native components. */
export function treeSpriteComponents(source:TreePixels){
 const{width,height,data}=source,key=width+','+height,cached=components.get(data)?.get(key);if(cached)return cached;const seen=new Uint8Array(width*height),parts:number[][]=[];
 for(let at=0;at<seen.length;at++){if(seen[at]||data[at*4+3]<128)continue;let left=width,top=height,right=0,bottom=0;const queue=[at];seen[at]=1;for(let i=0;i<queue.length;i++){const p=queue[i],x=p%width,y=Math.floor(p/width);left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);for(const n of[x? p-1:-1,x+1<width?p+1:-1,p-width,p+width])if(n>=0&&n<seen.length&&!seen[n]&&data[n*4+3]>=128){seen[n]=1;queue.push(n);}}parts.push([left,top,right,bottom]);}const entries=components.get(data)??new Map<string,number[][]>();entries.set(key,parts);components.set(data,entries);return parts;
}
/** Preserve every original opaque RGB value. Only unused transparent atlas
 * pixels are filled, with actual neighbouring source colours; geometry owns
 * the alpha silhouette, including the native trunk and root artwork. */
export function treeSpritePixels(source:TreePixels,shape:Partial<TreeShape>={}):TreeSprite|null{
 const{data,width,height}=source,count=width*height;if(data.length!==count*4)return null;const key=width+','+height+':'+JSON.stringify(shape),cached=sprites.get(data)?.get(key);if(cached)return cached;
 let left=width,right=0,top=height,bottom=0;const owners=new Int32Array(count).fill(-1),queue=new Int32Array(count);let head=0,tail=0;
 const region=shape.region??[0,0,1,1],nativeAlpha=new Uint8Array(count);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=y*width+x;if(data[at*4+3]<128||(x+.5)/width<region[0]||(x+.5)/width>region[2]||(y+.5)/height<region[1]||(y+.5)/height>region[3])continue;nativeAlpha[at]=1;left=Math.min(left,x);right=Math.max(right,x+1);top=Math.min(top,y);bottom=Math.max(bottom,y+1);owners[at]=at;queue[tail++]=at;}
 if(!tail)return null;
 while(head<tail){const at=queue[head++],x=at%width;for(const next of[x>0?at-1:-1,x<width-1?at+1:-1,at-width,at+width])if(next>=0&&next<count&&owners[next]<0){owners[next]=owners[at];queue[tail++]=next;}}
 const pixels=new Uint8Array(count*4);for(let i=0;i<count;i++){const at=owners[i]*4;pixels.set([data[at],data[at+1],data[at+2],255],i*4);}
 const feet:number[]=[];for(let x=left;x<right;x++)if(nativeAlpha[(bottom-1)*width+x])feet.push(x+.5);
 const resolved={footV:shape.footV??bottom/height,footU:shape.footU??(feet[0]+feet[feet.length-1])/2/width,topV:shape.topV??top/height,crownWidth:shape.crownWidth??(right-left)/width,crownCenterU:shape.crownCenterU??(left+right)/2/width};
 if(Object.values(resolved).some(v=>!Number.isFinite(v))||resolved.footV<=resolved.topV)return null;
 const result={data:pixels,width,height,nativeAlpha,bounds:[left,top,right,bottom]as const,shape:resolved},entries=sprites.get(data)??new Map<string,TreeSprite>();entries.set(key,result);sprites.set(data,entries);return result;
}
/** Keep literal interior RGB rows, including the native root/stem rows. The
 * source alpha supplies geometry; its baked dark outline must not become a
 * repeated vertical stripe around a 3D surface. No colour is blended or invented. */
export function treeInteriorPixels(source:TreePixels,sprite:TreeSprite){
 const{data,width,height}=source,[left,top,right,bottom]=sprite.bounds,pixels=new Uint8Array(width*height*4),validRows:number[]=[];
 for(let y=top;y<bottom;y++){const opaque:number[]=[];for(let x=left;x<right;x++)if(sprite.nativeAlpha[y*width+x])opaque.push(x);if(!opaque.length)continue;validRows.push(y);
  let selected=opaque.filter(x=>[-2,-1,1,2].every(dx=>x+dx>=left&&x+dx<right&&sprite.nativeAlpha[y*width+x+dx])&&[y-1,y+1].every(yy=>yy>=top&&yy<bottom&&sprite.nativeAlpha[yy*width+x]));if(!selected.length)selected=opaque;
  for(let x=0;x<width;x++){const at=(y*width+selected[Math.min(selected.length-1,Math.floor(x/width*selected.length))])*4;pixels.set(data.subarray(at,at+3),(y*width+x)*4);pixels[(y*width+x)*4+3]=255;}
 }
 for(let y=0;y<height;y++)if(!validRows.includes(y)){const near=validRows.reduce((a,b)=>Math.abs(a-y)<Math.abs(b-y)?a:b);pixels.set(pixels.subarray(near*width*4,(near+1)*width*4),y*width*4);}return pixels;
}
