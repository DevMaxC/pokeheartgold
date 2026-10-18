/** A source control is never parsed from an interpolated nickname or move. */
export type NativePrintToken={kind:'text';text:string}|{kind:'glyph';id:1|2|3|4|5}|{kind:'page'}|{kind:'pause';frames:number}|{kind:'indicator';id:0};
export type NativePrinterControls={glyph:(id:number)=>boolean;nextFrame:(signal:AbortSignal)=>Promise<void>};
export type NativePrinter={done:Promise<void>;clear:()=>void};
export function nativeMessageTokens(source:string,operands:readonly string[]=[]):readonly NativePrintToken[]{
 const tokens:NativePrintToken[]=[];let text='';
 const flush=()=>{if(text){tokens.push({kind:'text',text});text='';}};
 for(let i=0;i<source.length;){
  const rest=source.slice(i);
  if(rest.startsWith('\\n')){text+='\n';i+=2;continue;}
  if(rest.startsWith('\\r')||rest.startsWith('\\f')){flush();tokens.push({kind:'page'});i+=2;continue;}
  if(rest[0]==='{'){
   const control=rest.match(/^\{WAIT ([1-5])\}/),variable=rest.match(/^\{STRVAR_1 \d+, (\d+), \d+\}/);
   const pause=rest.match(/^\{PAUSE (\d+)\}/),indicator=rest.match(/^\{YESNO 0\}/);
   if(pause){const frames=Number(pause[1]);if(!Number.isInteger(frames)||frames<0||frames>65535)throw Error('Invalid native text pause');flush();tokens.push({kind:'pause',frames});i+=pause[0].length;continue;}
   if(indicator){flush();tokens.push({kind:'indicator',id:0});i+=indicator[0].length;continue;}
   if(control){flush();tokens.push({kind:'glyph',id:Number(control[1])as 1|2|3|4|5});i+=control[0].length;continue;}
   if(variable){const value=operands[Number(variable[1])];if(typeof value!=='string')throw Error('Missing native text operand '+variable[1]);flush();tokens.push({kind:'text',text:value});i+=variable[0].length;continue;}
   throw Error('Unsupported native text control: '+rest.slice(0,40));
  }
  if(rest[0]==='\\')throw Error('Unsupported native text escape: '+rest.slice(0,8));
  const character=String.fromCodePoint(source.codePointAt(i)!);text+=character;i+=character.length;
 }
 flush();return tokens;
}
