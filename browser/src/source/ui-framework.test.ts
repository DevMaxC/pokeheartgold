import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UI,type StartProfile} from './ui.ts';
import {installUIDOM as dom,installUIClock as clock} from './ui-test-dom.ts';

test('owned choices navigate enabled controls with arrows/Home/End and trap Tab in both directions',async()=>{
  const d=dom(),c=clock();try{const ui=new UI(),pending=ui.choose('Choose',['First','Disabled','Last']);d.buttons[1].disabled=true;c.flush();assert.equal(d.document.activeElement,d.buttons[0]);
    for(const[code,expected]of[['ArrowDown',2],['ArrowUp',0],['End',2],['Home',0],['ArrowLeft',2]]as const){assert.equal(d.key(code).defaultPrevented,true);assert.equal(d.document.activeElement,d.buttons[expected]);}
    d.key('Tab');assert.equal(d.document.activeElement,d.buttons[0]);d.key('Tab',{shiftKey:true});assert.equal(d.document.activeElement,d.buttons[2]);d.key('Enter');assert.equal(await pending,2);
  }finally{c.restore();d.restore();}
});

test('Enter/Space/F confirm exactly once and consume the event before a field handler',async()=>{
  const d=dom(),c=clock();try{let field=0;d.listen('keydown',event=>{if(!event.defaultPrevented)field++;});const ui=new UI();for(const code of['Enter','Space','KeyF']){const pending=ui.choose('Mandatory',['Yes','No']);c.flush();d.key(code,{repeat:true});assert.equal(ui.panelOpen,true);assert.equal(d.key(code).defaultPrevented,true);assert.equal(await pending,0);}assert.equal(field,0);
  }finally{c.restore();d.restore();}
});

test('mandatory choices do not become keyboard cancellable merely because they have an AbortSignal',async()=>{
  const d=dom(),c=clock(),owner=new AbortController();try{const ui=new UI(),pending=ui.choose('Native source choice',['Yes','No'],'',owner.signal),rejected=assert.rejects(pending,{name:'AbortError'});c.flush();for(const code of['Escape','KeyB']){assert.equal(d.key(code).defaultPrevented,true);assert.equal(ui.panelOpen,true);}owner.abort();await rejected;assert.equal(ui.panelOpen,false);
  }finally{c.restore();d.restore();}
});

test('Escape/B use only an explicit enabled cancelIndex, with invalid configuration rejected before replacement',async()=>{
  const d=dom(),c=clock();try{const ui=new UI();for(const code of['Escape','KeyB']){const pending=ui.choose('Choose',['Use','Back'],'',undefined,{cancelIndex:1});c.flush();d.buttons[1].disabled=true;d.key(code);assert.equal(ui.panelOpen,true);d.buttons[1].disabled=false;d.key(code);assert.equal(await pending,1);}
    const current=ui.choose('Current',['Keep']);await assert.rejects(ui.choose('Invalid',['No'],'',undefined,{cancelIndex:9}),/valid explicit cancel/);assert.match(d.ids.get('panel-content')!.innerHTML,/Current/);d.buttons[0].click();await current;
  }finally{c.restore();d.restore();}
});

test('modal focus cannot escape, replacement avoids stale focus, and final close restores prior focus/inert state',async()=>{
  const d=dom(),c=clock();try{d.ids.get('open-menu')!.focus();d.ids.get('touch-pad')!.inert=true;const ui=new UI(),old=ui.choose('Old',['Old']),rejected=assert.rejects(old,{name:'AbortError'}),staleFocus=[...c.tasks.values()][0];c.flush();const next=ui.choose('Next',['Next']);await rejected;c.flush();const focused=d.document.activeElement;staleFocus();assert.equal(d.document.activeElement,focused);
    const outside=d.document.createElement('button');d.document.body.appendChild(outside);outside.focus();assert.equal(d.document.activeElement,d.buttons[0]);d.buttons[0].click();await next;assert.equal(d.document.activeElement,d.ids.get('open-menu'));assert.equal(d.ids.get('touch-pad')!.inert,true);assert.equal(d.ids.get('game-hud')!.inert,false);
  }finally{c.restore();d.restore();}
});

test('editable naming keeps normal keys and IME, with one Done/Enter submit and native input hints',async()=>{
  const d=dom(),c=clock();try{const ui=new UI(),pending=ui.input('Your name',7,'Ethan');const input=d.ids.get('name-input')!;assert.equal(input.getAttribute('enterkeyhint'),'done');assert.equal(input.getAttribute('autocorrect'),'off');assert.equal(input.getAttribute('spellcheck'),'false');
    for(const code of['KeyF','KeyB','Space','ArrowLeft','Home','End'])assert.equal(d.key(code).defaultPrevented,false,code);assert.equal(d.key('Enter',{isComposing:true}).defaultPrevented,false);assert.equal(ui.panelOpen,true);assert.equal(d.key('Escape').defaultPrevented,true);assert.equal(ui.panelOpen,true);
    input.value='  NewNameLong  ';d.key('Enter',{repeat:true});assert.equal(ui.panelOpen,true);assert.equal(d.key('Enter').defaultPrevented,true);assert.equal(await pending,'NewName');assert.equal(d.ids.get('panel')!.hidden,true);
  }finally{c.restore();d.restore();}
});

