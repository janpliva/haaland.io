// Skóre, góly, konec zápasu a úvodní obrazovka.
import { T } from './config.js';
import { S, ball, reset } from './state.js';

const ovEl = document.getElementById('start'),
      ovT = document.getElementById('ovT'),
      ovA = document.getElementById('ovA'),
      ovB = document.getElementById('ovB');
const INTRO = { t: ovT.innerHTML, a: ovA.innerHTML, b: ovB.innerHTML };

export function flash(text, color){
  var f = document.getElementById('flash');
  f.textContent = text; f.style.color = color; f.classList.add('on');
  setTimeout(function(){ f.classList.remove('on'); }, 850);
}
export function showScore(){
  document.getElementById('scB').textContent = S.scoreB;
  document.getElementById('scR').textContent = S.scoreR;
}
export function goal(team){
  if(team === 'b') S.scoreB++; else S.scoreR++;
  showScore();
  // gól = konec akce: nachystaná přihrávka i linka zmizí hned, ne až po výkopu. Bez toho by
  // se přes celou přestávku kreslilo míření z hráče, který už na nic nečeká.
  ball.pending = null; S.drawAim = null; S.aimFrom = null; S.recv = null;
  S.running = false; S.deadTime = 1.4;
  S.kickNext = team === 'b' ? 'r' : 'b';   // rozehrává inkasující
  if(S.scoreB >= T.targetGoals || S.scoreR >= T.targetGoals){
    S.matchOver = true; S.deadTime = 0;
    ovT.innerHTML = S.scoreB > S.scoreR ? 'Vyhráls' : 'Prohráls';
    ovA.innerHTML = 'Konečný stav ' + S.scoreB + ' : ' + S.scoreR + '.';
    ovB.style.display = 'none';
    ovEl.classList.remove('hidden');
  } else {
    flash(team === 'b' ? 'GÓL!' : 'Gól soupeře', team === 'b' ? '#4ade80' : '#f87171');
  }
}
export function newMatch(){
  S.scoreB = 0; S.scoreR = 0; S.matchOver = false; showScore();
  ovT.innerHTML = INTRO.t; ovA.innerHTML = INTRO.a; ovB.innerHTML = INTRO.b;
  ovB.style.display = '';
  S.kickNext = 'b';
  reset('b'); S.running = true; S.deadTime = 0;
}
export function startTap(){
  ovEl.classList.add('hidden');
  if(S.matchOver){ newMatch(); return; }
  S.running = true; reset(S.kickNext);
}
