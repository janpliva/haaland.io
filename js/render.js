// Vykreslení. Čte stav, nic nemění.
import { T, FIELD_W, PH, BALL_R, GOAL_DEPTH } from './config.js';
import { S, E, ball, ctx, joyBase, touch } from './state.js';
import { pickupOf, boxW, boxD, rollDist, airApex } from './util.js';

export function X(v){ return v*S.scale; }

// ---- výška v 2D pohledu shora ----
// Kamera se nenaklápí. Výška se čte ze DVOU věcí naráz: míč se kreslí o `z` výš, než doopravdy
// je, a na jeho skutečném místě zůstane stín. Mezera mezi míčem a stínem je ten údaj — samotný
// posunutý míč by se nedal odlišit od míče, který prostě letí jinam.
const AIR = { grow: 0.5, growAt: 500,     // míč roste s výškou (jako by byl blíž kameře), se stropem
              fade: 0.8, fadeAt: 300,     // stín slábne...
              tiny: 0.55, tinyAt: 420 };  // ...a zmenšuje se
function shadowAlpha(z){ return 0.30 * (1 - Math.min(AIR.fade, z/AIR.fadeAt)); }
function shadowScale(z){ return 1 - Math.min(AIR.tiny, z/AIR.tinyAt); }
function ballScale(z){ return 1 + Math.min(AIR.grow, z/AIR.growAt); }
const ORANGE = 'rgba(251,146,60,';        // vzdušný režim — nikdy stejná barva jako přízemní

// Oblouk míření jako lomená čára: přímka od hráče, každý bod vyklenutý o výšku paraboly
// (4*apex*u*(1-u), tedy skutečný vrchol letu) — jenže KOLMO na směr míření, ne „nahoru po
// obrazovce". Důvod je projekce: shora se přihrávka mířená přímo na soupeřovu branku (tedy
// nahoru) od přízemní žádným pravdivým průmětem neodliší — výška i směr míří na obrazovce
// týmž směrem a oblouk zdegeneruje do úsečky. Přesně ten směr se přitom lobuje nejčastěji.
// Kolmý průhyb je proto ZNAČKA, stejně jako je značka délka linky (33 % doletu): říká „tohle
// poletí vzduchem a takhle vysoko", ne „takhle se to zakřiví do strany". Skutečný let se pak
// kreslí pravdivě — míč o z výš a pod ním stín.
// Kleneme vždycky k hornímu okraji, a u svislého míření doprava, ať to má jednu podobu.
function arcPath(ax, ay, dx, dy, len, apex){
  var px = -dy, py = dx;
  if(py > 0 || (py === 0 && px < 0)){ px = -px; py = -py; }
  var u0 = Math.min(0.9, (BALL_R+6)/Math.max(1, len));
  ctx.beginPath();
  for(var i=0;i<=16;i++){
    var u = u0 + (1-u0)*(i/16), h = 4*apex*u*(1-u);
    var qx = ax + dx*len*u + px*h, qy = ay + dy*len*u + py*h;
    if(i === 0) ctx.moveTo(X(qx), X(qy)); else ctx.lineTo(X(qx), X(qy));
  }
  ctx.stroke();
}

