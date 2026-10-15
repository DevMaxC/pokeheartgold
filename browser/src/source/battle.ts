import type {GameData,State,Mon,MoveData} from './types.ts';
import {calculateStats,createMon,giveMon,speciesName,titleCase} from './data.ts';
import {catchShakes,freshStages,moveDamage,stageMultiplier,type Stages} from './battle-math.ts';
import {UI,$,escapeHTML as esc} from './ui.ts';

type Result='won'|'lost'|'caught'|'ran';
type Action={kind:'move';slot:number}|{kind:'switch';index:number}|{kind:'item';item:string}|{kind:'run'};
const implementedEffects=new Set([0,1,2,3,4,5,6,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,31,32,33,40,41,43,44,48,50,51,52,53,54,55,56,58,59,60,61,62,63,64,66,67,68,69,70,71,72,73,74,78,85,87,103]);
export class Battle{
  active=false;private enemies:Mon[]=[];private enemyIndex=0;private playerIndex=0;private trainer:number|null=null;
  private playerStages=freshStages();private enemyStages=freshStages();private resolve:((r:Result)=>void)|null=null;private actions:((a:Action)=>void)|null=null;
  private fleeAttempts=0;private turns=0;private flinch=false;private messageText='';
  constructor(readonly data:GameData,readonly state:State,readonly ui:UI,readonly rng:()=>number=Math.random){}
  get player(){return this.state.party[this.playerIndex];}get enemy(){return this.enemies[this.enemyIndex];}
  async start(enemies:Mon[],trainer:number|null=null):Promise<Result>{
    this.active=true;this.enemies=enemies;this.trainer=trainer;this.playerIndex=Math.max(0,this.state.party.findIndex(m=>m.hp>0));this.enemyIndex=0;this.playerStages=freshStages();this.enemyStages=freshStages();this.turns=0;this.fleeAttempts=0;
    $('battle-screen').hidden=false;$('game-hud').hidden=true;$('touch-pad').hidden=true;
    const complete=new Promise<Result>(resolve=>this.resolve=resolve);
    this.draw();for(const enemy of enemies)if(!this.state.seen.includes(enemy.species))this.state.seen.push(enemy.species);
    await this.say(trainer===null?`A wild ${this.enemy.name} appeared!`:`${this.data.trainers[trainer]?.name.replace('{TRNAME}','')||'Trainer'} sent out ${this.enemy.name}!`);
    await this.say(`Go! ${this.player.name}!`);
    void this.loop().catch(async error=>{console.error(error);await this.ui.message('This battle scene is still being restored. Your party has been kept.');this.finish('ran');});
    return complete;
  }
  private finish(result:Result){this.active=false;this.actions=null;$('battle-screen').hidden=true;$('game-hud').hidden=false;$('touch-pad').hidden=false;this.resolve?.(result);this.resolve=null;}
  private image(mon:Mon,facing:'front'|'back'){return `/source/pokemon/${mon.species}-${mon.gender}-${facing}.png`;}
  private status(mon:Mon){return `<div class="mon-line"><span>${esc(mon.name)} <small>${mon.gender==='female'?'♀':'♂'}</small></span><small>Lv.${mon.level}</small></div><span class="hp-bar"><i style="width:${Math.max(0,mon.hp/mon.maxHP*100)}%;background:${mon.hp/mon.maxHP<.2?'#cd745c':mon.hp/mon.maxHP<.5?'#ccb262':'#73a775'}"></i></span><span class="hp-value">${mon.status?mon.status+' · ':''}${mon.hp} / ${mon.maxHP}</span>`;}
  private draw(){
    const screen=$('battle-screen');screen.innerHTML=`<div class="battle-land enemy"></div><div class="battle-land player"></div><img class="battle-sprite enemy" src="${this.image(this.enemy,'front')}" alt="${esc(this.enemy.name)}"><img class="battle-sprite player" src="${this.image(this.player,'back')}" alt="${esc(this.player.name)}"><div class="battle-status enemy">${this.status(this.enemy)}</div><div class="battle-status player">${this.status(this.player)}<span class="exp-bar"><i style="width:${this.expPercent(this.player)}%"></i></span></div><div class="battle-bottom"><div class="battle-message" id="battle-message">${esc(this.messageText)}</div><div class="battle-actions" id="battle-actions"></div></div>`;
  }
  private expPercent(mon:Mon){const growth=this.data.growth[this.data.personal[mon.species].growthRate],start=growth[mon.level],next=growth[Math.min(100,mon.level+1)];return next>start?(mon.exp-start)/(next-start)*100:100;}
  private async say(text:string){this.messageText=text;this.draw();await new Promise(resolve=>setTimeout(resolve,650));}
  private menu(){this.messageText=`What will ${this.player.name} do?`;this.draw();$('battle-actions').innerHTML=['Fight','Bag','Pokémon','Run'].map((label,i)=>`<button data-action="${['fight','bag','party','run'][i]}">${label}</button>`).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.onclick=()=>{const a=b.dataset.action;if(a==='fight')this.moveMenu();if(a==='bag')this.bagMenu();if(a==='party')this.partyMenu(false);if(a==='run')this.actions?.({kind:'run'});});
  }
  private moveMenu(){const available=this.player.moves.some(m=>m.pp>0);if(!available){this.actions?.({kind:'move',slot:-1});return;}
    $('battle-actions').innerHTML=this.player.moves.map((slot,i)=>{const move=this.data.moves[slot.id];return `<button data-move="${i}" ${slot.pp<=0?'disabled':''}>${esc(titleCase(move.key))}<small>PP ${slot.pp}/${slot.maxPP} · ${titleCase(Object.keys(this.data.constants).find(k=>k.startsWith('TYPE_')&&this.data.constants[k]===move.type)||'TYPE_NORMAL')}</small></button>`;}).join('')+'<button id="battle-back">Back</button>';
    document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(b=>b.onclick=()=>this.actions?.({kind:'move',slot:Number(b.dataset.move)}));$('battle-back').onclick=()=>this.menu();
  }
  private bagMenu(){
    const usable=Object.entries(this.state.bag).filter(([key,count])=>count>0&&(key.endsWith('_BALL')||['ITEM_POTION','ITEM_SUPER_POTION','ITEM_HYPER_POTION','ITEM_FULL_RESTORE','ITEM_ANTIDOTE','ITEM_PARLYZ_HEAL','ITEM_AWAKENING'].includes(key)));
    $('battle-actions').innerHTML=usable.map(([key,count])=>`<button data-item="${key}">${esc(titleCase(key))}<small>× ${count}</small></button>`).join('')+'<button id="battle-back">Back</button>';
    document.querySelectorAll<HTMLButtonElement>('[data-item]').forEach(b=>b.onclick=()=>this.actions?.({kind:'item',item:b.dataset.item!}));$('battle-back').onclick=()=>this.menu();
  }
  private partyMenu(forced:boolean){
    $('battle-actions').innerHTML=this.state.party.map((mon,i)=>`<button data-party="${i}" ${mon.hp<=0||i===this.playerIndex?'disabled':''}>${esc(mon.name)}<small>Lv.${mon.level} · ${mon.hp}/${mon.maxHP}</small></button>`).join('')+(!forced?'<button id="battle-back">Back</button>':'');
    document.querySelectorAll<HTMLButtonElement>('[data-party]').forEach(b=>b.onclick=()=>this.actions?.({kind:'switch',index:Number(b.dataset.party)}));if(!forced)$('battle-back').onclick=()=>this.menu();
  }
  private async loop(){while(this.active){
    const action=await new Promise<Action>(resolve=>{this.actions=resolve;this.menu();});this.actions=null;this.turns++;this.flinch=false;
    if(action.kind==='run'){
      if(this.trainer!==null){await this.say('No! There’s no running from a Trainer battle!');continue;}
      this.fleeAttempts++;const odds=Math.floor(this.player.stats.speed*128/Math.max(1,this.enemy.stats.speed))+30*this.fleeAttempts;
      if(this.player.stats.speed>this.enemy.stats.speed||Math.floor(this.rng()*256)<odds){await this.say('Got away safely!');this.finish('ran');break;}await this.say('Can’t escape!');await this.enemyTurn();
    }else if(action.kind==='switch'){await this.switch(action.index);await this.enemyTurn();}
    else if(action.kind==='item'){const used=await this.item(action.item);if(!this.active)break;if(used)await this.enemyTurn();else continue;}
    else{
      const playerMove=action.slot<0?this.data.moves[165]:this.data.moves[this.player.moves[action.slot].id];const enemySlot=this.chooseEnemyMove(),enemyMove=enemySlot<0?this.data.moves[165]:this.data.moves[this.enemy.moves[enemySlot].id];
      const ps=this.player.stats.speed*stageMultiplier(this.playerStages.speed)*(this.player.status==='PAR'?.25:1),es=this.enemy.stats.speed*stageMultiplier(this.enemyStages.speed)*(this.enemy.status==='PAR'?.25:1);
      const first=playerMove.priority>enemyMove.priority||(playerMove.priority===enemyMove.priority&&(ps>es||(ps===es&&this.rng()<.5)));
      if(first){await this.attack(true,action.slot);if(this.enemy.hp>0)await this.attack(false,enemySlot);}else{await this.attack(false,enemySlot);if(this.player.hp>0)await this.attack(true,action.slot);}
    }
    if(!this.active)break;
    for(const playerSide of [true,false]){const mon=playerSide?this.player:this.enemy;if(mon.hp>0&&['PSN','TOX','BRN'].includes(mon.status)){const damage=Math.max(1,Math.floor(mon.maxHP/(mon.status==='BRN'?8:8)));mon.hp=Math.max(0,mon.hp-damage);await this.say(`${mon.name} is hurt by ${mon.status==='BRN'?'its burn':'poison'}!`);}}
    if(this.enemy.hp<=0){await this.say(`${this.enemy.name} fainted!`);await this.gainExperience();this.enemyIndex++;if(this.enemyIndex>=this.enemies.length){await this.say(this.trainer!==null?'You defeated the opposing Trainer!':'You won the battle!');this.finish('won');break;}this.enemyStages=freshStages();await this.say(`The opposing Trainer sent out ${this.enemy.name}!`);}
    if(this.player.hp<=0){await this.say(`${this.player.name} fainted!`);if(!this.state.party.some(m=>m.hp>0)){await this.say(`${this.state.name} has no Pokémon left to fight!`);this.finish('lost');break;}
      const next=await new Promise<Action>(resolve=>{this.actions=resolve;this.partyMenu(true);});this.actions=null;if(next.kind==='switch')await this.switch(next.index);
    }
  }}
  private chooseEnemyMove(){const slots=this.enemy.moves.map((m,i)=>m.pp>0?i:-1).filter(i=>i>=0);return slots.length?slots[Math.floor(this.rng()*slots.length)]:-1;}
  private async enemyTurn(){if(this.enemy.hp>0&&this.player.hp>0)await this.attack(false,this.chooseEnemyMove());}
  private async switch(index:number){await this.say(`${this.player.name}, that’s enough! Come back!`);this.playerIndex=index;this.playerStages=freshStages();await this.say(`Go! ${this.player.name}!`);}
  private async attack(playerSide:boolean,slot:number){
    const attacker=playerSide?this.player:this.enemy,defender=playerSide?this.enemy:this.player,as=playerSide?this.playerStages:this.enemyStages,ds=playerSide?this.enemyStages:this.playerStages;
    if(this.flinch){this.flinch=false;await this.say(`${attacker.name} flinched!`);return;}
    if(attacker.status==='SLP'){attacker.sleepTurns--;if(attacker.sleepTurns>0){await this.say(`${attacker.name} is fast asleep.`);return;}attacker.status='';await this.say(`${attacker.name} woke up!`);}
    if(attacker.status==='FRZ'){if(this.rng()>=.2){await this.say(`${attacker.name} is frozen solid!`);return;}attacker.status='';await this.say(`${attacker.name} thawed out!`);}
    if(attacker.status==='PAR'&&this.rng()<.25){await this.say(`${attacker.name} is paralyzed! It can’t move!`);return;}
    const move=slot<0?this.data.moves[165]:this.data.moves[attacker.moves[slot].id];
    if(slot>=0&&!implementedEffects.has(move.effect))throw Error(`Unported original move effect ${move.effect}: ${move.key}`);
    if(slot>=0)attacker.moves[slot].pp--;
    await this.say(`${playerSide?'':'The opposing '}${attacker.name} used ${titleCase(move.key)}!`);
    if(move.accuracy&&move.effect!==17&&move.effect!==78&&Math.floor(this.rng()*100)>=move.accuracy*stageMultiplier(Math.max(-6,Math.min(6,as.accuracy-ds.evasion)),true)){await this.say(`${attacker.name}’s attack missed!`);return;}
    if(move.effect>=10&&move.effect<=16){await this.changeStage(attacker,as,move.effect-10,1);return;}
    if(move.effect>=18&&move.effect<=24){await this.changeStage(defender,ds,move.effect-18,-1);return;}
    if(move.effect>=50&&move.effect<=56){await this.changeStage(attacker,as,move.effect-50,2);return;}
    if(move.effect>=58&&move.effect<=61){await this.changeStage(defender,ds,move.effect-58,-2);return;}
    if([62,63,64].includes(move.effect)){await this.changeStage(defender,ds,move.effect===62?5:move.effect===63?6:4,-2);return;}
    if(move.effect===25){this.playerStages=freshStages();this.enemyStages=freshStages();await this.say('All stat changes were eliminated!');return;}
    if(move.effect===85)return;
    if(move.effect===32){attacker.hp=Math.min(attacker.maxHP,attacker.hp+Math.floor(attacker.maxHP/2));await this.say(`${attacker.name} regained health!`);return;}
    if([1,33,66,67].includes(move.effect)){await this.inflict(defender,move.effect===1?'SLP':move.effect===33?'TOX':move.effect===66?'PSN':'PAR');return;}
    const critical=this.rng()<(move.effect===43?1/8:1/16);const {damage,effectiveness}=moveDamage(this.data,attacker,defender,move,as,ds,85+Math.floor(this.rng()*16),critical);
    let total=move.effect===41?40:move.effect===87?attacker.level:move.effect===40?Math.max(1,Math.floor(defender.hp/2)):damage;
    if(move.effect===44)total*=2;total=Math.min(defender.hp,total);defender.hp=Math.max(0,defender.hp-total);this.draw();
    document.querySelector(`.battle-sprite.${playerSide?'enemy':'player'}`)?.classList.add('battle-flash');await new Promise(resolve=>setTimeout(resolve,300));
    if(effectiveness===0)await this.say('It doesn’t affect the opposing Pokémon…');else{if(critical)await this.say('A critical hit!');if(effectiveness>1)await this.say('It’s super effective!');if(effectiveness<1)await this.say('It’s not very effective…');}
    if(move.effect===48||slot<0){attacker.hp=Math.max(0,attacker.hp-Math.max(1,Math.floor((slot<0?attacker.maxHP:total)/4)));await this.say(`${attacker.name} is hit with recoil!`);}
    if(move.effect===3){attacker.hp=Math.min(attacker.maxHP,attacker.hp+Math.max(1,Math.floor(total/2)));await this.say(`${defender.name} had its energy drained!`);}
    if(defender.hp>0&&move.effect>=68&&move.effect<=74&&this.rng()*100<move.effectChance)await this.changeStage(defender,ds,move.effect-68,-1);
    if(defender.hp>0&&[2,4,5,6].includes(move.effect)&&this.rng()*100<move.effectChance)await this.inflict(defender,move.effect===2?'PSN':move.effect===4?'BRN':move.effect===5?'FRZ':'PAR');
    if(move.effect===31&&this.rng()*100<move.effectChance)this.flinch=true;
  }
  private async changeStage(mon:Mon,stages:Stages,index:number,amount:number){const key=(['atk','def','speed','spatk','spdef','accuracy','evasion'] as const)[index];const next=Math.max(-6,Math.min(6,stages[key]+amount));if(next===stages[key]){await this.say(`${mon.name}’s ${key} won’t go any ${amount>0?'higher':'lower'}!`);return;}stages[key]=next;await this.say(`${mon.name}’s ${({atk:'Attack',def:'Defense',speed:'Speed',spatk:'Sp. Atk',spdef:'Sp. Def',accuracy:'accuracy',evasion:'evasion'})[key]} ${amount>0?'rose':'fell'}!`);}
  private async inflict(mon:Mon,status:string){if(mon.status){await this.say('But it failed!');return;}const types=this.data.personal[mon.species].types;if((['PSN','TOX'].includes(status)&&types.some(t=>['TYPE_POISON','TYPE_STEEL'].includes(t)))||(status==='BRN'&&types.includes('TYPE_FIRE'))||(status==='FRZ'&&types.includes('TYPE_ICE'))){await this.say('It doesn’t affect the Pokémon…');return;}mon.status=status;if(status==='SLP')mon.sleepTurns=2+Math.floor(this.rng()*4);await this.say(`${mon.name} ${({PSN:'was poisoned!',TOX:'was badly poisoned!',PAR:'is paralyzed! It may be unable to move!',BRN:'was burned!',FRZ:'was frozen solid!',SLP:'fell asleep!'})[status as 'PSN']} `);}
  private async item(item:string){
    if(!this.state.bag[item])return false;
    if(item.endsWith('_BALL')){
      if(this.trainer!==null){await this.say('The Trainer blocked the Ball! Don’t be a thief!');return false;}
      this.state.bag[item]--;await this.say(`${this.state.name} used a ${titleCase(item)}!`);
      const multiplier=item==='ITEM_ULTRA_BALL'?20:item==='ITEM_GREAT_BALL'?15:10;const shakes=item==='ITEM_MASTER_BALL'?4:catchShakes(this.data.personal[this.enemy.species].catchRate,this.enemy.hp,this.enemy.maxHP,multiplier,this.enemy.status,this.rng);
      for(let i=0;i<Math.min(3,shakes);i++)await this.say('…');
      if(shakes===4){if(!giveMon(this.state,this.enemy)){await this.say('There is no room in the party or PC.');return true;}await this.say(`Gotcha! ${this.enemy.name} was caught!`);this.finish('caught');return true;}
      await this.say(['Oh, no! The Pokémon broke free!','Aww! It appeared to be caught!','Aargh! Almost had it!','Gah! It was so close, too!'][shakes]);return true;
    }
    const record=this.data.items.find(i=>i.item===item);if(!record)return false;
    const target=this.player;const before=target.hp,status=target.status;let amount=Number(record.hp_restore_param)||0;if(amount===255)amount=target.maxHP;
    if(record.hp_restore==='true')target.hp=Math.min(target.maxHP,target.hp+amount);
    const cure:Record<string,string>={PSN:'psn_heal',TOX:'psn_heal',PAR:'prz_heal',BRN:'brn_heal',FRZ:'frz_heal',SLP:'slp_heal'};if(record[cure[target.status]]==='true')target.status='';
    if(before===target.hp&&status===target.status){await this.say('It won’t have any effect.');return false;}
    this.state.bag[item]--;await this.say(`${this.state.name} used ${titleCase(item)}!`);return true;
  }
  private async gainExperience(){
    const base=this.data.personal[this.enemy.species],gain=Math.floor(Math.floor(base.expYield*this.enemy.level/7)*(this.trainer===null?1:1.5));const mon=this.player;mon.exp+=gain;await this.say(`${mon.name} gained ${gain} Exp. Points!`);
    const yields=['hp_yield','atk_yield','def_yield','speed_yield','spatk_yield','spdef_yield'];for(let i=0;i<6;i++){const total=mon.evs.reduce((a,b)=>a+b,0);mon.evs[i]+=Math.max(0,Math.min(Number(base[yields[i]])||0,255-mon.evs[i],510-total));}
    const growth=this.data.growth[this.data.personal[mon.species].growthRate];while(mon.level<100&&mon.exp>=growth[mon.level+1]){
      mon.level++;const previous=mon.maxHP;const next=calculateStats(this.data.personal[mon.species],mon.level,mon.ivs,mon.evs,mon.nature);mon.maxHP=next.maxHP;mon.stats=next.stats;mon.hp+=mon.maxHP-previous;await this.say(`${mon.name} grew to Lv. ${mon.level}!`);
      for(const learned of this.data.learnsets[mon.species].filter(m=>m.level===mon.level))if(!mon.moves.some(m=>m.id===learned.move)){
        const move=this.data.moves[learned.move];if(mon.moves.length<4){mon.moves.push({id:move.id,pp:move.pp,maxPP:move.pp});await this.say(`${mon.name} learned ${titleCase(move.key)}!`);}else{
          const replace=await this.ui.choose(`${mon.name} wants to learn ${titleCase(move.key)}.`,[...mon.moves.map(m=>`Forget ${titleCase(this.data.moves[m.id].key)}`),'Keep current moves']);if(replace<4)mon.moves[replace]={id:move.id,pp:move.pp,maxPP:move.pp};
        }
      }
    }
  }
}
