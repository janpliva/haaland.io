// Vykreslení. Čte stav, nic nemění.
import { T, FIELD_W, FIELD_H, PH, BALL_R, GOAL_DEPTH } from './config.js';
import { S, E, ball, ctx, joyBase, touch, hooks } from './state.js';
import { pickupOf, boxW, boxD, rollDist, airApex } from './util.js';

// ---- kamera ----
// AXONOMETRIE, ne perspektiva. Svět (x, y, z) se promítá na obrazovku jako
//     sx = x
//     sy = y*cos(náklon) − z*sin(náklon)
// a teprve tohle se jedním měřítkem posadí do viewportu. Nic se nezmenšuje podle vzdálenosti:
// dva stejní hráči na opačných koncích hřiště jsou na obrazovce stejně velcí. Je to naklopení
// pohledu shora, ne kamera za zády hráče.
//
// Při camTilt 0 je cos 1 a sin 0, takže z ze vzorce vypadne a zbude přesně ten průmět, co tu
// byl dřív. To je KONTROLA: co při nule vypadá jinak než dřív, je chyba.
//
// Hřiště má pevné rozměry (config.js), takže základní měřítko je jen „nafitnout je do
// viewportu": menší z obou poměrů, takže se obraz nikdy neroztáhne — co nesedí, zbude jako
// pruh nad a pod hřištěm (nebo po stranách) a do něj se kreslí tribuna. Přiblížení (camZoom)
// tenhle fit násobí a sledování míče posouvá střed pohledu po DÉLCE hřiště.
//
// KAMERA SE HÝBE JEN PO OSE Y. Vodorovně zůstává napořád na středu hřiště: ox se počítá ze
// šířky a z ničeho jiného. Nad camZoom 100 se proto do obrazu nevejde celá šířka a kraje se
// oříznou — je to daň za přiblížení bez vodorovného panování a je vidět v měřeních v PR.
//
// Stav kamery je `p`: promítnutá souřadnice, která leží ve SVISLÉM STŘEDU obrazovky.
// PY pak není nic jiného než „o kolik je tenhle bod od středu pohledu".
const LOOK_T = 1.0;        // camLookAhead 100 % = o vteřinu pohybu míče dopředu
const EDGE_PAD = 140;      // kolik světa za brankovou čárou smí kamera ještě ukázat (ochoz + kus tribuny)
// Vystaveno jen KE ČTENÍ (měření a kontrola v PR). Nikdo mimo render.js do kamery nesahá
// a nikdo se jí na nic neptá — simulace o ní neví.
export const cam = { cos:1, sin:0, k:1, ox:0, oy:0, p:0, tp:0, clamped:false, ready:false };

// Kam by se kamera dívala, kdyby nesledovala nic: přesně ten pevný pohled na celé hřiště,
// co tu byl dřív. Odvozeno z původního výrazu pro oy, takže camZoom 100 + camFollow 0 dá
// tentýž obraz — to je kontrola.
function camHome(){ return (FIELD_H*cam.cos - T.goalH*cam.sin)/2; }

