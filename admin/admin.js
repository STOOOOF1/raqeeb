'use strict';
// الإدارة المركزية: الأسر وأولياء الأمور، ومكتبة القوالب العامة، وكلمة المرور الرئيسية
(() => {
  const { h, $, toast, run, modal, confirmBox, ago } = CK;
  const root = $('#root');
  const field = (label, input) => h('label', { class: 'f' }, label, input);
  const card = (title, ...kids) => h('div', { class: 'card' }, title ? h('h2', {}, title) : null, kids);
  const S = { token: sessionStorage.getItem('ck-admin'), tab: 'families', families: [], templates: [], filter: '' };

  async function api(action, body = {}) {
    const r = await fetch(CONFIG.url + '/functions/v1/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CONFIG.key },
      body: JSON.stringify({ action, token: S.token, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && action !== 'login' && action !== 'change_password') { logout(); throw new Error(j.error || 'انتهت الجلسة'); }
    if (!r.ok) throw new Error(j.error || 'تعذر الاتصال بالخادم');
    return j;
  }
  function logout() { S.token = null; sessionStorage.removeItem('ck-admin'); loginScreen(); }

  // ================= الدخول =================
  function loginScreen() {
    const pass = h('input', { type: 'password', maxlength: 72, autocomplete: 'current-password', dir: 'ltr' });
    const btn = h('button', { class: 'btn big block', type: 'submit' }, 'دخول');
    root.replaceChildren(h('div', { class: 'splash' }, h('div', { class: 'card' },
      h('div', { class: 'logo' }, '🛡️'), h('h1', { class: 'center' }, 'الإدارة المركزية'),
      h('p', { class: 'muted center' }, 'لإدارة الأسر والقوالب في نظام رقيب'),
      h('form', { class: 'col', onsubmit: async (ev) => {
        ev.preventDefault(); btn.disabled = true;
        await run(async () => {
          const { token } = await api('login', { password: pass.value });
          S.token = token; sessionStorage.setItem('ck-admin', token);
          await load(); draw();
        }).catch(() => {});
        pass.value = ''; btn.disabled = false;
      } }, field('كلمة المرور الرئيسية', pass), btn))));
    pass.focus();
  }

  async function load() {
    const [f, t] = await Promise.all([api('overview'), api('tpl_list')]);
    S.families = f.families || []; S.templates = t.templates || [];
  }
  const refresh = () => run(async () => { await load(); draw(); });

  // ================= الهيكل =================
  let mainEl;
  function draw() {
    const top = mainEl?.scrollTop || 0;
    mainEl = h('div', { class: 'main' });
    const TABS = [['families', '👪 الأسر'], ['templates', '📚 القوالب'], ['account', '🔐 الحساب']];
    root.replaceChildren(h('div', { class: 'app' },
      h('div', { class: 'admin-top' }, h('span', {}, '🛡️'), h('b', { class: 'grow' }, 'الإدارة المركزية — رقيب'),
        h('button', { onclick: refresh }, '↻ تحديث'), h('button', { onclick: logout }, 'خروج')),
      h('div', { class: 'top' }, h('div', { class: 'tabs' }, TABS.map(([id, name]) =>
        h('button', { class: S.tab === id ? 'on' : '', onclick: () => { S.tab = id; draw(); } }, name)))),
      mainEl));
    mainEl.replaceChildren(...({ families: viewFamilies, templates: viewTemplates, account: viewAccount }[S.tab]()).filter(Boolean));
    mainEl.scrollTop = top;
  }

  // ================= الأسر =================
  const passInput = () => h('input', { type: 'password', maxlength: 72, autocomplete: 'new-password', dir: 'ltr' });
  function setPassword(p) {
    const n = passInput(), n2 = passInput();
    modal(`كلمة مرور جديدة لـ${p.name}`, [h('p', { class: 'small muted', dir: 'ltr', style: 'text-align:right' }, '@' + p.username),
      field('كلمة المرور الجديدة (6 أحرف على الأقل)', n), field('تأكيدها', n2),
      h('p', { class: 'small muted' }, 'يُرفع أي إيقاف مؤقت على حسابه بسبب المحاولات الخاطئة.')], { onOk: async () => {
      if (n.value !== n2.value) throw new Error('كلمتا المرور غير متطابقتين');
      await api('set_password', { user_id: p.user_id, password: n.value });
      toast('تم تعيين كلمة المرور');
    } });
  }

  function familyCard(f) {
    return h('div', { class: 'card' + (f.disabled ? ' warn' : '') },
      h('div', { class: 'fam-h' }, h('h2', { style: 'margin:0' }, f.name), f.disabled ? h('span', { class: 'tag bad' }, 'موقوفة') : null,
        h('span', { class: 'small muted' }, 'أُنشئت ' + new Date(f.created_at).toLocaleDateString('ar-u-nu-latn'))),
      h('b', { class: 'small' }, `👥 أولياء الأمور (${f.parents.length})`),
      h('div', {}, f.parents.map((p) => h('div', { class: 'person' },
        h('span', {}, p.is_owner ? '👑' : '👤'),
        h('div', { class: 'grow' }, h('div', {}, p.name, p.is_owner ? h('span', { class: 'tag ok', style: 'margin-inline-start:6px' }, 'مدير الأسرة') : null),
          h('div', { class: 'small muted' }, h('span', { dir: 'ltr' }, '@' + (p.username || '—')), ' · آخر دخول: ', p.last_sign_in ? ago(p.last_sign_in) : 'لم يدخل')),
        h('button', { class: 'btn ghost sm', onclick: () => setPassword(p) }, '🔑 كلمة المرور'),
        p.is_owner ? null : h('button', { class: 'btn ghost sm', onclick: async () => {
          if (await confirmBox(`جعل ${p.name} مديرًا لأسرة «${f.name}»؟ سينتقل إليه حق إضافة أولياء الأمور وإدارتهم.`, 'تغيير المدير'))
            run(async () => { await api('set_owner', { family_id: f.id, user_id: p.user_id }); await load(); draw(); }, 'تغيّر مدير الأسرة');
        } }, '👑 اجعله المدير')))),
      h('b', { class: 'small' }, `🧒 الأطفال (${f.children.length})`),
      f.children.length ? h('div', {}, f.children.map((c) => h('div', { class: 'person' }, h('span', {}, '🧒'),
        h('div', { class: 'grow' }, c.name, h('div', { class: 'small muted' }, (c.paired ? ago(c.last_seen) : 'جهاز غير مرتبط') + (c.plan ? ' · 📚 ' + c.plan : '')))))) : h('p', { class: 'small muted', style: 'margin:0' }, 'لا أطفال بعد.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn ghost sm', onclick: async () => {
          const msg = f.disabled ? `إعادة تفعيل أسرة «${f.name}»؟` : `إيقاف أسرة «${f.name}»؟ لن يستطيع أولياء أمورها الدخول حتى تعيد تفعيلها.`;
          if (await confirmBox(msg, f.disabled ? 'تفعيل' : 'إيقاف')) run(async () => { await api('set_disabled', { family_id: f.id, disabled: !f.disabled }); await load(); draw(); }, 'تم');
        } }, f.disabled ? '▶ إعادة التفعيل' : '⏸ إيقاف الأسرة'),
        h('button', { class: 'btn bad sm', onclick: () => {
          const name = h('input', { type: 'text', placeholder: f.name });
          modal('حذف الأسرة نهائيًا', [h('p', {}, `سيُحذف كل شيء لأسرة «${f.name}»: أولياء الأمور، الأطفال، المهام، الرسائل والتسجيلات. لا يمكن التراجع.`),
            field('اكتب اسم الأسرة للتأكيد', name)], { okText: 'حذف نهائي', onOk: async () => {
            if (name.value.trim() !== f.name) throw new Error('الاسم غير مطابق');
            await api('delete_family', { family_id: f.id }); await load(); draw(); toast('حُذفت الأسرة');
          } });
        } }, '🗑 حذف')));
  }

  function viewFamilies() {
    const fl = S.filter.trim().toLowerCase();
    const list = S.families.filter((f) => !fl || f.name.toLowerCase().includes(fl)
      || f.parents.some((p) => (p.name + ' ' + (p.username || '')).toLowerCase().includes(fl)) || f.children.some((c) => c.name.toLowerCase().includes(fl)));
    const search = h('input', { type: 'search', placeholder: 'بحث باسم أسرة أو ولي أمر أو طفل…', value: S.filter,
      oninput: CK.debounce((e) => { S.filter = e.target.value; draw(); const s = mainEl.querySelector('input[type=search]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }, 250) });
    const sum = (k) => S.families.reduce((n, f) => n + f[k].length, 0);
    return [
      h('div', { class: 'stats' },
        h('div', { class: 'card' }, h('b', {}, S.families.length), h('span', { class: 'small muted' }, 'أسرة')),
        h('div', { class: 'card' }, h('b', {}, sum('parents')), h('span', { class: 'small muted' }, 'ولي أمر')),
        h('div', { class: 'card' }, h('b', {}, sum('children')), h('span', { class: 'small muted' }, 'طفل'))),
      search,
      ...(list.length ? list.map(familyCard) : [h('p', { class: 'muted center' }, S.families.length ? 'لا نتائج.' : 'لا توجد أسر بعد.')]),
    ];
  }

  // ================= القوالب العامة =================
  const saveTpl = (t) => async (row) => {
    await api('tpl_save', { template: { ...row, id: t?.id, active: t ? t.active : true, sort: t?.sort || 0 } });
    await load(); draw(); toast('حُفظ القالب');
  };
  function viewTemplates() {
    return [
      card(null, h('p', { class: 'small', style: 'margin:0' }, 'القوالب العامة تظهر لكل الأسر في «مكتبة القوالب»، ويستطيع ولي الأمر تطبيقها على طفله أو نسخها وتعديلها لأسرته. القالب الموقوف يختفي من المكتبة دون حذفه. الخطة العشوائية تُولَّد من عناصر القوالب المفعّلة.'),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn', onclick: () => TPL.editor(null, { onSave: saveTpl(null) }) }, '＋ قالب جديد'),
          h('button', { class: 'btn ghost', onclick: () => TPL.importDialog({ onSave: saveTpl(null) }) }, '📥 استيراد قالب'))),
      ...S.templates.map((t) => h('div', { class: 'card' + (t.active ? '' : ' warn') },
        h('div', { class: 'row between' }, h('h2', { style: 'margin:0' }, t.title), t.active ? h('span', { class: 'tag ok' }, 'ظاهر') : h('span', { class: 'tag warn' }, 'موقوف')),
        h('div', { class: 'row wrap' }, h('span', { class: 'tag' }, '⏳ ' + TPL.durText(t.duration_months)), h('span', { class: 'tag' }, '👦 ' + TPL.ageText(t))),
        t.description ? h('p', { class: 'small', style: 'margin:0' }, t.description) : null,
        h('div', { class: 'small muted' }, TPL.summary(t)),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn sm', onclick: () => TPL.editor(t, { onSave: saveTpl(t) }) }, '✏️ تعديل'),
          h('button', { class: 'btn ghost sm', onclick: () => modal(t.title, TPL.details(t)) }, 'معاينة'),
          h('button', { class: 'btn ghost sm', onclick: () => TPL.editor({ ...t, id: undefined, title: t.title + ' (نسخة)' }, { heading: 'نسخة جديدة', onSave: saveTpl(null) }) }, '📋 نسخ'),
          h('button', { class: 'btn ghost sm', onclick: () => run(async () => {
            await api('tpl_save', { template: { ...t, active: !t.active } }); await load(); draw();
          }, t.active ? 'أُوقف القالب' : 'أصبح ظاهرًا') }, t.active ? '⏸ إيقاف' : '▶ إظهار'),
          h('button', { class: 'btn bad sm', onclick: async () => {
            if (await confirmBox(`حذف القالب «${t.title}» نهائيًا؟ لا يؤثر على الخطط المطبّقة على الأطفال.`, 'حذف')) run(async () => { await api('tpl_delete', { id: t.id }); await load(); draw(); }, 'حُذف القالب');
          } }, '🗑')))),
    ];
  }

  // ================= الحساب =================
  function viewAccount() {
    const o = h('input', { type: 'password', maxlength: 72, autocomplete: 'current-password', dir: 'ltr' }), n = passInput(), n2 = passInput();
    return [card('🔐 تغيير كلمة المرور الرئيسية',
      h('p', { class: 'small muted' }, 'استخدم كلمة قوية (12 حرفًا أو أكثر مع أرقام). تغييرها يُخرج أي جلسة إدارة مفتوحة على أجهزة أخرى.'),
      h('form', { class: 'col', onsubmit: async (ev) => {
        ev.preventDefault();
        await run(async () => {
          if (n.value.length < 10) throw new Error('اجعلها 10 أحرف على الأقل');
          if (n.value !== n2.value) throw new Error('كلمتا المرور غير متطابقتين');
          const { token } = await api('change_password', { old: o.value, new: n.value });
          S.token = token; sessionStorage.setItem('ck-admin', token);
          o.value = n.value = n2.value = '';
        }, 'تم تغيير كلمة المرور');
      } }, field('الحالية', o), field('الجديدة', n), field('تأكيد الجديدة', n2), h('button', { class: 'btn', type: 'submit' }, 'حفظ'))),
    card('ℹ️ عن الجلسة', h('p', { class: 'small muted', style: 'margin:0' }, 'تنتهي جلسة الإدارة بعد 12 ساعة أو عند إغلاق المتصفح. بعد 5 محاولات دخول خاطئة يُوقف الدخول 30 دقيقة.'))];
  }

  // ================= البدء =================
  (async () => {
    if (!S.token) return loginScreen();
    try { await load(); draw(); } catch (e) { if (S.token) { toast(CK.errMsg(e)); loginScreen(); } }
  })();
})();
