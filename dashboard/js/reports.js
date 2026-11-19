/* Reports — live headline figures and two quick charts, then a library of one-click reports
   (Excel-ready CSV, or a print view you can save as PDF), plus a custom export of any table.
   Everything is read straight from the app's database and refreshes when it changes. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;
  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function ok(r) { if (r.error) throw r.error; return r.data || []; }
  function dollars(c) { return c == null ? '' : Math.round(c / 100); }
  function dn(key) { return key ? Date.parse(String(key).slice(0, 10) + 'T00:00:00Z') / 86400000 : null; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' '); }
  function fin(p) { return one(p.project_financials) || {}; }
  function curStage(p) { return (p.project_stages || []).filter(function (s) { return s.status === 'current'; })[0]; }
  function site(p) { return [p.site_street, p.site_suburb].filter(Boolean).join(', '); }
  var STATUS = { ontime: 'On time', delayed: 'Delayed', halted: 'Halted' };
  var STAGES = [['new', 'New'], ['contacted', 'Contacted'], ['consulted', 'Consulted'], ['quoted', 'Quoted'], ['won', 'Won'], ['lost', 'Lost']];

  /* ---------- datasets: each turns the raw data into a table ---------- */
  var SETS = {
    portfolio: function (R) {
      return { title: 'Portfolio financial summary', headings: ['ID', 'Site', 'Client', 'Type', 'Status', 'Health', 'Stage', 'Progress %', 'Contract $', 'Original budget $', 'Budgeted margin', 'Start', 'Forecast completion', 'Project manager'],
        rows: R.projects.map(function (p) {
          var f = fin(p), c = f.contract_value_cents, b = f.original_budget_cents, cs = curStage(p);
          return [p.code, site(p), (one(p.clients) || {}).name || '', (one(p.project_types) || {}).name || '', p.status, STATUS[LH.projectStatus(p)], cs ? cs.name : '', p.percent_complete, dollars(c), dollars(b), c > 0 && b > 0 ? (((c - b) / c) * 100).toFixed(1) + '%' : '', p.start_date || '', p.forecast_completion_date || '', p.project_manager_name || ''];
        }) };
    },
    delivered: function (R) {
      return { title: 'Delivered projects', headings: ['ID', 'Site', 'Client', 'Type', 'Contract $', 'Start', 'Completed', 'Days taken', 'Forecast completion', 'Days vs forecast'],
        rows: R.projects.filter(function (p) { return p.status === 'completed' || p.completed_at; }).sort(function (a, b) { return String(b.completed_at) < String(a.completed_at) ? -1 : 1; }).map(function (p) {
          var done = p.completed_at ? fmt.dayKey(p.completed_at) : '', taken = done && p.start_date ? dn(done) - dn(p.start_date) : '', vs = done && p.forecast_completion_date ? dn(done) - dn(p.forecast_completion_date) : '';
          return [p.code, site(p), (one(p.clients) || {}).name || '', (one(p.project_types) || {}).name || '', dollars(fin(p).contract_value_cents), p.start_date || '', done, taken, p.forecast_completion_date || '', vs];
        }) };
    },
    leads: function (R) {
      var cons = {}; R.cons.forEach(function (c) { cons[c.lead_id] = c; });
      return { title: 'Leads & consultations', headings: ['Name', 'Email', 'Phone', 'Suburb', 'Type', 'Source', 'Status', 'Lost reason', 'Est. value $', 'Win chance %', 'Received', 'Consultation', 'Outcome'],
        rows: R.leads.map(function (l) {
          var c = cons[l.id], b = c && one(c.bookings);
          return [l.name, l.email, l.phone, l.suburb, (one(l.project_types) || {}).name || '', l.source, l.status, l.lost_reason || '', dollars(l.est_value_cents), l.probability_pct, fmt.dayKey(l.created_at), b && b.starts_at ? fmt.dayKey(b.starts_at) : '', c ? (c.outcome || 'scheduled') : ''];
        }) };
    },
    pipeline: function (R) {
      var now = dn(fmt.dayKey(new Date()));
      return { title: 'Open pipeline', headings: ['Name', 'Suburb', 'Type', 'Stage', 'Est. value $', 'Win chance %', 'Weighted value $', 'Received', 'Days open'],
        rows: R.leads.filter(function (l) { return l.status !== 'won' && l.status !== 'lost'; }).sort(function (a, b) { return (b.est_value_cents || 0) - (a.est_value_cents || 0); }).map(function (l) {
          return [l.name, l.suburb || '', (one(l.project_types) || {}).name || '', cap(l.status), dollars(l.est_value_cents), l.probability_pct == null ? '' : l.probability_pct, dollars((l.est_value_cents || 0) * (l.probability_pct || 0) / 100), fmt.dayKey(l.created_at), Math.max(0, Math.round(now - dn(fmt.dayKey(l.created_at))))];
        }) };
    },
    sources: function (R) {
      var g = {}; R.leads.forEach(function (l) { var k = l.source || 'unknown', x = g[k] = g[k] || { n: 0, open: 0, won: 0, lost: 0, wonv: 0, v: 0 }; x.n++; x.v += l.est_value_cents || 0; if (l.status === 'won') { x.won++; x.wonv += l.est_value_cents || 0; } else if (l.status === 'lost') x.lost++; else x.open++; });
      return { title: 'Lead sources', headings: ['Source', 'Leads', 'Open', 'Won', 'Lost', 'Win rate %', 'Won value $', 'Avg. est. value $'],
        rows: Object.keys(g).sort(function (a, b) { return g[b].n - g[a].n; }).map(function (k) { var x = g[k]; return [cap(k), x.n, x.open, x.won, x.lost, x.won + x.lost ? Math.round(x.won / (x.won + x.lost) * 100) : '', dollars(x.wonv), dollars(x.v / x.n)]; }) };
    },
    schedule: function (R) {
      var rows = [], crews = {};
      R.bookings.forEach(function (b) { var t = String(b.title || ''), cut = t.lastIndexOf(' — '); if (cut > 0) { crews[b.project_id] = crews[b.project_id] || {}; crews[b.project_id][t.slice(0, cut)] = t.slice(cut + 3); } });
      if (LH.schedulePlan) R.active.forEach(function (p) {
        if (!p.start_date) return;
        var pl = LH.schedulePlan.plan({ start_date: p.start_date }, R.stages.filter(function (s) { return s.project_id === p.id; }), crews[p.id] || {}), k = LH.schedulePlan.keyOfNum;
        pl.rows.forEach(function (x) { rows.push([p.code, p.site_street, x.name, x.status, x.crew, x.pS != null ? k(x.pS) : '', x.pE != null ? k(x.pE) : '', x.aS != null ? k(x.aS) : '', x.status === 'complete' && x.aE != null ? k(x.aE) : '', x.slip || 0]); });
      });
      return { title: 'Schedule status', headings: ['Project', 'Site', 'Stage', 'Status', 'Contractor', 'Planned start', 'Planned finish', 'Actual start', 'Actual finish', 'Days over plan'], rows: rows };
    },
    delayed: function (R) {
      return { title: 'Delayed and halted projects', headings: ['ID', 'Site', 'Client', 'Status', 'Days delayed', 'Stage', 'Progress %', 'Forecast completion', 'Project manager', 'Latest client message'],
        rows: R.projects.filter(function (p) { return p.status !== 'completed' && LH.projectStatus(p) !== 'ontime'; }).map(function (p) {
          var cs = curStage(p); return [p.code, site(p), (one(p.clients) || {}).name || '', STATUS[LH.projectStatus(p)], p.delay_days || 0, cs ? cs.name : '', p.percent_complete || 0, p.forecast_completion_date || '', p.project_manager_name || '', p.client_status_message || ''];
        }) };
    },
    contractors: function (R) {
      var from = Date.now() - 7 * 86400000;
      return { title: 'Contractor bookings', headings: ['Contractor', 'Trade', 'Phone', 'Project', 'Booking', 'First day', 'Last day', 'Compliance'],
        rows: R.bookings.filter(function (b) { return Date.parse(b.ends_at) >= from; }).sort(function (a, b) { return a.starts_at < b.starts_at ? -1 : 1; }).map(function (b) {
          var bi = one(b.booking_internal), c = bi && R.cmap[bi.contractor_id]; if (!c) return null;
          return [c.name, (one(c.contractor_types) || {}).name || '', c.phone || '', (one(b.projects) || {}).site_street || '', b.title, fmt.dayKey(b.starts_at), fmt.dayKey(new Date(new Date(b.ends_at).getTime() - 1).toISOString()), R.comp[c.id].text];
        }).filter(Boolean) };
    },
    certs: function (R) {
      var now = dn(fmt.dayKey(new Date()));
      return { title: 'Certificate expiry register', headings: ['Contractor', 'Trade', 'Certificate', 'Type', 'Number', 'Expires', 'Days left', 'Status'],
        rows: R.certs.filter(function (x) { return R.cmap[x.contractor_id]; }).sort(function (a, b) { return String(a.expiry_date) < String(b.expiry_date) ? -1 : 1; }).map(function (x) {
          var c = R.cmap[x.contractor_id], left = Math.round(dn(x.expiry_date) - now);
          return [c.name, (one(c.contractor_types) || {}).name || '', x.title, cap(x.kind), x.number || '', x.expiry_date, left, left < 0 ? 'Expired' : left <= 30 ? 'Expires soon' : 'Current'];
        }) };
    },
  };

  /* ---------- the library ---------- */
  var CATS = [['all', 'All'], ['financial', 'Financial'], ['sales', 'Sales'], ['delivery', 'Delivery'], ['contractors', 'Contractors']];
  var CAT = { financial: { name: 'Financial', icon: 'reports', c: 'steel' }, sales: { name: 'Sales', icon: 'leads', c: 'ok' }, delivery: { name: 'Delivery', icon: 'schedule', c: 'wait' }, contractors: { name: 'Contractors', icon: 'contractors', c: 'plum' } };
  var CARDS = [
    { id: 'portfolio', cat: 'financial', name: 'Portfolio financial summary', desc: 'Contract, budget and budgeted margin across every project.' },
    { id: 'delivered', cat: 'financial', name: 'Delivered projects', desc: 'Completed projects with the days taken and how they ran against forecast.' },
    { id: 'leads', cat: 'sales', name: 'Leads & consultations', desc: 'Every lead with source, status, value, consultation and lost reasons.' },
    { id: 'pipeline', cat: 'sales', name: 'Open pipeline', desc: 'Open leads by value with win chance, weighted value and days open.' },
    { id: 'sources', cat: 'sales', name: 'Lead sources', desc: 'Which sources bring leads, and which of them turn into work.' },
    { id: 'schedule', cat: 'delivery', name: 'Schedule status', desc: 'Planned against actual dates and days over plan for every stage.' },
    { id: 'delayed', cat: 'delivery', name: 'Delayed and halted projects', desc: 'Every project that is running late or on hold, with days delayed.' },
    { id: 'contractors', cat: 'contractors', name: 'Contractor bookings', desc: 'Who is booked where, with compliance status.' },
    { id: 'certs', cat: 'contractors', name: 'Certificate expiry register', desc: 'Every licence and certificate by expiry date, so nothing lapses on site.' },
  ];
  var TABLES = [['projects', 'Projects'], ['leads', 'Leads'], ['consultations', 'Consultations'], ['clients', 'Clients'], ['contractors', 'Contractors'], ['contractor_certificates', 'Contractor certificates'], ['bookings', 'Bookings'], ['project_documents', 'Document list'], ['project_milestones', 'Milestones'], ['project_risks', 'Risks & issues'], ['budget_variations', 'Budget variations'], ['site_inductions', 'Site inductions'], ['daily_checkins', 'Daily check-ins']];

  async function load() {
    var sb = LH.sb;
    var r = await Promise.all([
      sb.from('projects').select('id,code,name,status,health,percent_complete,start_date,forecast_completion_date,completed_at,delay_days,client_status_message,site_street,site_suburb,project_manager_name,clients(name),project_types(name),project_financials(contract_value_cents,original_budget_cents),project_stages(name,status)').is('deleted_at', null).order('code', { ascending: true }),
      sb.from('project_stages').select('project_id,id,position,name,status,started_at,completed_at,duration_days'),
      sb.from('bookings').select('title,project_id,starts_at,ends_at,projects(site_street),booking_internal(contractor_id)').eq('kind', 'contractor').neq('status', 'cancelled').order('starts_at', { ascending: true }).limit(3000),
      sb.from('contractors').select('id,name,phone,verified_checks,contractor_types(name)').eq('is_active', true).order('name'),
      sb.from('contractor_certificates').select('contractor_id,kind,title,number,expiry_date'),
      sb.from('leads').select('id,name,email,phone,source,status,lost_reason,suburb,est_value_cents,probability_pct,created_at,project_types(name)').order('created_at', { ascending: false }),
      sb.from('consultations').select('lead_id,outcome,bookings(starts_at)'),
    ]);
    var R = { projects: ok(r[0]), stages: ok(r[1]), bookings: ok(r[2]), contractors: ok(r[3]), certs: ok(r[4]), leads: ok(r[5]), cons: ok(r[6]) };
    R.pmap = {}; R.projects.forEach(function (p) { R.pmap[p.id] = p; });
    R.cmap = {}; R.contractors.forEach(function (c) { R.cmap[c.id] = c; });
    R.active = R.projects.filter(function (p) { return p.status === 'active' || p.status === 'on_hold'; });
    R.comp = {}; R.contractors.forEach(function (c) { R.comp[c.id] = LH.contractorCompliance ? LH.contractorCompliance(c, R.certs.filter(function (x) { return x.contractor_id === c.id; }).map(function (x) { return { kind: x.kind, expiry_date: x.expiry_date }; })) : { cls: '', text: '' }; });
    var sets = {}; Object.keys(SETS).forEach(function (k) { sets[k] = SETS[k](R); });
    return { R: R, sets: sets, kpi: kpis(R) };
  }

  function kpis(R) {
    var t = LH.today(), K = {};
    K.activeValue = 0; R.active.forEach(function (p) { K.activeValue += (fin(p).contract_value_cents || 0) / 100; });
    K.activeN = R.active.length;
    K.doneN = 0; K.doneValue = 0;
    R.projects.forEach(function (p) { if ((p.status === 'completed' || p.completed_at) && p.completed_at && +fmt.dayKey(p.completed_at).slice(0, 4) === t.y) { K.doneN++; K.doneValue += (fin(p).contract_value_cents || 0) / 100; } });
    K.won = R.leads.filter(function (l) { return l.status === 'won'; }).length; K.lost = R.leads.filter(function (l) { return l.status === 'lost'; }).length;
    K.win = K.won + K.lost ? Math.round(K.won / (K.won + K.lost) * 100) : null;
    K.stageN = {}; K.stageV = {}; STAGES.forEach(function (s) { K.stageN[s[0]] = 0; K.stageV[s[0]] = 0; }); R.leads.forEach(function (l) { if (K.stageN[l.status] != null) { K.stageN[l.status]++; K.stageV[l.status] += (l.est_value_cents || 0) / 100; } });
    K.weighted = 0; R.leads.forEach(function (l) { if (l.status !== 'won' && l.status !== 'lost') K.weighted += (l.est_value_cents || 0) / 100 * (l.probability_pct || 0) / 100; });
    K.health = { ontime: { n: 0, v: 0 }, delayed: { n: 0, v: 0 }, halted: { n: 0, v: 0 } };
    R.active.forEach(function (p) { var h = K.health[LH.projectStatus(p)]; h.n++; h.v += (fin(p).contract_value_cents || 0) / 100; });
    K.conN = R.contractors.length; K.conOk = R.contractors.filter(function (c) { return R.comp[c.id].cls === 'ok'; }).length;
    K.expiring = R.certs.filter(function (x) { var left = dn(x.expiry_date) - dn(fmt.dayKey(new Date())); return R.cmap[x.contractor_id] && left >= 0 && left <= 30; }).length;
    K.avgPct = R.active.length ? Math.round(R.active.reduce(function (a, p) { return a + (p.percent_complete || 0); }, 0) / R.active.length) : 0;
    return K;
  }

  function exportSet(D, id, as) {
    if (!D) { UI.toast('Still loading. Try again in a moment.'); return; }
    var d = D.sets[id]; if (!d) return;
    if (!d.rows.length) { UI.toast('Nothing to export yet.'); return; }
    if (as === 'pdf') UI.printSheet('Lotti Homes — ' + d.title, 'Generated ' + fmt.dateTime(new Date()), d.headings, d.rows);
    else UI.csv(d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), [d.headings].concat(d.rows));
  }

  function render(view) {
    var D = null, destroyed = false, drawn = false, S = { cat: 'all' };
    view.innerHTML = UI.skeleton([[100], [140, 24], [300, 24]]);

    async function refresh() {
      try { D = await load(); LH.touchSynced(); if (!destroyed) paint(); }
      catch (e) { console.error(e); if (!D && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load reports. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    refresh();

    function bars(items, max) {
      return items.map(function (x) {
        return '<div class="rp-row" style="--c:var(--' + x.c + ')"><span class="rl">' + esc(x.label) + '</span><div class="bar"><i style="width:' + (max ? Math.max(x.n ? 4 : 0, Math.round(x.n / max * 100)) : 0) + '%;background:var(--c)"></i></div><b class="rp-n">' + x.n + '</b><span class="rs">' + esc(x.sub || '') + '</span></div>';
      }).join('');
    }

    function paint() {
      var y = window.scrollY, K = D.kpi, R = D.R, t = LH.today();
      view.classList.toggle('enter', !drawn); drawn = true;
      var month = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(t.y, t.m, 1)));
      var av = fmt.moneyParts(K.activeValue), dv = fmt.moneyParts(K.doneValue);
      var stageMax = Math.max.apply(null, STAGES.map(function (s) { return K.stageN[s[0]]; }).concat([1]));
      var tone = { new: 'steel', contacted: 'steel', consulted: 'wait', quoted: 'wait', won: 'ok', lost: 'halt' };
      var healthMax = Math.max(K.health.ontime.n, K.health.delayed.n, K.health.halted.n, 1);
      var total = R.leads.length;

      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap">Exports &amp; insight</div><h1 class="ov-hello">Reports</h1><div class="hero-sub">Live figures from the app · Export any report as Excel or PDF</div></div>' +
        '<div class="ov-actions no-print"><button class="lh-btn" type="button" data-act="custom">Custom export</button><button class="lh-btn primary" type="button" data-act="all">Export all</button></div></div>' +
        UI.sect('At a glance') + '<div class="ov-glance">' +
        UI.stat('Active contract value', av.num, av.unit, K.activeN + (K.activeN === 1 ? ' live project' : ' live projects'), 'steel', 0, 'steel') +
        UI.stat('Delivered · ' + t.y, dv.num, dv.unit, K.doneN + (K.doneN === 1 ? ' project completed' : ' projects completed'), 'ok', 60, 'ok') +
        UI.stat('Lead win rate', K.win == null ? '—' : String(K.win), K.win == null ? '' : '%', K.won + ' won · ' + K.lost + ' lost', K.win != null && K.win >= 50 ? 'ok' : 'wait', 120, 'wait') +
        UI.stat('Contractors compliant', K.conOk + ' of ' + K.conN, '', K.expiring ? K.expiring + (K.expiring === 1 ? ' certificate expires' : ' certificates expire') + ' within 30 days' : 'No certificates expiring soon', K.conOk === K.conN ? 'ok' : 'halt', 180, K.conOk === K.conN ? 'ok' : 'halt') + '</div>' +
        UI.sect('Insights') + '<div class="rp-two">' +
        '<section class="lh-card lift wash" style="--wash:var(--steel)"><div class="lh-card-head"><h2 class="lh-card-title">Pipeline by stage</h2><span class="faint tiny">' + total + (total === 1 ? ' lead' : ' leads') + ' in total</span></div><div class="rp-rows">' +
        bars(STAGES.map(function (s) { return { label: s[1], n: K.stageN[s[0]], c: tone[s[0]], sub: fmt.money(K.stageV[s[0]]) }; }), stageMax) + '</div></section>' +
        '<section class="lh-card lift wash" style="--wash:var(--ok)"><div class="lh-card-head"><h2 class="lh-card-title">Project health</h2><span class="faint tiny">' + K.activeN + ' live ' + (K.activeN === 1 ? 'project' : 'projects') + ' · ' + K.avgPct + '% average progress</span></div><div class="rp-rows">' +
        bars([['ontime', 'On time', 'ok'], ['delayed', 'Delayed', 'wait'], ['halted', 'Halted', 'halt']].map(function (h) { var x = K.health[h[0]]; return { label: h[1], n: x.n, c: h[2], sub: fmt.money(x.v) }; }), healthMax) + '</div></section></div>' +
        '<section class="lh-card lift wash rp-feature" style="--wash:var(--steel);margin-top:1rem"><div class="rp-fl"><div class="cap">Featured · ' + esc(month) + ' portfolio summary</div>' +
        '<div class="rp-figs"><div><div class="faint tiny">Under contract</div><div class="serif">' + esc(av.num) + '<small>' + av.unit + '</small></div></div><div><div class="faint tiny">Weighted pipeline</div><div class="serif">' + esc(fmt.moneyParts(K.weighted).num) + '<small>' + fmt.moneyParts(K.weighted).unit + '</small></div></div><div><div class="faint tiny">Average progress</div><div class="serif">' + K.avgPct + '<small>%</small></div></div></div>' +
        '<div class="faint tiny" style="margin-top:0.875rem">Built from the app\'s data the moment you export it</div></div>' +
        '<div class="rp-btns no-print"><button class="lh-btn" type="button" data-card="portfolio" data-as="csv">Excel</button><button class="lh-btn primary" type="button" data-card="portfolio" data-as="pdf">Download PDF</button></div></section>' +
        UI.sect('Report library') +
        '<div class="chip-row rp-chips">' + UI.chips(CATS, S.cat, 'cat') + '</div>' +
        '<div class="rp-grid">' + CARDS.map(function (c, i) {
          var cat = CAT[c.cat], n = D.sets[c.id].rows.length;
          return '<section class="lh-card lift wash rp-card" data-cat="' + c.cat + '"' + (S.cat !== 'all' && S.cat !== c.cat ? ' hidden' : '') + ' style="--wash:var(--' + cat.c + ');animation-delay:' + Math.min(i * 45, 400) + 'ms">' +
            '<div class="rp-top"><span class="cap">' + cat.name + '</span></div>' +
            '<h2 class="lh-card-title">' + esc(c.name) + '</h2><p class="rp-desc">' + esc(c.desc) + '</p>' +
            '<div class="rp-foot"><div><div class="cap">' + (n === 1 ? 'Row' : 'Rows') + '</div><div class="rp-fmt rp-n">' + n + '</div></div>' +
            '<div class="rp-acts no-print"><button type="button" class="lh-btn sm" data-card="' + c.id + '" data-as="csv">Excel</button><button type="button" class="lh-btn sm primary" data-card="' + c.id + '" data-as="pdf">PDF</button></div></div></section>';
        }).join('') + '</div>';
      window.scrollTo(0, y);
    }

    async function onClick(e) {
      var el = e.target.closest('[data-card],[data-act],[data-cat].lh-chip'); if (!el) return;
      if (el.classList.contains('lh-chip')) {
        S.cat = el.getAttribute('data-cat');
        LH.$$('.rp-chips .lh-chip', view).forEach(function (b) { b.classList.toggle('on', b === el); });
        LH.$$('.rp-card', view).forEach(function (c) { c.hidden = S.cat !== 'all' && c.getAttribute('data-cat') !== S.cat; });
        return;
      }
      if (el.hasAttribute('data-card')) { exportSet(D, el.getAttribute('data-card'), el.getAttribute('data-as')); return; }
      if (el.getAttribute('data-act') === 'all') {
        if (!D) { UI.toast('Still loading. Try again in a moment.'); return; }
        var ids = CARDS.map(function (c) { return c.id; }).filter(function (id) { return D.sets[id].rows.length; });
        if (!ids.length) { UI.toast('Nothing to export yet.'); return; }
        var as = await UI.choose('Export all reports', ids.length + ' reports with data.', [{ key: 'csv', label: 'Excel (one file per report)', primary: true }, { key: 'pdf', label: 'PDF (one combined document)' }]);
        if (!as) return;
        if (as === 'pdf') { UI.printSheets('Lotti Homes — All reports', 'Generated ' + fmt.dateTime(new Date()), ids.map(function (id) { return D.sets[id]; })); return; }
        UI.toast('Downloading ' + ids.length + ' files…');
        ids.forEach(function (id, i) { setTimeout(function () { exportSet(D, id, 'csv'); }, i * 450); });
        return;
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
    return { watch: ['projects', 'project_stages', 'project_financials', 'leads', 'consultations', 'bookings', 'contractors', 'contractor_certificates'], refresh: refresh,
      destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); } };
  }

  LH.screens.reports = { title: 'Reports', render: render };
})();