function camUpdate(dt){
  var a = T.camTilt*Math.PI/180;
  cam.cos = Math.cos(a); cam.sin = Math.sin(a);
  // Do obálky patří i horní branka: břevno trčí nad brankovou čáru o goalH*sin, a kdyby se
  // fitovalo jen hřiště, při malém náklonu by z obrazu vylezlo.
  var h = FIELD_H*cam.cos + T.goalH*cam.sin;
  cam.k = Math.min(S.cssW/FIELD_W, S.cssH/Math.max(1, h)) * (T.camZoom/100);
  cam.ox = (S.cssW - FIELD_W*cam.k)/2;

  // --- kam se dívat ---
  // Cíl je POZEMNÍ poloha míče: z se schválně ignoruje, jinak by kamera při každém lobu
  // poskočila za letícím míčem. K tomu předvídání: kus rychlosti míče po ose y, takže se
  // kamera vydá tam, kam hra teprve míří, místo aby ji dobíhala.
  var home = camHome();
  var lead = ball.vy * (T.camLookAhead/100) * LOOK_T;
  var want = home + ((ball.y + lead)*cam.cos - home) * (T.camFollow/100);
  if(S.screen !== 'game') want = home;          // v menu se nesleduje nic

  // --- doraz na koncích hřiště ---
  // Kamera nesmí vyjet za brankovou čáru do prázdna. Horní mez počítá i s rámem branky
  // (břevno trčí nad čáru o goalH*sin), takže na kraji je vždycky vidět celá branka a za ní
  // kus ochozu a tribuny. Ta nesymetrie je zároveň to, co drží degenerovaný případ přesně na
  // původním pohledu: když je okno větší než hřiště i s dorazy, střed vyjde na camHome().
  var half = (S.cssH/2)/cam.k;
  var lo = half - (T.goalH*cam.sin + EDGE_PAD*cam.cos);
  var hi = FIELD_H*cam.cos + EDGE_PAD*cam.cos - half;
  var free = want;
  if(lo > hi) want = home;                      // celé hřiště se vejde → pevná kamera jako dřív
  else want = Math.max(lo, Math.min(hi, want));
  cam.clamped = (want !== free);                // sedí na dorazu — jen na čtení, na měření

  // --- plynulost ---
  // Exponenciální dojezd, ale ne „lerp o pevný podíl za snímek": to by při kolísavém dt jelo
  // pokaždé jinak rychle. Tohle je PŘESNÉ řešení p' = (cíl − p)/tau za čas dt, takže výsledek
  // na délce snímku nezávisí. Rychlost je vždycky úměrná zbývající odchylce a s ní jde k nule,
  // takže se cíl nedá přejet ani jednou — přeběh je nula z konstrukce, ne z ladění.
  // Pružina druhého řádu (SmoothDamp) by byla hladší v derivaci, ale ta si nese setrvačnost a
  // brzdící cíl umí přejet; zadání říká, že přeběh musí být nula, tak vyhrává tenhle.
  cam.tp = want;
  if(!cam.ready){ cam.p = want; cam.ready = true; }        // výkop: bez rozjezdu, rovnou tam
  else if(dt > 0) cam.p += (want - cam.p) * (1 - Math.exp(-dt/(Math.max(1, T.camSmooth)/1000)));

  cam.oy = S.cssH/2 - cam.p*cam.k;
}
// Rozestavení (výkop, gól, nový zápas, reset z panelu) kameru NEPŘEJÍŽDÍ, ale střihne: míč se
// teleportoval na střed, takže plynulý přejezd by byl jen zpožděná lež o tom, kde se hraje —
// a při camSmooth 1500 by se navíc nestihl doklouzat, než se rozehraje. Volá se to hákem ze
// state.reset(), stejně jako pickChasers, aby importy zůstaly jednosměrné.
export function camSnap(){ cam.ready = false; }
hooks.camSnap = camSnap;
// Délka (poloměr, šířka) → css px. Bod → PX/PY. JINUDY se do obrazovky nepřevádí nic:
// veškerá projekce je v těchhle třech funkcích, ne rozsypaná po souboru.
export function X(v){ return v*cam.k; }
function PX(x){ return cam.ox + x*cam.k; }
function PY(y, z){ return cam.oy + (y*cam.cos - (z||0)*cam.sin)*cam.k; }
// Umí ta kamera vůbec ukázat výšku? Při nulovém náklonu ne — svislý rozměr se promítne do
// nuly. Značky, které výšku ZNÁZORŇUJÍ (oblouk míření, oblouček nad hlavou), se pak kreslí
// tak, jak se kreslily v čistém pohledu shora; kdykoliv je náklon nenulový, kreslí se
// doopravdy do výšky. Skutečné objekty (míč, hráči, branka) tuhle větev nemají — ty se
// promítají vždycky stejným vzorcem a při nule prostě splasknou.
function flat(){ return !(T.camTilt > 0); }

// obdélník ležící na trávě
function gFill(x0, y0, x1, y1){
  var a = PY(y0, 0);
  ctx.fillRect(PX(x0), a, X(x1-x0), PY(y1, 0) - a);
}
function gStroke(x0, y0, x1, y1){
  var a = PY(y0, 0);
  ctx.strokeRect(PX(x0), a, X(x1-x0), PY(y1, 0) - a);
}
// kruh ležící na trávě → elipsa
function gEllipse(x, y, r){
  ctx.beginPath();
  ctx.ellipse(PX(x), PY(y, 0), X(r), X(r)*cam.cos, 0, 0, Math.PI*2);
}
// tmavší odstín téže barvy pro boční stěnu kvádru; výsledek se cachuje, ať se parseInt
// nedělá dvanáctkrát za snímek
const SHADES = {};
function shade(hex, f){
  var key = hex + '|' + f, v = SHADES[key];
  if(v) return v;
  var n = parseInt(hex.slice(1), 16);
  return (SHADES[key] = 'rgb(' + Math.round(((n>>16)&255)*f) + ',' +
                        Math.round(((n>>8)&255)*f) + ',' + Math.round((n&255)*f) + ')');
}

