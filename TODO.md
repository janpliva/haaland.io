# TODO

Things noticed in passing and deliberately left alone. None of these change how the game
plays today — they are tidy-ups and one piece of missing documentation. Delete a line when
it is done.

## Noticed during the ES module split

- `js/util.js` — `stealR(p)`: parameter `p` is unused; the keeper branch was removed in the goalkeeper milestone and never cleaned up.
- `js/util.js` — `ownBoxOf(p)`: returns `own` in the result object, but no caller ever reads it.
- `js/util.js` — `interceptPoint(p)`: calls `interceptSolve` and throws away `t`, so callers wanting both position and time solve the same search twice.
- `js/util.js` — `nearestFoeDist(p)` and `js/ai-ball.js` — `decide(p)`: both compute the distance to the nearest opponent for the same player in the same frame (`driveCarrier` calls one, `decide` recomputes it as `press`).
- `js/ai-ball.js` — `carrySpeed(p)`: `pickupOf(p) - CONTACT - 2` is always `-2` for a keeper, so the 0.15 floor always wins; currently masked because `dribbleKick` is 0 and the function short-circuits.
- `js/main.js` — `step(dt)`: `S.lockOut` is decremented without clamping and settles at tiny negative values (`-1.6e-16`) instead of 0.
- `README.md`: a single `# haaland.io` line — says nothing about how to run the game, the module layout, or where the tunables live.
