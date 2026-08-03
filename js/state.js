// Veškerý měnitelný stav hry. Importy jsou v modulech jen pro čtení, takže všechno,
// co se přiřazuje z víc míst, musí žít jako VLASTNOST objektu — proto S, E, ball, touch.
import { T, FIELD_W, PH, CONTACT, dirOf, mkRatings, resolveRatings } from './config.js';

export const cv = document.getElementById('c');
export const ctx = cv.getContext('2d');

export const S = {
  ctrl:null, time:0, lockOut:0, lockedPlayer:null, lastTeam:'b',
  // brankář, který právě vykopl po výběhu, a jeho vlastní odpočet — schválně zvlášť od
  // lockedPlayer/lockOut, aby se ty dva zámky nepřepisovaly (poražený útočník i brankář
  // musí být zamčení naráz)
  gkCleared:null, gkClearOut:0,
  // 'menu' = domovská obrazovka / soupisky, 'game' = běží zápas. Nic se nerozehrává samo.
  screen:'menu',
  kickNext:'b', scoreB:0, scoreR:0, matchOver:false, running:false,
  deadTime:0, roleTimer:0, lastCarrier:null, drawAim:null,
  // odkud se míří a kdo míč podle nároku zpracuje jako první (jednodotyková přihrávka)
  aimFrom:null, recv:null,
  cssW:0, cssH:0, scale:1, FIELD_H:2000
};