// ---- výška v pohledu shora ----
// Výška se čte ze DVOU věcí naráz: míč se kreslí o `z` výš, než doopravdy je, a na jeho
// skutečném místě zůstane stín. Mezera mezi míčem a stínem je ten údaj — samotný posunutý míč
// by se nedal odlišit od míče, který prostě letí jinam. S nakloněnou kamerou k tomu přibyl
// druhý zdroj (svislý posun je teď opravdu vidět), ale stín zůstává, protože při malém náklonu
// je posun malý.
const AIR = { grow: 0.5, growAt: 500,     // míč roste s výškou (jako by byl blíž kameře), se stropem
              fade: 0.8, fadeAt: 300,     // stín slábne...
              tiny: 0.55, tinyAt: 420 };  // ...a zmenšuje se
function shadowAlpha(z){ return 0.30 * (1 - Math.min(AIR.fade, z/AIR.fadeAt)); }
function shadowScale(z){ return 1 - Math.min(AIR.tiny, z/AIR.tinyAt); }
function ballScale(z){ return 1 + Math.min(AIR.grow, z/AIR.growAt); }
const ORANGE = 'rgba(251,146,60,';        // vzdušný režim — nikdy stejná barva jako přízemní

// Oblouk míření jako lomená čára: přímka od hráče, každý bod vyklenutý o výšku paraboly
// (4*apex*u*(1-u), tedy skutečný vrchol letu).
//
// S NÁKLONEM se klene do VÝŠKY, tedy pravdivě: kamera výšku ukázat umí, takže není důvod ji
// překreslovat jinam. Při náklonu 0 se do výšky klenout nedá — v pohledu přesně shora míří
// výška i směr na obrazovce týmž směrem a oblouk by zdegeneroval do úsečky, a přesně na
// soupeřovu branku (tedy „nahoru") se lobuje nejčastěji. Tam proto zůstává původní KOLMÝ
// průhyb: značka, stejně jako je značka délka linky (33 % doletu).
function arcPath(ax, ay, dx, dy, len, apex){
  var px = -dy, py = dx;
  if(py > 0 || (py === 0 && px < 0)){ px = -px; py = -py; }
  var side = flat();
  var u0 = Math.min(0.9, (BALL_R+6)/Math.max(1, len));
  ctx.beginPath();
  for(var i=0;i<=16;i++){
    var u = u0 + (1-u0)*(i/16), h = 4*apex*u*(1-u);
    var qx = ax + dx*len*u, qy = ay + dy*len*u, qz = 0;
    if(side){ qx += px*h; qy += py*h; } else qz = h;
    if(i === 0) ctx.moveTo(PX(qx), PY(qy, qz)); else ctx.lineTo(PX(qx), PY(qy, qz));
  }
  ctx.stroke();
}

// ---- stadion ----
// Kulisa, nic víc: čtyři ploché tribuny stoupající od hřiště ven, jednolitá barva, žádný dav,
// žádná animace, žádné textury. Existují proto, aby prostor, který náklon nad a pod hřištěm
// otevře, nebyl prázdný. Rozměry jsou konstanty tady v souboru, ne posuvníky: na hru nemají
// vliv a v panelu by byly jen šum. Podmínka depth*cos > h*sin drží zadní hranu bližní tribuny
// pod hřištěm i při největším náklonu, takže se nikdy nepřeklopí přes hrací plochu.
const STAND = { gap:40, depth:560, h:250, rows:4 };
const STAND_FILL = '#1b2532', STAND_SIDE = '#161e29', STAND_LINE = 'rgba(255,255,255,0.07)';
const STAND_WALL = 'rgba(255,255,255,0.13)';

