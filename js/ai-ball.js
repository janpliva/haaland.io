// Hráč s míčem: střílí / centruje / jde si sám / přihrává / dribluje, a drží plán.
import { T, FIELD_W, CONTACT, SETTLE, dirOf } from './config.js';
import { S, ball, dist } from './state.js';
import { foesOf, matesOf, attackY, speedOf, pickupOf, boxD, inBox, moveTo,
         laneClear, nearestFoeDist, kickPlan, speedForDistance, doPass } from './util.js';
import { keeperPlan } from './keeper.js';

export function decide(p){
  var gy = attackY(p.team), gx = FIELD_W/2, dir = dirOf(p.team);
  var foes = foesOf(p), owns = matesOf(p);
  var press = 1e9, near = null;
  for(var q=0;q<foes.length;q++){
    var pd = dist(foes[q], p);
    if(pd < press){ press = pd; near = foes[q]; }
  }

  // 1) střela z dosahu, když je čára k brance volná
  var dg = Math.sqrt((p.x-gx)*(p.x-gx) + (p.y-gy)*(p.y-gy));
  if(p.role !== 'gk' && dg < T.shootRange){
    var aim = gx + (Math.random()-0.5) * T.goalW * 0.6;
    if(laneClear(p, aim, gy, 26)) return kickPlan(aim - ball.x, gy - ball.y);
  }

  var advanced = Math.abs(p.y - gy) < boxD()*1.8;         // jsem v útočné třetině
  var wide = Math.abs(p.x - gx) > T.goalW*0.75;           // jsem u lajny, ne v ose
  var settled = (S.time - ball.gained) >= SETTLE;         // míč už mám zpracovaný

  // 2) centr: z kraje na někoho před brankou. Míří se PŘED něj, ne na nohu.
  if(settled && p.role !== 'gk' && advanced && wide){
    var tgt = null, tS = -1e9;
    for(var c=0;c<owns.length;c++){
      var mc = owns[c];
      if(mc === p || mc.role === 'gk') continue;
      if(!inBox(mc.x, mc.y, p.team)) continue;
      var openC = 1e9;
      for(var jc=0;jc<foes.length;jc++) openC = Math.min(openC, dist(foes[jc], mc));
      var sc = Math.min(openC, 220) - Math.abs(mc.x - gx)*0.25;   // volný a blíž ose = lepší
      if(sc > tS){ tS = sc; tgt = mc; }
    }
    if(tgt){
      var cxa = tgt.x + (gx - tgt.x)*0.35, cya = tgt.y - dir*60;
      var cdx = cxa - ball.x, cdy = cya - ball.y;
      if(laneClear(p, cxa, cya, 18))
        return kickPlan(cdx, cdy, speedForDistance(Math.sqrt(cdx*cdx + cdy*cdy)));
    }
  }

  // 3) sólo: v ose a nikdo v koridoru k brance → jdu si sám, nepřihrávám
  if(p.role !== 'gk' && !wide && laneClear(p, gx, gy, T.soloLane)){
    // checkX/Y/R = na čem plán stojí; když koridor zhoustne, závazek se přeruší dřív
    return { kick:false, x: gx, y: gy - dir*(boxD()*0.2),
             checkX: gx, checkY: gy, checkR: T.soloLane };
  }

  // 4) přihrávka na nejvolnějšího spoluhráče vepředu
  var best = null, bestS = -1e9, bestLx = 0, bestLy = 0;
  for(var i=0;i<owns.length;i++){
    var m = owns[i];
    if(m === p || m.role === 'gk') continue;
    var dm = dist(p, m);
    if(dm < 70 || dm > 1100) continue;
    // míří se PŘED hráče v jeho směru běhu, ne na nohu; stojící hráč lead nedostane
    var alx = m.x + m.fx*T.passLead*(m.sf||0), aly = m.y + m.fy*T.passLead*(m.sf||0);
    if(!laneClear(p, alx, aly, 26)) continue;
    var open = 1e9;
    for(var j=0;j<foes.length;j++) open = Math.min(open, dist(foes[j], m));
    var fwd = (m.y - p.y) * dir;                       // kladné = blíž k brance
    var s = Math.min(open, 260) + fwd*0.5 - dm*0.15;
    if(s > bestS){ bestS = s; best = m; bestLx = alx; bestLy = aly; }
  }
  if(settled && best && (p.role === 'gk' || press < 110 || bestS > 300)){
    var pdx = bestLx - ball.x, pdy = bestLy - ball.y;
    return kickPlan(pdx, pdy, speedForDistance(Math.sqrt(pdx*pdx + pdy*pdy)));
  }

  // brankář bez přihrávky řeší rozehrávku sám (viz keeper.js)
  if(p.role === 'gk') return keeperPlan(p, press, dir);

  // 5) driblink k brance; ve vápně se stahuj do osy a nezabíhej za brankovou čáru
  var tx = p.x + (gx - p.x)*(advanced ? 0.75 : 0.35), ty = p.y + dir*320;
  var limit = gy - dir*(boxD()*0.25);
  ty = dir < 0 ? Math.max(limit, ty) : Math.min(limit, ty);
  // úkrok si drž; překlopí se, až je obránce jasně na druhé straně. Bez té hystereze
  // cíl skáče o 360 jednotek, s ním se trhne natočení hráče a míč odletí od nohy.
  if(near && press < 200){
    if(p.side === 0 || Math.abs(p.x - near.x) > 60) p.side = (p.x - near.x) >= 0 ? 1 : -1;
    tx += p.side * 180;
  }
  return { kick:false,
           x: Math.max(40, Math.min(FIELD_W-40, tx)),
           y: Math.max(30, Math.min(S.FIELD_H-30, ty)) };
}

// rychlost, při které míč ještě zůstane v poli hráče: lead = CONTACT + dribbleKick*sf
export function carrySpeed(p){
  if(T.dribbleKick <= 0) return 1;
  var room = pickupOf(p) - CONTACT - 2;         // kolik místa zbývá na předkop
  return Math.max(0.15, Math.min(1, room / T.dribbleKick));
}

export function driveCarrier(p, dt){
  p.think -= dt;
  // plán se drží planHold ms; přeruší ho jen tlak soupeře nebo zaniklý koridor,
  // jinak by se cíl každých pár desetin sekundy přehodil o stovky jednotek
  var brk = false;
  if(p.plan && !p.plan.kick){
    if(nearestFoeDist(p) < T.planBreak) brk = true;
    else if(p.plan.checkR && !laneClear(p, p.plan.checkX, p.plan.checkY, p.plan.checkR)) brk = true;
  }
  if(!p.plan || p.think <= 0 || brk){ p.plan = decide(p); p.think = T.planHold/1000; }
  if(p.plan.kick){ doPass(p.plan.x, p.plan.y, p.plan.speed); p.plan = null; return; }
  // míč vypadl z pole = nejdřív si ho doběhni, teprve pak zase vpřed
  if(dist(p, ball) > pickupOf(p)){ moveTo(p, ball.x, ball.y, speedOf(p), dt); return; }
  moveTo(p, p.plan.x, p.plan.y, speedOf(p)*carrySpeed(p), dt);
}
