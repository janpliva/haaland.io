# PROJECT_CONTEXT

Written for a session with no memory of this project. Everything below was read out of the
code in `js/` unless marked otherwise.

## 1. What this is

A mobile-first top-down football prototype. Plain canvas 2D, ES modules loaded straight by
the browser — no build step, no npm, no framework. UI text is Czech (`<html lang="cs">`).

It is a **feel test for one mechanic**, not a game. The question it exists to answer:

> Does a fixed bottom joystick, where dragging past an outer ring charges a pass and lifting
> the thumb plays it in that direction, work as a one-thumb control for moving *and*
> passing?

Everything else — teams, AI, goals — exists only to make that gesture testable under
pressure.

The ball is always physically simulated and never attached to anyone. Dribbling is a cycle of
real kicks: you knock it ahead, it rolls under friction, and your player automatically runs at
it until his body reaches it — and that contact is the only moment your input reaches the ball.

The ball also has **height**. A pass can be played along the ground or lofted, and a ball in
the air is untouchable — it flies over everyone and bounces when it lands.

The view is **lightly 3D**: the camera is tilted `camTilt` degrees off vertical instead of looking
straight down, and players, the ball and the goals have height. It is still a top-down game — a
tilt, not a camera behind the player, and the simulation is untouched by it. At `camTilt` 0 the
picture is exactly the old flat one, which is what every change is checked against.

There are goals at both ends — with **posts and a crossbar**, so a lob can go over — a keeper
each, and a scoreline. A match runs in one of two
modes, chosen on the home screen: **na góly** (first to `targetGoals`) or **na čas** (the
clock decides, and a level score at full time goes to a golden goal). A shot is just a pass —
there is no separate shooting gesture, deliberately. Both teams play football: whoever touches
the ball gets it, and then attacks the other end.

The app opens on a **menu**, not on the pitch. Nothing auto-starts and nothing auto-restarts:
you press "Hrát zápas" to play, and full time drops you back to the menu with the score. Each
player carries **ratings 0–99** that scale the tunables; the menu is where they are edited.
Ratings persist across sessions, tunables never do — see §5 and §6.

## 2. Long-term concept — NOT BUILT, DO NOT BUILD

A 1v1 mobile football game where each player controls a whole team; attacking is a
motor/timing skill and defending is a tactical orchestration skill. Realistic-ish, not
cartoon. **None of this exists in the code.** No multiplayer, no networking, no team
orchestration layer, no goals. It is recorded here as direction only.

## 3. Design decisions already made, and why

### Control switches on reception when attacking, follows the ball when defending
While your team has the ball, `ctrl` changes only when a blue player receives it (below).
While the **opponent** has it, `ctrl` follows the blue player nearest the ball, with a 25-unit
hysteresis so it does not flicker between two defenders. Keepers are never `ctrl`.

Why: with no manual tackle button, defending means running your nearest man at the ball, so
the control has to go where the ball is. The hysteresis is what stops the body under your
thumb swapping mid-run.

### Control switches only at the moment of reception
`doPass()` sets `ctrl = carrier`, and `step()` reassigns `ctrl = ball.owner` only when a
blue player actually has the ball.
While the ball is in flight, you still drive the player who passed it.

Why: the pass is a single continuous thumb gesture. If control jumped to the receiver
mid-flight, the drag that fired the pass would carry over into the new body and move it in
the pass direction. Keeping control on the passer also means your run *after* passing is
still yours, which is the point of a passing game.

### Charge outside the ring, pass on release
Inner ring `joyR` (70 css px). Outer ring `joyR * passThresh/100` (122% → ~85.4 css px).
Movement speed ramps linearly with distance and saturates at `joyR`, so everything past the
inner ring is full sprint and the joystick keeps steering normally while outside the outer
ring too.

The pass is a two-stage gesture:

1. **Charge** — drag the thumb past the outer ring. Nothing fires. With the ball, a dashed
   yellow arrow shows where the pass would go, the outer ring goes solid, and the knob gets
   a white outline.
2. **Release** — lift the thumb while still outside the ring and the ball goes in the
   direction the thumb was in **at the moment of release**. Not the
   direction you first crossed in: you can exit right, travel around the outside to the
   left, release, and the pass goes left.

**Weight comes from distance past the ring.** `passPower(d)` maps `(d − threshold) /
passRange` to 0…1, and `passSpeedFor()` maps that onto `passMin`…`passSpeed`. Releasing on
the ring plays the softest ball; `passRange` css px beyond it plays the hardest. Measured
when `passSpeed` was 660: on the ring 273, +30 px 336, +60 px 459, +120 px 659, +200 px 664 —
floor, slope and ceiling all behave. `passSpeed` is 800 now, so the absolute numbers scale.

**The aiming line is a fraction of the real distance.** It is drawn from the ball, and its
length is `rollDist(v) * aimLen/100`, where `rollDist(v) = v² / (2 · friction)` is how far the
ball would actually travel. At the default 33 % a full-power pass draws ~359 units against a
real roll of 1089. Deliberately **not** the full distance: the line should read as direction
and strength, not give away where the ball lands. The dash period is fixed, so the number of
dots is the strength readout — and it is the only feedback for power, because the knob stays
clamped to the ring. It draws a straight line, so it ignores wall bounces.

Coming back inside the outer ring without lifting cancels the charge; releasing inside the
ring no longer does nothing — it **toggles aerial mode** (see "The ball has height"). The
charge state itself is still memoryless: "is the thumb currently outside the ring" is the
whole condition, so no flag tracks the crossing.

**Lifting the thumb no longer stops the carrier.** It used to: the buffered stick magnitude
went to 0 and the next contact held the ball at his feet. Now, while the controlled player
owns the ball and the thumb is up, the buffered intent from the last frame with the thumb
down is kept instead of being overwritten, so he keeps running at the speed and direction of
his last touch. The reason is the aerial toggle: that gesture is a lift, and a lift that also
stopped him would make arming aerial mode cost a stopped run every time. Stopping is
unchanged and still available — bring the thumb back to the **centre** of the joystick
without lifting, the stick magnitude goes to 0, and he stops at the next contact. Measured:
after centring, `ball.held` at 133 ms, standstill at 167 ms, 30.6 units travelled, ball kept.
After a lift, the same carrier covers 200 units in the next second at full speed. Without the
ball nothing changed — a lift there still stops him, and there is no mode to toggle.

Why: the commit moment is the release, which the thumb can always take back, so the
direction stays adjustable right up to the last instant instead of being locked in by the
crossing. The knob is clamped to the outer ring, so the ring and knob styling are the only
signal that you are outside it — that feedback is load-bearing, not decoration.

Firing is deferred to `step()` through `touch.fire` rather than done in the event handler,
so all game mutation stays in the simulation and nothing fires while the game is paused.
`reset()` clears it so a charge cannot survive a goal.

### Contact with the ball takes it — both directions
Checked every frame against the **ball**, not the carrier, and regardless of who owns it:
`dist(opponent, ball) < stealR(opponent)`, which is `PH + tackleR` for everyone including
keepers. This applies even while the ball sits at your foot: there is no shielding. Because
the check is against the ball, a big touch is genuinely riskier than a small one — that is
the intended cost of `touchPush`.

`STEAL_LOCK` (0.5 s) stops the ball ping-ponging: whoever just lost it cannot take it back
for half a second. `doPass` uses the same `lockedPlayer`/`lockOut` pair with 0.32 s. A rush
clearance needs to lock *two* players at once — the beaten carrier and the keeper who just
kicked it — so `gkCleared`/`gkClearOut` is a second, independent pair; `locked(p)` in
`state.js` answers for both and every lock test goes through it.

The nearest defender chases the **ball's** position, not the carrier's. Since players have
no collision with each other, the only thing protecting the ball is distance.

### Attack / defend, one code path for both teams
`step()` picks `attTeam` — the ball owner's team, or `lastTeam` when the ball is in flight —
then calls `attack()` on it and `defend()` on the other. Direction comes from `dirOf(team)`
(blue −1, red +1), so the same lane-running and marking code drives both sides. Keepers are
excluded from both by `role === 'gk'` and are driven only by `playKeeper`.

### Defensive shape
`defend()` builds a block rather than a swarm:

- **Marking is goal-side.** A marker stands `markDist` from his man along the line to his own
  goal, then shifts across by `markShift` % of the x gap between his man and the ball. The
  shift is x-only, so it cannot put him in front of his man; a final clamp also undoes any
  drift that would.
- **Last man and line.** The deepest non-keeper, non-chaser defender is the last man, held for
  0.5 s at a time so the role does not flicker. `lineY` is the deepest opposing outfielder
  pushed `lineGap` toward the defending goal. The last man may not be further upfield than
  `lineY`; nobody else may drop deeper than the last man. There is no offside — this is
  structure, not a trap.
- **Press trigger.** Nobody goes to the ball unless it is within `pressDist` of the defending
  goal. Otherwise the designated player waits on the ball→own-goal line at `pressDist` out.
  **The chaser is picked by distance to that holding point, not to the ball, whenever press is
  off.** Picking by distance to the ball deadlocks: whoever sets off stops being nearest, the
  role jumps to someone else, and nobody arrives — measured, the block sat still for 20 s and
  the holding spot stayed empty. With the fix a defender parks at 898 against a target of 900.
- **Drift only near the ball.** Marker wobble is scaled by `1 − dist(ball, defender)/wobbleNear`,
  so defenders far from the ball stand still and hold the shape.
- **Reaction time, on every read of an opponent.** A defending player sees the *opposing team*
  as it was `defReact` ms ago, carried forward at the speed and heading he saw then: while an
  opponent runs uniformly the estimate is exact and the target is bit-for-bit today's, and the
  moment that opponent changes direction the defender stays committed to the old one for
  `defReact`. It covers the press, the marked man, `markShift`'s ball x, the holding point when
  press is off, the deepest-attacker reference behind `lineY`, and the press trigger itself —
  one code path, both teams. Every player carries his own 256-sample ring of position and
  velocity (`histPush`/`histAt` in `state.js`); `perceivedFoe` builds the view of a player and
  `perceivedBall` the view of the carrier-plus-ball, rotation included.
  Live, never delayed: his own position, his own team (spacing, last-man role, wobble), the
  keepers (they have `gkReaction`), loose balls (a loose ball is not a player), the human's own
  controlled player, attacking logic in `ai-off.js`/`ai-ball.js`, and the steal — the tackle
  always uses the ball's real position. `defReact` 0 is the same code path as before the
  feature, verified identical over six seeded matches.

The velocity that gets extrapolated is the one a player *sustains*, not his instantaneous
step: a movement step is clipped to `min(speed·dt, distance)`, so differencing two neighbouring
frames turns frame-time jitter into a shaking target. It is measured over a fixed 150 ms window
with an interpolated start, and for the ball carrier it is not estimated at all — `carryChase`
carries him at exactly `chaseV` along `fx,fy`.

Why the delay is on the carrier and not on the ball: the ball at a dribbler's feet is a
sawtooth — every touch re-kicks it, so its speed jumps once per cycle. A delayed observer
cannot tell that re-kick from a change of direction, so delaying the ball's own state punishes
a defender on a *straight* dribble too. Measured: with the ball delayed 220 ms, a carrier who
simply ran diagonally past a defender, with no feint at all, got through 85.7 % of the time.
With the delay on the carrier, the same run gets through 0 %.

Consequence worth knowing: with `pressDist` at 900 a human who keeps the ball in his own half
is never challenged at all. Measured 0:0 over 120 s of standing still. Walk the ball forward
and the block engages — the waiting defender is simply run into.

### Going to the ball: intercept, and commit to one man
`interceptSolve(p, b)` predicts where the ball will be. The optional `b` is a *view* of the
ball — position and velocity — and defaults to the live one; only the delayed press passes
anything else, and it never fakes the player's own position.  Ball motion is constant deceleration
`friction` along its velocity, so `s(t)` is analytic; the search steps `t` in 0.05 up to
`tStop + 1.5` and returns the first point the player could reach, allowing him only
`interceptEff` % of his top speed. If nothing is reachable it returns the resting point and a
sort key of `1e6 + distance`, so unreachable players order behind reachable ones.

