# CLAUDE.md

Working rules for this repo. Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) first — it maps
the code and lists every tunable with its default.

Solo hobby prototype. One file, `index.html`. No production, no users, no CI.

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
js/config.js  constants, TUNABLES, T, DEFAULTS
js/state.js   S, ball, E, touch, joyBase, resize, mk, buildTeams, reset
js/util.js    geometry, who-is-who, intercept, doPass
js/ai-off.js  assignRoles, mateTarget, attack     js/ai-def.js  defend
js/ai-ball.js decide, driveCarrier                js/keeper.js  playKeeper, parry, keeperPlan
js/match.js   score, goal, overlay               js/input.js   joystick
js/render.js  draw                               js/ui.js      panel + storage
js/main.js    step, frame, boot
```

- **Imports must stay one-way**: config → state → util → ai/keeper → match → input →
  render/ui → main. No cycles. If a cycle appears, move the shared piece down a layer.
- ES module imports are read-only bindings. Anything reassigned from more than one place
  lives as a **property** of `S`, `E`, `ball` or `T` — never reassign those objects
  themselves.

## Tuning defaults are off-limits

- The values in `TUNABLES` (`js/config.js`) are hand-tuned by playing on a phone. **Never change
  a default without being asked**, including "while I was in there" adjustments.
- Slider min/max/step are also tuning. Same rule.
- `DEFAULTS` is a deep copy of `T` at load, and the "Vrátit výchozí hodnoty" button restores
  it. That relationship must keep working.

## Do not remove the storage layer

- `writeStore`/`loadStore` in `js/ui.js` try `window.storage` first and fall back to
  `localStorage`. Keep both paths and the try/catch around them, even though
  `window.storage` is undefined on GitHub Pages.
- Keep `applyLoaded`'s filter (only numeric keys present in `DEFAULTS`) — it is what stops a
  stale saved payload from injecting fields.

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
- Changing a default in `T` does **not** reach a device that has already saved settings —
  `applyLoaded` prefers the stored value. Whenever you change a default, say in your report
  that the human has to press "Vrátit výchozí hodnoty" on the phone to see it.

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
