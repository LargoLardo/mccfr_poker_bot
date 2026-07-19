import unittest
from collections import defaultdict
from types import SimpleNamespace

from utils.agent_policy import action_weights


class FakeState:
    def __init__(self, facing_bet=True, street=0, can_raise=True):
        self.street_index = street
        self._facing_bet = facing_bet
        self._can_raise = can_raise
        self.actor_index = 0
        self.bets = [0, 1] if facing_bet else [1, 1]

    def can_fold(self):
        return self._facing_bet

    def can_complete_bet_or_raise_to(self):
        return self._can_raise


class AgentPolicyTests(unittest.TestCase):
    def test_never_folds_when_checking_is_free(self):
        node = SimpleNamespace(
            times_visited=100_000,
            strategy_sum=defaultdict(float, {"fold": 999, "check/call": 1}),
        )
        weights = action_weights(FakeState(facing_bet=False), ("7To", "BB", "deep", "root", "Limp"), node)
        self.assertNotIn("fold", weights)
        self.assertAlmostEqual(sum(weights.values()), 1)

    def test_sparse_four_bet_premium_raises(self):
        bucket = ("KAo", "SB", "deep", "vs_4bet", "~25.0bb raise")
        weights = action_weights(FakeState(), bucket, None)
        self.assertGreater(weights["raise"], weights["check/call"])
        self.assertEqual(weights["fold"], 0)

    def test_sparse_four_bet_trash_folds(self):
        bucket = ("27o", "SB", "deep", "vs_4bet", "~25.0bb raise")
        weights = action_weights(FakeState(), bucket, None)
        self.assertGreater(weights["fold"], 0.9)


if __name__ == "__main__":
    unittest.main()
