// Simulační krok, smyčka a start.
import { T, FIELD_W, BALL_R, CONTACT, STEAL_LOCK } from './config.js';
import { S, E, ball, touch, joyBase, resize, buildTeams, reset, dist, clampField,
         histPush, locked } from './state.js';
import { foesOf, speedOf, stealR, inOwnBox, bufferInput, updateClaim, lungeStep, lungeActive,
         carryChase, startKick, holdBall, doPass, pickChasers, rollDist,
         driveMove, refreshPeakGap } from './util.js';
import { updateJoyBase, passPower, passSpeedFor } from './input.js';
import { attack } from './ai-off.js';
import { defend } from './ai-def.js';
import { driveCarrier } from './ai-ball.js';
import { playKeeper, parry, rushing, rushClear } from './keeper.js';
import { goal, showScore } from './match.js';
import { draw } from './render.js';
import { buildPanel, clearStore } from './ui.js';
import { buildMenu, openMenu } from './menu.js';

function step(dt){
  S.time += dt;
  if(S.lockOut > 0) S.lockOut -= dt;
  if(S.gkClearOut > 0) S.gkClearOut -= dt;

  // Paměť držitele se plní tady, ještě než se čímkoli hne — nejnovější vzorek pak odpovídá
  // tomu, co v tomhle snímku čte AI. Čte z ní jen presující obránce (perceivedBall).
  histPush();

  // Nárok se řeší jako první: pohybové bloky níž se ptají lungeActive(), jestli mají
  // hráče pustit ke slovu, takže potřebují čerstvý výsledek.
  updateClaim();

  // --- ovládaný hráč ---
  var joyR = T.joyR, thresh = joyR * (T.passThresh/100);
  var aimX = 0, aimY = 0, aiming = false, moveSF = 0, aimPw = 0;

  // Kdo teď smí nabíjet: buď mám míč, nebo je míč volný a narokoval si ho někdo z mého týmu —
  // ten ho zpracuje jako první, takže se přihrávka nachystá JEMU a odehraje se z první.
  // Nárok počítá updateClaim() výš, takže tady stačí přečíst ball.claim. Když je míč volný a
  // nikdo z našich ho nemá narokovaný (nikdo, nebo soupeř), nenabíjí se a nic se nekreslí.
  S.recv = (!ball.owner && ball.claim && ball.claim.team === S.ctrl.team) ? ball.claim : null;
  S.aimFrom = ball.owner === S.ctrl ? S.ctrl : S.recv;

  var sx = S.ctrl.fx, sy = S.ctrl.fy, stickSF = 0, stickD = 0;
  if(touch.active){
    var dx = touch.x - joyBase.x, dy = touch.y - joyBase.y;
    stickD = Math.sqrt(dx*dx+dy*dy);
    if(stickD > 0.001){
      sx = dx/stickD; sy = dy/stickD; stickSF = Math.min(stickD/joyR, 1);
      // mimo práh je přihrávka nabitá a míří tam, kde je prst teď
      if(stickD > thresh && S.aimFrom){ aiming = true; aimX = sx; aimY = sy; aimPw = passPower(stickD); }
    }
  }
  // Míření na volný míč je MÍŘENÍ, ne povel k běhu, a nesmí hráčem hýbat. Při driblinku to
  // vychází samo (držitele veze carryChase, stick se jen bufferuje), ale u volného míče řídí
  // stick ovládaného hráče živě — bez tohohle by ho každé zamíření rozeběhlo směrem míření
  // plnou rychlostí: naměřeno 115 jednotek za půlvteřinové zamíření, 36 css px na 375px
  // displeji. Míření tak nic nestojí a obě situace se chovají stejně.
  // Nestojí to ani žádné ovládání: běhová zóna je 0–joyR, míření začíná až za passThresh
  // (70 vs 85 px), takže sprintovat za volným míčem jde pořád.
  if(aiming && !ball.owner){ sx = S.ctrl.fx; sy = S.ctrl.fy; stickSF = 0; }

  // vstup se nabufferuje; v cyklu doteku se běží po touchDir, ne po sticku — proto zvednutý
  // prst hráče uprostřed cyklu nezastaví a dotek (a s ním nachystaná přihrávka) vždycky přijde
  var mv = bufferInput(S.ctrl, sx, sy, stickSF);
  // s míčem ho vede doběh, a při zpracování cuknutí — ale to jen když po něm opravdu něco
  // chce. Když si míč jede rovnou na něj, řídí dál stickem a nic ho nemrazí.
  var driven = (ball.owner === S.ctrl) || lungeActive(S.ctrl);
  if(!driven && (mv.sf > 0 || T.accelTime > 0)){
    if(!(T.accelTime > 0)){
      var sp = speedOf(S.ctrl) * mv.sf, x0 = S.ctrl.x, y0 = S.ctrl.y;
      S.ctrl.fx = mv.x; S.ctrl.fy = mv.y;
      S.ctrl.x += mv.x*sp*dt; S.ctrl.y += mv.y*sp*dt;
      clampField(S.ctrl);
      // sf = podíl ze SKUTEČNĚ ušlé vzdálenosti. U mantinelu clampField krok uřízne, ale zadaná
      // rychlost zůstala — hráč stál a hlásil sf=1, čímž se nafukoval předkop i míření AI.
      var mvx = S.ctrl.x - x0, mvy = S.ctrl.y - y0, full = speedOf(S.ctrl)*dt;
      moveSF = full > 0 ? Math.min(1, Math.sqrt(mvx*mvx + mvy*mvy)/full) : 0;
      S.ctrl.vx = mvx/dt; S.ctrl.vy = mvy/dt;
    } else {
      // výchylka sticku = CÍLOVÁ rychlost, ne zrychlení: půlka výchylky znamená běh na půl
      driveMove(S.ctrl, mv.x, mv.y, speedOf(S.ctrl)*mv.sf, dt);
      moveSF = S.ctrl.sf;
    }
  }

  // prst zvednutý mimo práh → přihrávka se NACHYSTÁ a odehraje se až při nejbližším doteku.
  // Míč je teď často kus před nohou, takže odehrát ho z místa, kde zrovna leží, nejde.
  // Puštění znovu před odehráním tu předchozí přepíše.
  // until = 0 znamená „hodiny ještě neběží": nachystaná přihrávka na letící míč nesmí vypršet,
  // dokud je míč volný a náš — let může trvat déle než passQueueMax. Odpočet začíná až
  // získáním míče (viz převzetí níž), ne puštěním prstu.
  if(touch.fire){
    // aim:true = směr je zatím ČISTĚ ten zamířený. Nepřesnost podle hodnocení `passing`
    // se přidá až v doPass, tedy v okamžiku odehrání — plán AI si ji nese už z kickPlan,
    // ale člověk ji nesmí vidět dopředu, jinak by si ji stickem vykompenzoval.
    if(S.aimFrom)
      ball.pending = { x:touch.fire.x, y:touch.fire.y, speed:passSpeedFor(touch.fire.pw),
                       until: ball.owner === S.ctrl ? S.time + T.passQueueMax/1000 : 0,
                       aim:true };
    touch.fire = null;
  }

  if(!driven) S.ctrl.sf = moveSF;      // jinak sf nastavuje doběh / cuknutí

  // --- kdo útočí: tým s míčem, a když je míč v letu, ten, kdo ho odehrál ---
  var carrier = ball.owner;
  var attTeam = carrier ? carrier.team : S.lastTeam;

  playKeeper(E.gkB, dt); playKeeper(E.gkR, dt);
  if(carrier && carrier !== S.ctrl) driveCarrier(carrier, dt);

  if(attTeam === 'b'){ attack(E.blue, carrier, dt); defend(E.red, dt); }
  else               { attack(E.red, carrier, dt);  defend(E.blue, dt); }

  // --- cuknutí po narokovaném míči ---
  // Kdo má míč na dráze skrz svůj dosah zpracování a stihne ho, ten si ho narokuje a vrhne
  // se na místo, KDE MÍČ BUDE — ale jen pokud se kvůli tomu vůbec musí hnout (viz moveTo).
  lungeStep(dt);

  // --- doběh držitele: běží automaticky NA MÍČ, ne po uloženém vektoru ---
  carryChase(dt);

  // --- míč: VŽDYCKY obyčejná fyzika, nikdy přilepený na hráče ---
  var sp2 = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  if(sp2 > 0){
    var ns = Math.max(0, sp2 - T.friction*dt);
    ball.vx = ball.vx/sp2*ns; ball.vy = ball.vy/sp2*ns;
  }
  ball.x += ball.vx*dt; ball.y += ball.vy*dt;
  if(ball.x < BALL_R){ ball.x = BALL_R; ball.vx = -ball.vx*0.72; }
  if(ball.x > FIELD_W-BALL_R){ ball.x = FIELD_W-BALL_R; ball.vx = -ball.vx*0.72; }
  // v brance se míč neodrazí — projde a je gól
  var inMouth = Math.abs(ball.x - FIELD_W/2) < T.goalW/2;
  if(ball.y < BALL_R){
    if(inMouth){ goal('b'); return; }
    ball.y = BALL_R; ball.vy = -ball.vy*0.72;
  }
  if(ball.y > S.FIELD_H-BALL_R){
    if(inMouth){ goal('r'); return; }   // vlastní gól se počítá
    ball.y = S.FIELD_H-BALL_R; ball.vy = -ball.vy*0.72;
  }
  // odraz otočil volný míč o víc než 90° → závazek přestal dávat smysl, přepočítat
  if(!ball.owner){
    var vb = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
    if(vb > 0.001 && (ball.vx/vb*ball.chaseDir.x + ball.vy/vb*ball.chaseDir.y) < 0) pickChasers();
  }

  // pojistka: mezera nikdy nemá přesáhnout dvojnásobek odvozeného vrcholu. Nic se nespravuje —
  // jen se to zaznamená i se stavem, který to způsobil, ať je vidět, že se to stalo.
  refreshPeakGap();
  if(ball.owner && !ball.held){
    var gap = dist(ball.owner, ball);
    if(gap > 2*ball.peakGap){
      S.gapWarn = (S.gapWarn || 0) + 1;
      if(!S.gapWarnLog) S.gapWarnLog = [];
      if(S.gapWarnLog.length < 20){
        S.gapWarnLog.push({ t:+S.time.toFixed(2), gap:+gap.toFixed(1), peak:+ball.peakGap.toFixed(1),
                            chaseV:+ball.chaseV.toFixed(1), ballV:+Math.sqrt(ball.vx*ball.vx+ball.vy*ball.vy).toFixed(1),
                            team:ball.owner.team, ctrl:ball.owner === S.ctrl });
        console.warn('carry gap over 2x derived peak', S.gapWarnLog[S.gapWarnLog.length-1]);
      }
    }
  }

  // --- výběh: brankář, který doběhl tělem k míči, ho NEZÍSKÁ, ale vykopne pryč ---
  // Musí to být PŘED odebráním: dosah odebrání (18) je kratší než dotek tělem (25), takže by
  // brankář jinak míč sebral dřív, než by se k němu vůbec dostal. Samotné odebrání se nemění.
  if(ball.owner && ball.owner.role !== 'gk'){
    var rgk = ball.owner.team === 'b' ? E.gkR : E.gkB;
    if(rushing(rgk) && dist(rgk, ball) <= CONTACT) rushClear(rgk);
  }

  // --- odebrání: soupeř, který se dotkne míče, ho získá (platí i u nohy) ---
  // brankář s míčem ve vlastním vápně je po gkHoldMax nedotknutelný, pak už ne
  var gkSafe = ball.owner && ball.owner.role === 'gk' && inOwnBox(ball.owner)
               && (S.time - ball.gained) < T.gkHoldMax/1000;
  if(ball.owner && !gkSafe){
    var fo = foesOf(ball.owner);
    for(var s1=0;s1<fo.length;s1++){
      if(locked(fo[s1])) continue;
      if(dist(fo[s1], ball) < stealR(fo[s1])){
        S.lockedPlayer = ball.owner; S.lockOut = STEAL_LOCK;
        ball.owner = fo[s1]; ball.vx = ball.vy = 0; ball.held = true; S.lastTeam = fo[s1].team;
        ball.gained = S.time; ball.pending = null; pickChasers();
        break;
      }
    }
  }

  // --- převzetí: JEDINÉ místo, kde se volný míč zastaví, je dotyk tělem ---
  // Dosah zpracování už míč nebrzdí ani nestáčí — jen určuje, kdo si ho narokuje (updateClaim
  // výš). Míč si letí dál přesně tak, jak letěl, dokud ho někdo fyzicky nezastihne.
  if(!ball.owner){
    var taker = null, takeD = 1e9;
    for(var k=0;k<E.all.length;k++){
      var p = E.all[k];
      if(locked(p)) continue;
      var pd = dist(p, ball);
      if(pd <= CONTACT && pd < takeD){ takeD = pd; taker = p; }
    }
    if(taker){
      var tv = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
      if(taker.role === 'gk' && tv > T.gkParrySpeed) parry(taker);   // moc rychlé na chycení
      else {
        ball.owner = taker; ball.vx = ball.vy = 0; ball.held = true; S.lastTeam = taker.team;
        ball.claim = null; ball.gained = S.time;
        // Nachystaná přihrávka PŘEŽIJE převzetí vlastním hráčem: blok kontaktu hned pod tímhle
        // ji v tomtéž snímku odehraje, takže se hraje z první — příjem je ten dotek, který ji
        // odehrává. Soupeřovo převzetí ji zahodí. Odpočet vypršení začíná až tady.
        if(taker.team !== S.ctrl.team){
          ball.pending = null; S.aimFrom = null; S.recv = null;   // ať linka zmizí týmž snímkem
        } else if(ball.pending && !ball.pending.until){
          ball.pending.until = S.time + T.passQueueMax/1000;
        }
        pickChasers();
      }
    }
  }

  // --- kontakt: tělo držitele dostihlo míč. Konec cyklu je VÝSLEDEK VZDÁLENOSTI, ne odpočtu. ---
  // Teprve tady se projeví, co mezitím udělal stick: pokračovat, zastavit, změnit směr
  // nebo rychlost, nebo odehrát nachystanou přihrávku.
  if(ball.owner){
    var o = ball.owner;
    if(ball.pending && ball.pending.until && S.time > ball.pending.until) ball.pending = null;
    if(dist(o, ball) <= CONTACT){
      if(ball.pending){
        // odehrává se z místa míče a v uloženém směru, ne kam ukazuje prst teď
        var pp = ball.pending; ball.pending = null;
        // nepřesnost se počítá tomu, kdo do míče doopravdy kope, ne tomu, kdo mířil —
        // jednodotykovou přihrávku může odehrát i jiný spoluhráč, který k míči dorazí dřív
        doPass(pp.x, pp.y, pp.speed, pp.aim ? o : null);
      } else {
        // Se setrvačností nesmí hráč kopnout tvrději, než jak rychle opravdu běží: bsf je jen
        // ZÁMĚR (výchylka sticku) a při rozjezdu je 1, i když hráč skoro stojí — míč by odletěl
        // rychlostí 300 hráči, který má 0 (naměřen vrchol mezery 91,8 proti pojistce 75).
        // Bere se z VEKTORU rychlosti, ne z p.sf: to je při drženém míči nulované, a m by pak
        // bylo pořád nula, takže by se nikdy nekoplo.
        var m = o.bsf || 0;
        if(T.accelTime > 0){
          var vv = Math.sqrt(o.vx*o.vx + o.vy*o.vy);
          m = Math.min(m, vv/Math.max(1, speedOf(o)));
        }
        if(m > 0) startKick(o, o.bx, o.by, m);
        else holdBall(o);                    // prst dole → stojí a míč leží u nohy
      }
    }
  }

  // --- kdo je ovládaný ---
  if(ball.owner && ball.owner.team === 'b' && ball.owner.role !== 'gk'){
    S.ctrl = ball.owner;                       // s míčem: přepnutí v momentě převzetí
  } else if(ball.owner && ball.owner.team === 'r'){
    // při bránění ovládáš nejbližšího k míči; hystereze 25, ať to nepřeskakuje
    var bd = (S.ctrl && S.ctrl.team === 'b' && S.ctrl.role !== 'gk') ? dist(S.ctrl, ball) : 1e9;
    for(var c1=0;c1<E.blue.length;c1++){
      var cb = E.blue[c1];
      if(cb.role === 'gk') continue;
      var cd2 = dist(cb, ball);
      if(cd2 < bd - 25){ bd = cd2; S.ctrl = cb; }
    }
  }

  // uložit aiming pro vykreslení
  // linka je jen podíl ze skutečného doletu — má ukázat směr a sílu, ne prozradit dopad
  S.drawAim = aiming ? { x:aimX, y:aimY, len:rollDist(passSpeedFor(aimPw)) * (T.aimLen/100) } : null;
}

// ---- hlavní smyčka ----
let last = performance.now();
function frame(now){
  var dt = Math.min((now-last)/1000, 0.033); last = now;
  updateJoyBase();

  // Došlo se do cíle → zpátky do menu, se skóre. Skóre nuluje až další výkop, takže je
  // na domovské obrazovce pořád vidět. Nic se nerozehrává samo a klepnutím se nic neopakuje.
  if(S.matchOver && S.screen === 'game') openMenu(true);

  if(!S.running && !S.matchOver && S.deadTime > 0){
    S.deadTime -= dt;
    if(S.deadTime <= 0){ reset(S.kickNext); S.running = true; }
  }

  if(S.running) step(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---- start ----
window.addEventListener('resize', resize);
resize();
buildTeams();      // uložená hodnocení naskočí uvnitř, přes hooks.applyRatings
buildPanel();
buildMenu();
clearStore();      // T se bere z config.js; případný starý uložený blob jen zahodíme

// Rozestaví hřiště, ať je pod menu vidět, ale zápas nespustí — ten začíná až tlačítkem.
reset(); showScore();
openMenu(false);
requestAnimationFrame(frame);
