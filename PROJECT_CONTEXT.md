# PROJECT_CONTEXT

Written for a session with no memory of this project. Everything below was read out of
`index.html` unless marked otherwise.

## 1. What this is

A mobile-first top-down football prototype. Plain canvas 2D, ES modules loaded straight by
the browser — no build step, no npm, no framework. UI text is Czech (`<html lang="cs">`).

It is a **feel test for one mechanic**, not a game. The question it exists to answer:

> Does a fixed bottom joystick, where dragging past an outer ring charges a pass and lifting
> the thumb plays it in that direction, work as a one-thumb control for moving *and*
> passing?

Everything else — teams, AI, goals — exists only to make that gesture testable under
pressure.

The ball is physically simulated and rides further ahead the faster you run. Inside the
circle around you it obeys you; a sprint pushes it outside that circle, where it does not.

There are goals at both ends, a keeper each, and a scoreline; first to `targetGoals` wins.
A shot is just a pass — there is no separate shooting gesture, deliberately. Both teams play
football: whoever touches the ball gets it, and then attacks the other end.

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
`doPass()` sets `ctrl = carrier` (`index.html:260`), and `step()` reassigns
`ctrl = ball.owner` only when a blue player actually has the ball (`index.html:470`).
While the ball is in flight, you still drive the player who passed it.

Why: the pass is a single continuous thumb gesture. If control jumped to the receiver
mid-flight, the drag that fired the pass would carry over into the new body and move it in
the pass direction. Keeping control on the passer also means your run *after* passing is
still yours, which is the point of a passing game.

### Charge outside the ring, pass on release
Inner ring `joyR` (62 css px). Outer ring `joyR * passThresh/100` (122% → ~75.6 css px).
Movement speed ramps linearly with distance and saturates at `joyR`, so everything past the
inner ring is full sprint and the joystick keeps steering normally while outside the outer
ring too.

The pass is a two-stage gesture:

1. **Charge** — drag the thumb past the outer ring. Nothing fires. With the ball, a dashed
   yellow arrow shows where the pass would go, the outer ring goes solid, and the knob gets
   a white outline (`index.html:386` for the state, the ring and knob in `draw`).
2. **Release** — lift the thumb while still outside the ring and the ball goes in the
   direction the thumb was in **at the moment of release** (`index.html:216`). Not the
   direction you first crossed in: you can exit right, travel around the outside to the
   left, release, and the pass goes left.

**Weight comes from distance past the ring.** `passPower(d)` maps `(d − threshold) /
passRange` to 0…1, and `passSpeedFor()` maps that onto `passMin`…`passSpeed`. Releasing on
the ring plays the softest ball; `passRange` css px beyond it plays the hardest. Measured
at the defaults (threshold 85.4, range 120, min 40 %, max 660): on the ring 273, +30 px 336,
+60 px 459, +120 px 659, +200 px 664 — floor, slope and ceiling all behave.

**The aiming line is a fraction of the real distance.** It is drawn from the ball, and its
length is `rollDist(v) * aimLen/100`, where `rollDist(v) = v² / (2 · friction)` is how far the
ball would actually travel. At the default 33 % a full-power pass draws ~359 units against a
real roll of 1089. Deliberately **not** the full distance: the line should read as direction
and strength, not give away where the ball lands. The dash period is fixed, so the number of
dots is the strength readout — and it is the only feedback for power, because the knob stays
clamped to the ring. It draws a straight line, so it ignores wall bounces.

Coming back inside the outer ring without lifting cancels the charge; releasing inside does
nothing. The state is memoryless — "is the thumb currently outside the ring" is the whole
condition, so no flag tracks the crossing.

Why: the commit moment is the release, which the thumb can always take back, so the
direction stays adjustable right up to the last instant instead of being locked in by the
crossing. The knob is clamped to the outer ring, so the ring and knob styling are the only
signal that you are outside it — that feedback is load-bearing, not decoration.

Firing is deferred to `step()` through `touch.fire` rather than done in the event handler,
so all game mutation stays in the simulation and nothing fires while the game is paused.
`reset()` clears it so a charge cannot survive a turnover.

