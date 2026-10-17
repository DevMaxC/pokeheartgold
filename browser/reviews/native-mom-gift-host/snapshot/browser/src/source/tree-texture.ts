export type TreeShape={footV:number;topV?:number;crownWidth?:number;crownCenterU?:number};
/** Select leaf pixels relative to this tree's visible bounds, never the atlas.
 * Kept independent of canvas so small/offset tree banks exercise the same path. */
export function treeLeafPixels(data:ArrayLike<number>,imageWidth:number,imageHeight:number,shape:TreeShape){
 const top=shape.topV??0,height=shape.footV-top,width=shape.crownWidth??1,centre=shape.crownCenterU??.5;
 const left=Math.max(0,Math.floor((centre-width*.15)*imageWidth)),right=Math.min(imageWidth,Math.max(left+1,Math.ceil((centre+width*.15)*imageWidth))),first=Math.max(0,Math.floor((top+height*.2)*imageHeight)),last=Math.min(imageHeight,Math.max(first+1,Math.ceil((top+height*.5)*imageHeight)));
 const w=right-left,h=last-first;if(w<=0||h<=0)return null;const pixels=new Uint8Array(w*h*4);let minLight=255,maxLight=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const source=((y+first)*imageWidth+x+left)*4,i=(y*w+x)*4;for(let c=0;c<4;c++)pixels[i+c]=data[source+c];if(pixels[i+3]>=128){const light=(pixels[i]+pixels[i+1]+pixels[i+2])/3;minLight=Math.min(minLight,light);maxLight=Math.max(maxLight,light);}}
 const original=pixels.slice(),count=w*h,owner=new Int32Array(count).fill(-1),queue=new Int32Array(count);let head=0,tail=0;
 // Fill transparent margins with interior leaf colour rather than dark outlines.
 for(let i=0;i<count;i++)if(pixels[i*4+3]>=128&&(pixels[i*4]+pixels[i*4+1]+pixels[i*4+2])/3>=minLight+(maxLight-minLight)*.22){owner[i]=i;queue[tail++]=i;}if(!tail)return null;
 while(head<tail){const i=queue[head++],x=i%w;for(const next of [x>0?i-1:-1,x<w-1?i+1:-1,i-w,i+w])if(next>=0&&next<count&&owner[next]<0){owner[next]=owner[i];queue[tail++]=next;}}
 for(let i=0;i<count;i++){if(pixels[i*4+3]<128)pixels.set(original.subarray(owner[i]*4,owner[i]*4+3),i*4);pixels[i*4+3]=255;}
 return{data:pixels,width:w,height:h,sourceRect:[left,first,right,last]};
}
