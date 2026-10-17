"""Deliberate copied-source controls for Root PLAYER4 integration; fake audio only."""
from pathlib import Path
import argparse,hashlib,json,shutil,subprocess,tempfile
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
root=Path(__file__).resolve().parents[2];sha=lambda b:hashlib.sha256(b).hexdigest()
with tempfile.TemporaryDirectory(prefix='hg-root-menu-player4-controls-') as temporary:
 copy=Path(temporary);src=copy/'browser/src/source';src.mkdir(parents=True)
 for item in (root/'browser/src/source').glob('*.ts'):shutil.copy2(item,src/item.name)
 (copy/'browser/public').symlink_to(root/'browser/public',target_is_directory=True)
 (copy/'browser/reviews').symlink_to(root/'browser/reviews',target_is_directory=True)
 paths=['azalea-field-sound.ts','repel-audio.ts'];original={name:(src/name).read_text() for name in paths}
 cases=[
 ('before-root-P4-API','azalea-field-sound.ts',None,None,'one Root P4 and one existing hook',subprocess.check_output(['git','show','c2a026be:browser/src/source/azalea-field-sound.ts'],cwd=root,text=True)),
 ('omitted-P4-sound-phase','azalea-field-sound.ts','this.registry?.soundUpdate();this.menuRegistry?.soundUpdate();','this.registry?.soundUpdate();','actual Root after-tasks hook',None),
 ('reordered-existing-P3-phase','azalea-field-sound.ts','this.registry?.soundUpdate();this.menuRegistry?.soundUpdate();','this.menuRegistry?.soundUpdate();this.registry?.soundUpdate();','actual Root after-tasks hook',None),
 ('second-P4-registry-per-caller','azalea-field-sound.ts','if(this.menuRegistry)return this.menuRegistry;','if(false)return this.menuRegistry!;','one Root P4 and one existing hook',None),
 ('duplicate-menu-decode','repel-audio.ts','if(prepared.has(id)&&prepared.get(id)===null)return;','if(false)return;','concurrent menu preparation',None),
 ('SELECT-ignores-native-mute','repel-audio.ts','if(id===1500&&options.selectMuted)return', 'if(false)return','native SELECT-only mute',None),
 ('menu-report-kills-Root','azalea-field-sound.ts','this.menuError=error;transport.dispose();','this.fail(error);','menu diagnostics failure remains local',None),
 ('menu-ignores-action-lifetime','azalea-field-sound.ts','play(1500,owner,this.owner(signal),options)','play(1500,owner,this.owner(this.ports.signal),options)','menu dispatch needs prior actual preparation',None),
 ('old-menu-owner-disposes-newer-transport','azalea-field-sound.ts','cancelMenuOwner(owner:object){this.menuTransport?.cancelOwner(owner);}','cancelMenuOwner(owner:object){this.menuTransport?.dispose();}','cleanup from one menu owner',None),
 ('partial-P4-constructor-leaks-listener','azalea-field-sound.ts','}catch(error){registry.dispose();throw error;}','}catch(error){throw error;}','partial menu constructor failure',None),
 ]
 records=[]
 for name,path,before,after,pattern,historical in cases:
  value=original[path]
  if historical is None:
   assert before in value,(name,'missing mutation anchor');changed=value.replace(before,after)
  else:changed=historical
  (src/path).write_text(changed)
  run=subprocess.run(['node','--experimental-transform-types','--test','--test-name-pattern='+pattern,str(src/'menu-player4.test.ts')],cwd=copy,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30)
  raw=run.stdout.encode();(a.output/(name+'.log')).write_bytes(raw)
  expected='ERR_ASSERTION' in run.stdout or name=='before-root-P4-API' and 'preparePlayer4 is not a function' in run.stdout
  records.append({'name':name,'file':path,'sourceSHA256':sha(value.encode()),'changedSHA256':sha(changed.encode()),'testPattern':pattern,'qualification':'Historical API absence' if historical else 'Deliberate behavioral mutation','exitCode':run.returncode,'detected':run.returncode!=0 and expected,'logSHA256':sha(raw)})
  (src/path).write_text(value)
 receipt={'qualification':'Copied source only; no live edits/browser/audio/clock creation. Accepted P3 class is unchanged. API absence distinguished from assertion controls.','allDetected':all(r['detected'] for r in records),'cases':records}
 (a.output/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'allDetected':receipt['allDetected'],'cases':len(records)}));raise SystemExit(0 if receipt['allDetected'] else 1)
