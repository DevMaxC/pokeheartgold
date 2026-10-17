import {readFile,writeFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import {createHash} from 'node:crypto';
import ts from '/Users/maxchurch/Documents/pokeheartgold-audio-controls/browser/node_modules/typescript/lib/typescript.js';
const roots=[['original66a','/tmp/hg-opus-global-mute-66a1858f/snapshot'],['final84864','/tmp/hg-opus-global-mute-final-84864cb7/snapshot']];
const sha=s=>createHash('sha256').update(s).digest('hex');const cases=[];
for(const [label,root]of roots){
 const source=await readFile(root+'/browser/src/source/interface-panels.ts','utf8'),ast=ts.createSourceFile('interface-panels.ts',source,ts.ScriptTarget.Latest,true);
 let bind,call;
 function visit(node){
  if(ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(ast)==='bind')&&node.getText(ast).includes('this.ports.gesture()'))bind=node.getText(ast);
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='bind'&&node.arguments[0]?.getText(ast)==="'setting-music'")call=node.getText(ast)+';';
  ts.forEachChild(node,visit);
 }visit(ast);if(!bind||!call)throw Error('Expected actual Settings bind and Music callback');
 for(const initial of[false,true]){
  let handler;const button={disabled:false,textContent:'',attrs:{},addEventListener(_type,action){handler=action;},removeEventListener(){},setAttribute(k,v){this.attrs[k]=v;}};
  const prefs={music:initial},observed=[];const context={$:()=>button,current:()=>true,cleanups:[],update(patch){Object.assign(prefs,patch);},host:{ports:{preferences:()=>prefs,gesture(){observed.push(prefs.music);}}}};
  createContext(context);runInContext(ts.transpileModule(`(function(){${bind}\n${call}}).call(host);`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,context);handler();
  cases.push({label,initialMusic:initial,finalMusic:prefs.music,gestureObservedMusic:observed,sourceSHA256:sha(source),actualBindingSHA256:sha(bind+'\n'+call)});
 }
}
const result={scope:'Execute actual extracted production Settings generic bind plus literal Music click callback. Explicit preference/gesture ports record synchronous ordering; not actual AudioContext/browser unlock.',cases};await writeFile('/tmp/hg-opus-global-mute-final-84864cb7/settings-order-probe-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