`ball.chaser` holds **one committed player per team**, chosen by smallest intercept **time**,
not smallest distance. It is recomputed only when possession changes — pass, steal, reception,
kickoff — plus one extra recompute if a loose ball reverses by more than 90°, which is the
wall-bounce case. `chaserOf()` revalidates lazily (team rebuild, keeper, lockout) rather than
reselecting per frame. Everyone else keeps marking or running lanes.

Measured: after a pass the committed receiver's distance to the ball fell strictly and without
reversal — three episodes of 13, 25 and 36 consecutive samples. Over a loose-ball episode
exactly one attacker closed on the ball (+181, +302, +101 units) while his three teammates all
moved away (−12 to −1011). The defending side shows the committed chaser plus, sometimes, one
marker closing too — that marker is shadowing the opponent who is himself going for the ball,
which is marking working rather than the team converging.

### AI pass power and plan commitment
`speedForDistance(d) = clamp(sqrt(aiArrive² + 2·friction·d), passSpeed·passMin/100, passSpeed)`
is applied to the teammate pass and the cross, using ball-to-aim-point distance. Shots on goal
and keeper clearances stay at full `passSpeed` deliberately.

Measured with the human running forward, 5000 frames per setting: `aiArrive` 50 → median 431
(range 292–456), 220 → median 497 (380–512), 500 → median 635 (609–645), with the share of
kicks hitting the full-power cap moving accordingly. Implied aim distances back-solved from
the speeds land at 207–482 units, which are ordinary pass lengths.

`driveCarrier` keeps a non-kick plan for `planHold` ms instead of re-deciding every 0.22–0.44 s.
It breaks early only on pressure closer than `planBreak`, or when the plan's own `laneClear`
check no longer holds — the solo plan carries `checkX/checkY/checkR` for exactly that. Kick
plans still fire immediately.

