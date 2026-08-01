// Geometrie, „kdo je kdo" a náběh na míč. Vrstva nad state, pod AI.
import { T, FIELD_W, PH, CONTACT, dirOf } from './config.js';
import { S, E, ball, dist, clampField, hooks } from './state.js';

export { dist, clampField };          // ať je zbytek kódu bere z jednoho místa

// ---- kdo je kdo ----
export function foesOf(p){ return p.team === 'b' ? E.red : E.blue; }
export function matesOf(p){ return p.team === 'b' ? E.blue : E.red; }
export function attackY(team){ return team === 'b' ? 0 : S.FIELD_H; }   // branka, na kterou tým útočí
// brankář nemá žádný kouzelný dosah — chytá jen tělem, stejně jako kdokoliv jiný
export function pickupOf(p){ return p.role === 'gk' ? CONTACT : (p.team === 'b' ? T.pickupMate : T.foePickup); }
// na jakou vzdálenost hráč odebere míč soupeři
export function stealR(p){ return PH + T.tackleR; }
export function speedOf(p){ return p === S.ctrl ? T.playerSpeed : (p.team === 'b' ? T.mateSpeed : T.foeSpeed); }
// vápno — roste se šířkou branky, takže se ladí jedním posuvníkem
export function boxW(){ return Math.min(FIELD_W*0.70, T.goalW*2.9); }
export function boxD(){ return Math.min(S.FIELD_H*0.25, T.goalW*1.7); }
export function inBox(x, y, team){
  return Math.abs(x - FIELD_W/2) < boxW()/2 && Math.abs(y - attackY(team)) < boxD()*1.3;
}
// vlastní vápno brankáře: kam se smí postavit a kde je chráněný
export function ownBoxOf(p){
  var own = p.team === 'b' ? S.FIELD_H : 0, far = own + dirOf(p.team)*boxD();
  return { x0: FIELD_W/2 - boxW()/2, x1: FIELD_W/2 + boxW()/2,
           y0: Math.min(own, far), y1: Math.max(own, far), own: own };
}
export function clampToBox(p, x, y){
  var b = ownBoxOf(p);
  return { x: Math.max(b.x0, Math.min(b.x1, x)), y: Math.max(b.y0, Math.min(b.y1, y)) };
}
export function inOwnBox(p){
  var b = ownBoxOf(p);
  return p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
}

// ---- pohyb ----
// Vstup se VŽDY nabufferuje — projeví se ale až při doteku. Mezi doteky běží držitel po
// touchDir rychlostí z posledního doteku; to je ta zavázanost. chaseSteer je únikový východ.
export function bufferInput(p, nx, ny, sf){
  p.bx = nx; p.by = ny; p.bsf = sf;
  if(ball.owner !== p || !ball.attached) return { x:nx, y:ny, sf:sf };
  if(ball.held) return { x:nx, y:ny, sf:0 };            // stojí, dokud se stick nepohne
  var k = T.chaseSteer/100;
  var mx = ball.tdx*(1-k) + nx*k, my = ball.tdy*(1-k) + ny*k;
  var m = Math.sqrt(mx*mx + my*my);
  if(m < 1e-6){ mx = ball.tdx; my = ball.tdy; m = 1; }
  return { x:mx/m, y:my/m, sf: ball.csf*(1-k) + sf*k };
}
// délka předkopu v čase: 0 -> maxLead -> přesně 0. Ta nula na konci JE dotek, a protože je
// nulová z obou stran, změna směru při doteku míčem netrhne.
export function leadAt(pr){ return ball.maxLead * Math.sin(Math.PI*pr); }
// Přechod mezi dvěma modelovými pozicemi se rozjede z toho, kde míč PRÁVĚ je, a dojede
// k modelu za EASE_T. Bez toho míč poskočí o CONTACT: na konci cyklu je předkop nulový,
// klidová pozice je ale CONTACT před hráčem (a při převzetí zase leží kdekoliv do CONTACT).
export const EASE_T = 0.10;
function easeFrom(o){ ball.ex = ball.x - o.x; ball.ey = ball.y - o.y; ball.eT = 0; }
// odsazení míče od hráče: model, na začátku rozjetý z místa, kde míč byl
export function ballOffset(o){
  var mx, my;
  if(ball.held){ mx = ball.tdx*CONTACT; my = ball.tdy*CONTACT; }
  else {
    var lead = leadAt(ball.cycleDur > 0 ? Math.min(1, ball.cycleT/ball.cycleDur) : 1);
    mx = ball.tdx*lead; my = ball.tdy*lead;
  }
  var u = Math.min(1, ball.eT/EASE_T), e = u*u*(3-2*u);
  return { x: ball.ex + (mx - ball.ex)*e, y: ball.ey + (my - ball.ey)*e };
}
export function startCycle(o, nx, ny, sf){
  easeFrom(o);
  ball.attached = true; ball.held = false;
  ball.tdx = nx; ball.tdy = ny; ball.csf = sf;
  ball.maxLead = CONTACT + T.touchLead*sf;
  ball.cycleDur = (T.touchCycleWalk + (T.touchCycleSprint - T.touchCycleWalk)*sf)/1000;
  ball.cycleT = 0;
}
export function holdBall(o, nx, ny){
  easeFrom(o);
  ball.attached = true; ball.held = true;
  ball.tdx = nx; ball.tdy = ny; ball.csf = 0;
  ball.cycleT = 0; ball.cycleDur = 0; ball.maxLead = CONTACT;
}
// Uvolnění uprostřed cyklu: míč dostane rychlost držitele plus okamžitou změnu předkopu,
// aby po odebrání ani po přihrávce viditelně neskočil a nezůstal stát.
export function detachBall(){
  if(!ball.attached) return;
  var o = ball.owner;
  if(o && !ball.held){
    var pr = ball.cycleDur > 0 ? Math.min(1, ball.cycleT/ball.cycleDur) : 1;
    var dLead = ball.maxLead * Math.PI/Math.max(0.001, ball.cycleDur) * Math.cos(Math.PI*pr);
    var v = speedOf(o)*ball.csf + dLead;
    ball.vx = ball.tdx*v; ball.vy = ball.tdy*v;
  }
  ball.attached = false; ball.held = false;
}

