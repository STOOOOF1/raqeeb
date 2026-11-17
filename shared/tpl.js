'use strict';
// القوالب (خطط جاهزة): نماذج تحرير المهام والقوالب — مشتركة بين تطبيق الوالدين والإدارة المركزية —
// وعرض القالب، وتطبيقه على طفل، وتوليد خطة عشوائية.
const TPL = (() => {
  const { h, modal, KINDS } = CK;
  const field = (label, input) => h('label', { class: 'f' }, label, input);
  const BK = { fact: { name: 'فائدة', ic: '💡' }, question: { name: 'سؤال فاصل', ic: '❓' }, story: { name: 'قصة قصيرة', ic: '📗' } };
  const ALL = { ...KINDS, ...BK };
  const isBreak = (k) => k in BK;
  const ORDER = ['main', 'quran', 'matn', 'chore', 'reading', 'puzzle', 'fact', 'question', 'story'];
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
    };
    const qe = qEditor(t.questions);
    const info = h('div', { class: 'small muted' });
    const unitName = kind === 'quran' ? 'آية' : 'وحدة';
    let progress = t.progress || 0;
    const upd = () => {
      const split = kind === 'quran' ? 'line' : f.split.value;
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

    const body = [field(kind === 'main' ? 'المهمة' : 'عنوان المهمة', f.title)];
    if (kind === 'main') body.push(field('تفصيل (اختياري)', f.body));
    if (kind === 'quran') body.push(field('الآيات (كل آية في سطر)', f.body), secHint, field('أقصى عدد آيات في الجلسة', f.unit), field('حد الكلمات في الجلسة (0 = بلا حد)', f.words), info);
    if (kind === 'matn') body.push(field('نوع المتن', f.split), field('نص المتن', f.body), secHint, field('أقصى عدد أبيات أو جمل في الجلسة', f.unit), field('حد الكلمات في الجلسة (0 = بلا حد)', f.words), info);
    if (kind === 'chore') body.push(field('وصف المهمة (اختياري)', f.body));
    if (kind === 'reading') body.push(field('النص المطلوب قراءته', f.body), h('b', {}, 'بنك الأسئلة (يُفضّل أكثر من عدد أسئلة الاختبار لتتغير عند الإعادة)'), qe.el, field('عدد أسئلة كل اختبار', f.quiz));
    if (kind === 'puzzle') body.push(field('نوع اللعبة', f.ptype), levelBox, riddleBox);
    if (kind !== 'main') body.push(field('مدة الفتح بالدقائق', f.reward));
    if (opts.allowReset && ['quran', 'matn'].includes(kind) && progress > 0) {
      body.push(h('button', { class: 'btn plain sm', type: 'button', onclick: (e) => { progress = 0; e.target.textContent = 'سيبدأ من الأول عند الحفظ'; upd(); } }, '↺ إعادة الحفظ من البداية'));
    }
    upd(); updPuzzle();

    const get = () => {
      const row = { kind, title: f.title.value.trim(), body: f.body.value.trim(), split: kind === 'quran' ? 'line' : f.split.value,
        unit_size: Math.max(1, +f.unit.value || 1), reward_min: kind === 'main' ? 30 : Math.max(5, +f.reward.value || 15), questions: [], config: {}, progress };
      if (!row.title) throw new Error('اكتب عنوان المهمة');
      if (['quran', 'matn'].includes(kind)) {
        if (!CK.splitUnits(row.body, row.split).length) throw new Error('اكتب النص المطلوب حفظه');
        if (+f.words.value > 0) row.config = { words: +f.words.value };
      }
      if (kind === 'reading') {
        row.questions = qe.get(); row.config = { quiz_size: Math.max(1, +f.quiz.value || 3) };
        if (!row.body) throw new Error('اكتب نص القراءة');
        if (row.questions.length < row.config.quiz_size) throw new Error(`أضف ${row.config.quiz_size} أسئلة على الأقل`);
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
    } else if (it.kind === 'reading' || (it.kind === 'puzzle' && it.config?.type === 'riddle')) sub = `${(it.questions || []).length} سؤال`;
    else if (isBreak(it.kind)) sub = it.body.slice(0, 70);
    else if (it.body) sub = it.body.slice(0, 70);
    return [h('span', { class: 'avatar' }, ALL[it.kind].ic),
      h('div', { class: 'grow' }, h('div', {}, it.title || ALL[it.kind].name), sub ? h('div', { class: 'small muted' }, sub) : null)];
  };

  // ---------- محرر القالب ----------
  // onSave(row) يحفظ ويرمي خطأ عند الفشل
  function editor(tpl, { heading, onSave }) {
    tpl = { title: '', description: '', goals: '', duration_months: 6, age_min: 6, age_max: 10, items: [], ...(tpl || {}) };
    const items = (tpl.items || []).map((x) => ({ ...x }));
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
    return modal(heading || (tpl.id ? 'تعديل القالب' : 'قالب جديد'), [
      field('عنوان القالب', f.title), field('الوصف', f.description), field('الأهداف', f.goals),
      h('div', { class: 'row wrap' }, field('المدة بالأشهر', f.months), field('العمر من', f.amin), field('إلى', f.amax)),
      h('h2', {}, 'محتوى القالب'), list, add,
    ], { okText: 'حفظ القالب', onOk: async () => {
      const row = { title: f.title.value.trim(), description: f.description.value.trim(), goals: f.goals.value.trim(),
        duration_months: Math.max(1, Math.min(120, +f.months.value || 1)),
        age_min: Math.max(2, Math.min(18, +f.amin.value || 2)), age_max: Math.max(2, Math.min(18, +f.amax.value || 18)), items };
      if (!row.title) throw new Error('اكتب عنوان القالب');
      if (row.age_min > row.age_max) [row.age_min, row.age_max] = [row.age_max, row.age_min];
      if (!items.some((x) => !isBreak(x.kind))) throw new Error('أضف مهمة واحدة على الأقل');
      await onSave(row);
    } });
  }

  // ---------- عرض القالب ----------
  function summary(t) {
    const c = {}; for (const it of t.items || []) c[it.kind] = (c[it.kind] || 0) + 1;
    return ORDER.filter((k) => c[k]).map((k) => `${ALL[k].ic} ${c[k]}`).join('  ');
  }
  function details(t) {
    const groups = ORDER.map((k) => [k, (t.items || []).filter((x) => x.kind === k)]).filter(([, a]) => a.length);
    return [
      h('div', { class: 'row wrap' }, h('span', { class: 'tag' }, '⏳ ' + durText(t.duration_months)), h('span', { class: 'tag' }, '👦 ' + ageText(t))),
      t.description ? h('p', {}, t.description) : null,
      t.goals ? h('div', { class: 'card soft' }, h('b', {}, '🎯 الأهداف'), h('ul', { style: 'margin:6px 0 0;padding-inline-start:20px' }, t.goals.split('\n').filter((x) => x.trim()).map((g) => h('li', {}, g.trim())))) : null,
      ...groups.map(([k, arr]) => h('div', { class: 'col' }, h('b', {}, `${ALL[k].ic} ${ALL[k].name} (${arr.length})`), arr.map((it) => h('div', { class: 'item' }, ...itemLine(it))))),
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
    await q(sb.from('children').update({ plan: { template_id: t.id || null, title: t.title, months: t.duration_months, started: CK.dayStr() } }).eq('id', child.id));
  }

  // ---------- خطة عشوائية من المكتبة ----------
  const PICK = { main: 2, quran: 1, matn: 1, chore: 2, reading: 2, puzzle: 2, fact: 3, question: 3, story: 2 };
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
      items,
    };
  }

  return { BK, ALL, ORDER, isBreak, durText, ageText, qEditor, taskForm, breakForm, editor, summary, details, apply, random };
})();