### Contact with the ball takes it — both directions
Checked every frame against the **ball**, not the carrier, and regardless of who owns it:
`dist(opponent, ball) < stealR(opponent)`, which is `PH + ballR` for outfielders and
`gkReach` for keepers (a keeper reaches further because it dives, and because a keeper that
cannot take the ball off a dribbler is not a keeper — see below). This applies even while
the ball sits at your foot: there is no shielding.

`STEAL_LOCK` (0.5 s) stops the ball ping-ponging: whoever just lost it cannot take it back
for half a second. `doPass` uses the same `lockedPlayer`/`lockOut` pair with 0.32 s.

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

Consequence worth knowing: with `pressDist` at 900 a human who keeps the ball in his own half
is never challenged at all. Measured 0:0 over 120 s of standing still. Walk the ball forward
and the block engages — the waiting defender is simply run into.

### Going to the ball: intercept, and commit to one man
`interceptSolve(p)` predicts where the ball will be. Ball motion is constant deceleration
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

`driveCarrier()` runs for any AI ball carrier. Before moving it does two things that keep
the ball attached:

- **If the ball is outside its control zone, it fetches the ball** instead of continuing to
  the goal. Without this the AI ran off toward an abstract target and simply left the ball.
- **It carries at `carrySpeed(p)`**, the fraction of top speed at which the ball still fits
  inside the zone: `(pickup − CONTACT − 2) / dribbleKick`, floored at 0.15. Since the lead is
  `CONTACT + dribbleKick * sf`, running flat out with a small zone pushes the ball straight
  out of it — which is exactly what made AI dribbling look chaotic.

Measured after the fix: the nearest opponent sat 43–51 units from the ball for 32 consecutive
samples while dribbling, against a predicted equilibrium of `24 + 25 = 49` and a zone of 55.

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

Note that `ballFollow` applies to **both** teams — there is one steering path. What differed
between the teams was the trap distance (`pickupMate` 30 vs `foePickup` 55), which is why the
uncapped correction looked like an AI-only problem.

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

### Goals, scoring, match
Both goals are centred on `FIELD_W/2`, mouth `goalW` wide. You attack the top (`y = 0`);
the bottom is yours. Inside the mouth the end wall does not bounce the ball — it crosses and
scores. Everywhere else it still bounces, so there are no throw-ins or corners, deliberately.

A goal pauses play for 1.4 s, flashes, and calls `reset(kickNext)` — the conceding team
kicks off. Own goals count for the other side; passing backwards into your own net is a real
hazard.

Reaching `targetGoals` sets `matchOver`, which stops the auto-restart in `frame()` and shows
the overlay; the intro text is stashed in `INTRO` at load and restored by `newMatch()`.

### The ball is physical; the circle is a control zone, not a possession flag
The ball is never glued to a player. It always carries velocity, friction and wall bounces
(`index.html:443`). Three rules replace the old glue:

- **The correction is capped** at `speedOf(owner) * 1.5`. Without a cap, `error × ballFollow`
  is unbounded: an AI trapping a pass can be `foePickup` (55) from the ball with its facing
  pointing elsewhere, giving an error near 79 units and a correction of ~1580 units/s. The
  ball shot past the player, left the control zone, the AI turned back for it, and the cycle
  repeated — which is what "the ball bounces around the AI" was. The cap only bites on large
  errors, so a normal carry is unchanged.
- **Control** (`index.html:474`) — while the ball is within `pickupMate` of its owner, the
  owner steers it. Each frame the ball's velocity is set to
  `facing * playerSpeed * sf + (target − ball) * ballFollow`, where `sf` is the joystick's
  speed fraction and `target = owner + facing * (CONTACT + dribbleKick * sf)`. This is a
  first-order pursuit: the ball rides at `24 + dribbleKick * sf` units ahead and swings
  around with you when you turn, so inside the zone the ball obeys much like the old glue,
  just with lag. Standing still puts the target at your foot.
