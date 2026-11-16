'use strict';
// واجهة الطفل — تعمل داخل تطبيق أندرويد (AndroidBridge) أو في المتصفح للمعاينة
(() => {
  const { sb, h, $, toast, run, q, clock, KINDS } = CK;
  const root = $('#root');
  const B = window.AndroidBridge || null;
  const DEMO_APPS = [
    { package: 'demo.game.cars', label: 'لعبة السيارات (تجريبي)' }, { package: 'demo.game.puzzle', label: 'لعبة التركيب (تجريبي)' },
    { package: 'demo.draw', label: 'الرسم (تجريبي)' }, { package: 'demo.camera', label: 'الكاميرا (تجريبي)' },
  ];
  const N = {
    has: !!B,
    apps: () => { try { return B ? JSON.parse(B.getApps()) : DEMO_APPS; } catch { return []; } },
    launch: (pkg) => (B ? B.launchApp(pkg) : toast('معاينة: سيفتح التطبيق على جهاز الطفل')),
    policy: (p) => { if (B) B.setPolicy(JSON.stringify(p)); },
    wifi: () => B && B.openWifi(),
    toast: (t) => B && B.toast(t),
    info: () => { try { return B ? JSON.parse(B.info()) : { preview: true }; } catch { return {}; } },
  };

  const S = {
    me: null, tab: 'home', offset: 0, st: null, sig: '', chat: null, unread: 0, breakOpen: false, overlay: null,
    d: { child: null, schedules: [], apps: [], yt: [], tasks: [], subs: [], grants: [], breaks: [] },
    yt: { chan: null, feeds: {} },
  };
  const now = () => new Date(Date.now() + S.offset);
  const today = () => CK.dayStr(now());

  // ================= الربط =================
  async function boot() {
    try { S.me = await CK.me(); } catch (e) {
      // بلا اتصال: نعمل من النسخة المحفوظة إن وجدت
      const cache = localStorage.getItem('ck-kid-cache');
      if (cache) { const c = JSON.parse(cache); S.me = c.me; S.d = c.d; return start(true); }
    }
    if (!S.me || S.me.role !== 'child') return pairScreen();
    start(false);
  }

  function pairScreen() {
    N.policy({ unlocked: false, allowed: [], until: 0, breakAt: 0, kiosk: true });
    const code = h('input', { type: 'tel', class: 'pin', maxlength: 6, placeholder: '000000', autocomplete: 'off' });
    const btn = h('button', { class: 'btn big block', type: 'submit' }, 'ربط الجهاز');
    root.replaceChildren(h('div', { class: 'splash' }, h('div', { class: 'card' },
      h('div', { class: 'logo' }, '🔗'), h('h1', { class: 'center' }, 'ربط جهاز الطفل'),
      h('p', { class: 'muted center' }, 'أدخل رمز الربط الظاهر في تطبيق الوالدين (الإعدادات ← ربط جهاز).'),
      h('form', { class: 'col', onsubmit: async (ev) => {
        ev.preventDefault(); btn.disabled = true;
        const ok = await run(() => CK.gate({ action: 'pair_child', code: code.value.trim() }));
        btn.disabled = false;
        if (ok) boot();
      } }, code, btn),
      N.has ? h('button', { class: 'btn plain block', onclick: N.wifi }, '📶 إعدادات الواي فاي') : null)));
  }

  // ================= الهيكل والبيانات =================
  let heroEl, mainEl, navEl;
  const TABS = [['home', '🏠', 'الرئيسية'], ['tasks', '⭐', 'المهام'], ['yt', '▶️', 'يوتيوب'], ['chat', '💬', 'المحادثة']];

  async function start(offline) {
    heroEl = h('div', { class: 'top' });
    mainEl = h('div', { class: 'main' });
    navEl = h('div', { class: 'nav' });
    root.replaceChildren(h('div', { class: 'app' }, heroEl, mainEl, navEl));
    if (S.d.child) tick(true);
    if (!offline) await reload();
    CK.subscribe(onChange);
    setInterval(tick, 1000);
    setInterval(reload, 60000);
    setInterval(heartbeat, 60000); heartbeat();
    setInterval(reportApps, 600000); reportApps();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
    window.addEventListener('online', reload);
  }

  async function reload() {
    try {
      const cid = S.me.child_id, since = CK.dayStr(new Date(Date.now() - 2 * 864e5));
      const [srv, child, schedules, apps, yt, tasks, subs, grants, breaks, unread] = await Promise.all([
        q(sb.rpc('server_now')),
        q(sb.from('children').select('*').eq('id', cid).maybeSingle()),
        q(sb.from('schedules').select('*')),
        q(sb.from('apps').select('*').eq('allowed', true).order('label')),
        q(sb.from('yt_channels').select('*').order('created_at')),
        q(sb.from('tasks').select('*').eq('active', true).order('sort').order('created_at')),
        q(sb.from('submissions').select('*').or(`status.eq.pending,day.gte.${since}`).order('created_at', { ascending: false })),
        q(sb.from('grants').select('*').or(`status.eq.ready,ends_at.gte.${new Date().toISOString()}`).order('created_at')),
        q(sb.from('break_items').select('*').eq('active', true)),
        q(sb.from('messages').select('id', { count: 'exact', head: false }).eq('sender', 'parent').is('read_at', null)),
      ]);
      if (!child) { // فُصل هذا الجهاز (رُبط جهاز آخر أو حُذف الطفل)
        await sb.auth.signOut(); localStorage.removeItem('ck-kid-cache'); return location.reload();
      }
      S.offset = new Date(srv).getTime() - Date.now();
      if (Math.abs(S.offset) < 5000) S.offset = 0;
      S.d = { child, schedules, apps, yt, tasks, subs, grants, breaks };
      if (S.tab !== 'chat') S.unread = unread.length;
      try { localStorage.setItem('ck-kid-cache', JSON.stringify({ me: S.me, d: S.d })); } catch { /* التخزين ممتلئ */ }
      tick(true);
    } catch (e) { console.error(e); }
  }
  const reloadSoon = CK.debounce(reload, 300);

  function onChange(p) {
    if (p.table === 'messages') {
      const m = p.new;
      if (p.eventType !== 'INSERT' || !m) return;
      if (S.chat) S.chat.add(m);
      if (m.sender === 'parent') {
        if (S.tab === 'chat' && !document.hidden) S.chat.markRead();
        else { S.unread++; drawNav(); }
        CK.beep(); N.toast('💬 رسالة من ' + (m.sender_name || 'والديك'));
        if (S.tab !== 'chat') toast('💬 رسالة جديدة من ' + (m.sender_name || 'والديك'));
      }
      return;
    }
    if (p.table === 'grants' && p.eventType === 'INSERT' && p.new.source === 'parent') { CK.beep(); N.toast('🎉 سمح لك والداك بوقت إضافي'); }
    if (p.table === 'submissions' && p.eventType === 'UPDATE' && p.old?.status !== p.new.status) {
      if (p.new.status === 'approved') { CK.beep(); toast('🎉 أجاز والداك مهمتك'); N.toast('🎉 أجاز والداك مهمتك'); }
      if (p.new.status === 'rejected') toast('طُلب منك إعادة المهمة');
    }
    reloadSoon();
  }

  const heartbeat = () => sb.rpc('heartbeat', { p_info: N.info() }).then(() => {}, () => {});
  // تُرسل قائمة التطبيقات فقط إذا تغيّرت (تثبيت أو حذف تطبيق)
  const reportApps = async () => {
    const apps = N.apps(); if (!apps.length) return;
    const sig = S.me.child_id + ':' + apps.map((a) => a.package).sort().join();
    if (localStorage.getItem('ck-apps-sig') === sig) return;
    const { error } = await sb.rpc('report_apps', { p_apps: apps });
    if (!error) localStorage.setItem('ck-apps-sig', sig);
  };
  // زر الرجوع في أندرويد: يغلق النافذة المفتوحة أو يعود للرئيسية
  window.onNativeBack = () => {
    if (S.breakOpen) return;
    if (S.overlay) return closeOverlay();
    if (S.tab !== 'home') { S.tab = 'home'; render(); }
  };

  // ================= النبض: حساب الحالة وتطبيق القفل =================
  function tick(force) {
    if (!S.d.child) return;
    const t = now(), st = CK.computeState(S.d, t);
    S.st = st;
    const breakDue = st.unlocked && st.breakAt && t.getTime() >= st.breakAt;
    if (breakDue && !S.breakOpen) openBreak(st.breakGrant);
    const open = st.unlocked && !S.breakOpen && !breakDue;
    const kiosk = S.d.child.kiosk_enabled;
    const sig = [open, st.until, st.breakAt, st.reason, st.mainsOk, kiosk, S.d.apps.map((a) => a.package).join()].join('|');
    drawHero(st, t);
    if (sig !== S.sig || force) {
      S.sig = sig;
      N.policy({ unlocked: open, allowed: S.d.apps.map((a) => a.package), kiosk,
        until: st.until ? st.until - S.offset : 0, breakAt: st.breakAt ? st.breakAt - S.offset : 0 });
      if (!st.unlocked && S.tab === 'yt') S.tab = 'home';
      if (!st.unlocked && S.overlay?.dataset.needsUnlock) closeOverlay();
      render();
    }
  }

  function drawHero(st, t) {
    const c = S.d.child;
    let line, big = '';
    if (st.unlocked) {
      line = { parent: 'سمح لك والداك 🎁', schedule: 'وقت اللعب الرسمي', task: 'وقت كسبته بإنجازك 💪' }[st.why];
      big = CK.countdown(st.until - t.getTime());
    } else if (st.reason === 'force') line = 'الجهاز مقفل من والديك';
    else if (st.reason === 'main') line = 'أنجز مهامك الرئيسية ليُفتح الجهاز';
    else line = st.nextWindow ? `يفتح الجهاز الساعة ${clock(st.nextWindow.s)}` : 'انتهى وقت اللعب اليوم';
    const key = (st.unlocked ? 'u' : 'l') + line;
    if (heroEl.dataset.key !== key) {
      heroEl.dataset.key = key;
      heroEl.replaceChildren(h('div', { class: 'hero' + (st.unlocked ? '' : ' locked') },
        h('div', { class: 'row between' }, h('b', {}, 'مرحبًا ' + c.name), h('span', {}, st.unlocked ? '🔓' : '🔒')),
        h('div', {}, line), h('div', { class: 'big', id: 'cd' })));
    }
    const cd = $('#cd', heroEl);
    cd.textContent = big; cd.classList.toggle('hidden', !big);
  }

  function drawNav() {
    navEl.replaceChildren(...TABS.filter(([id]) => id !== 'yt' || S.d.yt.length).map(([id, ic, name]) =>
      h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; render(); } },
        h('span', { class: 'ic' }, ic), name, id === 'chat' && S.unread ? h('span', { class: 'badge' }, S.unread) : null)));
  }

  function render() {
    drawNav();
    if (S.tab === 'chat') return viewChat();
    mainEl.style.padding = '';
    const top = mainEl.scrollTop;
    mainEl.replaceChildren(...{ home: viewHome, tasks: viewTasks, yt: viewYt }[S.tab]().filter(Boolean));
    mainEl.scrollTop = top;
  }

  // ================= الرئيسية =================
  const subToday = (t) => S.d.subs.find((s) => s.task_id === t.id && s.day === today() && s.status !== 'rejected');
  const pendingOf = (t) => S.d.subs.find((s) => s.task_id === t.id && s.status === 'pending');

  function mainTasksCard() {
    const st = S.st;
    if (!st.mainList.length) return null;
    return h('div', { class: 'card' + (st.mainsOk ? '' : ' warn') }, h('h2', {}, '⭐ مهامي الرئيسية اليوم'),
      st.mainList.map((m) => h('div', { class: 'item' }, h('span', { class: 'grow' }, m.task.title),
        m.sub ? h('span', { class: 'tag ' + (m.sub.status === 'approved' ? 'ok' : 'warn') }, m.sub.status === 'approved' ? 'تمت ✓' : m.ok ? 'أُبلغ والداك ✓' : 'بانتظار تأكيد والديك')
          : h('button', { class: 'btn sm', onclick: () => run(async () => {
            await q(sb.from('submissions').insert({ family_id: S.me.family_id, child_id: S.me.child_id, task_id: m.task.id, kind: 'main', day: today() }));
            await reload();
          }, 'أُرسل إشعار لوالديك') }, 'أنجزتها'))));
  }

  function readyCard() {
    const st = S.st;
    if (!st.ready.length) return null;
    return h('div', { class: 'card soft' }, h('h2', {}, '🎁 وقت كسبته'),
      st.mainsOk ? null : h('p', { class: 'small' }, 'يبدأ بعد إنجاز مهامك الرئيسية.'),
      st.ready.map((g) => h('div', { class: 'item' }, h('span', { class: 'grow' }, g.title || 'وقت إضافي'),
        h('button', { class: 'btn', disabled: !st.mainsOk, onclick: () => run(async () => { await q(sb.rpc('start_grant', { p_id: g.id })); await reload(); }, 'بدأ وقتك، استمتع!') }, `ابدأ ${g.minutes} دقيقة`))));
  }

  function viewHome() {
    const st = S.st, out = [];
    if (!S.d.child.kiosk_enabled) out.push(h('div', { class: 'card warn' }, h('p', {}, 'وضع القفل متوقف مؤقتًا من الوالدين.')));
    if (!st.mainsOk) out.push(mainTasksCard());
    out.push(readyCard());
    if (st.unlocked) {
      const apps = S.d.apps;
      out.push(h('div', { class: 'card' }, h('h2', {}, 'تطبيقاتي'),
        apps.length || S.d.yt.length ? h('div', { class: 'appgrid' },
          S.d.yt.length ? h('button', { class: 'appicon', onclick: () => { S.tab = 'yt'; render(); } }, h('div', { class: 'ph' }, '▶️'), h('span', {}, 'يوتيوب')) : null,
          apps.map((a) => h('button', { class: 'appicon', onclick: () => N.launch(a.package) },
            a.icon ? h('img', { src: a.icon, alt: '' }) : h('div', { class: 'ph' }, '🎮'), h('span', {}, a.label || a.package))))
          : h('p', { class: 'muted' }, 'لم يحدد والداك تطبيقات بعد.')));
    } else {
      out.push(h('div', { class: 'card' }, h('h2', {}, 'تريد وقتًا إضافيًا؟'),
        h('p', { class: 'muted' }, 'أنجز مهمة حفظ أو مهمة منزلية لتكسب نصف ساعة، أو مهمة سريعة لتكسب ربع ساعة، أو راسل والديك.'),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: () => { S.tab = 'tasks'; render(); } }, '⭐ المهام'),
          h('button', { class: 'btn ghost', onclick: () => { S.tab = 'chat'; render(); } }, '💬 مراسلة والديّ'))));
    }
    if (N.has) out.push(h('button', { class: 'btn plain sm', style: 'align-self:center', onclick: N.wifi }, '📶 الواي فاي'));
    return out;
  }

  // ================= المهام =================
  function viewTasks() {
    const c = S.d.child, out = [mainTasksCard(), readyCard()];
    const day = today();
    const count = (kinds) => S.d.subs.filter((s) => s.day === day && kinds.includes(s.kind) && s.status !== 'rejected').length;

    const extraLeft = c.max_extra_per_day - count(['quran', 'matn', 'chore']);
    const extra = S.d.tasks.filter((t) => ['quran', 'matn', 'chore'].includes(t.kind));
    out.push(h('div', { class: 'card' }, h('h2', {}, '🕧 مهام تكسب بها نصف ساعة'),
      extraLeft <= 0 ? h('p', { class: 'tag warn' }, 'بلغت الحد اليومي لهذه المهام') : null,
      extra.length ? extra.map((t) => {
        const pend = pendingOf(t);
        const p = t.kind === 'chore' ? null : CK.nextPortion(t);
        let action;
        if (pend) action = h('span', { class: 'tag warn' }, 'بانتظار الإجازة');
        else if (p?.done) action = h('span', { class: 'tag ok' }, 'أتممته 🎉');
        else if (t.kind === 'chore' && subToday(t)) action = h('span', { class: 'tag ok' }, 'تمت اليوم ✓');
        else action = h('button', { class: 'btn sm', disabled: extraLeft <= 0, onclick: () => (t.kind === 'chore' ? openChore(t) : openHifz(t)) }, 'ابدأ');
        return h('div', { class: 'item' }, h('span', { class: 'avatar' }, KINDS[t.kind].ic),
          h('div', { class: 'grow' }, h('div', {}, t.title),
            h('div', { class: 'small muted' }, p ? `${KINDS[t.kind].name} · أنجزت ${p.from} من ${p.units.length}` : KINDS[t.kind].name + ` · ${t.reward_min} دقيقة`)), action);
      }) : h('p', { class: 'muted small' }, 'لا توجد مهام حاليًا.')));

    const quickLeft = c.max_quick_per_day - count(['reading', 'puzzle']);
    const quick = S.d.tasks.filter((t) => ['reading', 'puzzle'].includes(t.kind));
    out.push(h('div', { class: 'card' }, h('h2', {}, '⚡ مهام سريعة تكسب بها ربع ساعة'),
      quickLeft <= 0 ? h('p', { class: 'tag warn' }, 'بلغت الحد اليومي للمهام السريعة') : null,
      quick.length ? quick.map((t) => h('div', { class: 'item' }, h('span', { class: 'avatar' }, KINDS[t.kind].ic),
        h('div', { class: 'grow' }, h('div', {}, t.title), h('div', { class: 'small muted' }, `${KINDS[t.kind].name} · ${t.reward_min} دقيقة`)),
        subToday(t) ? h('span', { class: 'tag ok' }, 'تمت اليوم ✓')
          : h('button', { class: 'btn sm', disabled: quickLeft <= 0, onclick: () => (t.kind === 'reading' ? openReading(t) : openPuzzle(t)) }, 'ابدأ')))
        : h('p', { class: 'muted small' }, 'لا توجد مهام حاليًا.')));
    return out;
  }

  // ---- نافذة ملء الشاشة ----
  function openOverlay(title, cls = '') {
    closeOverlay();
    const body = h('div', { class: 'ob' });
    const el = h('div', { class: 'overlay ' + cls }, h('div', { class: 'oh' },
      cls.includes('break') ? null : h('button', { class: 'iconbtn', onclick: closeOverlay }, '✕'), h('span', {}, title)), body);
    document.body.append(el); S.overlay = el;
    return body;
  }
  function closeOverlay() { if (S.overlay) { S.overlay.remove(); S.overlay = null; } }

  // ---- الحفظ والتسميع ----
  function openHifz(t) {
    const p = CK.nextPortion(t);
    const body = openOverlay(KINDS[t.kind].ic + ' ' + t.title);
    const portion = h('div', { class: 'portion' }, p.text);
    const stage = h('div', { class: 'col' });
    const label = t.kind === 'quran' ? `الآيات ${p.from + 1} إلى ${p.to}` : `المقطع ${p.from + 1} إلى ${p.to}`;
    const recite = () => {
      portion.classList.add('hidden');
      stage.replaceChildren(
        h('p', { class: 'center' }, 'النص مخفي الآن. اضغط تسجيل وسمِّع ما حفظت.'),
        CK.recordButton((blob) => review(blob), '🎤 ابدأ التسميع'),
        h('button', { class: 'btn plain block', onclick: memorize }, '👁 إظهار النص للمراجعة'));
    };
    const review = (blob) => {
      const send = h('button', { class: 'btn big ok block', onclick: async () => {
        send.disabled = true; send.textContent = 'جارٍ الإرسال…';
        const ok = await run(async () => {
          const path = await CK.uploadAudio(blob, S.me.family_id, S.me.child_id);
          await q(sb.from('submissions').insert({ family_id: S.me.family_id, child_id: S.me.child_id, task_id: t.id, kind: t.kind, day: today(),
            audio_path: path, portion: p.text, units_from: p.from, units_to: p.to }));
          await reload();
        }, 'أُرسل تسميعك لوالديك، انتظر إجازتهم 🌟');
        if (ok) closeOverlay(); else { send.disabled = false; send.textContent = '📤 إرسال لوالديّ'; }
      } }, '📤 إرسال لوالديّ');
      stage.replaceChildren(h('p', { class: 'center' }, 'استمع لتسجيلك ثم أرسله:'),
        h('audio', { controls: true, src: URL.createObjectURL(blob), style: 'width:100%' }), send,
        h('button', { class: 'btn plain block', onclick: recite }, '↺ إعادة التسجيل'));
    };
    const memorize = () => {
      portion.classList.remove('hidden');
      stage.replaceChildren(h('button', { class: 'btn big block', onclick: recite }, 'حفظتها، أريد التسميع'));
    };
    body.append(h('div', { class: 'card soft' }, h('b', {}, label), h('p', { class: 'small' }, `احفظها جيدًا، ثم سمِّعها بصوتك لتكسب ${t.reward_min} دقيقة بعد إجازة والديك.`)), portion, stage);
    memorize();
  }

  function openChore(t) {
    const body = openOverlay('🧹 ' + t.title);
    body.append(h('div', { class: 'card' }, h('p', { class: 'reading' }, t.body || t.title),
      h('p', { class: 'small muted' }, `بعد أن تنجزها اضغط الزر، وسيصل إشعار لوالديك ليجيزوا لك ${t.reward_min} دقيقة.`)),
    h('button', { class: 'btn big ok block', onclick: () => run(async () => {
      await q(sb.from('submissions').insert({ family_id: S.me.family_id, child_id: S.me.child_id, task_id: t.id, kind: 'chore', day: today() }));
      await reload(); closeOverlay();
    }, 'أُبلغ والداك، انتظر إجازتهم 🌟') }, '✓ أنجزت المهمة'));
  }

  // ---- المهام السريعة ----
  async function claim(t) {
    const ok = await run(async () => { await q(sb.rpc('claim_quick', { p_task: t.id, p_day: today() })); await reload(); }, `أحسنت! فُتح لك ${t.reward_min} دقيقة 🎉`);
    closeOverlay();
    if (ok) { S.tab = 'home'; render(); }
  }

  function openReading(t) {
    const body = openOverlay('📚 ' + t.title);
    const used = new Set();
    const read = (again) => {
      let left = 20;
      const go = h('button', { class: 'btn big block', disabled: true }, `اقرأ بتمعّن… (${left})`);
      const timer = setInterval(() => {
        if (!go.isConnected) return clearInterval(timer);
        left--; go.textContent = left > 0 ? `اقرأ بتمعّن… (${left})` : 'انتهيت من القراءة، اختبرني';
        if (left <= 0) { go.disabled = false; clearInterval(timer); }
      }, 1000);
      go.onclick = async () => {
        clearInterval(timer);
        const pass = await Games.quiz(body, t.questions, t.config.quiz_size || 3, used);
        if (pass) claim(t); else read(true);
      };
      body.replaceChildren(
        again ? h('div', { class: 'card bad' }, h('b', {}, 'بعض إجاباتك لم تكن صحيحة'), h('p', {}, 'اقرأ النص مرة أخرى بتركيز، وستأتيك أسئلة مختلفة.')) : null,
        h('div', { class: 'card' }, h('div', { class: 'reading' }, t.body)), go);
      S.overlay.scrollTop = 0;
    };
    read(false);
  }

  function openPuzzle(t) {
    const body = openOverlay('🧩 ' + t.title);
    const used = new Set();
    const play = async (again) => {
      const box = h('div', { class: 'col' });
      body.replaceChildren(again ? h('div', { class: 'card bad' }, h('p', {}, 'لم تنجح هذه المرة، حاول مجددًا بتركيز!')) : null, box);
      const type = t.config.type, level = +t.config.level || 1;
      const pass = type === 'math' ? await Games.math(box, level) : type === 'memory' ? await Games.memory(box, level)
        : await Games.quiz(box, t.questions, t.config.quiz_size || 3, used);
      if (pass) claim(t); else play(true);
    };
    play(false);
  }

  // ================= الفاصل =================
  function openBreak(grant) {
    S.breakOpen = true;
    const last = localStorage.getItem('ck-last-break');
    const pool = S.d.breaks.filter((b) => b.id !== last);
    const item = CK.shuffle(pool.length ? pool : S.d.breaks)[0];
    const t0 = Date.now();
    const finish = async () => {
      const secs = Math.round((Date.now() - t0) / 1000);
      await sb.rpc('break_done', { p_id: grant.id, p_secs: secs }).then(() => {}, () => {});
      S.breakOpen = false; closeOverlay(); await reload();
    };
    if (!item) return finish();
    localStorage.setItem('ck-last-break', item.id);
    CK.beep(); N.toast('⏸ استراحة قصيرة');
    const body = openOverlay({ question: '❓ سؤال سريع', fact: '💡 فائدة', story: '📗 قصة قصيرة' }[item.kind], 'break');
    let answered = item.kind !== 'question', left = 15;
    const back = h('button', { class: 'btn big block', disabled: true }, '');
    const upd = () => { back.disabled = left > 0 || !answered; back.textContent = left > 0 ? `العودة للعب بعد ${left}` : answered ? '🎮 العودة للعب' : 'أجب عن السؤال أولًا'; };
    const timer = setInterval(() => { left--; upd(); if (left <= 0) clearInterval(timer); }, 1000);
    back.onclick = () => { clearInterval(timer); finish(); };
    const result = h('p', { class: 'center' });
    const opts = (item.options || []).map((o, i) => h('button', { class: 'opt', onclick: () => {
      if (answered) return;
      answered = true;
      opts[i].classList.add(i === item.answer ? 'good' : 'wrong'); opts[item.answer]?.classList.add('good');
      result.textContent = i === item.answer ? 'إجابة صحيحة، أحسنت! 🌟' : 'الإجابة الصحيحة مظللة بالأخضر';
      upd();
    } }, o));
    body.append(h('div', { class: 'card' }, item.title ? h('h2', {}, item.title) : null, h('div', { class: 'reading' }, item.body), opts, result), back);
    upd();
  }

  // ================= يوتيوب =================
  function viewYt() {
    const chans = S.d.yt;
    if (!S.st.unlocked) return [h('div', { class: 'card' }, h('p', {}, 'يوتيوب متاح في وقت اللعب فقط.'))];
    if (!chans.length) return [h('div', { class: 'card' }, h('p', { class: 'muted' }, 'لم يحدد والداك قنوات بعد.'))];
    if (!chans.find((c) => c.channel_id === S.yt.chan)) S.yt.chan = chans[0].channel_id;
    const grid = h('div', { class: 'ytgrid' }, h('p', { class: 'muted' }, 'جارٍ التحميل…'));
    const chan = S.yt.chan;
    const draw = (videos) => grid.replaceChildren(...(videos.length ? videos.map((v) => h('button', { class: 'ytcard', onclick: () => play(`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`, v.title) },
      h('img', { src: v.thumb, loading: 'lazy', alt: '' }), h('span', {}, v.title))) : [h('p', { class: 'muted' }, 'لا توجد مقاطع.')]));
    if (S.yt.feeds[chan]) draw(S.yt.feeds[chan]);
    else CK.fn('yt', { action: 'feed', channel_id: chan }).then((r) => { S.yt.feeds[chan] = r.videos; if (S.yt.chan === chan && grid.isConnected) draw(r.videos); },
      () => grid.replaceChildren(h('p', { class: 'muted' }, 'تعذر تحميل المقاطع، تحقق من الاتصال.')));
    return [
      h('div', { class: 'chips' }, chans.map((c) => h('button', { class: 'chip' + (c.channel_id === chan ? ' on' : ''), onclick: () => { S.yt.chan = c.channel_id; render(); } }, c.title))),
      h('button', { class: 'btn ghost', onclick: () => play(`https://www.youtube-nocookie.com/embed/videoseries?list=UU${chan.slice(2)}&autoplay=1&rel=0&playsinline=1`, 'كل مقاطع القناة') }, '▶ تشغيل كل مقاطع القناة'),
      grid];
  }
  function play(src, title) {
    const body = openOverlay('▶️ ' + title);
    S.overlay.dataset.needsUnlock = '1';
    body.append(h('div', { class: 'player' }, h('iframe', { src, allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' })));
  }

  // ================= المحادثة =================
  function viewChat() {
    if (!S.chat) S.chat = CK.Chat({ familyId: S.me.family_id, childId: S.me.child_id, sender: 'child', senderName: S.me.name });
    mainEl.style.padding = '0';
    if (mainEl.firstChild !== S.chat.el) mainEl.replaceChildren(S.chat.el);
    S.chat.el.style.height = '100%';
    S.chat.focus(); S.chat.markRead();
    if (S.unread) { S.unread = 0; drawNav(); }
  }

  boot();
})();
