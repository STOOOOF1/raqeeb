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
    apps: (fresh) => {
      try { if (fresh && B && B.refreshApps) B.refreshApps(); return B ? JSON.parse(B.getApps()) : DEMO_APPS; } catch { return []; }
    },
    launch: (pkg) => (B ? B.launchApp(pkg) : toast('معاينة: سيفتح التطبيق على جهاز الطفل')),
    // موقع أضافه الوالدان: متصفح مصغّر محصور بالموقع في تطبيق أندرويد، وإلا (معاينة/إصدار قديم) داخل نافذة
    site: (s) => (B && B.openSite ? B.openSite(s.url, s.title || '', !!s.whole_site) : openSiteFrame(s)),
    policy: (p) => { if (B) B.setPolicy(JSON.stringify(p)); },
    wifi: () => openWifi(),
    toast: (t) => B && B.toast(t),
    info: () => { try { return B ? JSON.parse(B.info()) : { preview: true }; } catch { return {}; } },
    // حالة الشاشة من النظام: {on, off: مجموع مدة الإطفاء, boot}
    screen: () => { try { return B && B.screen ? JSON.parse(B.screen()) : null; } catch { return null; } },
    // رمز الربط القادم مع التجهيز برمز QR (clear=true بعد نجاح الربط)
    pairCode: (clear) => { try { return B && B.pairCode ? B.pairCode(!!clear) : ''; } catch { return ''; } },
  };

  const load = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* التخزين ممتلئ */ } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const iso = (ms) => new Date(ms).toISOString();

  const S = {
    me: null, tab: 'home', offset: 0, st: null, sig: '', chats: {}, chatRoom: 'direct', chatWrap: null, unread: 0, famUnread: 0, breakOpen: false, overlay: null,
    // raw: آخر بيانات من الخادم — d: نفسها بعد تطبيق العمليات التي لم تُزامن بعد
    raw: { child: null, schedules: [], apps: [], yt: [], sites: [], tasks: [], subs: [], grants: [], breaks: [], penalties: [], trips: [], tripAnswers: [] },
    d: { child: null, schedules: [], apps: [], yt: [], sites: [], tasks: [], subs: [], grants: [], breaks: [], penalties: [], trips: [], tripAnswers: [] },
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
    const d = { ...raw, child: raw.child && { ...raw.child }, subs: [...raw.subs], grants: raw.grants.map((g) => ({ ...g })) };
    for (const op of S.ops) {
      if ((op.type === 'pause' || op.type === 'resume') && !d.child) continue;
      if (op.type === 'pause') {
        if (!op.rejected && !d.child.paused_at) d.child.paused_at = op.at;
        continue;
      }
      if (op.type === 'resume') { // يؤخر نهاية الوقت الجاري وما بعده بمدة التوقف (كما يفعل الخادم)
        if (op.rejected || !d.child.paused_at) continue;
        const pa = new Date(d.child.paused_at).getTime(), delta = Math.max(0, new Date(op.at).getTime() - pa);
        for (const g of d.grants) {
          if (g.status !== 'active' || !g.ends_at || new Date(g.ends_at).getTime() <= pa) continue;
          if (g.source === 'parent' && new Date(g.starts_at).getTime() >= pa) continue; // إذن بعد الإيقاف لا يُرحَّل
          g.ends_at = iso(new Date(g.ends_at).getTime() + delta);
          if (new Date(g.starts_at).getTime() > pa) g.starts_at = iso(new Date(g.starts_at).getTime() + delta);
        }
        d.child.paused_at = null;
        continue;
      }
      if (op.type === 'quick') {
        if (d.grants.some((g) => g.id === op.id) || op.rejected) continue;
        d.subs.unshift({ id: op.id, task_id: op.task, kind: op.kind, day: op.day, status: 'approved' });
        d.grants.push({ id: op.id, source: 'quick', status: 'ready', title: op.title, task_id: op.task, minutes: op.minutes, breaks_done: 0 });
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
        const r = op.type === 'quick' ? await sb.rpc('claim_quick', { p_task: op.task, p_day: op.day, p_id: op.id })
          : op.type === 'start' ? await sb.rpc('start_grant', { p_id: op.grant, p_start: op.start })
            : op.type === 'pause' || op.type === 'resume' ? await sb.rpc('pause_time', { p_pause: op.type === 'pause', p_at: op.at, p_op: op.id })
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
        if (ok) { N.pairCode(true); boot(); }
      } }, code, btn),
      N.has ? h('button', { class: 'btn plain block', onclick: N.wifi }, '📶 إعدادات الواي فاي') : null)));
    // جهاز جُهّز برمز QR: رمز الربط وصل معه، فيُربط تلقائيًا
    const pc = N.pairCode(false);
    if (/^\d{6}$/.test(pc)) { code.value = pc; btn.click(); }
  }

  // ================= الهيكل والبيانات =================
  let heroEl, mainEl, navEl;
  const TABS = [['home', 'home', 'الرئيسية'], ['tasks', 'star', 'المهام'], ['yt', 'play', 'يوتيوب'], ['trips', 'compass', 'رحلاتنا'], ['chat', 'chat', 'المحادثة'], ['settings', 'settings', 'الإعدادات']];
  // الانتقال بين التبويبات: يبدأ من الأعلى مع حركة دخول خفيفة
  function goTab(id) {
    if (S.tab === id) { mainEl.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.tab = id;
    mainEl.scrollTop = 0;
    mainEl.classList.remove('enter'); void mainEl.offsetWidth; mainEl.classList.add('enter');
    clearTimeout(goTab.t); goTab.t = setTimeout(() => mainEl.classList.remove('enter'), 500);
    render();
    mainEl.scrollTop = 0;
  }

  async function start(offline) {
    heroEl = h('div', { class: 'top' });
    mainEl = h('div', { class: 'main' });
    navEl = h('nav', { class: 'nav' });
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
      const [srv, child, schedules, apps, yt, sites, tasks, subs, grants, breaks, unread, penalties, trips, tripAnswers] = await Promise.all([
        q(sb.rpc('server_now')),
        q(sb.from('children').select('*').eq('id', cid).maybeSingle()),
        q(sb.from('schedules').select('*')),
        q(sb.from('apps').select('*').eq('allowed', true).order('label')),
        q(sb.from('yt_channels').select('*').order('created_at')),
        q(sb.from('sites').select('*').order('created_at')).catch(() => []),
        q(sb.from('tasks').select('*').eq('active', true).order('sort').order('created_at')),
        q(sb.from('submissions').select('*').or(`status.eq.pending,day.gte.${since}`).order('created_at', { ascending: false })),
        q(sb.from('grants').select('*').or(`status.eq.ready,ends_at.gte.${new Date().toISOString()}`).order('created_at')),
        q(sb.from('break_items').select('*').eq('active', true)),
        q(sb.from('messages').select('id', { count: 'exact', head: false }).eq('room', 'direct').eq('sender', 'parent').is('read_at', null)),
        q(sb.from('penalties').select('*').gte('day', since).order('created_at', { ascending: false })),
        q(sb.from('trips').select('*').order('sort').order('created_at', { ascending: false })).catch(() => []),
        q(sb.from('trip_answers').select('*')).catch(() => []),
      ]);
      if (!child) { // فُصل هذا الجهاز (رُبط جهاز آخر أو حُذف الطفل)
        await sb.auth.signOut(); localStorage.removeItem('ck-kid-cache'); return location.reload();
      }
      S.offset = new Date(srv).getTime() - Date.now();
      if (Math.abs(S.offset) < 5000) S.offset = 0;
      S.raw = { child, schedules, apps, yt, sites, tasks, subs, grants, breaks, penalties, trips, tripAnswers };
      checkUsageReset(child);
      // العمليات المُرسلة قبل هذا التحميل صارت ضمن بيانات الخادم
      S.ops = S.ops.filter((o) => !(o.sentAt && o.sentAt < fetchedAt)); save('ck-ops', S.ops);
      applyOps();
      if (!(S.tab === 'chat' && S.chatRoom === 'direct')) S.unread = unread.length;
      if (!(S.tab === 'chat' && S.chatRoom === 'family')) CK.famUnread(S.me.family_id).then((n) => { S.famUnread = n; drawNav(); drawChatTabs(); }, () => {});
      save('ck-kid-cache', { me: S.me, d: S.raw });
      tick(true);
      claimMainHour();
    } catch (e) { console.error(e); }
  }

  // بعد إنجاز المهام الرئيسية تُمنح «ساعتك اليومية» مرة واحدة في اليوم، ويبدؤها الطفل متى شاء
  let claimingMain = false;
  async function claimMainHour() {
    // المفتاح يتغير إذا صفّر الوالد مهام اليوم، فتُطلب الساعة من جديد بعد إعادة إنجازها
    const day = today() + '|' + (S.d.child.tasks_reset_at || '');
    if (claimingMain || !S.st?.mainsOk || localStorage.getItem('ck-main-day') === day) return;
    if (S.d.grants.some((g) => g.source === 'main' && g.day === today() && g.status === 'ready')) return localStorage.setItem('ck-main-day', day);
    claimingMain = true;
    const { data, error } = await sb.rpc('claim_main', { p_day: today() });
    claimingMain = false;
    if (error) return;
    localStorage.setItem('ck-main-day', day);
    if (data?.status !== 'ready' || S.d.grants.some((g) => g.id === data.id)) return; // ساعة اليوم سبق منحها
    CK.beep(); toast('🎉 أنجزت مهامك الرئيسية، كسبت ساعتك اليومية');
    reload();
  }
  const reloadSoon = CK.debounce(reload, 300);

  function onChange(p) {
    if (TRIPS.onChange(p)) return; // الألعاب العائلية: تحدّث شاشتها فقط
    if (p.table === 'trips' && p.eventType === 'INSERT' && S.d.child?.trips_enabled) { CK.beep(); N.toast('🧭 رحلة جديدة من والديك'); toast('🧭 رحلة جديدة من والديك: ' + (p.new?.title || '')); }
    if (p.table === 'messages') {
      if (p.eventType === 'DELETE') { if (p.old?.id) Object.values(S.chats).forEach((c) => c.remove(p.old.id)); return; } // الحذف اليومي للمحادثات
      const m = p.new;
      if (p.eventType !== 'INSERT' || !m) return;
      const room = m.room || 'direct', chat = S.chats[room];
      if (chat) chat.add(m);
      const seeing = S.tab === 'chat' && S.chatRoom === room && !document.hidden;
      if (room === 'family') { // مجموعة الأسرة
        if (m.sender_id ? m.sender_id === S.me.user_id : (m.sender === 'child' && m.child_id === S.me.child_id)) return;
        if (seeing) chat?.markRead();
        else { S.famUnread++; drawNav(); drawChatTabs(); }
        CK.beep(); N.toast('👨‍👩‍👧 ' + (m.sender_name || 'الأسرة') + ' في مجموعة الأسرة');
        if (!seeing) toast('👨‍👩‍👧 رسالة في مجموعة الأسرة من ' + (m.sender_name || 'أحد أفراد الأسرة'));
        return;
      }
      if (m.sender === 'parent') {
        if (seeing) chat?.markRead();
        else { S.unread++; drawNav(); drawChatTabs(); }
        CK.beep(); N.toast('💬 رسالة من ' + (m.sender_name || 'والديك'));
        if (!seeing) toast('💬 رسالة جديدة من ' + (m.sender_name || 'والديك'));
      }
      return;
    }
    // ولي الأمر ضغط "تحديث قائمة التطبيقات"
    if (p.table === 'children' && p.eventType === 'UPDATE' && p.new?.id === S.me?.child_id
      && p.new.apps_refresh_at && p.new.apps_refresh_at !== localStorage.getItem('ck-apps-refresh')) {
      localStorage.setItem('ck-apps-refresh', p.new.apps_refresh_at);
      reportApps(true);
    }
    if (p.table === 'penalties' && p.eventType === 'INSERT' && p.new?.child_id === S.me?.child_id) {
      const t = `⛔ عقوبة: نقص ${p.new.minutes} دقيقة من وقتك` + (p.new.reason ? ' — ' + p.new.reason : '');
      CK.beep(); toast(t); N.toast(t);
    }
    if (p.table === 'grants' && p.eventType === 'INSERT' && p.new.source === 'parent') { CK.beep(); N.toast('🎉 سمح لك والداك بوقت إضافي'); }
    if (p.table === 'submissions' && p.eventType === 'UPDATE' && p.old?.status !== p.new.status) {
      if (p.new.status === 'approved') { CK.beep(); toast('🎉 أجاز والداك مهمتك'); N.toast('🎉 أجاز والداك مهمتك'); }
      if (p.new.status === 'rejected') toast('طُلب منك إعادة المهمة');
    }
    reloadSoon();
  }

  const reportUsage = () => S.U.day && sb.rpc('report_usage', { p_day: S.U.day, p_secs: Math.floor(S.U.used / 1000),
    p_reset: localStorage.getItem('ck-usage-reset') || null }).then(() => {}, () => {});
  // الوالد صفّر وقت الاستخدام اليوم: يعود العدّاد المحلي إلى صفر
  function checkUsageReset(child) {
    const r = child.usage_reset_at;
    if (!r || localStorage.getItem('ck-usage-reset') === r) return;
    const first = localStorage.getItem('ck-usage-reset') == null && today() !== CK.dayStr(new Date(r));
    localStorage.setItem('ck-usage-reset', r);
    if (first) return; // تصفير قديم من يوم سابق: لا يمس عدّاد اليوم
    Object.assign(S.U, { used: 0, since: 0, rest: 0, warned: '' }); save('ck-usage', S.U);
    S.lastReason = undefined;
    toast('🔄 صفّر والداك وقتك اليوم'); N.toast('🔄 صفّر والداك وقتك اليوم');
  }
  const heartbeat = () => { reportUsage(); sb.rpc('heartbeat', { p_info: N.info() }).then(() => {}, () => {}); };
  // تُرسل قائمة التطبيقات فقط إذا تغيّرت (تثبيت أو حذف تطبيق)، أو دائمًا عند force (طلب ولي الأمر)
  const reportApps = async (force) => {
    const apps = N.apps(force === true); if (!apps.length) return;
    const sig = S.me.child_id + ':' + apps.map((a) => a.package).sort().join();
    if (force !== true && localStorage.getItem('ck-apps-sig') === sig) return;
    const { error } = await sb.rpc('report_apps', { p_apps: apps });
    if (!error) localStorage.setItem('ck-apps-sig', sig);
  };
  // يستدعيها تطبيق أندرويد عند تثبيت تطبيق أو حذفه
  window.onAppsChanged = CK.debounce(() => S.me && reportApps(true), 3000);
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
    if (S.resting || (S.d.child.paused_at && !(S.st && S.st.unlocked))) on = 0; // التوقف المؤقت لا يُحسب من الاستخدام
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
    // انتهى الوقت المسموح والرصيد يجري: يُوقف من لحظة انتهائه، والباقي محفوظ لوقت مسموح لاحق
    if (st.reason === 'window' && st.left > 30000 && S.autoPause !== st.pauseAt) {
      S.autoPause = st.pauseAt;
      pushOp({ type: 'pause', at: iso(st.pauseAt) });
      CK.beep(); toast('⏸ انتهى الوقت المسموح، وباقي وقتك محفوظ لك'); N.toast('⏸ انتهى الوقت المسموح، وباقي وقتك محفوظ لك');
      return;
    }
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
    if (st.windowCut && st.until - tm <= 5 * 60000 && U.winWarned !== st.until) {
      U.winWarned = st.until; save('ck-usage', U);
      CK.beep(); toast(`⏳ ينتهي الوقت المسموح الساعة ${clock(st.until)}، وما يبقى من وقتك يُحفظ لك`);
    }
    if (st.capped && st.until - tm <= 10 * 60000 && U.warned !== day) {
      U.warned = day; save('ck-usage', U);
      CK.beep(); toast('⏳ بقيت 10 دقائق من وقتك اليومي'); N.toast('⏳ بقيت 10 دقائق من وقتك اليومي');
    }
    S.lastReason = st.reason;
  }

  function drawHero(st, t) {
    const c = S.d.child;
    let line, big = '', btn = null;
    if (st.unlocked) {
      line = st.capped && st.until - t.getTime() < 3600000 ? 'آخر وقتك اليومي ⏳'
        : { parent: 'سمح لك والداك 🎁', task: 'وقت كسبته بإنجازك 💪', main: 'ساعتك اليومية ⭐' }[st.why];
      big = CK.countdown(st.until - t.getTime());
      if (!S.breakOpen && !c.paused_at) btn = 'pause'; // أثناء إذن الوالدين فوق وقت موقوف: لا يُوقف الإذن
    } else if (st.reason === 'pause') {
      line = st.canResume ? 'وقتك متوقف ⏸ — الباقي محفوظ لك'
        : st.nextWindow ? `وقتك محفوظ ⏸ — تستأنفه الساعة ${clock(st.nextWindow.s)}` : 'وقتك محفوظ ⏸ — تستأنفه في الوقت المسموح';
      big = CK.countdown(st.left);
      btn = st.canResume ? 'resume' : null;
    } else if (st.reason === 'window') line = 'انتهى الوقت المسموح الآن';
    else if (st.reason === 'ready') {
      line = st.canStart ? 'لديك وقت كسبته، ابدأه من الأسفل 🎁'
        : st.nextWindow ? `لديك وقت كسبته، تبدؤه الساعة ${clock(st.nextWindow.s)}` : 'لديك وقت كسبته، تبدؤه في الوقت المسموح';
    } else if (st.reason === 'cap') line = `انتهى حدّك اليومي (${capText(c.max_daily_min)})، نلتقي غدًا 🌙`;
    else if (st.reason === 'force') line = 'الجهاز مقفل من والديك';
    else if (st.reason === 'main') line = 'أنجز مهامك الرئيسية ليُفتح الجهاز';
    else line = 'أنجز مهمة لتكسب وقتًا 💪';
    const key = (st.unlocked ? 'u' : 'l') + line + btn;
    if (heroEl.dataset.key !== key) {
      heroEl.dataset.key = key;
      const pz = btn === 'pause'
        ? h('button', { class: 'btn ghost sm', style: 'margin-top:8px', onclick: () => {
          pushOp({ type: 'pause', at: iso(now().getTime()) }); toast('⏸ توقف وقتك، والباقي محفوظ لك');
        } }, '⏸ إيقاف الوقت مؤقتًا')
        : btn === 'resume'
          ? h('button', { class: 'btn ok', style: 'margin-top:8px', onclick: () => {
            pushOp({ type: 'resume', at: iso(now().getTime()) }); toast('▶ استأنفت وقتك، استمتع!');
          } }, '▶ استئناف الوقت')
          : null;
      heroEl.replaceChildren(h('div', { class: 'hero' + (st.unlocked ? '' : ' locked') },
        h('div', { class: 'row between' }, h('b', {}, 'مرحبًا ' + c.name), h('span', {}, st.unlocked ? '🔓' : st.reason === 'pause' ? '⏸' : '🔒')),
        h('div', {}, line), h('div', { class: 'big', id: 'cd' }), pz, h('div', { class: 'small', id: 'use', style: 'opacity:.85' })));
    }
    const cd = $('#cd', heroEl);
    cd.textContent = big; cd.classList.toggle('hidden', !big);
    const use = $('#use', heroEl), m = Math.floor(S.U.used / 60000);
    use.textContent = c.max_daily_min ? `استخدامك اليوم ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} من ${capText(c.max_daily_min)}` : '';
  }

  function drawNav() {
    navEl.replaceChildren(...TABS.filter(([id]) => (id !== 'yt' || S.d.yt.length) && (id !== 'trips' || S.d.child?.trips_enabled)).map(([id, ic, name]) =>
      h('button', { class: S.tab === id ? 'on' : '', type: 'button', 'aria-current': S.tab === id ? 'page' : null, onclick: () => goTab(id) },
        h('span', { class: 'pill' }, CKTheme.icon(ic), id === 'chat' && (S.unread + S.famUnread) ? h('span', { class: 'badge' }, S.unread + S.famUnread) : null), h('b', {}, name))));
  }

  function render() {
    drawNav();
    if (S.tab === 'chat') return viewChat();
    mainEl.style.padding = '';
    const top = mainEl.scrollTop;
    if (S.tab === 'trips' && !S.d.child?.trips_enabled) S.tab = 'home';
    mainEl.replaceChildren(...{ home: viewHome, tasks: viewTasks, yt: viewYt, trips: viewTrips, settings: viewSettings }[S.tab]().filter(Boolean),
      h('p', { class: 'small muted center', style: 'margin:18px 0 6px' }, 'رقيب — الإصدار ' + appVersion()));
    mainEl.scrollTop = top;
  }

  // ================= الإصدار والتحديث =================
  const REPO_API = 'https://api.github.com/repos/STOOOOF1/raqeeb/releases/latest';
  const appVersion = () => N.info().version || 'معاينة';
  const appCode = () => { try { return B && B.versionCode ? B.versionCode() : 0; } catch { return 0; } };
  // U: idle | checking | latest | available | downloading | installing | confirm | done | error
  const UPD = { state: 'idle', progress: 0, latest: null, url: null, error: '' };
  let updEl = null;
  window.onUpdateStatus = (s) => {
    Object.assign(UPD, { state: s.state, progress: s.progress ?? UPD.progress, error: s.error || '' });
    drawUpdate();
  };

  async function checkUpdate() {
    if (!N.has || !B.installUpdate) { Object.assign(UPD, { state: 'error', error: 'التحديث من داخل التطبيق يعمل على جهاز الطفل فقط' }); return drawUpdate(); }
    Object.assign(UPD, { state: 'checking', error: '' }); drawUpdate();
    try {
      const r = await fetch(REPO_API, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rel = await r.json();
      const code = parseInt(String(rel.tag_name).replace(/\D+/g, ''), 10) || 0;
      const asset = (rel.assets || []).find((a) => a.name === 'raqeeb.apk');
      UPD.latest = code; UPD.url = asset ? asset.browser_download_url : '';
      UPD.state = code > appCode() && asset ? 'available' : 'latest';
    } catch (e) {
      Object.assign(UPD, { state: 'error', error: 'تعذّر الاتصال بالإنترنت' });
    }
    drawUpdate();
  }

  function drawUpdate() {
    if (!updEl) return; // يُرسم أيضًا قبل إضافته للشاشة (أول فتح لتبويب الإعدادات)
    const s = UPD.state;
    const msg = {
      idle: '', checking: 'جارٍ البحث عن تحديث…', latest: '✓ لديك أحدث إصدار',
      available: `يتوفر إصدار جديد (1.2.${UPD.latest})`, downloading: `جارٍ التنزيل… ${UPD.progress}%`,
      installing: 'جارٍ التثبيت… سيُعاد فتح التطبيق تلقائيًا', confirm: 'وافق على التثبيت في النافذة الظاهرة',
      done: '✓ تم التحديث', error: '⚠️ ' + UPD.error,
    }[s];
    const busy = ['checking', 'downloading', 'installing', 'confirm'].includes(s);
    const btn = s === 'available'
      ? h('button', { class: 'btn ok', onclick: () => { Object.assign(UPD, { state: 'downloading', progress: 0 }); drawUpdate(); B.installUpdate(UPD.url); } }, '⬇️ تنزيل وتثبيت')
      : h('button', { class: 'btn', disabled: busy, onclick: checkUpdate }, '🔄 تحديث');
    updEl.replaceChildren(
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', {}, 'الإصدار ' + appVersion()), msg ? h('div', { class: 'small muted' }, msg) : null), btn),
      s === 'downloading' ? h('div', { style: 'height:6px;background:var(--line);border-radius:3px;margin-top:10px;overflow:hidden' },
        h('div', { style: `height:100%;width:${UPD.progress}%;background:var(--pri)` })) : null);
  }

  function viewSettings() {
    const info = N.info();
    updEl = h('div', {});
    drawUpdate();
    if (UPD.state === 'idle' && N.has) setTimeout(checkUpdate, 0); // يبحث عن تحديث تلقائيًا عند فتح الإعدادات
    return [
      h('div', { class: 'card' }, h('h2', {}, '⚙️ الإعدادات'), updEl),
      CKTheme.picker(),
      CK.whatsNew?.('kid'),
      h('div', { class: 'card' }, h('h2', {}, 'معلومات الجهاز'),
        h('div', { class: 'small muted' }, (info.model || '') + (info.android ? ' — أندرويد ' + info.android : '')),
        S.d.child ? h('div', { class: 'small muted' }, 'مرتبط باسم: ' + S.d.child.name) : null),
    ];
  }

  // ================= الرئيسية =================
  const subToday = (t) => S.d.subs.find((s) => s.task_id === t.id && s.day === today() && s.status !== 'rejected');
  const pendingOf = (t) => S.d.subs.find((s) => s.task_id === t.id && s.status === 'pending');

  function mainTasksCard() {
    const st = S.st;
    if (!st.mainList.length) return null;
    return h('div', { class: 'card' + (st.mainsOk ? '' : ' warn') }, h('h2', {}, '⭐ مهامي الرئيسية اليوم'),
      h('p', { class: 'small muted' }, 'أنجزها كلها لتكسب ساعتك اليومية، ثم زد وقتك حتى ساعتين بمهام النصف ساعة والربع ساعة.'),
      st.mainList.map((m) => h('div', { class: 'item' }, h('span', { class: 'grow' }, m.task.title),
        m.sub ? h('span', { class: 'tag ' + (m.sub.status === 'approved' ? 'ok' : 'warn') }, m.sub.status === 'approved' ? 'تمت ✓' : m.ok ? 'أُبلغ والداك ✓' : 'بانتظار تأكيد والديك')
          : m.task.config?.yt ? h('button', { class: 'btn sm', onclick: () => openMain(m.task) }, '🎬 شاهد واختبر')
          : h('button', { class: 'btn sm', onclick: () => run(async () => {
            await q(sb.from('submissions').insert({ family_id: S.me.family_id, child_id: S.me.child_id, task_id: m.task.id, kind: 'main', day: today() }));
            await reload();
          }, 'أُرسل إشعار لوالديك') }, 'أنجزتها'))));
  }

  // مهمة رئيسية فيها مقطع: يشاهده كاملًا، ثم يجيب الأسئلة كلها صحيحة، ثم تُرسل لوالديه
  function openMain(t) {
    const body = openOverlay('⭐ ' + t.title);
    watchThenQuiz(body, t, () => run(async () => {
      await q(sb.from('submissions').insert({ family_id: S.me.family_id, child_id: S.me.child_id, task_id: t.id, kind: 'main', day: today() }));
      closeOverlay(); await reload();
    }, 'أحسنت! أُرسل إشعار لوالديك 🌟'));
  }

  function readyCard() {
    const st = S.st;
    if (!st.ready.length) return null;
    return h('div', { class: 'card soft' }, h('h2', {}, '🎁 وقت كسبته'),
      st.mainsOk ? null : h('p', { class: 'small' }, 'يبدأ بعد إنجاز مهامك الرئيسية.'),
      st.mainsOk && !st.inWindow ? h('p', { class: 'small' }, st.nextWindow ? `تبدؤه في الوقت المسموح، الساعة ${clock(st.nextWindow.s)}.` : 'تبدؤه في الوقت المسموح من جدولك.') : null,
      st.mainsOk && st.inWindow ? h('p', { class: 'small muted' }, 'ابدأ ما تشاء منها، وكل وقت يبدأ بعد انتهاء الذي قبله.') : null,
      st.ready.map((g) => h('div', { class: 'item' }, h('span', { class: 'grow' }, (g.source === 'main' ? '⭐ ' : '') + (g.title || 'وقت إضافي')),
        h('button', { class: 'btn', disabled: !st.mainsOk || !st.canStart, onclick: () => {
          const s = nextStart();
          pushOp({ type: 'start', grant: g.id, start: iso(s), end: iso(s + g.minutes * 60000) });
          toast('بدأ وقتك، استمتع!');
        } }, `ابدأ ${g.minutes} دقيقة`))));
  }

  // عقوبات اليوم: تُنقص من وقته المكتسب، وما لم يكفه رصيده يُخصم مما يكسبه لاحقًا اليوم
  function penaltiesCard() {
    const list = (S.d.penalties || []).filter((p) => p.day === today());
    if (!list.length) return null;
    const owed = list.reduce((a, p) => a + p.minutes - Math.ceil(p.applied_sec / 60), 0);
    return h('div', { class: 'card warn' }, h('h2', {}, '⛔ عقوبات اليوم'),
      list.map((p) => h('div', { class: 'item' }, h('b', {}, `−${p.minutes} دقيقة`), h('span', { class: 'grow small' }, p.reason || ''))),
      owed > 0 ? h('p', { class: 'small' }, `بقي ${owed} دقيقة تُخصم من الوقت الذي تكسبه اليوم.`) : null);
  }

  function viewHome() {
    const st = S.st, out = [];
    if (!S.d.child.kiosk_enabled) out.push(h('div', { class: 'card warn' }, h('p', {}, 'وضع القفل متوقف مؤقتًا من الوالدين.')));
    if (!st.mainsOk) out.push(mainTasksCard());
    out.push(readyCard(), penaltiesCard());
    if (st.unlocked) {
      const apps = S.d.apps, sites = S.d.sites || [];
      out.push(h('div', { class: 'card' }, h('h2', {}, 'تطبيقاتي'),
        apps.length || S.d.yt.length || sites.length ? h('div', { class: 'appgrid' },
          S.d.yt.length ? h('button', { class: 'appicon', onclick: () => { S.tab = 'yt'; render(); } }, h('div', { class: 'ph' }, '▶️'), h('span', {}, 'يوتيوب')) : null,
          sites.map((s) => h('button', { class: 'appicon', onclick: () => N.site(s) }, siteIcon(s), h('span', {}, s.title || CK.siteHost(s.url)))),
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

    const extraLeft = c.max_extra_per_day - count(['quran', 'matn', 'chore', 'draw']);
    const extra = S.d.tasks.filter((t) => ['quran', 'matn', 'chore', 'draw'].includes(t.kind));
    out.push(h('div', { class: 'card' }, h('h2', {}, '🕧 مهام تكسب بها نصف ساعة'),
      extraLeft <= 0 ? h('p', { class: 'tag warn' }, 'بلغت الحد اليومي لهذه المهام') : null,
      extra.length ? extra.map((t) => {
        const pend = pendingOf(t);
        const p = t.kind === 'chore' ? null : CK.nextPortion(t);
        let action;
        if (pend) action = h('span', { class: 'tag warn' }, 'بانتظار الإجازة');
        else if (p?.done) action = h('span', { class: 'tag ok' }, 'أتممته 🎉');
        else if (t.kind === 'chore' && subToday(t)) action = h('span', { class: 'tag ok' }, 'تمت اليوم ✓');
        else action = h('button', { class: 'btn sm', disabled: extraLeft <= 0, onclick: () => (t.kind === 'chore' ? openChore(t) : t.kind === 'draw' ? openDraw(t) : openHifz(t)) }, 'ابدأ');
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
      quick.length ? quick.map((t) => h('div', { class: 'item' }, h('span', { class: 'avatar' }, t.config?.yt ? '🎬' : KINDS[t.kind].ic),
        h('div', { class: 'grow' }, h('div', {}, t.title), h('div', { class: 'small muted' }, `${t.config?.yt ? 'شاهد واختبر' : KINDS[t.kind].name} · ${t.reward_min} دقيقة`)),
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

  // ---- الواي فاي من داخل التطبيق ----
  // لا تُفتح إعدادات النظام مع القفل: في شاومي وغيرها تفتح تطبيق الإعدادات كله
  const W = {
    state: () => { try { return JSON.parse(B.wifiState()); } catch { return {}; } },
    list: (rescan) => { try { return JSON.parse(B.wifiNetworks(!!rescan)); } catch { return []; } },
  };
  function openWifi() {
    if (!B) return;
    if (!B.wifiNetworks || !N.info().owner) return B.openWifi(); // بلا قفل: إعدادات النظام كالمعتاد
    const body = openOverlay('📶 الواي فاي');
    const el = S.overlay;
    const status = h('div', { class: 'card soft' });
    const list = h('div', { class: 'col' });
    let nets = [], busy = false;
    const alive = () => S.overlay === el;
    const bars = (n) => '▂▄▆█'.slice(0, Math.max(1, n));
    const showStatus = () => {
      const s = W.state();
      status.replaceChildren(s.wifi && s.ssid
        ? h('div', {}, h('b', {}, `متصل بـ «${s.ssid}»`), h('div', { class: 'small muted' }, s.online ? 'الإنترنت يعمل ✓' : 'متصل بالشبكة لكن الإنترنت لا يعمل'))
        : h('div', {}, h('b', {}, 'غير متصل بالواي فاي'), h('div', { class: 'small muted' }, 'اختر شبكتك من القائمة.')),
      !s.location || !s.permission ? h('div', { class: 'small muted', style: 'margin-top:6px' }, 'لا تظهر الشبكات؟ اكتب اسم الشبكة بنفسك من الزر في الأسفل.') : null);
      return s;
    };
    const showList = () => {
      const cur = W.state().ssid;
      list.replaceChildren(...(nets.length ? nets.map((n) => h('button', { class: 'item', style: 'width:100%;text-align:start', onclick: () => pick(n) },
        h('span', { class: 'avatar', dir: 'ltr' }, bars(n.level)),
        h('div', { class: 'grow' }, h('div', { dir: 'auto' }, n.ssid),
          h('div', { class: 'small muted' }, n.ssid === cur ? 'متصل' : n.sec === 'open' ? 'مفتوحة' : n.sec === 'eap' || n.sec === 'wep' ? 'تحتاج إعدادًا خاصًا' : '🔒 بكلمة مرور'))))
        : [h('p', { class: 'muted center' }, 'جارٍ البحث عن الشبكات…')]));
    };
    const scan = () => {
      nets = W.list(true); showList();
      // نتائج البحث الجديد تصل بعد ثوانٍ
      [2500, 6000].forEach((ms) => setTimeout(() => { if (alive() && !busy) { nets = W.list(false); showList(); showStatus(); } }, ms));
    };
    const home = () => {
      busy = false;
      body.replaceChildren(status, list,
        h('button', { class: 'btn ghost block', onclick: scan }, '↻ بحث من جديد'),
        h('button', { class: 'btn plain block', onclick: () => form({ ssid: '', sec: 'psk', manual: true }) }, '✍️ أكتب اسم الشبكة بنفسي'));
      showStatus(); scan();
    };
    const pick = (n) => {
      if (n.ssid === W.state().ssid) return toast('أنت متصل بهذه الشبكة');
      if (n.sec === 'open') return connect(n, '');
      form(n);
    };
    const form = (n) => {
      busy = true;
      const ssid = h('input', { type: 'text', dir: 'auto', placeholder: 'اسم الشبكة', value: n.ssid, autocomplete: 'off' });
      const pass = h('input', { type: 'password', dir: 'ltr', placeholder: 'كلمة المرور', autocomplete: 'off' });
      const show = h('input', { type: 'checkbox', onchange: () => { pass.type = show.checked ? 'text' : 'password'; } });
      const open = h('input', { type: 'checkbox', onchange: () => { pass.disabled = open.checked; } });
      const go = h('button', { class: 'btn big block', type: 'submit' }, 'اتصال');
      body.replaceChildren(h('form', { class: 'col', onsubmit: (ev) => {
        ev.preventDefault();
        connect({ ssid: ssid.value.trim(), sec: open.checked ? 'open' : n.sec, manual: n.manual }, pass.value);
      } },
      n.manual ? h('label', { class: 'f' }, 'اسم الشبكة', ssid) : h('h2', { dir: 'auto' }, n.ssid),
      h('label', { class: 'f' }, 'كلمة المرور', pass),
      h('label', { class: 'row' }, show, 'إظهار كلمة المرور'),
      n.manual ? h('label', { class: 'row' }, open, 'شبكة مفتوحة بلا كلمة مرور') : null,
      go, h('button', { class: 'btn plain block', type: 'button', onclick: home }, 'رجوع')));
      (n.manual ? ssid : pass).focus();
    };
    const connect = (n, pass) => {
      busy = true;
      const err = B.wifiConnect(n.ssid, pass, n.sec, !!n.manual);
      if (err) { toast(err); return; }
      body.replaceChildren(h('div', { class: 'card soft center' }, h('b', {}, `جارٍ الاتصال بـ «${n.ssid}»…`)));
      const t0 = Date.now();
      const wait = () => {
        if (!alive()) return;
        const s = W.state();
        if (s.wifi && s.ssid === n.ssid) { toast('تم الاتصال ✓'); window.dispatchEvent(new Event('online')); return home(); }
        if (Date.now() - t0 > 25000) { toast('لم يتم الاتصال، تأكد من كلمة المرور'); return n.sec === 'open' ? home() : form(n); }
        setTimeout(wait, 1500);
      };
      setTimeout(wait, 2000);
    };
    home();
  }

  // ---- الحفظ والتسميع ----
  function openHifz(t) {
    const p = CK.nextPortion(t);
    const body = openOverlay(KINDS[t.kind].ic + ' ' + t.title);
    const portion = h('div', { class: 'portion' }, p.text);
    const stage = h('div', { class: 'col' });
    const unitW = t.kind === 'quran' ? 'الآيات' : t.split === 'sentence' ? 'الجمل' : 'الأبيات';
    const label = p.sec ? `${p.sec}: ${unitW} ${p.secFrom} إلى ${p.secTo}` : `${unitW} ${p.from + 1} إلى ${p.to}`;
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
            audio_path: path, portion: (p.sec ? p.sec + ' — ' : '') + p.text, units_from: p.from, units_to: p.to }));
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

  // ---- الكتابة والرسم بالإصبع ----
  // يرسم كل عنصر من جلسة اليوم ثم تُرسل الرسومات صورةً واحدة لوالديه؛ عند الإجازة ينتقل لما بعدها
  function openDraw(t) {
    const p = CK.nextPortion(t), list = p.units.slice(p.from, p.to), free = t.config?.mode === 'free';
    const body = openOverlay('✏️ ' + t.title);
    const images = [];
    const step = (i) => {
      const pd = Games.pad({ mode: free ? 'free' : 'trace', guide: list[i] });
      const last = i === list.length - 1;
      const next = h('button', { class: 'btn big block', onclick: () => {
        if (pd.empty()) return toast(free ? 'ارسم أولًا ثم اضغط التالي' : 'اكتب فوق الحرف بإصبعك أولًا');
        images[i] = pd.image();
        if (last) review(); else step(i + 1);
      } }, last ? 'انتهيت ✓' : 'التالي ←');
      body.replaceChildren(
        h('div', { class: 'card soft' }, h('b', {}, free ? `🎨 ارسم: ${list[i]}` : `✍️ اكتب: ${list[i]}`),
          h('p', { class: 'small', style: 'margin:4px 0 0' }, (list.length > 1 ? `${i + 1} من ${list.length} · ` : '') +
            (free ? 'ارسم بإصبعك واختر الألوان التي تحبها.' : 'مرّر إصبعك فوق الحرف الباهت بهدوء.'))),
        pd.el, next);
      if (S.overlay) S.overlay.scrollTop = 0;
    };
    const review = async () => {
      const blob = await Games.stack(images);
      const send = h('button', { class: 'btn big ok block', onclick: async () => {
        send.disabled = true; send.textContent = 'جارٍ الإرسال…';
        const ok = await run(async () => {
          const path = await CK.uploadAudio(blob, S.me.family_id, S.me.child_id);
          await q(sb.from('submissions').insert({ family_id: S.me.family_id, child_id: S.me.child_id, task_id: t.id, kind: 'draw', day: today(),
            audio_path: path, portion: list.join('، '), units_from: p.from, units_to: p.to }));
          await reload();
        }, `أُرسل ${free ? 'رسمك' : 'ما كتبته'} لوالديك، انتظر إجازتهم 🌟`);
        if (ok) closeOverlay(); else { send.disabled = false; send.textContent = '📤 إرسال لوالديّ'; }
      } }, '📤 إرسال لوالديّ');
      body.replaceChildren(h('p', { class: 'center' }, 'أحسنت! هذا ما رسمته:'),
        h('img', { src: URL.createObjectURL(blob), alt: '', style: 'width:100%;max-width:440px;margin:0 auto;display:block;border-radius:12px;border:1.5px solid var(--line)' }),
        h('p', { class: 'small muted center' }, `بعد إجازة والديك تكسب ${t.reward_min} دقيقة.`), send,
        h('button', { class: 'btn plain block', onclick: () => { images.length = 0; step(0); } }, '↺ أعد الرسم'));
    };
    step(0);
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
  // يُضاف الوقت رصيدًا جاهزًا فورًا حتى بلا إنترنت، ويبدؤه الطفل متى شاء في الوقت المسموح
  function claim(t) {
    closeOverlay(); S.tab = 'home';
    pushOp({ type: 'quick', task: t.id, kind: t.kind, title: t.title, minutes: t.reward_min, day: today() });
    render();
    toast(S.st.reason === 'cap' ? `أحسنت! أضيف ${t.reward_min} دقيقة لرصيدك، لكنك بلغت حدك اليومي` : `أحسنت! أضيف ${t.reward_min} دقيقة لرصيدك 🎉`);
  }

  // مقطع ← (نص إن وُجد) ← اختبار؛ عند الخطأ يعيد بأسئلة مختلفة، ويمكنه إعادة مشاهدة المقطع
  function watchThenQuiz(body, t, onPass) {
    const used = new Set(), yt = t.config.yt, size = t.config.quiz_size || 3;
    const test = async () => { const pass = await Games.quiz(body, t.questions, size, used); if (pass) onPass(); else ready(true); };
    const ready = (again) => {
      body.replaceChildren(
        again ? h('div', { class: 'card bad' }, h('b', {}, 'بعض إجاباتك لم تكن صحيحة'), h('p', {}, 'يمكنك مشاهدة المقطع مرة أخرى، وستأتيك أسئلة مختلفة.'))
          : h('div', { class: 'card soft' }, h('b', {}, '👏 أكملت المشاهدة'), h('p', { class: 'small' }, `أجب عن ${Math.min(size, t.questions.length)} أسئلة إجابة صحيحة لتنجز المهمة.`)),
        t.body ? h('div', { class: 'card' }, h('div', { class: 'reading' }, t.body)) : null,
        h('button', { class: 'btn big block', onclick: test }, again ? 'أعطني أسئلة أخرى' : 'اختبرني'),
        h('button', { class: 'btn ghost block', onclick: rewatch }, '▶ أعد مشاهدة المقطع'));
      if (S.overlay) S.overlay.scrollTop = 0;
    };
    // إعادة المشاهدة حرة (سبق أن أكمله)، والاختبار متاح في أي وقت
    const rewatch = () => {
      const p = new URLSearchParams({ autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3 });
      if (yt.start) p.set('start', yt.start); if (yt.end) p.set('end', yt.end);
      body.replaceChildren(
        h('div', { class: 'player' }, h('iframe', { src: `https://www.youtube-nocookie.com/embed/${yt.id}?${p}`, allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' })),
        h('button', { class: 'btn big block', onclick: test }, 'اختبرني'));
    };
    if (Games.watchedToday(t.id)) ready(false);
    else Games.watch(body, yt, t.id).then((ok) => { if (ok && body.isConnected) ready(false); });
  }

  function openReading(t) {
    if (t.config.yt) return watchThenQuiz(openOverlay('🎬 ' + t.title), t, () => claim(t));
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

  // ================= المواقع =================
  function siteIcon(s) {
    const ph = h('div', { class: 'ph' }, '🌐');
    let o; try { o = new URL(s.url).origin; } catch { return ph; }
    const img = h('img', { src: o + '/favicon.ico', alt: '', loading: 'lazy', style: 'padding:12px;object-fit:contain', onerror: () => img.replaceWith(ph) });
    return img;
  }
  // للمعاينة في المتصفح أو إصدار أندرويد لا يعرف openSite؛ بعض المواقع ترفض العرض داخل إطار
  function openSiteFrame(s) {
    const body = openOverlay('🌐 ' + (s.title || CK.siteHost(s.url)));
    S.overlay.dataset.needsUnlock = '1';
    body.append(h('iframe', { src: s.url, style: 'width:100%;height:calc(100vh - 90px);border:0;border-radius:14px;background:#fff',
      sandbox: 'allow-scripts allow-same-origin allow-forms', referrerpolicy: 'strict-origin-when-cross-origin' }),
    h('p', { class: 'small muted' }, 'إن ظهرت الصفحة فارغة فحدّث تطبيق رقيب من الإعدادات ليفتح الموقع كاملًا.'));
  }

  // ================= رحلاتنا =================
  // نماذج يعدّها والداه يجيب عنها، وألعاب عائلية يلعبها مع أسرته (shared/trips.js). للمتعة فقط: لا تمنح وقتًا
  const tripsCtx = () => ({ role: 'kid', me: S.me, overlay: (t) => openOverlay(t), close: closeOverlay, answers: () => S.d.tripAnswers, saved: reloadSoon });
  function viewTrips() {
    const trips = S.d.trips || [];
    return [
      h('div', { class: 'card soft' }, h('h2', { style: 'margin:0' }, '🧭 رحلاتنا'), h('p', { class: 'small', style: 'margin:0' }, 'رحلات أعدّها لك والداك: أسئلة ومقاطع وألعاب تلعبها مع أسرتك.')),
      ...trips.map((t) => {
        const p = TRIPS.progress(t, S.d.tripAnswers, S.me.child_id);
        const games = (t.items || []).filter((it) => it.kind === 'game').length;
        return h('button', { class: 'card', style: 'text-align:start;cursor:pointer;border:0;font:inherit;color:inherit', onclick: () => TRIPS.openTrip(tripsCtx(), t) },
          h('div', { class: 'row' }, h('span', { class: 'avatar' }, p.total && p.done >= p.total ? '🏁' : '🧭'),
            h('div', { class: 'grow' }, h('b', {}, t.title), h('div', { class: 'small muted' },
              (p.total ? `أنجزت ${p.done} من ${p.total}` : '') + (games ? (p.total ? ' · ' : '') + `🎲 ${games === 1 ? 'لعبة' : games + ' ألعاب'}` : ''))),
            h('span', { class: 'tag pri' }, p.total && p.done >= p.total ? 'مكتملة ✓' : p.done ? 'أكمل' : 'ابدأ')),
          p.total ? h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((p.done / p.total) * 100)}%` })) : null);
      }),
      trips.length ? null : h('div', { class: 'card center' }, h('p', { class: 'muted' }, 'لا توجد رحلات بعد. سيضيفها والداك قريبًا 🌟')),
    ];
  }

  // ================= المحادثة =================
  // تبويبان: مع والديّ مباشرة، ومجموعة الأسرة التي يتحدث فيها الجميع
  function drawChatTabs() {
    if (!S.chatWrap) return;
    S.chatWrap.firstChild.replaceWith(CK.chatTabs([['direct', '💬 مع والديّ', S.unread], ['family', '👨‍👩‍👧 مجموعة الأسرة', S.famUnread]],
      S.chatRoom, (id) => { if (id === S.chatRoom) return; S.chatRoom = id; localStorage.setItem('ck-chat-room', id); viewChat(); }));
  }
  function viewChat() {
    if (!S.chatWrap) {
      S.chatRoom = localStorage.getItem('ck-chat-room') === 'family' ? 'family' : 'direct';
      S.chatWrap = h('div', { class: 'chat-wrap' }, h('div'), h('div', { class: 'chat-slot' }));
    }
    const room = S.chatRoom;
    const chat = S.chats[room] ||= CK.Chat({ familyId: S.me.family_id, childId: S.me.child_id, sender: 'child', senderName: S.me.name, room });
    mainEl.style.padding = '0';
    const slot = S.chatWrap.lastChild;
    if (slot.firstChild !== chat.el) slot.replaceChildren(chat.el);
    if (mainEl.firstChild !== S.chatWrap) mainEl.replaceChildren(S.chatWrap);
    chat.focus(); chat.markRead();
    if (room === 'direct') S.unread = 0; else S.famUnread = 0;
    drawChatTabs(); drawNav();
  }

  boot();
})();