function standNS(yIn, yOut){                       // tribuna za brankou: vodorovný pruh
  var x0 = PX(-(STAND.gap+STAND.depth)), x1 = PX(FIELD_W+STAND.gap+STAND.depth);
  var a = PY(yIn, 0), b = PY(yOut, STAND.h);
  ctx.fillStyle = STAND_FILL;
  ctx.fillRect(x0, Math.min(a, b), x1-x0, Math.abs(b-a));
  ctx.strokeStyle = STAND_LINE; ctx.lineWidth = 1;
  ctx.beginPath();
  for(var r=1;r<STAND.rows;r++){
    var t = r/STAND.rows, y = PY(yIn + (yOut-yIn)*t, STAND.h*t);
    ctx.moveTo(x0, y); ctx.lineTo(x1, y);
  }
  ctx.stroke();
  ctx.strokeStyle = STAND_WALL; ctx.lineWidth = 2;   // mantinel u hrací plochy
  ctx.beginPath(); ctx.moveTo(x0, a); ctx.lineTo(x1, a); ctx.stroke();
}
function standEW(xIn, xOut){                       // tribuna podél lajny: výška ji posune svisle
  var y0 = -(STAND.gap+STAND.depth), y1 = FIELD_H+STAND.gap+STAND.depth;
  ctx.fillStyle = STAND_SIDE;
  ctx.beginPath();
  ctx.moveTo(PX(xIn), PY(y0, 0));       ctx.lineTo(PX(xIn), PY(y1, 0));
  ctx.lineTo(PX(xOut), PY(y1, STAND.h)); ctx.lineTo(PX(xOut), PY(y0, STAND.h));
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = STAND_LINE; ctx.lineWidth = 1;
  ctx.beginPath();
  for(var r=1;r<STAND.rows;r++){
    var t = r/STAND.rows, x = PX(xIn + (xOut-xIn)*t), z = STAND.h*t;
    ctx.moveTo(x, PY(y0, z)); ctx.lineTo(x, PY(y1, z));
  }
  ctx.stroke();
  ctx.strokeStyle = STAND_WALL; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PX(xIn), PY(y0, 0)); ctx.lineTo(PX(xIn), PY(y1, 0)); ctx.stroke();
}
function stands(){
  standNS(-STAND.gap, -(STAND.gap+STAND.depth));                  // za soupeřovou brankou
  standEW(-STAND.gap, -(STAND.gap+STAND.depth));                  // levá lajna
  standEW(FIELD_W+STAND.gap, FIELD_W+STAND.gap+STAND.depth);      // pravá lajna
  standNS(FIELD_H+STAND.gap, FIELD_H+STAND.gap+STAND.depth);      // za mojí brankou
}

// ---- hřiště ----
function pitch(){
  ctx.fillStyle = '#1d4d34';
  gFill(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.022)';
  for(var s=0;s<10;s+=2) gFill(0, s*FIELD_H/10, FIELD_W, (s+1)*FIELD_H/10);

  // čáry
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
  gStroke(10, 10, FIELD_W-10, FIELD_H-10);
  ctx.beginPath();
  ctx.moveTo(PX(10), PY(FIELD_H/2, 0)); ctx.lineTo(PX(FIELD_W-10), PY(FIELD_H/2, 0));
  ctx.stroke();
  gEllipse(FIELD_W/2, FIELD_H/2, 75);
  ctx.stroke();

  // brankoviště: horní je soupeřovo (útočíš nahoru), dolní tvoje
  var gxa = (FIELD_W - T.goalW)/2, gxb = (FIELD_W + T.goalW)/2;
  ctx.fillStyle = 'rgba(252,165,165,0.10)';
  gFill(gxa, 0, gxb, GOAL_DEPTH);
  ctx.fillStyle = 'rgba(147,197,253,0.10)';
  gFill(gxa, FIELD_H-GOAL_DEPTH, gxb, FIELD_H);
  // vápna — cíl náběhů a hranice, od které se centruje
  var bw = boxW(), bd = boxD();
  ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 2;
  gStroke(FIELD_W/2 - bw/2, 0, FIELD_W/2 + bw/2, bd);
  gStroke(FIELD_W/2 - bw/2, FIELD_H-bd, FIELD_W/2 + bw/2, FIELD_H);

  // brankové čáry tam, kde je má fyzika, a značky tyčí na trávě: rám se při malém náklonu
  // skoro nezvedne, takže ústí branky musí být poznat i z čar
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(252,165,165,0.9)';
  ctx.beginPath(); ctx.moveTo(PX(gxa), PY(BALL_R, 0)); ctx.lineTo(PX(gxb), PY(BALL_R, 0)); ctx.stroke();
  ctx.strokeStyle = 'rgba(147,197,253,0.9)';
  ctx.beginPath();
  ctx.moveTo(PX(gxa), PY(FIELD_H-BALL_R, 0)); ctx.lineTo(PX(gxb), PY(FIELD_H-BALL_R, 0));
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for(var gp=0; gp<2; gp++){
    var px3 = gp ? gxb : gxa;
    ctx.fillRect(PX(px3)-2, PY(0, 0), 4, PY(26, 0)-PY(0, 0));
    ctx.fillRect(PX(px3)-2, PY(FIELD_H-26, 0), 4, PY(FIELD_H, 0)-PY(FIELD_H-26, 0));
  }
}

