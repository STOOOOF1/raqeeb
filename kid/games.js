'use strict';
// الاختبارات والألعاب الذهنية — كل دالة ترسم داخل box وتعيد Promise<boolean> (نجح أم لا)
const Games = (() => {
  const { h, shuffle } = CK;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  // اختبار اختيار من متعدد؛ used: مجموعة فهارس الأسئلة المستخدمة سابقًا لتتغير عند الإعادة
  function quiz(box, pool, size, used) {
    return new Promise((resolve) => {
      let fresh = pool.map((_, i) => i).filter((i) => !used.has(i));
      if (fresh.length < size) { used.clear(); fresh = pool.map((_, i) => i); }
      const picked = shuffle(fresh).slice(0, Math.min(size, pool.length));
      picked.forEach((i) => used.add(i));
      let n = 0, wrong = 0;
      const show = () => {
        const item = pool[picked[n]];
        const order = shuffle(item.options.map((_, i) => i));
        let sel = null;
        const next = h('button', { class: 'btn big block', disabled: true }, n === picked.length - 1 ? 'إنهاء' : 'التالي');
        const opts = order.map((oi) => h('button', { class: 'opt', onclick: () => {
          if (next.dataset.done) return;
          sel = oi; opts.forEach((b) => b.classList.remove('sel')); opts[order.indexOf(oi)].classList.add('sel'); next.disabled = false;
        } }, item.options[oi]));
        next.onclick = () => {
          if (!next.dataset.done) {
            next.dataset.done = '1'; next.disabled = true;
            const ok = sel === item.answer; if (!ok) wrong++;
            opts[order.indexOf(sel)].classList.add(ok ? 'good' : 'wrong');
            return setTimeout(() => next.onclick(), 650);
          }
          n++;
          if (n < picked.length) show(); else resolve(wrong === 0);
        };
        box.replaceChildren(h('div', { class: 'card' },
          h('div', { class: 'small muted' }, `السؤال ${n + 1} من ${picked.length}`), h('h2', {}, item.q), opts), next);
      };
      show();
    });
  }

  function mathQuestion(level) {
    if (level <= 1) { const a = rnd(2, 12), b = rnd(2, 9); return Math.random() < 0.5 ? [`${a} + ${b}`, a + b] : [`${a + b} − ${b}`, a]; }
    if (level === 2) {
      const k = rnd(0, 2);
      if (k === 0) { const a = rnd(2, 9), b = rnd(2, 9); return [`${a} × ${b}`, a * b]; }
      if (k === 1) { const a = rnd(12, 60), b = rnd(11, 39); return [`${a} + ${b}`, a + b]; }
      const a = rnd(30, 90), b = rnd(11, 29); return [`${a} − ${b}`, a - b];
    }
    const k = rnd(0, 2);
    if (k === 0) { const a = rnd(6, 12), b = rnd(6, 12); return [`${a} × ${b}`, a * b]; }
    if (k === 1) { const b = rnd(3, 9), r = rnd(4, 12); return [`${b * r} ÷ ${b}`, r]; }
    const a = rnd(2, 9), b = rnd(2, 9), c = rnd(5, 30); return [`${a} × ${b} + ${c}`, a * b + c];
  }

  function math(box, level) {
    return new Promise((resolve) => {
      const total = 5; let n = 0, wrong = 0;
      const show = () => {
        const [text, ans] = mathQuestion(level);
        const input = h('input', { type: 'tel', class: 'pin', inputmode: 'numeric', maxlength: 5, autocomplete: 'off' });
        const form = h('form', { class: 'col', onsubmit: (e) => {
          e.preventDefault();
          if (input.value.trim() === '') return;
          const ok = +input.value === ans; if (!ok) wrong++;
          input.style.borderColor = ok ? 'var(--ok)' : 'var(--bad)'; input.disabled = true;
          setTimeout(() => { n++; if (n < total) show(); else resolve(wrong === 0); }, 500);
        } },
          h('div', { class: 'card center' }, h('div', { class: 'small muted' }, `المسألة ${n + 1} من ${total}`),
            h('div', { style: 'font-size:2.4rem;font-weight:800;direction:ltr' }, text + ' = ؟'), input),
          h('button', { class: 'btn big block', type: 'submit' }, 'تأكيد'));
        box.replaceChildren(form); input.focus();
      };
      show();
    });
  }

  function memory(box, level) {
    return new Promise((resolve) => {
      const pairs = level <= 1 ? 6 : level === 2 ? 8 : 10;
      const maxMoves = level <= 1 ? 99 : pairs * 2 + 4;
      const icons = shuffle(['🍎', '🚗', '🌙', '⚽', '🐪', '🌴', '📚', '🕌', '🦋', '🍉', '🚀', '🐟', '🌻', '🎈']).slice(0, pairs);
      const cards = shuffle([...icons, ...icons]);
      let open = [], done = 0, moves = 0, busy = false;
      const info = h('div', { class: 'center muted' });
      const upd = () => { info.textContent = level <= 1 ? `المحاولات: ${moves}` : `المحاولات: ${moves} من ${maxMoves}`; };
      const els = cards.map((ic, i) => h('button', { class: 'memcard', onclick: () => {
        if (busy || els[i].classList.contains('open') || els[i].classList.contains('done')) return;
        els[i].classList.add('open'); open.push(i);
        if (open.length < 2) return;
        moves++; upd();
        const [a, b] = open; open = [];
        if (cards[a] === cards[b]) {
          els[a].classList.replace('open', 'done'); els[b].classList.replace('open', 'done');
          if (++done === pairs) return setTimeout(() => resolve(true), 500);
        } else {
          busy = true;
          setTimeout(() => { els[a].classList.remove('open'); els[b].classList.remove('open'); busy = false; }, 800);
        }
        if (moves >= maxMoves && done < pairs) setTimeout(() => resolve(false), 900);
      } }, ic));
      upd();
      box.replaceChildren(h('p', { class: 'center' }, 'اقلب بطاقتين متشابهتين حتى تجمع كل الأزواج'), info, h('div', { class: 'memgrid' }, els));
    });
  }

  // ---------- مشاهدة مقطع يوتيوب حتى نهايته (بلا تقديم) ----------
  let apiP = null;
  function ytApi() {
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    return apiP || (apiP = new Promise((resolve, reject) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      const fail = () => { apiP = null; s.remove(); reject(new Error('net')); };
      s.onerror = fail;
      document.head.append(s);
      setTimeout(() => { if (!(window.YT && window.YT.Player)) fail(); }, 20000);
    }));
  }
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)) || null; } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* التخزين غير متاح */ } },
  };
  const watchKey = (taskId) => 'ck_yt_' + taskId;
  // هل أكمل الطفل مشاهدة مقطع هذه المهمة اليوم؟
  const watchedToday = (taskId) => { const s = store.get(watchKey(taskId)); return !!(s && s.d === CK.dayStr() && s.done); };

  // يرسم المشغّل داخل box؛ يعيد Promise<boolean>: true عند إكمال المشاهدة، false عند تعذّر التشغيل
  function watch(box, yt, taskId) {
    return new Promise((resolve) => {
      const S0 = yt.start || 0, E0 = yt.end || 0, key = watchKey(taskId), day = CK.dayStr();
      const saved = store.get(key);
      let max = saved && saved.d === day && saved.max > S0 ? saved.max : S0;
      const fill = h('i'), label = h('span', {}, 'جارٍ تحميل المقطع…');
      const holder = h('div');
      box.replaceChildren(
        h('div', { class: 'player' }, holder),
        h('div', { class: 'watchbar' }, fill), h('p', { class: 'small muted center' }, label),
        h('p', { class: 'small center' }, '👀 شاهد المقطع حتى نهايته، وبعدها تظهر لك الأسئلة.'));
      const showErr = (msg) => { box.replaceChildren(h('div', { class: 'card bad' }, h('b', {}, msg), h('p', { class: 'small' }, 'أغلق هذه النافذة وجرّب لاحقًا.'))); resolve(false); };

      ytApi().then((YT) => {
        if (!box.isConnected) return;
        let timer = null, finished = false, player;
        const endT = () => E0 || (player.getDuration ? player.getDuration() : 0);
        const save = (done) => store.set(key, { d: day, max, done: !!done });
        const draw = () => {
          const e = endT(); if (!e) return;
          const pct = Math.min(100, Math.max(0, ((max - S0) / (e - S0)) * 100));
          fill.style.width = pct + '%';
          label.textContent = `شاهدت ${Math.floor(pct)}% · ${CK.fmtTime(max - S0)} من ${CK.fmtTime(e - S0)}`;
        };
        const finish = () => {
          if (finished) return; finished = true;
          clearInterval(timer); max = endT(); save(true); draw();
          try { player.destroy(); } catch { /* */ }
          resolve(true);
        };
        const tick = () => {
          if (!box.isConnected) { clearInterval(timer); save(false); try { player.destroy(); } catch { /* */ } return; }
          if (!player.getCurrentTime) return;
          const cur = player.getCurrentTime(), e = endT();
          if (cur > max + 3) player.seekTo(max, true); // منع التقديم
          else if (cur > max) { max = cur; save(false); }
          draw();
          if (e && max >= e - 1) finish();
        };
        player = new YT.Player(holder, {
          host: 'https://www.youtube-nocookie.com',
          videoId: yt.id,
          playerVars: { start: Math.floor(Math.max(S0, max - 2)), ...(E0 ? { end: E0 } : {}), autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, disablekb: 1, fs: 1, iv_load_policy: 3 },
          events: {
            onReady: () => { draw(); timer = setInterval(tick, 500); },
            onStateChange: (ev) => {
              if (ev.data !== YT.PlayerState.ENDED) return;
              const e = endT();
              if (e && max >= e - 4) finish(); else player.seekTo(max, true);
            },
            onError: (ev) => { clearInterval(timer); showErr([101, 150].includes(ev.data) ? 'هذا المقطع لا يعمل داخل التطبيق، أخبر والديك.' : 'تعذر تشغيل المقطع، أخبر والديك.'); },
          },
        });
      }, () => { if (box.isConnected) showErr('تحتاج اتصالًا بالإنترنت لمشاهدة المقطع.'); });
    });
  }

  // ---------- لوحة الرسم بالإصبع ----------
  // mode: trace (حرف أو كلمة باهتة يتتبعها الطفل على أسطر كتابة) أو free (رسم حر بألوان)
  // يعيد { el, empty(): لم يرسم شيئًا, image(): canvas مركّب بالخلفية والرسم }
  const SZ = 600;
  function pad({ mode, guide }) {
    const mk = () => h('canvas', { width: SZ, height: SZ, style: 'position:absolute;inset:0;width:100%;height:100%' });
    const bg = mk(), ink = mk();
    ink.style.touchAction = 'none';
    const strokes = []; let cur = null;
    const colors = mode === 'free' ? ['#1d2733', '#dc2626', '#f59e0b', '#16a34a', '#2563eb', '#9333ea', '#a16207'] : ['#1d4ed8'];
    let color = colors[0], width = mode === 'free' ? 10 : 18;

    // الخلفية: أسطر كتابة، والحرف باهتًا بحجم يملأ اللوحة
    const b = bg.getContext('2d');
    b.fillStyle = '#fff'; b.fillRect(0, 0, SZ, SZ);
    if (mode !== 'free') {
      b.strokeStyle = '#e5e7eb'; b.lineWidth = 2;
      for (const y of [150, 300, 450]) { b.beginPath(); b.moveTo(20, y); b.lineTo(SZ - 20, y); b.stroke(); }
      b.strokeStyle = '#fca5a5'; b.setLineDash([10, 10]); b.beginPath(); b.moveTo(20, 390); b.lineTo(SZ - 20, 390); b.stroke(); b.setLineDash([]);
      let fs = 420;
      const font = (n) => `${n}px "Amiri", "Noto Naskh Arabic", "Traditional Arabic", "Segoe UI", serif`;
      b.font = font(fs); b.direction = 'rtl';
      while (fs > 60 && b.measureText(guide).width > SZ - 60) { fs -= 20; b.font = font(fs); }
      b.textAlign = 'center'; b.textBaseline = 'alphabetic'; b.fillStyle = 'rgba(15,118,110,.16)';
      b.fillText(guide, SZ / 2, 390);
      b.strokeStyle = 'rgba(15,118,110,.35)'; b.lineWidth = 2; b.setLineDash([6, 8]); b.strokeText(guide, SZ / 2, 390); b.setLineDash([]);
    }

    const c = ink.getContext('2d');
    const paint = () => {
      c.clearRect(0, 0, SZ, SZ); c.lineCap = 'round'; c.lineJoin = 'round';
      for (const s of strokes) {
        c.strokeStyle = s.color; c.lineWidth = s.width; c.beginPath();
        s.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        if (s.pts.length === 1) c.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
        c.stroke();
      }
    };
    const pos = (e) => { const r = ink.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * SZ, ((e.clientY - r.top) / r.height) * SZ]; };
    ink.addEventListener('pointerdown', (e) => { e.preventDefault(); ink.setPointerCapture(e.pointerId); cur = { color, width, pts: [pos(e)] }; strokes.push(cur); paint(); });
    ink.addEventListener('pointermove', (e) => { if (!cur) return; e.preventDefault(); cur.pts.push(pos(e)); paint(); });
    const end = () => { cur = null; };
    ink.addEventListener('pointerup', end); ink.addEventListener('pointercancel', end);

    const swatches = colors.length > 1 ? h('div', { class: 'row wrap', style: 'justify-content:center' }, colors.map((col) => {
      const sw = h('button', { type: 'button', title: 'لون', style: `width:34px;height:34px;border-radius:50%;border:3px solid ${col === color ? '#000' : '#fff'};background:${col};box-shadow:0 0 0 1px #ccc;cursor:pointer`,
        onclick: () => { color = col; [...swatches.children].forEach((x) => { x.style.borderColor = '#fff'; }); sw.style.borderColor = '#000'; } });
      return sw;
    })) : null;
    const el = h('div', { class: 'col' },
      h('div', { style: 'position:relative;width:100%;max-width:440px;aspect-ratio:1;margin:0 auto;border:2px solid var(--line);border-radius:16px;overflow:hidden;background:#fff' }, bg, ink),
      swatches,
      h('div', { class: 'row', style: 'justify-content:center' },
        h('button', { class: 'btn plain sm', type: 'button', onclick: () => { strokes.pop(); paint(); } }, '↶ تراجع'),
        h('button', { class: 'btn plain sm', type: 'button', onclick: () => { strokes.length = 0; paint(); } }, '🧽 مسح')));
    return {
      el,
      empty: () => !strokes.some((s) => s.pts.length > 3),
      image: () => { const out = h('canvas', { width: SZ, height: SZ }); const o = out.getContext('2d'); o.drawImage(bg, 0, 0); o.drawImage(ink, 0, 0); return out; },
    };
  }
  // يجمع عدة رسومات في صورة واحدة (عمودًا) بحجم مناسب للرفع
  function stack(images) {
    const s = images.length > 2 ? 400 : SZ, out = h('canvas', { width: s, height: s * images.length });
    const o = out.getContext('2d');
    images.forEach((im, i) => { o.drawImage(im, 0, i * s, s, s); if (i) { o.fillStyle = '#e4dfd3'; o.fillRect(0, i * s - 2, s, 4); } });
    return new Promise((res) => out.toBlob(res, 'image/png'));
  }

  return { quiz, math, memory, watch, watchedToday, pad, stack };
})();
