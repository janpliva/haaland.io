// Brankář: postavení, detekce střely, zákrok, vyražení a rozehrávka.
import { T, FIELD_W, STEAL_LOCK, dirOf } from './config.js';
import { S, ball } from './state.js';
import { speedOf, moveTo, boxD, clampToBox, ballAtT, pickChasers, kickPlan } from './util.js';

let shotSeq = 0;

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
    var s = clampToBox(g, g.shotX, g.shotY);
    moveTo(g, s.x, s.y, speedOf(g)*(T.gkDiveSpeed/100), dt);
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
