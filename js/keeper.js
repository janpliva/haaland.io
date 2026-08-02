// Brankář: postavení, detekce střely, zákrok, vyražení, výběh a rozehrávka.
import { T, FIELD_W, STEAL_LOCK, dirOf } from './config.js';
import { S, E, ball } from './state.js';
import { speedOf, moveTo, boxD, clampToBox, ballAtT, pickChasers, kickPlan,
         laneClear, matesOf, segDist } from './util.js';

let shotSeq = 0;
const RUSH_DROP = 80;        // o kolik dál než spouštěč musí držitel couvnout, aby výběh skončil

// střela = volný míč mířící k mé brance, jehož přímá dráha protne branku
export function goalBound(g){
  if(ball.owner) return false;
  if(Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy) < 1) return false;
  var own = g.team === 'b' ? S.FIELD_H : 0;
  if(ball.vy * (-dirOf(g.team)) <= 0) return false;      // neletí k mé brance
  var t = (own - ball.y) / ball.vy;
  if(!(t > 0)) return false;
  return Math.abs(ball.x + ball.vx*t - FIELD_W/2) < T.goalW/2;
}
// kde míč protne brankářovu výšku — se stejným zpomalením jako interceptSolve
export function crossX(gy){
  var v0 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  if(v0 < 0.001) return ball.x;
  var tStop = v0/T.friction, prev = ball.y - gy;
  for(var t=0.02; t<=tStop; t+=0.02){
    var b = ballAtT(t, v0), cur = b.y - gy;
    if((prev < 0) !== (cur < 0)) return b.x;
    prev = cur;
  }
  return ballAtT(tStop, v0).x;                           // nedoletí → kde skončí
}

// ---- výběh ----
// Sázka: brankář opustí branku a jde si pro míč k noze soupeře. Když ho útočník obejde, je
// brána prázdná — o to jde. Beatelnost dělá závazek: jednou vyběhnutý brankář se po
// gkRushCommit nedá odvolat.
function goalOf(g){ return { x: FIELD_W/2, y: g.team === 'b' ? S.FIELD_H : 0 }; }
function distToGoal(g, p){ var o = goalOf(g); return Math.sqrt((p.x-o.x)*(p.x-o.x) + (p.y-o.y)*(p.y-o.y)); }

// „sám na bránu": držitel nemá kam přihrát a mezi ním a brankou nikdo z mého týmu nestojí
function throughOnGoal(g, o){
  var mates = matesOf(o);
  for(var i=0;i<mates.length;i++){
    var m = mates[i];
    if(m === o || m.role === 'gk') continue;
    if(laneClear(o, m.x, m.y, 26)) return false;         // aspoň jedna přihrávka projde
  }
  var mine = g.team === 'b' ? E.blue : E.red, gl = goalOf(g);
  for(var k=0;k<mine.length;k++){
    var d = mine[k];
    if(d === g || d.role === 'gk') continue;             // brankář se do krytí nepočítá
    if(segDist(d.x, d.y, ball.x, ball.y, gl.x, gl.y) < 26) return false;
  }
  return true;
}
function rushTrigger(g){
  if(!(T.gkRushDist > 0)) return false;                  // 0 = výběh vypnutý
  var o = ball.owner;
  if(!o || o.team === g.team) return false;              // vybíhá se jen proti soupeři s míčem
  var d = distToGoal(g, o);
  if(d < T.gkRushDist) return true;
  return d < T.gkRushLoneDist && throughOnGoal(g, o);
}
// Vrací, jestli brankář v tomhle snímku vybíhá. Během závazku se spouštěč NEPŘEPOČÍTÁVÁ,
// takže nemůže blikat; po něm se testují důvody k ukončení.
function rushUpdate(g, dt){
  if(g.rush){
    g.rushT -= dt;
    if(g.rushT > 0) return true;                         // závazek: neodvolatelné
    var o = ball.owner;
    if(!o || o.team === g.team){ g.rush = false; return false; }
    var lim = (throughOnGoal(g, o) ? T.gkRushLoneDist : T.gkRushDist) + RUSH_DROP;
    if(distToGoal(g, o) > lim){ g.rush = false; return false; }
    var gl = goalOf(g), rx = ball.x - gl.x, ry = ball.y - gl.y;
    if(distToGoal(g, g) >= T.gkRushMax - 2 && (rx*ball.vx + ry*ball.vy) > 0){
      g.rush = false; return false;                      // na dorazu a míč se vzdaluje
    }
    return true;
  }
  if(rushTrigger(g)){
    g.rush = true; g.rushT = T.gkRushCommit/1000;
    g.rushX = ball.x; g.rushY = ball.y;      // na tenhle bod se vyráží, viz playKeeper
    return true;
  }
  return false;
}
export function rushing(g){ return !!(g && g.rush); }

