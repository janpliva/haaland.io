// Domovská obrazovka, soupisky a listy hráčů.
//
// Menu ladí HRÁČE, panel pod ozubeným kolem ladí HRU. Schválně se to nemíchá: tady se čte
// T jen proto, aby šlo ukázat, co z hodnocení vyleze za skutečnou hodnotu — NIKDY se do něj
// nezapisuje. Uložená data končí u hodnocení (viz store.js) a k T nevede žádná cesta.
import { T, STAT_SCALE, STAT_LABEL, OUTFIELD_STATS, KEEPER_STATS, MATCH_TIMES,
         ratingMul, resolveRatings, keysOfStat } from './config.js';
import { S, E } from './state.js';
import { saveRatings, saveMode, applyStoredMode } from './store.js';
import { newMatch, showScore, showClock, fmtTime } from './match.js';

const $ = function(id){ return document.getElementById(id); };
const SCREENS = ['menu','squad','sheet'];
const STEP = 5;                       // o kolik hýbe jedno klepnutí v hromadné úpravě

let curTeam = 'b', curPlayer = null;

function listOf(team){ return team === 'b' ? E.blue : E.red; }
function statsOf(p){ return p.role === 'gk' ? KEEPER_STATS : OUTFIELD_STATS; }
function teamName(team){ return team === 'b' ? 'Můj tým' : 'Protější tým'; }
function overall(p){
  var s = statsOf(p), t = 0;
  for(var i=0;i<s.length;i++) t += p.ratings[s[i]];
  return Math.round(t/s.length);
}
// barva podle hodnocení: 0 červená → 50 žlutozelená → 99 zelená
function hue(v){ return 'hsl(' + Math.round(v/99*140) + ' 70% 55%)'; }
function fmt(v){
  if(!isFinite(v)) return '—';
  var a = Math.abs(v);
  var s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
  return s.indexOf('.') >= 0 ? s.replace(/\.?0+$/, '') : s;
}

function show(name){
  SCREENS.forEach(function(n){ $(n).hidden = (n !== name); });
  document.body.classList.add('inMenu');
}
export function inMenu(){ return S.screen === 'menu'; }

// ---- domovská obrazovka ----
function paintHome(){
  ['b','r'].forEach(function(t){
    var list = listOf(t), out = list.filter(function(p){ return p.role !== 'gk'; });
    var sum = 0;
    for(var i=0;i<out.length;i++) sum += overall(out[i]);
    var avg = out.length ? Math.round(sum/out.length) : 50;
    $(t === 'b' ? 'subB' : 'subR').textContent =
      out.length + ' v poli + brankář · průměr ' + avg;
    // náhled soupisky rovnou na kartě, ať se dá tým přečíst bez otevírání
    var ros = $(t === 'b' ? 'rosB' : 'rosR');
    ros.innerHTML = '';
    list.forEach(function(p){
      var ov = overall(p), c = document.createElement('span');
      c.className = 'chip' + (p.role === 'gk' ? ' gk' : '');
      c.innerHTML = '<b>' + (p.role === 'gk' ? 'GK' : p.num) + '</b><i>' + ov + '</i>';
      c.style.setProperty('--c', hue(ov));
      ros.appendChild(c);
    });
  });
}
// ---- volba režimu ----
// Nabídka délek se GENERUJE z MATCH_TIMES: kolik je v poli položek, tolik je tlačítek.
// Nikde se počet neopisuje, takže přidaný řádek v config.js se objeví sám.
function buildTimeSegs(){
  var wrap = $('timeSegs');
  wrap.innerHTML = '';
  MATCH_TIMES.forEach(function(sec){
    var b = document.createElement('button');
    b.className = 'seg'; b.dataset.len = String(sec); b.textContent = fmtTime(sec);
    b.addEventListener('click', function(){
      S.matchLen = sec; saveMode(); paintMode(); showClock();
    });
    wrap.appendChild(b);
  });
}
function paintMode(){
  var timed = S.mode === 'timed';
  $('modeSegs').querySelectorAll('.seg').forEach(function(b){
    b.classList.toggle('on', (b.dataset.mode === 'timed') === timed);
  });
  $('timeWrap').hidden = !timed;                 // délka se vybírá jen u zápasu na čas
  $('timeSegs').querySelectorAll('.seg').forEach(function(b){
    b.classList.toggle('on', +b.dataset.len === S.matchLen);
  });
}
function setMode(mode){
  S.mode = mode;
  // Kdyby uložená délka po editaci MATCH_TIMES v poli nebyla, spadne se na první z něj —
  // hrát na čas, který ve zdrojáku není, nedává smysl.
  if(MATCH_TIMES.indexOf(S.matchLen) < 0) S.matchLen = MATCH_TIMES[0] || 0;
  saveMode(); paintMode(); showClock();
}

