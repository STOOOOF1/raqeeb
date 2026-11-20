'use strict';
// تطبيق الوالدين
(() => {
  const { sb, h, $, toast, run, q, modal, confirmBox, clock, hm, KINDS, WEEKDAYS } = CK;
  const root = $('#root');
  const S = {
    me: null, family: null, children: [], cur: localStorage.getItem('ck-cur'), tab: 'home', taskTab: 'main',
    d: { members: [], schedules: [], apps: [], yt: [], tasks: [], subs: [], grants: [], breaks: [], templates: [] },
    unread: {}, chat: null, chatChild: null, appFilter: '',
  };
  const cur = () => S.children.find((c) => c.id === S.cur) || null;
  const mine = (rows, c = cur()) => rows.filter((r) => r.child_id === c.id);
  const card = (title, ...kids) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, kids);
  const field = (label, input) => h('label', { class: 'f' }, label, input);

  // ================= الدخول =================
  async function boot() {
    try { S.me = await CK.me(); } catch (e) { console.error(e); }
    if (!S.me || S.me.role !== 'parent') return authScreen();
    if (!S.me.username) return claimScreen();
    if (sessionStorage.getItem('ck-unlocked') !== '1') return pinScreen();
    start();
  }

  // حساب من النظام القديم (رقم سري للأسرة): يختار اسم مستخدم وكلمة مرور مرة واحدة
  function claimScreen() {
    const user = h('input', { type: 'text', maxlength: 30, dir: 'ltr', autocapitalize: 'off', spellcheck: false, autocomplete: 'username' });
    const pass = h('input', { type: 'password', maxlength: 72, dir: 'ltr', autocomplete: 'new-password' });
    const pass2 = h('input', { type: 'password', maxlength: 72, dir: 'ltr', autocomplete: 'new-password' });
    root.replaceChildren(h('div', { class: 'splash' }, h('div', { class: 'card' },
      h('div', { class: 'logo' }, '🔐'), h('h1', { class: 'center' }, 'إعداد حسابك'),
      h('p', { class: 'small' }, `مرحبًا ${S.me.name}. أصبح الدخول باسم مستخدم وكلمة مرور خاصة بك بدل الرقم السري المشترك، فتدخل بها من أي جهاز. اخترهما الآن مرة واحدة.`),
      h('form', { class: 'col', onsubmit: async (ev) => {
        ev.preventDefault();
        await run(async () => {
          if (pass.value.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
          if (pass.value !== pass2.value) throw new Error('كلمتا المرور غير متطابقتين');
          await CK.fn('gate', { action: 'claim_account', username: user.value, password: pass.value });
          await CK.gate({ action: 'login', username: user.value, password: pass.value });
          sessionStorage.setItem('ck-unlocked', '1');
          boot();
        }, 'تم إعداد حسابك ✅');
      } }, field('اسم المستخدم (حروف أو أرقام بلا مسافات)', user), field('كلمة المرور', pass), field('تأكيد كلمة المرور', pass2),
        h('button', { class: 'btn big block', type: 'submit' }, 'حفظ والمتابعة')))));
  }

  // دخول بحساب ثابت (اسم مستخدم وكلمة مرور) أو إنشاء أسرة جديدة
  function authScreen() {
    let mode = 'login';
    const draw = () => {
      const f = {
        family: h('input', { type: 'text', placeholder: 'مثال: أسرة أبي عبدالله', maxlength: 40 }),
        name: h('input', { type: 'text', placeholder: 'مثال: الأب', maxlength: 30 }),
        user: h('input', { type: 'text', placeholder: 'مثال: abu_abdullah', maxlength: 30, autocomplete: 'username', autocapitalize: 'off', spellcheck: false, dir: 'ltr' }),
        pass: h('input', { type: 'password', maxlength: 72, autocomplete: mode === 'login' ? 'current-password' : 'new-password', dir: 'ltr' }),
        pass2: h('input', { type: 'password', maxlength: 72, autocomplete: 'new-password', dir: 'ltr' }),
      };
      const btn = h('button', { class: 'btn big block', type: 'submit' }, mode === 'login' ? 'دخول' : 'إنشاء الأسرة');
      const form = h('form', { class: 'col', onsubmit: async (ev) => {
        ev.preventDefault(); btn.disabled = true;
        const ok = await run(async () => {
          if (mode === 'create') {
            if (f.pass.value.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
            if (f.pass.value !== f.pass2.value) throw new Error('كلمتا المرور غير متطابقتين');
            await CK.gate({ action: 'create_family', family_name: f.family.value, parent_name: f.name.value, username: f.user.value, password: f.pass.value });
          } else await CK.gate({ action: 'login', username: f.user.value, password: f.pass.value });
          sessionStorage.setItem('ck-unlocked', '1');
        });
        btn.disabled = false;
        if (ok) boot();
      } },
        mode === 'create' ? field('اسم الأسرة', f.family) : null,
        mode === 'create' ? field('اسمك كما يظهر للطفل', f.name) : null,
        field(mode === 'create' ? 'اختر اسم مستخدم (حروف أو أرقام بلا مسافات)' : 'اسم المستخدم', f.user),
        field('كلمة المرور', f.pass),
        mode === 'create' ? field('تأكيد كلمة المرور', f.pass2) : null,
        btn,
        mode === 'login' ? h('p', { class: 'small muted center' }, 'نسيت كلمة المرور؟ اطلب من مدير أسرتك تعيين كلمة جديدة لك، أو تواصل مع الإدارة.')
          : h('p', { class: 'small muted center' }, 'ستكون أنت مدير الأسرة، وتضيف أولياء الأمور الآخرين من الإعدادات.'));
      root.replaceChildren(h('div', { class: 'splash' }, h('div', { class: 'card' },
        h('div', { class: 'logo' }, '🛡️'), h('h1', { class: 'center' }, 'رقيب'),
        h('p', { class: 'muted center' }, 'تطبيق الوالدين للتحكم بأجهزة الأطفال'),
        h('div', { class: 'tabs' },
          h('button', { class: mode === 'login' ? 'on' : '', onclick: () => { mode = 'login'; draw(); } }, 'تسجيل الدخول'),
          h('button', { class: mode === 'create' ? 'on' : '', onclick: () => { mode = 'create'; draw(); } }, 'أسرة جديدة')),
        form)));
    };
    draw();
  }

  // قفل التطبيق: يُفتح بكلمة مرور ولي الأمر نفسه
  function pinScreen() {
    const pass = h('input', { type: 'password', maxlength: 72, autocomplete: 'current-password', dir: 'ltr', autofocus: true });
    root.replaceChildren(h('div', { class: 'splash' }, h('div', { class: 'card' },
      h('div', { class: 'logo' }, '🔒'), h('h1', { class: 'center' }, 'مرحبًا ' + (S.me?.name || '')),
      h('p', { class: 'muted center' }, 'أدخل كلمة المرور لفتح التطبيق'),
      h('form', { class: 'col', onsubmit: async (ev) => {
        ev.preventDefault();
        await run(async () => {
          await CK.gate({ action: 'login', username: S.me.username, password: pass.value }).catch((e) => { pass.value = ''; throw e; });
          sessionStorage.setItem('ck-unlocked', '1');
          start();
        });
      } }, field('كلمة المرور', pass), h('button', { class: 'btn big block', type: 'submit' }, 'فتح')),
      h('button', { class: 'btn plain block', onclick: async () => { await sb.auth.signOut(); sessionStorage.clear(); location.reload(); } }, 'الدخول بحساب آخر'))));
    pass.focus();
  }

  // ================= الهيكل والبيانات =================
  let chipsEl, mainEl, navEl;
  const TABS = [['home', '🏠', 'الرئيسية'], ['schedule', '🕒', 'الأوقات'], ['apps', '📱', 'التطبيقات'],
    ['tasks', '✅', 'المهام'], ['breaks', '💡', 'الفوائد'], ['templates', '📚', 'القوالب'], ['chat', '💬', 'المحادثة'], ['settings', '⚙️', 'الإعدادات']];

  async function start() {
    chipsEl = h('div', { class: 'chips' });
    mainEl = h('div', { class: 'main' });
    navEl = h('div', { class: 'nav' });
    root.replaceChildren(h('div', { class: 'app' }, h('div', { class: 'top' }, chipsEl), mainEl, navEl));
    await reload();
    CK.subscribe(onChange);
    if (localStorage.getItem('ck-push') === '1') enablePush(false).catch(() => {}); // تجديد الاشتراك بصمت
    setInterval(() => { if (S.tab === 'home') render(); }, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
  }

  async function reload() {
    try {
      const fam = S.me.family_id;
      const since = CK.dayStr(new Date(Date.now() - 2 * 864e5));
      const nowIso = new Date().toISOString();
      const [family, children, members, schedules, yt, tasks, subs, grants, breaks, unread, templates, penalties] = await Promise.all([
        q(sb.from('families').select('id,name').eq('id', fam).single()),
        q(sb.from('children').select('*').order('created_at')),
        q(sb.from('members').select('*').eq('role', 'parent').order('created_at')),
        q(sb.from('schedules').select('*').order('start_time')),
        q(sb.from('yt_channels').select('*').order('created_at')),
        q(sb.from('tasks').select('*').order('sort').order('created_at')),
        q(sb.from('submissions').select('*').or(`status.eq.pending,day.gte.${since}`).order('created_at', { ascending: false })),
        q(sb.from('grants').select('*').or(`status.eq.ready,ends_at.gte.${nowIso}`).order('created_at')),
        q(sb.from('break_items').select('*').order('created_at')),
        q(sb.from('messages').select('child_id').eq('sender', 'child').is('read_at', null)),
        q(sb.from('templates').select('*').order('sort').order('created_at')),
        q(sb.from('penalties').select('*').gte('day', since).order('created_at', { ascending: false })),
      ]);
      S.family = family; S.children = children;
      children.forEach(capAlert);
      if (!cur()) { S.cur = children[0]?.id || null; }
      const apps = S.cur ? await q(sb.from('apps').select('*').eq('child_id', S.cur).order('label')) : [];
      S.d = { members, schedules, apps, yt, tasks, subs, grants, breaks, templates, penalties };
      S.unread = {};
      for (const m of unread) S.unread[m.child_id] = (S.unread[m.child_id] || 0) + 1;
      render();
    } catch (e) { console.error(e); toast(CK.errMsg(e)); }
  }
  const reloadSoon = CK.debounce(reload, 400);

  // تنبيه داخل التطبيق؛ إشعار النظام يأتي من الخادم عبر Push (انظر sw.js)
  function notify(title, body) {
    CK.beep(); toast(title + (body ? ': ' + body : ''));
  }

  // ---------- إشعارات Push ----------
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const b64ToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  // ask=true عند ضغط المستخدم الزر (يطلب الإذن)، و false للتجديد الصامت عند فتح التطبيق
  async function enablePush(ask) {
    if (!pushSupported()) { if (ask) throw new Error('هذا المتصفح لا يدعم الإشعارات. على الآيفون أضف التطبيق إلى الشاشة الرئيسية أولًا.'); return false; }
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    if (Notification.permission !== 'granted') {
      if (!ask) return false;
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('لم يُسمح بالإشعارات من إعدادات المتصفح');
    }
    const r = await fetch(CONFIG.url + '/functions/v1/push', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.key }, body: JSON.stringify({ action: 'vapid' }) });
    const { key } = await r.json();
    if (!key) throw new Error('تعذر الاتصال بخادم الإشعارات');
    const opts = { userVisibleOnly: true, applicationServerKey: b64ToBytes(key) };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try { sub = await reg.pushManager.subscribe(opts); }
      catch (e) { throw new Error('تعذر الاشتراك في الإشعارات على هذا المتصفح'); }
    }
    const j = sub.toJSON();
    await q(sb.rpc('save_push_sub', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth }));
    localStorage.setItem('ck-push', '1');
    return true;
  }
  async function disablePush() {
    localStorage.removeItem('ck-push');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { await sb.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    } catch { /* لا اشتراك */ }
  }
  const pushOn = () => pushSupported() && Notification.permission === 'granted' && localStorage.getItem('ck-push') === '1';

  function onChange(p) {
    if (p.table === 'messages') {
      const m = p.new;
      if (p.eventType !== 'INSERT' || !m) return;
      const open = S.tab === 'chat' && S.chat && m.child_id === S.chatChild;
      if (open) { S.chat.add(m); if (m.sender === 'child') S.chat.markRead(); return; }
      if (m.sender === 'child') {
        S.unread[m.child_id] = (S.unread[m.child_id] || 0) + 1;
        const c = S.children.find((x) => x.id === m.child_id);
        notify('رسالة من ' + (c?.name || 'الطفل'), m.kind === 'audio' ? 'رسالة صوتية 🎤' : m.body);
        drawChrome();
      }
      return;
    }
    if (p.table === 'submissions' && p.eventType === 'INSERT' && p.new.status === 'pending') {
      const c = S.children.find((x) => x.id === p.new.child_id);
      notify((c?.name || 'الطفل') + ' أنجز مهمة', 'بانتظار مراجعتك');
    }
    reloadSoon();
  }

  function setChild(id) {
    S.cur = id; localStorage.setItem('ck-cur', id);
    S.chat = null; reload();
  }

  function drawChrome() {
    chipsEl.replaceChildren(
      ...S.children.map((c) => h('button', { class: 'chip' + (c.id === S.cur ? ' on' : ''), onclick: () => setChild(c.id) },
        c.name, S.unread[c.id] ? ` (${S.unread[c.id]})` : '')),
      h('button', { class: 'chip', onclick: addChild }, '＋ طفل'));
    const pending = S.d.subs.filter((s) => s.status === 'pending').length;
    const unreadCur = S.unread[S.cur] || 0;
    navEl.replaceChildren(...TABS.map(([id, ic, name]) => h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; render(); } },
      h('span', { class: 'ic' }, ic), name,
      id === 'home' && pending ? h('span', { class: 'badge' }, pending) : null,
      id === 'chat' && unreadCur ? h('span', { class: 'badge' }, unreadCur) : null)));
  }

  function render() {
    drawChrome();
    const a = document.activeElement;
    if (a && mainEl.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox' && S.tab !== 'chat') return;
    if (S.tab === 'chat') return viewChat();
    const top = mainEl.scrollTop;
    mainEl.style.padding = '';
    const c = cur();
    if (!c && S.tab !== 'settings' && S.tab !== 'templates') {
      mainEl.replaceChildren(card('مرحبًا 👋', h('p', {}, 'ابدأ بإضافة طفلك الأول، ثم اربط جهازه برمز الربط.'),
        h('button', { class: 'btn big', onclick: addChild }, '＋ إضافة طفل')));
      return;
    }
    const view = { home: viewHome, schedule: viewSchedule, apps: viewApps, tasks: viewTasks, breaks: viewBreaks, templates: viewTemplates, settings: viewSettings }[S.tab];
    mainEl.replaceChildren(...view(c).filter(Boolean));
    mainEl.scrollTop = top;
  }

  // ================= الرئيسية =================
  function stateLine(c) {
    const st = CK.computeState({ child: c, schedules: mine(S.d.schedules, c), tasks: mine(S.d.tasks, c), subs: mine(S.d.subs, c), grants: mine(S.d.grants, c) });
    let text, cls = 'bad';
    if (st.unlocked) {
      cls = 'ok';
      text = `مفتوح حتى ${clock(st.until)} · ` + { parent: 'بإذن مباشر', task: 'وقت مكتسب بمهمة', main: 'ساعة المهام الرئيسية' }[st.why];
    } else if (st.reason === 'pause') text = `متوقف · بقي له ${Math.ceil(st.left / 60000)} دقيقة محفوظة` + (st.canResume ? '' : ' تُستأنف في الوقت المسموح');
    else if (st.reason === 'window') text = `مقفل · انتهى الوقت المسموح وبقي له ${Math.ceil(st.left / 60000)} دقيقة محفوظة`;
    else if (st.reason === 'ready') text = 'مقفل · لديه رصيد لم يبدأه' + (st.inWindow ? '' : st.nextWindow ? ` (يبدؤه بعد ${clock(st.nextWindow.s)})` : ' (خارج الوقت المسموح)');
    else if (st.reason === 'cap') text = 'مقفل · بلغ الحد اليومي للاستخدام';
    else if (st.reason === 'force') text = 'مقفل يدويًا من الوالدين';
    else if (st.reason === 'main') text = 'مقفل · بانتظار إنجاز المهام الرئيسية';
    else text = 'مقفل · لا رصيد وقت حاليًا';
    return { st, text, cls };
  }

  // استخدام اليوم مقابل الحد اليومي، وتنبيه أحمر عند بلوغه
  const hmin = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  function usageBox(c) {
    if (!c.paired_at) return null;
    const used = Math.floor(CK.usedToday({ child: c }) / 60000), cap = c.max_daily_min;
    if (!cap) return h('div', { class: 'small muted' }, `الاستخدام اليوم: ${hmin(used)} (بلا حد يومي)`);
    const pct = Math.min(100, Math.round((used / cap) * 100)), over = used >= cap;
    return h('div', { class: over ? 'card bad' : 'col', style: 'gap:6px' },
      over ? h('b', {}, `🔴 بلغ ${c.name} الحد اليومي (${hmin(cap)} ساعة)`) : null,
      h('div', { class: 'row between small' }, h('span', {}, 'الاستخدام اليوم'), h('b', {}, `${hmin(used)} من ${hmin(cap)}`)),
      h('div', { style: 'height:8px;border-radius:4px;background:rgba(0,0,0,.1);overflow:hidden' },
        h('div', { style: `height:100%;width:${pct}%;background:${over || pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#0f766e'}` })),
      over ? h('div', { class: 'small' }, 'أُقفل جهازه حتى الغد. السماح المباشر منك يتجاوز هذا الحد.') : null);
  }
  function capAlert(c) {
    if (!c.max_daily_min || c.usage_alert_day !== CK.dayStr()) return;
    const k = 'ck-cap-' + c.id;
    if (localStorage.getItem(k) === c.usage_alert_day) return;
    localStorage.setItem(k, c.usage_alert_day);
    notify(`🔴 ${c.name} بلغ الحد اليومي`, `استعمل الجهاز ${hmin(c.max_daily_min)} ساعة اليوم، وأُقفل حتى الغد.`);
  }

  async function allow(c, minutes) {
    await run(async () => {
      await q(sb.rpc('allow_now', { p_child: c.id, p_minutes: minutes, p_title: 'إذن من ' + S.me.name }));
      await reload();
    }, `تم السماح لـ${c.name} ${minutes} دقيقة`);
  }

  async function review(s, approve) {
    await run(async () => {
      const path = await q(sb.rpc('review_submission', { p_id: s.id, p_approve: approve }));
      if (path) CK.removeAudio(path);
      await reload();
    }, approve ? 'تمت الإجازة ✅' : 'تم الرفض، وسيُطلب منه الإعادة');
  }

  // تصفير مهام اليوم: تعود كل مهامه (الرئيسية والإضافية والسريعة) كأنها لم تُنجز اليوم
  function resetTasks(c) {
    const withGrants = h('input', { type: 'checkbox', checked: true, style: 'width:20px;height:20px;accent-color:var(--pri)' });
    const withUsage = h('input', { type: 'checkbox', checked: true, style: 'width:20px;height:20px;accent-color:var(--pri)' });
    modal('🔄 تصفير مهام اليوم ووقته', h('div', { class: 'col' },
      h('p', {}, `ستعود كل مهام ${c.name} لهذا اليوم كأنها لم تُنجز: المهام الرئيسية والإضافية والسريعة، وتُحذف التسجيلات التي لم تراجعها، وتُلغى «ساعته اليومية» إن لم يبدأها.`),
      h('p', { class: 'small muted' }, 'لا يتأثر تقدّم الحفظ، ولا الوقت الذي بدأه ويجري الآن.'),
      h('label', { class: 'row' }, withGrants, h('span', {}, 'حذف الأوقات التي كسبها اليوم ولم يبدأها بعد')),
      h('label', { class: 'row' }, withUsage, h('span', {}, `تصفير وقت استخدامه اليوم (يعود إلى 0:00 من ${c.max_daily_min ? hmin(c.max_daily_min) : 'الحد'})`))),
    { okText: 'تصفير', onOk: () => run(async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const paths = await q(sb.rpc('reset_tasks', { p_child: c.id, p_day: CK.dayStr(), p_since: since.toISOString(), p_grants: withGrants.checked, p_usage: withUsage.checked }));
      (paths || []).forEach((p) => CK.removeAudio(p));
      await reload();
    }, withUsage.checked ? 'صُفّرت مهام اليوم ووقته' : 'صُفّرت مهام اليوم') });
  }

  // عقوبة: تُنقص من الوقت الذي كسبه الطفل (الجاهز ثم الجاري)، وما لا يكفيه رصيده يُخصم مما يكسبه لاحقًا اليوم
  function penalize(c, minutes) {
    const reason = h('input', { type: 'text', maxlength: 200, placeholder: 'مثال: لم يرتب غرفته' });
    modal(`⛔ عقوبة: إنقاص ${minutes === 15 ? 'ربع ساعة' : minutes === 30 ? 'نصف ساعة' : minutes + ' دقيقة'}`, h('div', { class: 'col' },
      h('p', {}, `يُنقص ${minutes} دقيقة من الوقت الذي كسبه ${c.name}: أولًا من الأوقات التي لم يبدأها، ثم من وقته الجاري.`),
      h('p', { class: 'small muted' }, 'إن لم يكفِ رصيده يُخصم الباقي مما يكسبه لاحقًا اليوم. لا يُمس إذنك المباشر.'),
      field('السبب (يظهر للطفل)', reason)),
    { okText: 'تطبيق العقوبة', onOk: () => run(async () => {
      const end = new Date(); end.setHours(24, 0, 0, 0);
      const r = await q(sb.rpc('penalize', { p_child: c.id, p_minutes: minutes, p_reason: reason.value, p_day: CK.dayStr(), p_until: end.toISOString() }));
      await reload();
      const got = Math.ceil(r.applied_sec / 60);
      toast(got >= minutes ? `نقص من وقت ${c.name} ${minutes} دقيقة` : `خُصم ${got} دقيقة الآن، والباقي (${minutes - got}) يُخصم مما يكسبه اليوم`);
    }) });
  }
  function penaltiesCard(c) {
    const list = mine(S.d.penalties || [], c).filter((p) => p.day === CK.dayStr());
    if (!list.length) return null;
    const total = list.reduce((a, p) => a + p.minutes, 0);
    return card(`عقوبات اليوم (−${total} دقيقة)`, list.map((p) => {
      const got = Math.ceil(p.applied_sec / 60), owed = p.minutes - got;
      return h('div', { class: 'item' },
        h('span', { class: 'avatar' }, '⛔'),
        h('div', { class: 'grow' }, h('b', {}, `−${p.minutes} دقيقة`), p.reason ? ' · ' + p.reason : '',
          h('div', { class: 'small muted' }, `${p.by_name ? p.by_name + ' · ' : ''}${clock(p.created_at)} · ` +
            (owed > 0 ? `خُصم ${got}، ويُخصم ${owed} مما يكسبه اليوم` : 'خُصمت كاملة'))),
        h('button', { class: 'iconbtn', title: 'إلغاء العقوبة', onclick: async () => {
          if (await confirmBox(got ? `إلغاء العقوبة؟ يُعاد له ${got} دقيقة وقتًا جاهزًا.` : 'إلغاء العقوبة؟', 'إلغاء العقوبة'))
            run(async () => { await q(sb.rpc('cancel_penalty', { p_id: p.id })); await reload(); }, 'أُلغيت العقوبة');
        } }, '↩'));
    }));
  }

  function viewHome(c) {
    const { st, text, cls } = stateLine(c);
    const out = [];
    const activeParent = mine(S.d.grants, c).filter((g) => g.status === 'active' && g.source === 'parent' && new Date(g.ends_at) > new Date());
    out.push(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'avatar' }, '🧒'),
        h('div', { class: 'grow' }, h('h2', {}, c.name), h('div', { class: 'small muted' }, c.paired_at ? CK.ago(c.last_seen) : 'الجهاز غير مرتبط بعد — انظر الإعدادات'))),
      h('div', {}, h('span', { class: 'tag ' + cls }, text)),
      usageBox(c), planLine(c),
      c.paired_at && c.device_info?.native && !c.device_info.owner
        ? h('div', { class: 'card bad' }, h('p', { class: 'small' }, '⚠️ جهاز الطفل غير مؤمَّن: لم يُفعَّل وضع «مالك الجهاز»، فيستطيع الطفل الخروج من التطبيق. جهّزه برمز QR من الإعدادات (تجهيز جهاز جديد).')) : null,
      c.paired_at && c.device_info?.preview
        ? h('div', { class: 'small muted' }, 'الجهاز المرتبط حاليًا متصفح للمعاينة وليس جهاز أندرويد.') : null,
      h('div', { class: 'row wrap' },
        ...[15, 30, 60].map((m) => h('button', { class: 'btn', onclick: () => allow(c, m) }, `سماح ${m} د`)),
        h('button', { class: 'btn ghost', onclick: () => {
          const n = h('input', { type: 'number', min: 1, max: 600, value: 45 });
          modal('سماح بمدة محددة', field('عدد الدقائق', n), { okText: 'سماح', onOk: () => allow(c, Math.max(1, Math.min(600, +n.value || 0))) });
        } }, 'مدة أخرى')),
      h('div', { class: 'row wrap' },
        c.force_lock
          ? h('button', { class: 'btn ok', onclick: () => run(async () => { await q(sb.from('children').update({ force_lock: false }).eq('id', c.id)); await reload(); }, 'أُلغي القفل اليدوي') }, '🔓 إلغاء القفل اليدوي')
          : h('button', { class: 'btn bad', onclick: () => run(async () => { await q(sb.from('children').update({ force_lock: true }).eq('id', c.id)); await reload(); }, 'تم قفل الجهاز') }, '🔒 قفل الآن'),
        h('button', { class: 'btn ghost', onclick: () => resetTasks(c) }, '🔄 تصفير المهام والوقت'),
        activeParent.length ? h('button', { class: 'btn plain', onclick: () => run(async () => {
          await q(sb.from('grants').update({ status: 'cancelled' }).in('id', activeParent.map((g) => g.id))); await reload();
        }, 'أُلغي الإذن') }, 'إلغاء الإذن المباشر') : null),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn bad', onclick: () => penalize(c, 15) }, '⛔ عقوبة ربع ساعة'),
        h('button', { class: 'btn bad', onclick: () => penalize(c, 30) }, '⛔ عقوبة نصف ساعة'))));
    out.push(penaltiesCard(c));

    const pending = S.d.subs.filter((s) => s.status === 'pending');
    out.push(card(`بانتظار مراجعتك (${pending.length})`,
      pending.length ? pending.map((s) => {
        const t = S.d.tasks.find((x) => x.id === s.task_id), ch = S.children.find((x) => x.id === s.child_id);
        return h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch' },
          h('div', { class: 'row' }, h('span', { class: 'avatar' }, KINDS[s.kind]?.ic || '✅'),
            h('div', { class: 'grow' }, h('b', {}, t?.title || 'مهمة'),
              h('div', { class: 'small muted' }, `${ch?.name || ''} · ${KINDS[s.kind]?.name || ''} · ${clock(s.created_at)}`))),
          s.portion && s.kind === 'draw' ? h('div', { class: 'small' }, 'المطلوب: ' + s.portion) : s.portion ? h('details', {}, h('summary', { class: 'small' }, 'عرض المقطع المطلوب'), h('div', { class: 'portion', style: 'font-size:1rem' }, s.portion)) : null,
          s.audio_path ? CK.audioPlayer(s.audio_path) : null,
          h('div', { class: 'row' },
            h('button', { class: 'btn ok grow', onclick: () => review(s, true) }, s.kind === 'main' ? '✓ تأكيد' : `✓ إجازة (${t?.reward_min || 30} د)`),
            h('button', { class: 'btn plain', onclick: () => review(s, false) }, '✗ إعادة')));
      }) : h('p', { class: 'muted' }, 'لا توجد مهام بانتظار المراجعة.')));

    if (st.mainList.length) out.push(card('المهام الرئيسية اليوم', st.mainList.map((m) => h('div', { class: 'item' },
      h('span', { class: 'grow' }, m.task.title),
      h('span', { class: 'tag ' + (m.sub?.status === 'approved' ? 'ok' : m.sub ? 'warn' : '') },
        m.sub?.status === 'approved' ? 'أُنجزت' : m.sub ? 'بانتظار تأكيدك' : 'لم تُنجز')))));

    const ready = mine(S.d.grants, c).filter((g) => g.status === 'ready');
    if (ready.length) out.push(card('أوقات مكتسبة لم يبدأها بعد', ready.map((g) => h('div', { class: 'item' },
      h('span', { class: 'grow' }, g.title || 'وقت إضافي'), h('span', { class: 'tag pri' }, g.minutes + ' دقيقة'),
      h('button', { class: 'iconbtn', title: 'حذف', onclick: () => run(async () => { await q(sb.from('grants').delete().eq('id', g.id)); await reload(); }) }, '🗑')))));
    return out;
  }

  // ================= الأوقات الرسمية =================
  function viewSchedule(c) {
    const rows = mine(S.d.schedules, c);
    const add = () => {
      const days = WEEKDAYS.map((n, i) => h('label', {}, h('input', { type: 'checkbox', value: i, checked: true }), n));
      const from = h('input', { type: 'time', value: '16:00' }), to = h('input', { type: 'time', value: '18:00' });
      modal('إضافة وقت مسموح', [h('div', { class: 'days' }, days),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, field('من', from)), h('div', { class: 'grow' }, field('إلى', to)))], {
        onOk: async () => {
          const sel = days.map((l) => l.firstChild).filter((x) => x.checked).map((x) => +x.value);
          if (!sel.length) throw new Error('اختر يومًا واحدًا على الأقل');
          if (!from.value || !to.value || to.value <= from.value) throw new Error('وقت النهاية يجب أن يكون بعد البداية');
          await q(sb.from('schedules').insert(sel.map((weekday) => ({ family_id: c.family_id, child_id: c.id, weekday, start_time: from.value, end_time: to.value }))));
          await reload();
        },
      });
    };
    return [
      h('div', { class: 'card soft' }, h('p', {}, `الأوقات التي يُسمح فيها لـ${c.name} باستعمال رصيده (ساعته اليومية ووقته المكتسب). الجدول لا يمنح وقتًا بنفسه، وإذا انتهى الوقت المسموح ورصيده يجري يتوقف ويُحفظ الباقي. بلا أي وقت هنا يستعمل رصيده متى شاء.`),
        h('button', { class: 'btn', onclick: add }, '＋ إضافة وقت')),
      ...WEEKDAYS.map((name, i) => {
        const day = rows.filter((r) => r.weekday === i);
        return h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', {}, name), day.length ? null : h('span', { class: 'tag' }, 'لا يوجد وقت')),
          day.map((r) => h('div', { class: 'item' }, h('span', { class: 'grow' }, `${hm(r.start_time)} ← ${hm(r.end_time)}`),
            h('button', { class: 'iconbtn', title: 'حذف', onclick: () => run(async () => { await q(sb.from('schedules').delete().eq('id', r.id)); await reload(); }) }, '🗑'))));
      }),
    ];
  }

  // ================= التطبيقات ويوتيوب =================
  function viewApps(c) {
    const list = h('div', {});
    const drawList = () => {
      const f = S.appFilter.trim().toLowerCase();
      const apps = S.d.apps.filter((a) => !f || a.label.toLowerCase().includes(f) || a.package.includes(f))
        .sort((a, b) => (b.allowed - a.allowed) || a.label.localeCompare(b.label, 'ar'));
      list.replaceChildren(...apps.map((a) => h('label', { class: 'item' },
        a.icon ? h('img', { src: a.icon, width: 40, height: 40, style: 'border-radius:10px' }) : h('span', { class: 'avatar' }, '📦'),
        h('div', { class: 'grow' }, h('div', {}, a.label || a.package), h('div', { class: 'small muted', dir: 'ltr', style: 'text-align:right' }, a.package)),
        h('input', { type: 'checkbox', checked: a.allowed, style: 'width:24px;height:24px;accent-color:var(--pri)', onchange: (ev) => {
          a.allowed = ev.target.checked;
          run(() => q(sb.from('apps').update({ allowed: a.allowed }).eq('child_id', c.id).eq('package', a.package)));
        } }))));
    };
    drawList();
    const search = h('input', { type: 'text', placeholder: 'بحث عن تطبيق…', value: S.appFilter, oninput: (ev) => { S.appFilter = ev.target.value; drawList(); } });
    const allowed = S.d.apps.filter((a) => a.allowed).length;

    const chInput = h('input', { type: 'text', placeholder: 'رابط القناة أو ‎@المعرّف', dir: 'ltr' });
    const addBtn = h('button', { class: 'btn', onclick: async () => {
      if (!chInput.value.trim()) return;
      addBtn.disabled = true;
      await run(async () => {
        const r = await CK.fn('yt', { action: 'resolve', input: chInput.value });
        await q(sb.from('yt_channels').upsert({ family_id: c.family_id, child_id: c.id, channel_id: r.channel_id, title: r.title, thumb: r.thumb }, { onConflict: 'child_id,channel_id' }));
        chInput.value = ''; chInput.blur(); await reload();
      }, 'أضيفت القناة');
      addBtn.disabled = false;
    } }, 'إضافة');
    const chans = mine(S.d.yt, c);

    // يطلب من جهاز الطفل إعادة قراءة تطبيقاته (لما ثُبّت بعد رقيب)؛ تصل القائمة الجديدة لحظيًا
    const refreshBtn = h('button', { class: 'btn', onclick: async () => {
      refreshBtn.disabled = true;
      await run(() => q(sb.from('children').update({ apps_refresh_at: new Date().toISOString() }).eq('id', c.id)),
        'طُلب التحديث من جهاز الطفل — تظهر التطبيقات الجديدة خلال ثوانٍ إن كان متصلًا');
      setTimeout(() => { refreshBtn.disabled = false; }, 5000);
    } }, '🔄 تحديث قائمة التطبيقات');

    return [
      card(`التطبيقات المسموحة (${allowed} من ${S.d.apps.length})`,
        h('div', { class: 'row' }, h('p', { class: 'small muted grow' }, 'ثبّت تطبيقًا جديدًا على جهاز الطفل ولم يظهر؟ اضغط التحديث.'), refreshBtn),
        S.d.apps.length ? [search, list] : h('p', { class: 'muted' }, 'ستظهر هنا تطبيقات جهاز الطفل بعد ربطه وتشغيل التطبيق عليه.')),
      card('قنوات يوتيوب المسموحة',
        h('p', { class: 'small muted' }, 'تطبيق يوتيوب الأصلي يبقى محجوبًا؛ الطفل يشاهد هذه القنوات فقط من داخل تطبيقه.'),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, chInput), addBtn),
        chans.map((y) => h('div', { class: 'item' },
          y.thumb ? h('img', { src: y.thumb, width: 40, height: 40, style: 'border-radius:50%' }) : h('span', { class: 'avatar' }, '▶️'),
          h('span', { class: 'grow' }, y.title),
          h('button', { class: 'iconbtn', title: 'حذف', onclick: () => run(async () => { await q(sb.from('yt_channels').delete().eq('id', y.id)); await reload(); }) }, '🗑')))),
    ];
  }

  // ================= المهام =================
  const TASK_TABS = [['main', 'الرئيسية', ['main']], ['extra', 'نصف ساعة', ['quran', 'matn', 'chore', 'draw']],
    ['quick', 'سريعة (ربع ساعة)', ['reading', 'puzzle']]];
  const TASK_HELP = {
    main: 'مهام يومية إذا أنجزها الطفل كسب ساعته اليومية (60 دقيقة يبدؤها متى شاء في الوقت المسموح)، ولا يُستعمل أي وقت مكتسب قبلها. يمكنك إرفاق مقطع يوتيوب وأسئلة: يشاهده كاملًا ثم يُختبر.',
    extra: 'يسجّل الطفل صوته بالحفظ، أو يكتب الحروف ويرسم بإصبعه فيصلك الرسم صورةً، أو يبلّغ بإنجاز المهمة المنزلية، وبعد إجازتك يحصل على الوقت كاملًا مع فواصل قصيرة.',
    quick: 'تُصحَّح تلقائيًا: يقرأ نصًا أو يشاهد مقطع يوتيوب ثم يُختبر، أو يحل لعبة ذهنية، فيُفتح له الوقت مباشرة.',
  };

  // نماذج التحرير مشتركة مع القوالب (shared/tpl.js)
  function taskDialog(c, kind, t) {
    const isNew = !t;
    const form = TPL.taskForm(kind, t, { allowReset: !isNew });
    modal((isNew ? 'إضافة: ' : 'تعديل: ') + KINDS[kind].name, form.body, {
      onOk: async () => {
        const row = form.get();
        if (isNew) { delete row.progress; await q(sb.from('tasks').insert({ ...row, family_id: c.family_id, child_id: c.id })); }
        else await q(sb.from('tasks').update(row).eq('id', t.id));
        await reload();
      },
    });
  }

  function breakDialog(b, defKind = 'fact') {
    const isNew = !b;
    const form = TPL.breakForm(b || { kind: defKind });
    modal(isNew ? 'إضافة' : 'تعديل', form.body, {
      onOk: async () => {
        const row = form.get();
        if (isNew) await q(sb.from('break_items').insert({ ...row, family_id: S.me.family_id }));
        else await q(sb.from('break_items').update(row).eq('id', b.id));
        await reload();
      },
    });
  }

  // ================= القوالب (الخطط الجاهزة) =================
  function planInfo(c) {
    if (!c.plan) return null;
    const start = new Date(c.plan.started + 'T00:00:00'), months = c.plan.months || 1;
    const passed = Math.max(0, (Date.now() - start) / (30.44 * 864e5));
    const m = Math.min(months, Math.floor(passed) + 1), pct = Math.min(100, Math.round((passed / months) * 100));
    return { title: c.plan.title, m, months, pct, done: passed >= months };
  }
  function planLine(c) {
    const p = planInfo(c);
    return p ? h('div', { class: 'small muted' }, `📚 ${p.title} — ${p.done ? 'اكتملت مدتها' : `الشهر ${p.m} من ${p.months}`}`) : null;
  }

  function applyDialog(t) {
    const kids = S.children;
    if (!kids.length) return toast('أضف طفلًا أولًا');
    const who = h('select', {}, kids.map((k) => h('option', { value: k.id, selected: k.id === S.cur }, k.name)));
    const uid = Math.random().toString(36).slice(2);
    const add = h('input', { type: 'radio', name: 'm' + uid, checked: true }), rep = h('input', { type: 'radio', name: 'm' + uid });
    modal('تطبيق: ' + t.title, [
      h('p', { class: 'small' }, TPL.summary(t)),
      field('الطفل', who),
      h('label', { class: 'row' }, add, h('span', {}, 'إضافة إلى مهامه الحالية')),
      h('label', { class: 'row' }, rep, h('span', {}, 'استبدال مهامه الحالية (تُوقف القديمة ولا تُحذف، ويمكن إعادة تفعيلها)')),
      h('p', { class: 'small muted' }, 'تُضاف الفوائد إلى مكتبة الفوائد إن لم تكن موجودة. يمكنك تعديل أي مهمة بعد التطبيق من تبويب المهام.'),
    ], { okText: 'تطبيق', onOk: async () => {
      const child = kids.find((k) => k.id === who.value);
      await TPL.apply(t, child, { replace: rep.checked });
      S.cur = child.id; localStorage.setItem('ck-cur', child.id);
      await reload(); toast(`طُبّقت الخطة على ${child.name} ✅`);
    } });
  }
  const viewTpl = (t) => modal(t.title, TPL.details(t), { okText: 'تطبيق على طفل', onOk: () => { setTimeout(() => applyDialog(t)); } });
  const saveFamilyTpl = (t) => async (row) => {
    if (t && t.id && t.family_id) await q(sb.from('templates').update({ ...row, updated_at: new Date().toISOString() }).eq('id', t.id));
    else await q(sb.from('templates').insert({ ...row, family_id: S.me.family_id, source_id: t?.id || null }));
    await reload(); toast('حُفظ القالب');
  };

  function randomPlan() {
    const age = h('input', { type: 'number', min: 3, max: 16, value: 8 });
    modal('🎲 خطة عشوائية', [h('p', {}, 'يختار النظام مهامًا متنوعة من المكتبة تناسب عمر طفلك.'), field('عمر الطفل', age)], { okText: 'توليد', onOk: () => {
      const a = Math.max(3, Math.min(16, +age.value || 8));
      const pool = S.d.templates;
      if (!pool.length) throw new Error('المكتبة فارغة حاليًا');
      const show = () => {
        const t = TPL.random(pool, a);
        modal(t.title, [...TPL.details(t), h('button', { class: 'btn ghost', type: 'button', onclick: (e) => { e.target.closest('dialog').close(); setTimeout(show); } }, '🔄 توليد خطة أخرى')],
          { okText: 'تطبيق على طفل', onOk: () => { setTimeout(() => applyDialog(t)); } });
      };
      setTimeout(show);
    } });
  }

  function tplCard(t, own) {
    return h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, t.title), own ? h('span', { class: 'tag' }, 'خاص بأسرتك') : null),
      h('div', { class: 'row wrap' }, h('span', { class: 'tag' }, '⏳ ' + TPL.durText(t.duration_months)), h('span', { class: 'tag' }, '👦 ' + TPL.ageText(t))),
      t.description ? h('p', { class: 'small', style: 'margin:0' }, t.description.length > 180 ? t.description.slice(0, 180) + '…' : t.description) : null,
      h('div', { class: 'small muted' }, TPL.summary(t)),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn sm', onclick: () => applyDialog(t) }, 'تطبيق على طفل'),
        h('button', { class: 'btn ghost sm', onclick: () => viewTpl(t) }, 'التفاصيل'),
        own ? h('button', { class: 'btn ghost sm', onclick: () => TPL.editor(t, { onSave: saveFamilyTpl(t) }) }, '✏️ تعديل')
          : h('button', { class: 'btn ghost sm', onclick: () => TPL.editor({ ...t, id: undefined, title: t.title + ' (نسختي)' }, { heading: 'نسخة خاصة بأسرتك', onSave: saveFamilyTpl(t) }) }, '📋 نسخ وتعديل'),
        own ? h('button', { class: 'btn plain sm', onclick: async () => { if (await confirmBox(`حذف القالب «${t.title}»؟ لا يؤثر على المهام المطبّقة.`, 'حذف')) run(async () => { await q(sb.from('templates').delete().eq('id', t.id)); await reload(); }, 'حُذف القالب'); } }, '🗑') : null));
  }

  function viewTemplates(c) {
    const p = c ? planInfo(c) : null;
    const global = S.d.templates.filter((t) => !t.family_id), own = S.d.templates.filter((t) => t.family_id);
    return [
      c ? card(`📚 خطة ${c.name}`, p
        ? [h('div', {}, h('b', {}, p.title), ' — ', p.done ? 'اكتملت مدتها 🎉' : `الشهر ${p.m} من ${p.months}`),
          h('div', { style: 'height:8px;border-radius:4px;background:rgba(0,0,0,.1);overflow:hidden' }, h('div', { style: `height:100%;width:${p.pct}%;background:var(--pri)` })),
          h('div', { class: 'small muted' }, 'بدأت ' + c.plan.started)]
        : h('p', { class: 'muted small' }, 'لم تُطبَّق خطة بعد. اختر قالبًا من المكتبة، أو دع النظام يختار خطة عشوائية.')) : null,
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: randomPlan }, '🎲 خطة عشوائية'),
        h('button', { class: 'btn ghost', onclick: () => TPL.editor(null, { onSave: saveFamilyTpl(null) }) }, '＋ قالب جديد لأسرتك'),
        h('button', { class: 'btn ghost', onclick: () => TPL.importDialog({ onSave: saveFamilyTpl(null) }) }, '📥 استيراد قالب')),
      h('h2', {}, `مكتبة القوالب (${global.length})`),
      ...(global.length ? global.map((t) => tplCard(t, false)) : [h('p', { class: 'muted' }, 'لا توجد قوالب عامة بعد.')]),
      own.length ? h('h2', {}, `قوالب أسرتك (${own.length})`) : null,
      ...own.map((t) => tplCard(t, true)),
    ];
  }

  // ================= الفوائد والفواصل =================
  const BK = { question: ['❓', 'سؤال', 'الأسئلة'], fact: ['💡', 'فائدة', 'الفوائد'], story: ['📗', 'قصة', 'القصص'] };
  function viewBreaks(c) {
    const save = (patch) => run(async () => { await q(sb.from('children').update(patch).eq('id', c.id)); await reload(); }, 'تم الحفظ');
    const num = (label, key, min, max) => h('div', { class: 'row between' }, h('span', { class: 'grow' }, label),
      h('input', { type: 'number', min, max, value: c[key], style: 'width:90px', onchange: (e) => save({ [key]: Math.max(min, Math.min(max, +e.target.value || min)) }) }));
    const f = S.breakFilter || 'all';
    const items = S.d.breaks.filter((b) => f === 'all' || b.kind === f);
    const count = (k) => S.d.breaks.filter((b) => b.kind === k).length;
    return [
      card('⏸ الفاصل عند ' + c.name,
        h('p', { class: 'small muted' }, 'بعد كل مدة متواصلة من فتح الشاشة تسودّ الشاشة لراحة العينين، وفور انتهائها تظهر للطفل فائدة أو سؤال أو قصة مما تكتبه هنا.'),
        h('div', { class: 'row between' }, h('span', { class: 'grow' }, 'نوع الفاصل'),
          h('select', { onchange: (e) => save({ break_mode: e.target.value }) },
            [['mix', 'راحة للعينين ثم فائدة'], ['eyes', 'راحة للعينين فقط'], ['content', 'فائدة أو سؤال أو قصة فقط'], ['off', 'بلا فواصل']]
              .map(([v, t]) => h('option', { value: v, selected: c.break_mode === v }, t)))),
        num('بعد كل (دقائق متواصلة)', 'break_interval_min', 5, 120),
        num('مدة راحة العينين (ثوانٍ)', 'break_max_sec', 30, 600),
        h('label', { class: 'switch' }, h('div', {}, 'الفواصل أثناء السماح المباشر مني', h('div', { class: 'small muted' }, 'تعمل دائمًا في الساعة اليومية والوقت المكتسب.')),
          h('input', { type: 'checkbox', checked: c.breaks_on_parent, onchange: (e) => save({ breaks_on_parent: e.target.checked }) }))),
      card(`📚 مكتبة الفوائد (${S.d.breaks.length})`,
        h('p', { class: 'small muted' }, 'مشتركة بين كل أطفالك، وتظهر بترتيب عشوائي. أوقف أي عنصر بإزالة علامته دون حذفه.'),
        h('div', { class: 'row wrap' }, Object.entries(BK).map(([k, [ic, name]]) => h('button', { class: 'btn sm', onclick: () => breakDialog(null, k) }, `＋ ${ic} ${name}`))),
        h('div', { class: 'chips' }, [['all', `الكل (${S.d.breaks.length})`], ...Object.entries(BK).map(([k, [, , pl]]) => [k, `${pl} (${count(k)})`])]
          .map(([k, t]) => h('button', { class: 'chip' + (f === k ? ' on' : ''), onclick: () => { S.breakFilter = k; render(); } }, t))),
        items.length ? items.map((b) => h('div', { class: 'item' }, h('span', { class: 'avatar' }, BK[b.kind][0]),
          h('div', { class: 'grow' }, h('b', {}, b.title || BK[b.kind][1]), h('div', { class: 'small muted', style: 'max-height:3.2em;overflow:hidden' }, b.body)),
          h('input', { type: 'checkbox', checked: b.active, title: 'مفعّلة', style: 'width:22px;height:22px;accent-color:var(--pri)',
            onchange: (e) => run(() => q(sb.from('break_items').update({ active: e.target.checked }).eq('id', b.id))) }),
          h('button', { class: 'iconbtn', onclick: () => breakDialog(b) }, '✏️'),
          h('button', { class: 'iconbtn', onclick: async () => { if (await confirmBox('حذف هذا العنصر نهائيًا؟', 'حذف')) run(async () => { await q(sb.from('break_items').delete().eq('id', b.id)); await reload(); }); } }, '🗑')))
          : h('p', { class: 'muted small' }, 'لا يوجد شيء هنا بعد.'),
        S.d.breaks.length ? null : h('button', { class: 'btn ghost', onclick: () => run(async () => {
          await q(sb.from('break_items').insert(SAMPLES.breaks.map((b) => ({ options: [], answer: null, ...b, family_id: S.me.family_id })))); await reload();
        }, 'أضيفت النماذج') }, 'إضافة نماذج جاهزة')),
    ];
  }

  function viewTasks(c) {
    const [, , kinds] = TASK_TABS.find((x) => x[0] === S.taskTab);
    const out = [h('div', { class: 'chips' }, TASK_TABS.map(([id, name]) => h('button', { class: 'chip' + (S.taskTab === id ? ' on' : ''), onclick: () => { S.taskTab = id; render(); } }, name))),
      h('div', { class: 'card soft' }, h('p', { class: 'small' }, TASK_HELP[S.taskTab]))];
    const del = (table, id) => async () => { if (await confirmBox('حذف هذا العنصر نهائيًا؟', 'حذف')) run(async () => { await q(sb.from(table).delete().eq('id', id)); await reload(); }); };
    const toggle = (table, r) => h('input', { type: 'checkbox', checked: r.active, title: 'مفعّلة', style: 'width:22px;height:22px;accent-color:var(--pri)',
      onchange: (e) => run(() => q(sb.from(table).update({ active: e.target.checked }).eq('id', r.id))) });

    for (const kind of kinds) {
      const rows = mine(S.d.tasks, c).filter((t) => t.kind === kind);
      out.push(h('div', { class: 'card' },
        h('div', { class: 'row between' }, h('h2', {}, KINDS[kind].ic + ' ' + KINDS[kind].name), h('button', { class: 'btn sm', onclick: () => taskDialog(c, kind) }, '＋ إضافة')),
        rows.length ? rows.map((t) => {
          let sub = '';
          if (['quran', 'matn'].includes(kind)) { const p = CK.nextPortion(t); sub = p.done ? 'أتمّ الحفظ 🎉' : `أنجز ${p.from} من ${p.units.length} · ${t.unit_size} لكل ${t.reward_min} دقيقة`; }
          else if (kind === 'reading') sub = (t.config?.yt ? '🎬 مقطع · ' : '') + `${t.questions.length} سؤال في البنك · ${t.reward_min} دقيقة`;
          else if (kind === 'main' && t.config?.yt) sub = `🎬 مقطع و${t.questions.length} سؤال`;
          else if (kind === 'puzzle') sub = ({ math: 'حساب ذهني', memory: 'لعبة الذاكرة', riddle: 'ألغاز' }[t.config.type] || '') + ` · ${t.reward_min} دقيقة`;
          else if (kind === 'chore') sub = `${t.reward_min} دقيقة`;
          else if (kind === 'draw') { const p = CK.nextPortion(t); sub = (t.config?.mode === 'free' ? 'رسم حر' : 'كتابة') + ' · ' + (p.done ? 'أتمّها 🎉' : `أنجز ${p.from} من ${p.units.length} · ${t.reward_min} دقيقة`); }
          return h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', {}, t.title), sub ? h('div', { class: 'small muted' }, sub) : null),
            toggle('tasks', t), h('button', { class: 'iconbtn', onclick: () => taskDialog(c, kind, t) }, '✏️'), h('button', { class: 'iconbtn', onclick: del('tasks', t.id) }, '🗑'));
        }) : h('p', { class: 'muted small' }, 'لا توجد مهام بعد.')));
    }
    return out;
  }

  // ================= المحادثة =================
  function viewChat() {
    const c = cur();
    if (!c) { S.tab = 'home'; return render(); }
    if (!S.chat || S.chatChild !== c.id) {
      S.chat = CK.Chat({ familyId: c.family_id, childId: c.id, sender: 'parent', senderName: S.me.name });
      S.chatChild = c.id;
    }
    mainEl.style.padding = '0';
    if (mainEl.firstChild !== S.chat.el) mainEl.replaceChildren(S.chat.el);
    S.chat.el.style.height = '100%';
    S.chat.focus();
    if (S.unread[c.id]) { S.unread[c.id] = 0; drawChrome(); }
    S.chat.markRead();
  }

  // ================= الأطفال والإعدادات =================
  function showPairCode(c, code) {
    return modal('ربط جهاز ' + c.name, [
      h('p', {}, 'ثبّت تطبيق الطفل على جهازه، ثم أدخل هذا الرمز عند أول تشغيل:'),
      h('div', { class: 'pin', style: 'font-size:2.4rem;padding:10px;background:var(--pri-soft);border-radius:14px' }, code),
      h('p', { class: 'small muted' }, 'الرمز صالح لمرة واحدة. عند ربط جهاز جديد يُفصل الجهاز القديم تلقائيًا.')]);
  }

  // ---------- تجهيز جهاز الطفل برمز QR ----------
  // بعد ضبط المصنع: اضغط 6 مرات على شاشة الترحيب، صوّر الرمز، فيُنزَّل التطبيق ويصبح «مالك الجهاز» ويُربط تلقائيًا.
  const APK_URL = 'https://github.com/STOOOOF1/raqeeb/releases/latest/download/raqeeb.apk';
  const APK_SIGNATURE = 'EOlSKjuqxEkjiP1pbyhu6CQsbFauUnSU3NscjneGeZk'; // بصمة شهادة التوقيع (انظر .github/workflows/android.yml)
  let qrLib = null;
  const loadQR = () => qrLib || (qrLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '../shared/vendor/qrcode.js'; s.onload = () => res(window.qrcode); s.onerror = () => { qrLib = null; rej(new Error('تعذر تحميل مولّد الرمز')); };
    document.head.append(s);
  }));
  function provisionJson(code, ssid, pass) {
    const P = 'android.app.extra.PROVISIONING_';
    const o = {
      [P + 'DEVICE_ADMIN_COMPONENT_NAME']: 'app.contkid.kid/.AdminReceiver',
      [P + 'DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION']: APK_URL,
      [P + 'DEVICE_ADMIN_SIGNATURE_CHECKSUM']: APK_SIGNATURE,
      [P + 'LEAVE_ALL_SYSTEM_APPS_ENABLED']: true,
      [P + 'SKIP_ENCRYPTION']: true,
      [P + 'ADMIN_EXTRAS_BUNDLE']: { pair_code: code },
    };
    if (ssid) {
      o[P + 'WIFI_SSID'] = ssid;
      if (pass) { o[P + 'WIFI_PASSWORD'] = pass; o[P + 'WIFI_SECURITY_TYPE'] = 'WPA'; } else o[P + 'WIFI_SECURITY_TYPE'] = 'NONE';
    }
    return JSON.stringify(o);
  }
  async function setupQR(c) {
    if (c.paired_at && !(await confirmBox(`جهاز ${c.name} مرتبط الآن. تجهيز جهاز جديد يفصل الجهاز الحالي عند استخدامه. متابعة؟`))) return;
    let code, lib;
    if (!(await run(async () => { [code, lib] = await Promise.all([q(sb.rpc('new_pair_code', { p_child: c.id })), loadQR()]); }))) return;
    reload();
    const ssid = h('input', { type: 'text', maxlength: 32, placeholder: 'اختياري', dir: 'auto', autocomplete: 'off' });
    const pass = h('input', { type: 'password', maxlength: 63, placeholder: 'اختياري', dir: 'ltr', autocomplete: 'off' });
    const box = h('div', { style: 'background:#fff;padding:10px;border-radius:14px;display:flex;justify-content:center' });
    const draw = () => {
      const qr = lib(0, 'L');
      qr.addData(provisionJson(code, ssid.value.trim(), pass.value));
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
      const svg = box.firstElementChild; if (svg) { svg.style.width = '100%'; svg.style.maxWidth = '340px'; svg.style.height = 'auto'; }
    };
    ssid.oninput = draw; pass.oninput = draw;
    draw();
    modal('تجهيز جهاز ' + c.name + ' برمز QR', [
      h('ol', { class: 'small', style: 'padding-inline-start:18px;margin:0;line-height:1.9' },
        h('li', {}, 'اعمل ضبط المصنع لجهاز الطفل (الإعدادات ← حول الهاتف ← ضبط المصنع).'),
        h('li', {}, 'في أول شاشة ترحيب اضغط على الشاشة 6 مرات متتالية في المكان نفسه، فتفتح الكاميرا.'),
        h('li', {}, 'إن طلب الاتصال بالواي فاي فاتصل، ثم صوّر هذا الرمز.'),
        h('li', {}, 'وافق على الخطوات: يُنزَّل التطبيق ويصبح «مالك الجهاز» ويُربط بـ' + c.name + ' تلقائيًا.')),
      field('اسم شبكة الواي فاي (ليتصل الجهاز تلقائيًا)', ssid), field('كلمة مرور الواي فاي', pass),
      box,
      h('p', { class: 'small muted' }, 'لا تشارك هذا الرمز: فيه رمز الربط وكلمة مرور الشبكة إن كتبتها. وإن ظهر خطأ في التنزيل فتأكد أن الجهاز متصل بالإنترنت.'),
    ]);
  }

  function addChild() {
    const name = h('input', { type: 'text', maxlength: 30, placeholder: 'اسم الطفل' });
    const sample = h('input', { type: 'checkbox', checked: true });
    modal('إضافة طفل', [field('الاسم', name), h('label', { class: 'switch' }, 'اختيار خطة له من مكتبة القوالب بعد الإضافة', sample)], {
      okText: 'إضافة',
      onOk: async () => {
        if (!name.value.trim()) throw new Error('اكتب اسم الطفل');
        const c = await q(sb.from('children').insert({ family_id: S.me.family_id, name: name.value.trim() }).select().single());
        const code = await q(sb.rpc('new_pair_code', { p_child: c.id }));
        S.cur = c.id; localStorage.setItem('ck-cur', c.id);
        await reload();
        setTimeout(() => showPairCode(c, code).then(() => { if (sample.checked) { S.tab = 'templates'; render(); } }));
      },
    });
  }

  function viewSettings(c) {
    const out = [];
    const save = (patch, msg) => run(async () => { await q(sb.from('children').update(patch).eq('id', c.id)); await reload(); }, msg);
    if (c) {
      const sw = (label, key, hint) => h('label', { class: 'switch' }, h('div', {}, label, hint ? h('div', { class: 'small muted' }, hint) : null),
        h('input', { type: 'checkbox', checked: c[key], onchange: (e) => save({ [key]: e.target.checked }) }));
      const num = (label, key, min, max) => h('div', { class: 'row between' }, h('span', { class: 'grow' }, label),
        h('input', { type: 'number', min, max, value: c[key], style: 'width:90px', onchange: (e) => save({ [key]: Math.max(min, Math.min(max, +e.target.value || min)) }) }));
      out.push(card('إعدادات ' + c.name,
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('input', { type: 'text', value: c.name, maxlength: 30, onchange: (e) => e.target.value.trim() && save({ name: e.target.value.trim() }) })),
          h('span', { class: 'tag ' + (c.paired_at ? 'ok' : 'warn') }, c.paired_at ? 'الجهاز مرتبط' : 'غير مرتبط')),
        c.pair_code ? h('div', { class: 'row between' }, h('span', {}, 'رمز الربط الحالي'), h('b', { class: 'pin', style: 'font-size:1.3rem' }, c.pair_code)) : null,
        h('button', { class: 'btn ghost', onclick: async () => {
          if (c.paired_at && !(await confirmBox('سيُنشأ رمز جديد، وعند استخدامه يُفصل الجهاز الحالي. متابعة؟'))) return;
          run(async () => { const code = await q(sb.rpc('new_pair_code', { p_child: c.id })); await reload(); showPairCode(c, code); });
        } }, c.pair_code ? 'رمز ربط جديد' : 'ربط جهاز'),
        h('button', { class: 'btn ghost', onclick: () => setupQR(c) }, '📷 تجهيز جهاز جديد برمز QR'),
        sw('المهام الرئيسية تحتاج تأكيدي', 'main_requires_approval', 'عند الإيقاف يكفي أن يبلّغ الطفل بإنجازها ويصلك إشعار.'),
        sw('وضع القفل الكامل على الجهاز', 'kiosk_enabled', 'أوقفه مؤقتًا إذا أردت استخدام جهاز الطفل بحرية أو تثبيت تطبيقات.'),
        num('حد المهام السريعة يوميًا', 'max_quick_per_day', 0, 20),
        num('حد مهام النصف ساعة يوميًا', 'max_extra_per_day', 0, 20),
        h('h2', { style: 'margin-top:8px' }, '⏰ وقت الاستخدام اليومي'),
        num('الحد الأعلى للاستخدام يوميًا (دقائق، 0 = بلا حد)', 'max_daily_min', 0, 1440),
        h('p', { class: 'small muted' }, `الحالي: ${c.max_daily_min ? hmin(c.max_daily_min) + ' ساعة' : 'بلا حد'}. عند بلوغه يُقفل الجهاز ويصلك تنبيه أحمر، ويبقى السماح المباشر منك ممكنًا.`),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn bad sm', onclick: async () => {
            if (await confirmBox(`حذف ${c.name} وكل مهامه ورسائله نهائيًا؟ لا يمكن التراجع.`, 'حذف نهائي')) run(async () => { await q(sb.from('children').delete().eq('id', c.id)); S.cur = null; await reload(); }, 'تم الحذف');
          } }, 'حذف الطفل'))));
    }
    const owner = S.d.members.find((m) => m.user_id === S.me.user_id)?.is_owner;
    const passInput = () => h('input', { type: 'password', maxlength: 72, autocomplete: 'new-password', dir: 'ltr' });
    const resetPass = (m) => {
      const n = passInput();
      modal('كلمة مرور جديدة لـ' + m.name, [field('كلمة المرور الجديدة (6 أحرف على الأقل)', n),
        h('p', { class: 'small muted' }, 'أبلغه بها، ويستطيع تغييرها بعد الدخول من إعداداته.')], { onOk: async () => {
        await CK.fn('gate', { action: 'set_password', user_id: m.user_id, password: n.value });
        toast('تم تعيين كلمة المرور');
      } });
    };
    out.push(card('الأسرة: ' + (S.family?.name || ''),
      h('h2', { style: 'margin-top:4px' }, '👥 أولياء الأمور'),
      S.d.members.map((m) => h('div', { class: 'item' }, h('span', { class: 'avatar' }, m.is_owner ? '👑' : '👤'),
        h('div', { class: 'grow' }, h('div', {}, m.name + (m.user_id === S.me.user_id ? ' (أنت)' : '')),
          h('div', { class: 'small muted', dir: 'ltr', style: 'text-align:right' }, '@' + (m.username || '—')),
          m.is_owner ? h('span', { class: 'tag ok' }, 'مدير الأسرة') : null),
        owner && m.user_id !== S.me.user_id ? [
          h('button', { class: 'iconbtn', title: 'تعيين كلمة مرور', onclick: () => resetPass(m) }, '🔑'),
          h('button', { class: 'iconbtn', title: 'إزالة', onclick: async () => {
            if (await confirmBox(`إزالة ${m.name} من الأسرة؟ لن يستطيع الدخول بعدها.`, 'إزالة')) run(async () => { await CK.fn('gate', { action: 'remove_parent', user_id: m.user_id }); await reload(); }, 'أُزيل ولي الأمر');
          } }, '🗑')] : null)),
      owner ? h('button', { class: 'btn ghost', onclick: () => {
        const name = h('input', { type: 'text', maxlength: 30, placeholder: 'مثال: الأم' });
        const user = h('input', { type: 'text', maxlength: 30, dir: 'ltr', autocapitalize: 'off', spellcheck: false, placeholder: 'umm_abdullah' });
        const pass = passInput();
        modal('إضافة ولي أمر', [field('الاسم كما يظهر للطفل', name), field('اسم المستخدم (حروف أو أرقام بلا مسافات)', user), field('كلمة مرور أولية (6 أحرف على الأقل)', pass),
          h('p', { class: 'small muted' }, 'يدخل بها من تطبيق الوالدين على جواله، ويستطيع تغيير كلمة المرور بعد الدخول.')], { okText: 'إضافة', onOk: async () => {
          await CK.fn('gate', { action: 'add_parent', name: name.value, username: user.value, password: pass.value });
          await reload(); toast('أضيف ولي الأمر');
        } }).then(() => render());
      } }, '＋ إضافة ولي أمر') : h('p', { class: 'small muted' }, 'إضافة أولياء الأمور وإدارتهم لمدير الأسرة فقط.'),
      h('div', { class: 'row wrap', style: 'margin-top:8px' },
        h('button', { class: 'btn ghost sm', onclick: () => {
          const o = h('input', { type: 'password', maxlength: 72, autocomplete: 'current-password', dir: 'ltr' }), n = passInput(), n2 = passInput();
          modal('تغيير كلمة المرور', [field('كلمة المرور الحالية', o), field('الجديدة (6 أحرف على الأقل)', n), field('تأكيد الجديدة', n2)], { onOk: async () => {
            if (n.value.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
            if (n.value !== n2.value) throw new Error('كلمتا المرور غير متطابقتين');
            await CK.gate({ action: 'login', username: S.me.username, password: o.value }).catch(() => { throw new Error('كلمة المرور الحالية غير صحيحة'); });
            await q(sb.auth.updateUser({ password: n.value }));
            toast('تم تغيير كلمة المرور');
          } });
        } }, '🔑 تغيير كلمة المرور'),
        pushOn()
          ? h('button', { class: 'btn plain sm', onclick: async () => { await disablePush(); toast('أُوقفت الإشعارات على هذا الجهاز'); render(); } }, '🔕 إيقاف الإشعارات')
          : h('button', { class: 'btn sm', onclick: async () => { await run(() => enablePush(true), 'تم تفعيل الإشعارات على هذا الجهاز 🔔'); render(); } }, '🔔 تفعيل الإشعارات'),
        h('button', { class: 'btn plain sm', onclick: () => { sessionStorage.removeItem('ck-unlocked'); location.reload(); } }, 'قفل التطبيق'),
        h('button', { class: 'btn plain sm', onclick: async () => { if (await confirmBox('تسجيل الخروج من هذا الجهاز؟')) { await disablePush(); await sb.auth.signOut(); sessionStorage.clear(); location.reload(); } } }, 'تسجيل الخروج')),
      pushOn() ? null : h('p', { class: 'small muted' }, 'فعّل الإشعارات ليصلك تنبيه بالمهام والرسائل حتى والتطبيق مغلق. على الآيفون: أضف التطبيق إلى الشاشة الرئيسية أولًا ثم افتحه من أيقونته.')));
    return out;
  }

  boot();
})();
