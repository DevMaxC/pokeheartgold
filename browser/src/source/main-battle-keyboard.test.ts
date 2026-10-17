import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import ts from 'typescript';
import {Battle} from './battle.ts';
import {loadData,newState,createMon} from './data.ts';
import {UI} from './ui.ts';
import {installUIDOM,installUIClock} from './ui-test-dom.ts';

// Bind the actual Main callback and native field gate, when present. The
// production inline gate and native campaign helper both execute their own code. A separate
// original-source override supplies the literal before-fix negative control.
const mainURL=process.env.HG_PRODUCTION_KEYBOARD_MAIN?pathToFileURL(process.env.HG_PRODUCTION_KEYBOARD_MAIN):new URL('./main.ts',import.meta.url);
const main=await readFile(mainURL,'utf8'),hash=(text:string)=>createHash('sha256').update(text).digest('hex'),mainHash=hash(main);
const ast=ts.createSourceFile('main.ts',main,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const callbacks=ast.statements.flatMap(statement=>{
  if(!ts.isExpressionStatement(statement)||!ts.isCallExpression(statement.expression))return[];
  const call=statement.expression;
  if(call.expression.getText(ast)!=='addEventListener'||call.arguments[0]?.getText(ast)!=="'keydown'")return[];
  const callback=call.arguments[1];return callback&&ts.isArrowFunction(callback)&&callback.getText(ast).includes('keys.add(e.code)')?[callback.getText(ast)]:[];
});
assert.equal(callbacks.length,1,'one actual production field keydown callback');
const fieldGate=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='fieldControlsAvailable')?.getText(ast)??'';
const callback=callbacks[0],compiled=ts.transpileModule(fieldGate+`\nglobalThis.fieldKeydown=(${callback});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
after(async()=>assert.equal(hash(await readFile(mainURL,'utf8')),mainHash,'production Main changed during fixture'));
const priorFetch=globalThis.fetch;
globalThis.fetch=async input=>new Response(await readFile(new URL('../../public'+String(input),import.meta.url)));
const data=await loadData();after(()=>{globalThis.fetch=priorFetch;});

function fixture(){
  const dom=installUIDOM(),clock=installUIClock(),ui=new UI(),state=newState(data,'Gold','boy',()=>.5);
  state.party=[createMon(data,155,5,state.name,()=>.5)];
  const screen=dom.document.createElement('section');screen.id='battle-screen';dom.document.body.appendChild(screen);
  const battle=new Battle(data,state,ui);Reflect.set(battle,'enemies',[createMon(data,19,3,'Opponent',()=>.5)]);
  const fieldActions:string[]=[],actions:unknown[]=[];
  Reflect.set(battle,'actions',(action:unknown)=>actions.push(action));
  const context:any={ui,battle,world:{fieldTransitionActive:false},ready:true,recoveryPrompt:false,sourceActions:null,hatching:false,sourceSceneOwners:0,preservedControlScripts:0,ordinaryInputOwners:0,started:true,pickupRecoveryBlocked:false,battleSoundOwned:false,transitioning:false,connecting:false,vm:{busy:false},keys:new Set<string>(),unlockSound(){},async interact(){fieldActions.push('interact');},async menu(){fieldActions.push('menu');},reportInputError(error:unknown){throw error;}};
  createContext(context);runInContext(compiled,context);dom.listen('keydown',context.fieldKeydown);
  // Real browsers supply default button activation only when no listener
  // prevents it. This headless fixture supplies that default; it is not a
  // browser/layout assertion or an implementation of the battle handlers.
  function activate(button:any,code:'Enter'|'Space'){
    assert.ok(button,'real rendered Battle button exists');button.focus();assert.equal(dom.document.activeElement,button);
    const event=dom.key(code);assert.equal(event.defaultPrevented,false,`${code}: active battle must retain ordinary button default`);
    if(!event.defaultPrevented)button.click();return event;
  }
  return{dom,clock,ui,battle,screen,context,fieldActions,actions,activate,dispose(){ui.close();clock.restore();dom.restore();}};
}

test('actual production Main permits Enter and Space on real Battle Fight, move and Back buttons',t=>{
  const f=fixture();try{
    t.diagnostic(`Main SHA256 ${mainHash}; extracted callback SHA256 ${hash(callback)}`);
    f.battle.active=true;
    for(const code of['Enter','Space']as const){
      Reflect.get(f.battle,'menu').call(f.battle);assert.equal(f.ui.busy,false,'battle commands are plain buttons outside UI-owned panels');
      f.activate(f.screen.querySelector('[data-action="fight"]'),code);
      assert.ok(f.screen.querySelector('[data-move="0"]'),'actual Fight handler opens actual move menu');
      const count=f.actions.length;f.activate(f.screen.querySelector('[data-move="0"]'),code);
      assert.equal(f.actions.length,count+1);assert.deepEqual(f.actions.at(-1),{kind:'move',slot:0});
      f.activate(f.dom.ids.get('battle-back'),code);assert.ok(f.screen.querySelector('[data-action="fight"]'),'actual Back returns to command menu');
      assert.deepEqual(f.fieldActions,[]);assert.equal(f.context.keys.size,0);
    }
  }finally{f.dispose();}
});

test('field HUD Enter remains field-owned without native double-click, while editable inputs remain normal',()=>{
  const f=fixture();try{
    let hudClicks=0;const hud=f.dom.ids.get('open-menu')!;hud.onclick=()=>{hudClicks++;};hud.focus();
    const enter=f.dom.key('Enter');if(!enter.defaultPrevented)hud.click();
    assert.equal(enter.defaultPrevented,true);assert.equal(hudClicks,0);assert.deepEqual(f.fieldActions,['interact']);assert.ok(f.context.keys.has('Enter'));f.context.keys.clear();
    const space=f.dom.key('Space');if(!space.defaultPrevented)hud.click();assert.equal(space.defaultPrevented,true);assert.equal(hudClicks,0);assert.deepEqual(f.fieldActions,['interact']);f.context.keys.clear();
    const input=f.dom.document.createElement('input');f.dom.document.body.appendChild(input);input.focus();
    for(const code of['Enter','Space']){const event=f.dom.key(code);assert.equal(event.defaultPrevented,false);assert.equal(f.context.keys.size,0);assert.deepEqual(f.fieldActions,['interact']);}
  }finally{f.dispose();}
});

test('real owned UI choices consume Enter and Space once before the production field handler',async()=>{
  const f=fixture();try{
    f.battle.active=true;
    for(const code of['Enter','Space']){
      const choice=f.ui.choose('Required battle choice',['Yes','No']);f.clock.flush();
      assert.equal(f.ui.busy,true);const event=f.dom.key(code);assert.equal(event.defaultPrevented,true);
      assert.equal(await choice,0);assert.equal(f.ui.busy,false);assert.deepEqual(f.fieldActions,[]);assert.equal(f.context.keys.size,0);
    }
  }finally{f.dispose();}
});