- **No control outside the zone** — past `pickupMate` the steering term simply stops
  applying and the ball is free-rolling physics. At full stick the target (`24 +
  dribbleKick`) sits outside the zone, so a sprint pushes the ball out of your own control
  zone and a direction change leaves it behind. Slow movement keeps the target inside the
  zone and therefore keeps full control. `dribbleKick` sets where that crossover falls:
  control is lost above `sf = (pickupMate − 24) / dribbleKick`.
- **Possession** (`index.html:458`) — deliberately *not* tied to the zone. The owner keeps
  the ball even when it is far away; it changes hands only when another blue has it inside
  their own zone **and** is closer to it than the owner, or on a pass, or on a turnover.
  Ownership changes stop the ball dead (the trap).

Why control and possession are separate: an earlier version broke possession as soon as the
ball left the zone. Because a sprint puts the ball outside the zone by design, that made the
ball unpassable while sprinting (`doPass` requires `ball.owner === ctrl`) and made every
teammate abandon their lane to chase a ball you were still dribbling. Keeping possession
sticky means losing the ball is decided by someone else reaching it, which is what "the ball
got away from me" should mean.

Why pursuit rather than discrete kicks: the ball has to obey direction changes at walking
pace. A pure impulse model — kick forward, let it roll — cannot do that, because a rolling
ball keeps its old velocity through your turn. That version was tested and was
uncontrollable.

### Lane-based teammate runs
`assignRoles()` (`index.html:272`) sorts non-carrier teammates by current x and gives each
one a lane `(k + 0.5) / n` across the field width, alternating `band`: even index = forward
run (`prefD` 330), odd = support (`prefD` 200). Roles are recomputed every 2.2 s or when the
carrier changes. `mateTarget()` scores a 5×5 grid inside the lane and picks the best spot.

Why: without lanes every teammate solves the same "find open space" problem and converges on
the same pocket, which leaves you one passing option instead of several in different
directions. Lanes force spread; alternating bands guarantee at least one forward option and
one safe one. (This rationale is inferred from the code — the lane penalty
`-|px - laneC| * 0.20` and the `prefD` split are what enforce it.)

## 4. Architecture

`index.html` (41) is a DOM shell, `styles.css` (73) the CSS, and the JS lives in `js/`:
`config` (79), `state` (88), `util` (159), `ai-off` (121), `ai-def` (105), `ai-ball` (115),
`keeper` (75), `match` (46), `input` (62), `render` (141), `ui` (98), `main` (177).

Imports run one way only: config → state → util → ai/keeper → match → input → render/ui →
main. Because module bindings are read-only, every value that is reassigned from more than
one place lives as a property of a shared object: `S` (game state), `E` (entity arrays),
`ball`, `touch`, `joyBase`, `T`. Those objects are never reassigned, only mutated.

Two places bend the file layout to keep imports acyclic. `dist`/`clampField` sit in
`state.js` rather than `util.js` because `reset()` needs them; and `state.js` exposes a
`hooks` object that `util.js` fills with `pickChasers`, because `reset()` has to call it
while `util` is the layer above. `kickPlan` moved to `util.js` so `keeper.js` and
`ai-ball.js` can both use it without importing each other.

```
resize()          canvas sizing + field scale        index.html:147
mk/buildTeams     entity construction                index.html:159
reset()           kickoff positions                  index.html:178
input handlers    touch + mouse → touch{}            index.html:202-234
doPass/turnover   state transitions                  index.html:251,263
assignRoles       teammate lanes                     index.html:272
mateTarget        teammate spot scoring              index.html:286
frame()           rAF loop                           index.html:332
step(dt)          all simulation                     index.html:346
draw()            all rendering                      index.html:486
storage           persistence + sliders              index.html:573-651
```

### Coordinate system
The field is **always 1200 logical units wide**. `scale = cssW / 1200`, and `FIELD_H` is
derived from the viewport: `FIELD_H = cssH / scale` (`index.html:152`). The literal
`FIELD_H = 1000` at line 128 is overwritten by the first `resize()`. On a 390×844 phone the
pitch is ~600×1298 units. `X(v) = v * scale` converts field units to css px for drawing;
the joystick is drawn in css px directly. Device pixel ratio is capped at 2.5.

