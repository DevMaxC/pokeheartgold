"""Export bounded original EvolutionScene audio silently, with exact SDAT inputs.

Offline SSEQ/sample rendering is not DS hardware/mixer capture. Requires the
same pinned DualRip/numpy/ndspy versions as export_hatch_music.py. --output
allows byte-reproducibility checks without rewriting the generated TS pin.
Cry lookup follows native numeric INFO bankNo=species, never SYMB-name guesses.
"""
from pathlib import Path
import argparse, hashlib, importlib.metadata, json, re, struct, subprocess, sys, wave

RENDERER_COMMIT = '80f878b0ebf100f391028bcef69f7c5743473770'
SDAT_SHA = '3b63b5b7aa7714a1906320be106beecebae89f8daf3988be699d41d4309454e6'
def check(ok, message):
    if not ok:
        raise SystemExit(message)
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--renderer', required=True, type=Path)
p.add_argument('--output', type=Path)
a = p.parse_args()
renderer = a.renderer.resolve()
check(subprocess.check_output(['git', '-C', str(renderer), 'rev-parse', 'HEAD'], text=True).strip() == RENDERER_COMMIT, 'Wrong renderer commit')
check(not subprocess.check_output(['git', '-C', str(renderer), 'status', '--porcelain', '--untracked-files=no'], text=True).strip(), 'Changed renderer')
for package, version in [('numpy', '2.2.6'), ('ndspy', '4.2.0')]:
    check(importlib.metadata.version(package) == version, 'Wrong package: '+package)
sys.path.insert(0, str(renderer))
import numpy as np
from dualrip.formats.sdat.sdat import SdatFile
from dualrip.engine.sdat.render import LiveRenderer
from dualrip.export import write_wav
from ndspy.soundArchive import SDAT

root = Path(__file__).resolve().parents[2]
source = root / 'files/data/sound/gs_sound_data.sdat'
native = source.read_bytes()
hash_bytes = lambda b: hashlib.sha256(b).hexdigest()
check(hash_bytes(native) == SDAT_SHA, 'Changed original SDAT')
output = a.output or root / 'browser/public/source/evolution-audio'
output.mkdir(parents=True, exist_ok=True)
u16 = lambda offset: struct.unpack_from('<H', native, offset)[0]
u32 = lambda offset: struct.unpack_from('<I', native, offset)[0]
symb, info, fat = u32(0x10), u32(0x18), u32(0x20)
def record(section, table, index):
    table_offset = section + u32(section + 8 + table * 4)
    check(index < u32(table_offset), 'SDAT index outside table')
    return section + u32(table_offset + 4 + index * 4)
def symbol(table, index):
    offset = record(symb, table, index)
    return native[offset:native.index(b'\0', offset)].decode('ascii')
def resource(file_id):
    offset, size = u32(fat + 12 + file_id * 16), u32(fat + 16 + file_id * 16)
    return {'fileId': file_id, 'offset': offset, 'size': size, 'sha256': hash_bytes(native[offset:offset+size])}
def seq_meta(sid):
    offset = record(info, 0, sid)
    return {'id': sid, 'key': symbol(0,sid), 'bank': u16(offset+4), 'volume': native[offset+6],
            'channelPriority': native[offset+7], 'playerPriority': native[offset+8], 'player': native[offset+9],
            'infoOffset': offset, 'infoSHA256': hash_bytes(native[offset:offset+12]), 'sequence': resource(u16(offset))}
archive, parsed = SdatFile(str(source)), SDAT(native)
tracks = {}
# Shared original files already owned by the accepted hatch exporter.
hatch_root = root / 'browser/public/source/hatching/music'
hatch = json.loads((hatch_root/'manifest.json').read_text())
check(hatch['sourceSHA256'] == SDAT_SHA, 'Different shared hatch source')
for sid in [1011,1188]:
    old = hatch['tracks'][str(sid)]
    check(hash_bytes((hatch_root/old['file']).read_bytes()) == old['wavSHA256'], 'Changed shared WAV')
    tracks[str(sid)] = {**seq_meta(sid), **{k:old[k] for k in ['frames','sampleRate','channels','bitsPerSample','loopFrames','wavSHA256']},
                        'url':'/source/hatching/music/'+old['file']}
