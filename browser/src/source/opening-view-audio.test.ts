import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';
import {installUIDOM} from './ui-test-dom.ts';

test('actual OpeningView forwards its audio port, plays original cries and disposes its owner exactly once',async()=>{
 const source=await readFile(new URL('./opening-view.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('opening-view.ts',source,ts.ScriptTarget.Latest,true),view=ast.statements.find(ts.isClassDeclaration);assert.ok(view);
 const dom=installUIDOM(),calls:unknown[]=[],warnings:unknown[]=[],output=()=>null;let disposals=0;
 try{
  dom.document.body.classList={add(){},remove(){}};dom.ids.get('game').append=(child:any)=>{child.remove=()=>{child.parentElement.children=child.parentElement.children.filter((node:any)=>node!==child);child.parentElement=null;};dom.ids.get('game').appendChild(child);};
  const context:any={document:dom.document,source:'/source/opening/',createOpeningAudio(port:unknown){assert.equal(port,output);return{playCry(species:number){calls.push(species);return Promise.reject(Error('fixture audio failure'));},dispose(){disposals++;}};},console:{warn:(...args:unknown[])=>warnings.push(args)}};
  createContext(context);runInContext(ts.transpileModule(view.getText(ast).replace(/^export\s+/,'')+'\nglobalThis.View=OpeningView;',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const instance=new context.View({},output);instance.playCry(183);await Promise.resolve();assert.equal(warnings.length,1);instance.playCry(250);instance.dispose();instance.dispose();await Promise.resolve();assert.deepEqual(calls,[183,250]);assert.equal(disposals,1);assert.equal(warnings.length,1);assert.equal(instance.root.isConnected,false);
 }finally{dom.restore();}
});
