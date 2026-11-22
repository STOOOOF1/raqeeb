'use strict';
// الكود المشترك بين تطبيق الوالدين وواجهة الطفل
// يتوقع: window.CONFIG {url, key} و window.CK_ROLE ('parent' | 'kid')
const CK = (() => {
  const sb = supabase.createClient(CONFIG.url, CONFIG.key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ck-auth-' + window.CK_ROLE },
  });

  // ---------- عناصر الواجهة ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const $ = (sel, root = document) => root.querySelector(sel);

  let toastTimer;
  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); }
    t.textContent = msg; t.style.opacity = 1; t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.classList.add('hidden'), 300); }, 2800);
  }
  const errMsg = (e) => (e && (e.message || e.error_description || e.error)) || 'حدث خطأ';
  // ينفذ عملية ويعرض الخطأ إن وقع؛ يعيد true عند النجاح
  async function run(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); return true; } catch (e) { console.error(e); toast(errMsg(e)); return false; }
  }
  // يرمي الخطأ إن أعاد Supabase خطأ
  async function q(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }

  // نافذة نموذج: onOk يعيد false لإبقائها مفتوحة
  function modal(title, body, { okText = 'حفظ', onOk, cancelText = 'إلغاء', extra } = {}) {
    return new Promise((resolve) => {
      // يُغلق ويُحسم مباشرة دون انتظار حدث close (قد يتأخر في بعض المتصفحات حتى الرسم التالي)
      let done = false;
      const finish = (v) => { if (done) return; done = true; if (dlg.open) dlg.close(); dlg.remove(); resolve(v); };
      const ok = h('button', { class: 'btn', type: 'submit' }, okText);
      const dlg = h('dialog', {},
        h('form', { method: 'dialog' },
          h('div', { class: 'dh' }, title),
          h('div', { class: 'db' }, body),
          h('div', { class: 'df' }, onOk ? ok : null,
            h('button', { class: 'btn plain', type: 'button', onclick: () => finish(false) }, onOk ? cancelText : 'إغلاق'), extra)));
      $('form', dlg).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!onOk) return finish(false);
        ok.disabled = true;
        try { if ((await onOk()) !== false) return finish(true); }
        catch (e) { console.error(e); toast(errMsg(e)); }
        ok.disabled = false;
      });
      dlg.addEventListener('close', () => finish(false)); // زر الرجوع أو Esc
      document.body.append(dlg);
      dlg.showModal();
    });
  }
  const confirmBox = (text, okText = 'نعم') => modal('تأكيد', h('p', {}, text), { okText, onOk: () => true });

  // ---------- الوقت ----------
  const pad = (n) => String(n).padStart(2, '0');
  const dayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const clock = (d) => new Date(d).toLocaleTimeString('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
  const hm = (t) => { // "16:30:00" -> "4:30 م"
    const [H, M] = t.split(':').map(Number); const d = new Date(); d.setHours(H, M, 0, 0); return clock(d);
  };
  function countdown(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const H = Math.floor(s / 3600), M = Math.floor((s % 3600) / 60), S = s % 60;
    return H ? `${H}:${pad(M)}:${pad(S)}` : `${M}:${pad(S)}`;
  }
  function ago(d) {
    if (!d) return 'لم يتصل بعد';
    const m = Math.round((Date.now() - new Date(d)) / 60000);
    if (m < 2) return 'متصل الآن';
    if (m < 60) return `قبل ${m} دقيقة`;
    if (m < 1440) return `قبل ${Math.round(m / 60)} ساعة`;
    return `قبل ${Math.round(m / 1440)} يوم`;
  }
  const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const KINDS = {
    main: { name: 'مهمة رئيسية', ic: '⭐' }, quran: { name: 'حفظ قرآن', ic: '📖' }, matn: { name: 'حفظ متن', ic: '📜' },
    chore: { name: 'مهمة منزلية', ic: '🧹' }, draw: { name: 'كتابة ورسم', ic: '✏️' },
    reading: { name: 'قراءة واختبار', ic: '📚' }, puzzle: { name: 'لعبة ذهنية', ic: '🧩' },
  };

  // ---------- تجزئة النصوص ----------
  // line: كل سطر وحدة (آية أو بيت) — sentence: كل جملة وحدة (نثر)
  // السطر الذي يبدأ بـ # عنوان قسم (سورة أو باب)، لا يُحسب وحدة ولا يعبر المقطعُ حدودَه
  function parseUnits(body, split) {
    const out = []; let sec = null;
    for (const raw of (body || '').replace(/\r/g, '').split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#')) { sec = line.replace(/^#+\s*/, '') || null; continue; }
      const parts = split === 'sentence' ? line.split(/(?<=[.!؟?。؛])\s+/) : [line];
      for (const t of parts.map((x) => x.trim()).filter(Boolean)) out.push({ text: t, sec });
    }
    return out;
  }
  const splitUnits = (body, split) => parseUnits(body, split).map((u) => u.text);
  const words = (t) => t.split(/\s+/).filter((w) => w.replace(/[\u064B-\u0652\u0670\u06D6-\u06ED.،؛:…]/g, '')).length;
  // المقطع التالي: حتى unit_size وحدة، لا يعبر حدود القسم، وإن حُدد config.words لا يتجاوز عدد الكلمات (توزيع متوازن)
  function nextPortion(task) {
    const all = parseUnits(task.body, task.split), n = all.length;
    const from = Math.min(task.progress, n), sec = all[from]?.sec ?? null;
    const max = Math.max(1, task.unit_size || 1), budget = +(task.config && task.config.words) || 0;
    let to = from, w = 0;
    while (to < n && to - from < max && all[to].sec === sec) {
      const k = words(all[to].text);
      if (budget && to > from && w + k > budget) break;
      w += k; to++;
    }
    // لا يُترك ذيل صغير من القسم لجلسة مستقلة (وحدة واحدة، أو أقل من نصف حد الكلمات)
    if (sec && to > from) {
      let k = to, rw = 0;
      while (k < n && all[k].sec === sec) { rw += words(all[k].text); k++; }
      if (k > to && (budget ? rw <= budget / 2 : k - to === 1)) { to = k; w += rw; }
    }
    const first = sec ? all.findIndex((u) => u.sec === sec) : 0;
    return { units: all.map((u) => u.text), from, to, text: all.slice(from, to).map((u) => u.text).join('\n'), done: from >= n,
      sec, secFrom: from - first + 1, secTo: to - first, words: w };
  }

  // ---------- منطق الفتح والقفل ----------
  // d = {child, schedules, tasks, subs, grants}
  // الجهاز لا يُفتح إلا برصيد: الساعة اليومية أو وقت مكتسب أو إذن الوالدين.
  // الجدول الأسبوعي (إن وُجد) يحدد متى يُسمح باستعمال الرصيد المكتسب فقط، ولا يمنح وقتًا بنفسه.
  function computeState(d, now = new Date()) {
    const c = d.child, day = dayStr(now), t0 = now.getTime();
    const mainList = d.tasks.filter((t) => t.kind === 'main' && t.active).map((task) => {
      const sub = d.subs.find((s) => s.task_id === task.id && s.day === day && s.status !== 'rejected');
      return { task, sub, ok: !!sub && (sub.status === 'approved' || !c.main_requires_approval) };
    });
    const mainsOk = mainList.every((m) => m.ok);
    const at = (t) => { const [H, M] = t.split(':').map(Number); const x = new Date(now); x.setHours(H, M, 0, 0); return x.getTime(); };
    const windows = d.schedules.filter((s) => s.weekday === now.getDay())
      .map((s) => ({ s: at(s.start_time), e: at(s.end_time) })).filter((w) => w.e > w.s).sort((a, b) => a.s - b.s);
    // بلا جدول أصلًا: الرصيد يُستعمل في أي وقت
    const restricted = d.schedules.length > 0;
    const curWin = windows.find((w) => w.s <= t0 && t0 < w.e) || null;
    const inWindow = !restricted || !!curWin;
    const base = {
      mainList, mainsOk, unlocked: false, until: null, breakAt: null, breakGrant: null, why: null, reason: null,
      ready: d.grants.filter((g) => g.status === 'ready'),
      nextWindow: windows.find((w) => w.s > t0) || null,
      windows, restricted, inWindow, canStart: false,
    };
    const capLeft = () => (c.max_daily_min ? c.max_daily_min * 60000 - usedToday(d, now) : Infinity);
    if (c.force_lock) return { ...base, reason: 'force' };
    // فترات الأرصدة النشطة: إذن الوالدين دائمًا، والمكتسب بشرط إنجاز المهام الرئيسية
    const pa = c.paused_at ? new Date(c.paused_at).getTime() : null;
    // إذن والدين أُعطي بعد الإيقاف: لا يُجمَّد مع الوقت الموقوف
    const parentAfterPause = (g) => pa != null && g.source === 'parent' && new Date(g.starts_at).getTime() >= pa;
    let onlyParent = false;
    const spans = (from) => d.grants.filter((g) => g.status === 'active' && g.ends_at && (g.source === 'parent' || mainsOk)
      && (!onlyParent || parentAfterPause(g)))
      .map((g) => ({ s: new Date(g.starts_at).getTime(), e: new Date(g.ends_at).getTime(), g })).filter((i) => i.e > from);
    // نهاية الوقت المتصل الذي يبدأ قبل اللحظة t (تُدمج الأرصدة المتتابعة)
    const chainEnd = (iv, t) => {
      const cur = iv.filter((i) => i.s <= t + 1000);
      if (!cur.length) return null;
      let until = Math.max(...cur.map((i) => i.e));
      for (let changed = true; changed;) {
        changed = false;
        for (const i of iv) if (i.s <= until + 1000 && i.e > until) { until = i.e; changed = true; }
      }
      return until;
    };
    // الطفل أوقف وقته (أو توقف تلقائيًا بنهاية الوقت المسموح): الجهاز مقفل والباقي محفوظ كما كان لحظة الإيقاف
    // إلا إذا أعطاه الوالدان إذنًا جاريًا بعد الإيقاف: يُفتح بالإذن وحده، ويبقى الوقت الموقوف محفوظًا كما هو
    if (pa != null) {
      const parentNow = d.grants.some((g) => g.status === 'active' && g.ends_at && parentAfterPause(g)
        && new Date(g.starts_at).getTime() <= t0 && new Date(g.ends_at).getTime() > t0);
      if (!parentNow) {
        const end = chainEnd(spans(pa), pa);
        const left = end ? Math.max(0, Math.min(end - pa, capLeft())) : 0;
        return { ...base, reason: 'pause', left, canResume: inWindow && left > 0 };
      }
      onlyParent = true;
    }

    const iv = spans(t0);
    const cur = iv.filter((i) => i.s <= t0);
    const parentCur = cur.filter((i) => i.g.source === 'parent');
    if (!cur.length) {
      if (!mainsOk) return { ...base, reason: 'main' };
      return { ...base, reason: base.ready.length ? 'ready' : 'time', canStart: inWindow && capLeft() > 0 };
    }
    // وقت مكتسب يجري خارج الوقت المسموح: يُقفل ويُحفظ الباقي (يوقفه جهاز الطفل تلقائيًا)
    if (!inWindow && !parentCur.length) {
      const lastEnd = Math.max(-Infinity, ...windows.filter((w) => w.e <= t0).map((w) => w.e));
      const pauseAt = Math.min(t0, Math.max(lastEnd, Math.min(...cur.map((i) => i.s))));
      const end = chainEnd(spans(pauseAt), pauseAt);
      return { ...base, reason: 'window', pauseAt, left: end ? Math.max(0, end - pauseAt) : 0 };
    }

    let until = chainEnd(iv, t0);
    // الوقت الجاري الذي يُعوَّض فيه الفاصل: المنحة التي تنتهي عند نهاية الوقت المفتوح
    const endG = iv.find((i) => Math.abs(i.e - until) < 1000);
    let cut = false;
    if (restricted) {
      if (curWin && until > curWin.e && !parentCur.some((i) => i.e >= curWin.e)) { until = curWin.e; cut = true; }
      // إذن الوالدين خارج الوقت المسموح: ينتهي بانتهائه، وما بعده من وقت مكتسب ينتظر الوقت المسموح
      if (!curWin) { const pe = Math.max(...parentCur.map((i) => i.e)); if (until > pe) { until = pe; cut = true; } }
    }
    const mainG = cur.find((i) => i.g.source === 'main');
    const st = { ...base, unlocked: true, until, windowCut: cut, why: parentCur.length ? 'parent' : mainG ? 'main' : 'task',
      endGrant: endG ? endG.g : null, canStart: inWindow };
    // الحد اليومي للاستخدام (إذن الوالدين المباشر يتجاوزه)
    if (!parentCur.length) {
      const left = capLeft();
      if (left <= 0) return { ...base, reason: 'cap' };
      if (t0 + left < st.until) { st.until = t0 + left; st.capped = true; st.windowCut = false; st.endGrant = null; }
    }
    return st;
  }
  // دقائق الاستخدام اليوم: الجهاز يمرّر عدّاده المحلي، والوالد يقرأ آخر ما أرسله الجهاز
  function usedToday(d, now = new Date()) {
    if (d.usedMs != null) return d.usedMs;
    return d.child.usage_day === dayStr(now) ? d.child.usage_secs * 1000 : 0;
  }

  // ---------- الدخول ----------
  async function gate(body) {
    const r = await fetch(CONFIG.url + '/functions/v1/gate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.key }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'تعذر الاتصال بالخادم');
    if (j.session) await q(sb.auth.setSession(j.session));
    else await q(sb.auth.signInWithPassword({ email: j.email, password: j.password }));
    return j;
  }
  async function me() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const rows = await q(sb.from('members').select('*').eq('user_id', session.user.id));
    return rows[0] || null;
  }

  // استدعاء دالة خادم مع إظهار رسالة الخطأ العربية القادمة منها
  async function fn(name, body) {
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) {
      let msg = 'تعذر الاتصال بالخادم';
      try { msg = (await error.context.json()).error || msg; } catch { /* يبقى النص العام */ }
      throw new Error(msg);
    }
    return data;
  }

  // ---------- التحديث اللحظي ----------
  function subscribe(cb) {
    const ch = sb.channel('db-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public' }, (p) => cb(p))
      .subscribe();
    return () => sb.removeChannel(ch);
  }
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  // ---------- الصوت ----------
  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = []; const t0 = Date.now();
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(500);
    const end = () => stream.getTracks().forEach((t) => t.stop());
    return {
      seconds: () => Math.round((Date.now() - t0) / 1000),
      stop: () => new Promise((res) => { rec.onstop = () => { end(); res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); }; rec.stop(); }),
      cancel: () => { rec.onstop = end; try { rec.stop(); } catch { end(); } },
    };
  }
  async function uploadAudio(blob, familyId, childId) {
    // الملف نفسه يحمل التسجيلات الصوتية ورسومات الطفل (PNG) في مجلد الأسرة
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const path = `${familyId}/${childId}/${crypto.randomUUID()}.${ext}`;
    await q(sb.storage.from('audio').upload(path, blob, { contentType: blob.type.split(';')[0] }));
    return path;
  }
  async function audioUrl(path) {
    return (await q(sb.storage.from('audio').createSignedUrl(path, 3600))).signedUrl;
  }
  const removeAudio = (path) => path && sb.storage.from('audio').remove([path]);
  // مشغل يحمّل الملف عند أول ضغطة
  function audioPlayer(path) {
    const box = h('div', {});
    if (/\.png$/.test(path)) { // رسم الطفل: يُعرض مباشرة
      const img = h('img', { alt: 'رسم الطفل', style: 'width:100%;max-width:420px;border-radius:12px;border:1.5px solid var(--line);background:#fff' });
      audioUrl(path).then((u) => { img.src = u; }, () => box.replaceChildren(h('span', { class: 'small muted' }, 'تعذر تحميل الرسم')));
      box.append(img);
      return box;
    }
    const btn = h('button', { class: 'btn sm plain', type: 'button', onclick: async () => {
      btn.disabled = true; btn.textContent = '…';
      try {
        const a = h('audio', { controls: true, src: await audioUrl(path) });
        box.replaceChildren(a); a.play().catch(() => {});
      } catch { btn.textContent = 'تعذر التحميل'; }
    } }, '▶ استماع');
    box.append(btn);
    return box;
  }
  // زر تسجيل قابل لإعادة الاستخدام: onDone(blob)
  function recordButton(onDone, label = '🎤 تسجيل') {
    let rec = null, timer = null;
    const status = h('span', { class: 'rec hidden' }, h('i'), h('span', {}, '0:00'));
    const start = h('button', { class: 'btn big block', type: 'button' }, label);
    const stop = h('button', { class: 'btn big ok grow hidden', type: 'button' }, '⏹ إنهاء');
    const cancel = h('button', { class: 'btn big plain hidden', type: 'button' }, 'إلغاء');
    const set = (on) => { for (const x of [status, stop, cancel]) x.classList.toggle('hidden', !on); start.classList.toggle('hidden', on); };
    start.onclick = async () => {
      try { rec = await startRecording(); } catch { return toast('اسمح باستخدام الميكروفون أولًا'); }
      set(true);
      timer = setInterval(() => { status.lastChild.textContent = countdown(rec.seconds() * 1000); }, 500);
    };
    stop.onclick = async () => { clearInterval(timer); set(false); const b = await rec.stop(); rec = null; if (b.size) onDone(b); };
    cancel.onclick = () => { clearInterval(timer); set(false); rec.cancel(); rec = null; };
    return h('div', { class: 'col' }, status, h('div', { class: 'row' }, start, stop, cancel));
  }

  // ---------- المحادثة ----------
  const CHAT_MAX_SEC = 120; // أقصى مدة للرسالة الصوتية
  const MIC_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V20H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.6a6 6 0 0 0 5-5.9Z"/></svg>';
  const SEND_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20.6 3.4 3.7 10.2c-.9.4-.8 1.6.1 1.9l6.2 1.9 1.9 6.2c.3.9 1.5 1 1.9.1l6.8-16.9c.3-.7-.4-1.4-1.1-1.1Z" transform="scale(-1,1) translate(-24,0)"/></svg>';
  const TRASH_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"/></svg>';
  function Chat({ familyId, childId, sender, senderName }) {
    const msgs = h('div', { class: 'msgs' });
    const input = h('input', { type: 'text', placeholder: 'اكتب رسالة…', maxlength: 1000, enterkeyhint: 'send' });
    const sendBtn = h('button', { class: 'wa-btn hidden', type: 'submit', title: 'إرسال', html: SEND_SVG });
    // زر الميكروفون على طريقة واتساب: اضغط مطولًا وتحدّث، ارفع إصبعك للإرسال، اسحب للأعلى للتثبيت، اسحب جانبًا للإلغاء
    const micBtn = h('button', { class: 'wa-btn mic', type: 'button', title: 'اضغط مطولًا للتسجيل', html: MIC_SVG });
    const lockHint = h('div', { class: 'wa-lock hidden' }, h('span', {}, '🔒'), h('span', { class: 'arr' }, '⌃'));
    const micWrap = h('div', { class: 'wa-mic' }, lockHint, micBtn);
    const recTime = h('span', { class: 'rt' }, '0:00');
    const recHint = h('span', { class: 'rh' }, h('span', { dir: 'ltr' }, '›'), ' اسحب للإلغاء');
    const trashBtn = h('button', { class: 'wa-trash hidden', type: 'button', title: 'حذف التسجيل', html: TRASH_SVG, onclick: () => stopRec(false) });
    const recBox = h('div', { class: 'rec hidden' }, trashBtn, h('i'), recTime, recHint);
    const form = h('form', { class: 'send' }, input, recBox, micWrap, sendBtn);
    const root = h('div', { class: 'chat' }, msgs, h('p', { class: 'chat-note' }, 'تُحذف المحادثات تلقائيًا كل يوم عند منتصف الليل'), form);
    const seen = new Map();
    let rec = null, timer = null, hold = null, locked = false, starting = false;

    function add(m, scroll = true) {
      if (seen.has(m.id)) return;
      const mine = m.sender === sender;
      const el = h('div', { class: 'bubble' + (mine ? ' me' : '') },
        m.kind === 'audio' ? audioPlayer(m.audio_path) : m.body,
        h('div', { class: 'meta' }, (m.sender === 'parent' && m.sender_name ? m.sender_name + ' · ' : '') + clock(m.created_at)));
      seen.set(m.id, el);
      msgs.append(el);
      if (scroll) msgs.scrollTop = msgs.scrollHeight;
    }
    // تُستدعى عند حذف رسالة من الخادم (الحذف اليومي)
    function remove(id) { seen.get(id)?.remove(); seen.delete(id); }
    async function load() {
      const rows = await q(sb.from('messages').select('*').eq('child_id', childId).order('created_at', { ascending: false }).limit(150));
      rows.reverse().forEach((m) => add(m, false));
      if (!rows.length) msgs.append(h('p', { class: 'muted center small', id: 'empty-chat' }, 'لا توجد رسائل بعد'));
      requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
    }
    async function send(fields) {
      const row = await q(sb.from('messages').insert({ family_id: familyId, child_id: childId, sender, sender_name: senderName, ...fields }).select().single());
      $('#empty-chat', msgs)?.remove();
      add(row);
    }
    // زر الإرسال يظهر عند الكتابة، والميكروفون عند الفراغ
    const syncBtns = () => {
      const typing = !rec && !starting && input.value.trim().length > 0;
      micWrap.classList.toggle('hidden', typing || locked);
      sendBtn.classList.toggle('hidden', !typing && !locked);
    };
    input.addEventListener('input', syncBtns);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (rec) return stopRec(true);
      const body = input.value.trim();
      if (!body) return;
      input.value = ''; syncBtns();
      if (!(await run(() => send({ kind: 'text', body })))) { input.value = body; syncBtns(); }
    });

    function showRec(on) {
      input.classList.toggle('hidden', on); recBox.classList.toggle('hidden', !on);
      lockHint.classList.toggle('hidden', !on || locked);
      micBtn.classList.toggle('holding', on && !locked);
      trashBtn.classList.toggle('hidden', !locked); recHint.classList.toggle('hidden', locked);
      recBox.classList.toggle('locked', locked);
      micBtn.style.transform = ''; recHint.style.transform = '';
      syncBtns();
    }
    function tick() {
      if (!rec) return;
      const s = rec.seconds();
      recTime.textContent = countdown(s * 1000) + ' / ' + countdown(CHAT_MAX_SEC * 1000);
      recBox.classList.toggle('near', s >= CHAT_MAX_SEC - 10);
      if (s >= CHAT_MAX_SEC) { toast('انتهت المدة القصوى (دقيقتان) وأُرسل التسجيل'); stopRec(true); }
    }
    async function beginRec() {
      starting = true; locked = false;
      try { rec = await startRecording(); } catch { starting = false; hold = null; locked = false; showRec(false); return toast('اسمح باستخدام الميكروفون أولًا'); }
      starting = false;
      if (!hold && !locked) { const r = rec; rec = null; r.cancel(); return showRec(false); } // رفع الإصبع قبل جاهزية الميكروفون
      try { navigator.vibrate?.(30); } catch { /* */ }
      recTime.textContent = '0:00 / ' + countdown(CHAT_MAX_SEC * 1000);
      timer = setInterval(tick, 250);
    }
    async function stopRec(doSend) {
      clearInterval(timer);
      const r = rec; rec = null; hold = null; locked = false;
      showRec(false);
      if (!r) return;
      if (!doSend) return r.cancel();
      if (r.seconds() < 1) { r.cancel(); return toast('اضغط مطولًا على 🎤 وتحدّث، ثم ارفع إصبعك للإرسال'); }
      const blob = await r.stop();
      if (blob.size) await run(async () => send({ kind: 'audio', audio_path: await uploadAudio(blob, familyId, childId) }));
    }
    micBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    micBtn.addEventListener('pointerdown', (e) => {
      if (rec || starting || (e.button && e.button !== 0)) return;
      e.preventDefault();
      try { micBtn.setPointerCapture(e.pointerId); } catch { /* */ }
      hold = { id: e.pointerId, x: e.clientX, y: e.clientY };
      showRec(true);
      beginRec();
    });
    micBtn.addEventListener('pointermove', (e) => {
      if (!hold || e.pointerId !== hold.id || locked) return;
      const dx = e.clientX - hold.x, dy = hold.y - e.clientY;
      if (dy > 70) { locked = true; hold = null; try { navigator.vibrate?.(20); } catch { /* */ } return showRec(true); } // تثبيت التسجيل
      if (Math.abs(dx) > 100) return stopRec(false); // سحب جانبي = إلغاء
      micBtn.style.transform = `translate(${dx}px, ${-Math.max(0, dy)}px) scale(1.45)`;
      recHint.style.transform = `translateX(${dx / 2}px)`;
      recHint.style.opacity = String(1 - Math.min(1, Math.abs(dx) / 100));
    });
    const release = (e, ok) => {
      if (!hold || e.pointerId !== hold.id || locked) return;
      hold = null;
      if (starting) return showRec(false); // سيُلغى عند جاهزية الميكروفون
      stopRec(ok);
    };
    micBtn.addEventListener('pointerup', (e) => release(e, true));
    micBtn.addEventListener('pointercancel', (e) => release(e, false));

    // تعليم رسائل الطرف الآخر كمقروءة
    async function markRead() {
      const other = sender === 'parent' ? 'child' : 'parent';
      await sb.from('messages').update({ read_at: new Date().toISOString() }).eq('child_id', childId).eq('sender', other).is('read_at', null);
    }
    load().catch((e) => toast(errMsg(e)));
    return { el: root, add, remove, markRead, focus: () => { msgs.scrollTop = msgs.scrollHeight; } };
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); o.frequency.setValueAtTime(1175, ctx.currentTime + 0.12); o.stop(ctx.currentTime + 0.28);
      setTimeout(() => ctx.close(), 500);
    } catch { /* لا صوت */ }
  }
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- يوتيوب ----------
  // يستخرج معرّف المقطع من الرابط بصيغه المختلفة، أو يقبل المعرّف نفسه
  function ytId(input) {
    const s = (input || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    try {
      const u = new URL(/^https?:\/\//.test(s) ? s : 'https://' + s);
      const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
      let id = null;
      if (host === 'youtu.be') id = u.pathname.split('/')[1];
      else if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
        id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/) || [])[1];
      }
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    } catch { return null; }
  }
  // يقرأ وقت البداية من الرابط (t=90 أو t=1m30s)
  function ytStart(input) {
    try {
      const t = new URL(/^https?:\/\//.test(input) ? input : 'https://' + input).searchParams.get('t') || '';
      const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
    } catch { return 0; }
  }
  // "1:30" أو "90" -> 90 ثانية؛ الفارغ -> 0؛ غير الصالح -> NaN
  function parseTime(s) {
    s = String(s || '').trim();
    if (!s) return 0;
    if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return NaN;
    return s.split(':').reduce((acc, p) => acc * 60 + +p, 0);
  }
  const fmtTime = (sec) => { sec = Math.max(0, Math.round(sec || 0)); const H = Math.floor(sec / 3600), M = Math.floor((sec % 3600) / 60), S = sec % 60; return H ? `${H}:${pad(M)}:${pad(S)}` : `${M}:${pad(S)}`; };
  // يطبّع رابط موقع يضيفه الوالدان: https فقط، ويضيف البروتوكول إن نُسي. يعيد '' إن لم يصح
  function siteUrl(input) {
    let v = String(input || '').trim();
    if (!v) return '';
    if (!/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
    try {
      const u = new URL(v);
      if (u.protocol === 'http:') u.protocol = 'https:';
      if (u.protocol !== 'https:' || !u.hostname.includes('.')) return '';
      u.hash = '';
      return u.href;
    } catch { return ''; }
  }
  const siteHost = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
  const ytThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  return {
    ytId, ytStart, parseTime, fmtTime, ytThumb, siteUrl, siteHost,
    sb, h, $, toast, run, q, modal, confirmBox, errMsg, dayStr, clock, hm, countdown, ago, WEEKDAYS, KINDS,
    parseUnits, splitUnits, nextPortion, words, computeState, usedToday, gate, me, fn, subscribe, debounce,
    startRecording, uploadAudio, audioUrl, removeAudio, audioPlayer, recordButton, Chat, beep, shuffle,
  };
})();
