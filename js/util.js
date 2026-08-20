// Geometrie, „kdo je kdo" a náběh na míč. Vrstva nad state, pod AI.
import { T, FIELD_W, FIELD_H, PH, CONTACT, BOUNCE_STOP, dirOf, stat } from './config.js';
import { S, E, ball, dist, clampField, hooks, histAt, locked } from './state.js';

export { dist, clampField };          // ať je zbytek kódu bere z jednoho místa
export { stat };                      // škálovaná konstanta se čte JEN přes tohle

// ---- kdo je kdo ----
export function foesOf(p){ return p.team === 'b' ? E.red : E.blue; }
export function matesOf(p){ return p.team === 'b' ? E.blue : E.red; }
export function attackY(team){ return team === 'b' ? 0 : FIELD_H; }   // branka, na kterou tým útočí
// Tyhle tři jsou jen tenké obálky nad stat() — žádná vlastní logika, aby existovalo
// jediné místo, kde se ze základu a hodnocení dělá výsledná hodnota.
// brankář nemá žádný kouzelný dosah — chytá jen tělem, stejně jako kdokoliv jiný
export function pickupOf(p){ return p.role === 'gk' ? CONTACT : stat(p, 'pickupBase'); }
// na jakou vzdálenost hráč odebere míč soupeři
export function stealR(p){ return PH + stat(p, 'tackleR'); }
export function speedOf(p){ return stat(p, 'speedBase'); }
// vápno — roste se šířkou branky, takže se ladí jedním posuvníkem
export function boxW(){ return Math.min(FIELD_W*0.70, T.goalW*2.9); }
export function boxD(){ return Math.min(FIELD_H*0.25, T.goalW*1.7); }
export function inBox(x, y, team){
  return Math.abs(x - FIELD_W/2) < boxW()/2 && Math.abs(y - attackY(team)) < boxD()*1.3;
}
// vlastní vápno brankáře: kam se smí postavit a kde je chráněný
export function ownBoxOf(p){
  var own = p.team === 'b' ? FIELD_H : 0, far = own + dirOf(p.team)*boxD();
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
// Vstup se VŽDY jen nabufferuje. Projeví se až při kontaktu — mezi kontakty držitele
// neřídí stick, ale automatický doběh na míč (carryChase).
export function bufferInput(p, nx, ny, sf){
  p.bx = nx; p.by = ny; p.bsf = sf;
  return { x:nx, y:ny, sf:sf };
}

// ---- fyzikální cyklus doteku ----
// KONVERGENCE, odvozeno: při kopu má míč rychlost v + touchPush*m, držitel běží v, takže
// relativní rychlost je touchPush*m a relativní zpomalení friction (držitel jede konstantně,
// míč brzdí). Relativní dráha je s(t) = touchPush*m*t - friction*t²/2, z čehož:
//     vrchol mezery = (touchPush*m)² / (2*friction)   v čase touchPush*m/friction
//     délka cyklu   = 2*touchPush*m / friction        (kdy je s(t) zase nula)
// Platí, dokud míč po celý cyklus ještě jede: zastaví se v čase (v + touchPush*m)/friction,
// a to je >= délka cyklu právě když touchPush <= speedOf. Nad tím se míč zastaví dřív a
// držitel zbytek dojde konstantní rychlostí — cyklus je pak DELŠÍ než vzorec, ale pořád
// konečný. Doběh míří na MÍČ, ne na uložený vektor, takže odraz od mantinelu ani teč
// držitele od míče neodpojí — to byla přesně chyba pokusů 63c67c1 a 457c95b.
export function startKick(o, nx, ny, m){
  var v = speedOf(o)*m, rel = stat(o, 'touchPush')*m;
  ball.held = false;
  ball.chaseV = v;
  // Výchylka sticku pro TENHLE cyklus. Mezi doteky stick nemění směr ani rychlost — tohle je
  // ta samá zavázanost, jen pro velikost. Ukládá se ZÁMĚR (bsf), ne síla předkopu m: m je
  // zastropovaná skutečnou rychlostí, takže rozjíždějící se hráč by si tím sám zakázal
  // zrychlit. Záměr je vstup, nekrmí se sám sebou — na rozdíl od chaseV, které se zaseklo.
  ball.chaseM = o.bsf || 0;
  ball.vx = nx*(v + rel); ball.vy = ny*(v + rel);
  ball.peakGap = CONTACT + rel*rel/(2*Math.max(1, T.friction));
}
// Odvozený vrchol mezery platí, dokud držitel drží rychlost z okamžiku kopu. Se setrvačností
// ji nedrží: když během cyklu brzdí, míč se od něj vzdaluje relativní rychlostí, se kterou
// původní odvození nepočítalo, a pojistka hlásí planý poplach (naměřeno 78,9 proti prahu 51,6,
// 17 hlášek za jeden běh). Vrchol se proto přepočítá z AKTUÁLNÍ relativní rychlosti stejným
// vzorcem: co ještě uteče, než tření relativní rychlost sežere, je rel²/(2*friction).
export function refreshPeakGap(){
  var o = ball.owner;
  if(!o || ball.held || !(T.accelTime > 0)) return;
  var bv = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  var ov = Math.sqrt(o.vx*o.vx + o.vy*o.vy);
  var rel = Math.max(0, bv - ov);
  var peak = dist(o, ball) + rel*rel/(2*Math.max(1, T.friction));
  if(peak > ball.peakGap) ball.peakGap = peak;
}
export function holdBall(o){
  ball.held = true; ball.chaseV = 0; ball.chaseM = 0;
  ball.vx = ball.vy = 0;              // míč zůstane ležet přesně tam, kde je — u nohy
  ball.peakGap = CONTACT;
}
// Doběh: držitel běží NA MÍČ. Směr se počítá každý snímek, rychlost je z posledního kontaktu.
// chaseSteer přimíchá stick do směru běhu (0 = čistý doběh, 100 = plné řízení).
export function carryChase(dt){
  var o = ball.owner; if(!o) return;
  if(ball.held){
    // Míč u nohy neznamená, že hráč stojí. Se setrvačností se musí dál rozjíždět podle
    // nabufferovaného záměru — jinak nemůže nikdy nabrat rychlost, a protože se síla předkopu
    // počítá z rychlosti, driblink by nikdy nezačal (změřeno: nula doteků za 300 snímků).
    if(T.accelTime > 0) driveMove(o, o.bx, o.by, speedOf(o)*(o.bsf||0), dt);
    o.sf = 0;
    return;
  }
  var dx = ball.x - o.x, dy = ball.y - o.y, d = Math.sqrt(dx*dx + dy*dy);
  var nx = d > 0.001 ? dx/d : o.fx, ny = d > 0.001 ? dy/d : o.fy;
  var k = T.chaseSteer/100;
  if(k > 0){
    var mx = nx*(1-k) + o.bx*k, my = ny*(1-k) + o.by*k;
    var mm = Math.sqrt(mx*mx + my*my);
    if(mm > 1e-6){ nx = mx/mm; ny = my/mm; }
  }
  if(!(T.accelTime > 0)){
    var step = Math.min(ball.chaseV*dt, d), x0 = o.x, y0 = o.y;
    o.x += nx*step; o.y += ny*step;
    o.fx = nx; o.fy = ny;
    clampField(o);
    var full = speedOf(o)*dt, ax = o.x-x0, ay = o.y-y0;
    o.sf = full > 0 ? Math.min(1, Math.sqrt(ax*ax + ay*ay)/full) : 0;
    o.vx = ax/dt; o.vy = ay/dt;
  } else {
    // Rychlost doběhu je záměr VZORKOVANÝ PŘI DOTEKU, ne živý stick. Živý stick tu byl chyba:
    // zvednutí prstu je gesto přihrávky, ale zároveň nuluje požadavek na pohyb, takže se
    // držitel zastavil uprostřed cyklu před míčem, který si právě předkopl — dotek nepřišel a
    // nachystaná přihrávka nikdy neodešla. Držet vzorek je i konzistentní: mezi doteky stick
    // nemění směr, takže nesmí měnit ani rychlost.
    // Není to návrat zaseknutí ze 2. kroku: to bylo z chaseV, což je DOSAŽENÁ rychlost a krmila
    // se sama sebou. chaseM je vstup a žádnou zpětnou vazbu nemá.
    // Bez ořezu na d/dt: původní min(chaseV*dt, d) jen bránil přeskočení míče v jednom snímku,
    // ale jako POVEL by držitele u míče pokaždé přibrzdil a cyklus doteku by se rozpadl na
    // mikrodotyky (naměřeno 0,050 s místo 0,483 s, míč se nikdy nedostal dál než 25).
    driveMove(o, nx, ny, speedOf(o)*ball.chaseM, dt);
  }
}

// ---- setrvačnost ----
// Rychlost hráče je vektor a mění se konečnou rychlostí: k požadované se posouvá tempem
// speedOf/accelTime při zrychlování a speedOf/decelTime při zpomalování. Směr (fx,fy) jde
// vždycky za rychlostí, takže nikdo neklouže bokem, a sf je SKUTEČNÁ rychlost / maximum.
//
// Při accelTime 0 se tahle funkce vůbec nevolá — každý pohybový blok si v té větvi drží svůj
// PŮVODNÍ výraz, znak po znaku. Je to schválně: integrátor s obrovským tempem by dal jiné
// zaokrouhlení a bitová shoda s dřívějškem by padla.
export function driveMove(p, nx, ny, reqSpeed, dt){
  var mx = speedOf(p);
  var vx = p.vx, vy = p.vy, cur = Math.sqrt(vx*vx + vy*vy);
  var dvx = nx*reqSpeed, dvy = ny*reqSpeed;
  // Rozjezd je hodnocení `accel`, brzda ne — decelTime zůstává globální. Vypínač setrvačnosti
  // je pořád ZÁKLAD (T.accelTime > 0), ne hodnota konkrétního hráče: při základu 0 vyjde
  // násobením nula všem, takže celá hra přepne do bezsetrvačné větve najednou.
  var rate = mx/(((reqSpeed >= cur) ? stat(p, 'accelTime') : T.decelTime)/1000);
  var ex = dvx - vx, ey = dvy - vy, el = Math.sqrt(ex*ex + ey*ey), lim = rate*dt;
  if(el > lim && el > 1e-9){ vx += ex/el*lim; vy += ey/el*lim; }
  else { vx = dvx; vy = dvy; }
  var sp = Math.sqrt(vx*vx + vy*vy);
  if(sp > mx){ vx *= mx/sp; vy *= mx/sp; sp = mx; }
  p.vx = vx; p.vy = vy;
  p.x += vx*dt; p.y += vy*dt;
  clampField(p);                                  // u mantinelu ubere i rychlost do stěny
  if(sp > 1e-6){ p.fx = vx/sp; p.fy = vy/sp; }
  p.sf = mx > 0 ? Math.min(1, sp/mx) : 0;
}

// `through` = cíl je POHYBLIVÝ (místo setkání s míčem). Takový bod se probíhá, ne dojíždí:
// brzdná dráha ani ořez na d/dt tam nemají co dělat, protože se stejně posouvá.
export function moveTo(p, tx, ty, sp, dt, through){
  var dx = tx-p.x, dy = ty-p.y, d = Math.sqrt(dx*dx+dy*dy);
  // sf = podíl z MAXIMÁLNÍ rychlosti hráče, ne z té zrovna zadané — jinak by zpomalený
  // hráč hlásil sf=1 a předkop by počítal s rychlostí, kterou nemá
  var full = speedOf(p)*dt;
  var reqSF = full > 0 ? Math.min(1, Math.min(sp*dt, d)/full) : 0;
  var mv = bufferInput(p, d > 0.001 ? dx/d : p.fx, d > 0.001 ? dy/d : p.fy, reqSF);
  // Držitele míče hýbe doběh (carryChase), a toho, kdo si narokoval volný míč, cuknutí —
  // ale jen když po něm cuknutí opravdu něco chce. Jinak se hýbe normálně a míč k němu
  // dojede sám. Dva pohyby se tak nikdy nepotkají a nemají se o co přetahovat.
  if(ball.owner === p) return;
  if(lungeActive(p)) return;
  if(!(T.accelTime > 0)){
    if(d < 2){ p.sf = 0; return; }
    var step = mv.sf*full, x0 = p.x, y0 = p.y;
    if(d > 6){ p.fx = mv.x; p.fy = mv.y; }
    p.x += mv.x*step; p.y += mv.y*step;
    clampField(p);
    // sf podle SKUTEČNĚ ušlé vzdálenosti — u mantinelu clampField krok uřízne
    var ax = p.x-x0, ay = p.y-y0;
    p.sf = full > 0 ? Math.min(1, Math.sqrt(ax*ax + ay*ay)/full) : 0;
    p.vx = ax/dt; p.vy = ay/dt;          // ať je vektor rychlosti platný i s vypnutou setrvačností
    return;
  }
  if(through){ driveMove(p, d > 0.001 ? dx/d : p.fx, d > 0.001 ? dy/d : p.fy, sp, dt); return; }
  // Dojezd na cíl: bez brzdné dráhy hráč cíl přejede a několikrát ho překmitne (naměřeno
  // 16,7 jednotky a tři přejezdy). sqrt(2*a*d) je rychlost, ze které se ještě stihne zabrzdit
  // na vzdálenosti d při zpomalení a = speedOf/decelTime — klasická brzdná dráha v²=2ad.
  var dec = speedOf(p)/(T.decelTime/1000);
  var want = Math.min(sp, d/dt, Math.sqrt(2*dec*d));
  driveMove(p, d > 0.001 ? dx/d : p.fx, d > 0.001 ? dy/d : p.fy, want, dt);
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

// ---- míč ve vzduchu ----
// Míč nese výšku z a svislou rychlost vz. Ve vzduchu ho vodorovně brzdí airDrag místo tření
// a nikdo si na něj nesmí sáhnout, dokud nedosedne (brankář je výjimka, ta je v main.js).
export function airborne(){ return ball.z > 0 || ball.vz !== 0; }

// ODVOZENÍ DOSTŘELU. Vzdušný kop rychlostí v pod úhlem a se rozloží na vodorovnou v*cos(a)
// a svislou v*sin(a). Svisle je to vrh: výška z(t) = v*sin(a)*t - g*t²/2, takže
//     doba letu   T = 2*v*sin(a) / g
//     vrchol      h = (v*sin(a))² / (2*g)
// Vodorovně míč brzdí odporem vzduchu (lineárně, jako tření po zemi), takže za dobu letu ujede
//     R = v*cos(a)*T - airDrag*T²/2          (a bez odporu vzduchu klasické R = v²*sin(2a)/g)
// Síla přihrávky tak řídí dolet stejně, jako řídí dojezd pozemní přihrávky — jen jinou funkcí.
// Za dopadem to nekončí: míč se odráží dál, viz airProfile.
export function airFlightT(v){ return 2*v*Math.sin(T.liftAngle*Math.PI/180) / Math.max(1, T.gravity); }
export function airApex(v){
  var vz = v*Math.sin(T.liftAngle*Math.PI/180);
  return vz*vz / (2*Math.max(1, T.gravity));
}
export function airRange(v){
  var t = airFlightT(v);
  return Math.max(0, v*Math.cos(T.liftAngle*Math.PI/180)*t - 0.5*T.airDrag*t*t);
}

// dráha při konstantním brzdění za čas dt, useknutá v okamžiku zastavení
function travel(v, a, dt){
  var td = a > 0 ? Math.min(dt, v/a) : dt;
  return v*td - 0.5*a*td*td;
}

// Rozpis celého zbývajícího letu na úseky s konstantním brzděním: každý let (odpor vzduchu) až
// po dopad, a nakonec jeden úsek kutálení (tření), až se doskáče. Odrazy jen ŠKÁLUJÍ rychlost,
// směr se nemění, takže stačí skalární dráha po jedné přímce — přesně to zjednodušení, jaké
// ballAtT dělá po zemi (mantinely se taky neuvažují).
// Z tohohle jednoho modelu čte nárok, náběh i brankář, takže se nikde neliší, kam míč dopadne.
// Rozpis se drží v cache klíčované celým stavem míče a všemi posuvníky, které do něj sahají:
// nárok i náběh se na něj v jednom snímku ptají stokrát, ale míčem se hne až na konci step().
var apKey = null, apSegs = null;
function airProfile(){
  var g = Math.max(1, T.gravity);
  if(apKey && apKey[0] === ball.vx && apKey[1] === ball.vy && apKey[2] === ball.z &&
     apKey[3] === ball.vz && apKey[4] === g && apKey[5] === T.bounceKeep &&
     apKey[6] === T.bounceDrag && apKey[7] === T.airDrag && apKey[8] === T.friction &&
     apKey[9] === ball.x && apKey[10] === ball.y) return apSegs;
  var sp = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  var z = ball.z, vz = ball.vz, t = 0, s = 0, segs = [];
  for(var i=0; i<24 && (z > 0 || vz > 0); i++){
    var tl = (vz + Math.sqrt(Math.max(0, vz*vz + 2*g*z)))/g;    // z(t)=0 → čas do dopadu
    if(!(tl > 0)) break;
    segs.push({ t:t, s:s, v:sp, a:T.airDrag, dur:tl });
    s += travel(sp, T.airDrag, tl); sp = Math.max(0, sp - T.airDrag*tl);
    t += tl;
    var hit = vz - g*tl;                                        // svislá rychlost při dopadu
    z = 0; vz = -hit*(T.bounceKeep/100); sp *= T.bounceDrag/100;
    if(vz < BOUNCE_STOP) vz = 0;                                // doskákáno, dál se kutálí
  }
  segs.push({ t:t, s:s, v:sp, a:T.friction, dur: sp/Math.max(1, T.friction) });
  apKey = [ball.vx, ball.vy, ball.z, ball.vz, g, T.bounceKeep, T.bounceDrag, T.airDrag, T.friction,
           ball.x, ball.y];
  apSegs = segs;
  return segs;
}
// čas do nejbližšího dosednutí — do té doby si na míč nikdo nesáhne
export function airLandingT(){ var s = airProfile(); return s.length > 1 ? s[0].dur : 0; }
// čas, než se míč úplně zastaví (včetně všech odrazů)
export function ballRestT(){
  if(!airborne()) return Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy)/Math.max(1, T.friction);
  var s = airProfile(), last = s[s.length-1];
  return last.t + last.dur;
}
function airAtT(t){
  var sp = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  var ux = sp > 0.001 ? ball.vx/sp : 0, uy = sp > 0.001 ? ball.vy/sp : 0;
  var segs = airProfile(), k = 0;
  while(k < segs.length-1 && t > segs[k].t + segs[k].dur) k++;
  var g = segs[k], dt = Math.max(0, t - g.t);
  if(k < segs.length-1) dt = Math.min(dt, g.dur);               // poslední úsek si travel usekne sám
  var s = g.s + travel(g.v, g.a, dt);
  return { x: ball.x + ux*s, y: ball.y + uy*s };
}

// Vodorovný pohyb míče při konstantním brzdění, jeden snímek. Ve vzduchu se sem posílá odpor
// vzduchu, po zemi tření — jinak je to jeden a týž krok, aby se ta dvě prostředí nedala
// rozejít omylem. Pořadí (nejdřív ubrat rychlost, pak posunout) je to původní, znak po znaku.
export function rollBall(dt, decel){
  var sp = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  if(sp > 0){
    var ns = Math.max(0, sp - decel*dt);
    ball.vx = ball.vx/sp*ns; ball.vy = ball.vy/sp*ns;
  }
  ball.x += ball.vx*dt; ball.y += ball.vy*dt;
}

// Kdo je právě u míče a smí si ho vzít: nejbližší nezamčený hráč do vzdálenosti CONTACT.
// `air` = míč je nad zemí, a tam smí sáhnout JEN brankář.
export function takerAt(x, y, air){
  var taker = null, takeD = 1e9;
  for(var k=0;k<E.all.length;k++){
    var p = E.all[k];
    if(locked(p)) continue;
    if(air && p.role !== 'gk') continue;
    var dx = p.x - x, dy = p.y - y, pd = Math.sqrt(dx*dx + dy*dy);
    if(pd <= CONTACT && pd < takeD){ takeD = pd; taker = p; }
  }
  return taker;
}

// Jeden snímek míče ve vzduchu: vodorovně brzdí odpor vzduchu, svisle táhne gravitace.
// Dopad se řeší PŘESNĚ v okamžiku, kdy nastane, ne až na konci snímku — jinak by chvíle,
// kdy je míč na zemi (a jde zpracovat), padla mezi snímky a míč by se dal chytit jen náhodou.
//   - je u dopadu někdo, kdo si ho smí vzít? → míč zůstane ležet přesně tam a zbytek snímku
//     se neintegruje; převzetí a delší první dotek obstará step() ještě v tomhle snímku
//   - není? → odrazí se (svisle bounceKeep, vodorovně bounceDrag) a letí dál. Každý další
//     odraz je nižší a kratší; pod BOUNCE_STOP se přestane odrážet a jen se kutálí.
// Dva dopady v jednom snímku nastat nemůžou: po odrazu je let dlouhý aspoň 2*BOUNCE_STOP/gravitace
// = 0,04 s, což je víc než strop dt.
export function airStep(dt){
  var g = Math.max(1, T.gravity), rest = dt;
  for(var i=0; i<8 && rest > 1e-9; i++){
    var tl = (ball.vz + Math.sqrt(Math.max(0, ball.vz*ball.vz + 2*g*ball.z)))/g;
    // Není kam letět (na zemi a nic ho nezvedá) — usaď a zbytek snímku se kutálej. Do tohohle
    // stavu se to dostane leda po nedokončeném převzetí; bez tý větve by míč zůstal viset.
    if(!(tl > 0)){ ball.z = 0; ball.vz = 0; rollBall(rest, T.friction); return; }
    var seg = Math.min(rest, tl);
    rollBall(seg, T.airDrag);
    ball.z = Math.max(0, ball.z + ball.vz*seg - 0.5*g*seg*seg);
    ball.vz -= g*seg;
    rest -= seg;
    if(seg < tl) return;                       // snímek skončil ještě v letu
    ball.z = 0;
    // Míč je v tomhle okamžiku na zemi. Když u něj někdo je, zůstane ležet: vz si nechává
    // (záporné), protože z něj bere sílu prvního doteku ten, kdo ho přebírá.
    if(takerAt(ball.x, ball.y, false)) return;
    ball.vz = -ball.vz * (T.bounceKeep/100);
    ball.vx *= T.bounceDrag/100; ball.vy *= T.bounceDrag/100;
    if(ball.vz < BOUNCE_STOP){                 // doskákal — zbytek snímku se už jen kutálí
      ball.vz = 0;
      rollBall(rest, T.friction);
      return;
    }
  }
}

// Delší první dotek po padajícím míči. Je to obyčejný předkop, jen síla nejde z touchPush, ale
// z toho, jak rychle míč padal — proto se padající míč hůř zpracuje než kutálející se. Zbytek
// (doběh na míč, konvergence, pojistka na mezeru) je pak přesně ten pozemní cyklus.
export function airFirstTouch(o, drop){
  var m = o.bsf || 0, v = speedOf(o)*m;
  var rel = drop * (T.airTouch/100);
  var sp = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  var nx = sp > 0.001 ? ball.vx/sp : o.fx, ny = sp > 0.001 ? ball.vy/sp : o.fy;
  ball.held = false;
  ball.chaseV = v;
  ball.chaseM = m;
  ball.vx = nx*(v + rel); ball.vy = ny*(v + rel);
  ball.z = 0; ball.vz = 0;
  ball.peakGap = CONTACT + rel*rel/(2*Math.max(1, T.friction));
}

// ---- náběh na míč: kam se míč dokutálí a kde ho jde nejdřív zastihnout ----
// míč zpomaluje konstantně o T.friction, takže dráha za čas t je analytická
// Nepovinné `b` je POHLED na míč (poloha + rychlost); bez něj se počítá z živého ball.
// Slouží jen presinku se zpožděním — vlastní polohu hráče nikdo nezpožďuje.
export function ballAtT(t, v0, b){
  b = b || ball;
  // Míč ve vzduchu se počítá přes rozpis letu (airProfile): let, dopad, odraz, nakonec kutálení.
  // Zpožděný pohled `b` se sem nikdy nedostane — ten se dělá jen na DRŽENÝ míč a držený míč
  // ve vzduchu být nemůže.
  if(b === ball && airborne()) return airAtT(t);
  if(v0 < 0.001) return { x:b.x, y:b.y };
  var tStop = v0 / T.friction;
  var s = t < tStop ? v0*t - 0.5*T.friction*t*t : v0*v0/(2*T.friction);
  return { x: b.x + b.vx/v0*s, y: b.y + b.vy/v0*s };
}
// Kolik hráč nejvýš urazí za čas t směrem k bodu q. Bez setrvačnosti je to sp*t — s ní se
// musí započítat rozjezd i to, že teď může jet úplně jinam.
// ODVOZENÍ: u = průmět současné rychlosti do směru k q (záporné = jede od cíle). Zrychluje
// tempem a = speedOf/accelTime a přes speedOf se nedostane, takže maxima dosáhne v čase
//     t1 = (sp - u)/a
// a ujde
//     t <= t1:  u*t + a*t²/2
//     t >  t1:  u*t1 + a*t1²/2 + sp*(t - t1)
// Otáčka se počítá stejným tempem `a`, protože driveMove při povelu na plnou rychlost vybírá
// accelTime (|požadovaná| > |současná|), ne decelTime — tady se tedy nic nepřibližuje.
// PŘIBLÍŽENÍ: bere se jen složka rychlosti do směru k cíli. Kolmou složku musí hráč taky
// otočit a driveMove omezuje změnu celého VEKTORU, takže když běží napříč, dojede o kus míň,
// než odhad slibuje — naměřeno +24,9 j za 0,8 s a +41,4 j za 1,5 s. Ve všech ostatních
// případech (stojí, běží k cíli, běží od cíle) je odhad přesný na ±3 j. Zbytek pokrývá
// interceptEff; původní model se mýlil o +78 j z místa a o +316 j při běhu od cíle.
// Při accelTime 0 se výraz redukuje přesně na původní sp*t*eff (a = 0 → větev bez rampy).
function reachIn(p, q, t, sp, acc, eff){
  if(acc <= 0) return sp*t*eff;
  var dx = q.x - p.x, dy = q.y - p.y, dl = Math.sqrt(dx*dx + dy*dy);
  var u = dl > 1e-6 ? (p.vx*dx + p.vy*dy)/dl : 0;
  var t1 = (sp - u)/acc;
  var s = (t <= t1) ? u*t + acc*t*t/2 : u*t1 + acc*t1*t1/2 + sp*(t - t1);
  return s*eff;
}

export function interceptSolve(p, b){
  b = b || ball;
  var v0 = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
  var air = b === ball && airborne();
  if(v0 < 0.001 && !air) return { x:b.x, y:b.y, t: dist(p, b)/Math.max(1, speedOf(p)) };
  // Ve vzduchu se nehledá od nuly, ale od DOPADU: dřív se s míčem nedá dělat nic, takže bod
  // pod letícím míčem není žádný zásah. Po zemi zůstává začátek na nule, tedy přesně jako dřív.
  var t0 = air ? airLandingT() : 0;
  var tStop = air ? ballRestT() : v0 / T.friction, eff = T.interceptEff/100, sp = speedOf(p);
  var acc = T.accelTime > 0 ? sp/(stat(p, 'accelTime')/1000) : 0;
  for(var t=t0; t<=tStop+1.5; t+=0.05){
    var q = ballAtT(t, v0, b);
    // hráč se neotočí okamžitě, takže nepočítá s plnou rychlostí
    if(dist(p, q) <= reachIn(p, q, t, sp, acc, eff)) return { x:q.x, y:q.y, t:t };
  }
  var r = ballAtT(tStop, v0, b);                 // nedostižitelný → aspoň místo zastavení
  return { x:r.x, y:r.y, t: 1e6 + dist(p, r) };  // 1e6 = seřadí se až za dostižitelné
}
export function interceptPoint(p, b){ var s = interceptSolve(p, b); return { x:s.x, y:s.y }; }
// Kam obránce míří, když presuje držitele. Zpožděné je POZOROVÁNÍ HRÁČE, ne poloha míče:
// obránce si vezme držitele, jak ho viděl před defReact ms, a dopočítá si ho dopředu tehdejší
// rychlostí. O kolik se takový odhad mine se skutečností, o tolik je vedle i cíl.
//   běží pořád stejně  → odhad sedí, chyba nula, cíl je přesně ten dnešní
//   změní směr         → obránce po celý defReact míří tam, kam držitel běžel PŘED kličkou
// Jak obránce vidí SOUPEŘE: hráč, jak vypadal před defReact ms, dopočítaný dopředu tehdejší
// rychlostí. Vlastního spoluhráče vidí živě — vrací se rovnou on sám, takže se u něj nic
// nealokuje a při defReact 0 jde všude přesně ten samý objekt jako dřív.
// Zpoždění patří POZOROVATELI, ne pozorovanému: `obs` je obránce, který se dívá, a bere se
// jeho vlastní defReact z hodnocení `defending`. Dřív to byla vlastnost celého týmu.
export function perceivedFoe(obs, p){
  var dr = stat(obs, 'defReact');
  if(!(dr > 0) || !p || p.team === obs.team) return p;
  var h = histAt(p, dr/1000);
  if(!h.ok) return p;
  var x = h.x + h.vx*h.age, y = h.y + h.vy*h.age;     // kde by byl, kdyby nic nezměnil
  return (isFinite(x) && isFinite(y)) ? { x:x, y:y, vx:h.vx, vy:h.vy } : p;
}
// Míč se veze s obrázkem držitele včetně natočení, takže dokud se klička nedostane přes
// zpoždění, obránce si myslí, že mu míč pořád utíká na starou stranu. Odebrání (main.js) i
// nárok pracují dál se skutečnou polohou — zpoždění je vjem, ne handicap na zákrok.
// Volný míč se nezpožďuje vůbec: zpožděné je pozorování HRÁČŮ, a volný míč není hráč.
export function perceivedBall(obs){
  var dr = stat(obs, 'defReact');
  if(!(dr > 0) || !ball.owner) return ball;
  var o = ball.owner;
  // Paměť míče začíná až tím, kdy ho tenhle hráč získal — před tím byl míč někde jinde,
  // takže by se dopočítával obrázek, který nikdy neexistoval.
  var age = Math.min(dr/1000, Math.max(0, S.time - ball.gained));
  var h = histAt(o, age), now = histAt(o, 0);
  if(!h.ok || !now.ok) return ball;                   // bez použitelné paměti se nic nepředstírá
  var d = h.age;                                      // skutečné stáří obrázku, ne požadované
  var px = h.x + h.vx*d, py = h.y + h.vy*d;           // kde by držitel byl, kdyby nic nezměnil
  // natočení ze skutečného směru běhu do toho vnímaného; míč se veze s celým obrázkem
  var c = 1, s = 0;
  var lo = Math.sqrt(h.vx*h.vx + h.vy*h.vy), ln = Math.sqrt(now.vx*now.vx + now.vy*now.vy);
  if(lo > 1e-6 && ln > 1e-6){
    var ux = h.vx/lo, uy = h.vy/lo, wx = now.vx/ln, wy = now.vy/ln;
    c = ux*wx + uy*wy; s = uy*wx - ux*wy;
  }
  var rx = ball.x - o.x, ry = ball.y - o.y;
  var q = { x: px + (c*rx - s*ry), y: py + (s*rx + c*ry),
            vx: c*ball.vx - s*ball.vy, vy: s*ball.vx + c*ball.vy };
  return isFinite(q.x) && isFinite(q.y) && isFinite(q.vx) && isFinite(q.vy) ? q : ball;
}

// ---- nárok a cuknutí pro zpracování ----
// Dosah zpracování míč NEZASTAVUJE, jen určuje, kdo si na něj sáhne. Stejný model konstantního
// zpomalení jako interceptSolve, ale hráč smí na cuknutí až lungeSpeed % své rychlosti a stačí
// mu doběhnout na CONTACT, ne na nulu. Neřešitelné = nenárokuje se (žádné teleporty).
// Ne „nejdřív dosažitelný bod" — ten vyjde vždycky přesně na strop a každé zpracování pak
// vypadá stejně. Hledá se bod, do kterého hráč dorazí PRÁVĚ VE CHVÍLI, kdy tam je míč, a to
// nejmenší možnou rychlostí: need(t) = vzdálenost k míči v čase t / t, minimum přes t.
// Vzdálenost se NEZMENŠUJE o CONTACT: s tím vycházela need = 0 pokaždé, když míč tak jako tak
// proletí kolem těla, hráč se vůbec nerozeběhl a mezi nárokem a dotykem stál — přesně ten
// zásek, kvůli kterému tahle verze vznikla. Přes celou vzdálenost je need nulová jen tehdy,
// když hráč na místě setkání opravdu už stojí.
// Cuknutí PŘEBÍRÁ řízení, jen když opravdu potřebuje hráčem hnout. Když míč tak jako tak
// míří na místo, kde hráč stojí, potřebná rychlost vyjde nula — a to není důvod hráče
// zmrazit. Pod touhle mezí si hráč řídí sám (člověk stickem, AI svým chováním) a míč k němu
// prostě dojede; to byl přesně ten zásek, kdy zpracování hráče na desetiny sekundy vyplo.
export const LUNGE_TAKEOVER = 0.15;     // podíl normální rychlosti, od kterého cuknutí řídí
export function lungeActive(p){
  return ball.claim === p && !ball.owner && (ball.lungeNeed || 0) > LUNGE_TAKEOVER*speedOf(p);
}
export function lungeSolve(p){
  var cap = speedOf(p)*stat(p, 'lungeSpeed')/100;
  var v0 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  var air = airborne();
  if(v0 < 0.001 && !air){               // ležící míč si prostě dojdi normální rychlostí
    var d0 = Math.max(0, dist(p, ball) - CONTACT);
    return { ok: true, x:ball.x, y:ball.y, t: d0/Math.max(1, speedOf(p)), need: speedOf(p) };
  }
  // Ve vzduchu se nárok počítá od DOPADU: hráč běží tam, kde míč dosedne, a dřív si na něj
  // stejně nesáhne. Když se mezitím odrazí, hledá se dál i po odrazech — tak vyjde, že nejlevnější
  // je počkat si na ten dopad, ke kterému to má nejblíž.
  var tStop = air ? ballRestT() : v0/T.friction, tMax = tStop + 0.5;
  var t0 = air ? Math.max(1/60, airLandingT()) : 1/60;
  var bestNeed = 1e9, bx = ball.x, by = ball.y, bt = tMax;
  for(var t=t0; t<=tMax; t+=1/60){
    var b = ballAtT(t, v0);
    var need = Math.max(0, dist(p, b) - CONTACT)/t;
    if(need < bestNeed){ bestNeed = need; bx = b.x; by = b.y; bt = t; }
  }
  return { ok: bestNeed <= cap, x:bx, y:by, t:bt, need:bestNeed };
}
// projde dráha míče vůbec dosahem zpracování toho hráče?
// Ve vzduchu se dráha bere až OD DOPADU: nad zemí je míč nedotknutelný, takže o nárok
// rozhoduje, kudy povede po zemi, ne kudy letí.
export function ballPathHits(p){
  var v0 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  if(airborne()){
    var a = ballAtT(airLandingT(), v0), b = ballAtT(ballRestT(), v0);
    return segDist(p.x, p.y, a.x, a.y, b.x, b.y) < pickupOf(p);
  }
  var e = ballAtT(v0/Math.max(1, T.friction), v0);
  return segDist(p.x, p.y, ball.x, ball.y, e.x, e.y) < pickupOf(p);
}
export function claimEligible(p){
  return !locked(p) && p !== ball.owner;
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
  // kolik cuknutí právě potřebuje — podle toho se pozná, jestli má přebrat řízení
  ball.lungeNeed = ball.claim ? lungeSolve(ball.claim).need : 0;
}
// Cuknutí: na spočítaný bod, rychlostí, jakou řešení vyžaduje, se stropem lungeSpeed.
// Bod se přepočítává každý snímek, takže jak míč zpomaluje, cíl se plynule posouvá.
export function lungeStep(dt){
  var p = ball.claim; if(!p || ball.owner) return;
  if(!lungeActive(p)) return;             // nic po něm nechceme → řídí se sám, nemrazíme ho
  // bod i rychlost se počítají znovu každý snímek, aby se sledovalo brzdění míče
  var s = lungeSolve(p);
  ball.claimX = s.x; ball.claimY = s.y;
  var dx = s.x - p.x, dy = s.y - p.y, d = Math.sqrt(dx*dx+dy*dy);
  var cap = speedOf(p)*stat(p, 'lungeSpeed')/100;
  // rychlost, při které dorazí PRÁVĚ s míčem, se stropem — ne rutinně strop
  var sp = Math.min(cap, s.need !== undefined ? s.need : cap);
  if(!(T.accelTime > 0)){
    var step = Math.min(sp*dt, d), x0 = p.x, y0 = p.y;
    if(d > 0.001){
      p.x += dx/d*step; p.y += dy/d*step;
      if(d > 6){ p.fx = dx/d; p.fy = dy/d; }
    }
    clampField(p);
    var full = speedOf(p)*dt, ax = p.x-x0, ay = p.y-y0;
    p.sf = full > 0 ? Math.min(1, Math.sqrt(ax*ax + ay*ay)/full) : 0;
    p.vx = ax/dt; p.vy = ay/dt;
  } else if(d > 0.001){
    // Cuknutí se běží SKRZ, ne do zastavení. lungeSolve minimalizuje POTŘEBNOU rychlost, takže
    // na míč běžící do prostoru je nejlevnější řešení zpomalit a počkat si — dřív to nic
    // nestálo, se setrvačností je ale nízký povel aktivní brzda a zpátky na plnou to stojí celý
    // accelTime. Naměřeno: 69 % cuknutí poroučelo pomaleji, než hráč běžel, medián 0,43 jeho
    // rychlosti. Cuknutí proto smí rychlost jen PŘIDAT nebo změnit směr, nikdy ubrat.
    // Ořez na d/dt tu taky nemá co dělat: to je dojezd, a bod setkání se hýbe.
    var cur = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
    driveMove(p, dx/d, dy/d, Math.max(sp, cur), dt);
  }
}

export function pickChaser(list){
  var best = null, bestT = 1e18;
  for(var i=0;i<list.length;i++){
    var p = list[i];
    if(p.role === 'gk') continue;
    if(locked(p)) continue;
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
  if(!c || c.role === 'gk' || list.indexOf(c) < 0 || locked(c)){
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
    if(locked(p)) continue;
    var dx = p.x - qx, dy = p.y - qy, d = Math.sqrt(dx*dx+dy*dy);
    if(d < bd){ bd = d; best = p; }
  }
  return best;
}

// ---- odehrání ----
// kickPlan bydlí tady, ne v ai-ball.js: potřebuje ho i keeper.js a jinak by vznikl kruh
// `p` je ten, kdo kope — nepřesnost i dojezdová rychlost jsou jeho hodnocení `passing`
export function kickPlan(p, dx, dy, speed){
  var err = stat(p, 'foeError') * Math.PI/180;
  var a = Math.atan2(dy, dx) + (Math.random()*2-1)*err;   // nepřesnost = chyba v mušce
  return { kick:true, x:Math.cos(a), y:Math.sin(a), speed:speed };
}
// rychlost, aby přihrávka dorazila do cíle ještě s aiArrive, ne aby cíl přestřelila
export function speedForDistance(p, d){
  var ar = stat(p, 'aiArrive');
  var v = Math.sqrt(ar*ar + 2*T.friction*d);
  return Math.max(T.passSpeed*(T.passMin/100), Math.min(T.passSpeed, v));
}

// `by` = hráč, jehož nepřesnost se má na směr teprve uplatnit. Plán AI si ji nese už
// z kickPlan (nabíjí se v okamžiku rozhodnutí), lidská přihrávka ji dostává AŽ TADY, když
// míč doopravdy odlétá — zelená linka tak dál ukazuje, kam se mířilo, a chybu dopředu
// nevidíš. Při nulové nepřesnosti se ani nelosuje, aby se nehnul proud náhod.
// `air` = odehrát obloukem. Kop rychlostí v se rozloží podle liftAngle na vodorovnou složku
// v*cos a svislou v*sin (odvození dostřelu je u airRange výš), takže se silou přihrávky mění
// dolet stejně jako u pozemní. Přízemní přihrávka výšku i svislou rychlost výslovně nuluje —
// míč u nohy je vždycky na zemi, takže se tím nic nemění, jen se to nedá rozbít jinudy.
export function doPass(dx, dy, speed, by, air){
  var d = Math.sqrt(dx*dx+dy*dy); if(d < .001) return;
  if(by){
    var err = stat(by, 'foeError') * Math.PI/180;
    if(err > 0){
      var ang = Math.atan2(dy, dx) + (Math.random()*2-1)*err;
      dx = Math.cos(ang); dy = Math.sin(ang); d = 1;
    }
  }
  var v = speed || T.passSpeed;            // AI zatím kope pořád naplno
  var carrier = ball.owner;
  ball.held = false;                             // přihrávka končí cyklus, rychlost dá kop níž
  ball.owner = null;
  // míč se odehrává z místa, kde reálně leží — nikam se neteleportuje
  if(air){
    var a = T.liftAngle*Math.PI/180;
    ball.vx = dx/d*v*Math.cos(a); ball.vy = dy/d*v*Math.cos(a);
    ball.z = 0; ball.vz = v*Math.sin(a);
  } else {
    ball.vx = dx/d*v; ball.vy = dy/d*v;
    ball.z = 0; ball.vz = 0;
  }
  ball.airLand = 0;
  S.lockedPlayer = carrier; S.lockOut = 0.32; S.lastTeam = carrier.team;
  pickChasers();                        // změna držení → nový závazek, kdo si pro míč jde
  // ovládání zůstává na přihrávajícím, dokud míč někdo nepřevezme
  if(carrier.team === 'b' && carrier.role !== 'gk') S.ctrl = carrier;
}