export function moveTo(p, tx, ty, sp, dt){
  var dx = tx-p.x, dy = ty-p.y, d = Math.sqrt(dx*dx+dy*dy);
  var carrying = (ball.owner === p && ball.attached && !ball.held);
  // Kdo si míč narokoval, se za ním vrhá — jeho normální pohyb (běh na pozici, presink,
  // závazek chasera) je po dobu cuknutí vypnutý. Vstup se ale pořád bufferuje, aby se
  // při dotyku projevil. Tady se ty dva pohyby nepotkají, takže se nemají o co přetahovat.
  if(ball.claim === p && !ball.owner){
    bufferInput(p, d > 0.001 ? dx/d : p.fx, d > 0.001 ? dy/d : p.fy, sp > 0 ? 1 : 0);
    return;
  }
  if(d < 2 && !carrying){ p.sf = 0; return; }     // v cyklu se doběhne i přes cíl
  // sf = podíl z MAXIMÁLNÍ rychlosti hráče, ne z té zrovna zadané — jinak by zpomalený
  // hráč hlásil sf=1 a předkop by počítal s rychlostí, kterou nemá
  var full = speedOf(p)*dt;
  var reqSF = full > 0 ? Math.min(1, Math.min(sp*dt, d)/full) : 0;
  var mv = bufferInput(p, d > 0.001 ? dx/d : p.fx, d > 0.001 ? dy/d : p.fy, reqSF);
  var step = mv.sf*full, x0 = p.x, y0 = p.y;
  if(d > 6 || carrying){ p.fx = mv.x; p.fy = mv.y; }
  p.x += mv.x*step; p.y += mv.y*step;
  clampField(p);
  // sf podle SKUTEČNĚ ušlé vzdálenosti — u mantinelu clampField krok uřízne
  var ax = p.x-x0, ay = p.y-y0;
  p.sf = full > 0 ? Math.min(1, Math.sqrt(ax*ax + ay*ay)/full) : 0;
}

// vzdálenost bodu od úsečky — test, jestli je přihrávka/střela průchozí
export function segDist(px,py, ax,ay, bx,by){
  var vx=bx-ax, vy=by-ay, wx=px-ax, wy=py-ay;
  var L=vx*vx+vy*vy, t = L>0 ? Math.max(0, Math.min(1,(wx*vx+wy*vy)/L)) : 0;
  var qx=ax+vx*t-px, qy=ay+vy*t-py;
  return Math.sqrt(qx*qx+qy*qy);
}
export function laneClear(p, tx, ty, rad){
  var f = foesOf(p);
  for(var i=0;i<f.length;i++){
    if(segDist(f[i].x, f[i].y, ball.x, ball.y, tx, ty) < rad) return false;
  }
  return true;
}
export function rollDist(v){ return v*v / (2*Math.max(1, T.friction)); }   // kam až míč dojede

