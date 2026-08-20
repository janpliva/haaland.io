# TODO

Things noticed in passing and deliberately left alone. Delete a line when it is done.

## Tidy-ups

- `js/util.js` — `stealR(p)`: parameter `p` is unused; the keeper branch was removed in the goalkeeper milestone and never cleaned up.
- `js/util.js` — `ownBoxOf(p)`: returns `own` in the result object, but no caller ever reads it.
- `js/util.js` — `interceptPoint(p)`: calls `interceptSolve` and throws away `t`, so callers wanting both position and time solve the same search twice.
- `js/util.js` — `nearestFoeDist(p)` and `js/ai-ball.js` — `decide(p)`: both compute the distance to the nearest opponent for the same player in the same frame.
- `js/util.js` — `lungeSolve` is called twice per frame for the claimer (once in `updateClaim` to publish `ball.lungeNeed`, once in `lungeStep`). Each call scans the ball's whole path at 1/60 s steps.
- `js/main.js` — `step(dt)`: `S.lockOut` is decremented without clamping and settles at tiny negative values (`-1.6e-16`) instead of 0.
- `README.md`: a single `# haaland.io` line — says nothing about how to run the game, the module layout, or where the tunables live.
- Stray files in the repo root, untracked and unused: `js/main 2.js` (an old copy) and `serve.py`.

## Worth a look, from the dribble milestones

- **`lungeSpeed` is a cap expressed as a percentage, shipped at 50** — so the reception lunge can never exceed half normal running speed. Odd ceiling for something meant to read as a dart. Either it wants to live above 100, or the cap wants to be relative to the required speed.
- **Input latency is one touch cycle** — `2*touchPush*m/friction`, measured median 217 ms at half stick and 333 ms at full. Same for the queued pass. Intended commitment, but it is the number to check first if the controls read as heavy.
- **Claims reaching contact sits around 72 %** — the rest are hand-overs to a better-placed claimer, which is the interception mechanism working. Worth re-measuring if receptions start being missed.
- **A keeper who reaches his save point early stands still** until the shot arrives: median 50 ms, p90 183 ms, worst seen 567 ms. Deliberate, but the 567 ms case may read as a stall.
- **The gap guard** (`S.gapWarn` / `S.gapWarnLog`) has never fired. If it ever does, the log carries the state that produced it — that is the whole reason it is there.
- **AI distances are absolute field units** tuned for portrait: marking standoff, separation and wobble never scaled when `FIELD_W` went from 600 to 1200.

## Worth a look, from the ball-height milestone

- **Aerial passes above minimum power are collected by the kicker's team 26 % of the time**,
  against 37–59 % for ground passes of the same power aimed the same way. That is the intended
  cost (untouchable in flight, lands further out, longer first touch), but if it reads as
  simply throwing the ball away, `airTouch`, `bounceDrag` and `liftAngle` are the three knobs.
- **The goal has no height**, so a lob between the posts always scores. No crossbar was added
  — it needs a design answer first (what does hitting it do, with no throw-ins or goal kicks
  in the game). See §7.
- **The aerial aim arc bows perpendicular to the aim**, because a truthful top-down projection
  of a lofted pass aimed straight up the screen is a straight line. If a camera tilt lands
  later, that glyph should go back to being the real projection.
- **`airProfile` is cached on the ball's own numbers**, which is exact because the ball only
  moves at the end of `step()`. If anything ever moves the ball mid-frame, that cache is the
  first thing to check.
- **The lift-holds-intent rule is carrier-only.** Off the ball, lifting still stops the
  player. One line in `step()` if that should be the same in both cases.

## Documentation drift to watch

- PROJECT_CONTEXT.md and CLAUDE.md were rewritten after the physical touch cycle landed. Both now describe the code as of the reception-freeze fix. The dribble model has been replaced four times — check these two files against the code before trusting them.
