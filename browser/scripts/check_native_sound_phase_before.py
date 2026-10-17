#!/usr/bin/env python3
"""Old phase admission/order controls: API-only instrumentation, never a production patch."""
from pathlib import Path
import difflib
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BASE = '354223cb'


def main():
    source = subprocess.check_output(['git', 'show', BASE + ':browser/src/source/native-field-clock.ts'], cwd=ROOT, text=True)
    assert hashlib.sha256(source.encode()).hexdigest() == '7202dc98d46c46b2655c24f441d1b5ace51e687214b2e3a4cf1152def575f962'
    # Add observation API only. Deliberately retain the OLD empty-scope early
    # return, old field-cancel boundary abort, and tempting early task binding.
    before = source.replace(' private scopes=new Set<Scope>();', ' private afterTasks=new Set<(frame:NativeFieldFrame)=>void>();private scopes=new Set<Scope>();')
    before = before.replace(' createScope(map:number,owner:AbortSignal)', ''' onAfterTasks(callback:(frame:NativeFieldFrame)=>void,owner:AbortSignal){this.afterTasks.add(callback);const remove=()=>this.afterTasks.delete(callback);owner.addEventListener('abort',remove,{once:true});return remove;}
 createScope(map:number,owner:AbortSignal)''')
    before = before.replace("this.phase='tasks';\n   for(const scope", "this.phase='tasks';for(const callback of[...this.afterTasks])callback({tick:this.tick,...this.field()});\n   for(const scope")
    assert 'if(![...this.scopes].some(s=>s.waits.size||s.dispatches.size||s.tasks.size))return;' in before
    dependency = ROOT / 'browser/reviews/native-sound-phase/frozen-azalea-dependency'
    tests = '''import test from 'node:test';import assert from 'node:assert/strict';import{NativeFieldClock}from './before.ts';
const signal=()=>new AbortController();const field=()=>({map:180,mapRunning:false});
test('old empty-scope admission silently skips a registered global sound hook',async()=>{const lifetime=signal(),clock=new NativeFieldClock({field,onError:reason=>{throw reason;}});let calls=0;clock.onAfterTasks(()=>calls++,lifetime.signal);try{clock.frame(1/30);await clock.settled();assert.equal(calls,1);}finally{clock.dispose();lifetime.abort();}});
test('old map cancellation aborts an admitted global update',async()=>{const lifetime=signal(),clock=new NativeFieldClock({field,onError:reason=>{throw reason;}}),scope=clock.createScope(180,signal().signal);let calls=0;scope.onTick(()=>{});clock.onAfterTasks(()=>calls++,lifetime.signal);try{clock.frame(1/30);clock.cancel(Error('map transition'));await clock.settled();assert.equal(calls,1);}finally{clock.dispose();lifetime.abort();}});
'''
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder)
        (path / 'before.ts').write_text(before)
        (path / 'before.test.ts').write_text(tests)
        result = subprocess.run(['node', '--experimental-transform-types', '--test', str(path / 'before.test.ts')], capture_output=True, text=True)
    assert result.returncode == 1 and '# fail 2' in result.stdout, result.stdout + result.stderr
    target = ROOT / 'browser/reviews/native-sound-phase'
    (target / 'before-controls.txt').write_text(result.stdout + result.stderr)
    (target / 'before-api-only-instrumentation.diff').write_text(''.join(difflib.unified_diff(source.splitlines(keepends=True), before.splitlines(keepends=True), fromfile='original-354223cb', tofile='API-observation-only-before-harness')))
    print(json.dumps({'status': '2/2 EXPECTED FAIL (old source with API-only observation instrumentation)', 'originalSHA256': hashlib.sha256(source.encode()).hexdigest(), 'instrumentedSHA256': hashlib.sha256(before.encode()).hexdigest(), 'limitation': 'Instrumented old clock observation API, not a previously shipped API or production patch. Actual old empty-scope early exit/map-boundary abort unchanged. Early-order negative uses real registry in current Node suite.'}, indent=2))


if __name__ == '__main__':
    main()