test('the fresh title uses original Ho-Oh art, no false Continue, and invokes gesture synchronously before resolution',async()=>{
  const d=dom(),c=clock();try{const ui=new UI(),order:string[]=[],pending=ui.startScreen(null,undefined,()=>{order.push('gesture');});void pending.then(()=>order.push('resolved'));const html=d.ids.get('panel-content')!.innerHTML;
    assert.equal(d.ids.get('panel')!.dataset.view,'title');assert.match(html,/250-male-front.png/);assert.match(html,/class="title-wordmark"/);assert.deepEqual(d.actions.map(button=>button.dataset.startAction),['new','settings']);d.actions[0].click();assert.deepEqual(order,['gesture']);assert.equal(await pending,'new');await Promise.resolve();assert.deepEqual(order,['gesture','resolved']);
  }finally{c.restore();d.restore();}
});

test('saved title escapes profile/location/nicknames and renders bounded source sprites without exposing Egg species',async()=>{
  const d=dom(),c=clock();try{const ui=new UI(),profile:StartProfile={name:'<Ethan & "friend">',location:'<Johto>',badges:3,playSeconds:7380,party:[{species:155,gender:'male',name:'<Pip>'},{species:81,gender:'genderless'},{species:175,gender:'female',isEgg:true},{species:'1" onerror="oops'as unknown as number,gender:'male'}]},pending=ui.startScreen(profile),html=d.ids.get('panel-content')!.innerHTML;
    assert.match(html,/&lt;Ethan &amp; &quot;friend&quot;&gt;/);assert.match(html,/&lt;Johto&gt;/);assert.match(html,/alt="&lt;Pip&gt;"/);assert.match(html,/81-male-front.png/);assert.doesNotMatch(html,/175-female-front|onerror=/);assert.match(html,/3 \/ 16/);assert.match(html,/2:03/);assert.equal(d.actions[0].dataset.startAction,'continue');assert.match(html,/class="save-party-egg"/);d.actions[0].click();assert.equal(await pending,'continue');
  }finally{c.restore();d.restore();}
});

test('stale title clicks/abort/focus timers cannot unlock audio or resolve/close a newer prompt',async()=>{
  const d=dom(),c=clock(),owner=new AbortController();try{const ui=new UI();let gestures=0;const old=ui.startScreen(null,owner.signal,()=>{gestures++;}),rejected=assert.rejects(old,{name:'AbortError'}),click=d.actions[0].onclick!,staleFocus=[...c.tasks.values()][0],next=ui.choose('Recovery',['Continue']);await rejected;c.flush();const focused=d.document.activeElement;owner.abort();click();staleFocus();assert.equal(gestures,0);assert.equal(d.document.activeElement,focused);assert.equal(ui.panelOpen,true);assert.equal(d.ids.get('panel')!.dataset.view,'default');d.buttons[0].click();assert.equal(await next,0);
  }finally{c.restore();d.restore();}
});

test('title gesture failure rejects its owner coherently and a pre-aborted title does not replace a current panel',async()=>{
  const d=dom(),c=clock();try{const ui=new UI(),failure=Error('gesture failed'),pending=ui.startScreen(null,undefined,()=>{throw failure;}),rejected=assert.rejects(pending,error=>error===failure);d.actions[1].click();await rejected;assert.equal(ui.panelOpen,false);ui.panel('Current');const owner=new AbortController();owner.abort();await assert.rejects(ui.startScreen(null,owner.signal),{name:'AbortError'});assert.equal(d.ids.get('panel-content')!.innerHTML,'Current');ui.close();
  }finally{c.restore();d.restore();}
});

test('a synchronous gesture callback that replaces its own title cannot cancel the newer owned prompt',async()=>{
  const d=dom(),c=clock();try{const ui=new UI();let next:Promise<number>|undefined;const title=ui.startScreen(null,undefined,()=>{next=ui.choose('Audio recovery',['Continue']);throw Error('stale gesture error');}),rejected=assert.rejects(title,{name:'AbortError'});d.actions[0].click();await rejected;assert.equal(ui.panelOpen,true);assert.match(d.ids.get('panel-content')!.innerHTML,/Audio recovery/);d.buttons[0].click();assert.equal(await next,0);
  }finally{c.restore();d.restore();}
});

test('closing a modal falls back to the world when its old focus target was disabled, and generic input permits Escape',async()=>{
  const d=dom(),c=clock();try{d.ids.get('open-menu')!.focus();const ui=new UI(),choice=ui.choose('Choice',['Done']);d.ids.get('open-menu')!.disabled=true;d.buttons[0].click();await choice;assert.equal(d.document.activeElement,d.ids.get('original-world'));
    ui.panel('<input id="volume" type="range">');d.ids.get('volume')!.focus();assert.equal(d.key('Escape').defaultPrevented,true);assert.equal(ui.panelOpen,false);
  }finally{c.restore();d.restore();}
});

