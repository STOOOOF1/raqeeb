'use strict';
// تطبيق الوالدين
(() => {
  const { sb, h, $, toast, run, q, modal, confirmBox, clock, hm, KINDS, WEEKDAYS } = CK;
  const root = $('#root');
  const S = {
    me: null, family: null, children: [], cur: localStorage.getItem('ck-cur'), tab: 'home', taskTab: 'main',
    d: { members: [], schedules: [], apps: [], yt: [], tasks: [], subs: [], grants: [], breaks: [] },
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
    if (sessionStorage.getItem('ck-unlocked') !== '1') return pinScreen();
    start();
  }

  function authScreen() {
    let mode = 'create';
    const draw = () => {
      const f = {
        family: h('input', { type: 'text', placeholder: 'مثال: أسرة أبي عبدالله', maxlength: 40 }),
        code: h('input', { type: 'tel', class: 'pin', maxlength: 6, placeholder: '000000' }),
        name: h('input', { type: 'text', placeholder: 'مثال: الأب', maxlength: 30 }),
        pin: h('input', { type: 'password', inputmode: 'numeric', class: 'pin', maxlength: 12, placeholder: '••••' }),
      };
      const btn = h('button', { class: 'btn big block', type: 'submit' }, mode === 'create' ? 'إنشاء الأسرة' : 'انضمام');
      const form = h('form', { class: 'col', onsubmit: async (ev) => {
        ev.preventDefault(); btn.disabled = true;
        const ok = await run(async () => {
          const body = mode === 'create'
            ? { action: 'create_family', family_name: f.family.value, parent_name: f.name.value, pin: f.pin.value }
            : { action: 'join_parent', code: f.code.value, parent_name: f.name.value, pin: f.pin.value };
          await CK.gate(body);
          sessionStorage.setItem('ck-unlocked', '1');
        });
        btn.disabled = false;
        if (ok) boot();
      } },
        mode === 'create' ? field('اسم الأسرة', f.family) : field('رمز الأسرة (من إعدادات تطبيق أحد الوالدين)', f.code),
        field('اسمك كما يظهر للطفل', f.name),
        field(mode === 'create' ? 'اختر رقمًا سريًا للوالدين (4 أرقام أو أكثر)' : 'الرقم السري للوالدين', f.pin),
        btn);
      root.replaceChildren(h('div', { class: 'splash' }, h('div', { class: 'card' },
        h('div', { class: 'logo' }, '🛡️'), h('h1', { class: 'center' }, 'رقيب'),
        h('p', { class: 'muted center' }, 'تطبيق الوالدين للتحكم بأجهزة الأطفال'),
        h('div', { class: 'tabs' },
          h('button', { class: mode === 'create' ? 'on' : '', onclick: () => { mode = 'create'; draw(); } }, 'أسرة جديدة'),
          h('button', { class: mode === 'join' ? 'on' : '', onclick: () => { mode = 'join'; draw(); } }, 'انضمام لأسرة')),
        form)));
    };
    draw();
  }

  function pinScreen() {
    const pin = h('input', { type: 'password', inputmode: 'numeric', class: 'pin', maxlength: 12, placeholder: '••••', autofocus: true });
    root.replaceChildren(h('div', { class: 'splash' }, h('div', { class: 'card' },
      h('div', { class: 'logo' }, '🔒'), h('h1', { class: 'center' }, 'الرقم السري للوالدين'),
      h('form', { class: 'col', onsubmit: async (ev) => {
        ev.preventDefault();
        await run(async () => {
          if (!(await q(sb.rpc('check_pin', { p_pin: pin.value })))) { pin.value = ''; throw new Error('الرقم السري غير صحيح'); }
          sessionStorage.setItem('ck-unlocked', '1');
          start();
        });
      } }, pin, h('button', { class: 'btn big block', type: 'submit' }, 'دخول')))));
    pin.focus();
  }

  // ================= الهيكل والبيانات =================
  let chipsEl, mainEl, navEl;
  const TABS = [['home', '🏠', 'الرئيسية'], ['schedule', '🕒', 'الأوقات'], ['apps', '📱', 'التطبيقات'],
    ['tasks', '✅', 'المهام'], ['breaks', '💡', 'الفوائد'], ['chat', '💬', 'المحادثة'], ['settings', '⚙️', 'الإعدادات']];

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
      const [family, children, members, schedules, yt, tasks, subs, grants, breaks, unread] = await Promise.all([
        q(sb.from('families').select('id,name,code').eq('id', fam).single()),
        q(sb.from('children').select('*').order('created_at')),
        q(sb.from('members').select('*').eq('role', 'parent').order('created_at')),
        q(sb.from('schedules').select('*').order('start_time')),
        q(sb.from('yt_channels').select('*').order('created_at')),
        q(sb.from('tasks').select('*').order('sort').order('created_at')),
        q(sb.from('submissions').select('*').or(`status.eq.pending,day.gte.${since}`).order('created_at', { ascending: false })),
        q(sb.from('grants').select('*').or(`status.eq.ready,ends_at.gte.${nowIso}`).order('created_at')),
        q(sb.from('break_items').select('*').order('created_at')),
        q(sb.from('messages').select('child_id').eq('sender', 'child').is('read_at', null)),
      ]);
      S.family = family; S.children = children;
      children.forEach(capAlert);
      if (!cur()) { S.cur = children[0]?.id || null; }
      const apps = S.cur ? await q(sb.from('apps').select('*').eq('child_id', S.cur).order('label')) : [];
      S.d = { members, schedules, apps, yt, tasks, subs, grants, breaks };
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
    if (!c && S.tab !== 'settings') {
      mainEl.replaceChildren(card('مرحبًا 👋', h('p', {}, 'ابدأ بإضافة طفلك الأول، ثم اربط جهازه برمز الربط.'),
        h('button', { class: 'btn big', onclick: addChild }, '＋ إضافة طفل')));
      return;
    }
    const view = { home: viewHome, schedule: viewSchedule, apps: viewApps, tasks: viewTasks, breaks: viewBreaks, settings: viewSettings }[S.tab];
    mainEl.replaceChildren(...view(c).filter(Boolean));
    mainEl.scrollTop = top;
  }

  // ================= الرئيسية =================
  function stateLine(c) {
    const st = CK.computeState({ child: c, schedules: mine(S.d.schedules, c), tasks: mine(S.d.tasks, c), subs: mine(S.d.subs, c), grants: mine(S.d.grants, c) });
    let text, cls = 'bad';
    if (st.unlocked) {
      cls = 'ok';
      text = `مفتوح حتى ${clock(st.until)} · ` + { parent: 'بإذن مباشر', schedule: 'الوقت الرسمي', task: 'وقت مكتسب بمهمة' }[st.why];
    } else if (st.reason === 'cap') text = 'مقفل · بلغ الحد اليومي للاستخدام';
    else if (st.reason === 'force') text = 'مقفل يدويًا من الوالدين';
    else if (st.reason === 'main') text = 'مقفل · بانتظار إنجاز المهام الرئيسية';
    else text = 'مقفل · خارج الأوقات المسموحة' + (st.nextWindow ? ` (يفتح ${clock(st.nextWindow.s)})` : '');
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

  function viewHome(c) {
    const { st, text, cls } = stateLine(c);
    const out = [];
    const activeParent = mine(S.d.grants, c).filter((g) => g.status === 'active' && g.source === 'parent' && new Date(g.ends_at) > new Date());
    out.push(h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'avatar' }, '🧒'),
        h('div', { class: 'grow' }, h('h2', {}, c.name), h('div', { class: 'small muted' }, c.paired_at ? CK.ago(c.last_seen) : 'الجهاز غير مرتبط بعد — انظر الإعدادات'))),
      h('div', {}, h('span', { class: 'tag ' + cls }, text)),
      usageBox(c),
      c.paired_at && c.device_info?.native && !c.device_info.owner
        ? h('div', { class: 'card bad' }, h('p', { class: 'small' }, '⚠️ جهاز الطفل غير مؤمَّن: لم يُفعَّل وضع «مالك الجهاز»، فيستطيع الطفل الخروج من التطبيق. راجع خطوات التفعيل في ملف التعليمات.')) : null,
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
        activeParent.length ? h('button', { class: 'btn plain', onclick: () => run(async () => {
          await q(sb.from('grants').update({ status: 'cancelled' }).in('id', activeParent.map((g) => g.id))); await reload();
        }, 'أُلغي الإذن') }, 'إلغاء الإذن المباشر') : null)));

    const pending = S.d.subs.filter((s) => s.status === 'pending');
    out.push(card(`بانتظار مراجعتك (${pending.length})`,
      pending.length ? pending.map((s) => {
        const t = S.d.tasks.find((x) => x.id === s.task_id), ch = S.children.find((x) => x.id === s.child_id);
        return h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch' },
          h('div', { class: 'row' }, h('span', { class: 'avatar' }, KINDS[s.kind]?.ic || '✅'),
            h('div', { class: 'grow' }, h('b', {}, t?.title || 'مهمة'),
              h('div', { class: 'small muted' }, `${ch?.name || ''} · ${KINDS[s.kind]?.name || ''} · ${clock(s.created_at)}`))),
          s.portion ? h('details', {}, h('summary', { class: 'small' }, 'عرض المقطع المطلوب'), h('div', { class: 'portion', style: 'font-size:1rem' }, s.portion)) : null,
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
      modal('إضافة وقت رسمي', [h('div', { class: 'days' }, days),
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
      h('div', { class: 'card soft' }, h('p', {}, `الأوقات التي يُفتح فيها جهاز ${c.name} تلقائيًا بعد إنجاز مهامه الرئيسية.`),
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

    return [
      card(`التطبيقات المسموحة (${allowed} من ${S.d.apps.length})`,
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
  const TASK_TABS = [['main', 'الرئيسية', ['main']], ['extra', 'نصف ساعة', ['quran', 'matn', 'chore']],
    ['quick', 'سريعة (ربع ساعة)', ['reading', 'puzzle']]];
  const TASK_HELP = {
    main: 'مهام يومية لا يُفتح الجهاز في وقته الرسمي حتى يُنجزها الطفل وتصلك للمتابعة.',
    extra: 'يسجّل الطفل صوته بالحفظ (أو يبلّغ بإنجاز المهمة المنزلية)، وبعد إجازتك يحصل على الوقت كاملًا مع فواصل قصيرة.',
    quick: 'تُصحَّح تلقائيًا: يقرأ ثم يُختبر، أو يحل لعبة ذهنية، فيُفتح له الوقت مباشرة.',
  };

  // محرر أسئلة اختيار من متعدد
  function qEditor(initial) {
    const list = (initial || []).map((x) => ({ q: x.q, options: [...x.options, '', '', ''].slice(0, 3), answer: x.answer ?? 0 }));
    const box = h('div', { class: 'col' }); const uid = Math.random().toString(36).slice(2);
    const draw = () => box.replaceChildren(
      ...list.map((it, i) => h('div', { class: 'qbox' },
        h('div', { class: 'row' }, h('input', { type: 'text', placeholder: `السؤال ${i + 1}`, value: it.q, oninput: (e) => { it.q = e.target.value; } }),
          h('button', { class: 'iconbtn', type: 'button', onclick: () => { list.splice(i, 1); draw(); } }, '🗑')),
        it.options.map((o, j) => h('div', { class: 'row' },
          h('input', { type: 'radio', name: `a-${uid}-${i}`, checked: it.answer === j, title: 'الإجابة الصحيحة', onchange: () => { it.answer = j; } }),
          h('input', { type: 'text', placeholder: `الخيار ${j + 1}`, value: o, oninput: (e) => { it.options[j] = e.target.value; } }))),
        h('div', { class: 'small muted' }, 'حدد الدائرة بجانب الإجابة الصحيحة'))),
      h('button', { class: 'btn ghost sm', type: 'button', onclick: () => { list.push({ q: '', options: ['', '', ''], answer: 0 }); draw(); } }, '＋ سؤال'));
    draw();
    return {
      el: box,
      get: () => list.filter((x) => x.q.trim()).map((x) => {
        const opts = x.options.map((o) => o.trim());
        if (opts.filter(Boolean).length < 2 || !opts[x.answer]) throw new Error('كل سؤال يحتاج خيارين على الأقل وإجابة صحيحة محددة');
        const answerText = opts[x.answer]; const options = opts.filter(Boolean);
        return { q: x.q.trim(), options, answer: options.indexOf(answerText) };
      }),
    };
  }

  function taskDialog(c, kind, t) {
    const isNew = !t; t = t || { kind, title: '', body: '', split: kind === 'matn' ? 'line' : 'line', unit_size: 2, reward_min: ['reading', 'puzzle'].includes(kind) ? 15 : 30, questions: [], config: {}, progress: 0 };
    const f = {
      title: h('input', { type: 'text', value: t.title, maxlength: 80, required: true }),
      body: h('textarea', { value: t.body }),
      split: h('select', {}, h('option', { value: 'line', selected: t.split === 'line' }, 'نظم: كل بيت في سطر'), h('option', { value: 'sentence', selected: t.split === 'sentence' }, 'نثر: يُجزّأ بالجملة')),
      unit: h('input', { type: 'number', min: 1, max: 50, value: t.unit_size }),
      reward: h('input', { type: 'number', min: 5, max: 180, value: t.reward_min }),
      ptype: h('select', {}, ...[['math', 'حساب ذهني'], ['memory', 'لعبة الذاكرة'], ['riddle', 'ألغاز (تكتبها أنت)']].map(([v, n]) => h('option', { value: v, selected: t.config.type === v }, n))),
      level: h('select', {}, ...[[1, 'سهل'], [2, 'متوسط'], [3, 'صعب']].map(([v, n]) => h('option', { value: v, selected: +t.config.level === v }, n))),
      quiz: h('input', { type: 'number', min: 1, max: 10, value: t.config.quiz_size || 3 }),
    };
    const qe = qEditor(t.questions);
    const info = h('div', { class: 'small muted' });
    const unitName = kind === 'quran' ? 'آية' : 'وحدة (بيت أو جملة)';
    const upd = () => {
      const n = CK.splitUnits(f.body.value, kind === 'quran' ? 'line' : f.split.value).length, u = Math.max(1, +f.unit.value || 1);
      info.textContent = n ? `المجموع ${n} ${unitName} ← ${Math.ceil(n / u)} جلسة، كل جلسة ${u}` + (isNew ? '' : ` · أنجز ${Math.min(t.progress, n)}`) : 'اكتب النص لتظهر التجزئة';
    };
    const riddleBox = h('div', { class: 'col' }, h('b', {}, 'الألغاز'), qe.el, field('عدد الألغاز في كل محاولة', f.quiz));
    const levelBox = field('المستوى', f.level);
    const updPuzzle = () => { riddleBox.classList.toggle('hidden', f.ptype.value !== 'riddle'); levelBox.classList.toggle('hidden', f.ptype.value === 'riddle'); };
    f.body.oninput = f.unit.oninput = f.split.onchange = upd; f.ptype.onchange = updPuzzle;

    const body = [field('عنوان المهمة', f.title)];
    if (kind === 'quran') body.push(field('الآيات (كل آية في سطر)', f.body), field('عدد الآيات لكل جلسة', f.unit), info);
    if (kind === 'matn') body.push(field('نوع المتن', f.split), field('نص المتن', f.body), field('عدد الأبيات أو الجمل لكل جلسة', f.unit), info);
    if (kind === 'chore') body.push(field('وصف المهمة (اختياري)', f.body));
    if (kind === 'reading') body.push(field('النص المطلوب قراءته', f.body), h('b', {}, 'بنك الأسئلة (يُفضّل أكثر من عدد أسئلة الاختبار لتتغير عند الإعادة)'), qe.el, field('عدد أسئلة كل اختبار', f.quiz));
    if (kind === 'puzzle') body.push(field('نوع اللعبة', f.ptype), levelBox, riddleBox);
    if (kind !== 'main') body.push(field('مدة الفتح بالدقائق', f.reward));
    if (!isNew && ['quran', 'matn'].includes(kind) && t.progress > 0) {
      body.push(h('button', { class: 'btn plain sm', type: 'button', onclick: (e) => { t.progress = 0; e.target.textContent = 'سيبدأ من الأول عند الحفظ'; upd(); } }, '↺ إعادة الحفظ من البداية'));
    }
    upd(); updPuzzle();

    modal((isNew ? 'إضافة: ' : 'تعديل: ') + KINDS[kind].name, body, {
      onOk: async () => {
        const row = { kind, title: f.title.value.trim(), body: f.body.value.trim(), split: kind === 'quran' ? 'line' : f.split.value,
          unit_size: Math.max(1, +f.unit.value || 1), reward_min: kind === 'main' ? 30 : Math.max(5, +f.reward.value || 15), questions: [], config: {}, progress: t.progress };
        if (!row.title) throw new Error('اكتب عنوان المهمة');
        if (['quran', 'matn'].includes(kind) && !CK.splitUnits(row.body, row.split).length) throw new Error('اكتب النص المطلوب حفظه');
        if (kind === 'reading') {
          row.questions = qe.get(); row.config = { quiz_size: Math.max(1, +f.quiz.value || 3) };
          if (!row.body) throw new Error('اكتب نص القراءة');
          if (row.questions.length < row.config.quiz_size) throw new Error(`أضف ${row.config.quiz_size} أسئلة على الأقل`);
        }
        if (kind === 'puzzle') {
          row.config = { type: f.ptype.value, level: +f.level.value, quiz_size: Math.max(1, +f.quiz.value || 3) };
          if (f.ptype.value === 'riddle') {
            row.questions = qe.get();
            if (row.questions.length < row.config.quiz_size) throw new Error(`أضف ${row.config.quiz_size} ألغاز على الأقل`);
          }
        }
        if (isNew) await q(sb.from('tasks').insert({ ...row, family_id: c.family_id, child_id: c.id }));
        else await q(sb.from('tasks').update(row).eq('id', t.id));
        await reload();
      },
    });
  }

  function breakDialog(b, defKind = 'fact') {
    const isNew = !b; b = b || { kind: defKind, title: '', body: '', options: [], answer: 0 };
    const kind = h('select', {}, ...[['question', 'سؤال'], ['fact', 'فائدة'], ['story', 'قصة قصيرة']].map(([v, n]) => h('option', { value: v, selected: b.kind === v }, n)));
    const title = h('input', { type: 'text', value: b.title, maxlength: 60, placeholder: 'مثال: هل تعلم؟' });
    const bodyEl = h('textarea', { value: b.body });
    const opts = [0, 1, 2].map((j) => h('input', { type: 'text', value: b.options[j] || '', placeholder: `الخيار ${j + 1}` }));
    const radios = [0, 1, 2].map((j) => h('input', { type: 'radio', name: 'bans', checked: (b.answer ?? 0) === j }));
    const optBox = h('div', { class: 'col' }, h('b', {}, 'الخيارات (حدد الصحيح)'), opts.map((o, j) => h('div', { class: 'row' }, radios[j], o)));
    const upd = () => optBox.classList.toggle('hidden', kind.value !== 'question');
    kind.onchange = upd; upd();
    modal(isNew ? 'إضافة' : 'تعديل', [field('النوع', kind), field('العنوان', title), field('النص (يُقرأ في دقيقتين أو أقل)', bodyEl), optBox], {
      onOk: async () => {
        const row = { kind: kind.value, title: title.value.trim(), body: bodyEl.value.trim(), options: [], answer: null };
        if (!row.body) throw new Error('اكتب النص');
        if (row.kind === 'question') {
          const o = opts.map((x) => x.value.trim()), ai = radios.findIndex((r) => r.checked);
          if (o.filter(Boolean).length < 2 || !o[ai]) throw new Error('أدخل خيارين على الأقل وحدد الصحيح');
          row.options = o.filter(Boolean); row.answer = row.options.indexOf(o[ai]);
        }
        if (isNew) await q(sb.from('break_items').insert({ ...row, family_id: S.me.family_id }));
        else await q(sb.from('break_items').update(row).eq('id', b.id));
        await reload();
      },
    });
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
        h('label', { class: 'switch' }, h('div', {}, 'الفواصل أثناء السماح المباشر مني', h('div', { class: 'small muted' }, 'تعمل دائمًا في الوقت الرسمي والوقت المكتسب.')),
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
          else if (kind === 'reading') sub = `${t.questions.length} سؤال في البنك · ${t.reward_min} دقيقة`;
          else if (kind === 'puzzle') sub = ({ math: 'حساب ذهني', memory: 'لعبة الذاكرة', riddle: 'ألغاز' }[t.config.type] || '') + ` · ${t.reward_min} دقيقة`;
          else if (kind === 'chore') sub = `${t.reward_min} دقيقة`;
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
  async function insertSamples(c) {
    await q(sb.from('tasks').insert(SAMPLES.tasks.map((t, i) => ({ split: 'line', unit_size: 1, body: '', questions: [], config: {}, ...t, reward_min: t.reward_min || 30, family_id: c.family_id, child_id: c.id, sort: i }))));
    if (!S.d.breaks.length) await q(sb.from('break_items').insert(SAMPLES.breaks.map((b) => ({ options: [], answer: null, ...b, family_id: c.family_id }))));
  }

  function showPairCode(c, code) {
    return modal('ربط جهاز ' + c.name, [
      h('p', {}, 'ثبّت تطبيق الطفل على جهازه، ثم أدخل هذا الرمز عند أول تشغيل:'),
      h('div', { class: 'pin', style: 'font-size:2.4rem;padding:10px;background:var(--pri-soft);border-radius:14px' }, code),
      h('p', { class: 'small muted' }, 'الرمز صالح لمرة واحدة. عند ربط جهاز جديد يُفصل الجهاز القديم تلقائيًا.')]);
  }

  function addChild() {
    const name = h('input', { type: 'text', maxlength: 30, placeholder: 'اسم الطفل' });
    const sample = h('input', { type: 'checkbox', checked: true });
    modal('إضافة طفل', [field('الاسم', name), h('label', { class: 'switch' }, 'إضافة محتوى تمثيلي جاهز (مهام، قراءة، ألعاب، فواصل)', sample)], {
      okText: 'إضافة',
      onOk: async () => {
        if (!name.value.trim()) throw new Error('اكتب اسم الطفل');
        const c = await q(sb.from('children').insert({ family_id: S.me.family_id, name: name.value.trim() }).select().single());
        if (sample.checked) await insertSamples(c);
        const code = await q(sb.rpc('new_pair_code', { p_child: c.id }));
        S.cur = c.id; localStorage.setItem('ck-cur', c.id);
        await reload();
        showPairCode(c, code);
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
        sw('المهام الرئيسية تحتاج تأكيدي', 'main_requires_approval', 'عند الإيقاف يكفي أن يبلّغ الطفل بإنجازها ويصلك إشعار.'),
        sw('وضع القفل الكامل على الجهاز', 'kiosk_enabled', 'أوقفه مؤقتًا إذا أردت استخدام جهاز الطفل بحرية أو تثبيت تطبيقات.'),
        num('حد المهام السريعة يوميًا', 'max_quick_per_day', 0, 20),
        num('حد مهام النصف ساعة يوميًا', 'max_extra_per_day', 0, 20),
        h('h2', { style: 'margin-top:8px' }, '⏰ وقت الاستخدام اليومي'),
        num('الحد الأعلى للاستخدام يوميًا (دقائق، 0 = بلا حد)', 'max_daily_min', 0, 1440),
        h('p', { class: 'small muted' }, `الحالي: ${c.max_daily_min ? hmin(c.max_daily_min) + ' ساعة' : 'بلا حد'}. عند بلوغه يُقفل الجهاز ويصلك تنبيه أحمر، ويبقى السماح المباشر منك ممكنًا.`),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn plain sm', onclick: async () => { if (await confirmBox('إضافة المحتوى التمثيلي لهذا الطفل؟')) run(async () => { await insertSamples(c); await reload(); }, 'أضيف المحتوى'); } }, 'إضافة محتوى تمثيلي'),
          h('button', { class: 'btn bad sm', onclick: async () => {
            if (await confirmBox(`حذف ${c.name} وكل مهامه ورسائله نهائيًا؟ لا يمكن التراجع.`, 'حذف نهائي')) run(async () => { await q(sb.from('children').delete().eq('id', c.id)); S.cur = null; await reload(); }, 'تم الحذف');
          } }, 'حذف الطفل'))));
    }
    out.push(card('الأسرة: ' + (S.family?.name || ''),
      h('div', { class: 'row between' }, h('span', {}, 'رمز الأسرة (لانضمام والد آخر)'), h('b', { class: 'pin', style: 'font-size:1.3rem' }, S.family?.code)),
      h('p', { class: 'small muted' }, 'ينضم الوالد الآخر من تطبيق الوالدين بهذا الرمز مع الرقم السري.'),
      S.d.members.map((m) => h('div', { class: 'item' }, h('span', { class: 'avatar' }, '👤'), h('span', { class: 'grow' }, m.name + (m.user_id === S.me.user_id ? ' (أنت)' : '')),
        m.user_id !== S.me.user_id ? h('button', { class: 'iconbtn', title: 'إزالة', onclick: async () => {
          if (await confirmBox(`إزالة ${m.name} من الأسرة؟`)) run(async () => { await q(sb.from('members').delete().eq('user_id', m.user_id)); await reload(); });
        } }, '🗑') : null)),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost sm', onclick: () => {
          const o = h('input', { type: 'password', inputmode: 'numeric', class: 'pin' }), n = h('input', { type: 'password', inputmode: 'numeric', class: 'pin' });
          modal('تغيير الرقم السري', [field('الرقم الحالي', o), field('الرقم الجديد', n)], { onOk: async () => {
            if (!/^\d{4,12}$/.test(n.value)) throw new Error('الرقم الجديد 4 أرقام على الأقل');
            if (!(await q(sb.rpc('change_pin', { p_old: o.value, p_new: n.value })))) throw new Error('الرقم الحالي غير صحيح');
            toast('تم تغيير الرقم السري');
          } });
        } }, 'تغيير الرقم السري'),
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
