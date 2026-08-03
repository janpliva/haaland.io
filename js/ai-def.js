// Tým bez míče: jeden na míč, ostatní hlídají na brankové straně a drží linii.
import { T, FIELD_W, dirOf } from './config.js';
import { S, E, ball, dist, clampField } from './state.js';
import { attackY, speedOf, moveTo, chaserOf, nearestTo, interceptPoint,
         perceivedBall, perceivedFoe } from './util.js';

const lastMan = { b:null, r:null }, lastManT = { b:0, r:0 };   // poslední obránce, drží se 0,5 s

export function defend(list, dt){
  var team = list === E.blue ? 'b' : 'r';
  var gdir = -dirOf(team);                              // směr k vlastní brance
  var ogy = attackY(team === 'b' ? 'r' : 'b'), ogx = FIELD_W/2;   // vlastní branka
  var opp = list === E.blue ? E.red : E.blue;

  // --- co tenhle blok o soupeři VÍ ---
  // Zpoždění defReact je od hodnocení `defending`, tedy VLASTNOST JEDNOTLIVCE, ne týmu:
  // každý obránce si obrázek soupeře staví sám a podle svého jede úplně všechno, na co
  // sahá — koho hlídá, kam presuje, jestli se vůbec presuje a kde má linii. Dva obránci se
  // proto můžou v jednom snímku neshodnout, a to je záměr.
  // Vlastní tým (rozestup, poslední obránce, drift) i odebrání v main.js zůstávají živé.
  //
  // Jediné, co JEDEN obrázek mít musí, je týmový výběr štváče. Bere se obrázek toho, kdo
  // za míčem právě jde — on je ten, kdo podle něj taky běží. Než nějaký je, vezme se první
  // hráč v poli, ať je volba deterministická.
  var ref = ball.chaser[team];
  if(!ref || ref.role === 'gk' || list.indexOf(ref) < 0){
    ref = null;
    for(var rf=0;rf<list.length;rf++) if(list[rf].role !== 'gk'){ ref = list[rf]; break; }
  }
  var rbv = ref ? perceivedBall(ref) : ball;
  var rbx = rbv.x - ogx, rby = rbv.y - ogy;
  var rbl = Math.sqrt(rbx*rbx + rby*rby) || 1;
  var refPress = rbl < T.pressDist;
  var refHx = ogx + rbx/rbl*T.pressDist, refHy = ogy + rby/rbl*T.pressDist;

  // Volný míč i presink jedou přes závazek. Čekání na držícím bodě ale musí vybírat podle
  // TOHO BODU — výběr podle míče se zablokuje: kdo vyrazí, přestane být nejbližší míči,
  // role přeskočí na jiného a k bodu nedojde nikdo (ověřeno, blok stál 20 s na místě).
  var chaser = (!ball.owner || refPress) ? chaserOf(list) : nearestTo(list, refHx, refHy);
  // pool drží INDEXY skutečných soupeřů; každý obránce si je pak přečte přes svůj obrázek
  var pool = [];
  for(var o=0;o<opp.length;o++){
    if(opp[o] !== ball.owner && opp[o].role !== 'gk') pool.push(o);
  }

  // --- poslední obránce: nejhlubší hráč týmu, role se drží, ať nepřeskakuje ---
  function eligible(p){ return p && p.role !== 'gk' && p !== chaser && list.indexOf(p) >= 0; }
  lastManT[team] -= dt;
  if(lastManT[team] <= 0 || !eligible(lastMan[team])){
    var pick = null, pickP = -1e9;
    for(var i=0;i<list.length;i++){
      if(!eligible(list[i])) continue;
      var proj = list[i].y * gdir;                      // vyšší = hlouběji u vlastní branky
      if(proj > pickP){ pickP = proj; pick = list[i]; }
    }
    lastMan[team] = pick; lastManT[team] = 0.5;
  }
  var lm = lastMan[team];

  for(var k=0;k<list.length;k++){
    var r = list[k];
    if(r === S.ctrl || r.role === 'gk') continue;

    // --- obrázek TOHOTO obránce: jeden pohled na soupeře na snímek, pak už jen čtení ---
    var bv = perceivedBall(r);
    if(r === chaser){
      // Presink běží podle toho, co držitel dělal před jeho defReact ms (bv). Volný míč se
      // nezpožďuje — to není hlídání hráče, ale závod o balon — a odebrání v main.js
      // pořád počítá se skutečnou polohou míče.
      var cbx = bv.x - ogx, cby = bv.y - ogy, cbl = Math.sqrt(cbx*cbx + cby*cby) || 1;
      if(!ball.owner || cbl < T.pressDist){
        var ipd = interceptPoint(r, bv); moveTo(r, ipd.x, ipd.y, speedOf(r), dt, true);
      }
      // mimo dosah nevybíhá — čeká na spojnici míč–vlastní branka, blok se nerozbije
      else moveTo(r, ogx + cbx/cbl*T.pressDist, ogy + cby/cbl*T.pressDist, speedOf(r)*0.9, dt);
      continue;
    }
    var see = [];
    for(var v=0;v<opp.length;v++) see.push(perceivedFoe(r, opp[v]));

    // --- obranná linie podle nejhlubšího soupeře, jak ho vidí ON ---
    var deepFoe = null, dfP = -1e9;
    for(var f=0;f<opp.length;f++){
      if(opp[f].role === 'gk') continue;
      var fp = see[f].y * gdir;
      if(fp > dfP){ dfP = fp; deepFoe = see[f]; }
    }
    var lineY = deepFoe ? deepFoe.y + gdir*T.lineGap : ogy;

    var tgt = null, ti = -1, tdBest = 1e9;
    for(var q=0;q<pool.length;q++){
      var td = dist(r, see[pool[q]]);
      if(td < tdBest){ tdBest = td; ti = q; tgt = see[pool[q]]; }
    }
    if(!tgt){ var ipf = interceptPoint(r, bv); moveTo(r, ipf.x, ipf.y, speedOf(r)*0.85, dt, true); continue; }
    pool.splice(ti, 1);

    // postav se mezi hlídaného a VLASTNÍ BRANKU (dřív to bylo mezi něj a míč)
    var lx = ogx - tgt.x, ly = ogy - tgt.y, ll = Math.sqrt(lx*lx+ly*ly) || 1;
    var mx2 = tgt.x + lx/ll*T.markDist;
    var my2 = tgt.y + ly/ll*T.markDist;
    // úkrok k míči je jen v ose x, takže nemůže obránce dostat před jeho hráče
    mx2 += (bv.x - tgt.x) * (T.markShift/100);

    // drift jen v okolí míče; vzdálení obránci stojí a drží tvar
    var w = Math.max(0, Math.min(1, 1 - dist(r, ball)/Math.max(1, T.wobbleNear)));
    var wob = 36 * w;
    mx2 += Math.sin(S.time*0.63 + r.seed) * wob + Math.sin(S.time*0.27 + r.seed*3.1) * wob*0.55;
    my2 += Math.cos(S.time*0.51 + r.seed*1.7) * wob + Math.sin(S.time*0.35 + r.seed*2.2) * wob*0.55;

    if(my2*gdir < tgt.y*gdir) my2 = tgt.y;              // drift ho nesmí dostat před hlídaného
    if(r === lm){
      if(my2*gdir < lineY*gdir) my2 = lineY;            // poslední obránce drží linii
    } else if(lm){
      if(my2*gdir > lm.y*gdir) my2 = lm.y;              // nikdo nesmí za posledního obránce
    }

    if(dist(r, {x:mx2, y:my2}) > 24) moveTo(r, mx2, my2, speedOf(r)*0.84, dt);
  }
  // rozestup, ať se nelepí na sebe
  for(var a=0;a<list.length;a++){
    for(var b2=a+1;b2<list.length;b2++){
      var r1 = list[a], r2 = list[b2];
      if(r1.role === 'gk' || r2.role === 'gk') continue;
      var sx = r1.x-r2.x, sy = r1.y-r2.y, sd = Math.sqrt(sx*sx+sy*sy);
      if(sd < 42 && sd > 0.01){
        var pxs = sx/sd, pys = sy/sd, push = (42-sd)/2;
        r1.x += pxs*push; r1.y += pys*push;
        r2.x -= pxs*push; r2.y -= pys*push;
        clampField(r1); clampField(r2);
      }
    }
  }
}
