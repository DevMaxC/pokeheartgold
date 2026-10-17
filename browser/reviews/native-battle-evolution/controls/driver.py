from pathlib import Path
import shutil,subprocess,json,hashlib,time
repo=Path('/Users/maxchurch/Documents/pokeheartgold-battle-evolution');out=Path('/tmp/hg-battle-evolution-controls-2c4f516a-v5');p=out/'project';out.mkdir(exist_ok=True)
for folder in ['browser/src/source','browser/public/source']:
 d=p/folder;d.mkdir(parents=True,exist_ok=True)
 for f in (repo/folder).iterdir():
  if f.is_file() and (f.suffix in ['.ts','.json']):shutil.copy2(f,d/f.name)
(p/'browser/public/source/messages').mkdir(exist_ok=True);shutil.copy2(repo/'browser/public/source/messages/302.json',p/'browser/public/source/messages/302.json')
for f in ['src/pokemon.c','src/battle/battle_system.c']:
 (p/f).parent.mkdir(parents=True,exist_ok=True);shutil.copy2(repo/f,p/f)
(p/'browser/node_modules').symlink_to(repo/'browser/node_modules',target_is_directory=True) if not (p/'browser/node_modules').exists() else None
runtime='browser/src/source/battle-evolution.ts';battle='browser/src/source/battle.ts';integration='browser/src/source/battle-evolution-integration.test.ts';original={f:(p/f).read_text()for f in [runtime,battle,integration]}
rows=[]
def run(name,pattern,files):
 command=['node','--experimental-transform-types','--test']
 if pattern:command+=['--test-name-pattern='+pattern]
 command+=files;start=time.time();r=subprocess.run(command,cwd=p,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);log=out/(name+'.log');log.write_text(r.stdout)
 rows.append({'name':name,'exitCode':r.returncode,'durationMs':round((time.time()-start)*1000),'command':command,'log':log.name,'logSHA256':hashlib.sha256(log.read_bytes()).hexdigest()});return r
