# CLAUDE.md

Working rules for this repo. Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) first — it maps
the code and lists every tunable with its default.

Solo hobby prototype. ES modules in `js/`, loaded straight by the browser. No production,
no users, no CI.

## Git

- Commit straight to `main`. No branches, no PRs.
- Push publishes the site (GitHub Pages serves `main`), so a commit is a deploy.

## Tooling: keep it at zero

- No npm, no `package.json`, no bundler, no framework, no TypeScript, no CSS preprocessor,
  no CDN dependencies, no linter config, no test runner.
- Everything must run by opening `index.html` over plain HTTP.
- Test locally with:

```bash
python3 -m http.server 8000
```

## File layout

Split into ES modules, no bundler and no build step — the browser loads them directly.

```
index.html    DOM shell only          styles.css    all CSS
js/config.js  constants (FIELD_W, FIELD_H), MATCH_TIMES, TUNABLES, T, DEFAULTS, ratings (STAT_SCALE, stat())
js/state.js   S, ball, E, touch, joyBase, resize, mk, buildTeams, reset
js/store.js   ratings + match-mode persistence — never T
js/util.js    geometry, who-is-who, intercept, doPass
js/ai-off.js  assignRoles, mateTarget, attack     js/ai-def.js  defend
js/ai-ball.js decide, driveCarrier                js/keeper.js  playKeeper, parry, keeperPlan
js/match.js   score, goal, clock, newMatch       js/input.js   joystick
js/render.js  draw                               js/ui.js      gear panel
js/menu.js    home screen, squads, stat sheets
js/main.js    step, frame, boot
```

`js/util.js` also owns the dribble and reception: `bufferInput`, `startKick`/`holdBall`,
`carryChase`, and `updateClaim`/`lungeSolve`/`lungeActive`/`lungeStep`. `moveTo` returns
early for the ball owner and for an actively lunging player, because those two are moved by
`carryChase` and `lungeStep` instead — that early return is what keeps the two movement
systems from fighting.

It also owns the **ball in the air**: `airStep` (one frame of flight, including resolving a
landing at the exact instant it happens), `airProfile`/`ballAtT` (where the ball will be at
time *t*, through every bounce), `airLandingT`/`ballRestT`, `airFirstTouch` and `takerAt`.
There is only one prediction model — claim, intercept, chaser and keeper all read
`airProfile`, so they cannot disagree about where a lofted ball comes down. A ball on the
ground has `z` and `vz` both zero and every aerial branch is skipped, which is what keeps
ground play bit-identical to before the feature; do not add a branch that reads `z` without
that being true.

## The camera is a rendering thing, and only a rendering thing

- The pitch is a **fixed `FIELD_W` × `FIELD_H`** (`config.js`). It is not derived from the
  viewport any more. Do not put it back — a viewport-derived pitch means every device plays a
  different game, and with a tilted camera it would change again on its own.
- `js/render.js` owns the whole projection: `PX(x)`, `PY(y, z)` and `X(length)`. World (x, y, z)
  goes to the screen as `sx = x`, `sy = y·cos(camTilt) − z·sin(camTilt)`, then one scale that
  fits the fixed pitch into the viewport, times `camZoom`, offset by where the camera is
  looking. **Nothing outside those three functions may convert world units to pixels**, and
  nothing outside `render.js` may read the camera. (`cam` is exported for measurement only —
  read it in a harness, never in game code.)
- **The camera moves along `y` and only `y`.** `ox` comes from the width and nothing else, so
  it never pans sideways. Above `camZoom` 100 that means the left and right edges of the pitch
  are cropped; that is the accepted price of zooming without a horizontal pan.
- **The controls are `camTilt` 0 and `camZoom` 100 with `camFollow` 0.** At tilt 0 the `z` term
  vanishes and the picture is the old top-down one; at zoom 100 with no follow the camera is the
  old fixed whole-pitch fit, to the last pixel. If a change moves either control, the change is
  wrong.
- The simulation stays 2D + z. The camera must never appear in `state`, `util`, the AI, the
  keeper or `main` — if a tilt, a zoom or a follow setting would change a digest, the projection
  has leaked. `draw(dt)` takes the frame time only to smooth the camera; it still writes nothing.
- Repositioning the world (`reset()`) **cuts** the camera rather than gliding it, through
  `hooks.camSnap()` — the same one-way-import trick as `hooks.pickChasers`.
- **Input is deliberately not inverse-projected.** A thumb direction is a world direction, exactly
  as before. The aim line is drawn in world coordinates and projected, so it does not sit at the
  thumb's on-screen angle (2.8° worst case at the current tilt of 25, 4.1° at 30). That gap is
  intended: the display tells the truth about the simulation, the joystick stays predictable.
  The joystick and its rings are css px and stay css px at every zoom; the aim line is a world
  length and grows with the zoom. Verified at the pixel level, not by reading the code.

- **Imports must stay one-way**: config → state → store → util → ai/keeper → match → input →
  render/ui → menu → main. No cycles. If a cycle appears, move the shared piece down a layer.
  `menu.js` imports `match.js` for `newMatch`, so `match.js` must never import `menu.js` —
  the return to the menu at full time is triggered from `frame()` in `main.js` instead.
