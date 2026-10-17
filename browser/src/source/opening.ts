/** Observable opening flow from src/oaks_speech.c:1526–2148. Rendering and
 * timing are effects so the original branches can be tested without a DOM. */
export type OpeningGender='boy'|'girl';
export type OpeningIdentity={name:string;gender:OpeningGender};
export type OpeningScene={phase:'topics'|'controls'|'adventure'|'greeting'|'oak'|'gender'|'naming'|'shrink';gender?:OpeningGender;oak?:'center'|'right';hint?:string};
export type OpeningEffect='oak-right'|'ball-flash'|'marill-appear'|'marill-cry'|'marill-hide'|'oak-left'|'player-shrink';
export interface OpeningPort{
 prepare?():Promise<void>;
 scene(view:OpeningScene):void;
 message(text:string):Promise<void>;
 choose(prompt:string,choices:string[],initialIndex?:number,detail?:string):Promise<number>;
 name(prompt:string,maximum:number):Promise<string>;
 effect(effect:OpeningEffect,gender?:OpeningGender):Promise<void>;
}
export type OpeningData={messages:Record<string,string|null>;defaultNames:Record<string,string>};
export type OpeningContext={now?:()=>Date;random?:()=>number};
/** English keyboard rows: src/naming_screen.c:254–282 + charmap.txt. */
export const OPENING_NAME_KEYBOARD={
 Uppercase:['ABCDEFGHIJ ,.','KLMNOPQRST ’-','UVWXYZ     ♂♀','0123456789   '],
 Lowercase:['abcdefghij ,.','klmnopqrst ’-','uvwxyz     ♂♀','0123456789   '],
 Symbols:[',.:;!?   ♂♀  ','“”‘’()       ','…·~@#%+-*/=  ','◉●■▲◆♠♥♦♣★♪  ','☀☁☂☃☺♚♛☹☽↗↘  ']
}as const;
const nameCharacters=new Set(Object.values(OPENING_NAME_KEYBOARD).flatMap(rows=>rows.flatMap(row=>Array.from(row))));
export const normalizeOpeningName=(value:string)=>value.replace(/'/g,'’');
export const validOpeningName=(value:string)=>Array.from(normalizeOpeningName(value)).every(c=>nameCharacters.has(c));
const key=(id:number)=>'msg_0219_'+String(id).padStart(5,'0');
export function openingText(messages:OpeningData['messages'],id:number,name=''){
 const value=messages[key(id)];if(value==null)throw Error('Missing original opening message '+key(id));
 return value.replace(/\{STRVAR_1 3,\s*0,\s*0\}/g,()=>name).replace(/\{(?:YESNO|ALN_CENTER|COLOR)[^}]*\}/g,'');
}
/** Oak's speech clock is deliberately distinct from the field clock.
 * src/oaks_speech.c:1477; the 10/11,16 and19 boundaries differ. */
