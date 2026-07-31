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
// Jak daleko se míč po předkopnutí vzdálí, když hráč běží dál za ním. Odvozeno, ne hádané:
// po doteku má míč rychlost sf*(speed+touchPush), hráč sf*speed, takže relativní rychlost je
// sf*touchPush a relativní zpomalení je friction (hráč jede konstantně, míč brzdí). Než míč
// klesne zpátky na rychlost hráče, ujede mu (sf*touchPush)²/(2*friction), nejvíc při sf=1.
// K tomu okno, ve kterém dotek vůbec nastane. Drží, dokud hráč běží dál — když se zastaví
// nebo se otočí pryč, míč se kutálí dál a mez neplatí; proto se držení podle vzdálenosti
// neztrácí vůbec (viz zpracování v main.js).
export function carryZone(p){
  return pickupOf(p) + T.touchWindow + T.touchPush*T.touchPush/(2*Math.max(1, T.friction));
}
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
// Jak rychle se hráč s míčem smí otáčet: v klidu skoro okamžitě, v běhu pomalu.
// Zpomalení tím samo vrací obratnost — žádný další mechanismus na to netřeba.
export function maxTurnRate(p){
  var sf = Math.max(0, Math.min(1, p.sf || 0));
  return T.turnRateWalk + (T.turnRateSprint - T.turnRateWalk)*sf;   // °/s
}
// Natočení se stáčí k požadovanému směru. BEZ míče okamžitě, jako dřív; s míčem nejvýš
// maxTurnRate za sekundu, takže zatáčka opisuje oblouk místo piruety na místě.
// Vstup nikdy neblokuje: každý snímek se natočení posune k aktuálnímu sticku, nic se „nedohrává".
export function steerFacing(p, nx, ny, dt){
  if(ball.owner !== p){ p.fx = nx; p.fy = ny; return; }
  var cur = Math.atan2(p.fy, p.fx), diff = Math.atan2(ny, nx) - cur;
  while(diff >  Math.PI) diff -= 2*Math.PI;
  while(diff < -Math.PI) diff += 2*Math.PI;
  var lim = maxTurnRate(p)*Math.PI/180*dt;
  if(diff >  lim) diff =  lim;
  if(diff < -lim) diff = -lim;
  var a = cur + diff;
  p.fx = Math.cos(a); p.fy = Math.sin(a);
}
export function moveTo(p, tx, ty, sp, dt){
  var dx = tx-p.x, dy = ty-p.y, d = Math.sqrt(dx*dx+dy*dy);
  if(d < 2){ p.sf = 0; return; }
  var step = Math.min(sp*dt, d);
  // sf = podíl z MAXIMÁLNÍ rychlosti hráče, ne z té zrovna zadané — jinak by zpomalený
  // hráč hlásil sf=1 a vedení míče by počítalo s rychlostí, kterou nemá
  var full = speedOf(p)*dt;
  p.sf = full > 0 ? Math.min(1, step/full) : 0;
  if(d > 6) steerFacing(p, dx/d, dy/d, dt);
  // s míčem se běží po natočení (proto ten oblouk), bez míče rovnou na cíl jako dřív
  if(ball.owner === p){ p.x += p.fx*step; p.y += p.fy*step; }
  else { p.x += dx/d*step; p.y += dy/d*step; }
  clampField(p);
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
  ball.owner = null;
  // míč se odehrává z místa, kde reálně leží — nikam se neteleportuje
  ball.vx = dx/d*v; ball.vy = dy/d*v;
  S.lockedPlayer = carrier; S.lockOut = 0.32; S.lastTeam = carrier.team;
  pickChasers();                        // změna držení → nový závazek, kdo si pro míč jde
  // ovládání zůstává na přihrávajícím, dokud míč někdo nepřevezme
  if(carrier.team === 'b' && carrier.role !== 'gk') S.ctrl = carrier;
}
