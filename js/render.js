// Vykreslení. Čte stav, nic nemění.
import { T, FIELD_W, PH, BALL_R, GOAL_DEPTH } from './config.js';
import { S, E, ball, ctx, joyBase, touch } from './state.js';
import { pickupOf, boxW, boxD } from './util.js';

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
    // ovládaný hráč: kroužek, ne výplň, a menší než odsazení míče (24.83) — vyplněný kotouč
    // o poloměru PH*1.9 míč pohltil a hráč s míčem vypadal jako jedna skvrna.
    // Kreslí se až po těle, jinak by ho čtverec překryl.
    if(isCtrl){
      ctx.beginPath();
      ctx.arc(X(p.x), X(p.y), X(PH*1.2), 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // směr
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(p.x), X(p.y));
    ctx.lineTo(X(p.x + p.fx*PH*1.5), X(p.y + p.fy*PH*1.5));
    ctx.stroke();
  }

  // šipka míření
  if(S.drawAim && ball.owner){
    // linka vychází z míče, protože odtud se přihrávka reálně odehrává
    var ax = ball.x, ay = ball.y, L = S.drawAim.len;
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
    charged = td > th && ball.owner === S.ctrl;   // přihrávka nabitá, čeká na zvednutí prstu
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
