// Skóre, góly, konec zápasu a úvodní obrazovka.
import { T } from './config.js';
import { S, ball, reset } from './state.js';

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
  // Konec zápasu jen ZAZNAMENÁ. Návrat do menu obstará main.js, aby match.js nemusel
  // importovat menu.js (menu.js importuje match.js kvůli newMatch) — importy zůstávají
  // jednosměrné a skóre je do menu ještě vidět, protože ho vynuluje až další výkop.
  if(S.scoreB >= T.targetGoals || S.scoreR >= T.targetGoals){
    S.matchOver = true; S.running = false; S.deadTime = 0;
  } else {
    flash(team === 'b' ? 'GÓL!' : 'Gól soupeře', team === 'b' ? '#4ade80' : '#f87171');
  }
}
export function newMatch(){
  S.scoreB = 0; S.scoreR = 0; S.matchOver = false; showScore();
  S.kickNext = 'b';
  reset('b'); S.running = true; S.deadTime = 0;
}
// Klepnutí během pauzy po gólu ji přeskočí. S koncem zápasu to nemá nic společného —
// tam se vrací do menu a odtud se rozehrává tlačítkem.
export function skipPause(){ S.running = true; reset(S.kickNext); }