// Doběhl k míči: NECHYTÁ ho, odkopne pryč od vlastní branky s rozptylem. Jiná věc než parry —
// ten je o střele, tohle o dojetém driblinku, a schválně se to nespojuje.
export function rushClear(g){
  var gl = goalOf(g), ax = ball.x - gl.x, ay = ball.y - gl.y, L = Math.sqrt(ax*ax + ay*ay);
  var a = L > 0.001 ? Math.atan2(ay, ax) : Math.atan2(dirOf(g.team), 0);
  a += (Math.random()*2 - 1)*(T.gkClearSpread*Math.PI/180);
  var beaten = ball.owner;
  ball.owner = null; ball.held = false; ball.claim = null;
  ball.vx = Math.cos(a)*T.gkClearSpeed; ball.vy = Math.sin(a)*T.gkClearSpeed;
  // dva zámky naráz: obehraný útočník si míč nesebere zpátky a brankář si ho hned nesebere sám
  if(beaten){ S.lockedPlayer = beaten; S.lockOut = STEAL_LOCK; }
  S.gkCleared = g; S.gkClearOut = STEAL_LOCK;
  S.lastTeam = g.team;
  g.rush = false; g.rushT = 0;
  pickChasers();
}

export function playKeeper(g, dt){
  if(ball.owner === g) return;                       // má míč, řeší ho driveCarrier
  var own = g.team === 'b' ? S.FIELD_H : 0, cx = FIELD_W/2;

  // parametry zákroku se vzorkují JEDNOU na začátku střely a do konce se nepřepočítávají
  if(goalBound(g)){
    if(!g.shotOn){
      shotSeq++; g.shotOn = true; g.shotId = shotSeq;
      g.shotDeadline = S.time + T.gkReaction/1000;
      g.shotX = crossX(g.y) + (Math.random()*2 - 1)*T.gkError;
      g.shotY = g.y;
    }
  } else g.shotOn = false;

  if(g.shotOn && S.time >= g.shotDeadline){          // po reakční době teprve zasahuje
    // Zákrok má přednost před výběhem: jakmile se na střelu opravdu reaguje, výběh končí.
    // Během reakční doby ale výběh POKRAČUJE — brankář, který se vydal dopředu a na střelu
    // ještě nezareagoval, je právě ta chyba, kterou si útočník zasloužil.
    g.rush = false; g.rushT = 0;
    var s = clampToBox(g, g.shotX, g.shotY);
    moveTo(g, s.x, s.y, speedOf(g)*(T.gkDiveSpeed/100), dt);
    return;
  }

  // Výběh: běží na MÍČ rychlostí gkRushSpeed. Smí ven z vápna, ale nikdy dál než gkRushMax
  // od středu vlastní branky — na dorazu se cíl ořízne na tu kružnici, takže po ní klouže za
  // míčem místo aby stál. Přebíjí normální postavení i gkDepth.
  //
  // PO DOBU ZÁVAZKU se ale míří na bod, kde míč byl při vyběhnutí, ne na živý míč. Bez toho
  // je výběh naváděná střela: brankář běží 130 % rychlosti útočníka a přemíří se každý snímek,
  // takže obejít se nedá vůbec — naměřeno 100 % odkopů ve všech buňkách a gkRushCommit neměl
  // žádný vliv. Závazek musí být závazkem ke SMĚRU, ne k cíli; po jeho vypršení se zase míří
  // živě. Tím teprve gkRushCommit dělá to, co má: čím delší, tím snáz se dá obejít.
  if(rushUpdate(g, dt)){
    var live = !(g.rushT > 0);
    var gl = goalOf(g), bx = live ? ball.x : g.rushX, by = live ? ball.y : g.rushY;
    var rx = bx - gl.x, ry = by - gl.y;
    var RL = Math.sqrt(rx*rx + ry*ry) || 1, tx = bx, ty = by;
    if(RL > T.gkRushMax){ tx = gl.x + rx/RL*T.gkRushMax; ty = gl.y + ry/RL*T.gkRushMax; }
    moveTo(g, tx, ty, speedOf(g)*(T.gkRushSpeed/100), dt);
    return;
  }

  // normální postavení: na spojnici míč–branka, ale nejvýš gkDepth od čáry a jen ve vápně
  var dx = ball.x - cx, dy = ball.y - own, L = Math.sqrt(dx*dx+dy*dy) || 1;
  var out = Math.min(T.gkDepth, L*0.4);
  var q = clampToBox(g, cx + dx/L*out, own + dy/L*out);
  moveTo(g, q.x, q.y, speedOf(g), dt);
}

// rychlý míč brankář nechytí, jen vyrazí pryč od své branky
export function parry(g){
  var v = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  var a = Math.atan2(dirOf(g.team), 0) + (Math.random()*2 - 1)*(50*Math.PI/180);
  var nv = v * (T.gkParryKeep/100);
  ball.vx = Math.cos(a)*nv; ball.vy = Math.sin(a)*nv;
  S.lockedPlayer = g; S.lockOut = STEAL_LOCK;        // vlastní odraz si hned nesebere
  pickChasers();
}

// větev decide() pro brankáře: bez přihrávky buď vyjede nohama, nebo nakopne dopředu
export function keeperPlan(p, press, dir){
  // nikdo blízko → rozehraje nohama, ale nejdál boxD()+gkVenture od vlastní branky
  if(press > T.gkVentureSafe){
    var ogk = p.team === 'b' ? S.FIELD_H : 0;
    return { kick:false, x: p.x, y: ogk + dir*(boxD() + T.gkVenture) };
  }
  return kickPlan((Math.random()-0.5)*600, dir*900);
}