export function draw(){
  ctx.clearRect(0,0,S.cssW,S.cssH);

  // trávník
  ctx.fillStyle = '#1d4d34';
  ctx.fillRect(0,0,S.cssW,S.cssH);
  ctx.fillStyle = 'rgba(255,255,255,0.022)';
  var stripe = X(S.FIELD_H/10);
  for(var s=0;s<10;s+=2) ctx.fillRect(0, s*stripe, S.cssW, stripe);

  // čáry
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
  ctx.strokeRect(X(10), X(10), X(FIELD_W-20), X(S.FIELD_H-20));
  ctx.beginPath();
  ctx.moveTo(X(10), X(S.FIELD_H/2)); ctx.lineTo(X(FIELD_W-10), X(S.FIELD_H/2));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(X(FIELD_W/2), X(S.FIELD_H/2), X(75), 0, Math.PI*2);
  ctx.stroke();

  // branky: horní je soupeřova (útočíš nahoru), dolní tvoje
  var gxa = (FIELD_W - T.goalW)/2, gxb = (FIELD_W + T.goalW)/2;
  ctx.fillStyle = 'rgba(252,165,165,0.10)';
  ctx.fillRect(X(gxa), 0, X(T.goalW), X(GOAL_DEPTH));
  ctx.fillStyle = 'rgba(147,197,253,0.10)';
  ctx.fillRect(X(gxa), X(S.FIELD_H-GOAL_DEPTH), X(T.goalW), X(GOAL_DEPTH));
  // vápna — cíl náběhů a hranice, od které se centruje
  var bw = boxW(), bd = boxD();
  ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.lineWidth = 2;
  ctx.strokeRect(X(FIELD_W/2 - bw/2), 0, X(bw), X(bd));
  ctx.strokeRect(X(FIELD_W/2 - bw/2), X(S.FIELD_H-bd), X(bw), X(bd));

  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(252,165,165,0.9)';
  ctx.beginPath(); ctx.moveTo(X(gxa), X(BALL_R)); ctx.lineTo(X(gxb), X(BALL_R)); ctx.stroke();
  ctx.strokeStyle = 'rgba(147,197,253,0.9)';
  ctx.beginPath(); ctx.moveTo(X(gxa), X(S.FIELD_H-BALL_R)); ctx.lineTo(X(gxb), X(S.FIELD_H-BALL_R)); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for(var gp=0; gp<2; gp++){
    var px3 = gp ? gxb : gxa;
    ctx.fillRect(X(px3)-2, 0, 4, X(26));
    ctx.fillRect(X(px3)-2, X(S.FIELD_H-26), 4, X(26));
  }

  // Stín míče. Kreslí se VŽDYCKY a POD VŠÍM ostatním, na skutečném místě míče na hřišti —
  // je to jediná věc, která v pohledu shora prozradí výšku, takže nesmí zmizet ani pod hráčem.
  var bz = Math.max(0, ball.z);
  var shR = BALL_R*shadowScale(bz);
  ctx.beginPath();
  ctx.ellipse(X(ball.x), X(ball.y), X(shR), X(shR*0.6), 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(0,0,0,' + shadowAlpha(bz).toFixed(3) + ')';
  ctx.fill();

  // hráči
  for(var i=0;i<E.all.length;i++){
    var p = E.all[i];
    var isCtrl = (p === S.ctrl);
    // dosah zpracování — teď hraje roli u obou týmů
    // brankář žádný kruh nemá — chytá tělem, tak ať to nevypadá jako dosah
    var pr = pickupOf(p);
    if(pr > 0 && p.role !== 'gk'){
      ctx.beginPath();
      ctx.arc(X(p.x), X(p.y), X(pr), 0, Math.PI*2);
      ctx.strokeStyle = p.team === 'b' ? 'rgba(147,197,253,0.32)' : 'rgba(252,165,165,0.30)';
      ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.fillStyle = p.role === 'gk' ? (p.team === 'b' ? '#a3e635' : '#f59e0b')
                  : (p.team === 'b' ? (isCtrl ? '#60a5fa' : '#2563eb') : '#ef4444');
    var hw = p.role === 'gk' ? PH*1.6 : PH;   // brankář je širší než vysoký
    ctx.fillRect(X(p.x-hw), X(p.y-PH), X(hw*2), X(PH*2));
    if(p === ball.owner){          // kdo má míč
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
      ctx.strokeRect(X(p.x-hw), X(p.y-PH), X(hw*2), X(PH*2));
    }
    // Číslo na dresu; brankář místo čísla dostane tečku, ať je poznat i bez barvy.
    // Čistě vykreslení — simulace `num` nikde nečte, takže na hru nemá vliv.
    // Číslice vyplní skoro celý čtverec (na 375 px je hráč jen 9,4 css px široký, takže menší
    // písmo se nedá přečíst) a dostane tmavý obrys, aby držela proti modré i červené výplni.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if(p.role === 'gk'){
      ctx.beginPath();
      ctx.arc(X(p.x), X(p.y), X(PH*0.34), 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
    } else {
      ctx.font = '700 ' + X(PH*2.0).toFixed(1) + 'px system-ui, sans-serif';
      ctx.lineWidth = Math.max(1, X(2.2)); ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeText(String(p.num), X(p.x), X(p.y));
      ctx.fillStyle = '#fff';
      ctx.fillText(String(p.num), X(p.x), X(p.y));
    }
    // ovládaný hráč: kroužek, ne výplň, a menší než odsazení míče (24.83) — vyplněný kotouč
    // o poloměru PH*1.9 míč pohltil a hráč s míčem vypadal jako jedna skvrna.
    // Kreslí se až po těle, jinak by ho čtverec překryl.
    if(isCtrl){
      ctx.beginPath();
      ctx.arc(X(p.x), X(p.y), X(PH*1.2), 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // Směr. Začíná až NA HRANĚ těla, ne ve středu: dřív vedl přes celý čtverec a přeškrtával
    // číslo na dresu. Jako čumák trčící ven čte směr stejně a číslici nechá být.
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(p.x + p.fx*hw*1.1), X(p.y + p.fy*PH*1.1));
    ctx.lineTo(X(p.x + p.fx*hw*1.95), X(p.y + p.fy*PH*1.95));
    ctx.stroke();
  }

  // Vzdušný režim je NABITÝ: malý oranžový obloučk nad hlavou držitele. Musí být vidět i bez
  // nabíjení přihrávky — jinak se režim, který se přepíná zvednutím prstu, nedá zjistit jinak
  // než tím, že se odehraje a člověk uvidí, co z toho vyletí.
  if(S.airMode && S.airBy && ball.owner === S.airBy){
    var ap = S.airBy;
    ctx.strokeStyle = ORANGE + '0.95)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    // Klene se až nad míčem: ten leží u nohy ve vzdálenosti CONTACT, takže níž by se
    // s ním značka překrývala a splynula by v jednu skvrnu.
    for(var ai=0; ai<=10; ai++){
      var au = ai/10;
      var apx = ap.x + (au-0.5)*PH*2.8, apy = ap.y - PH*3.0 - 4*PH*0.85*au*(1-au);
      if(ai === 0) ctx.moveTo(X(apx), X(apy)); else ctx.lineTo(X(apx), X(apy));
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  // Kdo míč podle nároku zpracuje jako první: prstenec, ať je vidět, komu se to nabíjí.
  // Kreslí se, kdykoliv jde jednodotyková přihrávka zahrát — tedy i před natažením prstu,
  // jinak by se mířilo naslepo.
  if(S.recv){
    ctx.beginPath();
    ctx.arc(X(S.recv.x), X(S.recv.y), X(PH*1.7), 0, Math.PI*2);
    ctx.strokeStyle = ball.pending ? 'rgba(74,222,128,0.95)' : 'rgba(250,204,21,0.8)';
    ctx.lineWidth = 3; ctx.setLineDash([X(7), X(7)]); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Obě linky vycházejí z HRÁČE, ne z míče: ukazují směr, kterým se odehraje, a u letícího
  // míče je hráč jediný smysluplný počátek. Přihrávka sama pořád odlétá z místa míče, takže
  // se linka a skutečný start o kus liší — je to ukazatel směru, ne trajektorie.
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
      ctx.moveTo(X(af.x + qp.x*(BALL_R+6)), X(af.y + qp.y*(BALL_R+6)));
      ctx.lineTo(X(af.x + qp.x*qL), X(af.y + qp.y*qL));
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
      ctx.moveTo(X(ax + S.drawAim.x*(BALL_R+6)), X(ay + S.drawAim.y*(BALL_R+6)));
      ctx.lineTo(X(ax + S.drawAim.x*L), X(ay + S.drawAim.y*L));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // Míč. Ve vzduchu se kreslí o `z` výš a o kus větší, jako by byl blíž kameře; kruh dosahu
  // odebrání se u něj nekreslí vůbec, protože na míč ve vzduchu si nikdo sáhnout nemůže —
  // chybějící kruh je ta informace.
  var bR = BALL_R*ballScale(bz);
  ctx.beginPath();
  ctx.arc(X(ball.x), X(ball.y - bz), X(bR), 0, Math.PI*2);
  ctx.fillStyle = '#fde047'; ctx.fill();
  if(bz <= 0){
    ctx.beginPath();
    ctx.arc(X(ball.x), X(ball.y), X(T.tackleR), 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(253,224,71,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // joystick
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