commands = {0x80,0x81,0x93,0x95,0xC0,0xC1,0xC4,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCC,0xCD,0xE0,0xE1,0xE3,0xFD,0xFE,0xFF}
for sid in [1184,1510,1528,1529,1530,1531]:
    meta = seq_meta(sid)
    check(meta['bank'] == 700 and meta['player'] == (2 if sid == 1184 else 3), 'Unexpected Evolution player/bank')
    seq = parsed.sequences[sid][1]; seq.parse(); counts = {}
    for event in seq.events:
        name = type(event).__name__; counts[name] = counts.get(name,0)+1
        if name == 'RawDataSequenceEvent':
            check(bytes(event.data).strip(b'\xff\x00') == b'', 'Executable raw event')
        else:
            check(event.type < 0x80 or event.type in commands, (sid,name,event.type))
    arc = archive.sequence(sid); entry = arc.entries[0]
    res = meta['sequence']; start = res['offset']; event_offset = u32(start+0x18)
    check(arc.blob == native[start+event_offset:start+res['size']], 'Different native SSEQ payload')
    check(entry.name == meta['key'] and entry.bank_id == meta['bank'] and entry.volume == meta['volume'] and entry.cpr == meta['channelPriority'], 'Renderer INFO mismatch')
    bank, waves = archive.bank(meta['bank'])
    render = LiveRenderer(arc.blob,entry.offset,bank,waves,entry.volume,32768,player_prio=entry.cpr,loop_passes=1)
    chunks = []
    while not render.finished:
        chunk = render.step()
        if chunk is not None: chunks.append(chunk)
        check(render.emitted < 32768*30, 'Unexpected Evolution cue duration')
    audio = np.concatenate(chunks)
    check(np.max(np.abs(audio.astype(np.int32))) > 0 and not render.loop_marks, 'Silent or looping Evolution cue')
    target = output / f'{sid}-{meta["key"]}.wav'; write_wav(str(target),audio,32768,None)
    bank_record = record(info,2,meta['bank'])
    tracks[str(sid)] = {**meta,'url':'/source/evolution-audio/'+target.name,'frames':len(audio),'sampleRate':32768,
                       'channels':2,'bitsPerSample':16,'loopFrames':None,'wavSHA256':hash_bytes(target.read_bytes()),'eventCounts':counts,
                       'bankResource':resource(u16(bank_record)),
                       'waveArchives':[{'id':wid,'name':symbol(3,wid),**resource(u16(record(info,3,wid)))}
                                       for wid in [u16(bank_record+4+i*2) for i in range(4)] if wid != 65535]}
    print(json.dumps({'id':sid,'frames':len(audio),'wavSHA256':tracks[str(sid)]['wavSHA256']}),flush=True)
constants = {key:int(value) for key,value in re.findall(r'^#define\s+(SPECIES_\w+)\s+(\d+)\s*$',(root/'include/constants/species.h').read_text(),re.M)}
evo_source = root/'files/poketool/personal/evo.json'; evo = json.loads(evo_source.read_text())
pairs = sorted([{'before':constants[row['baseSpecies']], 'after':constants[e['target']], 'param':e['param']}
                for row in evo['evoTable'] for e in row['evos'] if e['method']=='EVO_LEVEL'],key=lambda r:(r['before'],r['after'],r['param']))
species = sorted(set(x[k] for x in pairs for k in ['before','after']))
check(len(pairs)==162 and len(species)==294, 'Changed ordinary EVO_LEVEL source frontier')
cryseq = seq_meta(2); check(cryseq['player']==0 and cryseq['volume']==120, 'Unexpected original PV metadata')
parsed.sequences[2][1].parse()
check([type(e).__name__ for e in parsed.sequences[2][1].events] == ['TempoSequenceEvent','InstrumentSwitchSequenceEvent','TrackVolumeSequenceEvent','PanSequenceEvent','NoteSequenceEvent','EndTrackSequenceEvent','RawDataSequenceEvent'], 'Unexpected cry SSEQ')
pv = [vars(e) for e in parsed.sequences[2][1].events]
check(pv == [{'type':225,'value':100}, {'type':129,'bankID':0,'instrumentID':0},
             {'type':193,'value':127}, {'type':192,'value':64},
             {'type':60,'velocity':127,'unknownFlag':False,'duration':0},
             {'type':255}, {'type':None,'data':b'\xff\x00\x00'}], 'Changed native PV sequence pitch/volume/envelope')
