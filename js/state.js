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
                      lastTouch:0,                 // kdy do míče držitel naposled kopl
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

export function mk(team){ return { x:0, y:0, fx:0, fy:-1, team:team, tx:0, ty:0, think:0,
                            seed:Math.random()*100, sf:0, role:'', plan:null, side:0,
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
  });
  // rozehrává inkasující tým
  var starter = kickTeam === 'b' ? E.blue[0] : E.red[0];
  ball.vx = ball.vy = 0; ball.owner = starter; ball.gained = S.time;
  ball.lastTouch = S.time; ball.pending = null;
  ball.x = starter.x + starter.fx*CONTACT;
  ball.y = starter.y + starter.fy*CONTACT;
  S.lastTeam = kickTeam;
  S.ctrl = E.blue[0]; S.lockOut = 0; S.lockedPlayer = null;
  touch.fire = null;          // ať nabitá přihrávka nepřeteče do dalšího pokusu
  hooks.pickChasers();
}
