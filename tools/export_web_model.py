"""Export the compact preflop portion of a trained pickle for the web client."""

from __future__ import annotations

import argparse
import json
import pickle
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from full_game_mccfr import Node  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", default=ROOT / "FULLGAME_10m_iters.pkl")
    parser.add_argument("output", nargs="?", default=ROOT / "public" / "preflop-model.json")
    parser.add_argument(
        "--swap-legacy-positions",
        action="store_true",
        help="Correct node sets trained before PokerKit's heads-up seat mapping was fixed.",
    )
    args = parser.parse_args()

    # Older training runs were launched as scripts, so pickle recorded __main__.Node.
    sys.modules["__main__"].Node = Node
    with open(args.source, "rb") as source:
        nodes = pickle.load(source)

    exported = {}
    for bucket, node in nodes.items():
        if not isinstance(bucket[0], str):
            continue
        weights = [float(node.strategy_sum.get(action, 0.0)) for action in ("fold", "check/call", "raise")]
        total = sum(weights)
        if total <= 0:
            continue
        output_bucket = list(bucket)
        if args.swap_legacy_positions:
            output_bucket[1] = "SB" if bucket[1] == "BB" else "BB"
        exported["|".join(map(str, output_bucket))] = [round(weight / total, 5) for weight in weights] + [node.times_visited]

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(exported, separators=(",", ":")), encoding="utf-8")
    print(f"Exported {len(exported):,} preflop nodes to {output}")


if __name__ == "__main__":
    main()
