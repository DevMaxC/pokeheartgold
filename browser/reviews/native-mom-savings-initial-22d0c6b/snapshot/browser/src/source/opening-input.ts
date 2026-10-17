type KeyboardEvents=Pick<Window,'addEventListener'|'removeEventListener'>;
/** Preserve the native remembered cursor even before focus lands, or when a
 * user clicks outside the menu. Visual selection follows that same cursor. */
export function chooseOpeningButton(buttons:HTMLButtonElement[],initialIndex=0,events:KeyboardEvents=window,focusLater:(callback:()=>void)=>void=callback=>{setTimeout(callback,0);}):Promise<number>{
 if(!buttons.length||!Number.isInteger(initialIndex)||initialIndex<0||initialIndex>=buttons.length)throw RangeError('Invalid opening menu cursor');
 return new Promise(resolve=>{
  let done=false,cursor=initialIndex;const select=(index:number)=>{cursor=index;buttons.forEach((button,i)=>button.classList.toggle('opening-selected',i===cursor));};
  const key=(event:KeyboardEvent)=>{if(event.repeat)return;if(['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(event.code)){event.preventDefault();const direction=['ArrowLeft','ArrowUp'].includes(event.code)?-1:1;select((cursor+direction+buttons.length)%buttons.length);buttons[cursor].focus();}else if(['Enter','Space','KeyF'].includes(event.code)){event.preventDefault();buttons[cursor].click();}};
  buttons.forEach((button,index)=>{button.onfocus=()=>select(index);button.onclick=()=>{if(done)return;done=true;events.removeEventListener('keydown',key);select(index);resolve(index);};});select(cursor);events.addEventListener('keydown',key);focusLater(()=>{if(!done)buttons[cursor].focus();});
 });
}
