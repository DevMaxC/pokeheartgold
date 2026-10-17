// Compiler-only proof against the EXACT accepted presentation source. This is
// never imported by Main/Vite or emitted as a production audio implementation.
import {createEvolutionAudio} from '../../src/source/evolution-audio.ts';
import type {EvolutionAudioSession,EvolutionPresentationPorts} from './frozen-dependencies/presentation/evolution-presentation.ts';
declare const backend:ReturnType<typeof createEvolutionAudio>;
export const audioPort:EvolutionPresentationPorts['audio']=backend;
export const sceneSession:EvolutionAudioSession=null as unknown as ReturnType<typeof backend.open>;