### Entities
`mk(team)` → `{ x, y, fx, fy, team, tx, ty, think, seed }`. `fx,fy` is facing (init `0,-1`),
`tx,ty` the AI target, `think` a retarget countdown, `seed` a per-player random for noise.
`assignRoles` adds `lane`, `laneN`, `band`, `prefD` to blue players at runtime.

Players are 30×30 squares (`PH = 15` half-side). Ball is `{ x, y, vx, vy, owner }`,
`BALL_R = 9`. Arrays: `blue`, `red`, `all = blue.concat(red)`.

Module-level state: `ctrl` (controlled player), `lockOut`, `lastPasser`, `possTime`,
`bestTime`, `running`, `deadTime`, `time`, `roleTimer`, `lastCarrier`, `drawAim`.

### Loop
`requestAnimationFrame(frame)`. `dt` is capped at 0.033 s, so a stall slows the sim rather
than teleporting anything. Every frame: recompute joystick base → tick the respawn timer →
`step(dt)` if running → `draw()`. `draw()` runs even when not running, so the field stays
visible during the turnover pause.

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

The first tap does not steer: while `!running`, `onDown` hides the start overlay, sets
`running = true`, calls `reset()` and returns without taking the stick (`index.html:209`).
The same path means a tap during the 1.1 s post-turnover pause skips the rest of it. That
tap's `touchend` is ignored because `touch.id` is still null, so it cannot fire a pass.

### Simulation order inside `step(dt)`
1. Controlled player: direction and analog speed from the stick; aim flag. Then any pending
   `touch.fire` from a release is consumed and the pass is played.
2. Teammates: reassign roles if stale; retarget every 0.3–0.6 s; **if the ball has no owner,
   every teammate targets the ball directly** and retargets each frame (`index.html:388`).
   Then `moveTo` at `mateSpeed`. The player currently under `ctrl` is skipped.
3. Opponents: nearest red to the ball (or to its carrier) chases at `foeSpeed`. The rest
   greedily claim the nearest unclaimed blue that is not the carrier and stand 40 units
   goal-side of them toward the ball, plus a slow sine wobble (~±55 units), moving at
   `foeSpeed * 0.84` and only when more than 24 units off that spot. Surplus reds with
   nobody to mark fall back to chasing the ball at `foeSpeed * 0.85`. Finally, any two reds
   closer than 42 units are pushed apart.
4. Ball, always the same path: linear friction, integrate, bounce off walls at 0.72
   restitution. Then possession (the owner keeps it unless a nearer blue has it inside their
   zone; the passer is excluded for `lockOut` = 0.32 s; any change of hands stops the ball).
   Then the steering term, applied only while the ball is inside the owner's zone.
5. Turnover check, then control switch, then HUD text.

Note: `possTime` increments in both the owned and loose branches, so the clock keeps running
while a pass is in the air. The score is time-until-turnover, not strictly time in
possession.

### Rendering
Immediate mode, redrawn every frame, painter's order: pitch fill → stripes → boundary /
halfway / centre circle → for each player (pickup-radius ring, white halo if controlled,
body square, facing tick) → aim arrow → ball → joystick (inner ring, dashed threshold ring,
knob clamped to the threshold radius, yellow once past the inner ring).

### Persistence
Key `fbproto_tuning_v1`. `writeStore` prefers an optional host-provided async API
`window.storage.set(key, value) → Promise` and falls back to `localStorage.setItem`;
`loadStore` mirrors it with `window.storage.get(key) → { value }`. `window.storage` is not
defined anywhere in this repo — on GitHub Pages it is undefined and the localStorage path is
what actually runs. Both paths are wrapped in try/catch, so private browsing degrades to
"settings don't persist" rather than throwing.

