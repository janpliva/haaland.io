// Skóre, góly, hodiny a konec zápasu.
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

// M:SS. Zaokrouhluje se NAHORU, aby se na začátku ukázala celá délka (3:00, ne 2:59)
// a nula padla přesně v okamžiku konce.
export function fmtTime(sec){
  var t = Math.max(0, Math.ceil(sec));
  var s = t % 60;
  return Math.floor(t/60) + ':' + (s < 10 ? '0' : '') + s;
}

// Prostřední pole v HUDu. Na góly ukazuje cíl, na čas zbývající hodinu — a ve zlatém gólu
// stojící nulu, celé zlatě. Samotné „ZLATÝ GÓL" nese cedule pod HUDem, ne tenhle popisek:
// desetibodový nadpis prominentní není a dvakrát totéž je jen šum. Pole tak pořád znamená
// jednu věc (hodinu) a barva ho spojí s cedulí. Text se přepisuje jen při změně.
var hudLast = null;
export function showClock(){
  var timed = S.mode === 'timed', gold = timed && S.sudden;
  var k = timed ? 'Čas' : 'Do gólů';
  var v = timed ? fmtTime(S.clock) : String(T.targetGoals);
  var sig = k + '|' + v + '|' + (gold ? 1 : 0);
  if(sig === hudLast) return;
  hudLast = sig;
  document.getElementById('clockK').textContent = k;
  document.getElementById('clockV').textContent = v;
  document.getElementById('hud').classList.toggle('gold', gold);
  document.getElementById('golden').hidden = !gold;
}

// Odpočet. Volá se ze step(), takže z principu neběží v menu ani v pauze po gólu — tam se
// step() vůbec nevolá. Vrací true, když čas právě ukončil zápas; volající pak zbytek snímku
// přeskočí, aby po konci nemohl padnout gól.
export function tickClock(dt){
  if(S.mode !== 'timed' || S.sudden) return false;
  S.clock -= dt;
  if(S.clock > 0) return false;
  S.clock = 0;
  // Za nerozhodnutého stavu se nekončí: hodina se zastaví a hraje se na zlatý gól.
  if(S.scoreB === S.scoreR){ S.sudden = true; return false; }
  S.matchOver = true; S.running = false; S.deadTime = 0;
  return true;
}

export function goal(team){
  if(team === 'b') S.scoreB++; else S.scoreR++;
  showScore();
  // gól = konec akce: nachystaná přihrávka i linka zmizí hned, ne až po výkopu. Bez toho by
  // se přes celou přestávku kreslilo míření z hráče, který už na nic nečeká.
  ball.pending = null; S.drawAim = null; S.aimFrom = null; S.recv = null;
  S.running = false; S.deadTime = 1.4;
  S.kickNext = team === 'b' ? 'r' : 'b';   // rozehrává inkasující
  // V zápase na čas se cílový počet gólů NEUPLATNÍ — o konci rozhoduje jedině hodina, takže
  // vedení o deset gólů zápas neukončí. Skončí až gól ve zlatém gólu, ať ho dá kdokoliv.
  // Konec zápasu jen ZAZNAMENÁ. Návrat do menu obstará main.js, aby match.js nemusel
  // importovat menu.js (menu.js importuje match.js kvůli newMatch) — importy zůstávají
  // jednosměrné a skóre je do menu ještě vidět, protože ho vynuluje až další výkop.
  var over = S.mode === 'timed' ? S.sudden
                                : (S.scoreB >= T.targetGoals || S.scoreR >= T.targetGoals);
  if(over){
    S.matchOver = true; S.running = false; S.deadTime = 0;
  } else {
    flash(team === 'b' ? 'GÓL!' : 'Gól soupeře', team === 'b' ? '#4ade80' : '#f87171');
  }
}
export function newMatch(){
  S.scoreB = 0; S.scoreR = 0; S.matchOver = false; showScore();
  // hodiny se natáhnou jen v zápase na čas; na góly zůstávají na nule a HUD místo nich
  // ukazuje cíl. Zlatý gól se vždycky mázne — je to stav jednoho zápasu, ne nastavení.
  S.sudden = false;
  S.clock = S.mode === 'timed' ? S.matchLen : 0;
  showClock();
  S.kickNext = 'b';
  reset('b'); S.running = true; S.deadTime = 0;
}
// Klepnutí během pauzy po gólu ji přeskočí. S koncem zápasu to nemá nic společného —
// tam se vrací do menu a odtud se rozehrává tlačítkem.
export function skipPause(){ S.running = true; reset(S.kickNext); }
