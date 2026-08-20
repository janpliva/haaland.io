// Konstanty a laditelné hodnoty. Tohle je jediné místo, kde se mění výchozí hodnoty —
// panel i DEFAULTS se generují z TUNABLES, takže nový posuvník = jeden řádek tady.

export const FIELD_W = 1200;
export const PH = 15;                  // půlka strany hráče
export const BALL_R = 10;
export const CONTACT = PH + BALL_R;    // vzdálenost středů, kdy se hráč míče dotýká
export const GOAL_DEPTH = 60;          // jen vykreslení brankoviště, nemá vliv na hru
export const STEAL_LOCK = 0.5;         // po odebrání si původní držitel nemůže hned vzít míč zpět
export const SETTLE = 0.3;             // než AI po zisku míče smí kopnout — jinak odpaluje z první

// Pod touhle svislou rychlostí (j/s) se míč po odrazu přestane odrážet a přejde do kutálení.
// SCHVÁLNĚ to není tunable: není to nastavení hry, ale mez, pod kterou se odraz nedá vidět —
// při gravitaci 1400 vyskočí takový odraz o 1,3 jednotky a trvá 86 ms. Zároveň je to pojistka
// proti dělení snímku na nekonečně mnoho odrazů: po odrazu je let dlouhý 2*vz/gravitace, tedy
// nejmíň 2*60/3000 = 0,04 s, což je víc než strop dt (0,033 s) — v jednom snímku proto nikdy
// nemůžou padnout dva dopady.
export const BOUNCE_STOP = 60;

export function dirOf(team){ return team === 'b' ? -1 : 1; }   // kterým směrem tým útočí

// Délky zápasu na čas, v sekundách. SCHVÁLNĚ to není tunable: tohle se nehledá posuvníkem
// při hraní, tohle se edituje tady v souboru. Menu si nabídku generuje z tohohle pole, takže
// přidaný nebo odebraný řádek se v něm objeví sám a nikde jinde se nic měnit nemusí.
export const MATCH_TIMES = [60, 180, 300];   // sekundy