**Exactly one player per team goes to a loose ball** — `chaserOf(list)`, in both `attack()`
and `defend()`. Everyone else keeps doing their job: the attacking side runs its lanes
(around the ball's position when there is no carrier), the defending side marks. An earlier
version sent the whole attacking team at any unowned ball, which made every pass collapse
into a scrum. `nearestTo` skips keepers and skips `lockedPlayer` during `lockOut`, so nobody
chases a ball they just played. If the designated chaser is `ctrl`, no AI player is sent —
while defending that is always the case, so pressing the ball is the human's job.

`driveCarrier()` runs for any AI ball carrier, and it **does not move him** — `moveTo` returns
early for the ball owner, because the automatic chase in `carryChase` owns that. What
`driveCarrier` does is decide a plan, queue kicks onto `ball.pending`, and let `moveTo` buffer
the direction toward its plan target. That buffered direction is what the next contact uses as
the kick direction, so the AI dribbles by aiming its touches, exactly like the human aims his
with the stick. One code path, both teams.

It re-decides every 0.22–0.44 s via `decide()`:

1. **Shoot** if within `shootRange` of the goal and `laneClear` to a random point inside the
   mouth.
2. **Pass** to the best teammate, scored by openness (distance to nearest opponent), forward
   progress and distance, requiring a clear lane. Taken when under pressure (<110), when the
   score is high, or always for a keeper.
3. **Dribble** toward the goal otherwise, stepping sideways away from the nearest defender.

Mistakes come from `foeError`: the chosen kick direction is rotated by a random angle up to
that many degrees. That is the only randomness in the decision — placement, not dice.

`SETTLE` (0.3 s) blocks crosses and passes for a moment after possession is gained, so the AI
does not fire the ball away the instant it touches it. Shots are exempt — a first-time finish
is legitimate. The sidestep in the dribble target is hysteretic (`p.side`, flips only once the
defender is 60 units clear on the other side); without that it swung 360 units whenever a
defender crossed, which whipped the carrier's facing and threw the ball off its foot.

Both teams run the same touch cycle and the same claim, so an apparent AI-only quirk is
almost always a **ratings** difference (the two teams no longer have separate constants at
all) or an exposure difference — the AI receives far more often than you do, so you see its
receptions more.

### Finishing: box runs, crosses, solo runs
The AI used to run to the byline and stall. Rather than a scripted-play engine (a
coordinator, role assignment, timers and abort conditions — machinery that tends to look
robotic and break when the defence does not cooperate), the plays fall out of four rules:

- **A penalty area exists**, `boxW() = goalW * 2.9` by `boxD() = goalW * 1.7`, both capped by
  the pitch and both drawn. It scales with the "Šířka branky" slider, so there is no separate
  tunable for it.
- **Runs change in the final third.** Once the carrier is within `boxD() * 2.2` of the goal,
  `mateTarget` stops scoring generic lane pockets and sends band-0 runners into the box,
  spread across `boxW()` by their lane, and band-1 runners to the edge of the box. Lanes are
  assigned by current x, so whoever is out wide stays wide — the "winger" is positional, not
  a fixed player.
- **Crossing.** A carrier that is advanced *and* wide (`|x − centre| > goalW * 0.75`) looks
  for a teammate inside the box and passes to a point **ahead of** them — 35 % toward the
  goal centre and 60 units further on — not to their feet. The lane check uses a smaller
  radius (18 vs 26) because a cross does not need the same corridor a ground pass does.
- **Solo runs.** A carrier in the central channel with nothing inside `soloLane` of the
  straight line to goal drives at the goal and does **not** look for a pass.
- **Runs in behind.** For band 0 only, and only while a teammate actually controls the ball,
  the candidate y range is extended past the deepest opposing outfielder by up to `runDepth`,
  and candidates goal-side of him score a bonus equal to how far beyond they are — capped at
  `runDepth`, so the run cannot degrade into camping on the goal line. The bonus reuses the
  depth itself rather than inventing a weight.
- **Passes lead the runner.** The teammate pass aims at `m + facing * passLead * m.sf`, and the
  `laneClear` check runs against that lead point rather than the player. A stationary teammate
  has `sf` 0 and so is still played to his feet. The cross was already leading and is unchanged.
- **The dribble no longer runs off the pitch.** Its target is clamped to `boxD() * 0.25` short
  of the goal line, and the pull toward the centre rises from 0.35 to 0.75 once advanced.

Measured against the default keeper, human standing still: before these rules 0:0 over 150 s;
after, 0:1 in 60 s and 0:4 in 120 s. Same keeper, same everything else — the difference is
that attacks now end in a shot.

### Keepers
One per team, outside `teamSize`, created in `buildTeams` and never `ctrl`.

**The keeper has no magic radius.** `pickupOf(gk)` is `CONTACT` (his body) and `stealR` has no
keeper branch at all, so he catches only what he physically reaches. Earlier he absorbed
anything inside a 55-unit circle, which made him a wall — measured 0:0 over 150 s. He is drawn
as a rectangle 1.6× wider than tall and has no circle, so the sprite no longer implies reach.

**Positioning.** `playKeeper` puts him on the ball→goal line at `min(gkDepth, distance * 0.4)`
out, clamped to his own penalty box at all times. `gkDepth` now means only how far off his line
he stands — nothing to do with catching.

**Shot detection and the save.** A shot is any loose ball whose velocity has a component toward
his goal and whose straight-line projection crosses the goal mouth, whoever kicked it. On first
detection it is latched — `shotId`, a `gkReaction` deadline and a one-off `gkError` offset are
sampled once and never resampled until the shot ends. The save point is the ball's x where it
crosses his current y under the same constant-deceleration model as `interceptSolve`. Before
the deadline he keeps positioning normally; after it he moves to the save point at
`gkDiveSpeed` %. He can therefore simply fail to arrive.

**Parry vs catch.** On contact, a ball faster than `gkParrySpeed` is not caught: it is deflected
away from his goal with up to 50° of random lateral spread at `gkParryKeep` % of its speed, and
`lockedPlayer`/`lockOut` stop him re-collecting his own parry.

**On the ball.** Inside his box he is unstealable for `gkHoldMax` ms, then not. His `decide()`
order is: play a teammate pass if one passes `laneClear` (weighted by `speedForDistance` like
any pass) → else dribble out if no opponent is within `gkVentureSafe`, never further from his
goal than `boxD() + gkVenture` → else hoof it clear at full power.

Measured over ~60 000 frames per bucket, save rate against decided shots:

| shot speed | decided | goals | saves |
|---|---|---|---|
| ~297 | 50 | 12 | **76 %** |
| ~477 | 74 | 28 | **62 %** |
| ~657 | 62 | 30 | **52 %** |

Falls monotonically with speed, and fast shots go in regularly. At defaults a natural run
finished 0:5, against 0:0 for the old absorber. Parries only occur above `gkParrySpeed` 520 —
none at all in the 297 and 477 buckets, 12 across the fast runs, and the keeper re-collected
his own parry **zero** times. Neither keeper ever exceeded `boxD() + gkVenture` = 558 from his
own goal; the most observed was 362.

### Light 3D: the camera tilts, the simulation does not
**Axonometric, not perspective.** World `(x, y, z)` reaches the screen as

```
sx = x
sy = y·cos(camTilt) − z·sin(camTilt)
```

and that is then scaled to the viewport. Nothing shrinks with distance: two players at opposite
ends of the pitch are the same size on screen. At `camTilt` 0 the `z` term is zero and the whole
thing collapses to the old top-down projection — that is the control, and both the picture and
the digest are checked against it.

- **One projection, three functions.** `PX(x)`, `PY(y, z)` and `X(length)` in `render.js` are the
  only places world units become pixels. Nothing outside `render.js` reads the camera.
- **The pitch is fixed and the camera fits it.** 1200 × 2600 units, always. The scale is
  `min(cssW/FIELD_W, cssH/envelope)` where the envelope is `FIELD_H·cos + goalH·sin` — the far
  goal's crossbar is included so it cannot be cropped at small tilts. The smaller ratio wins, so
  a viewport of the wrong aspect gets **letterboxed, never stretched**; the bands it leaves above
  and below the pitch are where the stands sit.
- **Depth sorting by world y.** Everything on the pitch — players, both goal frames, the ball —
  is drawn from the smallest y (farthest) to the largest (nearest), so a nearer body covers a
  farther one. The key is the *world* y, never the screen y: height must not let a tall object
  jump forward in the order. Two exceptions, both deliberate: the ball's shadow is flat on the
  grass under everything, and an **airborne ball is drawn last of all**, over every player,
  because it is flying over them. A **carrier never hides his own ball**: while the ball is owned
  its sort key is nudged just past its owner's. Without that, dribbling toward the far goal puts
  the ball 25 units *behind* the carrier in depth and his body swallows it.
- **Players are boxes** `playerH` tall. In this projection `x` is not sheared at all, so the
  left/right faces have zero width: what you see is the **top face** (shirt number on it, squashed
  with the face like any pitch marking) and the **front face**, drawn darker. The
  controlled-player ring is drawn at head height rather than at the feet — on the ground its own
  body would hide all but a sliver of it — and at tilt 0 it is exactly the old circle.
- **The ball is a sphere** resting on the grass: its centre is drawn at `z + BALL_R`, which is
  invisible at tilt 0. The old height cues stay — shadow on the true ground position, ball
  growing slightly with `z` — because at small tilts the vertical offset alone is a weak signal.
- **Stands** on all four sides: four flat quads rising away from the pitch, one fill each and
  three rake lines, no crowd, no animation, no textures. They are scenery for the space the tilt
  opens up. Constants live in `render.js` (`STAND`), not in the panel.
- **Input is not inverse-projected.** A drag direction is the same world direction it always was.
  The aim line, on the other hand, is drawn in world coordinates and projected like everything
  else, so it shows the ball's true path and therefore **does not** sit at the thumb's on-screen
  angle. Worst case at tilt 30 is **4.12°** (at a thumb direction 47° off the vertical axis; 0 for
  a pure up/down or left/right drag). 15° → 0.99°, 45° → 9.88°, 55° → 15.72°.
- **The aerial aim arc now bows in `z`** — the honest shape — whenever the camera can show height.
  At `camTilt` 0 it cannot (the bow would project onto the aim direction itself), so there the
  original sideways glyph is kept. Same rule for the little "aerial armed" arch over the carrier's
  head. Note the honest arc still flattens for a lob aimed straight up the pitch at *any* tilt,
  because `z` only ever moves a point vertically on screen: that direction is the degenerate one.

### Goals, scoring, match
Both goals are centred on `FIELD_W/2`, mouth `goalW` wide and `goalH` **tall**. You attack the top
(`y = 0`); the bottom is yours. A goal counts when the ball crosses the line **between the posts
and below the bar**; anything else at that end is a wall and bounces, so there are still no
throw-ins or corners, deliberately.

**The frame has no thickness** and the test is on the ball's centre, exactly as the mouth test
always was. So the goal did not get narrower: what used to be a goal still is, as long as it
passes under the bar, and "hitting the post" is the end-wall bounce that was already there. On top
of that, a ball crossing the plane within one ball radius above the bar (`goalH ≤ z ≤ goalH +
BALL_R`) is a **crossbar hit**: its vertical speed is reversed and scaled by the same 0.72 as the
walls, so a rising ball is knocked down and a dropping one pops up. Higher than that it is simply
over the frame and the end wall returns it. Measured (full-power ball fired at the line, `goalH`
90): crossing at z ≤ 89.4 → goal; at 99.4 → bar, `vy` −700 → +504 and `vz` −566.7 → +408, landing
back in play at y 693; at ≥ 109.4 → wall bounce, `vy` +504, `vz` untouched, back in play at y
308–360. In every case the ball spends **one** frame at the line — it never sticks.

A goal pauses play for 1.4 s, flashes, and calls `reset(kickNext)` — the conceding team
kicks off. Own goals count for the other side; passing backwards into your own net is a real
hazard.

Reaching `targetGoals` sets `matchOver` and stops the clock. `frame()` in `main.js` then
returns to the menu with the score; `newMatch()` clears the score at the next kickoff, so the
result stays readable on the home screen until you start again.

### Two match modes: to a goal target, or on the clock
`S.mode` is `'goals'` (the original behaviour) or `'timed'`, picked on the home screen. It is
**not** a tunable and never touches `T`.

- **Na góly.** Unchanged: `goal()` ends the match when either score reaches `targetGoals`.
  The clock does not exist — `S.clock` stays 0 and the HUD's middle slot shows the goal target
  instead. Verified bit-identical to the pre-mode game over six seeded matches.
- **Na čas.** `S.clock` counts down from `S.matchLen`, one of the durations in `MATCH_TIMES`
  (`config.js`, seconds). `targetGoals` **does not apply at all** — being ten goals up ends
  nothing; only the clock does.
- **The clock ticks in exactly one place**: `tickClock(dt)` in `match.js`, called from the top
  of `step()`. That is the whole reason it cannot run at the menu or during the post-goal
  pause — `step()` is not called in either case, so there is no separate "is it paused" test to
  get wrong. Measured: 0 clock movement over 600 menu frames against a planted non-zero probe,
  and 0 over the 83 paused frames of a goal pause (bit-identical value before and after).
- **Full time.** If one team leads, `tickClock` sets `matchOver`, and `step()` **returns
  immediately** so no goal can land on the frame after time expired. If the score is level it
  sets `S.sudden` instead: the clock stops at 0 and play continues.
- **Golden goal** (`S.sudden`). The next goal by either side ends the match — `goal()` reads
  `S.sudden` in place of the `targetGoals` test. There is no time limit on it. On screen it is
  a gold pill reading **ZLATÝ GÓL** pinned under the HUD for as long as it lasts, plus the
  stopped `0:00` and its label turned gold. `newMatch()` always clears it.
- Full time returns to the menu through the same path as a goal-limit finish: `matchOver` is
  only recorded, and `frame()` opens the menu with the result.

Because the clock accumulates a float, full time lands on the first frame where the remainder
is ≤ 0. At a fixed 60 fps that is exact for 180 s and 300 s and one frame (16.7 ms) late for
60 s — `60 − 3600·(1/60)` leaves +2.1e-12. On a phone `dt` varies every frame anyway, so the
last frame is approximate by construction; no epsilon is applied.

### The dribble is a physical touch cycle with an automatic chase
The ball is never attached to anyone and is never driven by a formula. It always carries
velocity, friction and wall bounces. A dribble is a repeating cycle of real kicks:

- **Contact** is `dist(carrier, ball) <= CONTACT`. That is the only moment input reaches the
  ball, and the only place a loose ball is stopped. Reaching it is a distance outcome, not a
  timer.
- **At contact**, in order: fire a queued pass if there is one; otherwise read the buffered
  stick (direction `d`, magnitude `m`), set the carrier's speed for this cycle to
  `v = speedOf(carrier) * m`, and kick the ball with `ball.v = d * (v + touchPush * m)`. If
  `m` is 0 the carrier stops and the ball stays where it lies at his feet; he keeps it, and a
  new cycle starts only when the stick moves again.
- **Between contacts** the ball is ordinary physics, and the carrier **runs automatically at
  the ball** at speed `v`, recomputed every frame. Not along a stored vector — at the ball —
  so a wall bounce or a deflection is followed rather than lost. The stick is buffered only;
  `chaseSteer` (0 by default) is the escape hatch that blends it back into the run direction.

**Why it converges, on paper.** At the kick the ball travels `v + touchPush*m` against the
carrier's `v`, so the relative speed is `touchPush*m` under a relative deceleration of
`friction`. Relative displacement is `s(t) = touchPush*m*t − friction*t²/2`, giving

```
peak gap   = (touchPush*m)² / (2*friction)
cycle time = 2*touchPush*m / friction
```

This holds while the ball is still rolling for the whole cycle, which is exactly
`touchPush <= speedOf`. Above that the ball stops early and the carrier walks in the
remainder, so the cycle is longer than the formula but still finite. `main.js` carries an
assertion guard: if the gap ever exceeds twice the derived peak it is counted on `S.gapWarn`
and logged to `S.gapWarnLog` with the state that produced it. Nothing is snapped back — the
point is to find out, not to hide it.

**Possession is never lost to distance**, only to an opponent's steal check against the
ball's actual position. Being far from the ball mid-cycle is the intended risk of a big
touch.

Two earlier attempts at a physical cycle failed (`63c67c1`, `457c95b`) for one specific
reason: the carrier ran along a *locked stick vector* while the ball flew on its own, so the
two diverged and the ball ended hundreds of units away. The chase must target the ball. Do
not reintroduce a locked movement vector.

Before this there was a scripted cycle (`c4816b9`) that drove the ball with
`carrier + touchDir * maxLead * sin(pi*progress)` over a fixed duration in ms. It was
replaced because the ball visibly bulged out and back on a timer instead of being knocked.

### Reception: the pickup radius claims the ball, it does not stop it
A loose ball crossing a pickup radius does not slow, stop or bend. The radius only decides
who is going to collect it.

- **Claim.** Each frame, for a loose ball, every eligible player whose pickup radius the
  ball's *path* passes through gets an intercept solved against the same constant-deceleration
  model as `interceptSolve`, allowed up to `speedOf(p) * lungeSpeed/100` and only needing to
  close to `CONTACT`. The earliest solvable claims it. One code path for both teams, so an
  opponent standing in a passing lane intercepts by exactly the same rule. A claim transfers
  to anyone who gets there at least 0.05 s sooner; the threshold stops it flapping.
- **Lunge.** The claimed player moves to the solved point at the speed the interception
  requires, capped, recomputed every frame so the target slides as the ball decelerates.
- **The lunge only takes over movement when it needs to** — while the solved requirement
  exceeds `LUNGE_TAKEOVER` (15%) of normal speed. Below that the player keeps his own
  movement and the ball simply arrives. This matters: the solver returns *zero* required
  speed whenever the ball's path already passes within body contact of where the player
  stands, and an earlier version suppressed him for the whole claim regardless, which froze
  receivers for a median 183 ms and up to 717 ms. Standing still while a ball rolls onto your
  foot is correct; being unable to do anything else is not.
- **Contact takes the ball** — any eligible player within `CONTACT`, not only the claimer, so
  a body in the way collects it.

### The ball has height
`ball.z` is height above the pitch and `ball.vz` the vertical speed; `airborne()` is
`z > 0 || vz !== 0`. A ball at someone's foot has both at zero, so **every aerial branch is
skipped in ground play** and the game is bit-identical to before the feature — verified below.

**Flight.** Gravity pulls `vz` down every frame. Horizontally an airborne ball is braked by
`airDrag`, not by `friction`, using the same one-frame integrator (`rollBall`) so the two
environments cannot drift apart by accident. Walls still bounce it, and the goal takes it only
**under the bar** — see "Goals, scoring, match" for what a lob over `goalH` does now.

**Untouchable in the air.** A ball with `z > 0` cannot be dribbled, tackled or collected: it
flies over everyone. The only exception is a **keeper**, who may catch or parry an airborne
ball inside his normal reach, because that is what a keeper does. Structurally this is one
line — the loose-ball takeover asks `takerAt(x, y, ball.z > 0)` and the airborne form of that
filter admits only `role === 'gk'`. An owned ball is never airborne, so the steal check and
the dribble need no aerial case at all. Measured over 66 640 frames of scripted aerial play:
**0** frames with an airborne ball owned by anyone, and 301 frames where an outfielder stood
inside `CONTACT` of an airborne ball and it passed over him untouched.

**Launch, and the range derivation.** An aerial kick of speed `v` is split by `liftAngle`
(`a`) into `v·cos a` horizontal and `v·sin a` vertical, which is a plain projectile:

```
flight time  T = 2·v·sin a / g
apex         h = (v·sin a)² / (2·g)
range        R = v·cos a·T − airDrag·T²/2      (airDrag 0 → the classic v²·sin 2a / g)
```

So pass power controls aerial range the way it already controls ground roll — by a different
function of the same `v`. At defaults (38°, g 1400, airDrag 40), derivation against
measurement through the real `doPass` and the real integrator:

| power | v | R derived | R measured | apex derived | apex measured | flight derived/measured |
|---|---|---|---|---|---|---|
| min (on the ring) | 320 | 69.4 | 69.3 | 13.9 | 13.8 | 0.281 / 0.281 s |
| medium | 560 | 212.5 | 212.3 | 42.5 | 42.4 | 0.493 / 0.493 s |
| full | 800 | 433.7 | 433.4 | 86.6 | 86.6 | 0.704 / 0.704 s |

The ≤0.3-unit gap is the horizontal integrator: the derivation is analytic, the simulation
steps Euler once a frame, exactly as the ground roll always has.

**Bounces.** On landing `vz` reverses and is scaled by `bounceKeep`, and the horizontal
velocity is scaled by `bounceDrag`. Below `BOUNCE_STOP` (60 units/s, a code constant, not a
tunable) it stops bouncing and becomes an ordinary rolling ball. A full-power aerial kick that
nobody collects:

| bounce | t | apex | hop | total | \|vz\| landing | horiz after |
|---|---|---|---|---|---|---|
| 1 | 0.704 s | 86.6 | 433.4 | 433.4 | 492.5 | 481.3 |
| 2 | 1.020 s | 17.5 | 150.4 | 583.9 | 221.6 | 374.8 |
| 3 | 1.163 s | 3.5 | 53.0 | 636.9 | 99.7 | 294.1 |

then it settles and rolls another 106.8, coming to rest **1.92 s and 743.7 units** from the
kick. Across the power band (0 / 0.25 / 0.5 / 0.75 / 1): flight 69 / 131 / 212 / 313 / 433,
2 / 2 / 3 / 3 / 3 bounces, at rest after 120 / 228 / 364 / 537 / 744 units — against a ground
pass of the same power rolling 128 / 242 / 392 / 578 / 800. **It never stops dead on first
contact.**

**The landing moment is resolved inside the frame, not at its edge.** `airStep` integrates up
to the exact instant `z` reaches 0 and asks `takerAt` there. Somebody in reach → the ball
stays on the ground at that point and the ordinary takeover block collects it in the same
frame. Nobody → it bounces and the rest of the frame is integrated on the new velocity. Doing
this at frame granularity instead would put the only moment the ball is touchable *between*
frames. Two landings in one frame are impossible: after a bounce the flight lasts at least
`2·BOUNCE_STOP/gravity` = 0.04 s, longer than the 0.033 s `dt` cap.

**One model answers "where will it come down".** `ballAtT` gets an airborne branch built on
`airProfile()`, which lays the rest of the flight out as segments of constant deceleration —
flight, landing, bounce, flight, … then one final rolling segment. Claim, intercept, chaser
selection and the keeper's save point all read it, so they cannot disagree about the landing
point. At launch the predictor says the first landing is at 433.7 (simulation: 433.4) and rest
at 746.6 after 1.90 s (simulation: 743.7 after 1.92 s). `interceptSolve` and `lungeSolve` start
their search at the **landing time** rather than 0 — a point under a flying ball is not an
interception — which is exactly "the claim uses the predicted landing point, not the current
position", and leaves the ground case starting at 0, character for character as before.

**Collecting a dropping ball is worse than collecting a rolling one.** A ground reception
stops the ball dead. A reception at a landing instead gives a **longer first touch**, scaled
by the vertical landing speed: the push is `airTouch` % of `|vz|`, fed through the same
derivation as `touchPush`, so the receiver then has to run onto his own touch.

| landing \|vz\| | push | peak gap | for comparison |
|---|---|---|---|
| 176 (min power) | 53 | 29.4 | ground reception: 25.0 (dead stop) |
| 332 (medium) | 100 | 38.4 | normal full-stick dribble touch: 37.5 |
| 487 (full) | 146 | 52.3 | |

A queued one-tap fires at that moment instead, exactly as on a ground reception — the contact
block runs in the same frame as the takeover. Measured over 40 lofted balls with a one-tap
armed in flight: 29 reached a receiver and **29 of 29 were played first time, 0 frames**
between the reception and the ball leaving.

**How often an aerial pass is actually collected.** Same scripted human, same seeds, same
aiming policy, aerial vs ground, ~67 000 frames each. "Collected" = the kicker's own team
takes the next possession.

| power | aerial | ground |
|---|---|---|
| min | 74 % (54 kicks) | 71 % (76) |
| medium | 26 % (50) | 59 % (74) |
| full | 26 % (42) | 37 % (76) |
| all | **44 % (146)** | **56 % (226)** |

So aerial passes are **not** near-uncollectable, but they are clearly worse than ground ones
above minimum power — which is the intended cost: the ball is untouchable in flight (nobody
can shorten it), it lands further out, and the first touch is longer. Minimum power is a
69-unit chip that barely leaves the foot, which is why it tracks the ground number.

The AI never plays an aerial pass in this build (0 of 325 AI kicks were aerial); it receives
them through the same claim and chase path as any other loose ball.

**Keepers.** Aerial shots go through the existing detection and save path unchanged;
`crossX` only needed a longer search horizon, because an airborne ball is not braked by
friction. `parry` scales `vz` by `gkParryKeep` like the horizontal speed, so a parried lofted
ball pops up and drops rather than continuing into the turf, and it is a no-op on a ground
ball. The catch/parry threshold uses the **full** speed including `vz`, so a dropping ball
that is barely moving across the ground still counts as fast. A keeper *catches* a dropping
ball cleanly — the longer first touch is for outfielders only.

Save rate, 400 trials per row, identical shooting positions for both kinds. Measured before the
crossbar existed and before `gravity`, `airDrag` and `bounceDrag` were retuned in `9199e0d`, so
the absolute numbers are historical:

| shot | ground | aerial |
|---|---|---|
| full power (800) | 56 % | 64 % |
| — from 150–250 | 45 % | 47 % |
| — from 250–325 | 56 % | 63 % |
| — from 325–400 | 69 % | 84 % |
| half power (560) | 83 % | 87 % |

Aerial shots were **easier** to save, and increasingly so with distance, because they land
short and lose pace on the bounce. Height bought nothing against the keeper, because his reach
has no height either.

At today's defaults, and with the crossbar, 400 full-power shots from 150–400 units with only the
keeper defending:

| shot | goals | keeper stops it | over the frame |
|---|---|---|---|
| ground | 270 (67.5 %) | 130 (32.5 %) | 0 |
| aerial, `goalH` 200 (i.e. as before) | 258 (64.5 %) | 142 (35.5 %) | 0 |
| aerial, `goalH` 90 (default) | **33 (8.3 %)** | 142 (35.5 %) | **225 (56.3 %)** |

The keeper stops **exactly the same 142** either way — the crossbar takes nothing away from him,
it takes it from the shots that used to go in. See "Goals, scoring, match" for the band where a
lob is under the bar at all.

**Drawing height.** The ball is drawn `z` above its real position (and its centre a further
`BALL_R` up, because a sphere rests *on* the grass) and grows slightly with height; a shadow
ellipse is drawn at the true ground position under everything else, shrinking and fading as `z`
rises. With the camera tilted, `z` is genuinely visible — but only as `z·sin(camTilt)`, which at
30° is half of it, so **the gap between ball and shadow is still the cue** and both are kept. The
`tackleR` ring is drawn only while the ball is on the ground: no ring means nobody can touch it.

**Aerial mode is armed by a lift and shown two ways.** While the carrier is armed, a small
orange arch is drawn above his head (clear of the ball at his foot), and the joystick's
threshold ring and knob turn orange. Charging draws an orange dashed **arc** instead of the
yellow straight line, its length computed exactly as the ground line's is (a fraction of the
roll distance — indicative, not the landing point) and its bow equal to the real apex.