- ES module imports are read-only bindings. Anything reassigned from more than one place
  lives as a **property** of `S`, `E`, `ball` or `T` — never reassign those objects
  themselves.

## Tuning defaults are off-limits

- The values in `TUNABLES` (`js/config.js`) are hand-tuned by playing on a phone. **Never change
  a default without being asked**, including "while I was in there" adjustments.
- Slider min/max/step are also tuning. Same rule.
- `DEFAULTS` is a deep copy of `T` at load, and the "Vrátit výchozí hodnoty" button restores
  it. That relationship must keep working.

## Tunables are never persisted — ratings are

Two different things, and the line between them is the whole point.

- **`T` is never stored.** It is initialised from `TUNABLES` at every boot, so the game always
  runs on what the source says. Nothing writes `T` except `js/ui.js` (the panel sliders and the
  "Vrátit výchozí hodnoty" button) and the init loop in `config.js`. Do not add storage back.
- `clearStore()` in `js/ui.js` deletes the old `fbproto_tuning_v1` payload at boot. Keep it.
- Why: the old layer let a saved value on the phone silently override a new default in code,
  which is indistinguishable from the change not working. Hours were lost to it.
- **Player ratings are stored**, in `js/store.js` under `fbproto_ratings_v1`, and that file is
  the only one allowed to touch storage. It does not import `T` at all — check that it still
  doesn't before trusting any change to it.
- **The match mode is stored too**, in the same file under its own key `fbproto_mode_v1`
  (`{ v, mode, len }`). Same rules: validated whole, discarded whole, no path to `T`. The
  durations it validates against live in `MATCH_TIMES` in `js/config.js` — that array is
  **not** a tunable and must not become one; it is edited in the file, and the menu builds one
  button per entry rather than hardcoding a count.
- The stored payload is validated whole: if the squad shape does not match (team size changed,
  a stat added or removed, a value out of 0–99, anything unparseable) it is **discarded
  entirely** and every rating falls back to 50. Never merge partial stored data — a
  half-restored squad is the same silent lie the tuning store was.
- `buildTeams()` calls `hooks.applyRatings()` at its end, so a rebuild from the panel goes
  through the same validation. That is where a `teamSize` change drops the stored ratings.

## You cannot feel the game

This is the important one. You have never played it and never will.

- **Never justify a change with "better feel", "more fun", "more responsive", "smoother",
  "more natural", or "more satisfying."** You have no evidence for any of those claims.
- Implement changes that are mechanical and specifiable: "the pass fires when the drag
  exceeds the outer ring" is specifiable; "the pass should feel snappier" is not.
- If asked for something feel-shaped, translate it into a mechanical change, state the
  translation, and let the human judge the result by playing. Do not tune numbers toward an
  imagined feel.
- Prefer exposing a new tunable over guessing at a constant, so the human can find the value
  by playing. Add it to the panel; do not silently hardcode.
- **Adding a tunable is one line** in the `TUNABLES` list in `js/config.js`. The panel rows,
  `T`'s initial value and `DEFAULTS` are all generated from it, and the group headings come
  from the `group` field. There is no positional id mapping to get wrong any more.
- **Ratings scale a tunable, they never replace it.** Rating 50 is exactly 1.000× the value in
  `TUNABLES`, so an all-50 squad must stay bit-identical to the game without ratings. Retuning
  a stat's spread is one line in `STAT_SCALE` (`js/config.js`); widening it is a tuning
  decision and needs asking, exactly like a default.
- Every scaled constant is read through `stat(p, key)`. Never read `T.speedBase` and friends
  directly — the two deliberate exceptions are documented at their call sites.
- A changed default reaches the phone on the next reload — nothing is stored, so there is no
  "press Vrátit výchozí hodnoty to see it" caveat any more.

## Ambiguity about game design → ask

- When a request has more than one reasonable interpretation about how the game should
  behave, ask. Do not pick one and build it.
- Applies especially to: what a pass or turnover means, what the AI is trying to do, what
  the score measures, and anything touching the joystick gesture.
- Implementation details with no design content (variable names, draw order, refactors) do
  not need a question.

## Scope

- The long-term 1v1 concept in PROJECT_CONTEXT.md is direction, not a backlog. Do not build
  toward it unasked — no networking, no menus, no team orchestration.
- Goals, keepers, scoring and an attacking opponent exist because they were asked for. Both
  teams now run the same attack/defend code — keep it that way rather than special-casing a
  team.
- The prototype tests one mechanic. Additions need a reason tied to testing that mechanic.

## After any change

State what to look for when testing it on a phone: the specific gesture to perform, what
should happen, and what would indicate it went wrong. Be concrete — "drag past the dashed
ring while a red player is inside your pickup circle; the pass should still fire" — not
"check that passing works."

Remember the human tests on a real phone in portrait. Desktop mouse input exists in the code
but only proves the page didn't crash.