export function oakGreetingMessage(hour:number,minute=0){
 if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59)throw RangeError('Invalid local time');
 const hhmm=hour*100+minute;return hhmm<400?5:hhmm<1100?1:hhmm<1600?2:hhmm<1900?3:4;
}
export function openingName(input:string,gender:OpeningGender,defaults:OpeningData['defaultNames'],random= Math.random){
 // Unlike trim(), native naming preserves meaningful spaces. Blank/all-space
 // input chooses one of18 native HG names (src/naming_screen.c:645–712).
 const limited=Array.from(normalizeOpeningName(input)).slice(0,7).join('');if(!validOpeningName(limited))throw RangeError('Name contains a character outside the native English keyboard');if(limited.trim())return limited;
 const draw=random();if(!Number.isFinite(draw)||draw<0||draw>=1)throw RangeError('Invalid naming random value');
 const id=(gender==='boy'?0:18)+Math.floor(draw*18),value=defaults[String(id)];
 if(!value)throw Error('Missing native default name254:'+id);return value;
}
export async function runOakIntroduction(data:OpeningData,port:OpeningPort,context:OpeningContext={}):Promise<OpeningIdentity>{
 const text=(id:number,name='')=>openingText(data.messages,id,name),say=(id:number,name='')=>port.message(text(id,name));
 const yesno=[text(47),text(48)];
 // Tutorial topics loop back to the menu. Neither completed topic silently
 // advances to Oak; the native NO INFO NEEDED choice does that explicitly.
 for(;;){
  port.scene({phase:'topics'});await say(7);
  const topic=await port.choose('',[text(44),text(45),text(46)]);
  if(topic===2)break;
  if(topic===1){port.scene({phase:'adventure'});for(const id of[28,29,30,31,32,33])await say(id);continue;}
  if(topic!==0)throw RangeError('Invalid opening topic');
  let understood=false;while(!understood){
   port.scene({phase:'controls',hint:'Touch or click Next · F, Enter or Space to advance. WASD / arrows move; F interacts; Q / E rotate the camera.'});
   for(const id of[9,10,11,12,23])await say(id);
   // Message25 is a control-code-only practice dialog in the DS source. The
   // browser demonstrates the same confirm action with its actual controls.
   await port.choose(text(25),['Continue']);
   for(const id of[13,14,15,16,17])await say(id);
   understood=await port.choose(text(26),yesno)===0;
  }
 }
 const now=(context.now??(()=>new Date()))();port.scene({phase:'greeting'});await say(oakGreetingMessage(now.getHours(),now.getMinutes()));
 port.scene({phase:'oak',oak:'center'});await say(6);
 await port.effect('oak-right');port.scene({phase:'oak',oak:'right'});await say(34);
 await port.effect('ball-flash');await port.effect('marill-appear');await port.effect('marill-cry');await say(35);
 await port.effect('marill-hide');await port.effect('oak-left');port.scene({phase:'oak',oak:'center'});await say(36);
 let lastGender:OpeningGender='boy';
 for(;;){
  port.scene({phase:'gender',gender:lastGender});await say(37);
  const choice=await port.choose('', ['Boy','Girl'],lastGender==='boy'?0:1);
  if(choice!==0&&choice!==1)throw RangeError('Invalid opening character');
  const gender:OpeningGender=choice===0?'boy':'girl';lastGender=gender;port.scene({phase:'gender',gender});
  if(await port.choose(text(gender==='boy'?38:39),yesno)!==0)continue;
  port.scene({phase:'naming',gender});
  const name=openingName(await port.name(text(40),7),gender,data.defaultNames,context.random);
  // Native name rejection returns to the character question, allowing a
  // different gender. It does not only reopen the name input.
  port.scene({phase:'oak',oak:'center',gender});
  if(await port.choose(text(gender==='boy'?41:42,name),yesno)!==0)continue;
  await say(43,name);port.scene({phase:'shrink',gender});await port.effect('player-shrink',gender);
  return{name,gender};
 }
}
/** Keep the saved State as the active choice until the introduction returns a
 * complete identity. No save writes or world actors belong to this draft. */
export async function runOpeningSession<T>(saved:T|null,data:OpeningData|(()=>Promise<OpeningData>),port:OpeningPort,createState:(identity:OpeningIdentity)=>T,menuMessages:Record<string,string>,saveDetail='',context:OpeningContext={}):Promise<T>{
 if(saved){
  if(!menuMessages['0']||!menuMessages['1'])throw Error('Missing native main-menu labels442');
  for(;;){
   const option=await port.choose('',[menuMessages['0'],menuMessages['1']],0,saveDetail);
   if(option===0)return saved;
   if(option!==1)throw RangeError('Invalid opening save choice');
   // This truthful browser replacement notice intentionally differs from the
   // DS warning, which promised the new session could not be saved at all.
   const confirm=await port.choose('Start a new adventure?',['Return to the menu','Begin adventure'],0,'The new adventure will replace this browser’s saved game after you finish creating your character.');
   if(confirm===1)break;
   if(confirm!==0)throw RangeError('Invalid opening replacement choice');
  }
 }
 const opening=typeof data==='function'?await data():data;await port.prepare?.();
 const identity=await runOakIntroduction(opening,port,context);
 return createState(identity);
}
