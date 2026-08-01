// Veškerý měnitelný stav hry. Importy jsou v modulech jen pro čtení, takže všechno,
// co se přiřazuje z víc míst, musí žít jako VLASTNOST objektu — proto S, E, ball, touch.
import { T, FIELD_W, PH, CONTACT, dirOf } from './config.js';

export const cv = document.getElementById('c');
export const ctx = cv.getContext('2d');

export const S = {
  ctrl:null, time:0, lockOut:0, lockedPlayer:null, lastTeam:'b',
  kickNext:'b', scoreB:0, scoreR:0, matchOver:false, running:false,
  deadTime:0, roleTimer:0, lastCarrier:null, drawAim:null,
  cssW:0, cssH:0, scale:1, FIELD_H:2000
};

export const ball = { x:0, y:0, vx:0, vy:0, owner:null, gained:0,
                      // cyklus doteku: míč je pořád obyčejná fyzika, nikdy přilepený
                      held:false,                  // držitel stojí, míč leží u nohy
                      chaseV:0,                    // rychlost doběhu držitele pro tenhle cyklus
                      peakGap:0,                   // odvozený vrchol mezery — jen na kontrolu
                      claim:null, claimX:0, claimY:0,   // kdo si volný míč narokoval a kam se vrhá
                      lungeNeed:0,                 // jakou rychlost si to cuknutí právě žádá
                      pending:null,                // nachystaná přihrávka, odehraje se až při doteku
                      chaser:{ b:null, r:null },   // kdo si za míčem jde; mění se jen při změně držení
                      chaseDir:{ x:0, y:0 } };     // směr míče při posledním výběru, na odhalení odrazu

export const joyBase = { x:0, y:0 };
export const touch = { active:false, id:null, x:0, y:0, fire:null };

// Entity se v buildTeams přepisují celé, takže musí viset na kontejneru.
export const E = { blue: [], red: [], all: [], gkB: null, gkR: null };

// reset() potřebuje pickChasers z util.js, ale util.js závisí na state.js. Aby zůstal
// import jednosměrný, util si sem funkci zapíše při svém načtení.
export const hooks = { pickChasers: function(){} };

// ---- krátká paměť držitele míče ----
// Presující obránce sleduje HRÁČE s míčem a vidí ho se zpožděním defReact. Míč sám se
// nezpožďuje nikdy: jeho pohyb je pilovitý (každý dotek ho znovu kopne, viz startKick), a
// zpožděný pozorovatel neumí odlišit takový kop od změny směru — změřeno, obránce pak
// prohrával i s hráčem, který jen běžel šikmo kolem něj. Běh držitele je naopak mezi doteky
// rovnoměrný, takže se dá dopočítat dopředu a zpoždění nestojí NIC, dokud držitel běží
// pořád stejně. Chyba vznikne přesně tehdy, když směr změní — a to je ta klička.
//
// Vzorek se ukládá JEDNOU za snímek na začátku kroku, ještě než se čímkoli hne, takže
// nejnovější vzorek odpovídá tomu, co v témže snímku čte AI. Kapacita se počítá v čase,
// ne ve snímcích: 256 vzorků pokryje i 120Hz displej (2,1 s historie).
const HN = 256;
const hT = new Float64Array(HN), hX = new Float64Array(HN), hY = new Float64Array(HN),
      hVX = new Float64Array(HN), hVY = new Float64Array(HN);
const hOwn = new Array(HN);         // kdo byl v tom snímku držitel — jiný držitel = jiná paměť
var hN = 0, hI = 0;                 // kolik vzorků paměť drží a kam se zapíše další

export function histClear(){ hN = 0; hI = 0; for(var i=0;i<HN;i++) hOwn[i] = null; }
export function histPush(){
  var o = ball.owner, vx = 0, vy = 0;
  // Rychlost držitele se NEODHADUJE z rozdílu poloh — carryChase ho v tomhle cyklu veze
  // přesně rychlostí chaseV ve směru fx,fy, takže se dá vzít rovnou. Rozdíl dvou snímků
  // by při kolísavém dt šuměl a cíl obránce by cukal (naměřeno 17 jednotek na snímek).
  if(o && !ball.held){ vx = o.fx * ball.chaseV; vy = o.fy * ball.chaseV; }
  hT[hI] = S.time; hOwn[hI] = o;
  hX[hI] = o ? o.x : ball.x; hY[hI] = o ? o.y : ball.y;
  hVX[hI] = vx; hVY[hI] = vy;
  hI = (hI + 1) % HN;
  if(hN < HN) hN++;
}
// Kde byl držitel před `delay` sekundami a jak tehdy běžel. Mezi vzorky se interpoluje
// lineárně — kdyby se skákalo po celých snímcích, cíl obránce by se při kolísavém dt trhal.
// Vrací i `age`: jak starý ten obrázek doopravdy je. Když paměť tak daleko nesahá nebo v tom
// okně držel míč někdo jiný, vezme se nejstarší vzorek TOHOTO držitele a age je kratší —
// zpoždění tak po každé změně držení plynule najíždí od nuly, místo aby se přepínalo.
// ok = false jen tehdy, když o tomhle držiteli není zatím vůbec nic.
export function histCarrier(delay){
  var o = ball.owner;
  if(!o || hN === 0) return { ok:false };
  var want = S.time - delay, k = (hI - 1 + HN) % HN;
  if(hOwn[k] !== o) return { ok:false };
  if(want >= hT[k]) return { ok:true, age:delay, x:hX[k], y:hY[k], vx:hVX[k], vy:hVY[k] };
  for(var s=1; s<hN; s++){
    var prev = (k - 1 + HN) % HN;
    if(hOwn[prev] !== o) break;                     // dál už míč držel někdo jiný
    if(hT[prev] <= want){
      var span = hT[k] - hT[prev], w = span > 1e-9 ? (want - hT[prev])/span : 0;
      return { ok:true, age:delay,
               x: hX[prev] + (hX[k]-hX[prev])*w,    y: hY[prev] + (hY[k]-hY[prev])*w,
               vx: hVX[prev] + (hVX[k]-hVX[prev])*w, vy: hVY[prev] + (hVY[k]-hVY[prev])*w };
    }
    k = prev;
  }
  return { ok:true, age: S.time - hT[k], x:hX[k], y:hY[k], vx:hVX[k], vy:hVY[k] };
}

