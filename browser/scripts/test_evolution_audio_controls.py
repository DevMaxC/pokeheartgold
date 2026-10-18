"""Run scoped audio regressions against deliberate copied-source defects.
No browser, real audio, live-source edits or application build. Artifacts retain
all nonzero logs; the pre-feature parent intentionally lacks the new lease API.
"""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, tempfile
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
root=Path(__file__).resolve().parents[2];out=a.output;out.mkdir(parents=True,exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest()
with tempfile.TemporaryDirectory(prefix='hg-evolution-audio-controls-') as d:
    copy=Path(d);src=copy/'browser/src/source';src.mkdir(parents=True)
    for name in [x.name for x in (root/'browser/src/source').glob('*.ts')]:
        shutil.copy2(root/'browser/src/source'/name,src/name)
    deps=copy/'browser/reviews/native-evolution-audio/frozen-dependencies';shutil.copytree(root/'browser/reviews/native-evolution-audio/frozen-dependencies',deps)
    shutil.copy2(root/'browser/reviews/native-evolution-audio/binding-contract.ts',copy/'browser/reviews/native-evolution-audio/binding-contract.ts')
    (copy/'browser/node_modules').symlink_to((root/'browser/node_modules').resolve(),target_is_directory=True)
    for path in ['browser/public','browser/scripts','src','files','include','lib','tools']:
        target=copy/path;target.parent.mkdir(parents=True,exist_ok=True);target.symlink_to(root/path,target_is_directory=True)
    field=(src/'field-music.ts').read_text();audio=(src/'evolution-audio.ts').read_text()
    cases=[
      ('parent-before-feature','field-music.ts',None,None,'post-battle child leases',subprocess.check_output(['git','show','126e8cca:browser/src/source/field-music.ts'],cwd=root,text=True)),
      ('parent-preference-revival','field-music.ts','closed||abort.signal.aborted||silentParent||','closed||abort.signal.aborted||','post-battle child leases',None),
      ('parent-late-decoder-revival','field-music.ts','if(closed||silentParent)return;owned=','if(closed)return;owned=','a preference decoder started before child',None),
      ('parent-release-unmutes-battle','field-music.ts','if(child===lease)child=undefined;lease.released=true;','if(child===lease)child=undefined;silentParent=false;lease.released=true;','post-battle child leases',None),
      ('parent-aborted-release-loses-owner','field-music.ts','check(signal);if(child===lease)child=undefined;','if(child===lease)child=undefined;check(signal);','an aborted child release',None),
      ('parent-no-child-abort','field-music.ts',"abort.signal.addEventListener('abort',cancelChild,{once:true});",'','parent and player cancellation invalidate child',None),
      ('parent-does-not-pause-cue','field-music.ts','try{owned?.pause();}catch(error){child=undefined;','try{}catch(error){child=undefined;','post-battle child leases',None),
      ('fanfare-timer14','evolution-audio.ts','fanfareTimer=15;fanfarePending','fanfareTimer=14;fanfarePending','source fanfare pauses1011',None),
      ('fanfare-end-before-phase','evolution-audio.ts','if(foreground)return true;','if(foreground&&!foreground.finished)return true;','source fanfare pauses1011',None),
      ('fanfare-loses-background-unpause','evolution-audio.ts','try{background?.resume();}','try{}','source fanfare pauses1011',None),
      ('cry-wrong-volume','evolution-audio.ts','start(resources!.cries[species],EVOLUTION_CRY_PLAYER_REGISTER_GAIN)','start(resources!.cries[species],1)','cry follows source numeric bank',None),
      ('cry-end-before-phase','evolution-audio.ts','cryPlaying(){ready();return!!cry;}','cryPlaying(){ready();return!!cry&&!cry.finished;}','cry follows source numeric bank',None),
      ('global-SE-query-replaced-own-query','evolution-audio.ts','const v=ports.anySEPlaying();','const v=ports.player3.isPlaying(1510);','actual shared PLAYER3 allocation',None),
      ('glyph2-ignores-native-fanfare','evolution-audio.ts','case 2:return audio.fanfarePlaying();','case 2:return false;','muted entry creates no output',None),
      ('parent-abort-does-not-own-scene','evolution-audio.ts','[signal,lifetime.signal,lease.signal,owner.signal]','[signal,lifetime.signal,owner.signal]','no concurrent scene',None),
    ]
    cases.extend([
      ('state-suspension-never-clears-polls','evolution-audio.ts',"next.context.addEventListener('statechange',state);",'', 'owned cancellation cannot stop a newer foreign',None),
      ('cancel-leaves-counted-SE','evolution-audio.ts','cry=undefined;ports.player3.cancelOwner(seOwner);detach();','cry=undefined;detach();','cancel removes its still-counted PLAYER3 allocation',None),
      ('decoder-publishes-after-abort','evolution-audio.ts','const buffer=await observe(()=>out!.context.decodeAudioData(bytes),input);',"const buffer=await observe(()=>out!.context.decodeAudioData(bytes).then(buffer=>{buffers.set(asset.url,buffer);status(asset.id,'prepared');return buffer;}),input);",'ignored decoder completion after cancellation',None),
      ('muted-allocates-new-Context','evolution-audio.ts','if(value===null)return null;',"if(value===null){new globalThis.AudioContext();return null;}",'muted entry creates no output',None),
      ('ended-report-kills-root-clock','evolution-audio.ts',"status(v.id,'ended',undefined,true);","status(v.id,'ended');",'after-task ended reporting failure',None),
    ])
    # Exact original runtime, with import-only constants appended for NEW tests.
    # These test-only names do not alter its original per-stage4s algorithm.
    old_audio=subprocess.check_output(['git','show','33c4157f:browser/src/source/evolution-audio.ts'],cwd=root,text=True)
    compat="\n// Test-only export bridge; historical algorithm above is unchanged.\nexport const EVOLUTION_AUDIO_PREPARATION_BUDGET_MS=3000,EVOLUTION_AUDIO_PRESENTATION_WATCHDOG_MS=4000,EVOLUTION_CRY_PLAYER_REGISTER_GAIN=121/128;\n"
    cases.extend([
      ('historical33-total-deadline-conflict','evolution-audio.ts',None,None,'real presentation defaults outlive',old_audio+compat),
      ('historical33-ended-report-kills-clock','evolution-audio.ts',None,None,'after-task ended reporting failure',old_audio+compat),
      ('historical33-constructor-leaks-listeners','evolution-audio.ts',None,None,'failure to register the real global sound hook',old_audio+compat),
      ('parent-before-silent-API','field-music.ts',None,None,'technical pre-catalog failure',subprocess.check_output(['git','show','0b20e5bc:browser/src/source/field-music.ts'],cwd=root,text=True)),
      ('silent-fallback-clears-newer-owner-guard','field-music.ts','if(child||cueSession&&cueSession!==owner||interrupted&&!saved)', 'if(child)', 'a stale failed cue handle',None),
    ])
    receipts=[]
    for name,path,old,new,pattern,before in cases:
        original=field if path=='field-music.ts' else audio
        if before is None:
            assert old in original,(name,'missing mutation anchor');changed=original.replace(old,new,1)
        else: changed=before
        (src/path).write_text(changed)
        test='field-music.test.ts' if path=='field-music.ts' else 'evolution-audio-binding.test.ts' if name=='historical33-total-deadline-conflict' else 'evolution-audio.test.ts'
        command=['node','--experimental-transform-types','--test','--test-name-pattern='+pattern,str(src/test)]
        run=subprocess.run(command,cwd=copy,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30)
        raw=run.stdout.encode();(out/(name+'.log')).write_bytes(raw)
        expected='ERR_ASSERTION' in run.stdout or name=='parent-before-feature' and 'borrow is not a function' in run.stdout or name=='parent-before-silent-API' and 'startSilent is not a function' in run.stdout or name in ['ended-report-kills-root-clock','historical33-ended-report-kills-clock'] and 'ended diagnostic unavailable' in run.stdout
        receipts.append({'name':name,'file':path,'sourceSHA256':sha(original.encode()),'mutatedSHA256':sha(changed.encode()),'qualification':'API-absence control' if name in ['parent-before-feature','parent-before-silent-API'] else 'Exact historical runtime with test-only export bridge' if name.startswith('historical33') else 'Controlled behavioral mutation','testPattern':pattern,'exitCode':run.returncode,'detectedExpectedRegression':run.returncode!=0 and expected,'logSHA256':sha(raw)})
        (src/path).write_text(original)
    receipt={'qualification':'Copied-source negative controls. The pre-feature API absence is distinguished from behavioral AssertionError controls. No native hardware/global mixer claim.','allDetected':all(x['detectedExpectedRegression'] for x in receipts),'cases':receipts}
    (out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'allDetected':receipt['allDetected'],'cases':len(receipts)}));raise SystemExit(0 if receipt['allDetected'] else 1)