// ---- náběh na míč: kam se míč dokutálí a kde ho jde nejdřív zastihnout ----
// míč zpomaluje konstantně o T.friction, takže dráha za čas t je analytická
export function ballAtT(t, v0){
  if(v0 < 0.001) return { x:ball.x, y:ball.y };
  var tStop = v0 / T.friction;
  var s = t < tStop ? v0*t - 0.5*T.friction*t*t : v0*v0/(2*T.friction);
  return { x: ball.x + ball.vx/v0*s, y: ball.y + ball.vy/v0*s };
}
export function interceptSolve(p){
  var v0 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  if(v0 < 0.001) return { x:ball.x, y:ball.y, t: dist(p, ball)/Math.max(1, speedOf(p)) };
  var tStop = v0 / T.friction, eff = T.interceptEff/100, sp = speedOf(p);
  for(var t=0; t<=tStop+1.5; t+=0.05){
    var b = ballAtT(t, v0);
    // hráč se neotočí okamžitě, takže nepočítá s plnou rychlostí
    if(dist(p, b) <= sp*t*eff) return { x:b.x, y:b.y, t:t };
  }
  var r = ballAtT(tStop, v0);                    // nedostižitelný → aspoň místo zastavení
  return { x:r.x, y:r.y, t: 1e6 + dist(p, r) };  // 1e6 = seřadí se až za dostižitelné
}
export function interceptPoint(p){ var s = interceptSolve(p); return { x:s.x, y:s.y }; }

// ---- nárok a cuknutí pro zpracování ----
// Dosah zpracování míč NEZASTAVUJE, jen určuje, kdo si na něj sáhne. Stejný model konstantního
// zpomalení jako interceptSolve, ale hráč smí na cuknutí až lungeSpeed % své rychlosti a stačí
// mu doběhnout na CONTACT, ne na nulu. Neřešitelné = nenárokuje se (žádné teleporty).
export function lungeSolve(p){
  var sp = speedOf(p)*T.lungeSpeed/100;
  var v0 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  if(v0 < 0.001){
    var d0 = Math.max(0, dist(p, ball) - CONTACT);
    return { ok:true, x:ball.x, y:ball.y, t: d0/Math.max(1, sp) };
  }
  var tStop = v0/T.friction;
  for(var t=0; t<=tStop+1.0; t+=1/60){
    var b = ballAtT(t, v0);
    if(dist(p, b) <= sp*t + CONTACT) return { ok:true, x:b.x, y:b.y, t:t };
  }
  return { ok:false, x:ball.x, y:ball.y, t:1e9 };
}
// projde dráha míče vůbec dosahem zpracování toho hráče?
export function ballPathHits(p){
  var v0 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  var e = ballAtT(v0/Math.max(1, T.friction), v0);
  return segDist(p.x, p.y, ball.x, ball.y, e.x, e.y) < pickupOf(p);
}
export function claimEligible(p){
  return !(p === S.lockedPlayer && S.lockOut > 0) && p !== ball.owner;
}
// Každý snímek: drž nárok, dokud je řešitelný, ale pusť ho, když se někdo jiný dostane
// k míči zřetelně dřív — tak vzniká odchycení přihrávky. Práh 0.05 s brání blikání.
export function updateClaim(){
  if(ball.owner){ ball.claim = null; return; }
  var cur = ball.claim, curT = 1e9;
  if(cur && claimEligible(cur)){
    var cs = lungeSolve(cur);
    if(cs.ok){ curT = cs.t; ball.claimX = cs.x; ball.claimY = cs.y; }
    else cur = null;
  } else cur = null;
  var best = null, bestT = 1e9, bx = 0, by = 0;
  for(var i=0;i<E.all.length;i++){
    var p = E.all[i];
    if(!claimEligible(p) || p === cur) continue;
    if(!ballPathHits(p)) continue;
    var s = lungeSolve(p);
    if(s.ok && s.t < bestT){ bestT = s.t; best = p; bx = s.x; by = s.y; }
  }
  if(best && bestT < curT - 0.05){ ball.claim = best; ball.claimX = bx; ball.claimY = by; }
  else if(cur) ball.claim = cur;
  else if(best){ ball.claim = best; ball.claimX = bx; ball.claimY = by; }
  else ball.claim = null;
}
// Cuknutí: na spočítaný bod, rychlostí, jakou řešení vyžaduje, se stropem lungeSpeed.
// Bod se přepočítává každý snímek, takže jak míč zpomaluje, cíl se plynule posouvá.
export function lungeStep(dt){
  var p = ball.claim; if(!p || ball.owner) return;
  var dx = ball.claimX - p.x, dy = ball.claimY - p.y, d = Math.sqrt(dx*dx+dy*dy);
  var cap = speedOf(p)*T.lungeSpeed/100;
  var need = 1e9;
  var s = lungeSolve(p);
  if(s.ok && s.t > 1/120) need = d/s.t;
  var sp = Math.min(cap, need);
  var step = Math.min(sp*dt, d), x0 = p.x, y0 = p.y;
  if(d > 0.001){
    p.x += dx/d*step; p.y += dy/d*step;
    if(d > 6){ p.fx = dx/d; p.fy = dy/d; }
  }
  clampField(p);
  var full = speedOf(p)*dt, ax = p.x-x0, ay = p.y-y0;
  p.sf = full > 0 ? Math.min(1, Math.sqrt(ax*ax + ay*ay)/full) : 0;
}

