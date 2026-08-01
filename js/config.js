// Konstanty a laditelné hodnoty. Tohle je jediné místo, kde se mění výchozí hodnoty —
// panel i DEFAULTS se generují z TUNABLES, takže nový posuvník = jeden řádek tady.

export const FIELD_W = 1200;
export const PH = 15;                  // půlka strany hráče
export const BALL_R = 10;
export const CONTACT = PH + BALL_R;    // vzdálenost středů, kdy se hráč míče dotýká
export const GOAL_DEPTH = 60;          // jen vykreslení brankoviště, nemá vliv na hru
export const STEAL_LOCK = 0.5;         // po odebrání si původní držitel nemůže hned vzít míč zpět
export const SETTLE = 0.3;             // než AI po zisku míče smí kopnout — jinak odpaluje z první

export function dirOf(team){ return team === 'b' ? -1 : 1; }   // kterým směrem tým útočí

export const TUNABLES = [
  // Kolik hráčů v poli; brankář se do počtu nepočítá. Změna rozehraje nový zápas.
  { key:'teamSize',      def:5,    min:1,   max:6,    step:1,   label:'Hráčů v mém týmu',            group:'Týmy', rebuild:true },
  { key:'foeSize',       def:5,    min:1,   max:6,    step:1,   label:'Hráčů v týmu soupeře',        group:'Týmy', rebuild:true },

  // Maximální rychlosti. Ovládaný hráč má vlastní, AI zvlášť pro každý tým.
  { key:'playerSpeed',   def:200,  min:120, max:320,  step:5,   label:'Rychlost ovládaného hráče',   group:'Pohyb' },
  { key:'mateSpeed',     def:200,  min:100, max:320,  step:5,   label:'Rychlost spoluhráče (AI)',    group:'Pohyb' },
  { key:'foeSpeed',      def:200,  min:100, max:320,  step:5,   label:'Rychlost soupeřů (AI)',       group:'Pohyb' },

  // Jak se míč chová u nohy: kdo ho kdy má, jak daleko se předkopává a jak tvrdě poslouchá.
  { key:'pickupMate',    def:40,   min:16,  max:90,   step:1,   label:'Dosah zpracování — můj tým',  group:'Míč' },
  { key:'foePickup',     def:40,   min:16,  max:90,   step:1,   label:'Dosah zpracování — soupeř',   group:'Míč' },
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

  // Síla přihrávky se odvíjí od toho, jak daleko za prahem zvedneš prst.
  { key:'passSpeed',     def:800,  min:300, max:1100, step:20,  label:'Síla přihrávky',              group:'Přihrávka' },
  { key:'passRange',     def:120,  min:40,  max:260,  step:5,   label:'Dosah síly přihrávky',        group:'Přihrávka' },
  { key:'passMin',       def:40,   min:10,  max:90,   step:5,   label:'Nejslabší přihrávka (%)',     group:'Přihrávka' },
  { key:'aimLen',        def:33,   min:5,   max:100,  step:1,   label:'Délka linky míření (%)',      group:'Přihrávka' },
  { key:'aiArrive',      def:220,  min:50,  max:500,  step:10,  label:'Dojezdová rychlost přihrávky AI', group:'Přihrávka' },
  // přihrávka se odehraje až při nejbližším doteku; po tomhle čase se nachystaná zahodí
  { key:'passQueueMax',  def:700,  min:200, max:2000, step:50,  label:'Nejdelší čekání na přihrávku (ms)', group:'Přihrávka' },
  { key:'passLead',      def:90,   min:0,   max:300,  step:5,   label:'Přihrávka před hráče',        group:'Přihrávka' },

  // Velikost joysticku a kde začíná nabíjení přihrávky.
  { key:'joyR',          def:70,   min:40,  max:100,  step:2,   label:'Velikost joysticku',          group:'Joystick' },
  { key:'passThresh',    def:122,  min:100, max:180,  step:2,   label:'Práh přihrávky',              group:'Joystick' },

  // Rozměry branky a délka zápasu. Šířkou branky se škáluje i vápno.
  { key:'goalW',         def:240,  min:100, max:500,  step:10,  label:'Šířka branky',                group:'Hřiště a zápas' },
  { key:'targetGoals',   def:5,    min:1,   max:15,   step:1,   label:'Hraje se do N gólů',          group:'Hřiště a zápas' },

  // Rozhodování hráče s míčem a náběhy bez míče.
  { key:'shootRange',    def:700,  min:200, max:1600, step:20,  label:'Odkud AI střílí',             group:'Útok AI' },
  { key:'soloLane',      def:50,   min:20,  max:160,  step:5,   label:'Sólo koridor',                group:'Útok AI' },
  { key:'foeError',      def:0,    min:0,   max:35,   step:1,   label:'Nepřesnost AI (°)',           group:'Útok AI' },
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
  // Presující obránce vidí držitele míče se zpožděním: běží na to, co držitel dělal před
  // defReact ms, takže po kličce je defReact dlouho zavázaný ve starém směru (viz
  // perceivedBall v util.js). Týká se JEN presinku na držitele — ne tvaru bloku, hlídání,
  // brankáře ani odebrání, a rovnou stejně obou týmů.
  { key:'defReact',      def:600,  min:0,   max:600,  step:10,  label:'Reakční čas obránce (ms)',    group:'Obrana' },

  // Brankář chytá tělem; tohle řídí jen postavení, reakci, zákrok a rozehrávku.
  { key:'gkDepth',       def:55,   min:0,   max:160,  step:5,   label:'Vysunutí brankáře',           group:'Brankář' },
  { key:'gkReaction',    def:180,  min:0,   max:500,  step:10,  label:'Reakce brankáře (ms)',        group:'Brankář' },
  { key:'gkError',       def:25,   min:0,   max:200,  step:5,   label:'Nepřesnost brankáře',         group:'Brankář' },
  { key:'gkDiveSpeed',   def:160,  min:100, max:300,  step:5,   label:'Rychlost zákroku (%)',        group:'Brankář' },
  { key:'gkParrySpeed',  def:520,  min:200, max:1000, step:20,  label:'Rychlost odrazu místo chycení', group:'Brankář' },
  { key:'gkParryKeep',   def:45,   min:10,  max:90,   step:5,   label:'Síla odrazu (%)',             group:'Brankář' },
  { key:'gkHoldMax',     def:1200, min:300, max:3000, step:100, label:'Držení míče brankářem (ms)',  group:'Brankář' },
  { key:'gkVentureSafe', def:260,  min:80,  max:600,  step:10,  label:'Bezpečná zóna pro výběh',     group:'Brankář' },
  { key:'gkVenture',     def:150,  min:0,   max:500,  step:10,  label:'Jak daleko smí brankář vyjet', group:'Brankář' }
];

// T se mutuje po jednotlivých klíčích, nikdy se nepřiřazuje celé.
export const T = {};
export const DEFAULTS = {};
for(const t of TUNABLES){ T[t.key] = t.def; DEFAULTS[t.key] = t.def; }
