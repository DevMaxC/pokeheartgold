import type {GameData,State,Mon,MoveData} from './types.ts';
import {calculateStats,createMon,giveMon,speciesName,titleCase,itemName,moveName,trainerName} from './data.ts';
import {catchShakes,fieldBattleWeather,freshStages,monAbility,moveDamage,multiHitCount,stageHitChance,stageMultiplier,weatherHPRecovery,type BattleWeather,type Stages} from './battle-math.ts';
import {UI,$,escapeHTML as esc} from './ui.ts';
import {takeBagItem,isCaptureBall} from './bag.ts';
import type {BattleView} from './battle-view.ts';
import {isUsableBattler,firstUsableBattlerIndex} from './battle-party.ts';
import {planNativeExperience} from './battle-experience.ts';

type Result='won'|'lost'|'caught'|'ran';
type Action={kind:'move';slot:number}|{kind:'switch';index:number}|{kind:'item';item:string}|{kind:'run'};
const implementedEffects=new Set([0,1,2,3,4,5,6,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,29,31,32,33,40,41,43,44,48,50,51,52,53,54,55,56,58,59,60,61,62,63,64,66,67,68,69,70,71,72,73,74,78,81,85,87,103,113,132,149,156,214]);
// constants/moves.h: SINGLE, RANDOM_OPPONENT, ADJACENT_OPPONENTS, ALL_ADJACENT.
// Self/side/field targets still exist without a living opposing active mon.
const singleBattleLiveOpponentTargets=new Set([0,2,4,8]);
// BattleCtx_IsIdenticalToCurrentMove's complete native effect table. Its
// first-turn TryNoTarget predicate is false: the charge script must run even
// without an opponent. Charge/locked-turn state is unported, so keep all of
// these effects unsupported instead of claiming a completed no-target action.
const unportedChargeEffects=new Set([26,39,75,145,151,155,255,256,263,272]);
export class Battle{
  active=false;private enemies:Mon[]=[];private enemyIndex=0;private playerIndex=0;private trainer:number|null=null;
  private playerStages=freshStages();private enemyStages=freshStages();private resolve:((r:Result)=>void)|null=null;private actions:((a:Action)=>void)|null=null;
  private experienceMask=0;private fleeAttempts=0;private turns=0;private flinch=false;private messageText='';
  private identified=new Set<Mon>();private curled=new Set<Mon>();
  private roosting=new Set<Mon>();private raging=new Set<Mon>();private weather:BattleWeather='clear';
  private selectedMoveSlots=new Map<Mon,number>();
  private tutorial=false;private noCritical=false;
  readonly data:GameData;readonly state:State;readonly ui:UI;readonly rng:()=>number;readonly view?:BattleView;
  constructor(data:GameData,state:State,ui:UI,rng:()=>number=Math.random,view?:BattleView){this.data=data;this.state=state;this.ui=ui;this.rng=rng;this.view=view;}
  get player(){return this.state.party[this.playerIndex];}get enemy(){return this.enemies[this.enemyIndex];}
  async start(enemies:Mon[],trainer:number|null=null,options:{tutorial?:boolean;noCritical?:boolean;weather?:number}={}):Promise<Result>{
    const lead=firstUsableBattlerIndex(this.state.party);if(lead<0)throw Error('No Pokémon is able to battle.');
    this.tutorial=!!options.tutorial;this.noCritical=this.tutorial||!!options.noCritical;
    // Capture the native field weather once; sky animation and later map
    // changes never decide healing amounts during a battle.
    this.weather=fieldBattleWeather(options.weather??0);this.roosting.clear();this.raging.clear();this.selectedMoveSlots.clear();
    this.active=true;this.enemies=enemies;this.trainer=trainer;this.playerIndex=lead;this.experienceMask=1<<lead;this.enemyIndex=0;this.playerStages=freshStages();this.enemyStages=freshStages();this.turns=0;this.fleeAttempts=0;
    this.identified.clear();this.curled.clear();$('battle-screen').hidden=false;$('game-hud').hidden=true;$('touch-pad').hidden=true;
    const before=structuredClone({party:this.state.party,boxes:this.state.boxes,bag:this.state.bag,seen:this.state.seen,caught:this.state.caught});
    let fail:(error:unknown)=>void;const complete=new Promise<Result>((resolve,reject)=>{this.resolve=resolve;fail=reject;});
    void(async()=>{
    await this.view?.begin(this.player,this.enemy,trainer!==null);document.body?.classList.add('in-battle');
    this.draw();for(const enemy of enemies)if(!this.state.seen.includes(enemy.species))this.state.seen.push(enemy.species);
    if(trainer!==null)await this.say(`${trainerName(this.data,this.state,trainer)} wants to battle!`);await this.say(trainer===null?`A wild ${this.enemy.name} appeared!`:`${trainerName(this.data,this.state,trainer)} sent out ${this.enemy.name}!`);
    await this.say(`Go! ${this.player.name}!`);
    await this.loop();
    })().catch(error=>{Object.assign(this.state,before);this.finishError();fail(error);});
    return complete;
  }
  private finishError(){this.experienceMask=0;this.roosting.clear();this.raging.clear();this.selectedMoveSlots.clear();this.view?.end();document.body?.classList.remove('in-battle');this.active=false;this.actions=null;this.resolve=null;$('battle-screen').hidden=true;$('game-hud').hidden=false;$('touch-pad').hidden=false;}
  private finish(result:Result){this.experienceMask=0;this.roosting.clear();this.raging.clear();this.selectedMoveSlots.clear();this.view?.end();document.body?.classList.remove('in-battle');this.active=false;this.actions=null;$('battle-screen').hidden=true;$('game-hud').hidden=false;$('touch-pad').hidden=false;this.resolve?.(result);this.resolve=null;}
  private image(mon:Mon,facing:'front'|'back'){return `/source/pokemon/${mon.species}-${mon.gender}-${facing}.png`;}
  private status(mon:Mon){return `<div class="mon-line"><span>${esc(mon.name)} <small>${mon.gender==='female'?'♀':'♂'}</small></span><small>Lv.${mon.level}</small></div><span class="hp-bar"><i style="width:${Math.max(0,mon.hp/mon.maxHP*100)}%;background:${mon.hp/mon.maxHP<.2?'#cd745c':mon.hp/mon.maxHP<.5?'#ccb262':'#73a775'}"></i></span><span class="hp-value">${mon.status?mon.status+' · ':''}${mon.hp} / ${mon.maxHP}</span>`;}
  private draw(){
    this.view?.sync(this.player,this.enemy);
    const screen=$('battle-screen');screen.innerHTML=`<header class="battle-heading"><div><span class="eyebrow">${this.tutorial?'CATCHING DEMONSTRATION':this.trainer!==null?'TRAINER BATTLE':'WILD ENCOUNTER'}</span><h2>${esc(this.view?.location||this.data.index.maps[this.state.map]?.name||'Johto')}</h2></div><div class="battle-camera"><span>Look around</span><button id="battle-camera-left" aria-label="Rotate battle camera left">↶</button><button id="battle-camera-right" aria-label="Rotate battle camera right">↷</button><small>Q / E · drag · scroll</small></div></header><div class="battle-status enemy">${this.status(this.enemy)}</div><div class="battle-status player">${this.status(this.player)}<span class="exp-bar"><i style="width:${this.expPercent(this.player)}%"></i></span></div><div class="battle-bottom"><div class="battle-message" id="battle-message" role="status">${esc(this.messageText)}</div><div class="battle-actions" id="battle-actions"></div></div>`;
    $('battle-camera-left').onclick=()=>this.view?.orbit(-.35);$('battle-camera-right').onclick=()=>this.view?.orbit(.35);
  }
  private expPercent(mon:Mon){const growth=this.data.growth[this.data.personal[mon.species].growthRate],start=growth[mon.level],next=growth[Math.min(100,mon.level+1)];return next>start?(mon.exp-start)/(next-start)*100:100;}
  private async say(text:string){this.messageText=text;this.draw();await new Promise(resolve=>setTimeout(resolve,650));}
  private menu(){this.messageText=`What will ${this.player.name} do?`;this.draw();$('battle-actions').innerHTML=['Fight','Bag','Pokémon','Run'].map((label,i)=>`<button data-action="${['fight','bag','party','run'][i]}">${label}</button>`).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='fight')this.moveMenu();if(a==='bag')this.bagMenu();if(a==='party')this.partyMenu(false);if(a==='run')this.actions?.({kind:'run'});});
  }
  private moveMenu(){const available=this.player.moves.some(m=>m.pp>0);if(!available){this.actions?.({kind:'move',slot:-1});return;}
    $('battle-actions').innerHTML=this.player.moves.map((slot,i)=>{const move=this.data.moves[slot.id];return `<button data-move="${i}" ${slot.pp<=0?'disabled':''}>${esc(moveName(this.data,move.id))}<small>PP ${slot.pp}/${slot.maxPP} · ${titleCase(Object.keys(this.data.constants).find(k=>k.startsWith('TYPE_')&&this.data.constants[k]===move.type)||'TYPE_NORMAL')}</small></button>`;}).join('')+'<button id="battle-back">Back</button>';
    document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(b=>b.onclick=()=>this.actions?.({kind:'move',slot:Number(b.dataset.move)}));$('battle-back').onclick=()=>this.menu();
  }
  private bagMenu(){
    const usable=Object.entries(this.state.bag).filter(([key,count])=>count>0&&(isCaptureBall(this.data,key)||['ITEM_POTION','ITEM_SUPER_POTION','ITEM_HYPER_POTION','ITEM_FULL_RESTORE','ITEM_ANTIDOTE','ITEM_PARLYZ_HEAL','ITEM_AWAKENING'].includes(key)));
    $('battle-actions').innerHTML=usable.map(([key,count])=>`<button data-item="${key}">${esc(itemName(this.data,key))}<small>× ${count}</small></button>`).join('')+'<button id="battle-back">Back</button>';
    document.querySelectorAll<HTMLButtonElement>('[data-item]').forEach(b=>b.onclick=()=>this.actions?.({kind:'item',item:b.dataset.item!}));$('battle-back').onclick=()=>this.menu();
  }
  private partyMenu(forced:boolean){
    $('battle-actions').innerHTML=this.state.party.map((mon,i)=>{const details=mon.isEgg?'':`<small>Lv.${mon.level} · ${mon.hp}/${mon.maxHP}</small>`;return `<button data-party="${i}" ${!isUsableBattler(mon)||i===this.playerIndex?'disabled':''}>${esc(mon.name)}${details}</button>`;}).join('')+(!forced?'<button id="battle-back">Back</button>':'');
    document.querySelectorAll<HTMLButtonElement>('[data-party]').forEach(b=>b.onclick=()=>{const index=Number(b.dataset.party);if(isUsableBattler(this.state.party[index])&&index!==this.playerIndex)this.actions?.({kind:'switch',index});});if(!forced)$('battle-back').onclick=()=>this.menu();
  }
  private async nextAction():Promise<Action>{
    if(!this.tutorial)return new Promise<Action>(resolve=>{this.actions=resolve;this.menu();});
    const pause=()=>new Promise(resolve=>setTimeout(resolve,800)),highlight=(selector:string)=>{document.querySelectorAll<HTMLButtonElement>('#battle-actions button').forEach(button=>button.disabled=true);document.querySelector(selector)?.classList.add('tutorial-selection');};
    this.menu();highlight(this.turns===0?'[data-action="fight"]':'[data-action="bag"]');await pause();
    if(this.turns===0){this.moveMenu();highlight('[data-move="0"]');await pause();return{kind:'move',slot:0};}
    this.bagMenu();highlight('[data-item="ITEM_POKE_BALL"]');await pause();return{kind:'item',item:'ITEM_POKE_BALL'};
  }
  private async loop(){while(this.active){
    this.roosting.clear(); // Native turnData.roostFlag lasts only this turn.
    const action=await this.nextAction();this.actions=null;if(action.kind==='switch'&&(!isUsableBattler(this.state.party[action.index])||action.index===this.playerIndex))continue;this.turns++;this.flinch=false;
    let enemyFainted=false,playerFainted=false;
    // Native ActionEnd settles every action before the next living actor gets
    // its selected move. Replacements still wait until TurnEnd after residuals.
    const settleFaints=async()=>{
      if(!enemyFainted&&this.enemy.hp<=0){enemyFainted=true;await this.say(`${this.enemy.name} fainted!`);await this.gainExperience();if(this.enemyIndex+1>=this.enemies.length){await this.say(this.trainer!==null?'You defeated the opposing Trainer!':'You won the battle!');this.finish('won');return;}}
      if(!playerFainted&&this.player.hp<=0){playerFainted=true;await this.say(`${this.player.name} fainted!`);if(!this.state.party.some(isUsableBattler)){await this.say(`${this.state.name} has no Pokémon left to fight!`);this.finish('lost');}}
    };
    const moveAction=async(playerSide:boolean,slot:number,selectedMoveId:number)=>{
      if(!this.active||(playerSide?this.player:this.enemy).hp<=0)return;
      // EXP can replace this slot before the second action. FightInput reads
      // the current move again, so attack must resolve its ID/target then.
      await this.attack(playerSide,slot,selectedMoveId);await settleFaints();
    };
    if(action.kind==='run'){
      if(this.trainer!==null){await this.say('No! There’s no running from a Trainer battle!');continue;}
      this.prepareRageTurn(this.player);
      this.fleeAttempts++;const odds=Math.floor(this.player.stats.speed*128/Math.max(1,this.enemy.stats.speed))+30*this.fleeAttempts;
      if(this.player.stats.speed>this.enemy.stats.speed||Math.floor(this.rng()*256)<odds){await this.say('Got away safely!');this.finish('ran');break;}await this.say('Can’t escape!');await this.enemyTurn();
    }else if(action.kind==='switch'){this.prepareRageTurn(this.player);await this.switch(action.index);await this.enemyTurn();}
    else if(action.kind==='item'){const used=await this.item(action.item);if(!this.active)break;if(used)await this.enemyTurn();else continue;}
    else{
      const playerMove=this.selectMove(this.player,action.slot),enemySlot=this.chooseEnemyMove(),enemyMove=this.selectMove(this.enemy,enemySlot);
      this.prepareRageTurn(this.player,action.slot);this.prepareRageTurn(this.enemy,enemySlot);
      const ps=this.effectiveSpeed(true),es=this.effectiveSpeed(false);
      const first=playerMove.priority>enemyMove.priority||(playerMove.priority===enemyMove.priority&&(ps>es||(ps===es&&this.rng()<.5)));
      if(first){await moveAction(true,action.slot,playerMove.id);await moveAction(false,enemySlot,enemyMove.id);}else{await moveAction(false,enemySlot,enemyMove.id);await moveAction(true,action.slot,playerMove.id);}
    }
    if(!this.active)break;
    await settleFaints();if(!this.active)break;
    // Supported stage/paralysis speed subset. Native residual order ignores
    // chosen move priority and draws a fresh low-bit tie, before any later EXP.
    const ps=this.effectiveSpeed(true),es=this.effectiveSpeed(false);
    const playerFirst=ps>es||(ps===es&&(Math.floor(this.rng()*0x10000)&1)===0);
    const residualOrder=playerFirst?[true,false]:[false,true];
    for(const playerSide of residualOrder){
      const mon=playerSide?this.player:this.enemy;
      if(mon.hp>0&&['PSN','TOX','BRN'].includes(mon.status)){
        const damage=Math.max(1,Math.floor(mon.maxHP/8));mon.hp=Math.max(0,mon.hp-damage);
        await this.say(`${mon.name} is hurt by ${mon.status==='BRN'?'its burn':'poison'}!`);
        await settleFaints();if(!this.active)break;
      }
    }
    if(!this.active)break;
    if(enemyFainted){this.raging.delete(this.enemy);this.roosting.delete(this.enemy);this.selectedMoveSlots.delete(this.enemy);this.enemyIndex++;this.experienceMask=1<<this.playerIndex;this.enemyStages=freshStages();await this.say(`The opposing Trainer sent out ${this.enemy.name}!`);}
    if(playerFainted){const next=await new Promise<Action>(resolve=>{this.actions=resolve;this.partyMenu(true);});this.actions=null;if(next.kind==='switch')await this.switch(next.index);}

  }}
  private effectiveSpeed(playerSide:boolean){const mon=playerSide?this.player:this.enemy,stages=playerSide?this.playerStages:this.enemyStages;const speed=Math.floor(mon.stats.speed*stageMultiplier(stages.speed));return mon.status==='PAR'?Math.floor(speed/4):speed;}
  private selectMove(mon:Mon,slot:number){return slot<0?this.data.moves[165]:this.data.moves[mon.moves[slot].id];}
  private prepareRageTurn(mon:Mon,slot?:number){
    // Native BEFORE_TURN uses status2 &= STATUS2_RAGE, retaining Rage while
    // clearing the other implemented status2 flags even if this move cannot act.
    // GetBattlerSelectedMove returns NONE for non-Fight actions. The no-PP
    // selection path retains its prior move slot; Struggle is chosen later.
    if(slot!==undefined&&slot>=0)this.selectedMoveSlots.set(mon,slot);
    const selected=slot===undefined?0:mon.moves[this.selectedMoveSlots.get(mon)??-1]?.id??0;
    if(this.raging.has(mon)&&selected!==this.data.constants.MOVE_RAGE){this.identified.delete(mon);this.curled.delete(mon);}
  }
  private chooseEnemyMove(){const slots=this.enemy.moves.map((m,i)=>m.pp>0?i:-1).filter(i=>i>=0);return slots.length?slots[Math.floor(this.rng()*slots.length)]:-1;}
  private async enemyTurn(){if(this.enemy.hp>0&&this.player.hp>0){const slot=this.chooseEnemyMove();this.prepareRageTurn(this.enemy,slot);await this.attack(false,slot);}}
  private async switch(index:number){if(!isUsableBattler(this.state.party[index])||index===this.playerIndex)return;await this.say(`${this.player.name}, that’s enough! Come back!`);this.identified.delete(this.player);this.curled.delete(this.player);this.raging.delete(this.player);this.roosting.delete(this.player);this.selectedMoveSlots.delete(this.player);this.playerIndex=index;this.experienceMask|=1<<index;this.playerStages=freshStages();await this.say(`Go! ${this.player.name}!`);}
  private async attack(playerSide:boolean,slot:number,selectedMoveId?:number){
    const attacker=playerSide?this.player:this.enemy,defender=playerSide?this.enemy:this.player,as=playerSide?this.playerStages:this.enemyStages,ds=playerSide?this.enemyStages:this.playerStages;
    if(attacker.hp<=0)return;
    if(this.flinch){this.flinch=false;await this.say(`${attacker.name} flinched!`);return;}
    if(attacker.status==='SLP'){attacker.sleepTurns--;if(attacker.sleepTurns>0){await this.say(`${attacker.name} is fast asleep.`);return;}attacker.status='';await this.say(`${attacker.name} woke up!`);}
    if(attacker.status==='FRZ'){if(this.rng()>=.2){await this.say(`${attacker.name} is frozen solid!`);return;}attacker.status='';await this.say(`${attacker.name} thawed out!`);}
    if(attacker.status==='PAR'&&this.rng()<.25){await this.say(`${attacker.name} is paralyzed! It can’t move!`);return;}
    const move=slot<0?this.data.moves[165]:this.data.moves[attacker.moves[slot].id];
    // GetMoveTarget filters live opponents for these ranges. FRONT(1024) does
    // too unless FightInput has reselected a changed slot; OPPONENT_SIDE(128)
    // retains a side target even if its active mon fainted. Their unported
    // effects must not be silently accepted as a no-target action.
    const noTarget=!unportedChargeEffects.has(move.effect)&&defender.hp<=0&&(singleBattleLiveOpponentTargets.has(move.target)||(move.target===1024&&(selectedMoveId===undefined||selectedMoveId===move.id)));
    if(slot>=0&&!implementedEffects.has(move.effect)&&!noTarget)throw Error(`Unported original move effect ${move.effect}: ${move.key}`);
    if(slot>=0)attacker.moves[slot].pp--;
    await this.say(`${playerSide?'':'The opposing '}${attacker.name} used ${moveName(this.data,move.id)}!`);
    try{
    // TryMove checks status and deducts PP before its no-target script. A
    // recoil-fainted opponent does not prevent user/side/field moves running.
    if(noTarget){await this.say('But there was no target...');return;} // msg_0197_01234
    if(!this.tutorial&&move.accuracy&&move.effect!==17&&move.effect!==78&&Math.floor(this.rng()*100)>=stageHitChance(move.accuracy,as.accuracy,ds.evasion,this.identified.has(defender))){await this.say(`${attacker.name}’s attack missed!`);return;}
    if([32,132,214].includes(move.effect)&&attacker.hp===attacker.maxHP){await this.say(`${attacker.name}’s HP is full!`);return;}
    await this.view?.attack(playerSide,move);
    if(move.effect===113){this.identified.add(defender);await this.say(`${attacker.name} identified ${defender.name}!`);return;}
    if(move.effect===156){this.curled.add(attacker);await this.changeStage(attacker,as,1,1);return;}
    if(move.effect>=10&&move.effect<=16){await this.changeStage(attacker,as,move.effect-10,1);return;}
    if(move.effect>=18&&move.effect<=24){await this.changeStage(defender,ds,move.effect-18,-1);return;}
    if(move.effect>=50&&move.effect<=56){await this.changeStage(attacker,as,move.effect-50,2);return;}
    if(move.effect>=58&&move.effect<=61){await this.changeStage(defender,ds,move.effect-58,-2);return;}
    if([62,63,64].includes(move.effect)){await this.changeStage(defender,ds,move.effect===62?5:move.effect===63?6:4,-2);return;}
    if(move.effect===25){this.playerStages=freshStages();this.enemyStages=freshStages();await this.say('All stat changes were eliminated!');return;}
    if(move.effect===85)return;
    if([32,132,214].includes(move.effect)){
      const suppressed=[this.player,this.enemy].some(mon=>mon.hp>0&&['ABILITY_CLOUD_NINE','ABILITY_AIR_LOCK'].includes(monAbility(this.data,mon))),amount=move.effect===132?weatherHPRecovery(attacker.maxHP,this.weather,suppressed):Math.floor(attacker.maxHP/2);
      attacker.hp=Math.min(attacker.maxHP,attacker.hp+amount);if(move.effect===214)this.roosting.add(attacker);this.draw();await this.say(`${attacker.name} regained health!`);return;
    }
    if([1,33,66,67].includes(move.effect)){await this.inflict(defender,move.effect===1?'SLP':move.effect===33?'TOX':move.effect===66?'PSN':'PAR');return;}
    const planned=move.effect===44?2:move.effect===29?multiHitCount(this.rng,monAbility(this.data,attacker)==='ABILITY_SKILL_LINK'):1;let landed=0;
    for(let hit=0;hit<planned;hit++){
    if(hit)await this.view?.attack(playerSide,move);
    // The native multi-hit controller reruns critical/damage calculation for
    // every hit, skips additional accuracy/PP checks and stops on fainting.
    const critical=!this.noCritical&&this.rng()<(move.effect===43?1/8:1/16);const {damage,effectiveness}=moveDamage(this.data,attacker,defender,move,as,ds,85+Math.floor(this.rng()*16),critical,this.identified.has(defender),{roosting:this.roosting.has(defender)});
    let total=move.effect===41?40:move.effect===87?attacker.level:move.effect===40?Math.max(1,Math.floor(defender.hp/2)):damage;
    total=Math.min(defender.hp,total);defender.hp=Math.max(0,defender.hp-total);this.draw();
    if(total>0)await this.view?.hit(!playerSide);await new Promise(resolve=>setTimeout(resolve,150));
    if(effectiveness===0)await this.say('It doesn’t affect the opposing Pokémon…');else{if(critical)await this.say('A critical hit!');if(effectiveness>1)await this.say('It’s super effective!');if(effectiveness<1)await this.say('It’s not very effective…');}
    if(total>0){landed++;if(move.effect===81)this.raging.add(attacker);if(defender.hp>0&&this.raging.has(defender)&&ds.atk<6){ds.atk++;await this.say(`${defender.name}’s rage is building!`);}}
    if(move.effect===48||slot<0){attacker.hp=Math.max(0,attacker.hp-Math.max(1,Math.floor((slot<0?attacker.maxHP:total)/4)));await this.say(`${attacker.name} is hit with recoil!`);}
    if(move.effect===3){attacker.hp=Math.min(attacker.maxHP,attacker.hp+Math.max(1,Math.floor(total/2)));await this.say(`${defender.name} had its energy drained!`);}
    if(defender.hp>0&&move.effect>=68&&move.effect<=74&&this.rng()*100<move.effectChance)await this.changeStage(defender,ds,move.effect-68,-1);
    if(defender.hp>0&&[2,4,5,6].includes(move.effect)&&this.rng()*100<move.effectChance)await this.inflict(defender,move.effect===2?'PSN':move.effect===4?'BRN':move.effect===5?'FRZ':'PAR');
    if(move.effect===31&&this.rng()*100<move.effectChance)this.flinch=true;
    if(defender.hp<=0||attacker.hp<=0||effectiveness===0)break;
    }
    if((move.effect===29||move.effect===44)&&landed)await this.say(`Hit ${landed} time${landed===1?'':'s'}!`);
    }finally{
      // Native TryAfterMoveItems clears Rage after another move executes,
      // including a miss/failure. Selection, items and inability to act keep it.
      if(move.effect!==81)this.raging.delete(attacker);
    }
  }
  private async changeStage(mon:Mon,stages:Stages,index:number,amount:number){const key=(['atk','def','speed','spatk','spdef','accuracy','evasion'] as const)[index];const next=Math.max(-6,Math.min(6,stages[key]+amount));if(next===stages[key]){await this.say(`${mon.name}’s ${key} won’t go any ${amount>0?'higher':'lower'}!`);return;}stages[key]=next;await this.say(`${mon.name}’s ${({atk:'Attack',def:'Defense',speed:'Speed',spatk:'Sp. Atk',spdef:'Sp. Def',accuracy:'accuracy',evasion:'evasion'})[key]} ${amount>0?'rose':'fell'}!`);}
  private async inflict(mon:Mon,status:string){if(mon.status){await this.say('But it failed!');return;}const types=this.data.personal[mon.species].types;if((['PSN','TOX'].includes(status)&&types.some(t=>['TYPE_POISON','TYPE_STEEL'].includes(t)))||(status==='BRN'&&types.includes('TYPE_FIRE'))||(status==='FRZ'&&types.includes('TYPE_ICE'))){await this.say('It doesn’t affect the Pokémon…');return;}mon.status=status;if(status==='SLP')mon.sleepTurns=2+Math.floor(this.rng()*4);await this.say(`${mon.name} ${({PSN:'was poisoned!',TOX:'was badly poisoned!',PAR:'is paralyzed! It may be unable to move!',BRN:'was burned!',FRZ:'was frozen solid!',SLP:'fell asleep!'})[status as 'PSN']} `);}
  private async item(item:string){
    if(!this.state.bag[item])return false;
    if(isCaptureBall(this.data,item)){
      if(this.trainer!==null){await this.say('The Trainer blocked the Ball! Don’t be a thief!');return false;}
      if(this.state.party.length>=6&&this.state.boxes.length>=540){await this.say('There is no room in the party or PC.');return false;}
      this.prepareRageTurn(this.player);this.selectedMoveSlots.delete(this.player);
      takeBagItem(this.state.bag,item,1);await this.say(`${this.state.name} used a ${itemName(this.data,item)}!`);
      const multiplier=item==='ITEM_ULTRA_BALL'?20:item==='ITEM_GREAT_BALL'?15:10;const shakes=this.tutorial||item==='ITEM_MASTER_BALL'?4:catchShakes(this.data.personal[this.enemy.species].catchRate,this.enemy.hp,this.enemy.maxHP,multiplier,this.enemy.status,this.rng);
      await this.view?.capture(shakes);
      for(let i=0;i<Math.min(3,shakes);i++)await this.say('…');
      if(shakes===4){this.enemy.ot=this.state.name;if(!giveMon(this.state,this.enemy))throw Error('Capture destination unexpectedly became full');await this.say(`Gotcha! ${this.enemy.name} was caught!`);this.finish('caught');return true;}
      await this.say(['Oh, no! The Pokémon broke free!','Aww! It appeared to be caught!','Aargh! Almost had it!','Gah! It was so close, too!'][shakes]);return true;
    }
    const record=this.data.items.find(i=>i.item===item);if(!record)return false;
    const target=this.player;const before=target.hp,status=target.status;let amount=Number(record.hp_restore_param)||0;if(amount===255)amount=target.maxHP;
    const hp=record.hp_restore==='true'?Math.min(target.maxHP,target.hp+amount):target.hp;
    const cure:Record<string,string>={PSN:'psn_heal',TOX:'psn_heal',PAR:'prz_heal',BRN:'brn_heal',FRZ:'frz_heal',SLP:'slp_heal'},nextStatus=record[cure[status]]==='true'?'':status;
    if(before===hp&&status===nextStatus){await this.say('It won’t have any effect.');return false;}
    this.prepareRageTurn(target);this.selectedMoveSlots.delete(target);target.hp=hp;target.status=nextStatus;
    takeBagItem(this.state.bag,item,1);await this.say(`${this.state.name} used ${itemName(this.data,item)}!`);return true;
  }
  private async gainExperience(){
    const base=this.data.personal[this.enemy.species];
    // Native trades are not yet implemented. Current starter/gift/capture
    // acquisitions are player-owned; legacy OT names do not prove a trade.
    const plan=planNativeExperience({baseYield:base.expYield,defeatedLevel:this.enemy.level,trainerBattle:this.trainer!==null,experienceEnabled:!this.tutorial},this.state.party.map(mon=>({...mon,ownership:'player' as const})),this.experienceMask,this.data.items);
    // Freeze every payout before any level-up UI or party mutation.
    for(const reward of plan.rewards){
    if(!reward.amount)continue;
    const mon=this.state.party[reward.index],growth=this.data.growth[this.data.personal[mon.species].growthRate];
    mon.exp=Math.min(growth[100],mon.exp+reward.amount);await this.say(`${mon.name} gained ${reward.boosted?'a boosted ':''}${reward.amount} Exp. Points!`);
    const yields=['hp_yield','atk_yield','def_yield','speed_yield','spatk_yield','spdef_yield'];for(let i=0;i<6;i++){const total=mon.evs.reduce((a,b)=>a+b,0);mon.evs[i]+=Math.max(0,Math.min(Number(base[yields[i]])||0,255-mon.evs[i],510-total));}
    while(mon.level<100&&mon.exp>=growth[mon.level+1]){
      mon.level++;const previous=mon.maxHP;const next=calculateStats(this.data.personal[mon.species],mon.level,mon.ivs,mon.evs,mon.nature);mon.maxHP=next.maxHP;mon.stats=next.stats;mon.hp+=mon.maxHP-previous;await this.say(`${mon.name} grew to Lv. ${mon.level}!`);
      for(const learned of this.data.learnsets[mon.species].filter(m=>m.level===mon.level))if(!mon.moves.some(m=>m.id===learned.move)){
        const move=this.data.moves[learned.move];if(mon.moves.length<4){mon.moves.push({id:move.id,pp:move.pp,maxPP:move.pp});await this.say(`${mon.name} learned ${moveName(this.data,move.id)}!`);}else{
          const replace=await this.ui.choose(`${mon.name} wants to learn ${moveName(this.data,move.id)}.`,[...mon.moves.map(m=>`Forget ${moveName(this.data,m.id)}`),'Keep current moves']);if(replace<4)mon.moves[replace]={id:move.id,pp:move.pp,maxPP:move.pp};
        }
      }
    }
    }
  }
}
