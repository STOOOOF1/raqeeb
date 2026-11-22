'use strict';
// المظهر: خمسة ثيمات لونية + وضع فاتح/داكن/تلقائي، يُحفظ لكل جهاز في localStorage.
// يُحمَّل في <head> قبل رسم الصفحة كي لا يظهر وميض بالألوان الافتراضية.
// ويوفّر أيضًا أيقونات SVG موحّدة لشريط التبويبات (CKTheme.icon).
window.CKTheme = (() => {
  const THEMES = [
    { id: 'teal', name: 'زمرّدي', a: '#0f766e', b: '#14b8a6' },
    { id: 'indigo', name: 'بنفسجي', a: '#4f46e5', b: '#a855f7' },
    { id: 'ocean', name: 'أزرق', a: '#0369a1', b: '#06b6d4' },
    { id: 'rose', name: 'وردي', a: '#be185d', b: '#fb7185' },
    { id: 'amber', name: 'عنبري', a: '#b45309', b: '#f59e0b' },
  ];
  const MODES = [['light', 'فاتح'], ['dark', 'داكن'], ['auto', 'تلقائي']];
  const K_THEME = 'ck-theme', K_MODE = 'ck-mode';
  const get = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* تخزين محظور */ } };
  const dark = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

  const theme = () => { const t = get(K_THEME, 'teal'); return THEMES.some((x) => x.id === t) ? t : 'teal'; };
  const mode = () => { const m = get(K_MODE, 'light'); return MODES.some(([x]) => x === m) ? m : 'light'; };
  const scheme = () => (mode() === 'auto' ? (dark && dark.matches ? 'dark' : 'light') : mode());

  function apply() {
    const r = document.documentElement;
    r.dataset.theme = theme();
    r.dataset.mode = scheme();
    // لون شريط النظام في الجوال يتبع خلفية الثيم
    requestAnimationFrame(() => {
      const bg = getComputedStyle(r).getPropertyValue('--bg').trim();
      let m = document.querySelector('meta[name=theme-color]');
      if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.append(m); }
      if (bg) m.content = bg;
    });
  }
  function set(t, m) {
    if (t) put(K_THEME, t);
    if (m) put(K_MODE, m);
    document.documentElement.classList.add('theming'); // انتقال ناعم للألوان عند التبديل فقط
    apply();
    setTimeout(() => document.documentElement.classList.remove('theming'), 400);
  }
  if (dark && dark.addEventListener) dark.addEventListener('change', () => { if (mode() === 'auto') apply(); });
  apply();

  // ---------- الأيقونات (خطية بسماكة موحّدة) ----------
  const P = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    apps: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
    tasks: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/>',
    bulb: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.7 10.7c.7.6 1.2 1.4 1.2 2.3h5c0-.9.5-1.7 1.2-2.3A6 6 0 0 0 12 3Z"/>',
    book: '<path d="M4.5 18.5V5.5a2 2 0 0 1 2-2h13v14h-13a2 2 0 0 0-2 2Zm0 0a2 2 0 0 0 2 2h13"/><path d="M9 8h6"/>',
    chat: '<path d="M20.5 11.5a8 8 0 0 1-11.8 7.1L3.5 20l1.4-4.9a8 8 0 1 1 15.6-3.6Z"/>',
    settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
    more: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
    play: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9.2 4.8 2.8-4.8 2.8Z"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1-1.6-1-2.8 0-1 .8-1.6 1.8-1.6h2.2a3.7 3.7 0 0 0 3.7-3.7c0-4-3.8-7.2-8.5-7.2Z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'svg-ic'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = P[name] || P.more;
    return s;
  }

  // ---------- منتقي المظهر (بطاقة الإعدادات) ----------
  function picker() {
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    const card = el('div', 'card theme-card');
    const head = el('h2', 'row'); head.append(icon('palette'), el('span', '', 'المظهر'));
    const sw = el('div', 'swatches'), seg = el('div', 'tabs seg');
    const draw = () => {
      sw.replaceChildren(...THEMES.map((t) => {
        const b = el('button', 'swatch' + (t.id === theme() ? ' on' : ''));
        b.type = 'button'; b.setAttribute('aria-pressed', t.id === theme());
        const dot = el('i'); dot.style.background = `linear-gradient(135deg, ${t.a}, ${t.b})`;
        b.append(dot, el('span', '', t.name));
        b.onclick = () => { set(t.id); draw(); };
        return b;
      }));
      seg.replaceChildren(...MODES.map(([id, name]) => {
        const b = el('button', id === mode() ? 'on' : '', name); b.type = 'button';
        b.onclick = () => { set(null, id); draw(); };
        return b;
      }));
    };
    draw();
    card.append(head, el('p', 'small muted', 'اختر لون التطبيق على هذا الجهاز'), sw, seg);
    return card;
  }

  return { THEMES, MODES, theme, mode, scheme, set, icon, picker };
})();
