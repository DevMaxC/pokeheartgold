from pathlib import Path
import json,hashlib,struct,subprocess
repo=Path('/Users/maxchurch/Documents/pokeheartgold-battle-evolution');p=repo/'files/poketool/personal/wotbl.narc';raw=p.read_bytes();assert raw[:4]==b'NARC';assert struct.unpack_from('<I',raw,8)[0]==len(raw)
o=struct.unpack_from('<H',raw,12)[0];blocks={}
while o<len(raw):
 key,size=struct.unpack_from('<4sI',raw,o);assert size>=8 and o+size<=len(raw);assert key not in blocks;blocks[key]=raw[o:o+size];o+=size
assert o==len(raw) and set(blocks)=={b'BTAF',b'BTNF',b'GMIF'}
fat=blocks[b'BTAF'];count=struct.unpack_from('<H',fat,8)[0];assert len(fat)==12+8*count;image=blocks[b'GMIF'][8:];files=[]
for i in range(count):
 start,end=struct.unpack_from('<II',fat,12+8*i);assert 0<=start<=end<=len(image);files.append(image[start:end])
parsed=[]
for b in files:
 rows=[];terminator=False
 for offset in range(0,len(b)-1,2):
  value=struct.unpack_from('<H',b,offset)[0]
  if value==65535:terminator=True;break
  rows.append({'level':value>>9,'move':value&511})
 assert terminator
 parsed.append(rows)
exported=json.loads((repo/'browser/public/source/learnsets.json').read_text());assert parsed==exported
r={'qualification':'Supplemental read-only raw native NARC/importer provenance check after actual follow-up; not a new reviewed runtime or a native levelupdata assembly claim. No importer execution or generated source rewrite. A direct bounded NARC BTAF/GMIF decoder is used because ndspy is not installed in system Python.','sourceCommit':'2c4f516af1d7cd657fa0fdb963f694a88aa2331e','nativePath':str(p.relative_to(repo)),'nativeSHA256':hashlib.sha256(raw).hexdigest(),'nativeGitBlob':subprocess.check_output(['git','rev-parse','HEAD:'+str(p.relative_to(repo))],cwd=repo,text=True).strip(),'importerSHA256':hashlib.sha256((repo/'browser/scripts/import_source.py').read_bytes()).hexdigest(),'exportedSHA256':hashlib.sha256((repo/'browser/public/source/learnsets.json').read_bytes()).hexdigest(),'allRecords':len(parsed),'allRecordRowsEqual':True,'species171RawRecordHex':files[171].hex(),'species171Level27':[r for r in parsed[171]if r['level']==27]}
Path('/tmp/hg-battle-evolution-native-learnsets-proof.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
