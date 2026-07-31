// Simulační krok, smyčka a start.
import { T, FIELD_W, BALL_R, CONTACT, STEAL_LOCK } from './config.js';
import { S, E, ball, touch, joyBase, resize, buildTeams, reset, dist, clampField } from './state.js';
import { foesOf, matesOf, pickupOf, stealR, speedOf, inOwnBox,
         doPass, pickChasers, rollDist } from './util.js';
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

  if(touch.active){
    var dx = touch.x - joyBase.x, dy = touch.y - joyBase.y;
    var d = Math.sqrt(dx*dx+dy*dy);
    if(d > 0.001){
      var nx = dx/d, ny = dy/d;
      moveSF = Math.min(d/joyR, 1);
      var sp = T.playerSpeed * moveSF;
      var x0 = S.ctrl.x, y0 = S.ctrl.y;
      S.ctrl.x += nx*sp*dt; S.ctrl.y += ny*sp*dt;
      S.ctrl.fx = nx; S.ctrl.fy = ny;
      clampField(S.ctrl);
      // sf = podíl ze SKUTEČNĚ ušlé vzdálenosti, stejně jako v moveTo. U mantinelu clampField
      // krok uřízne, ale zadaná rychlost zůstala — hráč stál a hlásil sf=1. Tím se nafukoval
      // předkop (dribbleKick*sf), člen f*speed*sf ve vedení míče i míření přihrávek AI
      // (passLead*sf), takže stojící spoluhráč u lajny dostával přihrávku o 90 jednotek vedle.
      var mvx = S.ctrl.x - x0, mvy = S.ctrl.y - y0, full = T.playerSpeed*dt;
      moveSF = full > 0 ? Math.min(1, Math.sqrt(mvx*mvx + mvy*mvy)/full) : 0;

      // mimo práh je přihrávka nabitá a míří tam, kde je prst teď
      if(d > thresh && ball.owner === S.ctrl){ aiming = true; aimX = nx; aimY = ny; aimPw = passPower(d); }
    }
  }

  // prst zvednutý mimo práh → přihrávka
  if(touch.fire){
    if(ball.owner === S.ctrl) doPass(touch.fire.x, touch.fire.y, passSpeedFor(touch.fire.pw));
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
        ball.owner = fo[s1]; ball.vx = ball.vy = 0; S.lastTeam = fo[s1].team;
        ball.gained = S.time; pickChasers();
        break;
      }
    }
  }

  // --- zpracování: volný míč bere kdokoliv, míč mimo pole držitele jen spoluhráč ---
  var ownD = ball.owner ? dist(ball.owner, ball) : 1e9;
  if(!ball.owner || ownD > pickupOf(ball.owner)){
    var cand = ball.owner ? matesOf(ball.owner) : E.all;
    var taker = null, takeD = ownD;
    for(var k=0;k<cand.length;k++){
      var p = cand[k];
      if(p === ball.owner) continue;
      if(p === S.lockedPlayer && S.lockOut > 0) continue;
      var pd = dist(p, ball);
      if(pd < pickupOf(p) && pd < takeD){ takeD = pd; taker = p; }
    }
    // zpracování míč zastaví
    if(taker){
      var tv = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
      if(taker.role === 'gk' && tv > T.gkParrySpeed) parry(taker);   // moc rychlé na chycení
      else { ball.owner = taker; ball.vx = ball.vy = 0; ownD = takeD; S.lastTeam = taker.team; ball.gained = S.time; pickChasers(); }
    }
  }

  // --- vedení míče: v poli kolem hráče ho hráč vede a míč poslouchá i změnu směru;
  //     mimo pole si míč letí sám a hráč nad ním nemá kontrolu ---
  if(ball.owner && ownD <= pickupOf(ball.owner)){
    var o = ball.owner, sf = o.sf || 0;
    // čím rychleji běžím, tím dál míč patří — ale předkop nesmí míč vystrčit z vlastního
    // pole, takže strop je pickup − CONTACT − 2. Platí pro oba týmy stejně: AI si to dřív
    // hlídala zpomalením (carrySpeed), ovládaný hráč neměl obdobu a míč ztrácel.
    var lead = CONTACT + Math.min(T.dribbleKick*sf, pickupOf(o) - CONTACT - 2);
    var tgx = o.x + o.fx*lead, tgy = o.y + o.fy*lead;
    // korekce k noze má strop: bez něj dá chyba 79 jednotek při ballFollow 20
    // rychlost 1580/s a míč hráči prosviští kolem nohy ven z pole
    var cx = (tgx - ball.x)*T.ballFollow, cy = (tgy - ball.y)*T.ballFollow;
    var cl = Math.sqrt(cx*cx + cy*cy), cap = speedOf(o)*1.5;   // stačí, aby dohnal sám sebe
    if(cl > cap){ cx = cx/cl*cap; cy = cy/cl*cap; }
    ball.vx = o.fx*speedOf(o)*sf + cx;
    ball.vy = o.fy*speedOf(o)*sf + cy;
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
