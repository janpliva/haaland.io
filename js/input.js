// Joystick: dotyk i myš. Přihrávka se nabíjí za prahovým kruhem a odehraje se zvednutím prstu.
import { T } from './config.js';
import { S, cv, joyBase, touch } from './state.js';
import { skipPause } from './match.js';

export function updateJoyBase(){ joyBase.x = S.cssW * 0.5; joyBase.y = S.cssH - Math.max(96, T.joyR + 40); }

// síla přihrávky podle toho, jak daleko za prahovým kruhem je prst (0 = na kruhu, 1 = plná)
export function passPower(d){
  var th = T.joyR*(T.passThresh/100);
  return Math.max(0, Math.min(1, (d - th) / Math.max(1, T.passRange)));
}
export function passSpeedFor(pw){
  var lo = T.passSpeed * (T.passMin/100);
  return lo + (T.passSpeed - lo) * pw;
}

function onDown(x, y, id){
  if(S.screen !== 'game') return;        // v menu se plátnem neovládá nic
  // pauza po gólu se dá přeskočit klepnutím; konec zápasu ne — z toho se jde do menu
  if(!S.running){ if(!S.matchOver) skipPause(); return; }
  touch.active = true; touch.id = id; touch.x = x; touch.y = y;
}
function onMove(x, y, id){ if(touch.active && touch.id === id){ touch.x = x; touch.y = y; } }
// zvednutí prstu mimo práh = přihrávka tím směrem; zvednutí uvnitř = nic (nabití zrušeno návratem)
function onUp(x, y, id, cancel){
  if(touch.id !== id) return;
  if(!cancel){
    var dx = x - joyBase.x, dy = y - joyBase.y, d = Math.sqrt(dx*dx+dy*dy);
    // čím dál za prahem prst zvedneš, tím silnější přihrávka
    if(d > T.joyR*(T.passThresh/100)) touch.fire = { x:dx/d, y:dy/d, pw:passPower(d) };
  }
  touch.active = false; touch.id = null;
}

cv.addEventListener('touchstart', function(e){
  e.preventDefault();
  var t = e.changedTouches[0];
  if(!touch.active) onDown(t.clientX, t.clientY, t.identifier);
}, {passive:false});
cv.addEventListener('touchmove', function(e){
  e.preventDefault();
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i]; onMove(t.clientX, t.clientY, t.identifier);
  }
}, {passive:false});
cv.addEventListener('touchend', function(e){
  e.preventDefault();
  for(var i=0;i<e.changedTouches.length;i++){
    var t = e.changedTouches[i]; onUp(t.clientX, t.clientY, t.identifier, false);
  }
}, {passive:false});
cv.addEventListener('touchcancel', function(e){
  // přerušení systémem není záměrné puštění — nepřihrává se
  for(var i=0;i<e.changedTouches.length;i++){
    var t2 = e.changedTouches[i]; onUp(t2.clientX, t2.clientY, t2.identifier, true);
  }
});

// myš pro desktop
cv.addEventListener('mousedown', function(e){ onDown(e.clientX, e.clientY, 'm'); });
window.addEventListener('mousemove', function(e){ onMove(e.clientX, e.clientY, 'm'); });
window.addEventListener('mouseup', function(e){ onUp(e.clientX, e.clientY, 'm', false); });