Saves are debounced 500 ms and flash "Nastavení uloženo". `applyLoaded` only copies keys
that exist in `DEFAULTS` and are numbers, so a corrupt or stale payload cannot inject
fields. `DEFAULTS` is a deep copy of `T` taken at load time — it is the in-code defaults,
not the stored ones, so "Vrátit výchozí hodnoty" always restores the hand-tuned values.

## 5. Tunables

All exposed in the gear panel and persisted. Defaults are as written in `T`
(`index.html:133`) and are hand-tuned by playing — do not change them without being asked.

| Key | Default | Range (step) | Unit | Effect |
|---|---|---|---|---|
| `teamSize` | 4 | 1–6 (1) | count | Blue players. Rebuilds teams and resets. |
| `foeSize` | 4 | 1–6 (1) | count | Red players. Rebuilds teams and resets. |
| `playerSpeed` | 200 | 120–320 (5) | units/s | Top speed of the controlled player, reached at the inner ring. |
| `mateSpeed` | 200 | 100–320 (5) | units/s | Blue AI speed. |
| `foeSpeed` | 200 | 100–320 (5) | units/s | Red chaser speed. Markers use 0.84×, surplus reds 0.85×. |
| `pickupMate` | 30 | 16–90 (1) | units | Blue reception radius, player centre → ball centre. Also the **control zone**: inside it the owner steers the ball, outside it the ball is free. |
| `tackleR` | 10 | 9–60 (1) | units | Extra steal reach beyond the body. An opponent within `PH + tackleR` of the ball takes it off you. **Not** the ball's physical radius — that is the `BALL_R` constant. Renamed from `ballR`, so a device with older saved settings falls back to this default. |
| `passSpeed` | 660 | 300–1100 (20) | units/s | **Maximum** pass speed — reached when the thumb is released `passRange` past the ring. AI passes still always use this value. |
| `friction` | 200 | 80–700 (10) | units/s² | Linear deceleration of the ball, now always applied. |
| `joyR` | 70 | 40–100 (2) | css px | Inner ring radius. Also the distance at which you hit full speed. |
| `passThresh` | 122 | 100–180 (2) | % of `joyR` | Outer ring radius — the charge boundary. Defaults to ~85.4 css px. |
| `dribbleKick` | 0 | 0–80 (1) | units | How much further than foot contact (24) the ball rides at full sprint; scales linearly with stick deflection. Also sets where control is lost: above `sf = (pickupMate − 24) / dribbleKick`. 0 = ball always at the foot, never loses control. |
| `ballFollow` | 20 | 2–30 (1) | 1/s | How hard the ball is pulled to its target inside the zone. High = tight, almost glued. Low = loose and laggy, ball wanders more. |
| `goalW` | 240 | 100–500 (10) | units | Goal mouth width, centred on `FIELD_W/2` at both ends. 20% of the pitch width at the default. |
| `targetGoals` | 5 | 1–15 (1) | count | First to this many goals wins. Checked when a goal is scored, so lowering it mid-match takes effect on the next goal. |
| `foePickup` | 55 | 16–90 (1) | units | Red reception/control zone — their equivalent of `pickupMate`. **Also caps how fast the AI can dribble**: below about 51 the AI must slow down to keep the ball, and at 30 it crawls. |
| `foeError` | 0 | 0–35 (°) | degrees | Random rotation applied to every AI pass and shot. The AI's only source of mistakes. |
| `shootRange` | 700 | 200–1600 (20) | units | How close to goal an AI carrier must be before it will shoot. |
| `gkDepth` | 55 | 0–160 (5) | units | How far off his line the keeper stands. Positioning only — he catches with his body. Renamed from `gkReach`, so old saved settings fall back to the default. |
| `soloLane` | 50 | 20–160 (5) | units | How clear the straight line to goal must be before a central carrier goes alone and stops looking for a pass. |
| `passRange` | 120 | 40–260 (5) | css px | How far past the threshold ring the thumb must travel for a full-power pass. |
| `passMin` | 40 | 10–90 (5) | % of `passSpeed` | Weakest possible pass, played when the thumb is released right on the ring. |
| `aimLen` | 33 | 5–100 (1) | % of roll distance | Length of the dotted aiming line as a fraction of how far the ball would really go. 100 would make it an exact landing predictor. |
| `markDist` | 45 | 20–120 (1) | units | How far goal-side of his man a marker stands. |
| `markShift` | 25 | 0–60 (1) | % | Share of the x gap between the marked man and the ball that the marker shifts across. |
| `lineGap` | 60 | 0–200 (5) | units | How far behind the deepest attacker the defensive line sits. |
| `pressDist` | 900 | 200–2000 (20) | units | Ball must be within this of the defending goal before anyone presses it. |
| `wobbleNear` | 600 | 100–1500 (20) | units | Distance from the ball at which a marker's drift fades to zero. |
| `runDepth` | 120 | 0–400 (5) | units | How far beyond the last opposing defender a band-0 run may target. |
| `passLead` | 90 | 0–300 (5) | units | How far ahead of a moving teammate an AI pass is aimed, scaled by his speed. |
| `interceptEff` | 90 | 50–100 (1) | % | Share of top speed a player assumes he can sustain when solving for an intercept. Below 100 because nobody turns instantly. |
| `aiArrive` | 220 | 50–500 (10) | units/s | Speed an AI pass should still have on arrival. Drives the distance-scaled pass power. |
| `planHold` | 500 | 100–1500 (50) | ms | How long an AI carrier keeps a non-kick plan before reconsidering. |
| `planBreak` | 90 | 40–250 (5) | units | Opponent proximity that breaks the plan early. |
| `gkReaction` | 180 | 0–500 (10) | ms | Delay before the keeper reacts to a detected shot. |
| `gkError` | 45 | 0–200 (5) | units | One-off random error on the sampled save point. |
| `gkDiveSpeed` | 160 | 100–300 (5) | % | Speed multiplier while moving to the save point. |
| `gkParrySpeed` | 520 | 200–1000 (20) | units/s | Above this the keeper parries instead of catching. |
| `gkParryKeep` | 45 | 10–90 (5) | % | Share of speed a parried ball keeps. |
| `gkHoldMax` | 1200 | 300–3000 (100) | ms | How long the keeper is unstealable inside his own box. |
| `gkVentureSafe` | 260 | 80–600 (10) | units | No opponent this close means he may dribble out. |
| `gkVenture` | 150 | 0–500 (10) | units | How far beyond the box he may carry the ball. |

