'use strict';
// القوالب (خطط جاهزة): نماذج تحرير المهام والقوالب — مشتركة بين تطبيق الوالدين والإدارة المركزية —
// وعرض القالب، وتطبيقه على طفل، وتوليد خطة عشوائية.
const TPL = (() => {
  const { h, modal, KINDS } = CK;
  const field = (label, input) => h('label', { class: 'f' }, label, input);
  const BK = { fact: { name: 'فائدة', ic: '💡' }, question: { name: 'سؤال فاصل', ic: '❓' }, story: { name: 'قصة قصيرة', ic: '📗' } };
  const ALL = { ...KINDS, ...BK };
  const isBreak = (k) => k in BK;
  const ORDER = ['main', 'quran', 'matn', 'chore', 'draw', 'reading', 'puzzle', 'fact', 'question', 'story'];
  const durText = (m) => (m % 12 === 0 ? (m === 12 ? 'سنة' : m === 24 ? 'سنتان' : `${m / 12} سنوات`) : m === 1 ? 'شهر' : m === 2 ? 'شهران' : `${m} أشهر`);
  const ageText = (t) => (t.age_min === t.age_max ? `${t.age_min} سنوات` : `${t.age_min}–${t.age_max} سنة`);
  const secWord = (n) => (n >= 3 && n <= 10 ? `${n} أقسام` : `${n} قسمًا`);

  // ---------- محرر أسئلة الاختيار من متعدد ----------
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

  // ---------- حقل مقطع يوتيوب (اختياري) ----------
  // يعيد { el, has(): هل وُضع رابط, get(): {id, start?, end?} أو null بعد التحقق, onTitle }
  function videoBox(yt, onTitle) {
    yt = yt || {};
    const url = h('input', { type: 'url', dir: 'ltr', placeholder: 'https://youtu.be/…', value: yt.id ? `https://youtu.be/${yt.id}` : '' });
    const from = h('input', { type: 'text', dir: 'ltr', inputmode: 'numeric', placeholder: '0:00', value: yt.start ? CK.fmtTime(yt.start) : '' });
    const to = h('input', { type: 'text', dir: 'ltr', inputmode: 'numeric', placeholder: 'حتى النهاية', value: yt.end ? CK.fmtTime(yt.end) : '' });
    const prev = h('div', { class: 'ytprev hidden' });
    let bad = null, seq = 0;
    const check = () => {
      const v = url.value.trim(), id = CK.ytId(v), my = ++seq;
      bad = null;
      if (!v) { prev.classList.add('hidden'); return; }
      prev.classList.remove('hidden');
      if (!id) { bad = 'الرابط ليس رابط مقطع يوتيوب صحيحًا'; prev.replaceChildren(h('div', { class: 'small bad-t' }, '⚠️ ' + bad)); return; }
      const st = CK.ytStart(v); if (st && !from.value) from.value = CK.fmtTime(st);
      const cap = h('div', { class: 'small muted' }, 'جارٍ التحقق من المقطع…');
      prev.replaceChildren(h('img', { src: CK.ytThumb(id), alt: '' }), cap);
      CK.fn('yt', { action: 'video', id }).then((r) => {
        if (my !== seq) return;
        cap.className = 'small'; cap.textContent = '✓ ' + r.title;
        if (onTitle) onTitle(r.title);
      }, (e) => {
        if (my !== seq) return;
        if (/التضمين|خاص|غير موجود/.test(e.message)) { bad = e.message; cap.className = 'small bad-t'; cap.textContent = '⚠️ ' + bad; }
        else { cap.className = 'small muted'; cap.textContent = 'تعذر التحقق من المقطع الآن، سيُحفظ كما هو.'; }
      });
    };
    url.addEventListener('change', check); url.addEventListener('paste', () => setTimeout(check, 0));
    if (yt.id) check();
    return {
      el: h('div', { class: 'col' }, field('رابط مقطع يوتيوب', url), prev,
        h('div', { class: 'row' }, field('ابدأ من (اختياري)', from), field('انتهِ عند (اختياري)', to)),
        h('div', { class: 'small muted' }, 'يشاهد الطفل المقطع كاملًا (لا يستطيع تقديمه)، ثم تظهر له الأسئلة.')),
      has: () => !!url.value.trim(),
      get: () => {
        const v = url.value.trim();
        if (!v) return null;
        const id = CK.ytId(v);
        if (!id) throw new Error('رابط يوتيوب غير صحيح');
        if (bad) throw new Error(bad);
        const s = CK.parseTime(from.value), e = CK.parseTime(to.value);
        if (Number.isNaN(s) || Number.isNaN(e)) throw new Error('اكتب الوقت بصيغة دقائق:ثواني مثل 1:30');
        if (e && e <= s) throw new Error('وقت النهاية يجب أن يكون بعد وقت البداية');
        const out = { id }; if (s) out.start = s; if (e) out.end = e;
        return out;
      },
    };
  }

  // ---------- نموذج مهمة (يُستخدم لمهام الطفل ولعناصر القالب) ----------
  // يعيد { body: عناصر النموذج, get(): الصف بعد التحقق }
  function taskForm(kind, t, opts = {}) {
    t = { title: '', body: '', split: 'line', unit_size: 2, reward_min: ['reading', 'puzzle'].includes(kind) ? 15 : 30, questions: [], config: {}, progress: 0, ...(t || {}) };
    t.config = t.config || {};
    const f = {
      title: h('input', { type: 'text', value: t.title, maxlength: 80 }),
      body: h('textarea', { value: t.body, rows: ['quran', 'matn', 'reading'].includes(kind) ? 8 : 3 }),
      split: h('select', {}, h('option', { value: 'line', selected: t.split === 'line' }, 'نظم: كل بيت في سطر'), h('option', { value: 'sentence', selected: t.split === 'sentence' }, 'نثر: يُجزّأ بالجملة')),
      unit: h('input', { type: 'number', min: 1, max: 50, value: t.unit_size }),
      words: h('input', { type: 'number', min: 0, max: 500, value: t.config.words || 0 }),
      reward: h('input', { type: 'number', min: 5, max: 180, value: t.reward_min }),
      ptype: h('select', {}, ...[['math', 'حساب ذهني'], ['memory', 'لعبة الذاكرة'], ['riddle', 'أسئلة وألغاز (تكتبها أنت)']].map(([v, n]) => h('option', { value: v, selected: t.config.type === v }, n))),
      level: h('select', {}, ...[[1, 'سهل'], [2, 'متوسط'], [3, 'صعب']].map(([v, n]) => h('option', { value: v, selected: +t.config.level === v }, n))),
      quiz: h('input', { type: 'number', min: 1, max: 10, value: t.config.quiz_size || 3 }),
      dmode: h('select', {}, ...[['trace', 'كتابة الأحرف: يظهر الحرف باهتًا فيتتبعه بإصبعه'], ['free', 'رسم حر: يرسم الموضوع المكتوب']]
        .map(([v, n]) => h('option', { value: v, selected: (t.config.mode || 'trace') === v }, n))),
    };
    const qe = qEditor(t.questions);
    const info = h('div', { class: 'small muted' });
    const unitName = kind === 'quran' ? 'آية' : kind === 'draw' ? 'رسمة' : 'وحدة';
    let progress = t.progress || 0;
    const upd = () => {
      const split = ['quran', 'draw'].includes(kind) ? 'line' : f.split.value;
      const all = CK.parseUnits(f.body.value, split);
      if (!all.length) { info.textContent = 'اكتب النص لتظهر التجزئة'; return; }
      // محاكاة الجلسات بالتوزيع نفسه الذي يراه الطفل
      const sim = { body: f.body.value, split, unit_size: Math.max(1, +f.unit.value || 1), config: { words: +f.words.value || 0 }, progress: 0 };
      let sessions = 0;
      while (sim.progress < all.length && sessions < 2000) { sim.progress = CK.nextPortion(sim).to; sessions++; }
      const secs = new Set(all.map((u) => u.sec).filter(Boolean)).size;
      info.textContent = `المجموع ${all.length} ${unitName}` + (secs ? ` في ${secWord(secs)}` : '') + ` ← ${sessions} جلسة` + (progress ? ` · أنجز ${Math.min(progress, all.length)}` : '');
    };
    const riddleBox = h('div', { class: 'col' }, h('b', {}, 'الأسئلة'), qe.el, field('عدد الأسئلة في كل محاولة', f.quiz));
    const levelBox = field('المستوى', f.level);
    const updPuzzle = () => { riddleBox.classList.toggle('hidden', f.ptype.value !== 'riddle'); levelBox.classList.toggle('hidden', f.ptype.value === 'riddle'); };
    f.body.oninput = f.unit.oninput = f.words.oninput = f.split.onchange = upd; f.ptype.onchange = updPuzzle;
    const secHint = h('div', { class: 'small muted' }, 'للتوزيع الذكي: اكتب سطرًا يبدأ بـ # قبل كل سورة أو باب (مثل: # سورة الناس)، فلا تعبر الجلسة حدوده.');

    const vb = ['main', 'reading'].includes(kind) ? videoBox(t.config.yt, (name) => { if (!f.title.value.trim()) f.title.value = name.slice(0, 80); }) : null;
    const body = [field(kind === 'main' ? 'المهمة' : 'عنوان المهمة', f.title)];
    if (kind === 'main') {
      body.push(field('تفصيل (اختياري)', f.body),
        h('details', { class: 'qbox', open: !!t.config.yt },
          h('summary', {}, h('b', {}, '🎬 مقطع وأسئلة (اختياري)')),
          h('div', { class: 'col', style: 'margin-top:8px' }, vb.el,
            h('b', {}, 'الأسئلة على المقطع (يُفضّل أكثر من عدد أسئلة الاختبار لتتغير عند الإعادة)'), qe.el, field('عدد أسئلة كل اختبار', f.quiz))));
    }
    if (kind === 'quran') body.push(field('الآيات (كل آية في سطر)', f.body), secHint, field('أقصى عدد آيات في الجلسة', f.unit), field('حد الكلمات في الجلسة (0 = بلا حد)', f.words), info);
    if (kind === 'matn') body.push(field('نوع المتن', f.split), field('نص المتن', f.body), secHint, field('أقصى عدد أبيات أو جمل في الجلسة', f.unit), field('حد الكلمات في الجلسة (0 = بلا حد)', f.words), info);
    if (kind === 'chore') body.push(field('وصف المهمة (اختياري)', f.body));
    if (kind === 'draw') {
      body.push(field('النوع', f.dmode),
        field('المطلوب: سطر لكل حرف أو كلمة أو موضوع رسم', f.body),
        h('div', { class: 'small muted' }, 'مثال للكتابة: أ ثم ب ثم ت كلٌّ في سطر (أو كلمات قصيرة مثل: بيت). مثال للرسم: ارسم شجرة. يرسم الطفل بإصبعه ويرسل الرسم لتجيزه، ثم ينتقل للتالي.'),
        field('عدد الرسومات في الجلسة', f.unit), info);
    }
    if (kind === 'reading') body.push(vb.el, field('النص المطلوب قراءته (اختياري إذا وضعت مقطعًا)', f.body), h('b', {}, 'بنك الأسئلة (يُفضّل أكثر من عدد أسئلة الاختبار لتتغير عند الإعادة)'), qe.el, field('عدد أسئلة كل اختبار', f.quiz));
    if (kind === 'puzzle') body.push(field('نوع اللعبة', f.ptype), levelBox, riddleBox);
    if (kind !== 'main') body.push(field('مدة الفتح بالدقائق', f.reward));
    if (opts.allowReset && ['quran', 'matn', 'draw'].includes(kind) && progress > 0) {
      body.push(h('button', { class: 'btn plain sm', type: 'button', onclick: (e) => { progress = 0; e.target.textContent = 'سيبدأ من الأول عند الحفظ'; upd(); } }, '↺ إعادة الحفظ من البداية'));
    }
    upd(); updPuzzle();

    const get = () => {
      const row = { kind, title: f.title.value.trim(), body: f.body.value.trim(), split: ['quran', 'draw'].includes(kind) ? 'line' : f.split.value,
        unit_size: Math.max(1, +f.unit.value || 1), reward_min: kind === 'main' ? 30 : Math.max(5, +f.reward.value || 15), questions: [], config: {}, progress };
      if (!row.title) throw new Error('اكتب عنوان المهمة');
      if (['quran', 'matn'].includes(kind)) {
        if (!CK.splitUnits(row.body, row.split).length) throw new Error('اكتب النص المطلوب حفظه');
        if (+f.words.value > 0) row.config = { words: +f.words.value };
      }
      if (kind === 'draw') {
        if (!CK.splitUnits(row.body, 'line').length) throw new Error('اكتب حرفًا أو موضوع رسم واحدًا على الأقل');
        row.unit_size = Math.min(10, row.unit_size); row.config = { mode: f.dmode.value };
      }
      if (kind === 'reading') {
        row.questions = qe.get(); row.config = { quiz_size: Math.max(1, +f.quiz.value || 3) };
        const yt = vb.get(); if (yt) row.config.yt = yt;
        if (!row.body && !yt) throw new Error('اكتب نص القراءة أو ضع رابط مقطع');
        if (row.questions.length < row.config.quiz_size) throw new Error(`أضف ${row.config.quiz_size} أسئلة على الأقل`);
      }
      if (kind === 'main' && vb.has()) {
        const yt = vb.get();
        row.questions = qe.get(); row.config = { yt, quiz_size: Math.max(1, +f.quiz.value || 3) };
        if (row.questions.length < row.config.quiz_size) throw new Error(`أضف ${row.config.quiz_size} أسئلة على المقطع على الأقل`);
      }
      if (kind === 'puzzle') {
        row.config = { type: f.ptype.value, level: +f.level.value, quiz_size: Math.max(1, +f.quiz.value || 3) };
        if (f.ptype.value === 'riddle') {
          row.questions = qe.get();
          if (row.questions.length < row.config.quiz_size) throw new Error(`أضف ${row.config.quiz_size} أسئلة على الأقل`);
        }
      }
      return row;
    };
    return { body, get };
  }

  // ---------- نموذج فائدة / سؤال / قصة ----------
  function breakForm(b) {
    b = { kind: 'fact', title: '', body: '', options: [], answer: 0, ...(b || {}) };
    const kind = h('select', {}, ...Object.entries(BK).map(([v, x]) => h('option', { value: v, selected: b.kind === v }, x.name)));
    const title = h('input', { type: 'text', value: b.title || '', maxlength: 60, placeholder: 'مثال: هل تعلم؟' });
    const bodyEl = h('textarea', { value: b.body, rows: 4 });
    const opts = [0, 1, 2].map((j) => h('input', { type: 'text', value: (b.options || [])[j] || '', placeholder: `الخيار ${j + 1}` }));
    const uid = Math.random().toString(36).slice(2);
    const radios = [0, 1, 2].map((j) => h('input', { type: 'radio', name: 'b' + uid, checked: (b.answer ?? 0) === j }));
    const optBox = h('div', { class: 'col' }, h('b', {}, 'الخيارات (حدد الصحيح)'), opts.map((o, j) => h('div', { class: 'row' }, radios[j], o)));
    const upd = () => optBox.classList.toggle('hidden', kind.value !== 'question');
    kind.onchange = upd; upd();
    return {
      body: [field('النوع', kind), field('العنوان (اختياري)', title), field('النص (يُقرأ في دقيقتين أو أقل)', bodyEl), optBox],
      get: () => {
        const row = { kind: kind.value, title: title.value.trim(), body: bodyEl.value.trim(), options: [], answer: null };
        if (!row.body) throw new Error('اكتب النص');
        if (row.kind === 'question') {
          const o = opts.map((x) => x.value.trim()), ai = radios.findIndex((r) => r.checked);
          if (o.filter(Boolean).length < 2 || !o[ai]) throw new Error('أدخل خيارين على الأقل وحدد الصحيح');
          row.options = o.filter(Boolean); row.answer = row.options.indexOf(o[ai]);
        }
        return row;
      },
    };
  }

  // ---------- عنصر في قالب ----------
  function itemDialog(item, onOk) {
    const form = isBreak(item.kind) ? breakForm(item) : taskForm(item.kind, item);
    return modal(`${ALL[item.kind].ic} ${ALL[item.kind].name}`, form.body, { onOk: () => {
      const row = form.get(); delete row.progress;
      onOk(row);
    } });
  }
  const itemLine = (it) => {
    let sub = '';
    if (['quran', 'matn'].includes(it.kind)) {
      const all = CK.parseUnits(it.body, it.split); const secs = new Set(all.map((u) => u.sec).filter(Boolean)).size;
      sub = `${all.length} ${it.kind === 'quran' ? 'آية' : 'وحدة'}` + (secs ? ` · ${secWord(secs)}` : '') + (it.config?.words ? ` · نحو ${it.config.words} كلمة للجلسة` : ` · ${it.unit_size} لكل جلسة`);
    } else if (it.kind === 'draw') {
      const n = CK.parseUnits(it.body, 'line').length;
      sub = `${it.config?.mode === 'free' ? 'رسم حر' : 'كتابة'} · ${n} رسمة · ${it.unit_size || 1} لكل جلسة`;
    } else if (it.kind === 'reading' || (it.kind === 'puzzle' && it.config?.type === 'riddle')) sub = `${(it.questions || []).length} سؤال`;
    else if (isBreak(it.kind)) sub = it.body.slice(0, 70);
    else if (it.body) sub = it.body.slice(0, 70);
    return [h('span', { class: 'avatar' }, ALL[it.kind].ic),
      h('div', { class: 'grow' }, h('div', {}, it.title || ALL[it.kind].name), sub ? h('div', { class: 'small muted' }, sub) : null)];
  };

  // ---------- قنوات يوتيوب في القالب ----------
  // القناة: { channel_id, title, thumb } — تُضاف لقائمة قنوات الطفل المسموحة عند تطبيق القالب
  const resolveChannel = (input) => CK.fn('yt', { action: 'resolve', input });
  function channelsBox(list) {
    const box = h('div', { class: 'col' });
    const inp = h('input', { type: 'text', dir: 'ltr', placeholder: 'رابط القناة أو ‎@المعرّف' });
    const add = h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
      if (!inp.value.trim()) return;
      add.disabled = true;
      try {
        const r = await resolveChannel(inp.value);
        if (!list.some((x) => x.channel_id === r.channel_id)) list.push({ channel_id: r.channel_id, title: r.title, thumb: r.thumb || '' });
        inp.value = ''; draw();
      } catch (e) { CK.toast(CK.errMsg(e)); }
      add.disabled = false;
    } }, 'إضافة');
    const rows = h('div', { class: 'col' });
    const draw = () => rows.replaceChildren(...list.map((y, i) => h('div', { class: 'item' },
      y.thumb ? h('img', { src: y.thumb, width: 36, height: 36, style: 'border-radius:50%' }) : h('span', { class: 'avatar' }, '▶️'),
      h('span', { class: 'grow' }, y.title || y.channel_id),
      h('button', { class: 'iconbtn', type: 'button', onclick: () => { list.splice(i, 1); draw(); } }, '🗑'))));
    draw();
    box.append(h('div', { class: 'small muted' }, 'تُضاف هذه القنوات إلى قنوات يوتيوب المسموحة للطفل عند تطبيق القالب.'),
      rows, h('div', { class: 'row' }, h('div', { class: 'grow' }, inp), add));
    return box;
  }

  // ---------- محرر القالب ----------
  // onSave(row) يحفظ ويرمي خطأ عند الفشل
  function editor(tpl, { heading, onSave }) {
    tpl = { title: '', description: '', goals: '', duration_months: 6, age_min: 6, age_max: 10, items: [], channels: [], ...(tpl || {}) };
    const items = (tpl.items || []).map((x) => ({ ...x }));
    const channels = (tpl.channels || []).filter((x) => x && x.channel_id).map((x) => ({ ...x }));
    const f = {
      title: h('input', { type: 'text', value: tpl.title, maxlength: 80, placeholder: 'مثال: خطة التأسيس العقدي' }),
      description: h('textarea', { value: tpl.description, rows: 3, placeholder: 'وصف مختصر يظهر في المكتبة' }),
      goals: h('textarea', { value: tpl.goals, rows: 4, placeholder: 'هدف في كل سطر' }),
      months: h('input', { type: 'number', min: 1, max: 120, value: tpl.duration_months }),
      amin: h('input', { type: 'number', min: 2, max: 18, value: tpl.age_min }),
      amax: h('input', { type: 'number', min: 2, max: 18, value: tpl.age_max }),
    };
    const list = h('div', { class: 'col' });
    const draw = () => {
      items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
      list.replaceChildren(...(items.length ? items.map((it, i) => h('div', { class: 'item' }, ...itemLine(it),
        h('button', { class: 'iconbtn', type: 'button', onclick: () => itemDialog(it, (row) => { items[i] = row; draw(); }) }, '✏️'),
        h('button', { class: 'iconbtn', type: 'button', onclick: () => { items.splice(i, 1); draw(); } }, '🗑')))
        : [h('p', { class: 'muted small' }, 'لا عناصر بعد. أضف مهامًا وفوائد من القائمة أدناه.')]));
    };
    const add = h('select', { onchange: (e) => {
      const k = e.target.value; e.target.value = '';
      if (k) itemDialog({ kind: k }, (row) => { items.push(row); draw(); });
    } }, h('option', { value: '' }, '＋ إضافة عنصر…'), ...ORDER.map((k) => h('option', { value: k }, `${ALL[k].ic} ${ALL[k].name}`)));
    draw();
    const collect = () => ({ title: f.title.value.trim(), description: f.description.value.trim(), goals: f.goals.value.trim(),
      duration_months: Math.max(1, Math.min(120, +f.months.value || 1)),
      age_min: Math.max(2, Math.min(18, +f.amin.value || 2)), age_max: Math.max(2, Math.min(18, +f.amax.value || 18)), items, channels });
    return modal(heading || (tpl.id ? 'تعديل القالب' : 'قالب جديد'), [
      field('عنوان القالب', f.title), field('الوصف', f.description), field('الأهداف', f.goals),
      h('div', { class: 'row wrap' }, field('المدة بالأشهر', f.months), field('العمر من', f.amin), field('إلى', f.amax)),
      h('h2', {}, 'محتوى القالب'), list, add,
      h('h2', {}, '📺 قنوات يوتيوب'), channelsBox(channels),
    ], { okText: 'حفظ القالب', extra: h('button', { class: 'btn plain', type: 'button', title: 'حفظ القالب كملف JSON', onclick: () => exportFile(collect()) }, '📤 تصدير'),
    onOk: async () => {
      const row = collect();
      if (!row.title) throw new Error('اكتب عنوان القالب');
      if (row.age_min > row.age_max) [row.age_min, row.age_max] = [row.age_max, row.age_min];
      if (!items.some((x) => !isBreak(x.kind))) throw new Error('أضف مهمة واحدة على الأقل');
      await onSave(row);
    } });
  }

  // ---------- عرض القالب ----------
  function summary(t) {
    const c = {}; for (const it of t.items || []) c[it.kind] = (c[it.kind] || 0) + 1;
    const ch = (t.channels || []).length;
    return [...ORDER.filter((k) => c[k]).map((k) => `${ALL[k].ic} ${c[k]}`), ch ? `📺 ${ch}` : null].filter(Boolean).join('  ');
  }
  function details(t) {
    const groups = ORDER.map((k) => [k, (t.items || []).filter((x) => x.kind === k)]).filter(([, a]) => a.length);
    return [
      h('div', { class: 'row wrap' }, h('span', { class: 'tag' }, '⏳ ' + durText(t.duration_months)), h('span', { class: 'tag' }, '👦 ' + ageText(t))),
      t.description ? h('p', {}, t.description) : null,
      t.goals ? h('div', { class: 'card soft' }, h('b', {}, '🎯 الأهداف'), h('ul', { style: 'margin:6px 0 0;padding-inline-start:20px' }, t.goals.split('\n').filter((x) => x.trim()).map((g) => h('li', {}, g.trim())))) : null,
      ...groups.map(([k, arr]) => h('div', { class: 'col' }, h('b', {}, `${ALL[k].ic} ${ALL[k].name} (${arr.length})`), arr.map((it) => h('div', { class: 'item' }, ...itemLine(it))))),
      (t.channels || []).length ? h('div', { class: 'col' }, h('b', {}, `📺 قنوات يوتيوب (${t.channels.length})`),
        t.channels.map((y) => h('div', { class: 'item' },
          y.thumb ? h('img', { src: y.thumb, width: 36, height: 36, style: 'border-radius:50%' }) : h('span', { class: 'avatar' }, '▶️'),
          h('span', { class: 'grow' }, y.title || y.channel_id)))) : null,
    ];
  }

  // ---------- تطبيق قالب على طفل ----------
  const TASK_KEYS = ['kind', 'title', 'body', 'split', 'unit_size', 'reward_min', 'questions', 'config'];
  async function apply(t, child, { replace }) {
    const { sb, q } = CK;
    const tasks = (t.items || []).filter((x) => !isBreak(x.kind));
    const breaks = (t.items || []).filter((x) => isBreak(x.kind));
    if (replace) await q(sb.from('tasks').update({ active: false }).eq('child_id', child.id).eq('active', true));
    if (tasks.length) {
      await q(sb.from('tasks').insert(tasks.map((it, i) => {
        const row = { split: 'line', unit_size: 1, body: '', questions: [], config: {}, reward_min: 30 };
        for (const k of TASK_KEYS) if (it[k] !== undefined) row[k] = it[k];
        return { ...row, family_id: child.family_id, child_id: child.id, sort: i, progress: 0, active: true };
      })));
    }
    if (breaks.length) {
      const have = new Set((await q(sb.from('break_items').select('body'))).map((b) => b.body));
      const add = breaks.filter((b) => !have.has(b.body));
      if (add.length) await q(sb.from('break_items').insert(add.map((b) => ({ kind: b.kind, title: b.title || '', body: b.body, options: b.options || [], answer: b.answer ?? null, family_id: child.family_id }))));
    }
    const chans = (t.channels || []).filter((y) => /^UC[\w-]{22}$/.test(y.channel_id || ''));
    if (chans.length) {
      await q(sb.from('yt_channels').upsert(chans.map((y) => ({ family_id: child.family_id, child_id: child.id, channel_id: y.channel_id, title: y.title || '', thumb: y.thumb || null })),
        { onConflict: 'child_id,channel_id', ignoreDuplicates: true }));
    }
    await q(sb.from('children').update({ plan: { template_id: t.id || null, title: t.title, months: t.duration_months, started: CK.dayStr() } }).eq('id', child.id));
  }

  // ---------- خطة عشوائية من المكتبة ----------
  const PICK = { main: 2, quran: 1, matn: 1, chore: 2, draw: 1, reading: 2, puzzle: 2, fact: 3, question: 3, story: 2 };
  function random(templates, age) {
    const fit = templates.filter((t) => age >= t.age_min && age <= t.age_max);
    const src = fit.length ? fit : templates;
    const pool = {};
    for (const t of src) for (const it of t.items || []) {
      const key = it.kind + '|' + it.title + '|' + (it.body || '').slice(0, 40);
      (pool[it.kind] ||= new Map()).set(key, it);
    }
    const items = [];
    for (const k of ORDER) items.push(...CK.shuffle([...(pool[k]?.values() || [])]).slice(0, PICK[k]).map((x) => ({ ...x })));
    const months = Math.max(1, Math.round(src.reduce((s, t) => s + t.duration_months, 0) / Math.max(1, src.length)));
    return {
      id: null, title: `خطة متنوعة لعمر ${age} سنوات`, duration_months: months, age_min: age, age_max: age,
      description: 'خطة اختارها النظام عشوائيًا من مكتبة القوالب بما يناسب العمر. يمكنك إعادة التوليد حتى ترضيك.',
      goals: 'حفظ ميسّر من القرآن أو المتون\nعادات يومية ومهام منزلية\nقراءة وفهم وألعاب ذهنية\nفوائد قصيرة بين أوقات اللعب',
      items, channels: CK.shuffle([...new Map(src.flatMap((t) => t.channels || []).map((y) => [y.channel_id, y])).values()]).slice(0, 4),
    };
  }

  // ---------- الاستيراد والتصدير (ملف JSON يولّده أي نموذج ذكاء اصطناعي بالمهارة) ----------
  const FORMAT = 'contkid-template/1';
  const SKILL_URL = '../skills/contkid-template/SKILL.md';
  const str = (v, max) => (Array.isArray(v) ? v.join('\n') : v == null ? '' : String(v)).replace(/\r/g, '').trim().slice(0, max);
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  // سؤال اختيار من متعدد: يقبل answer رقمًا (من 0) أو نص الإجابة الصحيحة
  function normQ(x) {
    if (!x || typeof x !== 'object') return null;
    const q = str(x.q ?? x.question, 300), options = (Array.isArray(x.options) ? x.options : []).map((o) => str(o, 150)).filter(Boolean).slice(0, 4);
    let answer = typeof x.answer === 'string' && !/^\d+$/.test(x.answer) ? options.indexOf(x.answer.trim()) : int(x.answer, -1, 99, -1);
    if (!q || options.length < 2 || answer < 0 || answer >= options.length) return null;
    return { q, options, answer };
  }
  function normItem(x, warn) {
    const kind = String(x?.kind || '').trim();
    if (!ALL[kind]) { warn(`نوع غير معروف «${kind || '؟'}» فتُرك`); return null; }
    const title = str(x.title, kind === 'main' ? 80 : 80), body = str(x.body ?? x.text, 60000);
    const name = title || ALL[kind].name;
    if (isBreak(kind)) {
      const row = { kind, title: str(x.title, 60), body: str(x.body ?? x.text, 2000), options: [], answer: null };
      if (!row.body) { warn(`${name}: بلا نص فتُرك`); return null; }
      if (kind === 'question') {
        const qq = normQ({ q: row.body, options: x.options, answer: x.answer });
        if (!qq) { warn(`${name}: السؤال يحتاج خيارين وإجابة صحيحة فتُرك`); return null; }
        row.options = qq.options; row.answer = qq.answer;
      }
      return row;
    }
    if (!title) { warn(`${ALL[kind].name}: بلا عنوان فتُرك`); return null; }
    const c = x.config && typeof x.config === 'object' ? x.config : {};
    const quick = ['reading', 'puzzle'].includes(kind);
    const row = { kind, title, body, split: x.split === 'sentence' && kind === 'matn' ? 'sentence' : 'line',
      unit_size: int(x.unit_size, 1, kind === 'draw' ? 10 : 50, kind === 'draw' ? 2 : 3),
      reward_min: kind === 'main' ? 30 : int(x.reward_min, 5, 180, quick ? 15 : 30), questions: [], config: {} };
    const qs = (Array.isArray(x.questions) ? x.questions : []).map(normQ);
    if (qs.some((v) => !v)) warn(`${title}: حُذفت أسئلة ناقصة (تحتاج خيارين وإجابة صحيحة)`);
    const questions = qs.filter(Boolean);
    const quiz = (min) => { row.questions = questions; row.config.quiz_size = Math.min(int(c.quiz_size, 1, 10, 3), questions.length); return questions.length >= min; };
    let yt = null;
    if (c.yt || c.video || x.video) {
      const v = c.yt || c.video || x.video, url = typeof v === 'string' ? v : v.url || v.id || '';
      const id = /^[\w-]{11}$/.test(url) ? url : CK.ytId(url);
      if (id) { yt = { id }; const s = CK.parseTime(String(v.start ?? '')), e = CK.parseTime(String(v.end ?? '')); if (s > 0) yt.start = s; if (e > 0 && e > (s || 0)) yt.end = e; }
      else warn(`${title}: رابط المقطع غير صحيح فتُرك المقطع`);
    }
    if (['quran', 'matn', 'draw'].includes(kind) && !CK.splitUnits(body, 'line').length) { warn(`${title}: بلا نص فتُرك`); return null; }
    if (['quran', 'matn'].includes(kind) && int(c.words, 0, 500, 0) > 0) row.config.words = int(c.words, 0, 500, 0);
    if (kind === 'draw') row.config.mode = c.mode === 'free' ? 'free' : 'trace';
    if (kind === 'reading') {
      if (yt) row.config.yt = yt;
      if (!body && !yt) { warn(`${title}: القراءة تحتاج نصًا أو مقطعًا فتُركت`); return null; }
      if (!quiz(1)) { warn(`${title}: القراءة تحتاج أسئلة فتُركت`); return null; }
    }
    if (kind === 'main' && yt) { row.config.yt = yt; if (!quiz(1)) { warn(`${title}: لا أسئلة على المقطع فتُرك المقطع`); row.config = {}; row.questions = []; } }
    if (kind === 'puzzle') {
      const type = ['math', 'memory', 'riddle'].includes(c.type) ? c.type : questions.length ? 'riddle' : 'math';
      row.config = { type, level: int(c.level, 1, 3, 1), quiz_size: 3 };
      if (type === 'riddle' && !quiz(1)) { warn(`${title}: الألغاز تحتاج أسئلة فتُركت`); return null; }
    }
    return row;
  }
  // القناة: معرّف UC… أو ‎@handle أو رابط؛ تُتحقق لاحقًا عبر resolveChannels
  function normChannel(y) {
    if (typeof y === 'string') return { input: y.trim(), title: '' };
    if (!y || typeof y !== 'object') return null;
    const input = String(y.channel_id || y.handle || y.url || '').trim();
    return input ? { input, title: str(y.title || y.name, 100) } : null;
  }
  function normTemplate(raw, warn) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('القالب يجب أن يكون كائن JSON');
    const t = { title: str(raw.title, 80), description: str(raw.description, 2000), goals: str(raw.goals, 3000),
      duration_months: int(raw.duration_months, 1, 120, 1), age_min: int(raw.age_min, 2, 18, 4), age_max: int(raw.age_max, 2, 18, 12) };
    if (t.age_min > t.age_max) [t.age_min, t.age_max] = [t.age_max, t.age_min];
    if (!t.title) throw new Error('القالب بلا عنوان (title)');
    const w = (m) => warn(`«${t.title}»: ${m}`);
    t.items = (Array.isArray(raw.items) ? raw.items : []).map((x) => normItem(x, w)).filter(Boolean);
    if (!t.items.some((x) => !isBreak(x.kind))) throw new Error(`«${t.title}»: لا توجد مهمة صالحة واحدة`);
    t.channels = (Array.isArray(raw.channels) ? raw.channels : []).map(normChannel).filter(Boolean).slice(0, 20);
    return t;
  }
  // يقبل النص كما يخرجه النموذج: مع ```json أو كلام قبله وبعده؛ كائن قالب، أو مصفوفة، أو { templates: [...] }
  function parseImport(text) {
    const s = String(text || ''), a = s.search(/[[{]/), b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (a < 0 || b < a) throw new Error('لم أجد محتوى JSON في النص');
    let data;
    try { data = JSON.parse(s.slice(a, b + 1)); } catch (e) { throw new Error('النص ليس JSON صالحًا: ' + e.message); }
    const list = Array.isArray(data) ? data : Array.isArray(data.templates) ? data.templates : [data];
    if (!list.length) throw new Error('الملف لا يحتوي قوالب');
    const warnings = [];
    return { templates: list.slice(0, 30).map((x) => normTemplate(x, (m) => warnings.push(m))), warnings };
  }
  // التحقق من القنوات وجلب أسمائها وصورها؛ ما لا يوجد يُحذف مع ملاحظة
  async function resolveChannels(t, warn) {
    const out = [];
    for (const y of t.channels) {
      try {
        const r = await resolveChannel(y.input);
        if (!out.some((x) => x.channel_id === r.channel_id)) out.push({ channel_id: r.channel_id, title: r.title || y.title, thumb: r.thumb || '' });
      } catch { warn(`«${t.title}»: لم أجد القناة «${y.title || y.input}» فحُذفت`); }
    }
    t.channels = out;
  }
  function exportFile(t) {
    const data = { format: FORMAT, title: t.title, description: t.description || '', goals: t.goals || '', duration_months: t.duration_months,
      age_min: t.age_min, age_max: t.age_max, items: t.items || [], channels: (t.channels || []).map(({ channel_id, title }) => ({ channel_id, title })) };
    const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })),
      download: (t.title || 'قالب').replace(/[\\/:*?"<>|]/g, '').slice(0, 60) + '.json' });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function copySkill() {
    try {
      const r = await fetch(SKILL_URL, { cache: 'no-cache' }); if (!r.ok) throw new Error();
      await navigator.clipboard.writeText(await r.text());
      CK.toast('نُسخت التعليمات ✅ الصقها في محادثة الذكاء الاصطناعي ثم اطلب الخطة');
    } catch { window.open(SKILL_URL, '_blank'); CK.toast('تعذر النسخ تلقائيًا، فُتح الملف لتنسخه'); }
  }
  // onSave(row) كما في المحرر؛ قالب واحد يُفتح في المحرر للمراجعة، وعدة قوالب تُحفظ مباشرة بعد التأكيد
  function importDialog({ onSave }) {
    const text = h('textarea', { rows: 8, dir: 'ltr', placeholder: '{ "format": "contkid-template/1", "title": "…", "items": [ … ] }', style: 'font-family:monospace;font-size:.85rem' });
    const file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', onchange: async (e) => {
      const fl = e.target.files[0]; if (fl) text.value = await fl.text();
    } });
    return modal('📥 استيراد قالب', [
      h('div', { class: 'card soft' }, h('ol', { class: 'small', style: 'margin:0;padding-inline-start:20px;line-height:1.9' },
        h('li', {}, 'انسخ تعليمات الذكاء الاصطناعي والصقها في أي نموذج (Claude أو ChatGPT أو Gemini).'),
        h('li', {}, 'اطلب منه الخطة، مثل: «خطة 3 أشهر لعمر 6 سنوات فيها حفظ جزء من القرآن وكتابة الحروف، مع قنوات يوتيوب مناسبة».'),
        h('li', {}, 'الصق الناتج هنا أو اختر الملف، ثم راجع القالب واحفظه.')),
        h('div', { class: 'row wrap', style: 'margin-top:8px' },
          h('button', { class: 'btn ghost sm', type: 'button', onclick: copySkill }, '📋 نسخ تعليمات الذكاء الاصطناعي'),
          h('a', { class: 'btn plain sm', href: SKILL_URL, download: 'SKILL.md' }, '⬇️ تنزيل ملف المهارة'))),
      field('اختر ملفًا', file), field('أو الصق النص', text),
    ], { okText: 'استيراد', onOk: async () => {
      const { templates, warnings } = parseImport(text.value);
      for (const t of templates) await resolveChannels(t, (m) => warnings.push(m));
      setTimeout(async () => {
        if (warnings.length) await modal('ملاحظات الاستيراد', h('ul', { class: 'small', style: 'padding-inline-start:20px' }, warnings.slice(0, 40).map((m) => h('li', {}, m))), { okText: 'متابعة', onOk: () => true });
        if (templates.length === 1) return editor(templates[0], { heading: 'مراجعة القالب المستورد', onSave });
        if (!(await CK.confirmBox(`حفظ ${templates.length} قوالب؟\n` + templates.map((t) => '• ' + t.title).join('\n'), 'حفظ الكل'))) return;
        for (const t of templates) await CK.run(() => onSave(t));
      });
    } });
  }

  return { BK, ALL, ORDER, FORMAT, isBreak, durText, ageText, qEditor, taskForm, breakForm, editor, summary, details, apply, random,
    parseImport, importDialog, exportFile };
})();
