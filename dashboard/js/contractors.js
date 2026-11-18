/* Contractors — who is booked where this week and next, and whether their paperwork is current.
   Same contractors, bookings and certificates the app uses. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;
  var DAY = 86400000, KINDS = [['licence', 'Licence'], ['insurance', 'Insurance'], ['white_card', 'White Card']];
  var WD = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' });

  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function numOfKey(k) { return Math.round(Date.parse(k.slice(0, 10) + 'T00:00:00Z') / DAY); }
  function keyOfNum(n) { var d = new Date(n * DAY); return LH.keyOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  function todayNum() { var t = LH.today(); return Math.round(Date.UTC(t.y, t.m, t.d) / DAY); }
  function mondayNum(n) { var d = new Date(n * DAY); return n - ((d.getUTCDay() + 6) % 7); }
  function shortStreet(s) { return String(s || '').replace(/^\d+\w*\s+/, '').split(' ')[0] || String(s || ''); }

  /** Worst thing wrong with a contractor's paperwork, as a pill. */
  function compliance(c, certs) {
    var today = todayNum(), expired = null, soon = null, missing = null;
    KINDS.forEach(function (k) {
      var mine = certs.filter(function (x) { return x.kind === k[0]; }).sort(function (a, b) { return a.expiry_date < b.expiry_date ? 1 : -1; })[0];
      var verified = (c.verified_checks || []).indexOf(k[0]) !== -1;
      if (!mine) { if (!verified && !missing) missing = k[1] + ' missing'; return; }
      var left = numOfKey(mine.expiry_date) - today;
      if (left < 0 && !expired) expired = k[1] + ' expired';
      else if (left >= 0 && left <= 30 && !soon) soon = k[1] + ' expires ' + fmt.date(mine.expiry_date);
    });
    if (expired) return { cls: 'halt', text: expired };
    if (soon) return { cls: 'wait', text: soon };
    if (missing) return { cls: 'wait', text: missing };
    return { cls: 'ok', text: 'All current' };
  }

  function render(view) {
    var D = null, destroyed = false, drawn = false, S = { week: 0, type: 'all' }, wx = null;
    view.innerHTML = UI.skeleton([[110], [60, 24], [380, 24]]);

    async function refresh() {
      try {
        var sb = LH.sb, mon = mondayNum(todayNum());
        var from = LH.adelaideToISO(keyOfNum(mon - 7) + 'T00:00'), to = LH.adelaideToISO(keyOfNum(mon + 21) + 'T00:00');
        var r = await Promise.all([
          sb.from('contractors').select('id,name,contractor_type_id,contact_name,phone,email,abn,notes,is_active,verified_checks,contractor_types(name)').order('name'),
          sb.from('contractor_certificates').select('id,contractor_id,kind,title,number,expiry_date,file_path'),
          sb.from('bookings').select('id,project_id,title,starts_at,ends_at,projects(site_street,deleted_at),booking_internal(contractor_id)').eq('kind', 'contractor').neq('status', 'cancelled').gte('ends_at', from).lte('starts_at', to),
          sb.from('contractor_types').select('id,name').order('name'),
          sb.from('business_settings').select('rain_risk_threshold_pct').limit(1).maybeSingle(),
        ]);
        for (var i = 0; i < 4; i++) if (r[i].error) throw r[i].error;
        var bookings = [];
        (r[2].data || []).forEach(function (b) {
          var bi = one(b.booking_internal), pj = one(b.projects) || {};
          if (!bi || !bi.contractor_id || pj.deleted_at) return;
          bookings.push({ id: b.id, contractor: bi.contractor_id, project: b.project_id, street: pj.site_street || '', title: b.title, s: numOfInstant(b.starts_at), e: numOfInstant(new Date(new Date(b.ends_at).getTime() - 1).toISOString()) });
        });
        D = { cons: r[0].data || [], certs: r[1].data || [], bookings: bookings, types: r[3].data || [], rain: (r[4].data && r[4].data.rain_risk_threshold_pct) || 60 };
        LH.touchSynced();
        if (!destroyed) draw();
      } catch (e) { console.error(e); if (!D && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load contractors. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    function numOfInstant(iso) { return numOfKey(fmt.dayKey(iso)); }
    LH.weather().then(function (w) { wx = w; if (D && !destroyed) draw(); });
    refresh();

    function lanes(list, mon) {
      var placed = [], laneEnds = [];
      list.sort(function (a, b) { return a.s - b.s; }).forEach(function (b) {
        var a = Math.max(0, b.s - mon), z = Math.min(6, b.e - mon), lane = 0;
        while (laneEnds[lane] != null && laneEnds[lane] >= a) lane++;
        laneEnds[lane] = z; placed.push({ b: b, a: a, z: z, lane: lane });
      });
      return placed;
    }

    function draw() {
      var y = window.scrollY; view.classList.toggle('enter', !drawn); drawn = true;
      var mon = mondayNum(todayNum()) + S.week * 7, today = todayNum();
      var rainDays = {}; if (wx && wx.forecast) wx.forecast.forEach(function (d) { if (d.chanceOfRain != null && d.chanceOfRain >= D.rain) rainDays[numOfKey(d.date)] = true; });
      var types = []; D.cons.forEach(function (c) { var t = (one(c.contractor_types) || {}).name; if (t && types.indexOf(t) === -1) types.push(t); });
      var shown = D.cons.filter(function (c) { return c.is_active && (S.type === 'all' || (one(c.contractor_types) || {}).name === S.type); });
      var head = '';
      for (var i = 0; i < 7; i++) { var n = mon + i, d = new Date(n * DAY); head += '<div class="cw-day' + (rainDays[n] ? ' rain' : '') + (n === today ? ' today' : '') + '">' + WD.format(d).toUpperCase() + ' ' + d.getUTCDate() + (rainDays[n] ? ' · RAIN' : '') + '</div>'; }
      var rows = shown.map(function (c, idx) {
        var mine = D.bookings.filter(function (b) { return b.contractor === c.id && b.e >= mon && b.s <= mon + 6; }), pl = lanes(mine, mon), nl = pl.reduce(function (m, p) { return Math.max(m, p.lane + 1); }, 1);
        var cells = ''; for (var k = 0; k < 7; k++) cells += '<i class="cw-cell" style="grid-column:' + (k + 1) + ';grid-row:1 / span ' + nl + '"></i>';
        var bars = pl.map(function (p) { return '<button type="button" class="cw-bar' + (rainDays[p.b.s] || false ? ' rain' : '') + '" data-booking="' + p.b.id + '" title="' + esc(p.b.title || '') + '" style="grid-column:' + (p.a + 1) + ' / ' + (p.z + 2) + ';grid-row:' + (p.lane + 1) + '">' + esc(shortStreet(p.b.street)) + '</button>'; }).join('');
        var cp = compliance(c, D.certs.filter(function (x) { return x.contractor_id === c.id; }));
        return '<div class="cw-row cw-grid" style="--i:' + idx + '"><button type="button" class="cw-who" data-manage="' + c.id + '"><span class="tp">' + esc((one(c.contractor_types) || {}).name || '') + '</span><span class="nm">' + esc(c.name) + '</span><span class="ct">' + esc([c.contact_name, c.phone].filter(Boolean).join(' · ')) + '</span></button>' +
          '<div class="cw-days" style="--rows:' + nl + '">' + cells + bars + (pl.length ? '' : '<span class="cw-free">Available all week</span>') + '</div><div>' + UI.pill(cp.cls, cp.text) + '</div></div>';
      }).join('');
      var rangeEnd = mon + 6;
      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap">Contacts &amp; bookings</div><h1 class="ov-hello">Contractors</h1><div class="hero-sub">' + D.cons.filter(function (c) { return c.is_active; }).length + ' contractors · bookings appear on the Google Calendar</div></div>' +
        '<div class="ov-actions no-print"><div class="chip-row" style="margin:0">' + UI.chips([['0', 'This week'], ['1', 'Next week']], String(S.week), 'week') + '</div><button class="lh-btn" type="button" data-act="csv">Export</button><button class="lh-btn primary" type="button" data-act="add">+ Add contractor</button></div></div>' +
        UI.sect(S.week ? 'Next week' : 'This week') + '<div class="chip-row">' + UI.chips([['all', 'All']].concat(types.map(function (t) { return [t, t]; })), S.type, 'type') + '</div>' +
        '<section class="lh-card"><div class="tbl-scroll"><div class="tbl-inner" style="min-width:980px"><div class="cw-head cw-grid"><div>Contractor</div><div class="cw-days-head">' + head + '</div><div>Compliance</div></div>' +
        (rows || '<div class="lh-empty">No contractors here yet. Add one to start booking them.</div>') + '</div></div><div class="faint tiny" style="margin-top:12px">' + esc(fmt.date(keyOfNum(mon)) + ' – ' + fmt.date(keyOfNum(rangeEnd))) + '</div></section>';
      window.scrollTo(0, y);
    }

    /* ---------- forms ---------- */
    async function typeId(name) {
      name = UI.nullIfBlank(name); if (!name) return null;
      var have = D.types.filter(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })[0]; if (have) return have.id;
      var r = await LH.sb.from('contractor_types').insert({ name: name }).select('id').single(); if (r.error) throw r.error; return r.data.id;
    }
    function contractorForm(c) {
      var checks = c ? (c.verified_checks || []) : [];
      UI.form({
        title: c ? 'Edit contractor' : 'Add contractor', submitLabel: c ? 'Save' : 'Add contractor', wide: true,
        values: c ? { name: c.name, type: (one(c.contractor_types) || {}).name || '', contact: c.contact_name || '', phone: c.phone || '', email: c.email || '', abn: c.abn || '', notes: c.notes || '', lic: checks.indexOf('licence') !== -1 ? '1' : '0', ins: checks.indexOf('insurance') !== -1 ? '1' : '0', wc: checks.indexOf('white_card') !== -1 ? '1' : '0' } : { lic: '0', ins: '0', wc: '0' },
        fields: [{ name: 'name', label: 'Company', required: true, span: 2 },
          { name: 'type', label: 'Trade', type: 'select', options: [{ v: '', l: 'Choose…' }].concat(D.types.map(function (t) { return { v: t.name, l: t.name }; })) }, { name: 'newtype', label: 'Or a new trade' },
          { name: 'contact', label: 'Contact name' }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'abn', label: 'ABN' },
          { name: 'lic', label: 'Licence number verified', type: 'select', options: [{ v: '1', l: 'Yes' }, { v: '0', l: 'No' }] }, { name: 'ins', label: 'Insurance verified', type: 'select', options: [{ v: '1', l: 'Yes' }, { v: '0', l: 'No' }] },
          { name: 'wc', label: 'White Card on file', type: 'select', options: [{ v: '1', l: 'Yes' }, { v: '0', l: 'No' }] }, { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, span: 2 }],
        onSubmit: async function (v) {
          var tid = await typeId(v.newtype || v.type); if (!tid) throw new Error('Choose or add a trade.');
          var vc = []; if (v.lic === '1') vc.push('licence'); if (v.ins === '1') vc.push('insurance'); if (v.wc === '1') vc.push('white_card');
          var cols = { name: v.name, contractor_type_id: tid, contact_name: UI.nullIfBlank(v.contact), phone: UI.nullIfBlank(v.phone), email: UI.nullIfBlank(v.email), abn: UI.nullIfBlank(v.abn), notes: UI.nullIfBlank(v.notes), verified_checks: vc };
          var r = c ? await LH.sb.from('contractors').update(cols).eq('id', c.id) : await LH.sb.from('contractors').insert(cols);
          if (r.error) throw r.error;
        },
      }).then(function (ok) { if (ok) { UI.toast(c ? 'Saved.' : 'Contractor added.'); refresh(); } });
    }
    function certsForm(c) {
      var mine = D.certs.filter(function (x) { return x.contractor_id === c.id; });
      var list = mine.length ? mine.map(function (x) { var left = numOfKey(x.expiry_date) - todayNum(); return '<div class="cert"><div><b>' + esc(x.title) + '</b><div class="faint tiny">' + esc((KINDS.filter(function (k) { return k[0] === x.kind; })[0] || [0, 'Other'])[1]) + (x.number ? ' · ' + esc(x.number) : '') + ' · ' + (left < 0 ? 'expired ' : 'expires ') + esc(fmt.dateY(x.expiry_date)) + '</div></div>' + (x.file_path ? '<button type="button" class="lh-link" data-cview="' + x.id + '">View</button>' : '') + '<button type="button" class="icon-del" data-cdel="' + x.id + '" aria-label="Delete certificate">' + '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.8h5V7M7 7l.8 12.2h8.4L17 7"/></svg></button></div>'; }).join('') : '<div class="faint">No certificates yet.</div>';
      UI.form({
        title: c.name + ' — certificates', submitLabel: 'Add certificate', wide: true,
        fields: [{ name: 'kind', label: 'Type', type: 'select', options: KINDS.concat([['other', 'Other']]).map(function (k) { return { v: k[0], l: k[1] }; }) }, { name: 'title', label: 'Title', placeholder: 'e.g. Electrical licence' }, { name: 'number', label: 'Number' }, { name: 'expiry', label: 'Expiry date', type: 'date' }],
        extra: '<div class="cert-list">' + list + '</div><label class="lh-flabel" style="margin-top:14px">File (PDF, JPG or PNG, optional)</label><input type="file" id="certFile" accept=".pdf,.jpg,.jpeg,.png">',
        onOpen: function (el) {
          el.addEventListener('click', async function (e) {
            var del = e.target.closest('[data-cdel]'), view = e.target.closest('[data-cview]');
            if (del) { var id = del.getAttribute('data-cdel'), cert = mine.filter(function (x) { return x.id === id; })[0]; var r = await LH.sb.from('contractor_certificates').delete().eq('id', id); if (r.error) { UI.toast(LH.errMsg(r.error), 'error'); return; } if (cert && cert.file_path) await LH.sb.storage.from('contractor-certificates').remove([cert.file_path]); del.closest('.cert').remove(); UI.toast('Certificate deleted.'); refresh(); }
            if (view) { var cc = mine.filter(function (x) { return x.id === view.getAttribute('data-cview'); })[0]; var s = await LH.sb.storage.from('contractor-certificates').createSignedUrl(cc.file_path, 300); if (!s.error && s.data) window.open(s.data.signedUrl, '_blank', 'noopener'); }
          });
        },
        onSubmit: async function (v, form) {
          if (!v.title && !v.expiry) throw new Error('Enter a title and an expiry date, or close this window.');
          if (!v.title || !v.expiry) throw new Error('A certificate needs both a title and an expiry date.');
          var file = form.querySelector('#certFile').files[0], path = null;
          if (file) {
            var ext = (file.name.split('.').pop() || '').toLowerCase(); if (['pdf', 'jpg', 'jpeg', 'png'].indexOf(ext) === -1) throw new Error('Only PDF, JPG or PNG files.');
            path = c.id + '/' + Date.now() + '.' + ext;
            var up = await LH.sb.storage.from('contractor-certificates').upload(path, file, { contentType: file.type || undefined }); if (up.error) throw up.error;
          }
          var ins = await LH.sb.from('contractor_certificates').insert({ contractor_id: c.id, kind: v.kind, title: v.title, number: UI.nullIfBlank(v.number), expiry_date: v.expiry, file_path: path });
          if (ins.error) { if (path) await LH.sb.storage.from('contractor-certificates').remove([path]); throw ins.error; }
        },
      }).then(function (ok) { if (ok) { UI.toast('Certificate added.'); } refresh(); });
    }

    async function onClick(e) {
      var el = e.target.closest('[data-week],[data-type],[data-act],[data-manage],[data-booking]'); if (!el || !D) return;
      if (el.hasAttribute('data-week')) S.week = +el.getAttribute('data-week');
      else if (el.hasAttribute('data-type')) S.type = el.getAttribute('data-type');
      else if (el.hasAttribute('data-manage')) {
        var c = D.cons.filter(function (x) { return x.id === el.getAttribute('data-manage'); })[0]; if (!c) return;
        var pick = await UI.choose(c.name, 'What would you like to do?', [{ key: 'edit', label: 'Edit details', primary: true }, { key: 'certs', label: 'Certificates and compliance' }, { key: 'active', label: c.is_active ? 'Deactivate (hide from lists)' : 'Reactivate', danger: c.is_active }]);
        if (pick === 'edit') contractorForm(c); else if (pick === 'certs') certsForm(c);
        else if (pick === 'active') { var r = await LH.sb.from('contractors').update({ is_active: !c.is_active }).eq('id', c.id); if (r.error) UI.toast(LH.errMsg(r.error), 'error'); else { UI.toast(c.is_active ? 'Deactivated.' : 'Reactivated.'); refresh(); } }
        return;
      } else if (el.hasAttribute('data-booking')) {
        var b = D.bookings.filter(function (x) { return x.id === el.getAttribute('data-booking'); })[0]; if (!b) return;
        var pk = await UI.choose(b.title || 'Booking', fmt.date(keyOfNum(b.s)) + (b.e > b.s ? ' – ' + fmt.date(keyOfNum(b.e)) : ''), [{ key: 'open', label: 'Open project', primary: true }, { key: 'un', label: 'Remove this booking', danger: true }]);
        if (pk === 'open' && b.project) LH.go('projects/' + b.project);
        else if (pk === 'un') { var u = await LH.sb.rpc('unassign_contractor', { p_booking_id: b.id }); if (u.error) UI.toast(LH.errMsg(u.error), 'error'); else { UI.toast('Booking removed.'); refresh(); } }
        return;
      } else if (el.getAttribute('data-act') === 'add') { contractorForm(null); return; }
      else if (el.getAttribute('data-act') === 'csv') {
        UI.csv('contractors', [['Company', 'Trade', 'Contact', 'Phone', 'Email', 'ABN', 'Compliance']].concat(D.cons.filter(function (c) { return c.is_active; }).map(function (c) { return [c.name, (one(c.contractor_types) || {}).name || '', c.contact_name, c.phone, c.email, c.abn, compliance(c, D.certs.filter(function (x) { return x.contractor_id === c.id; })).text]; }))); return;
      }
      draw();
    }
    view.addEventListener('click', onClick);
    return { watch: ['contractors', 'contractor_certificates', 'contractor_types', 'bookings', 'booking_internal', 'projects', 'business_settings'], refresh: refresh, destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); } };
  }

  LH.screens.contractors = { title: 'Contractors', render: render };
  LH.contractorCompliance = compliance;
})();
