import type {Mon} from './types.ts';

export type NativeBattleOutcome='won'|'lost'|'caught'|'ran';
/** Non-destructive completion record. Mon references identify the native slots. */
export type BattleEvolutionCompletion={
 readonly serial:number;
 readonly result:NativeBattleOutcome;
 readonly levelUpMask:number;
 readonly party:readonly Mon[];
 /** A later Battle.start invalidates this record even with the same mons. */
 readonly isCurrent:()=>boolean;
};

/** Detached display data; the scene never receives the live party object. */
export type EvolutionMonSnapshot=Readonly<Omit<Mon,'moves'|'ivs'|'evs'|'stats'|'provenance'>> & {
 readonly moves:readonly Readonly<Mon['moves'][number]>[];
 readonly ivs:readonly number[];readonly evs:readonly number[];
 readonly stats:Readonly<Mon['stats']>;
 readonly provenance?:Readonly<NonNullable<Mon['provenance']>>;
};

/** Battle_022378C0 passes flags3: PRINT_WHAT and CAN_CANCEL. */
export type BattleEvolutionScene={
 readonly flags:3;
 readonly partyIndex:number;
 readonly before:EvolutionMonSnapshot;
 readonly after:EvolutionMonSnapshot;
 readonly method:number;
 readonly methodKey:string;
 readonly param:number;
};

export type EvolutionCongratulations={readonly nickname:string;readonly speciesName:string};

/**
 * EvolutionScene's native state boundaries, in this exact order. The view
 * drives readiness/polls; the controller alone changes gameplay State.
 * evolve: EVO_STATE_EVOLVE, after the new picture/cry completion gates.
 * register: EVO_STATE_REGISTER, after congratulations text and40 frames.
 * learnMoves: EVO_STATE_TRY_LEARN_MOVE through its awaited native menus.
 * finish: successful final fade, where ApplyEvolutionEffects is called.
 * A B-cancel admitted in OSCILLATE invokes none of these callbacks.
 */
export type BattleEvolutionCallbacks={
 evolve:()=>EvolutionCongratulations;
 register:()=>void;
 learnMoves:()=>Promise<void>;
 finish:()=>void;
};

/** Cancellation is an ordinary native result. Technical failure must throw. */
export type BattleEvolutionScenePort=(scene:BattleEvolutionScene,callbacks:BattleEvolutionCallbacks,signal?:AbortSignal)=>Promise<'evolved'|'cancelled'>;

/** A final, confirmed result of the native move-learning dialogue/summary. */
export type EvolutionMoveChoice={kind:'replace';slot:number}|{kind:'decline'};
export type EvolutionMoveRequest={
 readonly mon:EvolutionMonSnapshot;
 readonly move:number;
 readonly existing:readonly Readonly<Mon['moves'][number]>[];
 readonly unforgettablyHM:readonly boolean[];
};
export type EvolutionLearningEvent=
 |{kind:'learned';mon:EvolutionMonSnapshot;move:number;replaced:number|null}
 |{kind:'declined';mon:EvolutionMonSnapshot;move:number}
 |{kind:'forget';mon:EvolutionMonSnapshot;move:number;forgotten:number};
