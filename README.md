# lard plays poker!

## Play in the browser

The repository includes a dependency-free web table backed by the bundled
10-million-iteration preflop strategy. Run it locally with `npx vercel dev`, or
import the repository into Vercel and deploy with the default settings. No
environment variables, database, or build output directory are required.

`vercel.json` explicitly sets the Framework Preset to **Other** so Vercel does
not mistake the repository's offline Python training scripts for a Python web
application. It builds and publishes only the static `public/` directory.

The compact browser model can be regenerated after training with:

```bash
python tools/export_web_model.py nodesets/your_model.pkl
```

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

GTO solver solution for Preflop Open:


<img width="800" height="800" alt="image" src="https://github.com/user-attachments/assets/95acaf64-fece-4b42-a582-ac05a70b3279" />

My solver solution for Preflop Open after 10 million iterations and approximately 8 hours of training:


<img width="800" height="800" alt="image" src="https://github.com/user-attachments/assets/cc56bab4-1349-4b92-acd2-f55b8a789f14" />