// ---- branka jako rám ----
// Dvě tyče, břevno a náznak sítě. Přesně tenhle rám je i ve fyzice (main.js): gól platí mezi
// tyčemi a pod břevnem, všechno ostatní je mantinel. Při náklonu 0 mají tyče i břevno nulovou
// výšku a splynou s brankovou čárou — shora se výška branky ukázat nedá.
function goalFrame(team){
  var top = team === 'r';
  var gy = top ? BALL_R : FIELD_H - BALL_R;        // brankové čára, jak ji vidí fyzika
  var dir = top ? -1 : 1;                          // ven z hřiště
  var gxa = (FIELD_W - T.goalW)/2, gxb = (FIELD_W + T.goalW)/2;
  var H = T.goalH, back = gy + dir*GOAL_DEPTH, hb = H*0.62;
  // Rám nese barvu své branky, ne bílou: při náklonu 0 splyne s brankovou čárou, a ta je
  // červená nahoře a modrá dole. Bílý rám by tu čáru přebarvil a pohled shora by se změnil.
  var col = top ? '252,165,165' : '147,197,253';

  ctx.strokeStyle = 'rgba(' + col + ',0.28)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for(var i=0;i<=4;i++){                            // svislice sítě v zadní rovině
    var x = gxa + (gxb-gxa)*(i/4);
    ctx.moveTo(PX(x), PY(back, 0)); ctx.lineTo(PX(x), PY(back, hb));
  }
  for(var j=1;j<=2;j++){                            // a dvě vodorovné
    var z = hb*(j/3);
    ctx.moveTo(PX(gxa), PY(back, z)); ctx.lineTo(PX(gxb), PY(back, z));
  }
  ctx.moveTo(PX(gxa), PY(back, 0));  ctx.lineTo(PX(gxb), PY(back, 0));
  ctx.moveTo(PX(gxa), PY(back, hb)); ctx.lineTo(PX(gxb), PY(back, hb));
  ctx.moveTo(PX(gxa), PY(gy, H));    ctx.lineTo(PX(gxa), PY(back, hb));   // strop sítě
  ctx.moveTo(PX(gxb), PY(gy, H));    ctx.lineTo(PX(gxb), PY(back, hb));
  ctx.stroke();

  ctx.strokeStyle = 'rgba(' + col + ',0.95)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(PX(gxa), PY(gy, 0)); ctx.lineTo(PX(gxa), PY(gy, H));         // tyč
  ctx.moveTo(PX(gxb), PY(gy, 0)); ctx.lineTo(PX(gxb), PY(gy, H));         // tyč
  ctx.moveTo(PX(gxa), PY(gy, H)); ctx.lineTo(PX(gxb), PY(gy, H));         // břevno
  ctx.stroke();
  ctx.lineCap = 'butt';
}

