import unittest

from full_game_mccfr import create_state
from utils.bucketer import Bucketer


class BucketerPositionTests(unittest.TestCase):
    def test_small_blind_acts_first_preflop(self):
        state = create_state()
        bucket = Bucketer().exact_preflop_bucket(state, [])
        self.assertEqual(state.actor_index, 1)
        self.assertEqual(bucket[1], "SB")
        self.assertEqual(bucket[3], "root")

    def test_big_blind_acts_after_limp(self):
        state = create_state()
        state.check_or_call()
        bucket = Bucketer().exact_preflop_bucket(state, ["check/call"])
        self.assertEqual(state.actor_index, 0)
        self.assertEqual(bucket[1], "BB")
        self.assertEqual(bucket[3], "limped")


if __name__ == "__main__":
    unittest.main()
