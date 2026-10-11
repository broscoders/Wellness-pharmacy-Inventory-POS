// Tiny sounds for the counter: a short tick when a medicine is added, a low buzz when something is wrong.
// Helps when the cashier is looking at the customer or scanning a pile of items. Can be muted on the POS screen.
let ctx;
export function beep(kind = 'ok') {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = kind === 'ok' ? 'sine' : 'square';
    o.frequency.value = kind === 'ok' ? 1040 : 180;
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === 'ok' ? 0.07 : 0.22));
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (kind === 'ok' ? 0.08 : 0.24));
  } catch { /* no audio available */ }
}