base=run('current-23',None,['browser/src/source/battle-evolution.test.ts','browser/src/source/battle-evolution-integration.test.ts']);assert base.returncode==0,base.stdout
old=subprocess.check_output(['git','show','3a9a9b977b39d7f4f1106f197c8359e90931ccd8:'+battle],cwd=repo,text=True);(p/battle).write_text(old);r=run('old-3a-completion-fail','fresh Cyndaquil5',['browser/src/source/battle-evolution-integration.test.ts']);assert r.returncode!=0 and 'AssertionError'in r.stdout,r.stdout;(p/battle).write_text(original[battle])
mutations=[
 ('outer-abort-disconnected',runtime,"signal?.addEventListener('abort',abort,{once:true});",'', 'outer abort during','battle-evolution.test.ts'),
 ('concurrent-owner-unchecked',runtime,"if(this.running)throw Error('A native evolution batch already owns the field');",'', 'a concurrent run','battle-evolution.test.ts'),
 ('custom-nickname-overwritten',runtime,"if(!metadata.hasNickname)mon.name=speciesName(data,mon.species);","mon.name=speciesName(data,mon.species);", 'source register boundary','battle-evolution.test.ts'),
 ('cancel-then-failure-loses-bit',runtime,'this.consumed.set(completion,consumed);throw error;','this.consumed.set(completion,completion.levelUpMask);throw error;', 'a native cancel followed','battle-evolution.test.ts'),
 ('only-first-target-level-move',runtime,'for(const row of data.learnsets[mon.species]??[]){','for(const row of (data.learnsets[mon.species]??[]).filter(row=>row.level===mon.level).slice(0,1)){', 'actual Lanturn27','battle-evolution.test.ts'),
 ('shrinking-max-not-capped',runtime,'Math.min(mon.hp,calculated.maxHP)','mon.hp', 'unchanged native HP tail','battle-evolution.test.ts'),
 ('capture-party-record-truncated',battle,'party:Object.freeze([...this.state.party])','party:Object.freeze(this.state.party.slice(0,1))', 'a real successful capture','battle-evolution-integration.test.ts'),
 ('fixture-guesses-missing-nickname',integration,"metadata:mon=>{assert.equal(typeof mon.hasNickname,'boolean','the fixture must provide native metadata, not infer a missing flag');return{form:0,hasNickname:mon.hasNickname!};}","metadata:mon=>({form:0,hasNickname:mon.hasNickname===true})", 'actual battle integration fixture','battle-evolution-integration.test.ts'),

 ('stale-prior-battle-admitted',runtime,"if(!completion.isCurrent())throw Error('Stale native battle evolution completion');",'', 'no-level battles','battle-evolution-integration.test.ts'),
 ('bit-on-any-xp',battle,'const mon=this.state.party[reward.index],growth=this.data.growth[this.data.personal[mon.species].growthRate];','const mon=this.state.party[reward.index],growth=this.data.growth[this.data.personal[mon.species].growthRate];this.levelUpEvolutionMask|=1<<reward.index;','no-level battles','battle-evolution-integration.test.ts'),
 ('bits-carry-between-battles',battle,'this.levelUpEvolutionMask=0;this.latestEvolutionCompletion=null;\n    this.tutorial','this.latestEvolutionCompletion=null;\n    this.tutorial','fresh Cyndaquil5','battle-evolution-integration.test.ts'),
 ('revive-fainted-evolution',runtime,'const hp=mon.hp===0?0:','const hp=','one bit never chains','battle-evolution.test.ts'),
 ('rename-before-source-register',runtime,"Object.assign(mon.stats,preview.stats);sceneState.phase='evolved';","Object.assign(mon.stats,preview.stats);if(!metadata.hasNickname)mon.name=speciesName(data,mon.species);sceneState.phase='evolved';",'native starter targets','battle-evolution.test.ts'),
 ('cancel-bit-not-consumed',runtime,'summary.cancelled.push(index);','summary.cancelled.push(index);this.consumed.set(completion,(this.consumed.get(completion)??0)&~bit);','native cancellation consumes','battle-evolution.test.ts'),
 ('failure-loses-pending-bits',runtime,'this.consumed.set(completion,consumed);throw error;','this.consumed.set(completion,completion.levelUpMask);throw error;','technical failure restores','battle-evolution.test.ts'),
 ('no-owned-menu-drain',runtime,'await Promise.allSettled(tasks);','void Promise.allSettled(tasks);','owned move UI aborts','battle-evolution.test.ts'),
 ('forget-native-hm',runtime,"if(request.unforgettablyHM[choice.slot])throw Error('Native evolution summary cannot forget an HM');",'', 'source evolution move summary','battle-evolution.test.ts'),
]
for name,file,old,new,pattern,test in mutations:
 assert original[file].count(old)==1,(name,original[file].count(old))
 (p/file).write_text(original[file].replace(old,new));r=run(name,pattern,['browser/src/source/'+test]);(p/file).write_text(original[file]);assert r.returncode!=0 and ('AssertionError'in r.stdout or (name=='outer-abort-disconnected' and ('testTimeoutFailure'in r.stdout or ('cancelledByParent'in r.stdout and 'Promise resolution is still pending'in r.stdout)))),name+' invalid control '+r.stdout
receipt={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip(),'runtimeSourceSHA256':{f:hashlib.sha256((repo/f).read_bytes()).hexdigest()for f in [runtime,battle]},'qualification':'Copied exact current source/data, fake UI/audio only. Native C queue/HP tests compile isolated fixtures, no app build. Seventeen targeted semantic mutation controls (outer-abort disconnection is detected as a never-resolving owned promise/cancelled test; others require AssertionError) and exact reviewed old3a Battle source must fail meaningful assertions; not independent fullgame validation.','results':rows}
(out/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'path':str(out),'currentPass':base.returncode==0,'oldFail':rows[1]['exitCode'],'mutantsCaught':len(rows)-2}))
