import unittest
import tempfile
import subprocess
import sys
import shutil
from pathlib import Path

from ledge_corner_topology import DIRECTIONS, ledge_corners


class NativeLedgeCornerTopology(unittest.TestCase):
    def corner(self, horizontal=56, vertical=59, permission=0x8000):
        dx, dz = DIRECTIONS[horizontal][0], DIRECTIONS[vertical][1]
        return [[10, 10-dz, horizontal], [10-dx, 10, vertical]], lambda x, z: permission if (x, z) == (10, 10) else 0

    def test_all_four_convex_directions_keep_the_common_upper_diagonal(self):
        for horizontal in [56, 57]:
            for vertical in [58, 59]:
                with self.subTest(horizontal=horizontal, vertical=vertical):
                    jumps, permission = self.corner(horizontal, vertical)
                    self.assertEqual(ledge_corners(jumps, permission), [[10, 10, horizontal, vertical]])
                    self.assertEqual(len(jumps), 2, 'Do not add a synthetic movement behavior')

    def test_open_end_single_tile_and_parallel_runs_remain_open(self):
        jumps, permission = self.corner()
        for source in [jumps[:1], jumps[1:], [[10, 9, 56], [9, 10, 56]], [[10, 9, 56], [8, 10, 59]]]:
            self.assertEqual(ledge_corners(source, permission), [])

    def test_concave_and_already_meeting_native_edges_need_no_bridge(self):
        _, permission = self.corner()
        # Unlike the missing convex corner, these pairs share a real endpoint.
        for source in [[[9, 9, 56], [10, 10, 58]], [[9, 10, 56], [10, 9, 59]], [[10, 9, 57], [9, 8, 59]]]:
            self.assertEqual(ledge_corners(source, permission), [])

    def test_unblocked_water_and_existing_jump_tiles_do_not_become_corners(self):
        for value in [0, 2, 0x400, 0x8010, 0x8011, 0x8013, 0x8015, 0x8017, 0x8038, 0x8039, 0x803A, 0x803B]:
            jumps, permission = self.corner(permission=value)
            self.assertEqual(ledge_corners(jumps, permission), [], hex(value))

    def test_missing_native_upper_or_lower_neighbor_is_not_capped(self):
        jumps, permission = self.corner()
        for missing in [(9, 9), (11, 10), (10, 11)]:
            self.assertEqual(ledge_corners(jumps, lambda x, z: None if (x, z) == missing else permission(x, z)), [])

    def test_native_cell_border_uses_world_tile_ownership(self):
        self.assertEqual(ledge_corners([[31, 30, 56], [30, 31, 59]], lambda x, z: 0x8000 if (x, z) == (31, 31) else 0), [[31, 31, 56, 59]])

    def test_original_route29_two_turns_and_authored_blocked_variant(self):
        source = [[603, 395, 56], [602, 396, 59], [588, 400, 57], [589, 401, 59]]
        blocked = {(603, 396): 0x8000, (588, 401): 0x8000}
        self.assertEqual(ledge_corners(source, lambda x, z: blocked.get((x, z), 2)), [[603, 396, 56, 59], [588, 401, 57, 59]])
        jumps, permission = self.corner(permission=0x803E)
        self.assertEqual(ledge_corners(jumps, permission), [[10, 10, 56, 59]])

    def test_failed_new_export_invalidates_the_previous_stage(self):
        with tempfile.TemporaryDirectory(prefix='hg-terrace-failed-export-') as directory:
            browser = Path(directory)
            scripts = browser / 'scripts'
            scripts.mkdir()
            for name in ['export_terraces.py', 'ledge_corner_topology.py']:
                shutil.copyfile(Path(__file__).parent/name, scripts/name)
            stage = browser / '.generated/terraces/999.json'
            stage.parent.mkdir(parents=True)
            stage.write_text('{"oldStage":true}')
            failed = subprocess.run([sys.executable, str(scripts/'export_terraces.py'), '999'], capture_output=True, text=True)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn('matrices/999.json', failed.stderr)
            self.assertFalse(stage.exists(), 'An upstream solve failure cannot leave a publishable old stage')


if __name__ == '__main__':
    unittest.main()