export const ball = { x:0, y:0, vx:0, vy:0, owner:null, gained:0,
                      // cyklus doteku: míč je pořád obyčejná fyzika, nikdy přilepený
                      held:false,                  // držitel stojí, míč leží u nohy
                      chaseV:0,                    // rychlost doběhu držitele pro tenhle cyklus
                      chaseM:0,                    // výchylka sticku vzorkovaná při doteku, drží se celý cyklus
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
// import jednosměrný, util si sem funkci zapíše při svém načtení. Stejně tak store.js
// zapisuje applyRatings — buildTeams ji volá na konci, takže uložená hodnocení naskočí
// i po přestavení týmů z panelu a nesedící tvar se zahodí právě tam.
export const hooks = { pickChasers: function(){}, applyRatings: function(){} };

// ---- krátká paměť: jak kdo běžel ----
// Obránce vidí SOUPEŘE se zpožděním defReact — každého, ne jen držitele míče. Vlastní tým,
// vlastní polohu a odebrání má vždycky živé. Paměť je proto per hráč: každý si nese svůj
// kruhový buffer, takže se do něj dá sáhnout na kohokoliv bez ohledu na to, kdo má míč.
//
// Vjem se z ní skládá tak, že se vzorek dopočítá dopředu tehdejší rychlostí: dokud hráč běží
// pořád stejně, vyjde přesně tam, kde opravdu je (chyba nula), a mine se přesně tehdy, když
// hráč směr změní. To je celý mechanismus — kdyby se místo toho mířilo na starou polohu,
// zpoždění by stálo obránce něco i při rovném běhu (změřeno v předchozím kroku).
//
// Vzorek se ukládá JEDNOU za snímek na začátku kroku, ještě než se čímkoli hne, takže
// nejnovější vzorek odpovídá tomu, co v témže snímku čte AI. Kapacita se počítá v čase,
// ne ve snímcích: 256 vzorků pokryje i 120Hz displej (2,1 s historie).
const HN = 256;
const VW = 0.15;                   // z jak dlouhého úseku se odhaduje rychlost

export function mkHist(){
  return { n:0, i:0, t:new Float64Array(HN), x:new Float64Array(HN), y:new Float64Array(HN),
           vx:new Float64Array(HN), vy:new Float64Array(HN) };
}
// Pro dopočet dopředu je potřeba rychlost, kterou hráč DRŽÍ, ne ta okamžitá: krok pohybu se
// u cíle usekne (min(sp*dt, d)), takže rozdíl dvou sousedních snímků při kolísavém dt šumí a
// cíl obránce pak cuká (naměřeno 17 jednotek na snímek). Bere se proto z úseku dlouhého VW,
// kde se ten jednosnímkový zub rozmělní. U držitele míče se nemusí odhadovat vůbec — carryChase
// ho veze přesně rychlostí chaseV ve směru fx,fy, a to je i ta rychlost, kterou po dalším
// doteku pojede dál, takže je to pro dopočet lepší údaj než okamžitý dojezd k míči.
// Začátek toho úseku se INTERPOLUJE, neskáče se po vzorcích: při kolísavém dt se jinak okraj
// okna přehazuje mezi sousedními vzorky a odhad rychlosti kvantuje — cíl hlídajícího obránce
// pak cukal (naměřeno 4,9 jednotky na snímek proti 0,8 u živého cíle).
function posAt(h, want){
  var k = (h.i - 1 + HN) % HN;
  if(want >= h.t[k]) return { x:h.x[k], y:h.y[k], t:h.t[k] };
  for(var s=1; s<h.n; s++){
    var prev = (k - 1 + HN) % HN;
    if(h.t[prev] <= want){
      var span = h.t[k] - h.t[prev], w = span > 1e-9 ? (want - h.t[prev])/span : 0;
      return { x: h.x[prev] + (h.x[k]-h.x[prev])*w, y: h.y[prev] + (h.y[k]-h.y[prev])*w, t: want };
    }
    k = prev;
  }
  return { x:h.x[k], y:h.y[k], t:h.t[k] };
}
function velOver(h, x, y, t){
  if(h.n === 0) return { x:0, y:0 };
  var a = posAt(h, t - VW), span = t - a.t;
  if(!(span > 1e-6)) return { x:0, y:0 };
  return { x: (x - a.x)/span, y: (y - a.y)/span };
}

export function histClear(){
  for(var i=0;i<E.all.length;i++){ E.all[i].h.n = 0; E.all[i].h.i = 0; }
}
export function histPush(){
  for(var i=0;i<E.all.length;i++){
    var p = E.all[i], h = p.h;
    // Se setrvačností je skutečná rychlost přímo na hráči a je hladká už z definice (driveMove
    // ji mění omezeným tempem), takže se nemusí ničím rekonstruovat. Bez setrvačnosti zůstává
    // původní odhad: okamžitá rychlost je tam po snímcích usekaná a cíl obránce by cukal.
    var v = (T.accelTime > 0) ? { x: p.vx, y: p.vy }
          : (p === ball.owner) ? (ball.held ? { x:0, y:0 } : { x: p.fx*ball.chaseV, y: p.fy*ball.chaseV })
                               : velOver(h, p.x, p.y, S.time);
    h.t[h.i] = S.time; h.x[h.i] = p.x; h.y[h.i] = p.y; h.vx[h.i] = v.x; h.vy[h.i] = v.y;
    h.i = (h.i + 1) % HN;
    if(h.n < HN) h.n++;
  }
}
// Kde hráč byl před `delay` sekundami a jak tehdy běžel. Mezi vzorky se interpoluje lineárně
// — kdyby se skákalo po celých snímcích, cíl obránce by se při kolísavém dt trhal.
// Vrací i `age`: jak starý ten obrázek doopravdy je. Když paměť tak daleko nesahá (po výkopu,
// po přestavbě týmů), vezme se nejstarší vzorek a age je kratší — zpoždění tak najíždí
// plynule od nuly, místo aby naskočilo celé naráz.
export function histAt(p, delay){
  var h = p && p.h;
  if(!h || h.n === 0) return { ok:false };
  var want = S.time - delay, k = (h.i - 1 + HN) % HN;
  if(want >= h.t[k]) return { ok:true, age:delay, x:h.x[k], y:h.y[k], vx:h.vx[k], vy:h.vy[k] };
  for(var s=1; s<h.n; s++){
    var prev = (k - 1 + HN) % HN;
    if(h.t[prev] <= want){
      var span = h.t[k] - h.t[prev], w = span > 1e-9 ? (want - h.t[prev])/span : 0;
      return { ok:true, age:delay,
               x: h.x[prev] + (h.x[k]-h.x[prev])*w,    y: h.y[prev] + (h.y[k]-h.y[prev])*w,
               vx: h.vx[prev] + (h.vx[k]-h.vx[prev])*w, vy: h.vy[prev] + (h.vy[k]-h.vy[prev])*w };
    }
    k = prev;
  }
  return { ok:true, age: S.time - h.t[k], x:h.x[k], y:h.y[k], vx:h.vx[k], vy:h.vy[k] };
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

// Kdo si teď nesmí sáhnout na míč. Dva nezávislé zámky: kdo míč právě ztratil (lockedPlayer)
// a brankář, který ho právě vykopl po výběhu (gkCleared).
export function locked(p){
  return (p === S.lockedPlayer && S.lockOut > 0) || (p === S.gkCleared && S.gkClearOut > 0);
}

// dist a clampField bydlí tady, ne v util.js: potřebuje je reset() a jinak by vznikl kruh
export function dist(a,b){ var dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }
export function clampField(p){
  var x0 = p.x, y0 = p.y;
  p.x = Math.max(PH, Math.min(FIELD_W-PH, p.x));
  p.y = Math.max(PH, Math.min(S.FIELD_H-PH, p.y));
  // Co se u mantinelu uřízlo z dráhy, musí se uříznout i z rychlosti. Jinak by se do hráče
  // opřeného o čáru „nastřádala" rychlost do stěny a při odlepení by vystřelil.
  if(p.x !== x0 && ((p.x > x0) ? p.vx < 0 : p.vx > 0)) p.vx = 0;
  if(p.y !== y0 && ((p.y > y0) ? p.vy < 0 : p.vy > 0)) p.vy = 0;
}

// bx/by/bsf = nabufferovaný vstup (stick u člověka, směr k cíli u AI) — projeví se až u doteku
// ratings = hodnocení 0–99, všechno 50 (viz config.js). `mul` jsou z nich předpočítané
// násobitele; čte je stat(). Číslo na dresu je jen k vykreslení, simulace ho nikde nečte.
export function mk(team, role, num){
  var p = { x:0, y:0, fx:0, fy:-1, team:team, tx:0, ty:0, think:0,
            seed:Math.random()*100, sf:0, role:role || '', num:num || 0, plan:null, side:0,
            bx:0, by:-1, bsf:0, vx:0, vy:0, h:mkHist(), rush:false, rushT:0, rushX:0, rushY:0,
            shotOn:false, shotId:0, shotDeadline:0, shotX:0, shotY:0,
            ratings:mkRatings(role), mul:null };
  resolveRatings(p);
  return p;
}

export function buildTeams(){
  E.blue = []; E.red = [];
  for(var i=0;i<T.teamSize;i++) E.blue.push(mk('b', '', i+1));
  for(var j=0;j<T.foeSize;j++) E.red.push(mk('r', '', j+1));
  // brankář se nepočítá do velikosti týmu ani do číslování — má vlastní značku
  E.gkB = mk('b', 'gk'); E.blue.push(E.gkB);
  E.gkR = mk('r', 'gk'); E.red.push(E.gkR);
  E.all = E.blue.concat(E.red);
  hooks.applyRatings();      // uložená hodnocení, nebo samé padesátky když tvar nesedí
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
    p.bx = p.fx; p.by = p.fy; p.bsf = 0; p.vx = 0; p.vy = 0;
  });
  // rozehrává inkasující tým
  var starter = kickTeam === 'b' ? E.blue[0] : E.red[0];
  ball.vx = ball.vy = 0; ball.owner = starter; ball.gained = S.time;
  ball.pending = null; ball.held = true; ball.chaseV = 0; ball.chaseM = 0; ball.peakGap = CONTACT;
  ball.claim = null;
  ball.x = starter.x + starter.fx*CONTACT;
  ball.y = starter.y + starter.fy*CONTACT;
  S.lastTeam = kickTeam;
  S.ctrl = E.blue[0]; S.lockOut = 0; S.lockedPlayer = null;
  S.gkCleared = null; S.gkClearOut = 0;
  E.all.forEach(function(p){ p.rush = false; p.rushT = 0; });
  histClear();                // po přestavení pozic je stará paměť lež, ne zpoždění
  touch.fire = null;          // ať nabitá přihrávka nepřeteče do dalšího pokusu
  hooks.pickChasers();
}
