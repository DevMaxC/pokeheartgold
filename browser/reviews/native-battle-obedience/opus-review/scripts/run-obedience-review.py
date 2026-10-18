from pathlib import Path
import subprocess,json,time,hashlib,datetime
p=Path('/tmp/hg-native-obedience-review-da88fecc-20261017')
manifest=json.loads((p/'input-manifest.json').read_text())
for row in manifest['files']:
 f=p/row['path'];assert f.is_file() and hashlib.sha256(f.read_bytes()).hexdigest()==row['sha256'],row['path'];f.chmod(0o444)
started=datetime.datetime.now(datetime.timezone.utc).isoformat();begin=time.monotonic()
with (p/'prompt.txt').open('rb') as prompt,(p/'result.json').open('wb') as out,(p/'stderr.log').open('wb') as err:
 result=subprocess.run(json.loads((p/'command.json').read_text()),cwd=p,stdin=prompt,stdout=out,stderr=err)
exitinfo={'exitCode':result.returncode,'startedUTC':started,'finishedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-begin}
(p/'exit.json').write_text(json.dumps(exitinfo,indent=2)+'\n')
mismatches=[]
for row in manifest['files']:
 f=p/row['path']
 if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=row['sha256']:mismatches.append(row['path'])
(p/'verification.json').write_text(json.dumps({'inputs':len(manifest['files']),'mismatches':mismatches,'allUnchanged':not mismatches},indent=2)+'\n')
print(json.dumps(exitinfo));print(json.dumps({'inputs':len(manifest['files']),'mismatches':mismatches}));
if (p/'result.json').stat().st_size:
 try:
  r=json.loads((p/'result.json').read_text());print(json.dumps({k:r.get(k) for k in ['type','subtype','is_error','duration_ms','num_turns','modelUsage','result']},indent=2))
 except Exception as e:print(str(e))