export function openMenu(withResult){
  S.screen = 'menu'; S.running = false; S.deadTime = 0;
  var el = $('lastResult');
  if(withResult){
    var b = S.scoreB, r = S.scoreR;
    el.hidden = false;
    el.className = 'result ' + (b > r ? 'win' : b < r ? 'loss' : 'draw');
    el.innerHTML = '<span class="rLab">' + (b > r ? 'Vyhrál jsi' : b < r ? 'Prohrál jsi' : 'Remíza') +
                   '</span><span class="rNum">' + b + ' : ' + r + '</span>';
  }
  paintHome();
  paintMode();
  show('menu');
}

// ---- soupiska ----
// Řádek hráče: číslo, celkové hodnocení a všechna hodnocení v číslech i pruzích, aby se dala
// sestava přečíst bez rozklikávání kohokoliv.
function playerRow(p){
  var b = document.createElement('button');
  b.className = 'pRow' + (p.role === 'gk' ? ' gk' : '');
  var badge = document.createElement('span');
  badge.className = 'pBadge';
  badge.innerHTML = '<span class="pNum">' + (p.role === 'gk' ? 'GK' : p.num) + '</span>' +
                    '<span class="pOv">' + overall(p) + '</span>';
  b.appendChild(badge);

  var cols = document.createElement('span');
  cols.className = 'pCols';
  statsOf(p).forEach(function(k){
    var v = p.ratings[k];
    var c = document.createElement('span');
    c.className = 'pCol';
    c.innerHTML = '<span class="cAb">' + STAT_LABEL[k].abbr + '</span>' +
                  '<span class="cVal">' + v + '</span>' +
                  '<span class="cBar"><i></i></span>';
    var i = c.querySelector('i');
    i.style.width = (v/99*100) + '%'; i.style.background = hue(v);
    cols.appendChild(c);
  });
  b.appendChild(cols);
  b.addEventListener('click', function(){ openSheet(p); });
  return b;
}

// Hromadná úprava: jedno klepnutí posune STEJNĚ všechny hráče týmu, kteří dané hodnocení mají.
// Kvůli tomu tu jsou obě sady — hodnocení hráčů v poli i brankáře — a je vidět, která je která.
function bulkRow(stat){
  var row = document.createElement('div');
  row.className = 'bRow';
  row.innerHTML = '<button class="bBtn" data-d="-1">−</button>' +
                  '<span class="bLab"><b>' + STAT_LABEL[stat].abbr + '</b>' +
                  '<span class="bAvg"></span></span>' +
                  '<button class="bBtn" data-d="1">+</button>';
  var avg = row.querySelector('.bAvg');
  var refresh = function(){
    var list = listOf(curTeam).filter(function(p){ return p.ratings[stat] !== undefined; });
    if(!list.length){ avg.textContent = '—'; return; }
    var t = 0;
    for(var i=0;i<list.length;i++) t += list[i].ratings[stat];
    avg.textContent = String(Math.round(t/list.length));
  };
  row.querySelectorAll('.bBtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      shift(curTeam, stat, (+btn.dataset.d) * STEP);
      paintSquad();
    });
  });
  refresh();
  return row;
}

// Posun o `d` u každého hráče týmu, který tohle hodnocení má, s ořezem na 0–99.
// Ořez je na jednotlivém hráči, ne na průměru, takže opakovaný posun na krajích jen dosedne
// a nikam se neplazí.
export function shift(team, stat, d){
  var list = listOf(team), touched = false;
  for(var i=0;i<list.length;i++){
    var p = list[i];
    if(p.ratings[stat] === undefined) continue;
    p.ratings[stat] = Math.max(0, Math.min(99, p.ratings[stat] + d));
    resolveRatings(p); touched = true;
  }
  if(touched) saveRatings();
}
export function setAll(team, value){
  var list = listOf(team);
  for(var i=0;i<list.length;i++){
    var p = list[i], s = statsOf(p);
    for(var k=0;k<s.length;k++) p.ratings[s[k]] = value;
    resolveRatings(p);
  }
  saveRatings();
}
export function randomise(team){
  var list = listOf(team);
  for(var i=0;i<list.length;i++){
    var p = list[i], s = statsOf(p);
    for(var k=0;k<s.length;k++) p.ratings[s[k]] = Math.floor(Math.random()*100);
    resolveRatings(p);
  }
  saveRatings();
}

