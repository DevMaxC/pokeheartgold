// src/field/encounter_check.c: land/surf two-stage roll and reverse-turn boost.
// Ability, held-item, flute and radio modifiers are separate parity requirements.
export class EncounterChecks{
  inhibitSteps=0;reverseTurns=0;lastFacing=0;
  reset(){this.inhibitSteps=0;this.reverseTurns=0;}
  step(){this.inhibitSteps=Math.min(0xffff,this.inhibitSteps+1);}
  roll(rate:number,facing:number,running:boolean,veryTallGrass=false,rng:()=>number=Math.random){
    if(this.inhibitSteps<=3||rate<=0)return false;
    if((facing===0&&this.lastFacing===1)||(facing===1&&this.lastFacing===0)||(facing===2&&this.lastFacing===3)||(facing===3&&this.lastFacing===2))this.reverseTurns=Math.min(0xffff,this.reverseTurns+1);
    this.lastFacing=facing;
    const boost=this.reverseTurns>=4?60:this.reverseTurns===3?40:this.reverseTurns===2?30:0;
    const movementRate=Math.min(100,(running?40:20)+(veryTallGrass?40:0)+boost);
    return Math.floor(rng()*100)<movementRate&&Math.floor(rng()*100)<Math.min(100,rate);
  }
}
export function landSlot(rng:()=>number=Math.random){const weights=[20,20,10,10,10,10,5,5,4,4,1,1];let pick=Math.floor(rng()*100),slot=0;while(slot<11&&pick>=weights[slot])pick-=weights[slot++];return slot;}
