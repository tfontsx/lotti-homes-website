/* Compliance — the site induction and daily check-in forms contractors submit from the
   website (moved here from the old admin portal). Read-only, plus delete and CSV export. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;

  var INDUCTION = {
    company_safety: 'Company Safety', fit_for_work: 'Fit for Work', competency_licensing: 'Competency & Licensing', white_card: 'White Card',
    ppe: 'PPE', swms: 'SWMS', site_rules: 'Site Rules', heights: 'Working at Heights', ladders: 'Ladders', scaffolding: 'Scaffolding',
    ewp: 'Elevated Work Platforms', excavations: 'Excavations', electrical: 'Electrical Safety', manual_handling: 'Manual Handling',
    hazardous_chemicals: 'Hazardous Chemicals', asbestos: 'Asbestos Awareness', silica_dust: 'Silica Dust', lead_paint: 'Lead Paint',
    plant_equipment: 'Plant & Equipment', housekeeping: 'Housekeeping', environmental: 'Environmental Protection',
    incident_reporting: 'Incident Reporting', emergency_procedures: 'Emergency Procedures', stop_work_authority: 'Stop Work Authority',
  };
  var CHECKIN = {
    fit_for_work: 'Fit for Work', ppe_worn: 'PPE', swms_reviewed: 'SWMS Reviewed', hazards_checked: 'Work Area & Hazards',
    plant_prestart: 'Plant Pre-Start', weather_suitable: 'Weather',
  };
  var TICK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9 9l6 6M15 9l-6 6"/></svg>';
  var CHEV = '<svg class="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';

  function flags(responses) {
    if (!responses) return 0;
    return Object.keys(responses).filter(function (k) { return responses[k] && responses[k].answer === 'no'; }).length;
  }
  function inRange(dateStr, range) {
    if (range === 'all' || !dateStr) return true;
    var t = LH.today(), today = Date.UTC(t.y, t.m, t.d), d = Date.parse(dateStr + 'T00:00:00Z');
    if (range === 'today') return d === today;
    if (range === 'week') return d >= today - 6 * 86400000 && d <= today;
    if (range === 'month') { var x = new Date(d); return x.getUTCFullYear() === t.y && x.getUTCMonth() === t.m; }
    return true;
  }
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from running anything pasted into a form
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function render(view) {
    var S = { tab: 'inductions', range: 'all', search: '', inductions: [], checkins: [], loaded: false, page: 0, pageSize: 6 };
    var destroyed = false, drawn = false;
    view.classList.add('fit');

    view.innerHTML = '<div class="lh-skel" style="height:5.625rem;margin-top:0.625rem"></div><div class="lh-skel" style="height:22.5rem;margin-top:1.25rem"></div>';

    async function refresh() {
      var sb = LH.sb;
      var r = await Promise.all([
        sb.from('site_inductions').select('*').order('created_at', { ascending: false }).limit(2000),
        sb.from('daily_checkins').select('*').order('created_at', { ascending: false }).limit(2000),
      ]);
      if (destroyed) return;
      if (r[0].error || r[1].error) {
        view.innerHTML = '<div class="lh-err">Couldn\'t load submissions. ' + esc((r[0].error || r[1].error).message || '') + '</div>';
        return;
      }
      S.inductions = r[0].data || []; S.checkins = r[1].data || []; S.loaded = true;
      LH.touchSynced();
      draw();
    }

    function filtered() {
      var list = S.tab === 'inductions' ? S.inductions : S.checkins;
      var dateField = S.tab === 'inductions' ? 'induction_date' : 'checkin_date';
      var term = S.search.trim().toLowerCase();
      return list.filter(function (r) {
        var hit = !term || (r.worker_name || '').toLowerCase().indexOf(term) !== -1 || (r.company || '').toLowerCase().indexOf(term) !== -1 ||
          (r.trade || '').toLowerCase().indexOf(term) !== -1 || (r.site_address || '').toLowerCase().indexOf(term) !== -1;
        return hit && inRange(r[dateField], S.range);
      });
    }

    function answers(responses, labels) {
      var h = '';
      Object.keys(labels).forEach(function (id) {
        var e = responses && responses[id]; if (!e) return;
        var a = String(e.answer || '').toLowerCase(), mark;
        if (a === 'yes') mark = '<span class="mk yes" role="img" aria-label="Yes">' + TICK + '</span>';
        else if (a === 'no') mark = '<span class="mk no" role="img" aria-label="No">' + CROSS + '</span>';
        else mark = '<span class="mk">' + esc(e.answer || '—') + '</span>';
        h += '<div class="' + (a === 'no' ? 'bad' : a === 'yes' ? 'good' : '') + '"><span>' + esc(labels[id]) + '</span>' + mark +
          (e.comment ? '<span class="cm">“' + esc(e.comment) + '”</span>' : '') + '</div>';
      });
      return h;
    }

    function row(r) {
      var ind = S.tab === 'inductions', f = flags(r.responses);
      var meta = ind ? [r.company, r.trade, fmt.dateY(r.induction_date)] : [r.company, r.site_address, fmt.dateY(r.checkin_date)];
      var decl = ind ? (r.declaration_completed_induction && r.declaration_understand_whs && r.declaration_agree_policies && r.declaration_report_hazards && r.declaration_understand_consequences ? 'Fully signed' : 'Incomplete') : null;
      var dl = '';
      if (ind) dl += '<div><dt>Supervisor</dt><dd>' + esc(r.supervisor) + '</dd></div>';
      dl += '<div><dt>Signed</dt><dd>' + esc(r.signature_name) + '</dd></div><div><dt>Submitted</dt><dd>' + esc(fmt.dateTime(r.created_at)) + '</dd></div>';
      if (decl) dl += '<div><dt>Declaration</dt><dd>' + decl + '</dd></div>';
      if (!ind && r.hazards_identified) dl += '<div><dt>Hazards identified</dt><dd>' + esc(r.hazards_identified) + '</dd></div>';
      if (!ind && r.incidents_near_misses) dl += '<div><dt>Incidents / near misses</dt><dd>' + esc(r.incidents_near_misses) + '</dd></div>';
      if (!ind && r.additional_notes) dl += '<div><dt>Additional notes</dt><dd>' + esc(r.additional_notes) + '</dd></div>';
      return '<details class="cp-row"><summary><span class="st ' + (f ? 'bad' : 'ok') + '" aria-label="' + (f ? f + ' flagged' : 'All clear') + '">' + (f ? CROSS : TICK) + '</span>' +
        '<div class="main"><div class="n">' + esc(r.worker_name) + '</div><div class="faint" style="font-size:max(11.5px, 0.7812rem)">' + esc(meta.filter(Boolean).join(' · ')) + '</div></div>' +
        (f ? '<span class="lh-pill halt"><i></i>' + f + ' flagged</span>' : '') + CHEV + '</summary>' +
        '<div class="cp-body"><dl>' + dl + '</dl><div class="cp-ans">' + answers(r.responses, ind ? INDUCTION : CHECKIN) + '</div>' +
        '<div style="margin-top:0.875rem"><button type="button" class="lh-btn" data-del="' + esc(r.id) + '" style="height:2rem;color:var(--halt)">Delete submission</button></div></div></details>';
    }

    function draw() {
      var tFlags = 0, wFlags = 0, today = LH.fmt.dayKey(new Date());
      var tIn = S.inductions.filter(function (r) { return r.induction_date === today; }).length;
      var tCk = S.checkins.filter(function (r) { return r.checkin_date === today; }).length;
      S.inductions.forEach(function (r) { var f = flags(r.responses); tFlags += f; if (f && inRange(r.induction_date, 'week')) wFlags += f; });
      S.checkins.forEach(function (r) { var f = flags(r.responses); tFlags += f; if (f && inRange(r.checkin_date, 'week')) wFlags += f; });
      var list = filtered(), total = (S.tab === 'inductions' ? S.inductions : S.checkins).length;
      var pages = Math.max(1, Math.ceil(list.length / S.pageSize)); S.page = Math.max(0, Math.min(S.page, pages - 1));
      var from = S.page * S.pageSize, shown = list.slice(from, from + S.pageSize);
      var origin = location.origin;

      view.classList.toggle('enter', !drawn); drawn = true;
      var scroll = window.scrollY, hadFocus = document.activeElement && document.activeElement.id === 'cpSearch';
      var openIds = LH.$$('details[open] [data-del]', view).map(function (b) { return b.getAttribute('data-del'); });

      view.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;flex-wrap:wrap;margin-top:0.625rem"><div><div class="cap" style="margin-bottom:0.625rem">Compliance</div>' +
        '<h1 class="ov-hello" style="font-size:max(34.96px, 2.375rem)">Site <em>safety</em></h1><div class="muted" style="margin-top:0.5rem;max-width:38.75rem">Inductions and daily check-ins submitted by contractors from the website forms.</div></div>' +
        '<div class="no-print" style="display:flex;gap:0.625rem"><button class="lh-btn" type="button" id="cpCsv">Export CSV</button></div></div>' +
        '<div class="cp-stats" style="margin-top:1.375rem">' +
        UI.stat('Total inductions', String(S.inductions.length), '', esc(tIn + ' today'), 'steel', 0, 'steel') + UI.stat('Total check-ins', String(S.checkins.length), '', esc(tCk + ' today'), 'ok', 60, 'ok') + UI.stat('Flagged answers', String(tFlags), '', esc(wFlags + ' this week'), tFlags ? 'halt' : 'ok', 120, tFlags ? 'halt' : 'wait') + '</div>' +
        '<div class="lh-card" style="margin-bottom:1.125rem"><div class="cap" style="margin-bottom:0.875rem">Form links — print these as QR codes for site</div><div class="cp-link">' +
        link('Site induction', origin + '/site-induction.html') + link('Daily check-in', origin + '/daily-checkin.html') + '</div></div>' +
        '<div class="cp-tools"><div class="lh-seg">' + [['inductions', 'Site inductions'], ['checkins', 'Daily check-ins']].map(function (t) { return '<button type="button" data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
        '<div class="lh-seg">' + [['all', 'All time'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(function (t) { return '<button type="button" data-range="' + t[0] + '" class="' + (S.range === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
        '<input class="lh-input" id="cpSearch" type="search" placeholder="Search by worker, company or site" value="' + esc(S.search) + '" aria-label="Search submissions"></div>' +
        '<div class="cp-list" id="cpList">' + (shown.length ? shown.map(row).join('') : '<div class="lh-card lh-empty">No submissions match these filters.</div>') + '</div>' +
        '<div class="cp-pager"><span class="faint">' + (list.length ? (from + 1) + '–' + (from + shown.length) + ' of ' + list.length : '0') + ' submission' + (list.length === 1 ? '' : 's') + (list.length !== total ? ' (filtered from ' + total + ')' : '') + '</span>' +
        (pages > 1 ? '<div class="cp-pg"><button type="button" class="lh-btn sm" data-pg="-1"' + (S.page === 0 ? ' disabled' : '') + '>Back</button><span class="cp-pn">Page ' + (S.page + 1) + ' of ' + pages + '</span><button type="button" class="lh-btn sm" data-pg="1"' + (S.page >= pages - 1 ? ' disabled' : '') + '>Next</button></div>' : '') + '</div>';

      // Fit as many rows as the screen allows, so the page itself never scrolls.
      var box = LH.$('#cpList', view), want = 8;
      if (box && window.innerWidth > 820) {
        var r0 = LH.$('.cp-row', box), rowH = (r0 ? r0.offsetHeight : 64) + 10;
        want = Math.max(3, Math.floor(box.clientHeight / rowH));
      }
      if (want !== S.pageSize) { var first = S.page * S.pageSize; S.pageSize = want; S.page = Math.floor(first / want); draw(); return; }

      openIds.forEach(function (id) { var b = LH.$('[data-del="' + id + '"]', view); if (b) b.closest('details').open = true; });
      window.scrollTo(0, scroll);
      if (hadFocus) { var i = LH.$('#cpSearch'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }
    function link(label, url) {
      return '<div class="cp-linkcard"><div class="lt"><div class="ln">' + esc(label) + '</div><a class="lh-link" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url.replace(/^https?:\/\//, '')) + '</a></div>' +
        '<div class="la"><a class="lh-btn sm" href="' + esc(url) + '" target="_blank" rel="noopener">Open</a><button type="button" class="lh-btn sm" data-copy="' + esc(url) + '">Copy</button></div></div>';
    }

    async function onClick(e) {
      var el = e.target.closest('[data-tab],[data-range],[data-copy],[data-del],[data-pg],#cpCsv');
      if (!el) return;
      if (el.hasAttribute('data-pg')) { S.page += Number(el.getAttribute('data-pg')); draw(); }
      else if (el.hasAttribute('data-tab')) { S.tab = el.getAttribute('data-tab'); S.page = 0; draw(); }
      else if (el.hasAttribute('data-range')) { S.range = el.getAttribute('data-range'); S.page = 0; draw(); }
      else if (el.hasAttribute('data-copy')) {
        try { await navigator.clipboard.writeText(el.getAttribute('data-copy')); el.textContent = 'Copied'; setTimeout(function () { el.textContent = 'Copy'; }, 1400); }
        catch (x) { el.textContent = 'Press ⌘C'; }
      } else if (el.hasAttribute('data-del')) {
        e.preventDefault();
        if (!confirm('Delete this submission permanently? This can\'t be undone.')) return;
        var table = S.tab === 'inductions' ? 'site_inductions' : 'daily_checkins';
        var res = await LH.sb.from(table).delete().eq('id', el.getAttribute('data-del'));
        if (res.error) { alert('Couldn\'t delete it: ' + res.error.message); return; }
        refresh();
      } else if (el.id === 'cpCsv') csv();
    }
    function onInput(e) { if (e.target.id === 'cpSearch') { S.search = e.target.value; S.page = 0; draw(); } }
    var rz = null;
    function onResize() { clearTimeout(rz); rz = setTimeout(function () { if (!destroyed && S.loaded) draw(); }, 150); }
    window.addEventListener('resize', onResize);
    view.addEventListener('click', onClick); view.addEventListener('input', onInput);

    function csv() {
      var ind = S.tab === 'inductions', list = filtered();
      var cols = ind ? ['induction_date', 'worker_name', 'company', 'trade', 'supervisor', 'signature_name', 'created_at'] : ['checkin_date', 'worker_name', 'company', 'site_address', 'hazards_identified', 'incidents_near_misses', 'additional_notes', 'signature_name', 'created_at'];
      var labels = ind ? INDUCTION : CHECKIN, keys = Object.keys(labels);
      var out = [cols.concat(['flagged']).concat(keys.map(function (k) { return labels[k]; })).map(csvCell).join(',')];
      list.forEach(function (r) {
        out.push(cols.map(function (c) { return csvCell(r[c]); }).concat([csvCell(flags(r.responses))]).concat(keys.map(function (k) { return csvCell(r.responses && r.responses[k] ? r.responses[k].answer : ''); })).join(','));
      });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([out.join('\n')], { type: 'text/csv' }));
      a.download = (ind ? 'site-inductions' : 'daily-checkins') + '-' + LH.fmt.dayKey(new Date()) + '.csv';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }

    refresh().catch(function (e) { console.error(e); view.innerHTML = '<div class="lh-err">Couldn\'t load submissions.</div>'; });
    return { watch: ['site_inductions', 'daily_checkins'], refresh: refresh, destroy: function () { destroyed = true; clearTimeout(rz); window.removeEventListener('resize', onResize); view.classList.remove('fit'); view.removeEventListener('click', onClick); view.removeEventListener('input', onInput); } };
  }

  LH.screens.compliance = { title: 'Compliance', render: render };
})();