Sliders `sB`/`sR` rebuild the teams; the other ten are wired by array index to `s0`–`s9`
(`index.html:656`), so **adding a tunable to that array shifts every id after it** — append
at the end. The panel's visual order is independent, since `register()` looks elements up by
id, so a new row can sit anywhere in the HTML.

### Non-tunable constants (in code, no UI)

| Constant | Value | Where |
|---|---|---|
| Field width | 1200 units (height derived from viewport) | `index.html:130` |
| `GOAL_DEPTH` | 60 units — drawn goal area only, no effect on play | `index.html:134` |
| `STEAL_LOCK` | 0.5 s before the player who lost the ball can retake it | `index.html:152` |
| Player half-size `PH` | 15 (30×30 square) | `index.html:129` |
| Ball radius | 9 | `index.html:130` |
| Contact distance `CONTACT` | `PH + BALL_R` = 24 units — kick trigger and kickoff placement | `index.html:132` |
| Pass lockout | 0.32 s before the passer can re-collect | `index.html:258` |
| Role reassignment | every 2.2 s or on carrier change | `index.html:377` |
| Teammate retarget | every 0.3–0.6 s | `index.html:385` |
| Turnover pause | 1.1 s, flash message 850 ms | `index.html:265` |
| `dt` cap | 0.033 s | `index.html:333` |
| Wall restitution | 0.72 | `index.html:450` |
| Red separation distance | 42 units | `index.html:429` |
| Marker standoff / wobble / deadzone | 40 / ~±55 / 24 units | `index.html:415-422` |
| Aim arrow length | 130 units | `index.html:532` |
| DPR cap | 2.5 | `index.html:149` |
| Save debounce | 500 ms | `index.html:594` |

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
`https://github.com/janpliva/haaland.io.git`). Pushing to `main` publishes. There is no
workflow file, no `CNAME`, and no `.nojekyll` in the repo — see open questions.