function paintSquad(){
  $('squadTitle').textContent = teamName(curTeam);
  $('squad').classList.toggle('foeSide', curTeam === 'r');
  var body = $('squadBody');
  body.innerHTML = '';

  var h1 = document.createElement('div');
  h1.className = 'sect'; h1.textContent = 'Hromadná úprava — celý tým';
  body.appendChild(h1);
  var g1 = document.createElement('div'); g1.className = 'bGrid';
  OUTFIELD_STATS.forEach(function(k){ g1.appendChild(bulkRow(k)); });
  body.appendChild(g1);
  var h2 = document.createElement('div');
  h2.className = 'sect sub'; h2.textContent = 'Jen brankář';
  body.appendChild(h2);
  var g2 = document.createElement('div'); g2.className = 'bGrid';
  KEEPER_STATS.forEach(function(k){
    if(OUTFIELD_STATS.indexOf(k) < 0) g2.appendChild(bulkRow(k));
  });
  body.appendChild(g2);

  var h3 = document.createElement('div');
  h3.className = 'sect'; h3.textContent = 'Soupiska';
  body.appendChild(h3);
  listOf(curTeam).forEach(function(p){ body.appendChild(playerRow(p)); });
}
export function openSquad(team){
  curTeam = team; S.screen = 'menu';
  paintSquad();
  show('squad');
  $('squadBody').scrollTop = 0;
}

// ---- list hráče ----
// U každého hodnocení posuvník 0–99 a hned pod ním, co z něj vyleze za skutečnou hodnotu —
// jinak je „63" jen číslo. Konstanty se ukazují pod svým jménem z config.js schválně: tohle
// je most mezi hodnocením a tím, co se ladí posuvníky v panelu.
function sheetRow(p, stat){
  var wrap = document.createElement('div');
  wrap.className = 'sRow';
  wrap.innerHTML = '<div class="sHead"><span>' + STAT_LABEL[stat].cs + '</span>' +
                   '<b class="sVal">' + p.ratings[stat] + '</b></div>';
  var sl = document.createElement('input');
  sl.type = 'range'; sl.min = 0; sl.max = 99; sl.step = 1; sl.value = p.ratings[stat];
  sl.className = 'sSlide';
  wrap.appendChild(sl);
  var out = document.createElement('div');
  out.className = 'sOut';
  wrap.appendChild(out);

  var val = wrap.querySelector('.sVal');
  var paint = function(){
    var v = p.ratings[stat];
    val.textContent = v; val.style.color = hue(v);
    sl.style.setProperty('--fill', (v/99*100) + '%');
    out.innerHTML = keysOfStat(stat).map(function(key){
      var sc = STAT_SCALE[key];
      return '<span class="oK">' + key + '</span>' +
             '<span class="oV">' + fmt(T[key]) + ' → <b>' + fmt(T[key]*ratingMul(key, v)) +
             '</b> ' + (sc.unit || '') + '</span>';
    }).join('');
  };
  sl.addEventListener('input', function(){
    p.ratings[stat] = +sl.value; resolveRatings(p); paint();
  });
  // uloží se až po puštění prstu, ne při každém pixelu tažení
  sl.addEventListener('change', function(){ saveRatings(); });
  paint();
  return wrap;
}
export function openSheet(p){
  curPlayer = p;
  $('sheetTitle').textContent = teamName(p.team) + ' · ' +
    (p.role === 'gk' ? 'brankář' : 'č. ' + p.num);
  $('sheet').classList.toggle('foeSide', p.team === 'r');
  var body = $('sheetBody');
  body.innerHTML = '';
  statsOf(p).forEach(function(k){ body.appendChild(sheetRow(p, k)); });
  show('sheet');
  body.scrollTop = 0;
}

// ---- zapojení ----
export function buildMenu(){
  applyStoredMode();          // uložená volba, nebo výchozí „na góly" když tvar nesedí
  buildTimeSegs();
  $('modeSegs').querySelectorAll('.seg').forEach(function(b){
    b.addEventListener('click', function(){ setMode(b.dataset.mode); });
  });
  paintMode();
  $('cardB').addEventListener('click', function(){ openSquad('b'); });
  $('cardR').addEventListener('click', function(){ openSquad('r'); });
  $('playBtn').addEventListener('click', startMatch);
  $('squadBack').addEventListener('click', function(){ openMenu(false); });
  $('sheetBack').addEventListener('click', function(){ openSquad(curPlayer ? curPlayer.team : curTeam); });
  $('randBtn').addEventListener('click', function(){ randomise(curTeam); paintSquad(); });
  $('fiftyBtn').addEventListener('click', function(){ setAll(curTeam, 50); paintSquad(); });
}
export function startMatch(){
  $('lastResult').hidden = true;
  SCREENS.forEach(function(n){ $(n).hidden = true; });
  document.body.classList.remove('inMenu');
  S.screen = 'game';
  newMatch();                 // vynuluje skóre, rozestaví a rozehraje
  showScore();
}