test('polite nonmodal toast owns its timer and stale disposers cannot hide a newer save/settings notice',()=>{
  const d=dom(),c=clock();try{const ui=new UI(),old=ui.toast('Saved <text>'),oldTimer=[...c.tasks.values()][0],node=d.ids.get('ui-toast')!;assert.equal(node.getAttribute('role'),'status');assert.equal(node.getAttribute('aria-live'),'polite');assert.equal(node.textContent,'Saved <text>');assert.equal(ui.busy,false);const focused=d.document.activeElement;const release=ui.toast('Sound updated');old();oldTimer();assert.equal(node.textContent,'Sound updated');assert.equal(node.hidden,false);assert.equal(d.document.activeElement,focused);release();assert.equal(node.hidden,true);assert.equal(c.tasks.size,0);
  }finally{c.restore();d.restore();}
});

test('generic panels retain explicit canDismiss behavior while an owned choice has keyboard priority over dialogue',async()=>{
  const d=dom(),c=clock();try{const ui=new UI();ui.panel('<button>Menu</button>');ui.canDismiss=false;d.key('Escape');assert.equal(ui.panelOpen,true);ui.canDismiss=true;d.key('KeyB');assert.equal(ui.panelOpen,false);
    const dialogue=ui.message('First\\rSecond'),choice=ui.choose('Choose',['Yes']);c.flush();d.key('KeyF');assert.equal(await choice,0);assert.equal(d.ids.get('dialogue-text')!.textContent,'First');d.key('KeyF');await Promise.resolve();assert.equal(d.ids.get('dialogue-text')!.textContent,'Second');d.key('KeyF');await dialogue;
  }finally{c.restore();d.restore();}
});

test('custom panels retain mandatory ownership and exact cleanup through replacement/abort without orphan promises',async()=>{
  const d=dom(),c=clock(),owner=new AbortController();try{const ui=new UI();let cleaned=0,changes=0,stale:(()=>void)|undefined;
    const old=ui.customPanel<number>('<button id="done">Done</button>',(resolve,current)=>{const button=d.ids.get('done')!,click=()=>{if(!current())return;changes++;resolve(7);};button.onclick=click;stale=click;return()=>{cleaned++;if(button.onclick===click)button.onclick=null;};},owner.signal),rejected=assert.rejects(old,{name:'AbortError'});d.key('Escape');d.key('KeyB');assert.equal(ui.panelOpen,true);
    const next=ui.choose('Replacement',['Keep']);await rejected;assert.equal(cleaned,1);owner.abort();stale!();assert.equal(changes,0);assert.equal(ui.panelOpen,true);d.buttons[0].click();await next;
    const pending=ui.customPanel<void>('<button id="done">Done</button>',()=>()=>{cleaned++;},owner.signal);await assert.rejects(pending,{name:'AbortError'});assert.equal(cleaned,1,'pre-aborted custom request never binds/replaces');
  }finally{c.restore();d.restore();}
});

test('custom explicit cancel resolves its value and detaches exact handlers, including B on a nontext slider',async()=>{
  const d=dom(),c=clock();try{const ui=new UI();let cleaned=0;const panel=ui.customPanel<string>('<input id="volume" type="range"><button id="done">Done</button>',resolve=>{const button=d.ids.get('done')!,click=()=>resolve('done');button.onclick=click;return()=>{cleaned++;if(button.onclick===click)button.onclick=null;};},undefined,{cancel:()=> 'back',autoFocus:false});assert.equal(c.tasks.size,0);d.ids.get('volume')!.focus();assert.equal(d.key('ArrowRight').defaultPrevented,false);assert.equal(d.key('KeyB').defaultPrevented,true);assert.equal(await panel,'back');assert.equal(cleaned,1);
    const owner=new AbortController(),pending=ui.customPanel<void>('<button id="done">Done</button>',()=>()=>{cleaned++;},owner.signal),rejected=assert.rejects(pending,{name:'AbortError'});owner.abort();await rejected;assert.equal(cleaned,2);assert.equal(ui.panelOpen,false);
  }finally{c.restore();d.restore();}
});


test('global mute stays focusable and keyboard-operable during a mandatory choice without accepting it',async()=>{
 const d=dom(),c=clock();try{const button=d.document.createElement('button');button.setAttribute('data-global-audio','');button.id='audio-toggle';d.document.body.appendChild(button);let muted=false;button.onclick=()=>{muted=!muted;};const ui=new UI(),pending=ui.choose('Choose your Pokémon',['Yes','No']);c.flush();d.key('Tab',{shiftKey:true});assert.equal(d.document.activeElement,button);
 for(const code of['Enter','Space']){const event=d.key(code);assert.equal(event.defaultPrevented,false,'native button default remains available');if(!event.defaultPrevented)button.click();assert.equal(ui.panelOpen,true,'mute cannot accept a mandatory source choice');}assert.equal(muted,false);
 d.key('Tab');assert.equal(d.document.activeElement,d.buttons[0]);d.key('Enter');assert.equal(await pending,0);
 }finally{c.restore();d.restore();}
});
