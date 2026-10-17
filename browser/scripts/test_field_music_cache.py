import copy
import inspect
import hashlib
import unittest
from export_field_music import validate_loop
from encode_field_music import compatible_cache, INITIAL_CODEC_RECIPE, INITIAL_FFMPEG, encode, validate_input
from field_music_sequence import prove_payload

class NativeMusicProofRegressions(unittest.TestCase):
    def test_empty_stack_return_cannot_hide_random_command(self):
        with self.assertRaisesRegex(RuntimeError, 'Unverified reachable'):
            prove_payload(b'\xfd\xa0\x00\x00\x00\x00\x00\xff')
    def test_late_starting_track_does_not_pass_steady_window(self):
        marks=[100,200]
        rows=[{'track':0,'start':0,'end':100,'period':100},{'track':0,'start':100,'end':200,'period':100},
              {'track':1,'start':150,'end':250,'period':100},{'track':1,'start':250,'end':350,'period':100}]
        with self.assertRaisesRegex(RuntimeError,'starts after'):
            validate_loop(rows,marks,{'trackFlows':[]})
    def test_later_track_first_pass_cannot_leak_into_selected_window(self):
        rows=[{'track':0,'start':0,'end':100,'period':100},{'track':0,'start':100,'end':200,'period':100},
              {'track':1,'start':50,'end':150,'period':100},{'track':1,'start':150,'end':250,'period':100}]
        with self.assertRaisesRegex(RuntimeError,'starts after'):
            validate_loop(rows,[100,200],{'trackFlows':[]})
    def test_encoder_requires_current_export_flow_and_steady_loop_gates(self):
        catalog={'exporter':{'scriptSHA256':'abc','renderRecipeSHA256':'recipe'}}
        row={'validatedByScriptSHA256':'abc','renderRecipeSHA256':'recipe','controlFlow':{'method':'literal-offset-conservative-static-control-flow-v3','literalOffsetsAndOperandsVerified':True},'loopFrames':[1,2], 'loopProof':{'looping':True,'allNoteRestTracksLoop':True,'allTracksAlreadyOnSecondPass':True}}
        validate_input(row,catalog)
        for key in ['validatedByScriptSHA256','controlFlow','loopProof']:
            changed=copy.deepcopy(row);changed.pop(key)
            with self.assertRaises(RuntimeError):validate_input(changed,catalog)
    def test_nonlooping_note_or_rest_track_cannot_repeat_inside_loop(self):
        rows=[{'track':0,'start':0,'end':100,'period':100},{'track':0,'start':100,'end':200,'period':100}]
        for name in ['NoteSequenceEvent','RestSequenceEvent']:
            with self.assertRaisesRegex(RuntimeError,'nonlooping timed'):
                validate_loop(rows,[100,200],{'trackFlows':[{'track':1,'eventCounts':{name:1}}]})
        proof=validate_loop(rows,[100,200],{'trackFlows':[{'track':1,'eventCounts':{'TempoSequenceEvent':1}}]})
        self.assertEqual(proof['nonloopingImmediateUnvoicedTracks'],[1])
    def test_cache_requires_recipe_ffmpeg_loops_trim_and_original_dimensions(self):
        row={'pcmSHA256':'abc','frames':300,'loopFrames':[100,280]}
        previous={**row,'untrimmedRenderFrames':300,'frames':280,'codecProvenance':{'recipeSHA256':'recipe','ffmpeg':'ffmpeg'}}
        self.assertTrue(compatible_cache(previous,row,'recipe','ffmpeg'))
        for key,value in [('pcmSHA256','changed'),('frames',301),('loopFrames',[101,280]),('loopFrames',[100,279])]:
            changed={**row,key:value}
            self.assertFalse(compatible_cache(previous,changed,'recipe','ffmpeg'))
        self.assertFalse(compatible_cache(previous,row,'newrecipe','ffmpeg'))
        self.assertFalse(compatible_cache(previous,row,'recipe','newffmpeg'))
    def test_real_encoder_recipe_matches_initial_function_after_newline_normalization(self):
        recipe=hashlib.sha256(inspect.getsource(encode).rstrip('\n').encode()).hexdigest()
        self.assertEqual(recipe,INITIAL_CODEC_RECIPE)
    def test_legacy_cache_adoption_is_explicit_and_recipe_bounded(self):
        row={'pcmSHA256':'abc','frames':300,'loopFrames':[100,280]};old={**row,'untrimmedRenderFrames':300,'frames':280}
        self.assertFalse(compatible_cache(old,row,INITIAL_CODEC_RECIPE,INITIAL_FFMPEG))
        self.assertTrue(compatible_cache(old,row,INITIAL_CODEC_RECIPE,INITIAL_FFMPEG,True))
        self.assertFalse(compatible_cache(old,row,INITIAL_CODEC_RECIPE,'anotherffmpeg',True))
        self.assertFalse(compatible_cache(old,row,'anotherrecipe','ffmpeg',True))
if __name__=='__main__':
    unittest.main()