cries = {}
for sid in species:
    bank = parsed.banks[sid][1]
    check(len(bank.instruments)==1 and type(bank.instruments[0]).__name__=='SingleNoteInstrument', 'Unsupported native cry instrument')
    note = bank.instruments[0].noteDefinition
    check(vars(note)=={'waveID':0,'waveArchiveIDID':0,'pitch':60,'attack':127,'decay':127,'sustain':127,'release':127,'pan':64,'type':1}, 'Unexpected native cry envelope/pitch')
    check(len(bank.waveArchiveIDs)==1, 'Unsupported cry bank dependencies')
    wid = bank.waveArchiveIDs[0]; war = parsed.waveArchives[wid][1]
    check(len(war.waves)==1, 'Unsupported native cry SWAR')
    sample = war.waves[0]; check(int(sample.waveType)==0 and not sample.isLooped, 'Expected unlooped native PCM8 cry')
    swar = resource(u16(record(info,3,wid))); swar_offset = swar['offset']
    sample_offset = swar_offset + u32(swar_offset+0x3c)
    check(native[sample_offset+12:sample_offset+12+len(sample.data)] == sample.data, 'Cry PCM source mismatch')
    target = output/f'cry-{sid}.wav'
    with wave.open(str(target),'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(1);wav.setframerate(sample.sampleRate)
        wav.writeframes(bytes((value+128)&255 for value in sample.data))
    cries[str(sid)] = {'id':sid,'url':'/source/evolution-audio/'+target.name,'bank':sid,'bankName':symbol(2,sid),
                      'bankResource':resource(u16(record(info,2,sid))), 'waveArchive':{'id':wid,'name':symbol(3,wid),**swar},
                      'sourcePCMOffset':sample_offset+12,'signedPCMSourceSHA256':hash_bytes(sample.data),
                      'sampleRate':sample.sampleRate,'frames':len(sample.data),'channels':1,'bitsPerSample':8,'loopFrames':None,'volume':120,
                      'wavSHA256':hash_bytes(target.read_bytes())}
engine = sorted((renderer/'dualrip/engine/sdat').glob('*.py'))+sorted((renderer/'dualrip/formats/sdat').glob('*.py'))+[renderer/'dualrip/export.py']
manifest = {'version':1,'producerSHA256':hash_bytes(Path(__file__).read_bytes()),
            'sourceHashes':{p:hash_bytes((root/p).read_bytes()) for p in ['src/evolution_scene.c','src/sound_playback.c','src/sound.c','src/main.c','include/constants/species.h','include/constants/sndseq.h','files/poketool/personal/evo.json']},'source':str(source.relative_to(root)),'sourceSHA256':SDAT_SHA,
            'evolutionSource':str(evo_source.relative_to(root)),'evolutionSourceSHA256':hash_bytes(evo_source.read_bytes()),'pairs':pairs,
            'renderer':{'repository':'https://github.com/TetraSsky/DualRip','commit':RENDERER_COMMIT,'license':'MIT','numpy':'2.2.6','ndspy':'4.2.0',
                        'files':{str(f.relative_to(renderer)):hash_bytes(f.read_bytes()) for f in engine}},
            'policy':'Exact native INFO/SSEQ/bank/SWAR. Rendered sequence volumes baked once. Raw cry signed PCM8 -> unsigned WAV;120/127 PV gain applied by shared runtime. No MIDI, replacement music, normalization or fades.',
            'limitations':['Offline sequence/sample emulation is not DS hardware/DAC or global16-channel mixer capture.',
                           'Ordinary form0 EVO_LEVEL scene pairs only; no recorded Chatot, chorus, special-form or general evolution coverage.',
                           'The native15-count fanfare tail is runtime poll state, never baked into a wall-clock completion delay.'],
            'crySequence':cryseq,'tracks':tracks,'cries':cries}
encoded = (json.dumps(manifest,indent=2)+'\n').encode();(output/'resources.json').write_bytes(encoded)
if a.output is None:
    (root/'browser/src/source/evolution-audio-data.ts').write_text('// Generated by export_evolution_audio.py from exact original SDAT resources.\nexport const EVOLUTION_AUDIO_MANIFEST_SHA256='+repr(hash_bytes(encoded))+';\n')
print(json.dumps({'pairs':len(pairs),'cries':len(cries),'manifestSHA256':hash_bytes(encoded)}))