**Where the bow points depends on whether the camera can show height.** With any tilt the bow is
in `z`, i.e. the honest shape. At `camTilt` 0 it cannot be: height and the aim direction land on
the same screen axis and the arc degenerates into a straight line — and straight at the opposite
goal is precisely the direction one lobs — so at zero the original **perpendicular** glyph is
kept, exactly as it was drawn before the camera tilted. The same rule drives the little arch over
an armed carrier's head: over his head in `z` when there is a tilt, offset up the screen when
there is not. Note the honest bow still flattens for a lob aimed straight up the pitch at any
tilt, for the same reason — `z` only ever displaces a point vertically on screen.

The ball in flight is always drawn honestly (offset by `z`, shadow below). A queued aerial pass
keeps the armed-green colour but is drawn as the same arc.

### Passes are queued and fire at the next contact
Because the ball is usually away from the foot, a pass cannot fire from where it lies.
Releasing the joystick past the threshold stores direction and power on `ball.pending`;
the next contact plays it, from the ball's position, in the **stored** direction — not where
the stick points at that later moment. Releasing again replaces it, an **opponent** taking
the ball clears it, and it expires `passQueueMax` after possession. AI kicks go through the
same queue. Lifting the thumb does not stop the carrier mid-cycle: he is on the automatic
chase, so the contact always arrives.

`pending.air` is decided **at release**, not when it fires: you saw an orange arc, so that is
what you get even if the mode changes before the contact. It is only ever set for a pass armed
while you actually hold the ball — aerial mode is per-possession, so a one-tap armed on a ball
in flight is always a ground pass.

**Aerial mode is per-possession.** `S.airMode` is armed by lifting the thumb inside the ring
while carrying, and `S.airBy` records who it was armed for; the moment `ball.owner` is anyone
else — tackled, lost, or the aerial kick itself, which ends the possession — it clears. There
is no time threshold on the toggle, and none is needed: under the new rule a lift no longer
changes movement, so there is nothing for a threshold to disambiguate. The toggle is applied
in `step()` via `touch.lift`, not in the event handler, for the same reason `touch.fire` is:
no state changes while the game is paused.

The cost of that is real and worth knowing: **any release inside the ring while carrying is a
toggle**, including a release exactly *on* the ring, since firing needs `d > threshold`.
Measured over 200 s of scripted play, 100 releases: with every release outside the ring, **0**
toggles; with the pre-change "lift to stop" gesture mixed in every third cycle, 57 releases
happened while carrying and **27** of them toggled the mode. Nothing else can cause one.

### One-tap: arming a pass while the ball is in flight
A pass can also be armed while nobody owns the ball. The claim mechanism already knows who
will reach it, so `S.recv` is `ball.claim` whenever the ball is loose and the claimer is on
the human's team; `S.aimFrom` is the carrier when we have the ball and `S.recv` otherwise.
No claimed team-mate means no line and no arming — including a dead ball nobody is inside
pickup range of, which is unclaimed by construction.

The armed pass survives a reception **by our own team**, and the contact block runs in the
same frame as the loose-ball takeover, so it plays first time — measured at 0 frames between
contact and the ball leaving. Nothing extra fires it; it is the existing queue, no longer
cleared on a friendly take. If the thumb is still down there is no `pending` yet, so the
receiver simply controls the ball and the pass fires later on release as usual.

`until: 0` means the expiry clock has not started. An armed pass must not die in flight —
measured flights run to 4.27 s and 11.8 % exceed `passQueueMax` — so the clock starts when
our team gains possession, not at release.

Both aim lines are drawn **from the player**, not from the ball: the carrier while dribbling,
the anticipated receiver while the ball is in flight, who also gets a dashed ring. The pass
still physically leaves from the ball, which during a dribble is up to `peakGap` ahead of the
body — median 33.6, max 36.7 units, **11.5 css px** on a 375 px viewport. The line is a
direction indicator, not the trajectory origin.

Aiming a one-tap issues **no movement**. While the ball is loose the stick steers the
controlled player live, so without this every aim sprinted him off at full speed: 115 units
(36 css px) over a half-second aim. It costs no control, because the movement band
(0–`joyR`) and the aim band (past `passThresh`) do not overlap — 70 px versus 85 px.

### The keeper's rush
A keeper charges an opposing carrier and clears the ball on body contact. It is a gamble, not
a bigger save radius: he leaves an empty net behind him.

- **Trigger.** An opponent owns the ball and is either inside `gkRushDist` of the keeper's own
  goal, or inside `gkRushLoneDist` and *through on goal* — no team-mate of the carrier passes
  `laneClear` from the ball, and no outfielder of the keeper's team lies on the ball→goal
  segment (the keeper himself does not count as cover). `gkRushDist` 0 disables the whole
  thing and is bit-identical to the behaviour before it existed.
- **Commitment.** Once away he cannot abort for `gkRushCommit`. After that he drops the rush
  if the ball is no longer an opponent's, if the carrier has retreated past the trigger
  distance plus 80, or if he is at `gkRushMax` with the ball moving away.
- **The run.** He goes at the ball at `gkRushSpeed` % of his speed, out of the box if need be,
  never further than `gkRushMax` from his own goal centre — at that limit the target is
  clipped onto the circle, so he slides along it rather than stopping.
- **Contact clears, it does not catch.** `rushClear` sends the ball away from his own goal at
  `gkClearSpeed` with up to `gkClearSpread` degrees of spread. Deliberately separate from
  `parry`, which is a shot striking a keeper. It runs in `step()` **before** the steal check,
  because `stealR` (18) is shorter than `CONTACT` (25) and the keeper would otherwise simply
  steal the ball before his body ever reached it. The steal check itself is untouched.
- **A shot outranks the rush.** Ordering in `playKeeper`: shot detection, then the save once
  `gkReaction` has elapsed (which cancels the rush), then the rush, then normal positioning.
  Inside the reaction window the rush continues — a keeper who has committed forward and has
  not yet reacted is exactly the mistake the attacker earns.