export const TUNABLES = [
  // Kolik hráčů v poli; brankář se do počtu nepočítá. Změna rozehraje nový zápas.
  { key:'teamSize',      def:5,    min:1,   max:6,    step:1,   label:'Hráčů v mém týmu',            group:'Týmy', rebuild:true },
  { key:'foeSize',       def:5,    min:1,   max:6,    step:1,   label:'Hráčů v týmu soupeře',        group:'Týmy', rebuild:true },

  // Jedna základní rychlost pro všechny. Rozdíl mezi hráči i mezi týmy dělá hodnocení
  // `speed` (viz STAT_SCALE níž), ne druhá konstanta — tím zmizí celá třída tichých
  // asymetrií, kdy se jeden tým ladil a druhý ne.
  { key:'speedBase',     def:200,  min:120, max:320,  step:5,   label:'Základní rychlost hráče',     group:'Pohyb' },

  // Jak se míč chová u nohy: kdo ho kdy má, jak daleko se předkopává a jak tvrdě poslouchá.
  { key:'pickupBase',    def:40,   min:16,  max:90,   step:1,   label:'Základní dosah zpracování',   group:'Míč' },
  { key:'tackleR',       def:3,   min:0,   max:60,   step:1,   label:'Dosah odebrání',              group:'Míč' },
  // Driblink je FYZIKÁLNÍ: při kontaktu se míč kopne rychlostí v + touchPush*m, pak se sám
  // kutálí a brzdí třením, zatímco držitel automaticky běží NA MÍČ rychlostí v. Cyklus končí
  // tím, že ho tělem dostihne — je to výsledek vzdálenosti, ne odpočet.
  { key:'touchPush',       def:100, min:0,   max:600, step:10,  label:'Síla předkopu',               group:'Míč' },
  // Mezi kontakty stick směr ani rychlost nemění — to je ta zavázanost. 0 = plný zámek,
  // 100 = stick působí průběžně.
  { key:'chaseSteer',      def:0,   min:0,   max:100, step:5,   label:'Ovládání během doběhu (%)',   group:'Míč' },
  // Dosah zpracování míč nezastavuje — jen určí, kdo si po něm cukne. Tohle je STROP rychlosti
  // toho cuknutí; skutečná rychlost vychází z toho, co si zásah opravdu žádá.
  { key:'lungeSpeed',      def:50, min:10, max:500, step:10,  label:'Rychlost cuknutí pro zpracování (%)', group:'Míč' },
  { key:'friction',      def:400,  min:80,  max:700,  step:10,  label:'Tření míče',                  group:'Míč' },

  // Míč má výšku (z) a svislou rychlost (vz). Ve vzduchu na něj NEplatí tření — brzdí ho
  // slabší odpor vzduchu — a nikdo si na něj nesmí sáhnout: nedá se driblovat, odebrat ani
  // zpracovat, dokud nedosedne. Při dopadu se odrazí (svisle bounceKeep, vodorovně bounceDrag)
  // a každý další odraz je nižší a kratší, dokud svislá rychlost nespadne pod BOUNCE_STOP.
  // Výjimka je brankář: ten chytá i míč nad zemí, protože přesně to brankář dělá.
  { key:'gravity',       def:1000, min:400, max:3000, step:50,  label:'Gravitace',                   group:'Míč vzduchem' },
  { key:'bounceKeep',    def:45,   min:0,   max:80,   step:5,   label:'Odraz od země (%)',           group:'Míč vzduchem' },
  { key:'bounceDrag',    def:50,   min:40,  max:100,  step:5,   label:'Brzdění při dopadu (%)',      group:'Míč vzduchem' },
  { key:'airDrag',       def:0,   min:0,   max:300,  step:10,  label:'Odpor vzduchu',               group:'Míč vzduchem' },
  { key:'liftAngle',     def:38,   min:15,  max:60,   step:1,   label:'Úhel vzletu (°)',             group:'Míč vzduchem' },
  // Padající míč se hůř zpracuje než kutálející se: první dotek je delší, a to úměrně tomu,
  // jak rychle míč padal. Tohle je podíl svislé rychlosti dopadu, který se přičte k předkopu —
  // stejná role, jakou v pozemním cyklu hraje touchPush. Zadání pro tenhle dotek číslo nedalo,
  // takže je z něj posuvník a hodnota se najde hraním, ne odhadem.
  { key:'airTouch',      def:30,   min:0,   max:120,  step:5,   label:'Zpracování padajícího míče (%)', group:'Míč vzduchem' },

  // Síla přihrávky se odvíjí od toho, jak daleko za prahem zvedneš prst.
  { key:'passSpeed',     def:800,  min:300, max:1100, step:20,  label:'Síla přihrávky',              group:'Přihrávka' },
  { key:'passRange',     def:120,  min:40,  max:260,  step:5,   label:'Dosah síly přihrávky',        group:'Přihrávka' },
  { key:'passMin',       def:40,   min:10,  max:90,   step:5,   label:'Nejslabší přihrávka (%)',     group:'Přihrávka' },
  { key:'aimLen',        def:33,   min:5,   max:100,  step:1,   label:'Délka linky míření (%)',      group:'Přihrávka' },
  { key:'aiArrive',      def:220,  min:50,  max:500,  step:10,  label:'Dojezdová rychlost přihrávky AI', group:'Přihrávka' },
  // přihrávka se odehraje až při nejbližším doteku; po tomhle čase se nachystaná zahodí
  { key:'passQueueMax',  def:1700,  min:200, max:2000, step:50,  label:'Nejdelší čekání na přihrávku (ms)', group:'Přihrávka' },
  { key:'passLead',      def:150,   min:0,   max:300,  step:5,   label:'Přihrávka před hráče',        group:'Přihrávka' },

  // Velikost joysticku a kde začíná nabíjení přihrávky.
  { key:'joyR',          def:70,   min:40,  max:100,  step:2,   label:'Velikost joysticku',          group:'Joystick' },
  { key:'passThresh',    def:122,  min:100, max:180,  step:2,   label:'Práh přihrávky',              group:'Joystick' },

  // Rozměry branky a délka zápasu. Šířkou branky se škáluje i vápno.
  { key:'goalW',         def:240,  min:100, max:500,  step:10,  label:'Šířka branky',                group:'Hřiště a zápas' },
  { key:'targetGoals',   def:5,    min:1,   max:15,   step:1,   label:'Hraje se do N gólů',          group:'Hřiště a zápas' },

  // Rozhodování hráče s míčem a náběhy bez míče.
  { key:'shootRange',    def:400,  min:200, max:1600, step:20,  label:'Odkud AI střílí',             group:'Útok AI' },
  { key:'soloLane',      def:50,   min:20,  max:160,  step:5,   label:'Sólo koridor',                group:'Útok AI' },
  // Nepřesnost přihrávky. Základ je 3, ne 0, aby hodnocení `passing` mělo kam růst i kam
  // klesat: na 0 by padesátka znamenala absolutní přesnost a nad ní by se nedalo zlepšit.
  // Platí i na přihrávku člověka — odehrává se až v doPass, takže ji dopředu nevidíš.
  { key:'foeError',      def:3,    min:0,   max:35,   step:1,   label:'Nepřesnost přihrávky (°)',    group:'Útok AI' },
  { key:'runDepth',      def:120,  min:0,   max:400,  step:5,   label:'Hloubka náběhu za obranu',    group:'Útok AI' },
  { key:'interceptEff',  def:90,   min:50,  max:100,  step:1,   label:'Účinnost náběhu na míč (%)',  group:'Útok AI' },
  { key:'planHold',      def:500,  min:100, max:1500, step:50,  label:'Držení plánu AI (ms)',        group:'Útok AI' },
  { key:'planBreak',     def:90,   min:40,  max:250,  step:5,   label:'Přerušení plánu tlakem',      group:'Útok AI' },

  // Tvar bloku bez míče: hlídání, obranná linie a kdy se vůbec presuje.
  { key:'markDist',      def:45,   min:20,  max:120,  step:1,   label:'Odstup při hlídání',          group:'Obrana' },
  { key:'markShift',     def:25,   min:0,   max:60,   step:1,   label:'Posun hlídání k míči (%)',    group:'Obrana' },
  { key:'lineGap',       def:60,   min:0,   max:200,  step:5,   label:'Odstup obranné linie',        group:'Obrana' },
  { key:'pressDist',     def:900,  min:200, max:2000, step:20,  label:'Vzdálenost presinku',         group:'Obrana' },
  { key:'wobbleNear',    def:600,  min:100, max:1500, step:20,  label:'Dosah driftu obránců',        group:'Obrana' },
  // Obránce vidí SOUPEŘE se zpožděním: běží na to, co soupeř dělal před defReact ms, takže
  // po kličce je defReact dlouho zavázaný ve starém směru (viz perceivedFoe/perceivedBall
  // v util.js). Platí na presink, hlídání, obrannou linii i spouštění presinku, stejně pro
  // oba týmy. NEplatí na vlastní tým, brankáře (má gkReaction) ani na odebrání.
  { key:'defReact',      def:80,  min:0,   max:1200, step:10,  label:'Reakční čas obránce (ms)',    group:'Obrana' },

  // Brankář chytá tělem; tohle řídí jen postavení, reakci, zákrok a rozehrávku.
  { key:'gkDepth',       def:55,   min:0,   max:160,  step:5,   label:'Vysunutí brankáře',           group:'Brankář' },
  { key:'gkReaction',    def:120,  min:0,   max:500,  step:10,  label:'Reakce brankáře (ms)',        group:'Brankář' },
  { key:'gkError',       def:15,   min:0,   max:200,  step:5,   label:'Nepřesnost brankáře',         group:'Brankář' },
  { key:'gkDiveSpeed',   def:130,  min:100, max:300,  step:5,   label:'Rychlost zákroku (%)',        group:'Brankář' },
  { key:'gkParrySpeed',  def:400,  min:200, max:1000, step:20,  label:'Rychlost odrazu místo chycení', group:'Brankář' },
  { key:'gkParryKeep',   def:35,   min:10,  max:90,   step:5,   label:'Síla odrazu (%)',             group:'Brankář' },
  { key:'gkHoldMax',     def:1200, min:300, max:3000, step:100, label:'Držení míče brankářem (ms)',  group:'Brankář' },
  { key:'gkVentureSafe', def:260,  min:80,  max:600,  step:10,  label:'Bezpečná zóna pro výběh',     group:'Brankář' },
  { key:'gkVenture',     def:300,  min:0,   max:500,  step:10,  label:'Jak daleko smí brankář vyjet', group:'Brankář' },

  // Výběh: brankář vyrazí proti soupeři s míčem a při doteku ho vykopne. Je to sázka —
  // po dobu závazku se nedá odvolat, takže obejít se dá. gkRushDist 0 celý výběh vypne.
  { key:'gkRushDist',    def:320,  min:0,   max:900,  step:10,  label:'Výběh brankáře — vzdálenost', group:'Brankář' },
  { key:'gkRushLoneDist',def:520,  min:0,   max:900,  step:10,  label:'Výběh brankáře — sám na bránu', group:'Brankář' },
  { key:'gkRushSpeed',   def:130,  min:80,  max:250,  step:5,   label:'Rychlost výběhu (%)',         group:'Brankář' },
  { key:'gkRushMax',     def:420,  min:0,   max:900,  step:10,  label:'Jak daleko smí brankář vyběhnout', group:'Brankář' },
  { key:'gkRushCommit',  def:380,  min:0,   max:1200, step:20,  label:'Závazek výběhu (ms)',         group:'Brankář' },
  { key:'gkClearSpeed',  def:700,  min:200, max:1400, step:20,  label:'Síla vykopnutí při výběhu',   group:'Brankář' },
  { key:'gkClearSpread', def:40,   min:0,   max:90,   step:5,   label:'Rozptyl vykopnutí (°)',       group:'Brankář' },

  // Rychlost hráče se mění konečnou rychlostí, ne skokem. accelTime je čas z nuly na maximum,
  // decelTime čas z maxima na nulu; obojí se počítá z maxima TOHOTO hráče, aby pomalejší hráč
  // neměl delší rozjezd. accelTime 0 = setrvačnost vypnutá a hra běží přesně jako dřív.
  { key:'accelTime',     def:300,    min:0,   max:2000, step:20,  label:'Rozběh na plnou (ms)',        group:'Setrvačnost' },
  { key:'decelTime',     def:20,  min:20,  max:2000, step:20,  label:'Zabrzdění z plné (ms)',       group:'Setrvačnost' }
];

