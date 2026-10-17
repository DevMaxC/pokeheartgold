import type {GameData,Mon} from './types.ts';
import {moveName,titleCase} from './data.ts';
import {escapeHTML as esc} from './ui.ts';

export function partyPortrait(mon:Mon,eggIcon:string){return mon.isEgg?eggIcon:`/source/pokemon/${mon.species}-${mon.gender}-front.png`;}
export function partyHUD(mon:Mon,eggIcon:string){
  const label=mon.isEgg?mon.name:`${mon.name} Level ${mon.level}, ${mon.hp} HP`;
  return `<img src="${partyPortrait(mon,eggIcon)}" alt="${esc(label)}">`;
}
export function partyRow(mon:Mon,index:number,eggIcon:string){
  const details=mon.isEgg?'':`<p>Lv.${mon.level} · ${mon.hp}/${mon.maxHP} HP ${mon.status}</p><span class="hp-bar"><i style="width:${mon.hp/mon.maxHP*100}%"></i></span>`;
  return `<div class="list-row"><img src="${partyPortrait(mon,eggIcon)}" alt=""><div><b>${esc(mon.name)}</b>${details}</div><button data-party-slot="${index}" aria-label="Options for ${esc(mon.name)}">Choose</button></div>`;
}
/** trainer_memo.c: Egg Watch thresholds; normal summary windows stay hidden. */
export function eggWatchMessage(cycles:number,messages:Record<string,string>){
  return messages[String(cycles<=5?105:cycles<=10?106:cycles<=40?107:108)]??'';
}
export function partySummary(data:GameData,mon:Mon,eggIcon:string,eggMessages:Record<string,string>={}){
  if(mon.isEgg)return `<h2>${esc(mon.name)}</h2><img class="intro-portrait" src="${eggIcon}" alt="${esc(mon.name)}"><p>${esc(eggWatchMessage(mon.friendship,eggMessages)).replace(/\\n/g,'<br>')}</p>`;
  const base=data.personal[mon.species];
  return `<h2>${esc(mon.name)} <small>Lv.${mon.level}</small></h2><img class="intro-portrait" src="${partyPortrait(mon,eggIcon)}" alt="${esc(mon.name)}"><p>${base.types.filter((t,i,a)=>a.indexOf(t)===i).map(titleCase).join(' / ')} · OT ${esc(mon.ot)}<br>HP ${mon.hp}/${mon.maxHP} · Attack ${mon.stats.atk} · Defense ${mon.stats.def}<br>Sp. Atk ${mon.stats.spatk} · Sp. Def ${mon.stats.spdef} · Speed ${mon.stats.speed}</p>${mon.moves.map(slot=>`<div class="move-row"><span>${moveName(data,slot.id)}</span><span>PP ${slot.pp}/${slot.maxPP}</span></div>`).join('')}`;
}