**Committed to a direction, not to a target.** During the commitment window he runs at the
point where the ball was when he set off, not at the live ball. Without this the rush is a
homing missile: he moves at 130 % of the attacker's speed and re-aims every frame, so he is
literally unbeatable — measured 100 % clearances in every cell, with `gkRushCommit` making no
difference at all. There is no momentum in this game, so forbidding an *abort* costs him
nothing; only a stale target does.

The window has to outlast the touch cycle. A stick change reaches the ball only at the next
contact, a median 250 ms into a 500 ms cycle, so at `gkRushCommit` 380 a cut lands with about
130 ms of commitment left — worth roughly 26 units of separation against a 25-unit contact
radius. Measured, rounding him works 2 % of the time at 380, 53 % at 600 and 87 % at 800.

### Momentum: speed is a vector that changes at a finite rate
Players no longer teleport between speeds. `driveMove(p, nx, ny, reqSpeed, dt)` in `util.js`
owns `p.vx,p.vy` and moves it toward the requested velocity at `speedOf(p)/accelTime` when
speeding up and `speedOf(p)/decelTime` when slowing, then clamps the magnitude to `speedOf(p)`.
Facing follows the velocity, so nobody slides sideways, and `sf` is real speed over maximum.

Consequences that had to be handled explicitly, each of which was a measured bug first:

- **`accelTime` 0 is a separate branch everywhere.** Every movement block keeps its original
  pre-momentum expression under `if(!(T.accelTime > 0))`. An integrator with an enormous rate
  would round differently and bit-identity with the old game would fail.
- **Arrival brakes.** `moveTo` caps the requested speed at `sqrt(2·dec·d)` so a player settles
  on a target instead of overshooting it (measured 16.7 units of overshoot and three passes
  back and forth). A `through` flag skips this for *moving* targets — an interception point is
  run through, not arrived at.
- **The carrier keeps running while the ball is at his feet.** `carryChase` calls `driveMove`
  even when `ball.held`, or he could never build up the speed that sets `touchPush` (measured:
  zero touches in 300 frames).
- **The kick is capped by real speed.** At contact `m` is `min(bsf, |v|/speedOf)`, because
  `bsf` is only *intent* and reads 1 while a standing player is still accelerating — the ball
  would leave at 300 from a player doing 0.
- **The cycle speed is the intent sampled at contact** (`ball.chaseM`), not the live stick.
  Using the live stick meant lifting the thumb to pass stopped the carrier mid-cycle, so the
  contact never arrived and the queued pass never fired.
- **`peakGap` is recomputed** (`refreshPeakGap`) from the *current* relative speed, because a
  carrier who brakes mid-cycle separates from the ball in a way the closed form never modelled
  and the guard cried wolf (78.9 against a threshold of 51.6, 17 times in one run).
- **`interceptSolve` models the ramp.** `reachIn` integrates the acceleration phase instead of
  assuming `sp*t`; the old model was wrong by +78 units from a standstill and +316 running away
  from the target.
- **The reception lunge may only add speed.** `lungeSolve` minimises the *required* speed, so
  the cheapest answer is often to slow down and wait — which with momentum is an active brake
  costing a full `accelTime` to undo (69 % of lunges commanded a speed below the player's
  actual, median 0.43×). `lungeStep` therefore commands `max(required, current)`.
- **History uses the real velocity.** With momentum on, `histPush` stores `p.vx,p.vy` directly
  rather than reconstructing it over a 150 ms window.

### Player ratings scale the tunables, they never replace them
Every outfield player has six ratings 0–99 (`speed`, `accel`, `dribble`, `passing`, `control`,
`defending`), every keeper four (`reflexes`, `accuracy`, `rushing`, `passing`). **Rating 50 is
exactly 1.000× the value in `TUNABLES`**, so an all-50 squad is bit-identical to the game
without ratings — verified over six seeded matches against the `pre-stats` tag.

`STAT_SCALE` in `config.js` is the whole spread in one table. It is keyed by **constant**, not
by stat, because one stat drives several constants and each has its own direction — `defending`
lowers `defReact` *and* raises `tackleR`. `dir` is stored explicitly and checked against
`lo`/`hi` at load, so a retune that forgets to flip the direction is caught at boot.

| stat | constants | rating 0 → 99 |
|---|---|---|
| `speed` | `speedBase` | 0.88× → 1.12× |
| `accel` | `accelTime` | 1.50× → 0.60× (lower is better) |
| `dribble` | `touchPush` | 1.35× → 0.70× (lower is better) |
| `passing` | `foeError`, `aiArrive` | 8/3× → 0×; 0.85× → 1.15× |
| `control` | `pickupBase`, `lungeSpeed` | 0.80× → 1.25× |
| `defending` | `defReact`, `tackleR` | 2.50× → 0.40× (lower better); 0.50× → 1.60× |
| `reflexes` | `gkReaction` | 1.60× → 0.50× (lower is better) |
| `accuracy` | `gkError` | 1.70× → 0.40× (lower is better) |
| `rushing` | `gkDiveSpeed`, `gkRushSpeed` | 0.85× → 1.15× |

The spreads are deliberately narrow and deliberately *not* the slider's min/max — the sliders
are exploratory and far too wide to use as player variation. `speed` is the narrowest: ±12 % is
already enough to see a player pull away (44.6 units, ~14 css px, after a 2 s straight run at
99 against 50), and wider makes low-rated players unplayable. `defending` is the widest, at
2.50×→0.40× giving 200/80/32 ms: the original 1.60×→0.50× produced squads at rating 20 and 50
that were statistically indistinguishable on block spread, marker wander, line breaches and box
entries over 24 seeds.

