from pathlib import Path
import json,hashlib,subprocess,datetime
p=Path('/tmp/hg-broad-opus-f21d568-review')
m=json.loads((p/'input-manifest.json').read_text());root=Path(m['snapshotRoot'])
result=json.loads((p/'result.json').read_text())
changed=[];missing=[]
for entry in m['files']:
 f=root/entry['path']
 if not f.exists() and not f.is_symlink():missing.append(entry['path']);continue
 raw=f.readlink().as_posix().encode() if f.is_symlink() else f.read_bytes()
 if hashlib.sha256(raw).hexdigest()!=entry['sha256']:changed.append(entry['path'])
status=subprocess.check_output(['git','status','--porcelain=v1'],cwd=root,text=True)
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
usage=result.get('modelUsage',{})
report={'verifiedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'inputCommit':m['inputCommit'],'headAfter':head,'trackedFilesVerified':len(m['files']),'missing':missing,'changed':changed,'gitStatusAfter':status,'sourceIntegrityPassed':not changed and not missing and not status and head==m['inputCommit'],'actualModelUsage':usage,'requestedModelPresent':any('claude-opus-5-5' in key for key in usage),'isError':result.get('is_error'),'numTurns':result.get('num_turns'),'durationMs':result.get('duration_ms'),'permissionDenials':result.get('permission_denials',[]),'rawResultSha256':hashlib.sha256((p/'result.json').read_bytes()).hexdigest(),'stderrSha256':hashlib.sha256((p/'stderr.log').read_bytes()).hexdigest()}
(p/'integrity-and-provider.json').write_text(json.dumps(report,indent=2)+'\n')
(p/'review.md').write_text(str(result.get('result',''))+'\n')
print(json.dumps(report,indent=2))
