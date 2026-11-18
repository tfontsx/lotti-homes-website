/* Reports — one-click exports of live data (Excel-ready CSV, or a print view you can save as PDF),
   plus a custom export of any table. Everything is read straight from the app's database. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;
  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function ok(r) { if (r.error) throw r.error; return r.data || []; }
  function dollars(c) { return c == null ? '' : Math.round(c / 100); }

  /* ---------- datasets ---------- */
  var DATA = {
    portfolio: async function () {
      var sb = LH.sb;
      var r = await Promise.all([
        sb.from('projects').select('code,name,status,health,percent_complete,start_date,forecast_completion_date,site_street,site_suburb,project_manager_name,clients(name),project_types(name),project_financials(contract_value_cents,original_budget_cents,forecast_cost_cents,actual_cost_cents),project_stages(name,status)').is('deleted_at', null).order('code', { ascending: true }),
      ]);
      var rows = ok(r[0]).map(function (p) {
        var f = one(p.project_financials) || {}, cur = (p.project_stages || []).filter(function (s) { return s.status === 'current'; })[0], contract = f.contract_value_cents, budget = f.original_budget_cents;
        var margin = contract > 0 && budget > 0 ? (((contract - budget) / contract) * 100).toFixed(1) + '%' : '';
        return [p.code, [p.site_street, p.site_suburb].filter(Boolean).join(', '), (one(p.clients) || {}).name || '', (one(p.project_types) || {}).name || '', p.status, LH.projectStatus(p), cur ? cur.name : '', p.percent_complete, dollars(contract), dollars(budget), margin, p.start_date || '', p.forecast_completion_date || '', p.project_manager_name || ''];
      });
      return { title: 'Portfolio financial summary', headings: ['ID', 'Site', 'Client', 'Type', 'Status', 'Health', 'Stage', 'Progress %', 'Contract $', 'Original budget $', 'Budgeted margin', 'Start', 'Forecast completion', 'Project manager'], rows: rows };
    },
    leads: async function () {
      var sb = LH.sb;
      var r = await Promise.all([sb.from('leads').select('id,name,email,phone,source,status,lost_reason,suburb,est_value_cents,probability_pct,created_at,project_types(name)').order('created_at', { ascending: false }), sb.from('consultations').select('lead_id,outcome,bookings(starts_at)')]);
      var cons = {}; ok(r[1]).forEach(function (c) { cons[c.lead_id] = c; });
      var rows = ok(r[0]).map(function (l) {
        var c = cons[l.id], b = c && one(c.bookings);
        return [l.name, l.email, l.phone, l.suburb, (one(l.project_types) || {}).name || '', l.source, l.status, l.lost_reason || '', dollars(l.est_value_cents), l.probability_pct, fmt.dayKey(l.created_at), b && b.starts_at ? fmt.dayKey(b.starts_at) : '', c ? (c.outcome || 'scheduled') : ''];
      });
      return { title: 'Leads & consultations', headings: ['Name', 'Email', 'Phone', 'Suburb', 'Type', 'Source', 'Status', 'Lost reason', 'Est. value $', 'Win chance %', 'Received', 'Consultation', 'Outcome'], rows: rows };
    },
    schedule: async function () {
      var sb = LH.sb;
      var r = await Promise.all([sb.from('projects').select('id,code,site_street,start_date').is('deleted_at', null).in('status', ['active', 'on_hold']).order('code', { ascending: true }), sb.from('project_stages').select('project_id,id,position,name,status,started_at,completed_at,duration_days'), sb.from('bookings').select('title,project_id').eq('kind', 'contractor').neq('status', 'cancelled')]);
      var stages = ok(r[1]), crews = {};
      ok(r[2]).forEach(function (b) { var t = String(b.title || ''), cut = t.lastIndexOf(' — '); if (cut > 0) { crews[b.project_id] = crews[b.project_id] || {}; crews[b.project_id][t.slice(0, cut)] = t.slice(cut + 3); } });
      var rows = [];
      ok(r[0]).forEach(function (p) {
        if (!p.start_date) return;
        var pl = LH.schedulePlan.plan({ start_date: p.start_date }, stages.filter(function (s) { return s.project_id === p.id; }), crews[p.id] || {}), k = LH.schedulePlan.keyOfNum;
        pl.rows.forEach(function (x) { rows.push([p.code, p.site_street, x.name, x.status, x.crew, x.pS != null ? k(x.pS) : '', x.pE != null ? k(x.pE) : '', x.aS != null ? k(x.aS) : '', x.status === 'complete' && x.aE != null ? k(x.aE) : '', x.slip || 0]); });
      });
      return { title: 'Schedule status', headings: ['Project', 'Site', 'Stage', 'Status', 'Contractor', 'Planned start', 'Planned finish', 'Actual start', 'Actual finish', 'Days over plan'], rows: rows };
    },
    contractors: async function () {
      var sb = LH.sb, from = new Date(Date.now() - 7 * 86400000).toISOString();
      var r = await Promise.all([sb.from('contractors').select('id,name,phone,verified_checks,contractor_types(name)').eq('is_active', true).order('name'), sb.from('contractor_certificates').select('contractor_id,kind,expiry_date'), sb.from('bookings').select('title,starts_at,ends_at,projects(site_street),booking_internal(contractor_id)').eq('kind', 'contractor').neq('status', 'cancelled').gte('ends_at', from).order('starts_at', { ascending: true })]);
      var cons = {}; ok(r[0]).forEach(function (c) { cons[c.id] = c; });
      var certs = ok(r[1]), rows = [];
      ok(r[2]).forEach(function (b) {
        var bi = one(b.booking_internal), c = bi && cons[bi.contractor_id]; if (!c) return;
        var cp = LH.contractorCompliance(c, certs.filter(function (x) { return x.contractor_id === c.id; }).map(function (x) { return { kind: x.kind, expiry_date: x.expiry_date }; }));
        rows.push([c.name, (one(c.contractor_types) || {}).name || '', c.phone || '', (one(b.projects) || {}).site_street || '', b.title, fmt.dayKey(b.starts_at), fmt.dayKey(new Date(new Date(b.ends_at).getTime() - 1).toISOString()), cp.text]);
      });
      return { title: 'Contractor bookings', headings: ['Contractor', 'Trade', 'Phone', 'Project', 'Booking', 'First day', 'Last day', 'Compliance'], rows: rows };
    },
  };
  var CARDS = [
    { id: 'portfolio', name: 'Portfolio financial summary', desc: 'Contract, budget and budgeted margin across every project', formats: 'PDF · Excel', pdf: true },
    { id: 'leads', name: 'Leads & consultations', desc: 'Every lead with source, status, value, consultation and lost reasons', formats: 'Excel', pdf: false },
    { id: 'schedule', name: 'Schedule status', desc: 'Planned vs actual dates and days over plan for every stage', formats: 'PDF · Excel', pdf: true },
    { id: 'contractors', name: 'Contractor bookings', desc: 'Who is booked where, with compliance status', formats: 'Excel', pdf: false },
  ];
  var TABLES = [['projects', 'Projects'], ['leads', 'Leads'], ['clients', 'Clients'], ['contractors', 'Contractors'], ['bookings', 'Bookings'], ['project_documents', 'Document list'], ['project_milestones', 'Milestones'], ['project_risks', 'Risks & issues']];

  async function exportCard(id, as) {
    UI.toast('Preparing…');
    try {
      var d = await DATA[id]();
      if (as === 'pdf') UI.printSheet('Lotti Homes — ' + d.title, 'Generated ' + fmt.dateTime(new Date()), d.headings, d.rows);
      else UI.csv(d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), [d.headings].concat(d.rows));
    } catch (e) { console.error(e); UI.toast(LH.errMsg(e), 'error'); }
  }

  function render(view) {
    var drawn = false, snap = null, destroyed = false;
    function paint() {
      view.classList.toggle('enter', !drawn); drawn = true;
      var t = LH.today(), month = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(t.y, t.m, 1)));
      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap">Exports</div><h1 class="ov-hello">Reports</h1><div class="hero-sub">Every field captured in the app, ready to export</div></div>' +
        '<div class="ov-actions no-print"><button class="lh-btn primary" type="button" data-act="custom">Custom export</button></div></div>' +
        UI.sect('Latest') +
        '<section class="lh-card lift rp-latest"><div><div class="cap">Live snapshot · ' + esc(month) + ' portfolio summary</div><div class="rp-big serif">' + (snap ? esc(snap) : '<span class="faint">Loading…</span>') + '</div><div class="faint tiny" style="margin-top:10px">Built from the app\'s data the moment you export it</div></div>' +
        '<div class="rp-btns"><button class="lh-btn" type="button" data-card="portfolio" data-as="csv">Excel</button><button class="lh-btn primary" type="button" data-card="portfolio" data-as="pdf">Download PDF</button></div></section>' +
        UI.sect('All reports') + '<div class="rp-grid">' + CARDS.map(function (c, i) {
          return '<section class="lh-card lift rp-card" style="animation-delay:' + i * 60 + 'ms"><h2 class="lh-card-title">' + esc(c.name) + '</h2><p class="faint" style="margin:8px 0 0;font-size:12px;line-height:1.5">' + esc(c.desc) + '</p><div class="rp-foot"><div><div class="cap">On demand</div><div class="rp-fmt">' + esc(c.formats) + '</div></div><button type="button" class="lh-btn" data-card="' + c.id + '" data-pdf="' + (c.pdf ? 1 : 0) + '">Export</button></div></section>';
        }).join('') + '</div>';
    }
    paint();
    LH.sb.from('projects').select('status,project_financials(contract_value_cents)').is('deleted_at', null).in('status', ['active', 'on_hold']).then(function (r) {
      if (destroyed || r.error) return;
      var total = 0; (r.data || []).forEach(function (p) { total += ((one(p.project_financials) || {}).contract_value_cents || 0) / 100; });
      snap = 'Right now · ' + (r.data || []).length + (r.data && r.data.length === 1 ? ' project' : ' projects') + ' · ' + fmt.money(total) + ' under contract'; paint();
    });

    async function onClick(e) {
      var el = e.target.closest('[data-card],[data-act]'); if (!el) return;
      if (el.hasAttribute('data-card')) {
        var id = el.getAttribute('data-card'), as = el.getAttribute('data-as');
        if (!as) { as = 'csv'; if (el.getAttribute('data-pdf') === '1') { as = await UI.choose('Export ' + CARDS.filter(function (c) { return c.id === id; })[0].name, 'Choose a format.', [{ key: 'csv', label: 'Excel (CSV)', primary: true }, { key: 'pdf', label: 'PDF (opens the print view)' }]); if (!as) return; } }
        exportCard(id, as); return;
      }
      if (el.getAttribute('data-act') === 'custom') {
        UI.form({
          title: 'Custom export', intro: 'Every column of a table, as a spreadsheet.', submitLabel: 'Download',
          fields: [{ name: 'table', label: 'What to export', type: 'select', options: TABLES.map(function (x) { return { v: x[0], l: x[1] }; }), required: true, span: 2 }],
          onSubmit: async function (v) {
            var r = await LH.sb.from(v.table).select('*').limit(5000); if (r.error) throw r.error;
            var data = r.data || []; if (!data.length) throw new Error('That table is empty.');
            var skip = { auth_user_id: 1, token_hash: 1, row_version: 1 }, cols = Object.keys(data[0]).filter(function (k) { return !skip[k]; });
            UI.csv(v.table, [cols].concat(data.map(function (row) { return cols.map(function (c) { var x = row[c]; return x != null && typeof x === 'object' ? JSON.stringify(x) : x; }); })));
          },
        });
      }
    }
    view.addEventListener('click', onClick);
    return { destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); } };
  }

  LH.screens.reports = { title: 'Reports', render: render };
})();