**Everything reads a scaled constant through `stat(p, key)`.** `speedOf`, `pickupOf` and
`stealR` are thin wrappers over it. Two deliberate exceptions, both commented at the call site:
the `T.accelTime > 0` gates (a global momentum on/off switch, not a per-player value — base 0
zeroes everyone's), and the ring drawn around the *ball* at `T.tackleR` in `render.js`, which
has no single player to attribute it to.

Performance: `resolveRatings(p)` precomputes the **multipliers** onto `p.mul`, not the resolved
values. Multipliers depend only on ratings; the base is read live from `T` at use. That keeps
the interpolation out of the inner loop while leaving the gear-panel sliders working live — had
the resolved value been cached, moving a slider would have done nothing until the teams were
rebuilt.

`defReact` is the observer's own reaction time, not a team constant: `perceivedFoe(obs, p)` and
`perceivedBall(obs)` both take the observing defender, and each defender builds his own delayed
picture for everything he acts on — his marking target, his press run, his own press trigger,
his own `lineY`. The single genuinely shared decision (who chases when the press is off) uses
the committed chaser's picture, falling back to the team's first outfielder. Measured over 24
seeds, a squad with `defending` spread 20–80 is indistinguishable from a uniform one on block
spread, marker wander, line breaches and box entries — mixed pictures weaken the block, they do
not shred it.

### The menu is the home screen
`js/menu.js` owns three screens over the canvas, and `S.screen` (`'menu'` / `'game'`) says
which world input belongs to. The home screen is laid out like the pitch — opponent card at the
top (the goal you attack), "Hrát zápas" in the middle, your team at the bottom — with each card
showing its squad as shirt-number chips and their overall ratings.

- **Nothing auto-starts.** Boot calls `reset()` so the pitch is dressed behind the menu, but
  `S.running` stays false until the button is pressed.
- **The mode selector sits directly above "Hrát zápas"**: one row for *Na góly / Na čas*, and
  below it — only when *Na čas* is selected — a row of durations **generated from
  `MATCH_TIMES`**, one button per entry, labelled `M:SS`. Nothing counts the entries, so
  editing that array in `config.js` is the whole change. Both selections are visible without
  opening anything; the chosen one takes the team colour, leaving green to mean "go".
  Measured at 375 px: mode buttons 154×46 css px, duration buttons 100×46, no overflow.
- **Full time returns to the menu** with the score, which stays visible until the next kickoff
  clears it. There is no tap-to-replay: `goal()` only records `matchOver`, and `frame()` in
  `main.js` opens the menu. The post-goal pause *is* still skippable by tapping — that is a
  different thing and lives in `skipPause()`.
- A team page lists every player with all his ratings as numbers and colour-graded bars, so a
  squad reads without opening anyone. Tapping a player opens sliders showing the rating *and*
  the resolved constant (`speedBase 200 → 210 j/s`), which is the bridge between a rating and
  the thing the gear panel tunes.
- **Bulk shift** moves one stat by ±5 across every player in the team who has it, clamped per
  player to 0–99. That is how a per-team experiment is set up — one team on `control` 30, the
  other on 70 — without opening six sheets.
- "Náhodně" is a plain uniform 0–99 draw; "Výchozí" sets the whole team to 50.
- The gear panel is untouched and separate: **the menu tunes players, the panel tunes the
  game.** They are deliberately not merged.

### Lane-based teammate runs
`assignRoles()` sorts non-carrier teammates by current x and gives each
one a lane `(k + 0.5) / n` across the field width, alternating `band`: even index = forward
run (`prefD` 330), odd = support (`prefD` 200). Roles are recomputed every 2.2 s or when the
carrier changes. `mateTarget()` scores a 5×5 grid inside the lane and picks the best spot.

Why: without lanes every teammate solves the same "find open space" problem and converges on
the same pocket, which leaves you one passing option instead of several in different
directions. Lanes force spread; alternating bands guarantee at least one forward option and
one safe one. (This rationale is inferred from the code — the lane penalty
`-|px - laneC| * 0.20` and the `prefD` split are what enforce it.)

## 4. Architecture

`index.html` (97) is a DOM shell, `styles.css` (281) the CSS, and the JS lives in `js/`:
`config` (258), `state` (247), `store` (115), `util` (685), `ai-off` (121), `ai-def` (134),
`ai-ball` (116), `keeper` (181), `match` (88), `input` (67), `render` (484), `ui` (63),
`menu` (304), `main` (358).

Imports run one way only: config → state → store → util → ai/keeper → match → input →
render/ui → menu → main. Because module bindings are read-only, every value that is
reassigned from more than one place lives as a property of a shared object: `S` (game state),
`E` (entity arrays), `ball`, `touch`, `joyBase`, `T`. Those objects are never reassigned, only
mutated.

Three places bend the file layout to keep imports acyclic. `dist`/`clampField` sit in
`state.js` rather than `util.js` because `reset()` needs them; `state.js` exposes a `hooks`
object that `util.js` fills with `pickChasers` and `store.js` with `applyRatings`, because
`reset()` and `buildTeams()` have to call them from the layer below; and `kickPlan` moved to
`util.js` so `keeper.js` and `ai-ball.js` can both use it without importing each other.

`menu.js` imports `match.js` (for `newMatch`), so `match.js` must not import `menu.js`. Full
time therefore only *records* `matchOver`; the return to the menu is triggered from `frame()`
in `main.js`, which sees `S.matchOver && S.screen === 'game'` and calls `openMenu(true)`.

```
resize()                       canvas sizing only               state.js
mk / buildTeams / reset()      entities, kickoff positions      state.js
STAT_SCALE / ratingMul / stat  ratings → scaled constants       config.js
applyStoredRatings/saveRatings ratings persistence              store.js
applyStoredMode/saveMode       match-mode persistence           store.js
tickClock / showClock          the clock, full time, the HUD    match.js
input handlers                 touch + mouse → touch{}          input.js
bufferInput                    stores intent, never moves       util.js
startKick / holdBall           the touch cycle                  util.js
rollBall                       one frame of horizontal braking  util.js
airStep / airProfile           flight, landing, bounce, settle  util.js
airFlightT / airApex / airRange the launch derivation            util.js
airLandingT / ballRestT        when it lands, when it stops     util.js
airFirstTouch                  longer touch on a dropping ball  util.js
takerAt                        who may collect, ground vs air   util.js
driveMove                      velocity ramp (momentum)         util.js
carryChase                     carrier runs at the ball         util.js
updateClaim / lungeSolve /
  lungeActive / lungeStep      reception claim and lunge        util.js
moveTo                         everyone not carrying/lunging    util.js
interceptSolve / pickChasers   who goes for a loose ball        util.js
histPush / histAt              per-player short memory          state.js
perceivedFoe / perceivedBall   what a defender sees of them     util.js
doPass                         releases the ball                util.js
assignRoles / mateTarget       teammate lanes and spots         ai-off.js
decide / driveCarrier          AI carrier plans and kicks       ai-ball.js
openMenu / openSquad /
  openSheet / shift / setAll   menu screens and bulk edits      menu.js
frame()                        rAF loop                         main.js
step(dt)                       all simulation                   main.js
draw()                         all rendering                    render.js
camUpdate / PX / PY / X        the only world→screen projection render.js
buildPanel / clearStore        gear panel                       ui.js
```

### Coordinate system
The pitch is **fixed at 1200 × 2600 logical units** — `FIELD_W` and `FIELD_H`, both constants in
`config.js`. It used to be `FIELD_H = cssH / scale`, i.e. a different pitch length on every
device; 2600 is the round number closest to what that formula produced on phones (375×812 →
2598.4, 390×844 → 2596.9, 430×932 → 2600.9), so the change is at most 3.1 units, 0.12 %.

The camera (`render.js`) turns world coordinates into css px and nothing else does:

```
X(v)      = v · k                                 length → css px
PX(x)     = ox + x · k
PY(y, z)  = oy + (y·cos(camTilt) − z·sin(camTilt)) · k
k         = min(cssW/FIELD_W, cssH/(FIELD_H·cos + goalH·sin))     fit, never stretch
```

`ox`/`oy` centre that envelope, so a viewport of the wrong aspect is letterboxed. On 375×812:
at tilt 0, `k` = 0.31231 (against 0.3125 before — 0.06 % smaller, 0.2 px of side band); at tilt
30, `k` = 0.3125, the width binds exactly as it always did, and the pitch takes 718 of the 812
css px, leaving ~47 px of stand above and below. The joystick and the HUD are drawn in css px
directly and the camera does not touch them. Device pixel ratio is capped at 2.5.

### Entities
`mk(team, role, num)` → `{ x, y, fx, fy, team, tx, ty, think, seed, sf, role, num, plan, side,
bx, by, bsf, vx, vy, h, rush, rushT, rushX, rushY, shotOn, shotId, shotDeadline, shotX, shotY,
ratings, mul }`.

`fx,fy` is facing (init `0,-1`), `tx,ty` the AI target, `think` a plan countdown, `seed` a
per-player random for noise, `sf` the fraction of top speed actually travelled last frame
(measured after `clampField`, so a player pinned on a touchline reports the speed he has, not
the one he asked for). **`bx,by,bsf` is the buffered input** — direction and magnitude the
player *wants*, written every frame by `bufferInput` and only read at contact. **`vx,vy` is
the real velocity vector**, owned by `driveMove` (momentum). `h` is his 256-sample position/
velocity ring (`mkHist`). `rush*` is the keeper's charge. `num` is the shirt number — drawn
only, never read by the simulation. `ratings` is his 0–99 map and `mul` the multipliers
derived from it. `assignRoles` adds `lane`, `laneN`, `band`, `prefD` to teammates at runtime.

Players are 30×30 squares to the simulation (`PH = 15` half-side), `BALL_R = 10`, so
`CONTACT = 25`. The drawn box is that footprint plus `playerH` of height, which nothing in the
simulation reads.
Arrays: `E.blue`, `E.red`, `E.all`, plus `E.gkB` / `E.gkR`. Outfielders are numbered 1..n per
team in `buildTeams`; the keeper is last in each list and carries `num` 0.

`ball` carries the cycle and reception state alongside the physics: `z` / `vz` (height and
vertical speed — both 0 means on the ground and every aerial branch is skipped), `airLand`
(the vertical landing speed of a drop being collected this frame, consumed by the contact
block), `held` (carrier stopped, ball at his feet), `chaseV` (his speed for this cycle),
`chaseM` (the stick deflection sampled at contact and held for the whole cycle), `peakGap`
(derived, for the guard), `gained` (when possession started), `claim` / `claimX` / `claimY` /
`lungeNeed` (reception), `pending` (queued pass, with `air`), `chaser` / `chaseDir` (who is
committed to a loose ball).

`S` holds `screen` (`'menu'` or `'game'`), `ctrl`, `time`, `lockOut`, `lockedPlayer`,
`gkCleared` / `gkClearOut`, `lastTeam`, `kickNext`, `scoreB`, `scoreR`, `matchOver`,
`running`, `deadTime`, `roleTimer`, `lastCarrier`, `drawAim`, `aimFrom` / `recv` (one-tap),
`airMode` / `airBy` (aerial mode and who it is armed for),
the match mode (`mode`, `matchLen`, `clock`, `sudden`) and the viewport size `cssW`/`cssH` —
which is all that is left of the viewport in `S`, since the pitch is a constant and the scale
belongs to the camera. The guard counters `gapWarn` / `gapWarnLog` are **not**
declared in `S` — `step()` creates them on the first warning, so they are absent until one
fires.

### Loop
`requestAnimationFrame(frame)`. `dt` is capped at 0.033 s, so a stall slows the sim rather
than teleporting anything. Every frame: recompute joystick base → tick the respawn timer →
`step(dt)` if running → `draw()`. `draw()` runs even when not running, so the field stays
visible during the pause after a goal.

### Input
One fixed joystick, bottom-centre: `joyBase = { cssW * 0.5, cssH - max(96, joyR + 40) }`,
recomputed every frame. Only one touch is tracked at a time (`if(!touch.active)` on
touchstart); it is identified by `identifier` so other fingers are ignored. Handlers are on
the canvas with `{passive:false}` + `preventDefault`; mouse events mirror them with id `'m'`
for desktop testing. CSS sets `touch-action:none` and `overscroll-behavior:none`.

`onUp` carries the release coordinates (from `changedTouches` / the mouse event), because
the pass direction is decided there. It takes a `cancel` flag: `touchcancel` routes through
the same function but never fires a pass, since a system interruption is not a deliberate
release.

`onDown` ignores the canvas entirely while `S.screen !== 'game'`, so the menu is not a
steering surface. During the post-goal pause (`!running`, but not `matchOver`) a tap calls
`skipPause()` and returns without taking the stick; that tap's `touchend` is ignored because
`touch.id` is still null, so it cannot fire a pass. At full time a tap does nothing — the
match is restarted from the menu, never by tapping the pitch.

### Simulation order inside `step(dt)`
1. `updateClaim()` **first**, because the movement blocks below ask `lungeActive()` whether
   to stand aside and need a fresh answer.
2. Aerial mode: clear it if the armed player no longer has the ball, then apply a pending
   `touch.lift` (a release inside the ring) as a toggle.
3. Controlled player: stick direction and magnitude → `bufferInput`, **except** while he
   carries the ball with the thumb up, where last frame's buffered intent is kept instead. He
   is moved here only if he is neither carrying nor in an active lunge; otherwise the stick is
   buffered and `carryChase` / `lungeStep` move him. A release past the threshold arms
   `ball.pending`, with `air` taken from the mode at that moment.
4. Keepers, then the AI carrier (`driveCarrier` — plans and queues kicks; `moveTo` does not
   move a carrier), then `attack`/`defend` for both teams.
5. `lungeStep(dt)` — the claimed player darts, if the lunge is active.
6. `carryChase(dt)` — the carrier runs at the ball.
7. Ball: on the ground `rollBall(dt, friction)`; in the air `airStep(dt)`, which brakes with
   `airDrag`, applies gravity and resolves any landing at the exact instant it happens. Then
   walls at 0.72 restitution and the goal check inside the mouth, both regardless of height.
   Then the gap guard.
8. Steal check — an opponent within `stealR` of the ball takes it, keeper protection aside.
   An owned ball is never airborne, so this needs no aerial case.
9. Loose-ball contact — the only place a loose ball stops. Airborne, only a keeper qualifies;
   a collection at a landing keeps the ball's pace for the longer first touch.
10. Contact for the owner — fire the queued pass, or take the dropping-ball first touch, or
    kick, or hold.
11. Control switch, then the aim line for drawing.

### Rendering
Immediate mode, redrawn every frame. The camera is recomputed at the top of `draw()`, not in
`resize()` — `camTilt` and `goalH` are sliders and may move at any time.

Painter's order: surround fill → **stands** (far, left, right, near) → pitch fill → stripes →
boundary / halfway / centre circle → goal areas and boxes → goal lines and the post marks on the
grass → **ball shadow** (at the ball's true ground position, always, under everything) → **the
depth-sorted pass** → aerial-mode arch above the armed carrier → anticipated-receiver ring
(dashed, yellow while charging, green once armed) → armed-pass line (green, dotted or arced, from
`S.aimFrom`) → charge aim line (yellow straight or orange arced, dashed, from `S.aimFrom`) → the
ball **if it is airborne** → joystick (inner ring, dashed threshold ring — orange while aerial
mode is armed, knob clamped to the threshold radius).

The depth-sorted pass holds both goal frames, all players and the ball when it is on the ground,
ordered by world y. Per player: pickup-radius ellipse on the grass, front face, top face, white
outline if he owns the ball, **shirt number** on the top face (dark-stroked white digit filling
the square, or a dark dot for a keeper), white ring at `PH*1.2` at head height if he is the
controlled player, facing tick on the top face — it starts at the body edge rather than the
centre so it does not strike through the number.

So the ball is above the players only while it is flying; on the ground it can be hidden by a
player nearer the camera (its shadow still shows through, since the shadow is under everything).
That is one deliberate difference from the pre-tilt renderer even at `camTilt` 0.

The controlled player's marker is a **stroked ring, not a filled disc**. It used to be a
filled disc of radius `PH*1.9` = 28.5, which was wider than the ball's resting offset, so
player and ball read as a single blob and made the human's carry look glued while an AI's
identical geometry did not.

### Tunables are not persisted; ratings are
**`T` is never stored.** It is initialised from `TUNABLES` at every boot, so the game always
runs on what the source says. Sliders mutate `T` live for the session and nothing is written;
`clearStore()` deletes any payload left by the old `fbproto_tuning_v1` key at boot. "Vrátit
výchozí hodnoty" copies `DEFAULTS` back into `T`. Exactly three places in the whole codebase
assign to `T`: the init loop in `config.js` and the two handlers in `ui.js`.

This replaced a `window.storage` / `localStorage` layer that silently overrode new defaults
on any device that had ever saved — changing a default in code had no effect there, and the
symptom was indistinguishable from the code not working.

**Player ratings are stored**, and `js/store.js` is the only file that touches storage. It does
not import `T`, so there is no code path from storage to a tunable. The design, which exists
specifically so the old failure cannot return through this door:

- One key, `fbproto_ratings_v1`, holding `{ v:1, b:[…], r:[…] }` — per team, per player, in
  `E.blue`/`E.red` order (outfield 1..n, keeper last). Ratings and nothing else; ~900 bytes.
- **Validated whole, discarded whole.** The payload must parse, carry the right version, have
  arrays exactly as long as the current squads, and every entry's key set must match that
  player's stat list exactly, with every value a finite number in 0–99. Any failure drops the
  entire payload (and deletes it) and every rating falls back to 50. Partial merging is
  forbidden on purpose: a half-restored squad is the same silent lie the tuning store was.
- `buildTeams()` calls `hooks.applyRatings()` at its end, so this runs at boot *and* on every
  panel-driven rebuild. **Changing `teamSize` or `foeSize` therefore discards the stored
  ratings for both teams** — the array lengths no longer match — and the squad comes back at
  all 50. That is deliberate and is the explicit answer to "what happens when the squad
  changes", not an accident of the validation.
- Saving happens on every rating mutation: on `change` (thumb lifted) for a slider, immediately
  for bulk shift, "Náhodně" and "Výchozí".

The **match mode** is stored the same way and under the same rules, in its own key
`fbproto_mode_v1` holding `{ v:1, mode, len }`. It is a menu choice, not a tunable, and
`store.js` still does not import `T`. Validated whole and discarded whole: wrong version,
an unknown mode string, a non-numeric length, a length no longer present in `MATCH_TIMES`, or
unparseable JSON all drop the payload, delete the key and fall back to *Na góly* with
`MATCH_TIMES[0]`. Editing `MATCH_TIMES` in `config.js` therefore drops a saved duration that
no longer exists rather than playing a length the source does not contain — the same
"discard, never merge" rule as the ratings. Pressing "Výchozí" on both teams leaves a valid
  all-50 payload, which is the supported way to wipe it.

## 5. Tunables

All exposed in the gear panel, generated from the `TUNABLES` list in `js/config.js`. Adding a
tunable is one line there — the panel row, `T`'s initial value and `DEFAULTS` all follow, and
the group headings come from the `group` field. Nothing is persisted; every boot starts from
these values. They are hand-tuned by playing — do not change one without being asked.

| Key | Default | Range (step) | Unit | Effect |
|---|---|---|---|---|
| `teamSize` | 5 | 1–6 (1) | count | Blue outfielders. Rebuilds teams and starts a new match. **Rebuilding discards stored ratings** if the shape changes — see §6. |
| `foeSize` | 5 | 1–6 (1) | count | Red outfielders. Same. |
| `speedBase` | 200 | 120–320 (5) | units/s | Top speed, **every player, both teams**. Per-player and per-team differences come from the `speed` rating, not from a second constant. Replaced `playerSpeed`/`mateSpeed`/`foeSpeed`. Markers still use 0.84×, surplus defenders 0.85×. |
| `pickupBase` | 40 | 16–90 (1) | units | **Claim** radius, both teams. A loose ball whose path crosses it makes that player the receiver; it does not stop or slow the ball. Replaced `pickupMate`/`foePickup`. |
| `tackleR` | 3 | 0–60 (1) | units | Extra steal reach beyond the body. An opponent within `PH + tackleR` of the **ball** takes it. Not the ball's physical radius — that is `BALL_R`. |
| `touchPush` | 100 | 0–600 (10) | units/s | Extra speed given to the ball at contact, scaled by stick magnitude. Sets the whole dribble rhythm: peak gap `(touchPush*m)²/(2*friction)`, cycle `2*touchPush*m/friction`. The formula holds while `touchPush <= speedOf`. |
| `chaseSteer` | 0 | 0–100 (5) | % | How much stick is blended into the carrier's automatic run at the ball. 0 = pure chase and full commitment between contacts, 100 = continuous steering. |
| `lungeSpeed` | 50 | 10–500 (10) | % of normal | **Cap** on the reception lunge. The actual speed is what the interception requires; this only limits it. Note it is a percentage, so below 100 the lunge is slower than normal running. |
| `friction` | 400 | 80–700 (10) | units/s² | Linear deceleration of the ball **on the ground**. Also halves the dribble cycle length if doubled. |
| `gravity` | 1400 | 400–3000 (50) | units/s² | Pulls `vz` down while the ball is in the air. Sets flight time (`2·v·sin a / g`) and apex. |
| `bounceKeep` | 45 | 0–80 (5) | % | Share of vertical speed kept on landing. 0 = the ball dies on the first bounce. |
| `bounceDrag` | 80 | 40–100 (5) | % | Share of *horizontal* speed kept on landing. 100 = a bounce costs no pace. |
| `airDrag` | 40 | 0–300 (10) | units/s² | Horizontal braking **while airborne**, in place of `friction`. Deliberately much weaker. |
| `liftAngle` | 38 | 15–60 (1) | degrees | Launch angle of an aerial kick. Splits kick speed into `v·cos a` along the ground and `v·sin a` upward. Higher = shorter and higher. |
| `airTouch` | 30 | 0–120 (5) | % of landing \|vz\| | How much extra pace a collected **dropping** ball keeps as a first touch. This is the "a dropping ball is harder to control" knob; 0 makes an aerial reception as clean as a ground one. |
| `passSpeed` | 800 | 300–1100 (20) | units/s | **Maximum** pass speed, reached when the thumb is released `passRange` past the ring. |
| `passRange` | 120 | 40–260 (5) | css px | How far past the threshold ring the thumb must travel for a full-power pass. |
| `passMin` | 40 | 10–90 (5) | % of `passSpeed` | Weakest pass, played when the thumb is released right on the ring. |
| `aimLen` | 33 | 5–100 (1) | % of roll distance | Length of the aiming line as a fraction of how far the ball would really go. |
| `aiArrive` | 220 | 50–500 (10) | units/s | Speed an AI pass should still have on arrival. Drives distance-scaled pass power. |
| `passQueueMax` | 1700 | 200–2000 (50) | ms | How long an armed pass waits for a contact before being dropped, counted **from possession**, not from release. With the automatic chase a contact always arrives well inside this, so it effectively never expires. |
| `passLead` | 150 | 0–300 (5) | units | How far ahead of a moving teammate an AI pass is aimed, scaled by his `sf`. |
| `joyR` | 70 | 40–100 (2) | css px | Inner ring radius. Also the distance at which you hit full speed. |
| `passThresh` | 122 | 100–180 (2) | % of `joyR` | Outer ring radius — the charge boundary. ~85.4 css px at the default. |
| `camTilt` | 30 | 0–55 (1) | degrees | Camera tilt off vertical. `sy = y·cos − z·sin`. **0 = the old top-down view**, and the control every check is run against. Rendering only — no simulation value reads it. |
| `playerH` | 55 | 0–120 (5) | units | How tall a player's box is drawn. Rendering only; 0 gives flat squares again. 55 against a 240-unit goal is roughly human proportions, but the value is a look decision, hence a slider. |
| `goalW` | 240 | 100–500 (10) | units | Goal mouth width, centred on `FIELD_W/2` at both ends. Also scales the boxes. |
| `goalH` | 90 | 40–200 (5) | units | Crossbar height. **A goal counts only below it**; higher is a bounce off the frame. This one *does* change play — at 90 a full-power lob is under the bar only within 153 units of the kick or beyond 468. |
| `targetGoals` | 5 | 1–15 (1) | count | First to this many goals wins. |
| `shootRange` | 400 | 200–1600 (20) | units | How close to goal an AI carrier must be before it will shoot. |
| `soloLane` | 50 | 20–160 (5) | units | How clear the line to goal must be before a central carrier goes alone. |
| `foeError` | 3 | 0–35 (1) | degrees | Random rotation on every pass and shot — **the human's too**, applied in `doPass` at the moment the ball leaves, so the aim line still shows where you aimed. The base is 3 rather than 0 so the `passing` rating has room above 50 as well as below; rating 0/50/99 resolves to 8/3/0°. |
| `runDepth` | 120 | 0–400 (5) | units | How far beyond the last opposing defender a band-0 run may target. |
| `interceptEff` | 90 | 50–100 (1) | % | Share of top speed a player assumes he can sustain when solving an intercept. |
| `planHold` | 500 | 100–1500 (50) | ms | How long an AI carrier keeps a non-kick plan before reconsidering. |
| `planBreak` | 90 | 40–250 (5) | units | Opponent proximity that breaks the plan early. |
| `markDist` | 45 | 20–120 (1) | units | How far goal-side of his man a marker stands. |
| `markShift` | 25 | 0–60 (1) | % | Share of the x gap between the marked man and the ball that the marker shifts across. |
| `lineGap` | 60 | 0–200 (5) | units | How far behind the deepest attacker the defensive line sits. |
| `pressDist` | 900 | 200–2000 (20) | units | Ball must be within this of the defending goal before anyone presses it. |
| `wobbleNear` | 600 | 100–1500 (20) | units | Distance from the ball at which a marker's drift fades to zero. |
| `defReact` | 80 | 0–1200 (10) | ms | How stale a defender's picture of the *opposing team* is — press, marking, line and press trigger alike. 0 = frame-perfect mirroring. |
| `gkDepth` | 55 | 0–160 (5) | units | How far off his line the keeper stands. Positioning only — he saves with his body. |
| `gkReaction` | 120 | 0–500 (10) | ms | Delay before the keeper reacts to a detected shot. |
| `gkError` | 15 | 0–200 (5) | units | One-off random error on the sampled save point. |
| `gkDiveSpeed` | 130 | 100–300 (5) | % | Speed multiplier while moving to the save point. |
| `gkParrySpeed` | 400 | 200–1000 (20) | units/s | Above this the keeper parries instead of catching. |
| `gkParryKeep` | 35 | 10–90 (5) | % | Share of speed a parried ball keeps. |
| `gkHoldMax` | 1200 | 300–3000 (100) | ms | How long the keeper is unstealable inside his own box. |
| `gkVentureSafe` | 260 | 80–600 (10) | units | No opponent this close means he may dribble out. |
| `gkVenture` | 300 | 0–500 (10) | units | How far beyond the box he may carry the ball. |
| `gkRushDist` | 320 | 0–900 (10) | units | Carrier this close to goal and the keeper charges out. 0 disables the rush entirely. |
| `gkRushLoneDist` | 520 | 0–900 (10) | units | Same, for a carrier who is through on goal — no pass on and nobody covering. |
| `gkRushSpeed` | 130 | 80–250 (5) | % | Speed multiplier while rushing. Above 100 he is faster than the attacker. |
| `gkRushMax` | 420 | 0–900 (10) | units | Hard limit on how far from his own goal centre a rush may take him. |
| `gkRushCommit` | 380 | 0–1200 (20) | ms | How long a rush cannot be aborted, and how long he runs at a stale target. This is the whole beatability knob; needs to exceed the 500 ms touch cycle to matter. |
| `gkClearSpeed` | 700 | 200–1400 (20) | units/s | Speed of the clearance when a rushing keeper reaches the ball. |
| `gkClearSpread` | 40 | 0–90 (5) | degrees | Random lateral spread on that clearance. |
| `accelTime` | 300 | 0–2000 (20) | ms | Time from a standstill to top speed. Computed from **this player's** maximum, so a slower player does not also take longer to get going. `0` switches momentum off entirely and every movement block falls back to its original expression, character for character — that branch is what keeps bit-identity with the pre-momentum game. The `T.accelTime > 0` gate is global on the base; the *rate* is per-player via the `accel` rating. |
| `decelTime` | 20 | 20–2000 (20) | ms | Time from top speed to a standstill. Not scaled by any rating. |

There is no positional id mapping any more — rows are generated from `TUNABLES` in order, so
a new entry can go anywhere and nothing shifts.

### Non-tunable constants (in code, no UI)

| Constant | Value | Where |
|---|---|---|
| `FIELD_W` | 1200 units | `config.js` |
| `FIELD_H` | **2600 units, fixed.** Was `cssH / scale`, so the pitch was a different length on every device; 2600 is the round value closest to what phones produced (2598.4 / 2596.9 / 2600.9). The camera fits it and letterboxes the rest | `config.js` |
| `STAND` | `gap 40, depth 560, h 250, rows 4` units — the four stands. Scenery, no gameplay effect, so deliberately not tunables. `depth·cos > h·sin` at every allowed tilt, which is what keeps the near stand from folding over the pitch | `render.js` |
| Player half-size `PH` | 15 (30×30 square) | `config.js` |
| `BALL_R` | 10 | `config.js` |
| `CONTACT` | `PH + BALL_R` = **25** units — the contact test, and where a held ball sits | `config.js` |
| `GOAL_DEPTH` | 60 units — drawn goal area only, no effect on play | `config.js` |
| `MATCH_TIMES` | `[60, 180, 300]` seconds — the timed-match durations offered by the menu. **Deliberately not a tunable**: it is edited in the file, not found with a slider, and the menu generates one button per entry | `config.js` |
| `BOUNCE_STOP` | 60 units/s — below this vertical speed the ball stops bouncing and rolls. **Deliberately not a tunable**: it is the threshold below which a bounce is invisible (1.3 units high, 86 ms at default gravity), and it is also what guarantees at most one landing per frame, since the shortest post-bounce flight `2·60/3000` = 0.04 s exceeds the 0.033 s `dt` cap | `config.js` |
| `STEAL_LOCK` | 0.5 s before the player who lost the ball can retake it | `config.js` |
| `SETTLE` | 0.3 s before an AI that just gained the ball may kick it | `config.js` |
| `LUNGE_TAKEOVER` | 0.15 — the lunge only drives the player above 15% of normal speed | `util.js` |
| Claim hand-over margin | 0.05 s a rival must beat the incumbent by | `util.js` |
| Pass lockout | 0.32 s before the passer can re-collect | `util.js` |
| Role reassignment | every 2.2 s or on carrier change | `ai-off.js` |
| Goal pause | 1.4 s | `match.js` |
| `dt` cap | 0.033 s | `main.js` |
| Wall restitution | 0.72 — walls, posts and the crossbar alike | `main.js` |
| Crossbar band | one `BALL_R` above `goalH`: a crossing inside it reverses `vz` too, above it is a plain wall bounce | `main.js` |
| Controlled-player ring | `PH * 1.2` = 18 units, stroked, at head height | `render.js` |
| DPR cap | 2.5 | `state.js` |

## 6. Running and deploying

Local:

```bash
python3 -m http.server 8000
```

Then `http://localhost:8000`. For phone testing, open the same port on the Mac's LAN IP
from the phone's browser. Mouse input works on desktop but the mechanic under test is a
thumb gesture — desktop is only good for checking that nothing crashed.

There is no build, no install, no test suite. Editing `index.html` and reloading is the
entire loop.

Deploy: GitHub Pages serving `main` at the repo root (`origin` is
`https://github.com/janpliva/haaland.io.git`). Pushing to `main` publishes.
`.github/workflows/jekyll-gh-pages.yml` is committed (added in `09dc151`); there is no `CNAME`
and no `.nojekyll` — see open questions.

## 7. Open questions and rough edges

Open questions (need a human answer):

- **Custom domain.** The repo is named `haaland.io`, which suggests a custom domain, but no
  `CNAME` is committed, which would put the site at `janpliva.github.io/haaland.io/`. If a
  domain is configured in repo settings rather than in-repo, that is fine — but a `CNAME`
  file is the durable form.
- **AI distances never scaled with the pitch.** `FIELD_W` was doubled from 600 to 1200 by
  hand, but the marking standoff, separation and wobble constants are still absolute.
  Relative to the pitch they are now half what they were. Worth making proportional.
- **`lungeSpeed` is a cap below 100%.** At the shipped 50 the reception lunge can never
  exceed half normal running speed, which is a strange ceiling for something described as a
  dart. It may want to live above 100, or the cap may want to be relative to the required
  speed instead.
- **A crossbar — now built** (`goalH`, default 90), with the answer to "what happens when you
  hit it" being: it bounces back into play at the same 0.72 as every wall, because that is what
  every other boundary here already does and there is no goal kick to award. The remaining
  question is the **value**: at 90, a full-power lob scores only from inside 153 units or beyond
  468, so 56 % of full-power lobs from 150–400 units now clear the bar (they scored before). That
  may be right — the lob is supposed to cost something — or it may want a taller bar. It is one
  slider; it needs playing, not arguing.
- **Should the keeper know about the bar?** He does not: `goalBound()` still ignores `z`, so a
  lob that will sail over is treated as a shot on goal and he reacts to it. Left alone
  deliberately — it is an AI change, not a rendering one, and touching it would have muddied the
  "the tilt changes nothing in the simulation" check. Fixing it is a `z` test in `goalBound`.
- **Should the lift-holds-intent rule apply without the ball too?** Section 2 of the brief
  says "lifting the thumb no longer stops the player" and then explains it in terms of the
  carrier. It is implemented for the **carrier only** — off the ball a lift still stops him,
  as before. The narrow reading was chosen because the stated reason (the aerial toggle takes
  priority over the stop) only exists while carrying, and because holding intent off the ball
  would send a defender running with no way to stop except re-touching and centring. Widening
  it is a one-line change to the `mv` expression in `step()`.
- **Should the AI ever play the ball aerially?** It does not, and this build does not need it
  to. It would be cheap: `kickPlan` would take an `air` flag onto the plan, `driveCarrier`
  would copy it onto `ball.pending`, and the speed for a wanted distance has a closed form
  just like the ground one — inverting the range derivation gives `v = sqrt(R / k)` with
  `k = sin 2a/g − 2·airDrag·sin²a/g²`. About four lines plus one helper. What is *not* cheap
  is deciding when: on the measurements above, an aerial ball above minimum power is
  collected by the kicker's team 26 % of the time against 37–59 % on the ground, so an AI
  that lofts would simply give the ball away more often. A long clearance (where giving it
  away is the point) is the one case that looks clearly positive.

Known rough edges (behaviour, not necessarily bugs):

- **Any release inside the threshold ring, while carrying, toggles aerial mode** — including
  a release exactly *on* the ring, since a pass needs `d > threshold`. There is no other way
  to toggle and no other consequence of such a release, but a returning player using the old
  "lift to stop" habit will flip the mode: measured 27 toggles from 57 carrying releases in a
  scripted session that used that habit every third cycle.
- **The aerial aim arc bows sideways at `camTilt` 0, and the ball does not.** At zero the arc is
  a glyph (see "The ball has height"); with any tilt it bows in `z` and is honest. Either way a
  pass aimed straight up the pitch previews almost flat, because that is the direction in which
  height and travel share a screen axis.
- **A minimum-power aerial pass is a 69-unit chip.** Barely more than two contact radii, so at
  the bottom of the power band the aerial and ground passes are nearly the same thing.
- **An aerial pass cannot be intercepted in flight, only met on landing.** That is the design,
  but it means a lofted ball over a crowded midfield always reaches the ground somewhere, and
  whoever is nearest that spot gets it — often the opposition.

- **A charge held without the ball still fires on release.** Being outside the ring is the
  only condition, so if you receive the ball while already outside and then lift, that
  counts as a pass. Much less surprising than the old behaviour (which fired the instant you
  received it), but worth knowing.
- **Receiving cannot be done "quietly" while charged** — to keep a ball you receive with the
  thumb outside the ring, come back inside before lifting.
- **Resizing the window mid-play used to award a goal.** `FIELD_H` was derived from the
  viewport, so shrinking the window left the ball behind the new goal line and it scored
  instantly. Gone: the pitch is a constant now and a resize only changes the camera's scale.
- **A zero-size viewport used to kill the game permanently.** `resize()` computed
  `scale = cssW / FIELD_W` then `FIELD_H = cssH / scale`; with `cssW = 0` that is `0/0 = NaN`,
  every position became NaN and nothing was drawn again. Now guarded with `|| 1`, and the
  camera clamps its own divisor too. Worth knowing because canvas silently ignores non-finite
  coordinates — there is no error, the players simply vanish.
- **The thumb and the aim line do not agree on screen.** Deliberate: input is not
  inverse-projected, the line is. Worst case 4.12° at `camTilt` 30, and 0 for a drag straight up,
  down, left or right. It grows fast with tilt — 9.88° at 45, 15.72° at 55.
- **The AI never lofts, so the crossbar is entirely the human's problem.** Six seeded 5-minute
  matches were bit-identical with `goalH` at 90 and at 200 when the human kept the ball on the
  ground: with no aerial ball, `z` is 0 and the height is never consulted.
- **The crossbar is decided at frame granularity**, like the goal test always has been. A ball
  dropping at 560 units/s moves ~9 units per frame, so which side of a 10-unit band it is judged
  on is a near coin-flip. Both outcomes put the ball back in play, so it shows up as "sometimes
  it comes down off the bar, sometimes it just comes back".
- **A ground ball can be hidden by a player standing between it and the camera.** That is depth
  sorting doing its job; the shadow, which is drawn under everything, is what still gives it
  away. The one exception is the carrier, who never hides his own ball.
- **The side stands are invisible in portrait.** The camera fits the pitch and on a phone the
  width binds, so there is no horizontal band for them to sit in. They show in landscape.
- **At `camTilt` 0 the goal frame collapses onto the goal line** — posts and bar have zero
  projected height — so the goal reads exactly as the coloured line it was before. That is why
  the frame is drawn in each goal's own colour rather than white.
- **Contact stops the ball dead.** Taking possession zeroes the ball's velocity, so a
  reception kills the pass rather than running on with it. The one exception is a ball
  collected at a landing: that keeps pace as the longer first touch.
- **A pass leaves from wherever the ball is**, not from the player, and it fires at the next
  contact rather than on release — so the origin and the moment both move around a little.
  The aim line is drawn from the player regardless, and is off by up to 11.5 css px.
- **A one-tap fires for whichever team-mate gets there**, not only the claimed one. The claim
  picks who the line is drawn from; the armed direction and power are absolute on the pitch,
  so a different receiver plays the same ball the same way.
- **Input latency is one touch cycle.** A direction change only reaches the carrier at the
  next contact: measured median 217 ms at half stick and 333 ms at full, `2*touchPush*m/friction`
  by construction. Same for the queued pass. That is the mechanic, but it is the number to
  watch if the controls feel heavy.
- **A keeper who reaches his save point early stands still** until the shot arrives — median
  50 ms, p90 183 ms, worst seen 567 ms. Deliberate; a keeper setting himself is what a keeper
  does. Unlike the old receiver freeze, nothing is being taken from a player under control.
- **AI distances are absolute field units tuned for portrait**, so a short or landscape
  viewport squashes the runs.
- **`passThresh = 100` deletes the aiming band.** The arrow only shows for
  `joyR < d ≤ thresh`, which is empty at 100%, so the pass fires with no direction preview.
- **One touch only.** You cannot steer and use the settings panel at the same time; the
  first touch wins until it lifts.
- **`step()` returns early when a goal is scored**, so that frame leaves `drawAim` stale.
  Invisible at 60 fps.
- **The post-goal pause is skippable** by tapping the pitch (`skipPause()`). Full time is
  not: that returns to the menu and only the button starts another match.
- **A golden goal has no time limit.** If neither side scores, a timed match runs forever.
  Deliberate — the alternative is a draw, and the brief says the next goal decides it.
- **A 60 s match runs one frame long** at a fixed 60 fps (16.7 ms), because `60 − 3600·(1/60)`
  leaves +2.1e-12 and the clock ends on `<= 0`. 180 s and 300 s are exact. Not worth an epsilon:
  on a phone `dt` varies, so the last frame overshoots by an arbitrary fraction anyway.
- **The clock is wall time, not playing time.** Post-goal pauses do not consume it, so a timed
  match takes longer than its length in real seconds — 1.4 s per goal.
- **`targetGoals` is dead in a timed match.** The slider still moves and the HUD's middle slot
  still shows it in *Na góly*; in *Na čas* nothing reads it.
- **Changing `teamSize` or `foeSize` wipes the stored ratings** for both teams, back to all
  50. The stored shape no longer matches the squad, and partial merging is deliberately
  refused. Set the squad size first, then rate the players.
- **Ratings are per shirt number, not per person.** They are stored positionally, so if the
  squad is rebuilt at the same size the ratings land on whoever now holds that slot.
- **The menu reads `T` to show resolved values**, so a gear-panel change is reflected the next
  time a stat sheet is opened. It never writes `T`.
- **No out-of-play, throw-ins or corners.** Walls bounce everywhere except the goal mouth.
- **UI is Czech only.**
