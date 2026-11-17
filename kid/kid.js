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
    // حالة الشاشة من النظام: {on, off: مجموع مدة الإطفاء, boot}
    screen: () => { try { return B && B.screen ? JSON.parse(B.screen()) : null; } catch { return null; } },
  };

  const load = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* التخزين ممتلئ */ } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const iso = (ms) => new Date(ms).toISOString();

  const S = {
    me: null, tab: 'home', offset: 0, st: null, sig: '', chat: null, unread: 0, breakOpen: false, overlay: null,
    // raw: آخر بيانات من الخادم — d: نفسها بعد تطبيق العمليات التي لم تُزامن بعد
    raw: { child: null, schedules: [], apps: [], yt: [], tasks: [], subs: [], grants: [], breaks: [] },
    d: { child: null, schedules: [], apps: [], yt: [], tasks: [], subs: [], grants: [], breaks: [] },
    ops: load('ck-ops', []),
    // عدّاد وقت الشاشة: used = اليوم، since = المتواصل منذ آخر راحة، rest = مدة الإطفاء المتصل
    U: load('ck-usage', null) || { day: '', used: 0, since: 0, rest: 0, t: 0, off: null, warned: '' },
    resting: false, stab: {},
    lastReason: undefined, // undefined = أول نبضة بعد فتح التطبيق
    yt: { chan: null, feeds: {} },
  };
  const now = () => new Date(Date.now() + S.offset);
  const today = () => CK.dayStr(now());

  // ================= العمليات المؤجلة: تُطبَّق فورًا على الجهاز ثم تُرسل للخادم متى توفر الاتصال =================
  function applyOps() {
    const raw = S.raw;
    const d = { ...raw, subs: [...raw.subs], grants: raw.grants.map((g) => ({ ...g })) };
    for (const op of S.ops) {
      if (op.type === 'quick') {
        if (d.grants.some((g) => g.id === op.id) || op.rejected) continue;
        d.subs.unshift({ id: op.id, task_id: op.task, kind: op.kind, day: op.day, status: 'approved' });
        d.grants.push({ id: op.id, source: 'quick', status: 'active', title: op.title, task_id: op.task, minutes: op.minutes,
          starts_at: op.start, ends_at: op.end, breaks_done: 0 });
      } else if (op.type === 'start') {
        const g = d.grants.find((x) => x.id === op.grant);
        if (g && g.status === 'ready' && !op.rejected) Object.assign(g, { status: 'active', starts_at: op.start, ends_at: op.end });
      } else if (op.type === 'break' && !op.rejected) { // يُحذف عند أول تحميل بعد إرساله فيصبح من بيانات الخادم
        const g = d.grants.find((x) => x.id === op.grant);
        if (g && g.ends_at) g.ends_at = iso(new Date(g.ends_at).getTime() + op.secs * 1000);
      }
    }
    S.d = d;
  }
  const pushOp = (op) => { S.ops.push({ id: uuid(), ...op }); save('ck-ops', S.ops); applyOps(); tick(true); flush().then(reloadSoon); };

  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      for (const op of S.ops.filter((o) => !o.sentAt)) {
        const r = op.type === 'quick' ? await sb.rpc('claim_quick', { p_task: op.task, p_day: op.day, p_id: op.id, p_start: op.start })
          : op.type === 'start' ? await sb.rpc('start_grant', { p_id: op.grant, p_start: op.start })
            : await sb.rpc('break_done', { p_id: op.grant, p_secs: op.secs, p_op: op.id });
        if (r.error && !r.error.code) break; // لا اتصال: نعيد المحاولة لاحقًا
        if (r.error) { op.rejected = true; toast('لم يُعتمد: ' + r.error.message); } // رفضه الخادم (كتجاوز الحد اليومي)
        op.sentAt = Date.now();
      }
      save('ck-ops', S.ops);
    })().catch(() => {}).finally(() => { flushing = null; });
    return flushing;
  }
  // بداية الوقت الجديد: بعد نهاية آخر وقت جارٍ (تتسلسل الأوقات)
  function nextStart() {
    const t = now().getTime();
    return Math.max(t, ...S.d.grants.filter((g) => g.status === 'active' && g.ends_at).map((g) => new Date(g.ends_at).getTime()));
  }

  // ================= الربط =================
  async function boot() {
    try { S.me = await CK.me(); } catch (e) {
      // بلا اتصال: نعمل من النسخة المحفوظة إن وجدت
      const cache = localStorage.getItem('ck-kid-cache');
      if (cache) { const c = JSON.parse(cache); S.me = c.me; S.raw = c.d; applyOps(); return start(true); }
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
      await flush();
      const fetchedAt = Date.now();
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
      S.raw = { child, schedules, apps, yt, tasks, subs, grants, breaks };
      // العمليات المُرسلة قبل هذا التحميل صارت ضمن بيانات الخادم
      S.ops = S.ops.filter((o) => !(o.sentAt && o.sentAt < fetchedAt)); save('ck-ops', S.ops);
      applyOps();
      if (S.tab !== 'chat') S.unread = unread.length;
      save('ck-kid-cache', { me: S.me, d: S.raw });
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

  const reportUsage = () => S.U.day && sb.rpc('report_usage', { p_day: S.U.day, p_secs: Math.floor(S.U.used / 1000) }).then(() => {}, () => {});
  const heartbeat = () => { reportUsage(); sb.rpc('heartbeat', { p_info: N.info() }).then(() => {}, () => {}); };
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
  // العدّاد يحسب كل وقت تكون فيه الشاشة مفتوحة (مقفلًا كان الجهاز أو مفتوحًا، وحتى أثناء الفوائد)،
  // ولا يحسب إطفاء الشاشة ولا راحة العينين. مدة الإطفاء تأتي من النظام فتصح حتى لو توقفت الواجهة.
  function track(t, day) {
    const U = S.U, sc = N.screen(), restMs = (S.d.child.break_max_sec || 120) * 1000;
    if (U.day !== day) { U.day = day; U.used = 0; }
    const gap = U.t ? t - U.t : 0;
    let on = 0, off = 0;
    if (gap > 0) {
      if (sc) {
        if (U.off == null || sc.boot + S.offset > U.t + 5000) off = gap; // أُعيد تشغيل الجهاز: ما سبق غير معلوم
        else { off = Math.min(gap, Math.max(0, sc.off - U.off)); on = gap - off; }
      } else if (gap < 5000 && !document.hidden) on = gap; // معاينة المتصفح
      else off = gap;
    }
    if (S.resting) on = 0;
    U.used += on; U.since += on;
    if (off >= restMs) U.since = 0; // إطفاء بطول الفاصل يكفي راحةً للعينين
    else if (off > 0 && on < 1500) { U.rest += off; if (U.rest >= restMs) U.since = 0; }
    else if (on > 0) U.rest = 0;
    U.t = t; U.off = sc ? sc.off : null;
  }
  // يثبّت المواعيد المرسلة للنظام فلا تتغير كل ثانية والشاشة مطفأة
  const snap = (k, v) => { if (v && S.stab[k] && Math.abs(v - S.stab[k]) < 4000) return S.stab[k]; S.stab[k] = v; return v; };

  function tick(force) {
    if (!S.d.child) return;
    const c = S.d.child, t = now(), tm = t.getTime(), day = today();
    track(tm, day);
    const st = CK.computeState({ ...S.d, usedMs: S.U.used }, t);
    S.st = st;
    if (st.capped) st.until = snap('until', st.until);
    // راحة للعينين بعد كل N دقيقة متواصلة من فتح الشاشة، على أي وقت مفتوح
    let breakDue = false;
    if (st.unlocked && c.break_mode !== 'off' && c.break_interval_min > 0 && (st.why !== 'parent' || c.breaks_on_parent) && st.until - tm > 60000) {
      const left = c.break_interval_min * 60000 - S.U.since;
      breakDue = left <= 0;
      if (tm + left < st.until - 60000) st.breakAt = snap('breakAt', tm + Math.max(0, left));
    }
    if (breakDue && !S.breakOpen) openBreak(st.endGrant);
    const open = st.unlocked && !S.breakOpen && !breakDue;
    save('ck-usage', S.U);
    capAlerts(st, tm, day);
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

  const capText = (m) => (m % 60 ? `${m} دقيقة` : m === 60 ? 'ساعة' : m === 120 ? 'ساعتان' : `${m / 60} ساعات`);
  function capAlerts(st, tm, day) {
    const c = S.d.child, U = S.U;
    if (st.reason === 'cap' && S.lastReason !== 'cap') reportUsage(); // ليصل التنبيه للوالدين فورًا
    if (st.reason === 'cap' && S.lastReason !== 'cap' && S.lastReason !== undefined) {
      CK.beep(); N.toast('⏰ انتهى وقت استخدامك لهذا اليوم');
      const body = openOverlay('⏰ انتهى وقتك اليوم');
      body.append(h('div', { class: 'card center' }, h('div', { class: 'logo' }, '🌙'),
        h('h2', {}, `استخدمت الجهاز ${capText(c.max_daily_min)} اليوم`),
        h('p', {}, 'هذا هو الحد اليومي. أُبلغ والداك، ويُفتح الجهاز غدًا بإذن الله.'),
        h('p', { class: 'muted small' }, 'يمكنك مراسلة والديك من تبويب المحادثة.')),
      h('button', { class: 'btn big block', onclick: closeOverlay }, 'حسنًا'));
    }
    if (st.capped && st.until - tm <= 10 * 60000 && U.warned !== day) {
      U.warned = day; save('ck-usage', U);
      CK.beep(); toast('⏳ بقيت 10 دقائق من وقتك اليومي'); N.toast('⏳ بقيت 10 دقائق من وقتك اليومي');
    }
    S.lastReason = st.reason;
  }

  function drawHero(st, t) {
    const c = S.d.child;
    let line, big = '';
    if (st.unlocked) {
      line = st.capped && st.until - t.getTime() < 3600000 ? 'آخر وقتك اليومي ⏳'
        : { parent: 'سمح لك والداك 🎁', schedule: 'وقت اللعب الرسمي', task: 'وقت كسبته بإنجازك 💪' }[st.why];
      big = CK.countdown(st.until - t.getTime());
    } else if (st.reason === 'cap') line = `انتهى حدّك اليومي (${capText(c.max_daily_min)})، نلتقي غدًا 🌙`;
    else if (st.reason === 'force') line = 'الجهاز مقفل من والديك';
    else if (st.reason === 'main') line = 'أنجز مهامك الرئيسية ليُفتح الجهاز';
    else line = st.nextWindow ? `يفتح الجهاز الساعة ${clock(st.nextWindow.s)}` : 'انتهى وقت اللعب اليوم';
    const key = (st.unlocked ? 'u' : 'l') + line;
    if (heroEl.dataset.key !== key) {
      heroEl.dataset.key = key;
      heroEl.replaceChildren(h('div', { class: 'hero' + (st.unlocked ? '' : ' locked') },
        h('div', { class: 'row between' }, h('b', {}, 'مرحبًا ' + c.name), h('span', {}, st.unlocked ? '🔓' : '🔒')),
        h('div', {}, line), h('div', { class: 'big', id: 'cd' }), h('div', { class: 'small', id: 'use', style: 'opacity:.85' })));
    }
    const cd = $('#cd', heroEl);
    cd.textContent = big; cd.classList.toggle('hidden', !big);
    const use = $('#use', heroEl), m = Math.floor(S.U.used / 60000);
    use.textContent = c.max_daily_min ? `استخدامك اليوم ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} من ${capText(c.max_daily_min)}` : '';
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
        h('button', { class: 'btn', disabled: !st.mainsOk || st.reason === 'cap', onclick: () => {
          const s = nextStart();
          pushOp({ type: 'start', grant: g.id, start: iso(s), end: iso(s + g.minutes * 60000) });
          toast('بدأ وقتك، استمتع!');
        } }, `ابدأ ${g.minutes} دقيقة`))));
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

    const capped = S.st.reason === 'cap';
    if (capped) out.unshift(h('div', { class: 'card warn' }, h('p', {}, `بلغت حدك اليومي (${capText(c.max_daily_min)}). ما تكسبه من مهام الحفظ والمهام المنزلية يبقى محفوظًا لك لتبدأه غدًا.`)));
    const quickLeft = capped ? 0 : c.max_quick_per_day - count(['reading', 'puzzle']);
    const quick = S.d.tasks.filter((t) => ['reading', 'puzzle'].includes(t.kind));
    out.push(h('div', { class: 'card' }, h('h2', {}, '⚡ مهام سريعة تكسب بها ربع ساعة'),
      quickLeft <= 0 && !capped ? h('p', { class: 'tag warn' }, 'بلغت الحد اليومي للمهام السريعة') : null,
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
  // يُفتح الوقت فورًا حتى بلا إنترنت، ويُسجَّل على الخادم عند عودة الاتصال
  function claim(t) {
    closeOverlay(); S.tab = 'home';
    const s = nextStart();
    pushOp({ type: 'quick', task: t.id, kind: t.kind, title: t.title, minutes: t.reward_min, day: today(), start: iso(s), end: iso(s + t.reward_min * 60000) });
    render();
    toast(S.st.reason === 'cap' ? `أحسنت! أضيف ${t.reward_min} دقيقة، لكنك بلغت حدك اليومي` : `أحسنت! فُتح لك ${t.reward_min} دقيقة 🎉`);
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
  // الفاصل: شاشة سوداء لراحة العينين أولًا، وفور انتهاء مدتها تظهر الفائدة أو السؤال أو القصة
  function openBreak(grant) {
    S.breakOpen = true;
    const c = S.d.child, mode = c.break_mode, total = c.break_max_sec || 120;
    const t0 = Date.now();
    let rested = 0;
    const finish = () => {
      S.resting = false;
      S.U.since = 0; S.U.rest = 0; save('ck-usage', S.U);
      S.breakOpen = false; closeOverlay();
      if (grant && rested > 0) pushOp({ type: 'break', grant: grant.id, secs: rested }); // تعويض مدة الراحة
      else tick(true);
    };
    const last = localStorage.getItem('ck-last-break');
    const pool = S.d.breaks.filter((b) => b.id !== last);
    const item = mode === 'eyes' ? null : CK.shuffle(pool.length ? pool : S.d.breaks)[0];

    const content = () => {
      S.resting = false;
      if (!item) return finish();
      localStorage.setItem('ck-last-break', item.id);
      const body = openOverlay({ question: '❓ سؤال سريع', fact: '💡 فائدة', story: '📗 قصة قصيرة' }[item.kind], 'break');
      let answered = item.kind !== 'question', left = 15;
      const back = h('button', { class: 'btn big block', disabled: true }, '');
      const upd = () => { back.disabled = left > 0 || !answered; back.textContent = left > 0 ? `اقرأ بتمعّن… ${left}` : answered ? '🎮 العودة للعب' : 'أجب عن السؤال أولًا'; };
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
    };

    if (mode === 'content') { CK.beep(); N.toast('⏸ استراحة قصيرة'); return content(); }
    // ---- راحة العينين: شاشة سوداء وتعليمات تتبدل ----
    S.resting = true; // لا تُحسب من وقت الشاشة
    CK.beep(); N.toast('👀 وقت راحة العينين');
    const STEPS = ['انظر إلى السقف ⬆️', 'انظر إلى اليمين ➡️', 'انظر إلى اليسار ⬅️', 'انظر إلى أبعد شيء في الغرفة 🪟', 'أغمض عينيك وخذ نفسًا عميقًا 😌', 'رمّش بعينيك عدة مرات ✨'];
    const body = openOverlay('', 'break');
    S.overlay.style.background = '#000'; S.overlay.style.color = '#fff';
    const step = h('div', { style: 'font-size:2rem;font-weight:800;text-align:center;line-height:1.6' }, STEPS[0]);
    const num = h('div', { style: 'font-size:1.4rem;text-align:center;opacity:.55' }, CK.countdown(total * 1000));
    body.style.cssText = 'flex:1;justify-content:center;gap:28px';
    body.append(h('div', { style: 'text-align:center;opacity:.7' }, '👀 راحة للعينين — أبعد الجهاز عن وجهك'), step, num);
    const timer = setInterval(() => {
      const el = Math.round((Date.now() - t0) / 1000);
      step.textContent = STEPS[Math.floor(el / 8) % STEPS.length];
      num.textContent = CK.countdown(Math.max(0, total - el) * 1000);
      if (el < total) return;
      clearInterval(timer); rested = total;
      CK.beep();
      content();
    }, 1000);
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
