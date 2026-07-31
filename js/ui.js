// Panel nastavení se generuje z TUNABLES a ukládá se do úložiště.
import { T, DEFAULTS, TUNABLES } from './config.js';
import { S, buildTeams, reset } from './state.js';
import { newMatch } from './match.js';

const STORE_KEY = 'fbproto_tuning_v1';
const controls = [];
let saveTimer = null;

function flashSaved(){
  var el = document.getElementById('saved');
  el.classList.add('on');
  setTimeout(function(){ el.classList.remove('on'); }, 900);
}
function writeStore(data){
  try {
    if(window.storage && window.storage.set){
      window.storage.set(STORE_KEY, data).then(flashSaved).catch(function(){});
      return;
    }
  } catch(e){}
  try { window.localStorage.setItem(STORE_KEY, data); flashSaved(); } catch(e){}
}
function queueSave(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){ writeStore(JSON.stringify(T)); }, 500);
}
export function syncSliders(){
  controls.forEach(function(c){ c.s.value = T[c.key]; c.l.textContent = T[c.key]; });
}
function applyLoaded(obj){
  if(!obj) return;
  Object.keys(DEFAULTS).forEach(function(k){ if(typeof obj[k] === 'number') T[k] = obj[k]; });
  syncSliders(); buildTeams(); reset();
}
function localLoad(){
  try {
    var v = window.localStorage.getItem(STORE_KEY);
    if(v) applyLoaded(JSON.parse(v));
  } catch(e){}
}
export function loadStore(){
  try {
    if(window.storage && window.storage.get){
      window.storage.get(STORE_KEY)
        .then(function(r){ if(r && r.value) applyLoaded(JSON.parse(r.value)); })
        .catch(function(){ localLoad(); });
      return;
    }
  } catch(e){}
  localLoad();
}

// jeden řádek panelu podle jedné položky TUNABLES
function register(def){
  var row = document.createElement('div'); row.className = 'row';
  var lab = document.createElement('label');
  var b = document.createElement('b');
  lab.appendChild(document.createTextNode(def.label + ' '));
  lab.appendChild(b);
  var s = document.createElement('input');
  s.type = 'range'; s.min = def.min; s.max = def.max; s.step = def.step;
  row.appendChild(lab); row.appendChild(s);
  controls.push({ s:s, l:b, key:def.key });
  s.value = T[def.key]; b.textContent = T[def.key];
  s.addEventListener('input', function(){
    T[def.key] = +s.value; b.textContent = s.value;
    if(def.rebuild){ buildTeams(); newMatch(); }   // jiný počet hráčů = nový zápas
    queueSave();
  });
  return row;
}

export function buildPanel(){
  var panel = document.getElementById('panel');
  var anchor = document.getElementById('reset');   // tlačítka zůstávají dole
  var group = null;
  TUNABLES.forEach(function(def){
    if(def.group !== group){
      group = def.group;
      var h = document.createElement('div');
      h.className = 'grp'; h.textContent = group;
      panel.insertBefore(h, anchor);
    }
    panel.insertBefore(register(def), anchor);
  });

  document.getElementById('gear').addEventListener('click', function(){
    panel.classList.toggle('open');
  });
  document.getElementById('reset').addEventListener('click', function(){
    reset(); S.running = true; S.deadTime = 0;    // jen pozice, skóre zůstává
  });
  document.getElementById('defaults').addEventListener('click', function(){
    Object.keys(DEFAULTS).forEach(function(k){ T[k] = DEFAULTS[k]; });
    syncSliders(); buildTeams(); newMatch(); queueSave();
  });
}
