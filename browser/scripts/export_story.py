"""Import phone script definitions and version constants from the original C data."""
from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'browser/public/source'
constants=json.loads((OUT/'constants.json').read_text())
for name,value in re.findall(r'^#define\s+(VERSION_\w+)\s+(\d+)',(ROOT/'include/config.h').read_text(),re.M):constants[name]=int(value)
for name,base,shift in re.findall(r'^#define\s+(PLAYER_TRANSITION_\w+)\s+(\d+)\s*<<\s*(\d+)',(ROOT/'include/constants/global_fieldmap.h').read_text(),re.M):constants[name]=int(base)<<int(shift)
constants['GAME_VERSION']=constants['VERSION_HEARTGOLD']
(OUT/'constants.json').write_text(json.dumps(constants,separators=(',',':'))+'\n')
text=(ROOT/'src/application/pokegear/phone/phone_script_defs.c').read_text();scripts={}
for id,block in re.findall(r'// PHONE_SCRIPT_(\d+)\s*\n\s*\{(.*?)\n\s*\},',text,re.S):
 messages=re.search(r'\.msgIds\s*=\s*\{\s*msg_(\d+)_(\d+),\s*msg_(\d+)_(\d+)\s*\}',block)
 if not messages:raise ValueError(id)
 fields=dict(re.findall(r'\.(scriptType|param0|param1)\s*=\s*([^,\n]+)',block))
 scripts[id.lstrip('0') or '0']={'messages':[[int(messages[1]),int(messages[2])],[int(messages[3]),int(messages[4])]],**fields}
elm=(ROOT/'src/application/pokegear/phone/scripts/phone_scripts_prof_elm.c').read_text();rows=re.search(r'sPhoneCallData_ProfElm_MapScripts\[\]\[2\] = \{(.*?)\n\};',elm,re.S)[1]
elm_map=[int(id)for id in re.findall(r'\{\s*0,\s*PHONE_SCRIPT_(\d+)\s*\}',rows)]
(OUT/'phone.json').write_text(json.dumps({'scripts':scripts,'elmMapScripts':elm_map},separators=(',',':'))+'\n')
print(f'Imported {len(scripts)} phone scripts and {len(elm_map)} scripted Elm calls.')
spawns={}
for row in re.findall(r'^\s*spawn (.+)$',(ROOT/'asm/spawn_warp_data.s').read_text(),re.M):
 fields=[value.strip()for value in row.split(',')]
 if len(fields)!=12:continue
 def number(value):return constants[value] if value in constants else int(value,0)
 values=list(map(number,fields));id=len(spawns)+1
 spawns[id]={'id':id,'flag':values[0],'blackout':bool(values[1]),'fly':bool(values[2]),'death':{'map':values[3],'x':values[4]+.5,'z':values[5]+.5,'facing':0},'landing':{'map':values[6],'x':values[7]+.5,'z':values[8]+.5,'facing':1},'special':{'map':values[9],'x':values[10]+.5,'z':values[11]+.5,'facing':1}}
assert len(spawns)==30
(OUT/'spawns.json').write_text(json.dumps(spawns,separators=(',',':'))+'\n')
gender_block=re.search(r'sTrainerGenders\[\] = \{(.*?)\n\};',(ROOT/'src/trainer_data.c').read_text(),re.S)[1]
genders={name:gender for gender,name in re.findall(r'(TRAINER_\w+),\s*//\s*(TRAINERCLASS_\w+)',gender_block)}
prizes={name:int(value,0)for name,value in re.findall(r'^\s*\.short (TRAINERCLASS_\w+),\s*(\w+)',(ROOT/'asm/overlay_12_battle_command.s').read_text(),re.M)}
(OUT/'trainer-rules.json').write_text(json.dumps({'genders':genders,'prizes':prizes},separators=(',',':'))+'\n')
names={key:json.loads((OUT/f'messages/{bank}.json').read_text())for key,bank in {'species':237,'speciesIndefinite':238,'items':222,'itemsIndefinite':223,'itemsPlural':224,'pockets':226,'trainerClasses':730,'moves':750}.items()}
(OUT/'names.json').write_text(json.dumps(names,separators=(',',':'),ensure_ascii=False)+'\n')
