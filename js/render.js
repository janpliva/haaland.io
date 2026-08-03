// Vykreslení. Čte stav, nic nemění.
import { T, FIELD_W, PH, BALL_R, GOAL_DEPTH } from './config.js';
import { S, E, ball, ctx, joyBase, touch } from './state.js';
import { pickupOf, boxW, boxD, rollDist } from './util.js';

export function X(v){ return v*S.scale; }

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
  if(ball.pending && af){
    var qp = ball.pending, qL = rollDist(qp.speed) * (T.aimLen/100);
    ctx.strokeStyle = 'rgba(74,222,128,0.95)'; ctx.lineWidth = 3;
    ctx.setLineDash([X(5), X(11)]);
    ctx.beginPath();
    ctx.moveTo(X(af.x + qp.x*(BALL_R+6)), X(af.y + qp.y*(BALL_R+6)));
    ctx.lineTo(X(af.x + qp.x*qL), X(af.y + qp.y*qL));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // šipka míření
  if(S.drawAim && af){
    var ax = af.x, ay = af.y, L = S.drawAim.len;
    ctx.strokeStyle = 'rgba(250,204,21,0.85)'; ctx.lineWidth = 3;
    ctx.setLineDash([X(9), X(9)]);
    ctx.beginPath();
    ctx.moveTo(X(ax + S.drawAim.x*(BALL_R+6)), X(ay + S.drawAim.y*(BALL_R+6)));
    ctx.lineTo(X(ax + S.drawAim.x*L), X(ay + S.drawAim.y*L));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // míč + jeho kruh (co musí soupeř trefit)
  ctx.beginPath();
  ctx.arc(X(ball.x), X(ball.y), X(BALL_R), 0, Math.PI*2);
  ctx.fillStyle = '#fde047'; ctx.fill();
  ctx.beginPath();
  ctx.arc(X(ball.x), X(ball.y), X(T.tackleR), 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(253,224,71,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();

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
  // prstenec prahu přihrávky — plný, když je nabito
  ctx.beginPath(); ctx.arc(joyBase.x, joyBase.y, th, 0, Math.PI*2);
  if(charged){
    ctx.strokeStyle = 'rgba(250,204,21,0.95)'; ctx.lineWidth = 3; ctx.stroke();
  } else {
    ctx.setLineDash([6,7]);
    ctx.strokeStyle = 'rgba(250,204,21,0.42)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.setLineDash([]);
  }

  if(touch.active){
    var d = td || 1;
    var cl = Math.min(d, th);
    var kx = joyBase.x + tdx/d*cl, ky = joyBase.y + tdy/d*cl;
    ctx.beginPath(); ctx.arc(kx, ky, 22, 0, Math.PI*2);
    ctx.fillStyle = d > jr ? 'rgba(250,204,21,0.9)' : 'rgba(255,255,255,0.75)';
    ctx.fill();
    if(charged){ ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3; ctx.stroke(); }
  } else {
    ctx.beginPath(); ctx.arc(joyBase.x, joyBase.y, 22, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
  }
}
