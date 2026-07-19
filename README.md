# lard plays poker!

## Play in the browser

The repository includes a dependency-free web table backed by the bundled
10-million-iteration full-game strategy. Gameplay and the filterable 13x13
strategy explorer live on separate tabs, and the player's stack persists
between completed hands in browser storage.

For the quickest local development server, run:

```bash
python -m http.server 8000 --directory public
```

Then open `http://localhost:8000`. To reproduce Vercel's development routing,
run `npx vercel dev` instead. You can also import the repository into Vercel and
deploy with the default settings. No environment variables or database are
required.

Open the browser developer console while playing to inspect the agent trace.
Each hand logs an ISO timestamp and Lard's cards; each decision logs its
interpreted model bucket, node visits, strategy source, normalized
fold/call/raise frequencies, and sampled action. Mature nodes (100+ visits) use
the model unchanged; sparse nodes blend with heuristics in proportion to their
missing visits. Agent actions use a 1.5-second delay so they are readable in the
table UI.

`vercel.json` explicitly sets the Framework Preset to **Other** so Vercel does
not mistake the repository's offline Python training scripts for a Python web
application. It builds and publishes only the static `public/` directory.

The compact browser model can be regenerated after training with:

```bash
python tools/export_web_model.py nodesets/your_model.pkl
```

For node sets trained before the heads-up position mapping fix, add
`--swap-legacy-positions`. The bundled 10M model has already been exported
with this correction.

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

