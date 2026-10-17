import unittest
from ndspy.soundSequence import (EndTrackSequenceEvent, JumpSequenceEvent, RawDataSequenceEvent,
                                IfSequenceEvent, CallSequenceEvent, saveSequenceEvents)
from field_music_sequence import prove_payload

class NativeControlFlowProof(unittest.TestCase):
    def prove(self, events):
        return prove_payload(bytes(saveSequenceEvents(events)[0]))
    def test_dead_compiler_tail_after_end_is_not_executed(self):
        proof = self.prove([EndTrackSequenceEvent(), RawDataSequenceEvent(b'\x81\x17\xff')])
        self.assertEqual(proof['reachableInstructions'], 1)
        self.assertEqual(proof['unreachableByteRanges'][0]['offset'], 1)
    def test_reachable_unknown_rejects(self):
        with self.assertRaisesRegex(RuntimeError, 'Unverified reachable'):
            prove_payload(b'\xd8\xff')
    def test_unconditional_jump_does_not_admit_dead_fallthrough(self):
        end = EndTrackSequenceEvent()
        proof = self.prove([JumpSequenceEvent(end), RawDataSequenceEvent(b'\x81\x17'), end])
        self.assertEqual(proof['reachableInstructions'], 2)
    def test_call_continuation_still_checked(self):
        end = EndTrackSequenceEvent()
        with self.assertRaisesRegex(RuntimeError, 'Unverified reachable'):
            self.prove([CallSequenceEvent(end), RawDataSequenceEvent(b'\xd8'), end])
    def test_conditional_commands_are_not_silently_admitted(self):
        with self.assertRaisesRegex(RuntimeError, 'Unverified reachable'):
            self.prove([IfSequenceEvent(), EndTrackSequenceEvent()])
    def test_fixed_native_counter_assignment_and_nonminimal_varints(self):
        proof = prove_payload(b'\xb0\x00\x2b\x00\x80\x80\x20\xff')
        self.assertEqual(proof['reachableEventCounts']['VariableAssignmentSequenceEvent'], 1)
        self.assertEqual(proof['nonminimalZeroVarints'], [{'offset': 4, 'extraZeroGroups': 1}])
    def test_literal_offsets_skip_unreachable_nonpadding_and_reject_unknown_reachable(self):
        proof = prove_payload(b'\x94\x06\x00\x00\xa2\x00\xff')
        self.assertEqual(proof['reachableInstructions'], 2)
        self.assertEqual(proof['unreachableByteRanges'][0]['offset'], 4)
        with self.assertRaisesRegex(RuntimeError, 'Unverified reachable'):
            prove_payload(b'\xa2\xff')
    def test_literal_outside_jump_rejects(self):
        with self.assertRaisesRegex(RuntimeError, 'outside'):
            prove_payload(b'\x94\xff\xff\x00')
if __name__ == '__main__':
    unittest.main()
