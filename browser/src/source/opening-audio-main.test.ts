import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';

test('actual New Game binds opening audio to live preferences and the existing shared output',async()=>{
 const source=await readFile(new URL('./main.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
 const title=ast.statements.find((node):node is ts.FunctionDeclaration=>ts.isFunctionDeclaration(node)&&node.name?.text==='title');assert.ok(title);
 const output={borrowed:true},log:string[]=[];let getOutput!:()=>unknown;
 const c:any={data:{index:{maps:{}}},readSave:()=>null,unlockSound(){},ui:{startScreen:async()=> 'new'},preferences:{music:false},music:{sharedAudioOutput(){log.push('shared');return output;}},OpeningView:class{constructor(_ui:unknown,read:()=>unknown){getOutput=read;}dispose(){log.push('dispose');}},runOpeningSession:async()=>{
  assert.equal(getOutput(),null);assert.deepEqual(log,[]);c.preferences.music=true;assert.equal(getOutput(),output);c.preferences.music=false;assert.equal(getOutput(),null);assert.deepEqual(log,['shared']);return{native:true};
 },resetFieldInput(){log.push('reset');},begin:async(mode:string)=>{log.push(mode);},openingView:null};
 createContext(c);runInContext(ts.transpileModule(title.getText(ast)+'\nglobalThis.actualTitle=title;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,c);await c.actualTitle();assert.deepEqual(log,['shared','dispose','reset','warp']);assert.equal(c.state.native,true);
});
