import type {Mon,MoveData} from './types.ts';

/** Presentation never decides damage, turn order, capture odds or story results. */
export interface BattleView {
  readonly location:string;
  begin(player:Mon,enemy:Mon,trainer?:boolean):Promise<void>;
  sync(player:Mon,enemy:Mon):void;
  attack(playerSide:boolean,move:MoveData):Promise<void>;
  hit(playerSide:boolean):Promise<void>;
  capture(shakes:number):Promise<void>;
  orbit(amount:number):void;
  end():void;
}