// T se mutuje po jednotlivých klíčích, nikdy se nepřiřazuje celé.
export const T = {};
export const DEFAULTS = {};
for(const t of TUNABLES){ T[t.key] = t.def; DEFAULTS[t.key] = t.def; }

// ---- hodnocení hráčů ----
// Každý hráč v poli má šest hodnocení 0–99, brankář čtyři. Hodnocení 50 znamená PŘESNĚ tu
// hodnotu, co je nahoře v TUNABLES, takže mužstvo samých padesátek hraje bit po bitu jako
// hra bez hodnocení. Hodnocení konstantu jen ŠKÁLUJÍ, nikdy ji nenahrazují — hra se dál
// ladí globálně tady a hodnocení jedou s tím, co si nastavíš.
export const OUTFIELD_STATS = ['speed','accel','dribble','passing','control','defending'];
export const KEEPER_STATS   = ['reflexes','accuracy','rushing','passing'];

// Rozpětí je ÚZKÉ a je schválně jiné než min/max posuvníku: posuvník slouží k hledání
// hodnoty a je proto široký až nehratelně, tohle je rozdíl mezi dvěma hráči.
//   lo  = násobitel při hodnocení 0
//   hi  = násobitel při hodnocení 99
//   dir = kterým směrem je vyšší hodnocení lepší; je v datech SCHVÁLNĚ a neodvozuje se
//         z toho, jestli násobitel klesá (viz kontrola pod tabulkou)
// Mezi 0–50 a 50–99 se interpoluje lineárně přes přesnou 1.0 na padesátce.
// Klíčem je konstanta, ne hodnocení: jedno hodnocení může táhnout víc konstant a každá
// z nich má svůj vlastní směr (viz defending — reakce dolů, dosah odebrání nahoru).
// Celá tabulka je na jednom místě, takže se rozpětí přeladí jedním editem.
// `unit` je jen popisek pro menu — hra ho nečte.
export const STAT_SCALE = {
  //                stat          lo(0)   hi(99)   dir
  speedBase:   { stat:'speed',     lo:0.88, hi:1.12, dir:'higher', unit:'j/s' },
  // Rychlost je úzká schválně: ±12 % už je vidět, že rychlejší hráč odjíždí, a širší
  // rozpětí dělá z nízko hodnoceného hráče nehratelnou překážku.
  accelTime:   { stat:'accel',     lo:1.50, hi:0.60, dir:'lower',  unit:'ms' },
  touchPush:   { stat:'dribble',   lo:1.35, hi:0.70, dir:'lower',  unit:'j/s' },
  // Při základu 3° vyjde hodnocení 0 na 8°, 50 na 3° a 99 na 0° — přesně proto se základ
  // zvedl z nuly, jinak by nad padesátkou nebylo co zlepšovat.
  foeError:    { stat:'passing',   lo:8/3,  hi:0,    dir:'lower',  unit:'°' },
  aiArrive:    { stat:'passing',   lo:0.85, hi:1.15, dir:'higher', unit:'j/s' },
  pickupBase:  { stat:'control',   lo:0.80, hi:1.25, dir:'higher', unit:'j' },
  lungeSpeed:  { stat:'control',   lo:0.80, hi:1.25, dir:'higher', unit:'%' },
  // Obrana je ŠIROKÁ, na rozdíl od rychlosti: při základu 80 ms dává 200 / 80 / 32 ms.
  // Užší rozpětí (1.60 → 0.50) bylo měřitelně k nerozeznání — mužstvo samých dvacítek
  // drželo blok stejně jako mužstvo padesátek. Základ 80 zůstává, hýbe se jen rozptyl.
  defReact:    { stat:'defending', lo:2.50, hi:0.40, dir:'lower',  unit:'ms' },
  tackleR:     { stat:'defending', lo:0.50, hi:1.60, dir:'higher', unit:'j' },
  gkReaction:  { stat:'reflexes',  lo:1.60, hi:0.50, dir:'lower',  unit:'ms' },
  gkError:     { stat:'accuracy',  lo:1.70, hi:0.40, dir:'lower',  unit:'j' },
  gkDiveSpeed: { stat:'rushing',   lo:0.85, hi:1.15, dir:'higher', unit:'%' },
  gkRushSpeed: { stat:'rushing',   lo:0.85, hi:1.15, dir:'higher', unit:'%' }
};
// Popisky hodnocení pro menu. Zkratka se vejde do řádku soupisky, celý název do listu hráče.
export const STAT_LABEL = {
  speed:     { cs:'Rychlost',   abbr:'RYC' },
  accel:     { cs:'Zrychlení',  abbr:'ZRY' },
  dribble:   { cs:'Driblink',   abbr:'DRI' },
  passing:   { cs:'Přihrávka',  abbr:'PŘI' },
  control:   { cs:'Zpracování', abbr:'ZPR' },
  defending: { cs:'Obrana',     abbr:'OBR' },
  reflexes:  { cs:'Reflexy',    abbr:'REF' },
  accuracy:  { cs:'Přesnost',   abbr:'PŘE' },
  rushing:   { cs:'Výběh',      abbr:'VÝB' }
};
// které konstanty dané hodnocení táhne — menu podle toho ukazuje, co z čísla vyleze
export function keysOfStat(name){
  var out = [];
  for(var k in STAT_SCALE) if(STAT_SCALE[k].stat === name) out.push(k);
  return out;
}
// `dir` není dekorace: musí sedět s tím, co dělají lo/hi. Kdyby se rozpětí přeladilo a směr
// se zapomněl otočit, chytí se to při načtení, ne až v zápase.
for(const k in STAT_SCALE){
  const s = STAT_SCALE[k];
  if((s.hi < s.lo) !== (s.dir === 'lower'))
    console.error('STAT_SCALE: ' + k + ' má dir "' + s.dir + '", ale lo/hi jdou opačně');
}