export function resize(){
  // nulový viewport by udělal scale=0 a FIELD_H=NaN, ze kterého se hra nevzpamatuje
  S.cssW = window.innerWidth || 1; S.cssH = window.innerHeight || 1;
  var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = Math.round(S.cssW * dpr); cv.height = Math.round(S.cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.scale = S.cssW / FIELD_W;
  S.FIELD_H = S.cssH / S.scale;
}

// dist a clampField bydlí tady, ne v util.js: potřebuje je reset() a jinak by vznikl kruh
export function dist(a,b){ var dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
export function clampField(p){
  p.x = Math.max(PH, Math.min(FIELD_W-PH, p.x));
  p.y = Math.max(PH, Math.min(S.FIELD_H-PH, p.y));
}

// bx/by/bsf = nabufferovaný vstup (stick u člověka, směr k cíli u AI) — projeví se až u doteku
export function mk(team){ return { x:0, y:0, fx:0, fy:-1, team:team, tx:0, ty:0, think:0,
                            seed:Math.random()*100, sf:0, role:'', plan:null, side:0,
                            bx:0, by:-1, bsf:0,
                            shotOn:false, shotId:0, shotDeadline:0, shotX:0, shotY:0 }; }

export function buildTeams(){
  E.blue = []; E.red = [];
  for(var i=0;i<T.teamSize;i++) E.blue.push(mk('b'));
  for(var j=0;j<T.foeSize;j++) E.red.push(mk('r'));
  E.gkB = mk('b'); E.gkB.role = 'gk'; E.blue.push(E.gkB);   // brankář se nepočítá do velikosti týmu
  E.gkR = mk('r'); E.gkR.role = 'gk'; E.red.push(E.gkR);
  E.all = E.blue.concat(E.red);
}

export function reset(kickTeam){
  kickTeam = kickTeam || 'b';
  var nB = T.teamSize, nR = T.foeSize;
  E.blue[0].x = FIELD_W*0.5; E.blue[0].y = S.FIELD_H*0.80;
  for(var i=1;i<nB;i++){
    var t = nB > 2 ? (i-1)/(nB-2) : 0.25;
    E.blue[i].x = FIELD_W*(0.18 + 0.64*t);
    E.blue[i].y = S.FIELD_H*(0.46 + ((i%2) ? 0.10 : -0.06));
  }
  for(var j=0;j<nR;j++){
    var u = nR > 1 ? j/(nR-1) : 0.5;
    E.red[j].x = FIELD_W*(0.22 + 0.56*u);
    E.red[j].y = S.FIELD_H*(0.28 + ((j%2) ? 0.16 : 0));
  }
  E.gkB.x = FIELD_W*0.5; E.gkB.y = S.FIELD_H - 45;
  E.gkR.x = FIELD_W*0.5; E.gkR.y = 45;
  E.all.forEach(function(p){
    p.fx = 0; p.fy = dirOf(p.team); p.tx = p.x; p.ty = p.y;
    p.think = 0; p.sf = 0; p.plan = null; clampField(p);
    p.bx = p.fx; p.by = p.fy; p.bsf = 0;
  });
  // rozehrává inkasující tým
  var starter = kickTeam === 'b' ? E.blue[0] : E.red[0];
  ball.vx = ball.vy = 0; ball.owner = starter; ball.gained = S.time;
  ball.pending = null; ball.held = true; ball.chaseV = 0; ball.peakGap = CONTACT;
  ball.claim = null;
  ball.x = starter.x + starter.fx*CONTACT;
  ball.y = starter.y + starter.fy*CONTACT;
  S.lastTeam = kickTeam;
  S.ctrl = E.blue[0]; S.lockOut = 0; S.lockedPlayer = null;
  histClear();                // po přestavení pozic je stará paměť lež, ne zpoždění
  touch.fire = null;          // ať nabitá přihrávka nepřeteče do dalšího pokusu
  hooks.pickChasers();
}
