/* Settings — your profile, which alerts you get, how the dashboard looks, the business details
   shown in the app, and the status of the integrations. Alert switches save as you flip them. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;
  var ALERTS = [
    ['alert_new_lead', 'New lead alerts', 'When an enquiry arrives from the website or the app'],
    ['alert_new_message', 'New message alerts', 'When a client sends a message'],
    ['alert_project', 'Project alerts', 'Delays, halts and weather risk on live sites'],
    ['alert_stage_due', 'Stage due alerts', 'When a stage is due to start or finish'],
    ['notify_push', 'Push notifications', 'On your phone, from the app'],
    ['notify_email', 'Email client updates', 'Email clients when a stage starts or finishes'],
  ];
  function one(x) { return Array.isArray(x) ? x[0] : x; }

  function render(view) {
    var D = null, destroyed = false, drawn = false;
    view.classList.add('fit');
    view.innerHTML = UI.skeleton([[100], [300, 24], [300, 24]]);

    async function refresh() {
      try {
        var sb = LH.sb, uid = LH.state.user.id;
        var r = await Promise.all([
          sb.from('user_settings').select('*').eq('user_id', uid).maybeSingle(),
          sb.from('business_settings').select('*').limit(1).maybeSingle(),
          sb.from('user_calendar_connections').select('*').eq('user_id', uid).maybeSingle(),
          sb.from('leads').select('id', { count: 'exact', head: true }).eq('source', 'website'),
          sb.from('site_inductions').select('id', { count: 'exact', head: true }),
          sb.from('daily_checkins').select('id', { count: 'exact', head: true }),
        ]);
        for (var i = 0; i < 3; i++) if (r[i].error) throw r[i].error;
        D = { us: r[0].data || {}, biz: r[1].data || {}, cal: r[2].data, leads: r[3].count || 0, ind: r[4].count || 0, chk: r[5].count || 0 };
        LH.touchSynced();
        if (!destroyed) draw();
      } catch (e) { console.error(e); if (!D && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load settings. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    refresh();

    function isOn(key) { return D.us[key] == null ? true : !!D.us[key]; }
    function calStatus() {
      var c = D.cal; if (!c || c.status === 'disconnected') return { cls: '', text: 'Not connected' };
      if (c.status === 'connected') return { cls: 'ok', text: 'Connected' + (c.account_label ? ' · ' + c.account_label : '') };
      if (c.status === 'reconnect_needed') return { cls: 'wait', text: 'Reconnect needed' };
      return { cls: 'halt', text: 'Problem' + (c.last_error ? ' · ' + c.last_error : '') };
    }
    function draw() {
      var y = window.scrollY; view.classList.toggle('enter', !drawn); drawn = true;
      var b = D.biz, mode = LH.themeMode(), cs = calStatus();
      var bizLine = [b.business_name, b.abn ? 'ABN ' + b.abn : ''].filter(Boolean).join(' · ');
      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap">Account</div><h1 class="ov-hello">Settings &amp; integrations</h1></div></div>' +
        '<div class="st-grid"><div class="stack">' +
        '<section class="lh-card"><div class="st-prof"><span class="st-av">' + esc(LH.initials(LH.state.name)) + '</span><div><div class="serif st-name"><em>' + esc(LH.state.name) + '</em></div><div class="faint tiny">Admin · ' + esc(LH.state.email) + '</div></div><button type="button" class="lh-btn sm" data-act="profile" style="margin-left:auto">Edit</button></div>' +
        '<div class="st-bizline faint tiny">' + (bizLine ? esc(bizLine) : 'No business details yet') + '</div></section>' +
        '<section class="lh-card"><h2 class="lh-card-title" style="margin-bottom:0.75rem">Notifications</h2>' + ALERTS.map(function (a) {
          return '<div class="st-row"><div><div>' + esc(a[1]) + '</div><div class="faint tiny">' + esc(a[2]) + '</div></div><button type="button" class="tgl' + (isOn(a[0]) ? ' on' : '') + '" role="switch" aria-checked="' + isOn(a[0]) + '" aria-label="' + esc(a[1]) + '" data-tgl="' + a[0] + '"><i></i></button></div>';
        }).join('') + '</section>' +
        '<section class="lh-card"><h2 class="lh-card-title" style="margin-bottom:0.875rem">Appearance</h2><div class="lh-seg">' + [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']].map(function (m) { return '<button type="button" data-theme="' + m[0] + '" class="' + (mode === m[0] ? 'on' : '') + '">' + m[1] + '</button>'; }).join('') + '</div></section></div>' +
        '<div class="stack"><section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Integrations</h2><span class="faint tiny">2 connections</span></div>' +
        '<div class="st-int"><span class="ic">' + LH.icon('schedule') + '</span><div class="tx"><div>Google Calendar</div><div class="faint tiny">Bookings, consultations and site visits push one-way from Lotti</div><div class="st-stat ' + cs.cls + '"><i></i>' + esc(cs.text) + '</div></div><button type="button" class="lh-btn" data-act="cal">Manage</button></div>' +
        '<div class="st-int"><span class="ic">' + LH.icon('compliance') + '</span><div class="tx"><div>Website forms</div><div class="faint tiny">New enquiries create leads automatically. Inductions and check-ins land in Compliance.</div><div class="st-stat ok"><i></i>Live · ' + D.leads + (D.leads === 1 ? ' website lead' : ' website leads') + ' · ' + D.ind + (D.ind === 1 ? ' induction' : ' inductions') + ' · ' + D.chk + (D.chk === 1 ? ' check-in' : ' check-ins') + '</div></div><button type="button" class="lh-btn" data-act="forms">Manage</button></div></section>' +
        '<section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Business details</h2><button type="button" class="lh-link" data-act="biz">Edit</button></div>' +
        [['Business name', b.business_name], ['Full name', b.owner_display_name], ['Contact email', b.contact_email], ['Contact phone', b.contact_phone], ['ABN', b.abn], ['Google review link', b.google_review_url], ['Rain warning threshold', b.rain_risk_threshold_pct != null ? b.rain_risk_threshold_pct + '% chance' : ''], ['Quiet hours', b.quiet_hours_start ? String(b.quiet_hours_start).slice(0, 5) + ' – ' + String(b.quiet_hours_end || '').slice(0, 5) : '']].map(function (x) { return '<div class="kv"><span class="k">' + x[0] + '</span><span class="v">' + (x[1] ? esc(x[1]) : '<span class="faint">—</span>') + '</span></div>'; }).join('') + '</section></div></div>';
      window.scrollTo(0, y);
    }

    async function onClick(e) {
      var el = e.target.closest('[data-tgl],[data-theme],[data-act]'); if (!el || !D) return;
      if (el.hasAttribute('data-theme')) { LH.setTheme(el.getAttribute('data-theme')); draw(); return; }
      if (el.hasAttribute('data-tgl')) {
        var key = el.getAttribute('data-tgl'), next = !isOn(key); D.us[key] = next; draw();
        var cols = { user_id: LH.state.user.id }; cols[key] = next;
        var r = await LH.sb.from('user_settings').upsert(cols, { onConflict: 'user_id' });
        if (r.error) { D.us[key] = !next; draw(); UI.toast(LH.errMsg(r.error), 'error'); } else UI.toast('Saved.');
        return;
      }
      var a = el.getAttribute('data-act');
      if (a === 'profile') {
        UI.form({
          title: 'Edit profile', intro: 'The name the app shows for you, and the name clients see as their project manager.', submitLabel: 'Save', values: { name: LH.state.name },
          fields: [{ name: 'name', label: 'Display name', required: true, span: 2, hint: 'Letters and spaces only. Use a first and last name to be chosen as a project manager.' }],
          onSubmit: async function (v) { var r = await LH.sb.from('admin_profiles').upsert({ user_id: LH.state.user.id, display_name: v.name }, { onConflict: 'user_id' }); if (r.error) throw r.error; LH.state.name = v.name; },
        }).then(function (done) { if (done) { LH.$('#avatarBtn').textContent = LH.initials(LH.state.name); LH.$('#menuName').textContent = LH.state.name; UI.toast('Saved.'); refresh(); } });
      } else if (a === 'biz') {
        var b = D.biz;
        UI.form({
          title: 'Business details', submitLabel: 'Save', wide: true,
          values: { business_name: b.business_name || '', owner_display_name: b.owner_display_name || '', contact_email: b.contact_email || '', contact_phone: b.contact_phone || '', abn: b.abn || '', google_review_url: b.google_review_url || '', rain: b.rain_risk_threshold_pct != null ? b.rain_risk_threshold_pct : 60, qs: b.quiet_hours_start ? String(b.quiet_hours_start).slice(0, 5) : '', qe: b.quiet_hours_end ? String(b.quiet_hours_end).slice(0, 5) : '' },
          fields: [{ name: 'business_name', label: 'Business name', span: 2 }, { name: 'owner_display_name', label: 'Full name' }, { name: 'abn', label: 'ABN' }, { name: 'contact_email', label: 'Contact email', type: 'email' }, { name: 'contact_phone', label: 'Contact phone', type: 'tel' },
            { name: 'google_review_url', label: 'Google review link', span: 2 }, { name: 'rain', label: 'Rain warning at (% chance)', type: 'number', min: 0, max: 100 }, { name: 'qs', label: 'Quiet hours start', type: 'time' }, { name: 'qe', label: 'Quiet hours end', type: 'time' }],
          onSubmit: async function (v) {
            var cols = { business_name: UI.nullIfBlank(v.business_name), owner_display_name: UI.nullIfBlank(v.owner_display_name), contact_email: UI.nullIfBlank(v.contact_email), contact_phone: UI.nullIfBlank(v.contact_phone), abn: UI.nullIfBlank(v.abn), google_review_url: UI.nullIfBlank(v.google_review_url), rain_risk_threshold_pct: Math.max(0, Math.min(100, parseInt(v.rain, 10) || 60)), quiet_hours_start: UI.nullIfBlank(v.qs), quiet_hours_end: UI.nullIfBlank(v.qe) };
            var r = await LH.sb.from('business_settings').update(cols).eq('id', true); if (r.error) throw r.error;
          },
        }).then(function (done) { if (done) { UI.toast('Saved.'); refresh(); } });
      } else if (a === 'cal') {
        var c = D.cal, st = calStatus();
        UI.choose('Google Calendar', st.text + (c && c.last_synced_at ? ' · Last synced ' + fmt.dateTime(c.last_synced_at) : ''), [{ key: 'ok', label: 'Got it', primary: true }]).then(function () {});
        UI.toast('Connect or reconnect Google Calendar from Settings in the app.');
      } else if (a === 'forms') {
        var origin = location.origin;
        UI.choose('Website forms', 'Share these links or print them as QR codes for site.', [{ key: 'ind', label: 'Copy site induction link', primary: true }, { key: 'chk', label: 'Copy daily check-in link' }]).then(async function (k) {
          if (!k) return; try { await navigator.clipboard.writeText(origin + (k === 'ind' ? '/site-induction.html' : '/daily-checkin.html')); UI.toast('Link copied.'); } catch (x) { UI.toast(origin + (k === 'ind' ? '/site-induction.html' : '/daily-checkin.html')); }
        });
      }
    }
    view.addEventListener('click', onClick);
    return { watch: ['user_settings', 'business_settings', 'user_calendar_connections', 'admin_profiles'], refresh: refresh, destroy: function () { destroyed = true; view.classList.remove('enter', 'fit'); view.removeEventListener('click', onClick); } };
  }

  LH.screens.settings = { title: 'Settings', render: render };
})();
