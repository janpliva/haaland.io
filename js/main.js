// Simulační krok, smyčka a start.
import { T, FIELD_W, BALL_R, CONTACT, STEAL_LOCK } from './config.js';
import { S, E, ball, touch, joyBase, resize, buildTeams, reset, dist, clampField } from './state.js';
import { foesOf, pickupOf, stealR, speedOf, inOwnBox, steerFacing,
         lockedInput, lockFrom, releaseLock, doPass, pickChasers, rollDist } from './util.js';
import { updateJoyBase, passPower, passSpeedFor } from './input.js';
import { attack } from './ai-off.js';
import { defend } from './ai-def.js';
import { driveCarrier } from './ai-ball.js';
import { playKeeper, parry } from './keeper.js';
import { goal, showScore } from './match.js';
import { draw } from './render.js';
import { buildPanel, clearStore } from './ui.js';

function step(dt){
  S.time += dt;
  if(S.lockOut > 0) S.lockOut -= dt;

  // --- ovládaný hráč ---
  var joyR = T.joyR, thresh = joyR * (T.passThresh/100);
  var aimX = 0, aimY = 0, aiming = false, moveSF = 0, aimPw = 0;

  // pojistka: když se dotek do touchLockMax nekoná (odraz, mantinel, nedostižný míč),
  // zámek povolí a hráč zase řídí normálně, dokud se míče nedotkne
  if(ball.owner && ball.owner.lockOn && (S.time - ball.lastTouch) > T.touchLockMax/1000)
    releaseLock(ball.owner);

  var sx = S.ctrl.fx, sy = S.ctrl.fy, stickSF = 0, stickD = 0;
  if(touch.active){
    var dx = touch.x - joyBase.x, dy = touch.y - joyBase.y;
    stickD = Math.sqrt(dx*dx+dy*dy);
    if(stickD > 0.001){
      sx = dx/stickD; sy = dy/stickD; stickSF = Math.min(stickD/joyR, 1);
      // mimo práh je přihrávka nabitá a míří tam, kde je prst teď
      if(stickD > thresh && ball.owner === S.ctrl){ aiming = true; aimX = sx; aimY = sy; aimPw = passPower(stickD); }
    }
  }
  // vstup se nabufferuje; s míčem se mezi doteky běží po zamčeném vektoru, ne po sticku —
  // proto zvednutý prst hráče nezastaví a doběh za vlastním předkopem se dokončí
  var mv = lockedInput(S.ctrl, sx, sy, stickSF, touch.active);
  if(mv.sf > 0){
    var sp = T.playerSpeed * mv.sf, x0 = S.ctrl.x, y0 = S.ctrl.y;
    // natočení se stáčí k cíli — bez míče okamžitě, s míčem omezenou rychlostí.
    // Běží se po natočení, ne po sticku, takže zatáčka s míčem je oblouk.
    steerFacing(S.ctrl, mv.x, mv.y, dt);
    S.ctrl.x += S.ctrl.fx*sp*dt; S.ctrl.y += S.ctrl.fy*sp*dt;
    clampField(S.ctrl);
    // sf = podíl ze SKUTEČNĚ ušlé vzdálenosti. U mantinelu clampField krok uřízne, ale zadaná
    // rychlost zůstala — hráč stál a hlásil sf=1, čímž se nafukoval předkop i míření AI.
    var mvx = S.ctrl.x - x0, mvy = S.ctrl.y - y0, full = T.playerSpeed*dt;
    moveSF = full > 0 ? Math.min(1, Math.sqrt(mvx*mvx + mvy*mvy)/full) : 0;
  }

  // prst zvednutý mimo práh → přihrávka se NACHYSTÁ a odehraje se až při nejbližším doteku.
  // Míč je teď často kus před nohou, takže odehrát ho z místa, kde zrovna leží, nejde.
  // Puštění znovu před odehráním tu předchozí přepíše.
  if(touch.fire){
    if(ball.owner === S.ctrl)
      ball.pending = { x:touch.fire.x, y:touch.fire.y, speed:passSpeedFor(touch.fire.pw),
                       until: S.time + T.passQueueMax/1000 };
    touch.fire = null;
  }

  S.ctrl.sf = moveSF;

  // --- kdo útočí: tým s míčem, a když je míč v letu, ten, kdo ho odehrál ---
  var carrier = ball.owner;
  var attTeam = carrier ? carrier.team : S.lastTeam;

  playKeeper(E.gkB, dt); playKeeper(E.gkR, dt);
  if(carrier && carrier !== S.ctrl) driveCarrier(carrier, dt);

  if(attTeam === 'b'){ attack(E.blue, carrier, dt); defend(E.red, dt); }
  else               { attack(E.red, carrier, dt);  defend(E.blue, dt); }

  // --- míč: vždycky fyzikální, nikdy přilepený ---
  var sp2 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  if(sp2 > 0){
    var ns = Math.max(0, sp2 - T.friction*dt);
    ball.vx = ball.vx/sp2*ns; ball.vy = ball.vy/sp2*ns;
  }
  ball.x += ball.vx*dt; ball.y += ball.vy*dt;
  if(ball.x < BALL_R){ ball.x = BALL_R; ball.vx = -ball.vx*0.72; }
  if(ball.x > FIELD_W-BALL_R){ ball.x = FIELD_W-BALL_R; ball.vx = -ball.vx*0.72; }
  // v brance se míč neodrazí — projde a je gól
  var inMouth = Math.abs(ball.x - FIELD_W/2) < T.goalW/2;
  if(ball.y < BALL_R){
    if(inMouth){ goal('b'); return; }
    ball.y = BALL_R; ball.vy = -ball.vy*0.72;
  }
  if(ball.y > S.FIELD_H-BALL_R){
    if(inMouth){ goal('r'); return; }   // vlastní gól se počítá
    ball.y = S.FIELD_H-BALL_R; ball.vy = -ball.vy*0.72;
  }
  // odraz otočil volný míč o víc než 90° → závazek přestal dávat smysl, přepočítat
  if(!ball.owner){
    var vb = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
    if(vb > 0.001 && (ball.vx/vb*ball.chaseDir.x + ball.vy/vb*ball.chaseDir.y) < 0) pickChasers();
  }

  // --- odebrání: soupeř, který se dotkne míče, ho získá (platí i u nohy) ---
  // brankář s míčem ve vlastním vápně je po gkHoldMax nedotknutelný, pak už ne
  var gkSafe = ball.owner && ball.owner.role === 'gk' && inOwnBox(ball.owner)
               && (S.time - ball.gained) < T.gkHoldMax/1000;
  if(ball.owner && !gkSafe){
    var fo = foesOf(ball.owner);
    for(var s1=0;s1<fo.length;s1++){
      if(fo[s1] === S.lockedPlayer && S.lockOut > 0) continue;
      if(dist(fo[s1], ball) < stealR(fo[s1])){
        S.lockedPlayer = ball.owner; S.lockOut = STEAL_LOCK;
        releaseLock(ball.owner); releaseLock(fo[s1]);   // změna držení zámek okamžitě pouští
        ball.owner = fo[s1]; ball.vx = ball.vy = 0; S.lastTeam = fo[s1].team;
        ball.gained = S.time; ball.lastTouch = S.time; ball.pending = null; pickChasers();
        break;
      }
    }
  }

  // --- zpracování: volný míč bere kdokoliv ---
  // Držitel o míč VZDÁLENOSTÍ nepřijde: po předkopnutí si za ním běží a pořád je jeho.
  // Sebrat mu ho může jen soupeř dotykem (výše). Bez toho by mu spoluhráč sebral každý
  // předkop, protože míč je při doteku běžně dál než pickupOf.
  if(!ball.owner){
    var taker = null, takeD = 1e9;
    for(var k=0;k<E.all.length;k++){
      var p = E.all[k];
      if(p === S.lockedPlayer && S.lockOut > 0) continue;
      var pd = dist(p, ball);
      if(pd < pickupOf(p) && pd < takeD){ takeD = pd; taker = p; }
    }
    // zpracování míč zastaví
    if(taker){
      var tv = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
      if(taker.role === 'gk' && tv > T.gkParrySpeed) parry(taker);   // moc rychlé na chycení
      else { ball.owner = taker; ball.vx = ball.vy = 0; S.lastTeam = taker.team; releaseLock(taker);
             ball.gained = S.time; ball.lastTouch = S.time; ball.pending = null; pickChasers(); }
    }
  }

  // --- doteky: hráč si míč předkopne a běží za ním, mezi doteky se míč kutálí sám ---
  // Žádná pružina k noze: mezi doteky je míč obyčejná fyzika. Rytmus vzniká sám —
  // kopnutý míč zpomaluje třením zpátky na rychlost hráče, ten ho dojede a kopne znovu.
  if(ball.owner){
    var o = ball.owner, sf = o.sf || 0;
    if(ball.pending && S.time > ball.pending.until) ball.pending = null;   // nachystaná přihrávka vypršela
    // touchMin brání tomu, aby hráč rychlejší než vlastní míč kopal každý snímek
    if(dist(o, ball) <= CONTACT + T.touchWindow && (S.time - ball.lastTouch) >= T.touchMin/1000){
      ball.lastTouch = S.time;
      // dotek je jediný okamžik, kdy se vstup projeví na pohybu: nový zámek z bufferu
      lockFrom(o);
      if(ball.pending){
        // dotek = okamžik odehrání. Míří se tam, kam mířil prst při puštění, ne kam ukazuje teď.
        var pp = ball.pending; ball.pending = null;
        doPass(pp.x, pp.y, pp.speed);
      } else {
        var v = speedOf(o)*sf + T.touchPush*sf;
        ball.vx = o.fx*v; ball.vy = o.fy*v;
      }
    }
  }

  // --- kdo je ovládaný ---
  if(ball.owner && ball.owner.team === 'b' && ball.owner.role !== 'gk'){
    S.ctrl = ball.owner;                       // s míčem: přepnutí v momentě převzetí
  } else if(ball.owner && ball.owner.team === 'r'){
    // při bránění ovládáš nejbližšího k míči; hystereze 25, ať to nepřeskakuje
    var bd = (S.ctrl && S.ctrl.team === 'b' && S.ctrl.role !== 'gk') ? dist(S.ctrl, ball) : 1e9;
    for(var c1=0;c1<E.blue.length;c1++){
      var cb = E.blue[c1];
      if(cb.role === 'gk') continue;
      var cd2 = dist(cb, ball);
      if(cd2 < bd - 25){ bd = cd2; S.ctrl = cb; }
    }
  }

  // uložit aiming pro vykreslení
  // linka je jen podíl ze skutečného doletu — má ukázat směr a sílu, ne prozradit dopad
  S.drawAim = aiming ? { x:aimX, y:aimY, len:rollDist(passSpeedFor(aimPw)) * (T.aimLen/100) } : null;
}

// ---- hlavní smyčka ----
let last = performance.now();
function frame(now){
  var dt = Math.min((now-last)/1000, 0.033); last = now;
  updateJoyBase();

  if(!S.running && !S.matchOver && S.deadTime > 0){
    S.deadTime -= dt;
    if(S.deadTime <= 0){ reset(S.kickNext); S.running = true; }
  }

  if(S.running) step(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---- start ----
window.addEventListener('resize', resize);
resize();
buildTeams();
buildPanel();
clearStore();      // T se bere z config.js; případný starý uložený blob jen zahodíme

reset(); showScore();
requestAnimationFrame(frame);
