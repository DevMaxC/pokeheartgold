import {createHatchHostAudio as previous,UnsupportedHatchHostAudio} from './hatch-host-audio-old.ts';
import type {HatchHostAudioPorts} from './hatch-host-audio.ts';
export {UnsupportedHatchHostAudio};
export type {HatchHostAudioPorts,HatchHostAudioFailure} from './hatch-host-audio.ts';
// Only adapt the new getter ABI to the exact former captured boolean ABI.
export function createHatchHostAudio(ports:HatchHostAudioPorts){return previous({...ports,enabled:ports.enabled()});}
