// Panel nastavení se generuje z TUNABLES. Nastavení se NEUKLÁDÁ: T se při každém startu
// bere z config.js, takže hra vždycky běží na tom, co je ve zdrojáku. Posuvníky mění T
// jen po dobu session.
import { T, DEFAULTS, TUNABLES } from './config.js';
import { S, buildTeams, reset } from './state.js';
import { newMatch } from './match.js';

const OLD_STORE_KEY = 'fbproto_tuning_v1';   // jen kvůli úklidu po staré verzi
const controls = [];

// zbytek po dřívějším ukládání — ať nikomu nezůstane v prohlížeči viset mrtvý blob
export function clearStore(){
  try { window.localStorage.removeItem(OLD_STORE_KEY); } catch(e){}
}
function syncSliders(){
  controls.forEach(function(c){ c.s.value = T[c.key]; c.l.textContent = T[c.key]; });
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
  // „výchozí hodnoty" = to, co je v TUNABLES v config.js; DEFAULTS je jejich kopie
  document.getElementById('defaults').addEventListener('click', function(){
    Object.keys(DEFAULTS).forEach(function(k){ T[k] = DEFAULTS[k]; });
    syncSliders(); buildTeams(); newMatch();
  });
}
