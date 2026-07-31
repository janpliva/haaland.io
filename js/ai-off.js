// Tým s míčem: role v pruzích, náběhy do volného prostoru a před branku.
import { T, FIELD_W, dirOf } from './config.js';
import { S, ball } from './state.js';
import { foesOf, matesOf, attackY, speedOf, boxW, boxD, moveTo,
         chaserOf, interceptPoint } from './util.js';

// ---- role spoluhráčů: každý dostane vlastní pruh a hloubku ----
export function assignRoles(list, carrier){
  var mates = [];
  for(var i=0;i<list.length;i++) if(list[i] !== carrier && list[i].role !== 'gk') mates.push(list[i]);
  mates.sort(function(a,b){ return a.x - b.x; });   // stabilní podle aktuální pozice
  var n = mates.length;
  for(var k=0;k<n;k++){
    var m = mates[k];
    m.lane = n > 1 ? (k + 0.5)/n : 0.5;
    m.laneN = n;
    m.band = k % 2;                    // 0 = náběh vpřed, 1 = podpora vedle/za
    m.prefD = m.band === 0 ? 330 : 200;
  }
}

export function mateTarget(mate, carrier){
  if(mate.lane === undefined){ mate.lane = 0.5; mate.laneN = 1; mate.band = 0; mate.prefD = 300; }
  var dir = dirOf(mate.team);          // -1 = útočí nahoru, +1 = dolů
  // míč je v útočné třetině → nenabíhá se do obecného pruhu, ale před branku.
  // Pruh (podle aktuální pozice) určuje, kam do vápna — kraje zůstanou na krajích.
  var agy = attackY(mate.team), agx = FIELD_W/2;
  if(Math.abs(carrier.y - agy) < boxD()*2.2){
    var jit = Math.sin(mate.seed + S.time*0.5) * 45;
    var spread = mate.band === 0 ? boxW() : boxW()*1.25;
    var depth  = mate.band === 0 ? boxD()*0.35 : boxD()*1.15;   // band 1 drží hranici vápna
    return { x: Math.max(60, Math.min(FIELD_W-60, agx + (mate.lane-0.5)*spread + jit)),
             y: agy - dir*depth };
  }
  // náběh za obranu: jen band 0 a jen když míč drží spoluhráč, ne když je volný
  var runFoe = null;
  if(mate.band === 0 && T.runDepth > 0 && ball.owner && ball.owner.team === mate.team){
    var ff = foesOf(mate), rfP = -1e9;
    for(var z=0; z<ff.length; z++){
      if(ff[z].role === 'gk') continue;
      var zp = ff[z].y * dir;                 // vyšší = blíž brance, na kterou útočíme
      if(zp > rfP){ rfP = zp; runFoe = ff[z]; }
    }
  }

  var laneC = FIELD_W * mate.lane;
  var halfLane = Math.max(85, (FIELD_W/(2*Math.max(1, mate.laneN))) * 1.45);
  var yMin, yMax;
  if(mate.band === 0){ yMin = carrier.y + dir*430; yMax = carrier.y + dir*100; }
  else { yMin = carrier.y + dir*110; yMax = carrier.y - dir*200; }
  if(yMin > yMax){ var sw = yMin; yMin = yMax; yMax = sw; }
  if(runFoe){                                 // protáhni pásmo až za posledního obránce
    var behindY = runFoe.y + dir*T.runDepth;
    if(dir < 0) yMin = Math.min(yMin, behindY);
    else        yMax = Math.max(yMax, behindY);
  }
  yMin = Math.max(45, yMin); yMax = Math.min(S.FIELD_H-45, yMax);
  if(yMax - yMin < 70){ yMin = Math.max(45, Math.min(yMin, S.FIELD_H-175)); yMax = yMin + 130; }

  var best = null, bestScore = -1e9;
  for(var gx=0; gx<=4; gx++){
    for(var gy=0; gy<=4; gy++){
      var px = laneC - halfLane + 2*halfLane*(gx/4);
      var py = yMin + (yMax - yMin)*(gy/4);
      if(px < 45 || px > FIELD_W-45) continue;

      var foes = foesOf(mate), owns = matesOf(mate);
      var minR = 1e9;
      for(var i=0;i<foes.length;i++){
        var dx=px-foes[i].x, dy=py-foes[i].y, d=Math.sqrt(dx*dx+dy*dy);
        if(d<minR) minR=d;
      }
      var minM = 1e9;
      for(var k=0;k<owns.length;k++){
        var b = owns[k]; if(b === mate || b === carrier) continue;
        var mx=px-b.x, my=py-b.y, dm=Math.sqrt(mx*mx+my*my);
        if(dm<minM) minM=dm;
      }
      if(minM === 1e9) minM = 180;

      var dc = Math.sqrt((px-carrier.x)*(px-carrier.x)+(py-carrier.y)*(py-carrier.y));
      var noise = Math.sin(px*0.021 + mate.seed + S.time*0.4) * Math.sin(py*0.017 + mate.seed*1.9) * 40;
      var score = Math.min(minR, 230) * 1.0
                + Math.min(minM, 180) * 0.55
                - Math.abs(dc - mate.prefD) * 0.45
                - Math.abs(px - laneC) * 0.20
                + noise;
      // bonus za prostor za posledním obráncem; roste s hloubkou, ale jen do runDepth,
      // takže z náběhu nevznikne kempení na brankové čáře
      if(runFoe){
        var beyond = (py - runFoe.y) * dir;
        if(beyond > 0 && beyond <= T.runDepth) score += beyond;
      }
      if(score > bestScore){ bestScore = score; best = {x:px, y:py}; }
    }
  }
  if(!best) best = { x: Math.min(FIELD_W-45, Math.max(45, laneC)), y: (yMin+yMax)/2 };
  return best;
}

// ---- tým s míčem: nabíhá do volných pruhů; při přihrávce jde všechno na míč ----
export function attack(list, carrier, dt){
  // míč v poli bez hráče: jde pro něj JEN nejbližší, ostatní dál nabíhají
  var chaser = carrier ? null : chaserOf(list);   // závazek, ne výběr každý snímek
  var ref = carrier || { x: ball.x, y: ball.y };   // kolem čeho se nabíhá
  S.roleTimer -= dt;
  if(S.roleTimer <= 0 || carrier !== S.lastCarrier){
    assignRoles(list, carrier); S.roleTimer = 2.2; S.lastCarrier = carrier;
  }
  for(var k=0;k<list.length;k++){
    var m = list[k];
    if(m === S.ctrl || m === carrier || m.role === 'gk') continue;
    if(m === chaser){ var ipa = interceptPoint(m); moveTo(m, ipa.x, ipa.y, speedOf(m), dt); continue; }
    m.think -= dt;
    if(m.think <= 0){
      var t = mateTarget(m, ref);
      m.tx = t.x; m.ty = t.y; m.think = 0.3 + Math.random()*0.3;
    }
    moveTo(m, m.tx, m.ty, speedOf(m), dt);
  }
}
