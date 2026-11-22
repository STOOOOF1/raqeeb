'use strict';
// «رحلاتنا»: نماذج تفاعلية يعدّها الوالد ويجيب عنها الطفل، وألعاب عائلية يلعبها أفراد الأسرة معًا.
// مشترك بين تطبيق الوالدين وواجهة الطفل. ctx = {role: 'parent'|'kid', me, overlay(title)->body, close()}
const TRIPS = (() => {
  const { sb, h, toast, run, q, modal, confirmBox } = CK;

  // ---------- أنواع عناصر الرحلة ----------
  const KINDS = {
    choice: { ic: '❓', name: 'سؤال اختياري', hint: 'يختار الطفل الإجابة من خيارات، ويُصحَّح تلقائيًا.' },
    open: { ic: '✍️', name: 'سؤال مفتوح', hint: 'يجيب الطفل كتابةً أو بتسجيل صوته. يمكنك تسجيل السؤال بصوتك.' },
    video: { ic: '🎬', name: 'فيديو', hint: 'رابط يوتيوب أو ملف فيديو يشاهده الطفل داخل التطبيق.' },
    game: { ic: '🎲', name: 'لعبة عائلية', hint: 'لعبة جماعية يدخلها الطفل من الرحلة ويلعبها مع أفراد الأسرة.' },
  };
  const REPLY = [['any', 'كتابة أو صوت (يختار الطفل)'], ['text', 'كتابة فقط'], ['voice', 'تسجيل صوتي فقط']];
  const GAMES = { ahnbj: { ic: '🔤', name: 'إنسان، حيوان، نبات، جماد، بلاد', short: 'إنسان حيوان نبات' } };
  const CATS = {
    human: { ic: '🧑', name: 'إنسان' }, animal: { ic: '🐪', name: 'حيوان' }, plant: { ic: '🌴', name: 'نبات' },
    thing: { ic: '🪑', name: 'جماد' }, country: { ic: '🗺️', name: 'بلاد' },
  };
  const rid = () => Math.random().toString(36).slice(2, 10);
  const answerable = (it) => it.kind !== 'game';
  const field = (label, input) => h('label', { class: 'f' }, label, input);

  // رابط الفيديو: يوتيوب أو ملف مباشر
  function videoOf(url) {
    const id = CK.ytId(url);
    if (id) return { yt: id, start: CK.ytStart(url) };
    const u = CK.siteUrl(url);
    if (u && /\.(mp4|webm|m4v|mov)(\?|$)/i.test(u)) return { file: u };
    return null;
  }
  function videoEl(url) {
    const v = videoOf(url);
    if (!v) return h('p', { class: 'muted small' }, 'رابط الفيديو غير صالح');
    if (v.file) return h('video', { src: v.file, controls: true, playsinline: true, style: 'width:100%;border-radius:14px;background:#000' });
    const p = new URLSearchParams({ rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3 });
    if (v.start) p.set('start', v.start);
    return h('div', { class: 'player' }, h('iframe', { src: `https://www.youtube-nocookie.com/embed/${v.yt}?${p}`, allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' }));
  }

  function summary(t) {
    const n = {};
    for (const it of t.items || []) n[it.kind] = (n[it.kind] || 0) + 1;
    const parts = Object.entries(n).map(([k, c]) => `${KINDS[k]?.ic || ''} ${c} ${KINDS[k]?.name || ''}`);
    return parts.length ? parts.join(' · ') : 'لا عناصر بعد';
  }

  // ---------- نافذة ملء الشاشة (للوالدين؛ الطفل يمرّر نافذته) ----------
  let ownEl = null;
  function ownOverlay(title) {
    ownClose();
    const body = h('div', { class: 'ob' });
    ownEl = h('div', { class: 'overlay' }, h('div', { class: 'oh' }, h('button', { class: 'iconbtn', onclick: ownClose }, '✕'), h('span', {}, title)), body);
    document.body.append(ownEl);
    return body;
  }
  function ownClose() { if (ownEl) { ownEl.remove(); ownEl = null; } live.clear(); }
  const scrollTop = (body) => { const o = body.closest('.overlay'); if (o) o.scrollTop = 0; };

  // ================= محرر الرحلة (الوالد) =================
  // children: أبناء الأسرة، curId: الطفل المختار، onSave(row)
  function editor(trip, { children, curId, familyId, onSave }) {
    const t = trip ? JSON.parse(JSON.stringify(trip)) : { title: '', description: '', items: [], child_id: curId || null, active: true };
    const title = h('input', { type: 'text', maxlength: 120, value: t.title, placeholder: 'مثال: رحلة إلى عالم البحار' });
    const desc = h('textarea', { rows: 2, maxlength: 1000, placeholder: 'مقدمة قصيرة تظهر للطفل (اختياري)' }, t.description || '');
    const who = h('select', {}, h('option', { value: '' }, 'كل الأبناء'),
      children.map((c) => h('option', { value: c.id, selected: c.id === t.child_id }, c.name)));
    if (!t.child_id) who.value = '';
    const list = h('div', { class: 'col' });

    const draw = () => {
      list.replaceChildren(...(t.items.length ? t.items.map((it, i) => itemBox(it, i)) : [h('p', { class: 'muted small' }, 'أضف عناصر الرحلة من الأزرار في الأسفل.')]));
    };
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= t.items.length) return; [t.items[i], t.items[j]] = [t.items[j], t.items[i]]; draw(); };

    function audioBox(it) {
      const box = h('div', { class: 'col', style: 'gap:6px' });
      const paint = () => {
        box.replaceChildren(it.audio
          ? h('div', { class: 'row' }, h('span', { class: 'small grow' }, '🎙 السؤال مسجّل بصوتك'), CK.audioPlayer(it.audio),
            h('button', { class: 'btn plain sm', type: 'button', onclick: () => { CK.removeAudio(it.audio); it.audio = null; paint(); } }, 'حذف'))
          : h('details', {}, h('summary', { class: 'small' }, '🎤 سجّل السؤال بصوتك (اختياري)'),
            CK.recordButton(async (blob) => {
              await run(async () => { it.audio = await CK.uploadAudio(blob, familyId, 'trips'); paint(); }, 'حُفظ التسجيل');
            }, '🎤 تسجيل السؤال')));
      };
      paint();
      return box;
    }

    function itemBox(it, i) {
      const K = KINDS[it.kind];
      const qIn = h('textarea', { rows: 2, maxlength: 2000, placeholder: it.kind === 'video' ? 'ماذا تريد أن يلاحظ في المقطع؟ (اختياري)' : it.kind === 'game' ? 'رسالة للطفل (اختياري)' : 'نص السؤال', oninput: (e) => { it.q = e.target.value; } }, it.q || '');
      const parts = [
        h('div', { class: 'row' }, h('b', { class: 'grow' }, `${i + 1}. ${K.ic} ${K.name}`),
          h('button', { class: 'iconbtn', type: 'button', title: 'لأعلى', onclick: () => move(i, -1) }, '↑'),
          h('button', { class: 'iconbtn', type: 'button', title: 'لأسفل', onclick: () => move(i, 1) }, '↓'),
          h('button', { class: 'iconbtn', type: 'button', title: 'حذف', onclick: () => { if (it.audio) CK.removeAudio(it.audio); t.items.splice(i, 1); draw(); } }, '🗑')),
      ];
      if (it.kind === 'choice') {
        it.options ||= ['', '', ''];
        const opts = h('div', { class: 'col', style: 'gap:6px' });
        const paintOpts = () => opts.replaceChildren(...it.options.map((o, k) => h('div', { class: 'row' },
          h('input', { type: 'radio', name: 'ans-' + it.id, checked: it.answer === k, title: 'الإجابة الصحيحة', style: 'width:20px;height:20px;accent-color:var(--ok)', onchange: () => { it.answer = k; } }),
          h('input', { type: 'text', class: 'grow', maxlength: 200, value: o, placeholder: 'الخيار ' + (k + 1), oninput: (e) => { it.options[k] = e.target.value; } }),
          it.options.length > 2 ? h('button', { class: 'iconbtn', type: 'button', onclick: () => {
            it.options.splice(k, 1); if (it.answer === k) it.answer = 0; else if (it.answer > k) it.answer--; paintOpts();
          } }, '✕') : null)),
        it.options.length < 6 ? h('button', { class: 'btn plain sm', type: 'button', onclick: () => { it.options.push(''); paintOpts(); } }, '＋ خيار') : null);
        it.answer ??= 0;
        paintOpts();
        parts.push(qIn, audioBox(it), h('div', { class: 'small muted' }, 'اختر الدائرة بجانب الإجابة الصحيحة:'), opts);
      } else if (it.kind === 'open') {
        const rep = h('select', { onchange: (e) => { it.reply = e.target.value; } }, REPLY.map(([v, n]) => h('option', { value: v, selected: (it.reply || 'any') === v }, n)));
        parts.push(qIn, audioBox(it), field('طريقة إجابة الطفل', rep));
      } else if (it.kind === 'video') {
        const url = h('input', { type: 'url', dir: 'ltr', value: it.url || '', placeholder: 'https://youtu.be/…', oninput: (e) => { it.url = e.target.value.trim(); } });
        parts.push(field('رابط الفيديو', url), qIn);
      } else if (it.kind === 'game') {
        const g = h('select', { onchange: (e) => { it.game = e.target.value; } }, Object.entries(GAMES).map(([k, v]) => h('option', { value: k, selected: it.game === k }, v.ic + ' ' + v.name)));
        it.game ||= 'ahnbj';
        parts.push(field('اللعبة', g), h('p', { class: 'small muted' }, 'يدخلها الطفل من الرحلة، فيبدأ لعبة جديدة أو ينضم للعبة قائمة. وتستطيع أنت اللعب معهم من تبويب «رحلاتنا».'), qIn);
      }
      return h('div', { class: 'qbox' }, parts);
    }

    draw();
    const add = h('div', { class: 'row wrap' }, Object.entries(KINDS).map(([k, v]) => h('button', { class: 'btn sm ghost', type: 'button', onclick: () => {
      t.items.push({ id: rid(), kind: k, ...(k === 'open' ? { reply: 'any' } : k === 'game' ? { game: 'ahnbj' } : {}) });
      draw();
      requestAnimationFrame(() => list.lastChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } }, `＋ ${v.ic} ${v.name}`)));

    return modal(trip ? 'تعديل الرحلة' : '🧭 رحلة جديدة', [
      field('عنوان الرحلة', title), field('المقدمة', desc), field('لمن هذه الرحلة؟', who),
      h('h3', { style: 'margin:6px 0 0' }, 'عناصر الرحلة'), list, add,
    ], { onOk: async () => {
      if (!title.value.trim()) throw new Error('اكتب عنوان الرحلة');
      for (const [i, it] of t.items.entries()) {
        const n = `العنصر ${i + 1}`;
        if ((it.kind === 'choice' || it.kind === 'open') && !(it.q || '').trim() && !it.audio) throw new Error(`${n}: اكتب السؤال أو سجّله بصوتك`);
        if (it.kind === 'choice') {
          it.options = it.options.map((o) => o.trim());
          if (it.options.filter(Boolean).length < 2) throw new Error(`${n}: أضف خيارين على الأقل`);
          if (!it.options[it.answer]) throw new Error(`${n}: حدّد الإجابة الصحيحة`);
          const keep = it.options.map((o, k) => [o, k]).filter(([o]) => o);
          it.answer = keep.findIndex(([, k]) => k === it.answer); it.options = keep.map(([o]) => o);
        }
        if (it.kind === 'video' && !videoOf(it.url)) throw new Error(`${n}: رابط الفيديو غير صالح (يوتيوب أو ملف mp4)`);
      }
      if (!t.items.length) throw new Error('أضف عنصرًا واحدًا على الأقل');
      await onSave({ title: title.value.trim(), description: desc.value.trim() || null, child_id: who.value || null, items: t.items });
    } });
  }

  // ================= إجابات الطفل (الوالد) =================
  function answerOf(answers, trip, childId, it) {
    return answers.find((a) => a.trip_id === trip.id && a.child_id === childId && a.item_id === it.id) || null;
  }
  function progress(trip, answers, childId) {
    const items = (trip.items || []).filter(answerable);
    const done = items.filter((it) => answerOf(answers, trip, childId, it)).length;
    return { done, total: items.length };
  }
  async function answersDialog(trip, child, answers, reload) {
    const rows = (trip.items || []).map((it, i) => {
      const a = answerOf(answers, trip, child.id, it), K = KINDS[it.kind];
      let ans;
      if (it.kind === 'game') ans = h('div', { class: 'small muted' }, 'لعبة عائلية: النتائج تظهر داخل اللعبة.');
      else if (!a) ans = h('span', { class: 'tag' }, 'لم يُجب بعد');
      else if (it.kind === 'choice') ans = h('div', {}, h('span', { class: 'tag ' + (a.correct ? 'ok' : 'bad') }, a.correct ? '✓ صحيحة' : '✗ خاطئة'), ' ',
        h('span', {}, it.options[a.choice] ?? '—'), a.correct ? null : h('div', { class: 'small muted' }, 'الصحيحة: ' + (it.options[it.answer] || '')));
      else if (it.kind === 'video') ans = h('span', { class: 'tag ok' }, '✓ شاهد المقطع');
      else ans = h('div', { class: 'col', style: 'gap:6px' }, a.body ? h('div', { class: 'reading', style: 'font-size:1rem' }, a.body) : null, a.audio_path ? CK.audioPlayer(a.audio_path) : null);
      return h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch' },
        h('div', { class: 'row' }, h('b', { class: 'grow' }, `${i + 1}. ${K.ic} ${it.q || (it.kind === 'video' ? 'فيديو' : K.name)}`),
          a && !a.seen_at && it.kind !== 'video' ? h('span', { class: 'tag pri' }, 'جديد') : null,
          a ? h('span', { class: 'small muted' }, CK.clock(a.updated_at || a.created_at)) : null),
        it.audio ? CK.audioPlayer(it.audio) : null, ans);
    });
    const p = progress(trip, answers, child.id);
    const unseen = answers.filter((a) => a.trip_id === trip.id && a.child_id === child.id && !a.seen_at);
    if (unseen.length) sb.from('trip_answers').update({ seen_at: new Date().toISOString() }).in('id', unseen.map((a) => a.id)).then(() => reload && reload());
    return modal(`إجابات ${child.name}: ${trip.title}`, [h('div', { class: 'small muted' }, `أجاب ${p.done} من ${p.total}`), ...rows]);
  }

  // ================= الطفل: الرحلة خطوة خطوة =================
  // ctx: {me, overlay, close, answers(): [], saved()}
  function openTrip(ctx, trip) {
    const body = ctx.overlay('🧭 ' + trip.title);
    const items = trip.items || [];
    const mine = () => ctx.answers().filter((a) => a.trip_id === trip.id);
    const ans = (it) => mine().find((a) => a.item_id === it.id) || null;
    const store = (row) => { const arr = ctx.answers(); const k = arr.findIndex((a) => a.id === row.id || (a.trip_id === row.trip_id && a.item_id === row.item_id)); if (k >= 0) arr[k] = row; else arr.push(row); };
    async function save(it, fields) {
      const old = ans(it);
      if (ctx.preview) { const row = { ...fields, id: rid(), trip_id: trip.id, item_id: it.id, kind: it.kind }; store(row); return row; } // معاينة الوالد: لا يُحفظ شيء
      const row = await q(sb.from('trip_answers').upsert({
        family_id: ctx.me.family_id, child_id: ctx.me.child_id, trip_id: trip.id, item_id: it.id, kind: it.kind,
        choice: null, correct: null, body: null, audio_path: null, ...fields, seen_at: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'child_id,trip_id,item_id' }).select().single());
      if (old?.audio_path && old.audio_path !== row.audio_path) CK.removeAudio(old.audio_path);
      store(row); ctx.saved && ctx.saved();
      return row;
    }

    const home = () => {
      const total = items.filter(answerable).length, done = items.filter((it) => answerable(it) && ans(it)).length;
      body.replaceChildren(
        h('div', { class: 'card soft' }, h('h2', { style: 'margin:0' }, trip.title), trip.description ? h('p', { class: 'reading', style: 'margin:0' }, trip.description) : null,
          total ? [h('div', { class: 'small' }, `أنجزت ${done} من ${total}`), h('div', { class: 'bar' }, h('i', { style: `width:${total ? Math.round(done / total * 100) : 0}%` }))] : null),
        ...items.map((it, i) => {
          const a = ans(it), K = KINDS[it.kind];
          const label = it.kind === 'game' ? (GAMES[it.game]?.name || 'لعبة') : it.kind === 'video' ? (it.q || 'شاهد المقطع') : (it.q || K.name);
          return h('button', { class: 'item card', style: 'text-align:start;cursor:pointer;flex-direction:row;border:0;font:inherit;color:inherit', onclick: () => step(i) },
            h('span', { class: 'avatar' }, it.kind === 'game' ? GAMES[it.game]?.ic || '🎲' : K.ic),
            h('div', { class: 'grow' }, h('div', { style: 'font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, label), h('div', { class: 'small muted' }, K.name)),
            it.kind === 'game' ? h('span', { class: 'tag pri' }, 'العب') : a ? h('span', { class: 'tag ok' }, '✓') : h('span', { class: 'tag' }, 'ابدأ'));
        }),
        items.length ? null : h('p', { class: 'muted center' }, 'لا يوجد شيء في هذه الرحلة بعد.'));
      scrollTop(body);
    };

    const nav = (i) => h('div', { class: 'row' },
      h('button', { class: 'btn plain grow', onclick: home }, '☰ كل الرحلة'),
      i < items.length - 1 ? h('button', { class: 'btn grow', onclick: () => step(i + 1) }, 'التالي ←') : h('button', { class: 'btn ok grow', onclick: home }, '🏁 إنهاء'));

    function step(i) {
      const it = items[i], K = KINDS[it.kind], a = ans(it);
      const head = h('div', { class: 'small muted' }, `${i + 1} من ${items.length} · ${K.ic} ${K.name}`);
      const prompt = h('div', { class: 'card' }, head, it.q ? h('h2', { style: 'margin:0;white-space:pre-line' }, it.q) : null, it.audio ? h('div', { class: 'row' }, h('span', { class: 'small' }, '🎧 استمع للسؤال:'), CK.audioPlayer(it.audio)) : null);
      const zone = h('div', { class: 'col' });
      body.replaceChildren(prompt, zone, nav(i));
      scrollTop(body);

      if (it.kind === 'choice') {
        const result = h('p', { class: 'center', style: 'margin:0;font-weight:700' });
        let locked = !!a;
        const opts = it.options.map((o, k) => h('button', { class: 'opt', onclick: async () => {
          if (locked) return;
          locked = true;
          const ok = k === it.answer;
          opts[k].classList.add(ok ? 'good' : 'wrong'); if (!ok) opts[it.answer]?.classList.add('good');
          result.textContent = ok ? 'إجابة صحيحة، أحسنت! 🌟' : 'الإجابة الصحيحة مظللة بالأخضر';
          if (ok) CK.beep();
          if (!(await run(() => save(it, { choice: k, correct: ok })))) { locked = false; opts.forEach((b) => b.classList.remove('good', 'wrong')); result.textContent = ''; return; }
          retry.classList.remove('hidden');
        } }, o));
        const retry = h('button', { class: 'btn plain sm hidden', onclick: () => step(i) }, '↺ حاول مرة أخرى');
        if (a) {
          opts[a.choice]?.classList.add(a.correct ? 'good' : 'wrong'); if (!a.correct) opts[it.answer]?.classList.add('good');
          result.textContent = a.correct ? 'أجبت إجابة صحيحة ✓' : 'الإجابة الصحيحة مظللة بالأخضر';
          retry.classList.remove('hidden');
          retry.onclick = () => { locked = false; opts.forEach((b) => b.classList.remove('good', 'wrong')); result.textContent = ''; retry.classList.add('hidden'); };
        }
        zone.append(h('div', { class: 'card' }, opts, result, retry));
      } else if (it.kind === 'open') {
        const reply = it.reply || 'any';
        const showAnswer = (row) => {
          zone.replaceChildren(h('div', { class: 'card soft' }, h('b', {}, '✓ أُرسلت إجابتك لوالديك'),
            row.body ? h('div', { class: 'reading' }, row.body) : null, row.audio_path ? CK.audioPlayer(row.audio_path) : null,
            h('button', { class: 'btn plain sm', onclick: () => form(row) }, '✏️ تعديل الإجابة')));
        };
        const form = (prev) => {
          const parts = [];
          if (reply !== 'voice') {
            const ta = h('textarea', { rows: 4, maxlength: 4000, placeholder: 'اكتب إجابتك هنا…' }, prev?.body || '');
            const send = h('button', { class: 'btn big ok block', onclick: async () => {
              if (!ta.value.trim()) return toast('اكتب إجابتك أولًا');
              send.disabled = true;
              const okk = await run(async () => showAnswer(await save(it, { body: ta.value.trim() })), 'أُرسلت إجابتك 🌟');
              if (!okk) send.disabled = false;
            } }, '📤 إرسال الإجابة');
            parts.push(h('div', { class: 'card' }, reply === 'any' ? h('b', {}, '✍️ اكتب إجابتك') : null, ta, send));
          }
          if (reply !== 'text') {
            const rec = h('div', { class: 'col' });
            const idle = () => rec.replaceChildren(CK.recordButton((blob) => review(blob), reply === 'any' ? '🎤 أو أجب بصوتك' : '🎤 سجّل إجابتك'));
            const review = (blob) => {
              const send = h('button', { class: 'btn big ok block', onclick: async () => {
                send.disabled = true; send.textContent = 'جارٍ الإرسال…';
                const okk = await run(async () => {
                  if (ctx.preview) return showAnswer(await save(it, { body: '🎤 (تسجيل صوتي — معاينة)' }));
                  const path = await CK.uploadAudio(blob, ctx.me.family_id, ctx.me.child_id);
                  showAnswer(await save(it, { audio_path: path }));
                }, 'أُرسلت إجابتك 🌟');
                if (!okk) { send.disabled = false; send.textContent = '📤 إرسال التسجيل'; }
              } }, '📤 إرسال التسجيل');
              rec.replaceChildren(h('audio', { controls: true, src: URL.createObjectURL(blob), style: 'width:100%' }), send,
                h('button', { class: 'btn plain block', onclick: idle }, '↺ إعادة التسجيل'));
            };
            idle();
            parts.push(h('div', { class: 'card' }, rec));
          }
          zone.replaceChildren(...parts);
        };
        if (a) showAnswer(a); else form(null);
      } else if (it.kind === 'video') {
        const done = h('button', { class: 'btn big ok block', disabled: !!a, onclick: async () => {
          done.disabled = true;
          if (await run(() => save(it, {}), 'أحسنت! 🌟')) done.textContent = '✓ شاهدت المقطع'; else done.disabled = false;
        } }, a ? '✓ شاهدت المقطع' : '✓ أنهيت المشاهدة');
        zone.append(videoEl(it.url), done);
      } else if (it.kind === 'game') {
        const G = GAMES[it.game] || GAMES.ahnbj;
        zone.append(h('div', { class: 'card center' }, h('div', { class: 'logo' }, G.ic), h('h2', {}, G.name),
          h('p', { class: 'small muted' }, 'لعبة جماعية مع أفراد أسرتك: يظهر حرف للجميع، وكل واحد يكتب اسمًا يبدأ به في الفئة التي تظهر له، ودقيقتان لكل حرف.'),
          h('button', { class: 'btn big block', onclick: () => hub(ctx, it.game || 'ahnbj', () => openTrip(ctx, trip)) }, '🎮 ادخل اللعبة')));
      }
    }
    home();
  }

  // ================= الألعاب العائلية =================
  // التحديث اللحظي: التطبيق يمرّر أحداث جداول الألعاب إلى TRIPS.onChange
  const live = new Map();
  const isGameTable = (t) => t === 'game_rooms' || t === 'game_players' || t === 'game_answers';
  function onChange(p) {
    if (!isGameTable(p.table)) return false;
    for (const fn of live.values()) fn(p);
    return true;
  }
  let offset = 0, offsetAt = 0;
  async function syncClock() {
    if (Date.now() - offsetAt < 300000) return;
    try { const t0 = Date.now(); const s = await q(sb.rpc('server_now')); offset = new Date(s).getTime() - (t0 + Date.now()) / 2; offsetAt = Date.now(); } catch { /* نعتمد ساعة الجهاز */ }
  }
  const srvNow = () => Date.now() + offset;
  const myUid = async () => (await sb.auth.getSession()).data.session?.user?.id;
  const rpc = (name, args) => q(sb.rpc(name, args));

  // قائمة الألعاب القائمة في الأسرة، مع بدء لعبة جديدة. back: للرجوع (اختياري)
  function hub(ctx, game, back) {
    const G = GAMES[game] || GAMES.ahnbj;
    const body = ctx.overlay(G.ic + ' ' + G.name);
    const list = h('div', { class: 'col' }, h('p', { class: 'muted center' }, 'جارٍ التحميل…'));
    const rounds = roundsPicker(3);
    const create = h('button', { class: 'btn big block', onclick: async () => {
      create.disabled = true;
      const ok = await run(async () => { const r = await rpc('game_create', { p_game: game, p_rounds: rounds.value() }); play(ctx, r.id, back); });
      if (!ok) create.disabled = false;
    } }, '＋ لعبة جديدة وأدعو الأسرة');
    body.append(
      h('div', { class: 'card soft' }, h('b', {}, 'كيف نلعب؟'),
        h('ol', { class: 'small', style: 'margin:0;padding-inline-start:18px;line-height:1.9' },
          h('li', {}, 'يبدأ أحدكم لعبة ويختار عدد الحروف، وينضم البقية من أجهزتهم.'),
          h('li', {}, 'يظهر حرف للجميع، ولكل لاعب فئة: إنسان أو حيوان أو نبات أو جماد أو بلاد.'),
          h('li', {}, 'اكتب اسمًا يبدأ بالحرف في فئتك، فتظهر لك فئة أخرى عشوائيًا… وهكذا لمدة دقيقتين.'),
          h('li', {}, 'الإجابة الفريدة 10 نقاط، والمكررة مع غيرك 5، وتظهر النتائج بعد كل حرف.'))),
      h('h3', { style: 'margin:4px 0 0' }, 'ألعاب قائمة الآن'), list,
      h('div', { class: 'card' }, h('h3', { style: 'margin:0' }, 'لعبة جديدة'), h('div', { class: 'row between' }, h('span', {}, 'عدد الحروف (الدورات)'), rounds.el), create),
      back ? h('button', { class: 'btn plain block', onclick: back }, '→ رجوع للرحلة') : null);
    const key = 'hub';
    const load = CK.debounce(async () => {
      if (!body.isConnected) return live.delete(key);
      try {
        const since = new Date(Date.now() - 6 * 3600e3).toISOString();
        const [rooms, uid] = await Promise.all([
          q(sb.from('game_rooms').select('*, game_players(user_id,name)').eq('game', game).in('status', ['lobby', 'playing', 'review']).gte('updated_at', since).order('created_at', { ascending: false })),
          myUid()]);
        list.replaceChildren(...(rooms.length ? rooms.map((r) => {
          const inIt = r.game_players.some((p) => p.user_id === uid);
          const names = r.game_players.map((p) => p.name).join('، ');
          return h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'avatar' }, G.ic),
            h('div', { class: 'grow' }, h('b', {}, 'لعبة ' + (r.host_name || '')), h('div', { class: 'small muted' }, `${r.status === 'lobby' ? 'في الانتظار' : `الحرف ${r.round} من ${r.rounds}`} · ${names}`)),
            inIt ? h('button', { class: 'btn sm ok', onclick: () => play(ctx, r.id, back) }, 'عودة')
              : r.status === 'lobby' ? h('button', { class: 'btn sm', onclick: () => run(async () => { await rpc('game_join', { p_room: r.id }); play(ctx, r.id, back); }) }, 'انضمام')
                : h('span', { class: 'tag' }, 'بدأت')));
        }) : [h('p', { class: 'muted small center' }, 'لا توجد ألعاب قائمة. ابدأ واحدة!')]));
      } catch (e) { list.replaceChildren(h('p', { class: 'muted small' }, CK.errMsg(e))); }
    }, 150);
    live.clear(); live.set(key, (p) => { if (p.table !== 'game_answers') load(); });
    load();
  }

  function roundsPicker(v) {
    const n = h('b', { style: 'min-width:2ch;text-align:center;font-size:1.2rem' }, String(v));
    const set = (x) => { v = Math.max(1, Math.min(15, x)); n.textContent = v; };
    const el = h('div', { class: 'row', style: 'gap:6px' },
      h('button', { class: 'btn plain sm', type: 'button', onclick: () => set(v - 1) }, '−'), n,
      h('button', { class: 'btn plain sm', type: 'button', onclick: () => set(v + 1) }, '＋'));
    return { el, value: () => v, set };
  }

  // شاشة اللعبة: الانتظار ← الدورة ← النتائج ← الحرف التالي ← النتيجة النهائية
  async function play(ctx, roomId, back) {
    const body = ctx.overlay('🔤 إنسان حيوان نبات جماد بلاد');
    body.append(h('p', { class: 'muted center' }, 'جارٍ التحميل…'));
    await syncClock();
    const uid = await myUid();
    const G = { room: null, players: [], answers: [], phaseKey: '', ending: 0, rounds: null };
    const key = 'room:' + roomId;
    const isParent = ctx.role === 'parent';
    const canControl = () => G.room && (G.room.host_id === uid || isParent);
    const me = () => G.players.find((p) => p.user_id === uid);

    const fetchAll = async () => {
      const [room, players, answers] = await Promise.all([
        q(sb.from('game_rooms').select('*').eq('id', roomId).single()),
        q(sb.from('game_players').select('*').eq('room_id', roomId).order('seat').order('joined_at')),
        q(sb.from('game_answers').select('*').eq('room_id', roomId).order('created_at')),
      ]);
      G.room = room; G.players = players; G.answers = answers;
    };
    const refresh = CK.debounce(async () => {
      if (!body.isConnected) return live.delete(key);
      try { await fetchAll(); draw(); } catch (e) { console.error(e); }
    }, 120);
    live.clear(); live.set(key, (p) => {
      const r = p.new || p.old || {};
      if ((p.table === 'game_rooms' ? r.id : r.room_id) === roomId) refresh();
    });
    try { await fetchAll(); } catch (e) { body.replaceChildren(h('p', {}, CK.errMsg(e))); return; }

    const leaveBtn = () => h('button', { class: 'btn plain block', onclick: async () => {
      if (G.room.status === 'lobby') await run(() => rpc('game_leave', { p_room: roomId }));
      live.delete(key);
      if (back) hub(ctx, G.room.game, back); else ctx.close();
    } }, G.room.status === 'lobby' && G.room.host_id === uid ? 'إلغاء اللعبة' : '← خروج');

    let timerEl = null, timer = null;
    function draw() {
      const r = G.room;
      // لا نعيد رسم شاشة الدورة الجارية (حتى لا يضيع ما يكتبه اللاعب)، بل نحدّث أجزاءها
      const pk = `${r.status}|${r.round}|${G.players.length}`;
      if (r.status === 'playing' && G.phaseKey === pk) return updatePlaying();
      G.phaseKey = pk;
      clearInterval(timer);
      if (r.status === 'lobby') return drawLobby();
      if (r.status === 'playing') return drawPlaying();
      if (r.status === 'review') return drawReview(false);
      if (r.status === 'done') return drawReview(true);
      body.replaceChildren(h('div', { class: 'card center' }, h('p', {}, 'أُلغيت هذه اللعبة.')), leaveBtn());
    }

    const playerRow = (p, extra) => h('div', { class: 'item' }, h('span', { class: 'avatar' }, p.role === 'parent' ? '👤' : '🧒'),
      h('div', { class: 'grow' }, h('b', {}, p.name + (p.user_id === uid ? ' (أنت)' : '')), p.user_id === G.room.host_id ? h('span', { class: 'small muted' }, ' · صاحب اللعبة') : null), extra);

    function drawLobby() {
      const r = G.room;
      G.rounds ||= roundsPicker(r.rounds);
      const inIt = !!me();
      body.replaceChildren(
        h('div', { class: 'card soft center' }, h('div', { style: 'font-size:2.4rem' }, '⏳'), h('h2', { style: 'margin:0' }, 'بانتظار اللاعبين'),
          h('p', { class: 'small', style: 'margin:0' }, 'يدخل أفراد الأسرة من «رحلاتنا» وينضمون لهذه اللعبة.')),
        h('div', { class: 'card' }, h('h3', { style: 'margin:0' }, `اللاعبون (${G.players.length})`), G.players.map((p) => playerRow(p))),
        canControl() ? h('div', { class: 'card' }, h('div', { class: 'row between' }, h('span', {}, 'عدد الحروف (الدورات)'), G.rounds.el),
          h('div', { class: 'small muted' }, 'كل دورة حرف واحد ومدتها دقيقتان.'),
          h('button', { class: 'btn big ok block', disabled: G.players.length < 2, onclick: () => run(() => rpc('game_start', { p_room: roomId, p_rounds: G.rounds.value() })) },
            G.players.length < 2 ? 'تحتاج لاعبَين على الأقل' : '▶ ابدأ المسابقة'))
          : h('div', { class: 'card center small muted' }, `ستُلعب ${r.rounds} حروف. ينتظر الجميع أن يبدأ ${r.host_name || 'صاحب اللعبة'}…`),
        !inIt && r.status === 'lobby' ? h('button', { class: 'btn big block', onclick: () => run(async () => { await rpc('game_join', { p_room: roomId }); refresh(); }) }, 'انضمام') : null,
        leaveBtn());
    }

    let catEl, letterEl, listEl, inputEl, sendBtn, playersEl;
    function drawPlaying() {
      const r = G.room, p = me();
      timerEl = h('div', { class: 'gm-timer' });
      letterEl = h('div', { class: 'gm-letter' }, r.letter);
      catEl = h('div', { class: 'gm-cat' });
      listEl = h('div', { class: 'gm-mine' });
      playersEl = h('div', { class: 'small muted center' });
      const head = h('div', { class: 'gm-head' }, h('div', { class: 'col', style: 'gap:2px;align-items:center' }, h('span', { class: 'small' }, 'الحرف'), letterEl),
        h('div', { class: 'col', style: 'gap:2px;align-items:center' }, h('span', { class: 'small' }, `الدورة ${r.round} من ${r.rounds}`), timerEl));
      if (!p) {
        body.replaceChildren(head, h('div', { class: 'card center' }, h('p', {}, 'المسابقة جارية، وستظهر النتائج بعد انتهاء الدورة.')), playersEl, leaveBtn());
      } else {
        inputEl = h('input', { type: 'text', maxlength: 40, placeholder: `اسم يبدأ بحرف «${r.letter}»`, autocomplete: 'off', enterkeyhint: 'send', class: 'gm-input' });
        sendBtn = h('button', { class: 'btn big ok', type: 'submit' }, 'تم ✓');
        const form = h('form', { class: 'row', onsubmit: async (ev) => {
          ev.preventDefault();
          const w = inputEl.value.trim();
          if (!w) return;
          sendBtn.disabled = true;
          const oldCat = me()?.cat;
          try {
            const res = await rpc('game_answer', { p_room: roomId, p_word: w });
            inputEl.value = '';
            const mine = me(); if (mine) mine.cat = res.cat;
            G.answers.push({ id: rid(), round: r.round, user_id: uid, cat: oldCat, word: w, local: true });
            CK.beep();
            updatePlaying(true);
          } catch (e) { toast(CK.errMsg(e)); }
          sendBtn.disabled = false;
          inputEl.focus();
        } }, h('div', { class: 'grow' }, inputEl), sendBtn);
        body.replaceChildren(head, catEl, form, listEl, playersEl, leaveBtn());
        setTimeout(() => inputEl.focus(), 50);
      }
      updatePlaying();
      timer = setInterval(tickTimer, 250); tickTimer();
    }
    function updatePlaying(flash) {
      const r = G.room, p = me();
      if (catEl && p) {
        const c = CATS[p.cat] || { ic: '❔', name: '…' };
        catEl.replaceChildren(h('span', { class: 'small' }, 'فئتك الآن'), h('div', { class: 'gm-cat-name' }, c.ic + ' ' + c.name));
        if (flash) { catEl.classList.remove('flash'); void catEl.offsetWidth; catEl.classList.add('flash'); }
      }
      if (listEl) {
        const mine = G.answers.filter((a) => a.round === r.round && a.user_id === uid);
        listEl.replaceChildren(...(mine.length ? [h('div', { class: 'small muted' }, `إجاباتك (${mine.length})`), h('div', { class: 'row wrap', style: 'gap:6px' },
          mine.map((a) => h('span', { class: 'tag pri' }, (CATS[a.cat]?.ic || '') + ' ' + a.word)))] : []));
      }
      if (playersEl) playersEl.textContent = 'يلعب الآن: ' + G.players.map((x) => x.name).join('، ');
    }
    function tickTimer() {
      if (!body.isConnected) { clearInterval(timer); live.delete(key); return; }
      const r = G.room;
      if (r.status !== 'playing') return clearInterval(timer);
      const left = new Date(r.round_ends_at).getTime() - srvNow();
      timerEl.textContent = CK.countdown(Math.max(0, left));
      timerEl.classList.toggle('near', left < 15000);
      if (left <= 0) {
        if (inputEl) { inputEl.disabled = true; sendBtn.disabled = true; inputEl.placeholder = 'انتهى الوقت ⏰'; }
        if (Date.now() - G.ending > 1500) { G.ending = Date.now(); sb.rpc('game_end_round', { p_room: roomId }).then(() => refresh()); }
      }
    }

    function drawReview(final) {
      const r = G.room;
      const ranked = [...G.players].sort((a, b) => b.score - a.score);
      const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
      const roundPts = (p, n) => G.answers.filter((a) => a.round === n && a.user_id === p.user_id).reduce((s, a) => s + (a.points || 0), 0);
      const roundBox = (n) => h('div', { class: 'col', style: 'gap:8px' }, G.players.map((p) => {
        const list = G.answers.filter((a) => a.round === n && a.user_id === p.user_id);
        return h('div', { class: 'gm-res' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, p.name), h('span', { class: 'tag pri' }, `+${roundPts(p, n)}`)),
          list.length ? h('div', { class: 'row wrap', style: 'gap:6px' }, list.map((a) => h('span', { class: 'gm-word' + (a.ok ? '' : ' no') },
            (CATS[a.cat]?.ic || '') + ' ' + a.word, h('small', {}, a.ok ? ` ${a.points}` : ' مرفوضة'),
            isParent ? h('button', { class: 'gm-x', title: a.ok ? 'رفض الإجابة' : 'قبول الإجابة', onclick: () => run(() => rpc('game_review', { p_answer: a.id, p_ok: !a.ok })) }, a.ok ? '✗' : '↺') : null)))
            : h('span', { class: 'small muted' }, 'لم يكتب شيئًا'));
      }));
      const board = h('div', { class: 'card' }, h('h3', { style: 'margin:0' }, final ? '🏆 النتيجة النهائية' : 'الترتيب حتى الآن'),
        ranked.map((p, i) => playerRow(p, h('b', { class: 'gm-score' }, p.score))));
      const ctrl = !final
        ? canControl() ? h('button', { class: 'btn big ok block', onclick: () => run(() => rpc('game_next', { p_room: roomId })) }, r.round >= r.rounds ? '🏆 عرض النتيجة النهائية' : `▶ الحرف التالي (${r.round + 1} من ${r.rounds})`)
          : h('div', { class: 'card center small muted' }, 'بانتظار الانتقال للحرف التالي…')
        : null;
      body.replaceChildren(
        final ? h('div', { class: 'card soft center' }, h('div', { style: 'font-size:3rem' }, '🏆'), h('h2', { style: 'margin:0' }, ranked[0] ? `الفائز: ${ranked[0].name}` : 'انتهت المسابقة'),
          ranked[1] && ranked[1].score === ranked[0].score ? h('p', { class: 'small', style: 'margin:0' }, 'تعادل في الصدارة!') : null)
          : h('div', { class: 'card soft center' }, h('div', { class: 'gm-letter' }, r.letter), h('b', {}, `انتهت الدورة ${r.round} من ${r.rounds}`)),
        board,
        final ? null : h('div', { class: 'card' }, h('h3', { style: 'margin:0' }, `إجابات حرف «${r.letter}»`),
          isParent ? h('p', { class: 'small muted', style: 'margin:0' }, 'الإجابات تُحتسب تلقائيًا. اضغط ✗ لرفض إجابة خاطئة، و↺ لإعادتها.') : null, roundBox(r.round)),
        ctrl,
        final ? h('details', { class: 'card' }, h('summary', {}, 'تفاصيل كل الحروف'),
          ...Array.from({ length: r.round }, (_, k) => k + 1).map((n) => h('div', { class: 'col', style: 'margin-top:10px' }, h('b', {}, `حرف «${r.letters[n - 1] || ''}»`), roundBox(n)))) : null,
        !final && canControl() ? h('button', { class: 'btn plain sm', style: 'align-self:center', onclick: async () => {
          if (await confirmBox('إنهاء المسابقة الآن وعرض النتيجة النهائية؟', 'إنهاء')) run(() => rpc('game_stop', { p_room: roomId }));
        } }, 'إنهاء المسابقة الآن') : null,
        final ? h('button', { class: 'btn big block', onclick: () => hub(ctx, r.game, back) }, '🔄 لعبة جديدة') : null,
        leaveBtn());
      scrollTop(body);
      if (final) CK.beep();
    }

    draw();
  }

  return { KINDS, GAMES, CATS, editor, summary, progress, answerOf, answersDialog, openTrip, hub, play, onChange, isGameTable, overlay: ownOverlay, close: ownClose };
})();
