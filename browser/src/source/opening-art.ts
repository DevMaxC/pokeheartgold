/** Native cell/OAM projection. SVG has no HTMLElement.hidden property, so
 * visibility is an explicit attribute rather than an expando on SVGElement. */
export type OpeningFrame={cell:number;duration:number;translate:number[];scale:number[];rotation:number};
export type OpeningDemo={cells:{image:string;origin:number[];bounds:number[]}[];sequences:{frames:OpeningFrame[];loop:boolean;loopStart:number}[];sourceSpritePosition:number[]};
type Attributes=Pick<Element,'setAttribute'|'removeAttribute'>;
export function setOpeningDemoVisible(element:Attributes,visible:boolean){if(visible)element.removeAttribute('hidden');else element.setAttribute('hidden','');}
export function drawOpeningDemo(image:Attributes,demo:OpeningDemo,sequence:number,index:number,source='/source/opening/'){
 const frame=demo.sequences[sequence].frames[index],cell=demo.cells[frame.cell],[x,y]=demo.sourceSpritePosition,[sx,sy]=frame.scale,[tx,ty]=frame.translate;
 image.setAttribute('href',source+cell.image);image.setAttribute('x',String(x+tx-cell.origin[0]*sx));image.setAttribute('y',String(y+ty-cell.origin[1]*sy));
 image.setAttribute('width',String((cell.bounds[2]-cell.bounds[0]+1)*sx));image.setAttribute('height',String((cell.bounds[3]-cell.bounds[1]+1)*sy));image.setAttribute('transform',`rotate(${frame.rotation} ${x+tx} ${y+ty})`);
}
