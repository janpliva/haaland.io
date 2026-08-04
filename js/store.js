// Ukládání HODNOCENÍ HRÁČŮ, a ničeho jiného.
//
// V tomhle projektu už jednou byla ukládací vrstva a musela pryč: držela i laditelné hodnoty,
// takže uložená hodnota na telefonu tiše přebila novou výchozí hodnotu v config.js a hodiny
// testování šly na konstanty, které v souboru vůbec nebyly. Aby se to nemohlo vrátit tudy:
//
//   - vlastní klíč, ve kterém jsou JEN hodnocení (fbproto_ratings_v1)
//   - tenhle modul NEIMPORTUJE T a nemá jak do něj sáhnout; nastavení panelu se dál
//     nepamatuje a bere se při každém startu z config.js
//   - když uložený tvar neodpovídá dnešní sestavě (jiný počet hráčů, přibylo hodnocení),
//     ZAHODÍ SE CELÝ a jede se na samých padesátkách — nic se nedoslučuje po kouskách,
//     protože částečně načtená data jsou přesně ten druh tiché lži, kvůli které to letělo
//
// Ukládá se tu ještě volba REŽIMU zápasu (na góly / na čas a délka). Platí pro ni přesně
// totéž a má vlastní klíč: je to volba menu, ne laditelná hodnota, MATCH_TIMES se čte
// z config.js a k T ani odtud nevede žádná cesta — tenhle modul T pořád neimportuje.
//
// Import zůstává jednosměrný: config → state → store.
import { OUTFIELD_STATS, KEEPER_STATS, resolveRatings, mkRatings, MATCH_TIMES } from './config.js';
import { S, E, hooks } from './state.js';

const KEY = 'fbproto_ratings_v1';
const VERSION = 1;
const MODE_KEY = 'fbproto_mode_v1';
const MODE_VERSION = 1;

function statsFor(p){ return p.role === 'gk' ? KEEPER_STATS : OUTFIELD_STATS; }

// Odpovídá uložený záznam přesně tomu, co tenhle hráč má mít? Musí sedět jméno od jména,
// v obou směrech — chybějící i přebývající hodnocení znamená jiný tvar.
function entryFits(p, e){
  if(!e || typeof e !== 'object') return false;
  var want = statsFor(p), have = Object.keys(e);
  if(have.length !== want.length) return false;
  for(var i=0;i<want.length;i++){
    var v = e[want[i]];
    if(typeof v !== 'number' || !isFinite(v) || v < 0 || v > 99) return false;
  }
  return true;
}
function listFits(list, arr){
  if(!Array.isArray(arr) || arr.length !== list.length) return false;
  for(var i=0;i<list.length;i++) if(!entryFits(list[i], arr[i])) return false;
  return true;
}

function read(){
  try {
    var raw = window.localStorage.getItem(KEY);
    if(!raw) return null;
    var d = JSON.parse(raw);
    return (d && d.v === VERSION) ? d : null;
  } catch(e){ return null; }
}

// Zapisují se jen hodnocení, v pořadí E.blue / E.red (v poli 1..n, brankář poslední).
export function saveRatings(){
  try {
    var pick = function(p){
      var o = {}, s = statsFor(p);
      for(var i=0;i<s.length;i++) o[s[i]] = p.ratings[s[i]];
      return o;
    };
    window.localStorage.setItem(KEY, JSON.stringify({
      v: VERSION, b: E.blue.map(pick), r: E.red.map(pick)
    }));
  } catch(e){}          // plné/zakázané úložiště hru nesmí položit
}

// Vrací true, když se uložená data použila. Volá se z buildTeams přes hook, takže se
// aplikují i po přestavení týmů z panelu — a právě tam se nesedící tvar zahodí.
export function applyStoredRatings(){
  var d = read(), ok = !!d && listFits(E.blue, d.b) && listFits(E.red, d.r);
  for(var t=0;t<2;t++){
    var list = t ? E.red : E.blue, arr = ok ? (t ? d.r : d.b) : null;
    for(var i=0;i<list.length;i++){
      var p = list[i];
      p.ratings = arr ? Object.assign(mkRatings(p.role), arr[i]) : mkRatings(p.role);
      resolveRatings(p);
    }
  }
  if(d && !ok) { try { window.localStorage.removeItem(KEY); } catch(e){} }
  return ok;
}
hooks.applyRatings = applyStoredRatings;      // state.buildTeams() ji volá přes tenhle hák

// ---- volba režimu zápasu ----
// Vlastní klíč, vlastní kontrola, a stejné pravidlo: co nesedí s dnešní konfigurací, se
// ZAHODÍ CELÉ a jede se na výchozím „na góly". Konkrétně délka musí být pořád v MATCH_TIMES —
// když se pole v config.js přepíše, uložená délka z něj vypadne a volba spadne na výchozí,
// místo aby se hrálo na čas, který v souboru není.
export function saveMode(){
  try {
    window.localStorage.setItem(MODE_KEY, JSON.stringify({
      v: MODE_VERSION, mode: S.mode, len: S.matchLen
    }));
  } catch(e){}          // plné/zakázané úložiště hru nesmí položit
}
export function applyStoredMode(){
  var raw = null, d = null;
  try {
    raw = window.localStorage.getItem(MODE_KEY);
    if(raw) d = JSON.parse(raw);
  } catch(e){ d = null; }
  var ok = !!d && d.v === MODE_VERSION &&
           (d.mode === 'goals' || d.mode === 'timed') &&
           typeof d.len === 'number' && MATCH_TIMES.indexOf(d.len) >= 0;
  if(ok){ S.mode = d.mode; S.matchLen = d.len; }
  else {
    S.mode = 'goals'; S.matchLen = MATCH_TIMES[0] || 0;
    // maže se i nerozparsovatelný blob, ne jen ten, co se přečetl a neprošel kontrolou
    if(raw) { try { window.localStorage.removeItem(MODE_KEY); } catch(e){} }
  }
  return ok;
}