// ---- hráč jako kvádr ----
// V tomhle průmětu se x nezkresluje vůbec, takže boční stěny mají nulovou šířku a vidět je
// HORNÍ stěna a PŘEDNÍ, ta bližší kameře. Přední je tmavší, aby se hrana četla i bez obrysu.
// Při playerH 0 (nebo náklonu 0) je z kvádru zase plochý čtverec, přesně jako dřív.
function drawPlayer(p){
  var isCtrl = (p === S.ctrl);
  var hw = p.role === 'gk' ? PH*1.6 : PH;          // brankář je širší než vysoký
  var H = T.playerH;

  // dosah zpracování leží na trávě, takže z kruhu je elipsa
  // brankář žádný nemá — chytá tělem, ať to nevypadá jako dosah
  var pr = pickupOf(p);
  if(pr > 0 && p.role !== 'gk'){
    gEllipse(p.x, p.y, pr);
    ctx.strokeStyle = p.team === 'b' ? 'rgba(147,197,253,0.32)' : 'rgba(252,165,165,0.30)';
    ctx.lineWidth = 1.5; ctx.stroke();
  }

  var col = p.role === 'gk' ? (p.team === 'b' ? '#a3e635' : '#f59e0b')
          : (p.team === 'b' ? (isCtrl ? '#60a5fa' : '#2563eb') : '#ef4444');
  var L = PX(p.x-hw), W = X(hw*2);
  var yFar = PY(p.y-PH, H), yNear = PY(p.y+PH, H), yFoot = PY(p.y+PH, 0);
  ctx.fillStyle = shade(col, 0.55);
  ctx.fillRect(L, yNear, W, yFoot-yNear);          // přední stěna
  ctx.fillStyle = col;
  ctx.fillRect(L, yFar, W, yNear-yFar);            // horní stěna
  if(p === ball.owner){                            // kdo má míč
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    ctx.strokeRect(L, yFar, W, yFoot-yFar);
  }

  // Číslo na dresu leží NA HORNÍ STĚNĚ, takže se s ní i stlačí — stejně jako čáry na trávě.
  // Brankář místo čísla dostane tečku, ať je poznat i bez barvy. Čistě vykreslení — simulace
  // `num` nikde nečte. Číslice vyplní skoro celý čtverec (na 375 px je hráč jen 9,4 css px
  // široký) a dostane tmavý obrys, aby držela proti modré i červené výplni.
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(PX(p.x), PY(p.y, H));
  ctx.scale(1, cam.cos);
  if(p.role === 'gk'){
    ctx.beginPath(); ctx.arc(0, 0, X(PH*0.34), 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
  } else {
    ctx.font = '700 ' + X(PH*2.0).toFixed(1) + 'px system-ui, sans-serif';
    ctx.lineWidth = Math.max(1, X(2.2)); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(String(p.num), 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(p.num), 0, 0);
  }
  ctx.restore();

  // Ovládaný hráč: kroužek, ne výplň, a ve výšce horní stěny — na zemi u nohou by ho vlastní
  // tělo zakrylo skoro celý (poloměr 18 proti půlce těla 15). Při náklonu 0 vyjde přesně ten
  // kroužek, co tu byl dřív. Vyplněný kotouč to být nesmí: pohltil by míč u nohy.
  if(isCtrl){
    ctx.beginPath();
    ctx.ellipse(PX(p.x), PY(p.y, H), X(PH*1.2), X(PH*1.2)*cam.cos, 0, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
  }
  // Směr. Začíná až NA HRANĚ těla, ne ve středu: dřív vedl přes celý čtverec a přeškrtával
  // číslo na dresu. Jako čumák trčící ven čte směr stejně a číslici nechá být.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PX(p.x + p.fx*hw*1.1),  PY(p.y + p.fy*PH*1.1, H));
  ctx.lineTo(PX(p.x + p.fx*hw*1.95), PY(p.y + p.fy*PH*1.95, H));
  ctx.stroke();
}

// ---- míč ----
// Koule sedí NA zemi, takže její střed je o poloměr výš. Při náklonu 0 z výšky do svislé osy
// nepřejde nic a vyjde přesně původní kolečko. Kruh dosahu odebrání se kreslí jen na zemi:
// na míč ve vzduchu si nikdo sáhnout nemůže a chybějící kruh je ta informace.
function drawBall(){
  var bz = Math.max(0, ball.z);
  var bR = X(BALL_R*ballScale(bz));
  var cx = PX(ball.x), cy = PY(ball.y, bz + BALL_R);
  ctx.beginPath(); ctx.arc(cx, cy, bR, 0, Math.PI*2);
  ctx.fillStyle = '#fde047'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx - bR*0.30, cy - bR*0.32, bR*0.40, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();      // odlesk: z kolečka je koule
  if(bz <= 0){
    gEllipse(ball.x, ball.y, T.tackleR);
    ctx.strokeStyle = 'rgba(253,224,71,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

export function draw(dt){
  camUpdate(dt || 0);
  ctx.clearRect(0,0,S.cssW,S.cssH);

  // okolí stadionu; tráva se pak kreslí jen na hřiště
  ctx.fillStyle = '#0c131b';
  ctx.fillRect(0,0,S.cssW,S.cssH);
  stands();
  pitch();

  // Stín míče. Kreslí se VŽDYCKY a POD VŠÍM ostatním, na skutečném místě míče na hřišti —
  // pořád je to ta věc, která výšku prozradí nejdřív, takže nesmí zmizet ani pod hráčem.
  var bz = Math.max(0, ball.z);
  var shR = BALL_R*shadowScale(bz);
  ctx.beginPath();
  ctx.ellipse(PX(ball.x), PY(ball.y, 0), X(shR), X(shR*0.6)*cam.cos, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,' + shadowAlpha(bz).toFixed(3) + ')';
  ctx.fill();

  // ---- řazení podle hloubky ----
  // Kreslí se od nejvzdálenějšího (malé y) k nejbližšímu (velké y), takže bližší věc překryje
  // vzdálenější. Klíč je SVĚTOVÉ y, ne obrazovkové: výška do řazení mluvit nesmí, jinak by
  // vysoká věc přeskočila dopředu.
  var items = [];
  for(var i=0;i<E.all.length;i++) items.push({ d:E.all[i].y, p:E.all[i] });
  items.push({ d:0, g:'r' });                     // soupeřova branka je nejdál
  items.push({ d:FIELD_H, g:'b' });               // moje je nejblíž
  // Míč ve vzduchu se nesetřídí — letí nad vším a kreslí se až úplně nakonec. Na zemi se
  // třídí normálně, ale DRŽITEL si ho nikdy nezakryje: při driblinku dopředu leží míč dál od
  // kamery než hráč, takže by mu zmizel za tělem. Klíč se proto u drženého míče podstrčí
  // těsně za držitele — kdokoliv bližší ho zakryje dál.
  var flying = ball.z > 0;
  if(!flying) items.push({ d: ball.owner ? Math.max(ball.y, ball.owner.y + 0.001) : ball.y, b:true });
  items.sort(function(a,b){ return a.d - b.d; });
  for(var q=0;q<items.length;q++){
    var it = items[q];
    if(it.p) drawPlayer(it.p);
    else if(it.b) drawBall();
    else goalFrame(it.g);
  }

  // Vzdušný režim je NABITÝ: malý oranžový oblouček nad hlavou držitele. Musí být vidět i bez
  // nabíjení přihrávky — jinak se režim, který se přepíná zvednutím prstu, nedá zjistit jinak
  // než tím, že se odehraje a člověk uvidí, co z toho vyletí.
  if(S.airMode && S.airBy && ball.owner === S.airBy){
    var ap = S.airBy;
    ctx.strokeStyle = ORANGE + '0.95)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    for(var ai=0; ai<=10; ai++){
      var au = ai/10, bow = 4*PH*0.85*au*(1-au);
      var apx = ap.x + (au-0.5)*PH*2.8, apy, apz;
      // Shora se „nad hlavou" dá jen naznačit posunem po obrazovce (a musí to být až nad
      // míčem u nohy, jinak by značka splynula s ním). S náklonem je nad hlavou doopravdy.
      if(flat()){ apy = ap.y - PH*3.0 - bow; apz = 0; }
      else { apy = ap.y; apz = T.playerH + PH*1.4 + bow; }
      if(ai === 0) ctx.moveTo(PX(apx), PY(apy, apz)); else ctx.lineTo(PX(apx), PY(apy, apz));
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // Kdo míč podle nároku zpracuje jako první: prstenec, ať je vidět, komu se to nabíjí.
  // Kreslí se, kdykoliv jde jednodotyková přihrávka zahrát — tedy i před natažením prstu,
  // jinak by se mířilo naslepo.
  if(S.recv){
    gEllipse(S.recv.x, S.recv.y, PH*1.7);
    ctx.strokeStyle = ball.pending ? 'rgba(74,222,128,0.95)' : 'rgba(250,204,21,0.8)';
    ctx.lineWidth = 3; ctx.setLineDash([X(7), X(7)]); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Obě linky vycházejí z HRÁČE, ne z míče: ukazují směr, kterým se odehraje, a u letícího
  // míče je hráč jediný smysluplný počátek. Přihrávka sama pořád odlétá z místa míče, takže
  // se linka a skutečný start o kus liší — je to ukazatel směru, ne trajektorie.
  //
  // Kreslí se ve SVĚTOVÝCH souřadnicích a promítá jako všechno ostatní, takže na obrazovce
  // NESVÍRÁ stejný úhel jako tah palcem (vstup se schválně nezpětně nepromítá). Linka říká
  // pravdu o tom, kudy míč poletí; palec je jen povel.
  var af = S.aimFrom;

  // nachystaná přihrávka: čeká na dotek. Jinou barvou než nabíjení, ať je vidět, že je
  // natažená a čeká — hráč se musí umět rozhodnout, jestli čekat, nebo pustit prst znovu.
  // Vzdušná se kreslí jako oblouk, aby se pořád poznalo, co je nachystané.
  if(ball.pending && af){
    var qp = ball.pending, qL = rollDist(qp.speed) * (T.aimLen/100);
    ctx.strokeStyle = 'rgba(74,222,128,0.95)'; ctx.lineWidth = 3;
    ctx.setLineDash([X(5), X(11)]);
    if(qp.air) arcPath(af.x, af.y, qp.x, qp.y, qL, airApex(qp.speed));
    else {
      ctx.beginPath();
      ctx.moveTo(PX(af.x + qp.x*(BALL_R+6)), PY(af.y + qp.y*(BALL_R+6), 0));
      ctx.lineTo(PX(af.x + qp.x*qL), PY(af.y + qp.y*qL, 0));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // šipka míření. Ve vzdušném režimu ORANŽOVÝ OBLOUK, ne žlutá přímka — dvě různé věci se
  // nesmí dát splést, a tvar dráhy má být vidět dřív, než se prst zvedne.
  if(S.drawAim && af){
    var ax = af.x, ay = af.y, L = S.drawAim.len;
    ctx.lineWidth = 3;
    if(S.drawAim.air){
      ctx.strokeStyle = ORANGE + '0.95)';
      ctx.setLineDash([X(9), X(9)]);
      arcPath(ax, ay, S.drawAim.x, S.drawAim.y, L, S.drawAim.apex);
    } else {
      ctx.strokeStyle = 'rgba(250,204,21,0.85)';
      ctx.setLineDash([X(9), X(9)]);
      ctx.beginPath();
      ctx.moveTo(PX(ax + S.drawAim.x*(BALL_R+6)), PY(ay + S.drawAim.y*(BALL_R+6), 0));
      ctx.lineTo(PX(ax + S.drawAim.x*L), PY(ay + S.drawAim.y*L, 0));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  if(flying) drawBall();          // ve vzduchu je míč nad vším, včetně hráčů

  // ---- joystick ----
  // Kreslí se v css px, ne ve světě: je to ovládací prvek, ne věc na hřišti. Naklonění kamery
  // se ho proto netýká vůbec.
  var jr = T.joyR, th = jr*(T.passThresh/100);
  var tdx = 0, tdy = 0, td = 0, charged = false;
  if(touch.active){
    tdx = touch.x - joyBase.x; tdy = touch.y - joyBase.y;
    td = Math.sqrt(tdx*tdx+tdy*tdy);
    charged = td > th && !!S.aimFrom;             // přihrávka nabitá, čeká na zvednutí prstu
  }
  ctx.beginPath(); ctx.arc(joyBase.x, joyBase.y, jr, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 2; ctx.stroke();
  // Prstenec prahu přihrávky — plný, když je nabito. Ve vzdušném režimu ORANŽOVÝ, i když se
  // nenabíjí: druhá půlka trvalého ukazatele režimu, tentokrát přímo pod palcem.
  var jc = S.airMode ? ORANGE : 'rgba(250,204,21,';
  ctx.beginPath(); ctx.arc(joyBase.x, joyBase.y, th, 0, Math.PI*2);
  if(charged){
    ctx.strokeStyle = jc + '0.95)'; ctx.lineWidth = 3; ctx.stroke();
  } else {
    ctx.setLineDash([6,7]);
    ctx.strokeStyle = jc + '0.42)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([]);
  }

  if(touch.active){
    var d = td || 1;
    var cl = Math.min(d, th);
    var kx = joyBase.x + tdx/d*cl, ky = joyBase.y + tdy/d*cl;
    ctx.beginPath(); ctx.arc(kx, ky, 22, 0, Math.PI*2);
    ctx.fillStyle = d > jr ? (S.airMode ? ORANGE + '0.9)' : 'rgba(250,204,21,0.9)')
                           : 'rgba(255,255,255,0.75)';
    ctx.fill();
    if(charged){ ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.stroke(); }
  } else {
    ctx.beginPath(); ctx.arc(joyBase.x, joyBase.y, 22, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
  }
}
