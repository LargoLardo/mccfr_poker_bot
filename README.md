# wpt_bot

No-limit Texas Hold’em bots trained with **external-sampling Monte Carlo CFR** (MCCFR), built on [pokerkit](https://github.com/uoft-cs/pokerkit). The main line trains **preflop-only** (`pf_mccfr.py`) and **full-street** (`full_game_mccfr.py`) abstractions using card bucketing and pickled node stores.

## Setup

1. Create a virtual environment (recommended).
2. Install dependencies:

```bash
pip install -r requirements.txt
```

Key libraries: `pokerkit`, `numpy`, `torch`, `tqdm`, `networkx`.

## Running

| Script | Role |
|--------|------|
| `pf_mccfr.py` | Preflop MCCFR training (stops after preflop; payoffs from check-through). |
| `full_game_mccfr.py` | Full-game MCCFR training through showdown. |
| `utils/play_hand.py` | Interactive / scripted play against a loaded strategy |
| `utils/agent_test.py` | Local agent testing harness (paths/iterations are edited in-file). |
| `visualizers/*.py` | Preflop range visualization helpers. |
| `kuhn/*.py` | Small Kuhn poker CFR / MCCFR reference implementations. |
| `protos/*.py` | Earlier or alternate prototypes (Hold’em setup, random sims, CFR variants). |
| `FULLGAME_10m_iters.pkl` | Example pickled nodeset trained on 10m iterations |

Training scripts load and save pickle node dictionaries; default paths are configured inside each script. Large node sets and logs are kept **out of Git** (see below).

Directory `nodesets/` is created locally for trained `.pkl` files referenced by the agents.
