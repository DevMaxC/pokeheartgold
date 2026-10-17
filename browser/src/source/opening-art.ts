/** Native cell/OAM projection. SVG has no HTMLElement.hidden property, so
 * visibility is an explicit attribute rather than an expando on SVGElement. */
export type OpeningFrame={cell:number;duration:number;translate:number[];scale:number[];rotation:number};
export type OpeningDemo={cells:{image:string;origin:number[];bounds:number[]}[];sequences:{frames:OpeningFrame[];loop:boolean;loopStart:number}[];sourceSpritePosition:number[]};
export type OpeningArtwork={backgrounds:Record<string,{image:string}>;demo:OpeningDemo};
export async function prepareOpeningArtwork(art:OpeningArtwork,decode:(url:string)=>Promise<void>=async url=>{const image=new Image();image.src=url;await image.decode();}){
 const names=['oak','boy','girl',...['boy','girl'].flatMap(g=>[1,2,3,4].map(i=>`${g}-shrink-${i}`))],files=names.map(name=>{const file=art.backgrounds[name]?.image;if(!file)throw Error('Missing original opening artwork '+name);return file;});
 files.push('boy-choice.png','girl-choice.png',...art.demo.cells.map(cell=>cell.image));await Promise.all([...new Set(files)].map(file=>decode('/source/opening/'+file)));
}
export async function animateOpeningShrink(gender:'boy'|'girl',show:(file:string|null)=>void,delay:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
 show(gender+'.png');await delay(30*1000/60);for(let i=1;i<=4;i++){show(gender+'-shrink-'+i+'.png');await delay(9*1000/60);}show(null);await delay(150);
}
type Attributes=Pick<Element,'setAttribute'|'removeAttribute'>;
export function setOpeningDemoVisible(element:Attributes,visible:boolean){if(visible)element.removeAttribute('hidden');else element.setAttribute('hidden','');}
export function drawOpeningDemo(image:Attributes,demo:OpeningDemo,sequence:number,index:number,source='/source/opening/'){
 const frame=demo.sequences[sequence].frames[index],cell=demo.cells[frame.cell],[x,y]=demo.sourceSpritePosition,[sx,sy]=frame.scale,[tx,ty]=frame.translate;
 image.setAttribute('href',source+cell.image);image.setAttribute('x',String(x+tx-cell.origin[0]*sx));image.setAttribute('y',String(y+ty-cell.origin[1]*sy));
 image.setAttribute('width',String((cell.bounds[2]-cell.bounds[0]+1)*sx));image.setAttribute('height',String((cell.bounds[3]-cell.bounds[1]+1)*sy));image.setAttribute('transform',`rotate(${frame.rotation} ${x+tx} ${y+ty})`);
}