export function ratingMul(key, r){
  var s = STAT_SCALE[key]; if(!s) return 1;
  r = Math.max(0, Math.min(99, r));
  return r <= 50 ? s.lo + (1 - s.lo)*(r/50) : 1 + (s.hi - 1)*((r - 50)/49);
}
export function mkRatings(role){
  var list = role === 'gk' ? KEEPER_STATS : OUTFIELD_STATS, r = {};
  for(var i=0;i<list.length;i++) r[list[i]] = 50;
  return r;
}
// Předpočítá se NÁSOBITEL, ne výsledná hodnota. Násobitel závisí jen na hodnocení, takže se
// přepočítá při jeho změně, kdežto samotný základ se čte z T až při použití — jinak by
// posuvník v panelu přestal fungovat, dokud se nepřestaví týmy. Tím padne i celá interpolace
// z vnitřní smyčky a zůstane jedno násobení, což je stejná cena jako dřívější ternár.
export function resolveRatings(p){
  var m = {};
  for(var key in STAT_SCALE){
    var s = STAT_SCALE[key];
    m[key] = (p.ratings && p.ratings[s.stat] !== undefined) ? ratingMul(key, p.ratings[s.stat]) : 1;
  }
  p.mul = m;
}
// JEDINÝ přístup ke škálované konstantě. Klíčem je konstanta v T (ne hodnocení), protože
// jedno hodnocení jich táhne víc. Hráč, který dané hodnocení nemá (brankář nemá `speed`),
// dostane násobitel 1, tedy holý základ.
export function stat(p, key){
  var m = p && p.mul;
  return T[key] * ((m && m[key] !== undefined) ? m[key] : 1);
}
