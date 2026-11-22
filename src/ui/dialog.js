// 画面のまん中に出す箱（ダイアログ）。main＝ゲームの進行用、upper＝やめる確認・あそびかた用
import { sfx } from '../sfx.js';

export const ABORT = Symbol('abort');

function makeLayer(overlayEl) {
  const sheet = overlayEl.querySelector('.sheet');
  let st = null;
  function finish(v) {
    if (!st) return;
    const s = st;
    st = null;
    clearTimeout(s.timer);
    if (s.cleanup) s.cleanup();
    overlayEl.classList.remove('open');
    setTimeout(() => { if (!st) overlayEl.hidden = true; }, 220);
    s.resolve(v);
  }
  /**
   * tone: 見た目の色（good/bad/info/turn など）
   * buttons: [{label, value, kind}]（kind に primary をふくむものが Enter で押される）
   * auto: ミリ秒たったら自動で閉じる
   * mount(sheet, finish): 中身を自分で動かしたいとき（問題など）
   */
  function dialog({ tone = 'info', cls = '', title = '', body = '', buttons = [{ label: 'OK', value: true, kind: 'primary' }], auto = 0, autoValue, top = false, mount } = {}) {
    if (st) finish(ABORT);
    return new Promise(resolve => {
      sheet.className = `sheet tone-${tone} ${cls}`;
      sheet.innerHTML = `${title ? `<h2 class="s-title">${title}</h2>` : ''}<div class="s-body"></div>${buttons.length ? '<div class="s-actions"></div>' : ''}`;
      const bodyEl = sheet.querySelector('.s-body');
      if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
      const s = st = { resolve, openedAt: performance.now(), timer: 0, cleanup: null, primary: buttons.find(b => (b.kind || '').includes('primary')) || buttons[0] };
      const own = v => { if (st === s) finish(v); };
      for (const b of buttons) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `btn ${b.kind || ''}`;
        el.textContent = b.label;
        el.addEventListener('click', () => { if (performance.now() - s.openedAt < 280) return; sfx('tap'); own(b.value); });
        sheet.querySelector('.s-actions').append(el);
      }
      overlayEl.classList.toggle('top', !!top);
      overlayEl.hidden = false;
      sheet.scrollTop = 0;
      const open = () => { if (st === s) overlayEl.classList.add('open'); };
      requestAnimationFrame(open);
      setTimeout(open, 60); // 画面が かくれていて 絵が 止まっていても ひらく
      if (auto) s.timer = setTimeout(() => own(autoValue !== undefined ? autoValue : s.primary && s.primary.value), auto);
      if (mount) s.cleanup = mount(sheet, own) || null;
    });
  }
  return {
    dialog,
    finish,
    isOpen: () => !!st,
    pressPrimary() {
      if (sheet.classList.contains('cpu')) return; // CPU・ほかの iPad の人が えらんでいる
      if (st && st.primary && performance.now() - st.openedAt > 280) { sfx('tap'); finish(st.primary.value); }
    },
  };
}

export const main = makeLayer(document.querySelector('#overlay'));
export const upper = makeLayer(document.querySelector('#overlay2'));
