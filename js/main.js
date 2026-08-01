// Simulační krok, smyčka a start.
import { T, FIELD_W, BALL_R, CONTACT, STEAL_LOCK } from './config.js';
import { S, E, ball, touch, joyBase, resize, buildTeams, reset, dist, clampField,
         histPush } from './state.js';
import { foesOf, stealR, inOwnBox, bufferInput, updateClaim, lungeStep, lungeActive,
         carryChase, startKick, holdBall, doPass, pickChasers, rollDist } from './util.js';
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

  // Paměť držitele se plní tady, ještě než se čímkoli hne — nejnovější vzorek pak odpovídá
  // tomu, co v tomhle snímku čte AI. Čte z ní jen presující obránce (perceivedBall).
  histPush();

  // Nárok se řeší jako první: pohybové bloky níž se ptají lungeActive(), jestli mají
  // hráče pustit ke slovu, takže potřebují čerstvý výsledek.
  updateClaim();

  // --- ovládaný hráč ---
  var joyR = T.joyR, thresh = joyR * (T.passThresh/100);
  var aimX = 0, aimY = 0, aiming = false, moveSF = 0, aimPw = 0;

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
  // vstup se nabufferuje; v cyklu doteku se běží po touchDir, ne po sticku — proto zvednutý
  // prst hráče uprostřed cyklu nezastaví a dotek (a s ním nachystaná přihrávka) vždycky přijde
  var mv = bufferInput(S.ctrl, sx, sy, stickSF);
  // s míčem ho vede doběh, a při zpracování cuknutí — ale to jen když po něm opravdu něco
  // chce. Když si míč jede rovnou na něj, řídí dál stickem a nic ho nemrazí.
  var driven = (ball.owner === S.ctrl) || lungeActive(S.ctrl);
  if(mv.sf > 0 && !driven){
    var sp = T.playerSpeed * mv.sf, x0 = S.ctrl.x, y0 = S.ctrl.y;
    S.ctrl.fx = mv.x; S.ctrl.fy = mv.y;
    S.ctrl.x += mv.x*sp*dt; S.ctrl.y += mv.y*sp*dt;
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

  if(!driven) S.ctrl.sf = moveSF;      // jinak sf nastavuje doběh / cuknutí

  // --- kdo útočí: tým s míčem, a když je míč v letu, ten, kdo ho odehrál ---
  var carrier = ball.owner;
  var attTeam = carrier ? carrier.team : S.lastTeam;

  playKeeper(E.gkB, dt); playKeeper(E.gkR, dt);
  if(carrier && carrier !== S.ctrl) driveCarrier(carrier, dt);

  if(attTeam === 'b'){ attack(E.blue, carrier, dt); defend(E.red, dt); }
  else               { attack(E.red, carrier, dt);  defend(E.blue, dt); }

  // --- cuknutí po narokovaném míči ---
  // Kdo má míč na dráze skrz svůj dosah zpracování a stihne ho, ten si ho narokuje a vrhne
  // se na místo, KDE MÍČ BUDE — ale jen pokud se kvůli tomu vůbec musí hnout (viz moveTo).
  lungeStep(dt);

  // --- doběh držitele: běží automaticky NA MÍČ, ne po uloženém vektoru ---
  carryChase(dt);

  // --- míč: VŽDYCKY obyčejná fyzika, nikdy přilepený na hráče ---
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

  // pojistka: mezera nikdy nemá přesáhnout dvojnásobek odvozeného vrcholu. Nic se nespravuje —
  // jen se to zaznamená i se stavem, který to způsobil, ať je vidět, že se to stalo.
  if(ball.owner && !ball.held){
    var gap = dist(ball.owner, ball);
    if(gap > 2*ball.peakGap){
      S.gapWarn = (S.gapWarn || 0) + 1;
      if(!S.gapWarnLog) S.gapWarnLog = [];
      if(S.gapWarnLog.length < 20){
        S.gapWarnLog.push({ t:+S.time.toFixed(2), gap:+gap.toFixed(1), peak:+ball.peakGap.toFixed(1),
                            chaseV:+ball.chaseV.toFixed(1), ballV:+Math.sqrt(ball.vx*ball.vx+ball.vy*ball.vy).toFixed(1),
                            team:ball.owner.team, ctrl:ball.owner === S.ctrl });
        console.warn('carry gap over 2x derived peak', S.gapWarnLog[S.gapWarnLog.length-1]);
      }
    }
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
        ball.owner = fo[s1]; ball.vx = ball.vy = 0; ball.held = true; S.lastTeam = fo[s1].team;
        ball.gained = S.time; ball.pending = null; pickChasers();
        break;
      }
    }
  }

  // --- převzetí: JEDINÉ místo, kde se volný míč zastaví, je dotyk tělem ---
  // Dosah zpracování už míč nebrzdí ani nestáčí — jen určuje, kdo si ho narokuje (updateClaim
  // výš). Míč si letí dál přesně tak, jak letěl, dokud ho někdo fyzicky nezastihne.
  if(!ball.owner){
    var taker = null, takeD = 1e9;
    for(var k=0;k<E.all.length;k++){
      var p = E.all[k];
      if(p === S.lockedPlayer && S.lockOut > 0) continue;
      var pd = dist(p, ball);
      if(pd <= CONTACT && pd < takeD){ takeD = pd; taker = p; }
    }
    if(taker){
      var tv = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
      if(taker.role === 'gk' && tv > T.gkParrySpeed) parry(taker);   // moc rychlé na chycení
      else { ball.owner = taker; ball.vx = ball.vy = 0; ball.held = true; S.lastTeam = taker.team;
             ball.claim = null; ball.gained = S.time; ball.pending = null; pickChasers(); }
    }
  }

  // --- kontakt: tělo držitele dostihlo míč. Konec cyklu je VÝSLEDEK VZDÁLENOSTI, ne odpočtu. ---
  // Teprve tady se projeví, co mezitím udělal stick: pokračovat, zastavit, změnit směr
  // nebo rychlost, nebo odehrát nachystanou přihrávku.
  if(ball.owner){
    var o = ball.owner;
    if(ball.pending && S.time > ball.pending.until) ball.pending = null;
    if(dist(o, ball) <= CONTACT){
      if(ball.pending){
        // odehrává se z místa míče a v uloženém směru, ne kam ukazuje prst teď
        var pp = ball.pending; ball.pending = null;
        doPass(pp.x, pp.y, pp.speed);
      } else {
        var m = o.bsf || 0;
        if(m > 0) startKick(o, o.bx, o.by, m);
        else holdBall(o);                    // prst dole → stojí a míč leží u nohy
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
