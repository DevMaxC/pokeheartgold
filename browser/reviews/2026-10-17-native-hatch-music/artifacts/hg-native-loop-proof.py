import sys,json,hashlib
sys.path.insert(0,'/tmp/hg-dualrip-native-audio')
from dualrip.formats.sdat.sdat import SdatFile
from dualrip.engine.sdat.render import LiveRenderer
from dualrip.engine.sdat.sequencer import Player
import numpy as np
records=[];original=Player.mark_loop
def measured(self,start,end,track=None):
 records.append({'track':track.num if track else None,'start':start,'end':end,'length':end-start});return original(self,start,end,track)
Player.mark_loop=measured
s=SdatFile('/Users/maxchurch/Documents/pokeheartgold/files/data/sound/gs_sound_data.sdat');a=s.sequence(1011);e=a.entries[0];b,w=s.bank(e.bank_id);r=LiveRenderer(a.blob,e.offset,b,w,e.volume,32768,player_prio=e.cpr,loop_passes=2);chunks=[]
while not r.finished:
 c=r.step()
 if c is not None:chunks.append(c)
print(json.dumps({'owner':r.ply._loop_owner.num,'marks':r.loop_marks,'records':records,'pcmHash':hashlib.sha256(np.concatenate(chunks).tobytes()).hexdigest()},indent=2))
