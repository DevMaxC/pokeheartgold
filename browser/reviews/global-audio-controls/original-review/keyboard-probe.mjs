import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createContext,runInContext} from 'node:vm';
import ts from '/Users/maxchurch/Documents/pokeheartgold-audio-controls/browser/node_modules/typescript/lib/typescript.js';
const file='/tmp/hg-opus-global-mute-66a1858f/snapshot/browser/src/source/main.ts';
const source=await readFile(file,'utf8');
const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const callbacks=ast.statements.flatMap(statement=>{
 if(!ts.isExpressionStatement(statement)||!ts.isCallExpression(statement.expression))return[];
 const call=statement.expression;
 if(call.expression.getText(ast)!=='addEventListener'||call.arguments[0]?.getText(ast)!=="'keydown'")return[];
 const callback=call.arguments[1];return callback&&ts.isArrowFunction(callback)&&callback.getText(ast).includes('keys.add(e.code)')?[callback.getText(ast)]:[];
});
if(callbacks.length!==1)throw Error('Expected one actual Main field-keydown callback');
const callback=callbacks[0],compiled=ts.transpileModule(`globalThis.fieldKeydown=(${callback});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
function invoke(code,audioFocused){
 const effects=[];const context={ui:{busy:false},battle:{active:false},started:true,pickupRecoveryBlocked:false,battleSoundOwned:false,transitioning:false,connecting:false,vm:{busy:false},keys:new Set(),unlockSound(){effects.push('unlock');},async interact(){effects.push('interact');},async menu(){effects.push('menu');},reportInputError(e){throw e;}};
 createContext(context);runInContext(compiled,context);
 const target={isContentEditable:false,tagName:audioFocused?'BUTTON':'CANVAS',closest(selector){return audioFocused&&selector==='[data-global-audio]'?this:null;}};
 const event={code,target,repeat:false,defaultPrevented:false,ctrlKey:false,metaKey:false,altKey:false,preventDefault(){this.defaultPrevented=true;}};
 context.fieldKeydown(event);return{code,audioFocused,prevented:event.defaultPrevented,keys:[...context.keys],effects};
}
const hash=s=>createHash('sha256').update(s).digest('hex');
const result={scope:'Actual frozen Main AST callback executed. Explicit focused-button event target. Does not execute real browser focus/default activation.',mainSHA256:hash(source),callbackSHA256:hash(callback),cases:['KeyW','KeyF','KeyQ','KeyE','Enter','Space'].flatMap(code=>[invoke(code,true),invoke(code,false)])};
await writeFile('/tmp/hg-opus-global-mute-66a1858f/keyboard-probe-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