## 7. Open questions and rough edges

Open questions (need a human answer):

- **Custom domain.** The repo is named `haaland.io`, which suggests a custom domain, but no
  `CNAME` is committed, which would put the site at `janpliva.github.io/haaland.io/`. If a
  domain is configured in repo settings rather than in-repo, that is fine — but a `CNAME`
  file is the durable form.
- **`window.storage`.** Prefers a host-provided async storage API that does not exist in
  this repo. Presumably from the environment this was first prototyped in. It is dead code
  on GitHub Pages; the fallback is what runs. Keep both paths.
- **AI distances never scaled with the pitch.** `FIELD_W` was doubled from 600 to 1200 by
  hand, but the forward-run band (`carrier.y − 430`), marking standoff (40), separation (42),
  wobble (36) and the aim arrow (130) are still absolute. Relative to the pitch they are now
  half what they were, so teammate runs are much shorter than they look on paper. Worth
  making proportional during the symmetry refactor.

Known rough edges (behaviour, not necessarily bugs):

- **A charge held without the ball still fires on release.** Being outside the ring is the
  only condition, so if you receive the ball while already outside and then lift, that
  counts as a pass. Much less surprising than the old behaviour (which fired the instant you
  received it), but worth knowing.
- **Receiving cannot be done "quietly" while charged** — to keep a ball you receive with the
  thumb outside the ring, come back inside before lifting.
- **Resizing the window mid-play can award a goal.** `FIELD_H` is derived from the viewport,
  so shrinking the window leaves the ball behind the new goal line and it scores instantly.
  Hit on desktop while testing; on a phone this would be a rotation.
- **A zero-size viewport used to kill the game permanently.** `resize()` computed
  `scale = cssW / FIELD_W` then `FIELD_H = cssH / scale`; with `cssW = 0` that is `0/0 = NaN`,
  every position became NaN and nothing was drawn again. Now guarded with `|| 1`. Worth
  knowing because canvas silently ignores non-finite coordinates — there is no error, the
  players simply vanish.
- **Stored settings override new defaults.** `applyLoaded` copies any saved key that still
  exists in `DEFAULTS`, so changing a default in code has no effect on a device that has
  already saved settings — the old value wins silently. After changing a default, the only
  way to see it on that device is the "Vrátit výchozí hodnoty" button.
- **Trapping stops the ball dead.** A change of owner zeroes the ball's velocity, so a
  teammate collecting a ball that got away from you stops it rather than running on with it.
  Recovering your own escaped ball does *not* trap it, because ownership never changed.
- **A teammate can take a ball you are still dribbling** if it is outside your zone and they
  are closer to it than you. During a sprint the ball is outside your zone by design, so a
  teammate cutting close across your run can inherit it — control then switches to them.
- **A pass leaves from wherever the ball is**, not from the player — `doPass` no longer
  teleports it. The ball can be up to `pickupMate` away when you release, so the pass
  origin moves around a little.
- **AI distances are absolute field units tuned for portrait.** The forward band reaches 430
  units in front of the carrier; on a short/landscape viewport `FIELD_H` shrinks below that
  and the band collapses into the clamp fallback at `index.html:294`.
- **`passThresh = 100` deletes the aiming band.** The arrow only shows for
  `joyR < d ≤ thresh`, which is empty at 100%, so the pass fires with no direction preview.
- **One touch only.** You cannot steer and use the settings panel at the same time; the
  first touch wins until it lifts.
- **`step()` returns early on a turnover**, so that frame skips the HUD update and leaves
  `drawAim` stale. Invisible at 60 fps.
- **The turnover pause is skippable** by tapping — the same code path that starts the game
  from the overlay.
- **No goals, shots, tackles, out-of-play or restarts.** Walls bounce. A turnover fully
  resets positions after 1.1 s.
- **UI is Czech only.**
