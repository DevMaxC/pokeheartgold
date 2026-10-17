from pathlib import Path
import json,hashlib,tarfile,gzip,io,shutil,datetime,sys,re
packet=Path(sys.argv[1]);repo=Path('/Users/maxchurch/Documents/pokeheartgold-evolution-art-identity')
execution=json.loads((packet/'execution.json').read_text());assert execution['status']=='completed'and execution['exitCode']==0
integrity=json.loads((packet/'integrity-after.json').read_text());assert not any(integrity[k]for k in ['changed','unexpected','missing']);assert integrity['sourceManifestUnchanged']and integrity['promptUnchanged']
manifest=json.loads((packet/'source-manifest.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
dest=repo/'browser/reviews/native-evolution-art-identity'/('opus-'+execution['commit'][:8]);assert not dest.exists();dest.mkdir()
for name in ['raw-result.json','review-prompt.txt','execution.json','source-manifest.json','integrity-after.json','stderr.txt','scoped.patch']:
 shutil.copyfile(packet/name,dest/name)
shutil.copytree(packet/'validation',dest/'validation')
archive=dest/'complete-source-inputs.tar.gz'
with archive.open('wb')as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0)as gz,tarfile.open(fileobj=gz,mode='w|')as tar:
 for name,item in sorted(manifest['files'].items()):
  data=(packet/name).read_bytes();assert sha(data)==item['sha256'];assert hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest()==item['gitBlob'];info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o444;info.mtime=0;info.uid=info.gid=0;info.uname=info.gname='';tar.addfile(info,io.BytesIO(data))
rawResult=json.loads((dest/'raw-result.json').read_text())
testLog=(dest/'validation'/'hg-evolution-art-identity-tests.log').read_text();total=re.search(r'^# tests (\d+)$',testLog,re.M).group(1);passed=re.search(r'^# pass (\d+)$',testLog,re.M).group(1)
receipt={'candidateCommit':execution['commit'],'snapshotGraphSHA256':manifest['graphSHA256'],'snapshotInputs':manifest['fileCount'],'copiedSourceArchiveSHA256':sha(archive.read_bytes()),'rawResultSHA256':sha((dest/'raw-result.json').read_bytes()),'modelUsage':rawResult.get('modelUsage'),'numTurns':rawResult.get('num_turns'),'durationMs':rawResult.get('duration_ms'),'scope':'Evolution art OT/legacy browser identity policy only; no Main/controller/World/audio/timing/GPU/browser/build approval','status':'Awaiting manual adjudication','validation':{'Node':passed+'/'+total+' PASS','TSC':'exit0','nativeIdentityWitness':'Separate actualfactory/Caudit retained outside immutable review graph'},'packagedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(dest/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
checks={str(p.relative_to(dest)):sha(p.read_bytes())for p in sorted(dest.rglob('*'))if p.is_file()}
(dest/'packet-checksums.json').write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps({'dest':str(dest),'archiveBytes':archive.stat().st_size,'archiveSHA256':receipt['copiedSourceArchiveSHA256'],'inputs':len(manifest['files'])}))
