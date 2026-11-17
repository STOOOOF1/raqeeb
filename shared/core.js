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
      const ok = h('button', { class: 'btn', type: 'submit' }, okText);
      const dlg = h('dialog', {},
        h('form', { method: 'dialog' },
          h('div', { class: 'dh' }, title),
          h('div', { class: 'db' }, body),
          h('div', { class: 'df' }, onOk ? ok : null,
            h('button', { class: 'btn plain', type: 'button', onclick: () => { dlg.close(); } }, onOk ? cancelText : 'إغلاق'), extra)));
      $('form', dlg).addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (!onOk) return dlg.close();
        ok.disabled = true;
        try { if ((await onOk()) !== false) { dlg.returnValue = 'ok'; dlg.close(); } }
        catch (e) { console.error(e); toast(errMsg(e)); }
        ok.disabled = false;
      });
      dlg.addEventListener('close', () => { dlg.remove(); resolve(dlg.returnValue === 'ok'); });
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
    chore: { name: 'مهمة منزلية', ic: '🧹' }, reading: { name: 'قراءة واختبار', ic: '📚' }, puzzle: { name: 'لعبة ذهنية', ic: '🧩' },
  };

  // ---------- تجزئة النصوص ----------
  // line: كل سطر وحدة (آية أو بيت) — sentence: كل جملة وحدة (نثر)
  function splitUnits(body, split) {
    const text = (body || '').replace(/\r/g, '');
    const parts = split === 'sentence' ? text.split(/(?<=[.!؟?。؛])\s+|\n+/) : text.split(/\n+/);
    return parts.map((s) => s.trim()).filter(Boolean);
  }
  // المقطع التالي المطلوب من الطفل في مهمة حفظ
  function nextPortion(task) {
    const units = splitUnits(task.body, task.split);
    const from = Math.min(task.progress, units.length), to = Math.min(from + task.unit_size, units.length);
    return { units, from, to, text: units.slice(from, to).join('\n'), done: from >= units.length };
  }

  // ---------- منطق الفتح والقفل ----------
  // d = {child, schedules, tasks, subs, grants}
  function computeState(d, now = new Date()) {
    const c = d.child, day = dayStr(now), t0 = now.getTime();
    const mainList = d.tasks.filter((t) => t.kind === 'main' && t.active).map((task) => {
      const sub = d.subs.find((s) => s.task_id === task.id && s.day === day && s.status !== 'rejected');
      return { task, sub, ok: !!sub && (sub.status === 'approved' || !c.main_requires_approval) };
    });
    const mainsOk = mainList.every((m) => m.ok);
    const at = (t) => { const [H, M] = t.split(':').map(Number); const x = new Date(now); x.setHours(H, M, 0, 0); return x.getTime(); };
    const windows = d.schedules.filter((s) => s.weekday === now.getDay())
      .map((s) => ({ s: at(s.start_time), e: at(s.end_time), sched: true })).filter((w) => w.e > w.s);
    const base = {
      mainList, mainsOk, unlocked: false, until: null, breakAt: null, breakGrant: null, why: null, reason: null,
      ready: d.grants.filter((g) => g.status === 'ready'),
      nextWindow: windows.filter((w) => w.s > t0).sort((a, b) => a.s - b.s)[0] || null,
      windows,
    };
    if (c.force_lock) return { ...base, reason: 'force' };

    const iv = [];
    for (const g of d.grants) {
      if (g.status !== 'active' || !g.ends_at) continue;
      const e = new Date(g.ends_at).getTime();
      if (e > t0 && (g.source === 'parent' || mainsOk)) iv.push({ s: new Date(g.starts_at).getTime(), e, g });
    }
    if (mainsOk) for (const w of windows) if (w.e > t0) iv.push(w);

    const cur = iv.filter((i) => i.s <= t0);
    if (!cur.length) return { ...base, reason: mainsOk ? 'time' : 'main' };

    let until = Math.max(...cur.map((i) => i.e));
    for (let changed = true; changed;) {
      changed = false;
      for (const i of iv) if (i.s <= until + 1000 && i.e > until) { until = i.e; changed = true; }
    }
    const parentG = cur.find((i) => i.g && i.g.source === 'parent');
    const inSched = cur.some((i) => i.sched);
    // الوقت الجاري الذي يُعوَّض فيه الفاصل: المنحة التي تنتهي عند نهاية الوقت المفتوح
    const endG = iv.find((i) => i.g && Math.abs(i.e - until) < 1000);
    const st = { ...base, unlocked: true, until, why: parentG ? 'parent' : inSched ? 'schedule' : 'task', endGrant: endG ? endG.g : null };
    // الحد اليومي للاستخدام (إذن الوالدين المباشر يتجاوزه)
    const cap = (c.max_daily_min || 0) * 60000;
    if (cap && !parentG) {
      const left = cap - usedToday(d, now);
      if (left <= 0) return { ...base, reason: 'cap' };
      if (t0 + left < st.until) { st.until = t0 + left; st.capped = true; st.endGrant = null; }
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
    await q(sb.auth.signInWithPassword({ email: j.email, password: j.password }));
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
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
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
  function Chat({ familyId, childId, sender, senderName }) {
    const msgs = h('div', { class: 'msgs' });
    const input = h('input', { type: 'text', placeholder: 'اكتب رسالة…', maxlength: 1000, enterkeyhint: 'send' });
    const sendBtn = h('button', { class: 'btn', type: 'submit', title: 'إرسال' }, '➤');
    const micBtn = h('button', { class: 'btn plain', type: 'button', title: 'رسالة صوتية' }, '🎤');
    const recBox = h('div', { class: 'rec hidden' }, h('i'), h('span', {}, '0:00'),
      h('button', { class: 'btn sm plain', type: 'button', onclick: () => stopRec(false) }, 'إلغاء'));
    const form = h('form', { class: 'send' }, input, recBox, micBtn, sendBtn);
    const root = h('div', { class: 'chat' }, msgs, form);
    const seen = new Set();
    let rec = null, timer = null;

    function add(m, scroll = true) {
      if (seen.has(m.id)) return; seen.add(m.id);
      const mine = m.sender === sender;
      msgs.append(h('div', { class: 'bubble' + (mine ? ' me' : '') },
        m.kind === 'audio' ? audioPlayer(m.audio_path) : m.body,
        h('div', { class: 'meta' }, (m.sender === 'parent' && m.sender_name ? m.sender_name + ' · ' : '') + clock(m.created_at))));
      if (scroll) msgs.scrollTop = msgs.scrollHeight;
    }
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
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (rec) return stopRec(true);
      const body = input.value.trim();
      if (!body) return;
      input.value = '';
      if (!(await run(() => send({ kind: 'text', body })))) input.value = body;
    });
    micBtn.onclick = async () => {
      try { rec = await startRecording(); } catch { return toast('اسمح باستخدام الميكروفون أولًا'); }
      input.classList.add('hidden'); micBtn.classList.add('hidden'); recBox.classList.remove('hidden');
      timer = setInterval(() => { recBox.children[1].textContent = countdown(rec.seconds() * 1000); }, 500);
    };
    async function stopRec(doSend) {
      clearInterval(timer);
      input.classList.remove('hidden'); micBtn.classList.remove('hidden'); recBox.classList.add('hidden');
      const r = rec; rec = null;
      if (!r) return;
      if (!doSend) return r.cancel();
      const blob = await r.stop();
      if (blob.size) await run(async () => send({ kind: 'audio', audio_path: await uploadAudio(blob, familyId, childId) }));
    }
    // تعليم رسائل الطرف الآخر كمقروءة
    async function markRead() {
      const other = sender === 'parent' ? 'child' : 'parent';
      await sb.from('messages').update({ read_at: new Date().toISOString() }).eq('child_id', childId).eq('sender', other).is('read_at', null);
    }
    load().catch((e) => toast(errMsg(e)));
    return { el: root, add, markRead, focus: () => { msgs.scrollTop = msgs.scrollHeight; } };
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

  return {
    sb, h, $, toast, run, q, modal, confirmBox, errMsg, dayStr, clock, hm, countdown, ago, WEEKDAYS, KINDS,
    splitUnits, nextPortion, computeState, usedToday, gate, me, fn, subscribe, debounce,
    startRecording, uploadAudio, audioUrl, removeAudio, audioPlayer, recordButton, Chat, beep, shuffle,
  };
})();