export function pickChaser(list){
  var best = null, bestT = 1e18;
  for(var i=0;i<list.length;i++){
    var p = list[i];
    if(p.role === 'gk') continue;
    if(p === S.lockedPlayer && S.lockOut > 0) continue;
    var t = interceptSolve(p).t;                 // vybírá se podle ČASU, ne vzdálenosti
    if(t < bestT){ bestT = t; best = p; }
  }
  return best;
}
export function pickChasers(){
  ball.chaser.b = pickChaser(E.blue);
  ball.chaser.r = pickChaser(E.red);
  var v0 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  ball.chaseDir = v0 > 0.001 ? { x:ball.vx/v0, y:ball.vy/v0 } : { x:0, y:0 };
}
hooks.pickChasers = pickChasers;      // state.reset() ji volá přes tenhle hák

// závazek se drží; přepočítá se jen když je neplatný (přestavba týmů, zámek, brankář)
export function chaserOf(list){
  var team = list === E.blue ? 'b' : 'r';
  var c = ball.chaser[team];
  if(!c || c.role === 'gk' || list.indexOf(c) < 0 || (c === S.lockedPlayer && S.lockOut > 0)){
    ball.chaser[team] = c = pickChaser(list);
  }
  return c;
}
export function nearestFoeDist(p){
  var f = foesOf(p), m = 1e9;
  for(var i=0;i<f.length;i++){ var d = dist(f[i], p); if(d < m) m = d; }
  return m;
}
export function nearestTo(list, tx, ty){
  var qx = (tx === undefined) ? ball.x : tx, qy = (ty === undefined) ? ball.y : ty;
  var best = null, bd = 1e9;
  for(var i=0;i<list.length;i++){
    var p = list[i];
    if(p.role === 'gk') continue;
    if(p === S.lockedPlayer && S.lockOut > 0) continue;
    var dx = p.x - qx, dy = p.y - qy, d = Math.sqrt(dx*dx+dy*dy);
    if(d < bd){ bd = d; best = p; }
  }
  return best;
}

// ---- odehrání ----
// kickPlan bydlí tady, ne v ai-ball.js: potřebuje ho i keeper.js a jinak by vznikl kruh
export function kickPlan(dx, dy, speed){
  var err = T.foeError * Math.PI/180;
  var a = Math.atan2(dy, dx) + (Math.random()*2-1)*err;   // nepřesnost = chyba AI
  return { kick:true, x:Math.cos(a), y:Math.sin(a), speed:speed };
}
// rychlost, aby přihrávka dorazila do cíle ještě s aiArrive, ne aby cíl přestřelila
export function speedForDistance(d){
  var v = Math.sqrt(T.aiArrive*T.aiArrive + 2*T.friction*d);
  return Math.max(T.passSpeed*(T.passMin/100), Math.min(T.passSpeed, v));
}

export function doPass(dx, dy, speed){
  var d = Math.sqrt(dx*dx+dy*dy); if(d < .001) return;
  var v = speed || T.passSpeed;            // AI zatím kope pořád naplno
  var carrier = ball.owner;
  ball.attached = false; ball.held = false;      // přihrávka pouští cyklus, rychlost dá kop níž
  ball.owner = null;
  // míč se odehrává z místa, kde reálně leží — nikam se neteleportuje
  ball.vx = dx/d*v; ball.vy = dy/d*v;
  S.lockedPlayer = carrier; S.lockOut = 0.32; S.lastTeam = carrier.team;
  pickChasers();                        // změna držení → nový závazek, kdo si pro míč jde
  // ovládání zůstává na přihrávajícím, dokud míč někdo nepřevezme
  if(carrier.team === 'b' && carrier.role !== 'gk') S.ctrl = carrier;
}
