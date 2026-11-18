/* Projects — the portfolio table, and each project's detail page: progress, owner-only
   financials, this week on site, milestones, risks, notes, photos and documents.
   Writes use the same tables and database functions as the app. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;

  var ST = { ontime: { cls: 'ok', label: 'On time', color: 'var(--ok)' }, delayed: { cls: 'wait', label: 'Delayed', color: 'var(--wait)' }, halted: { cls: 'halt', label: 'Halted', color: 'var(--halt)' } };
  var STATES = ['SA', 'NSW', 'VIC', 'QLD', 'WA', 'TAS', 'NT', 'ACT'];
  var SEV = { high: ['halt', 'High'], medium: ['wait', 'Medium'], low: ['', 'Low'] };
  var DOC_ICON = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'IMG' };
  var DOC_MIMES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dwg: 'application/octet-stream' };

  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function money(n) { return n ? fmt.money(n) : '—'; }
  function mapProject(r, stages, miles) {
    var fin = one(r.project_financials) || {}, cl = one(r.clients) || {}, ty = one(r.project_types) || {};
    var mine = (stages || []).filter(function (s) { return s.project_id === r.id; }).sort(function (a, b) { return a.position - b.position; });
    var cur = mine.filter(function (s) { return s.status === 'current'; })[0];
    var nm = (miles || []).filter(function (m) { return m.project_id === r.id; })[0];
    return {
      created: r.created_at, mgr: r.project_manager_name || '', nextMile: nm ? nm.title : '', nextMileDate: nm ? nm.due_date : null,
      id: r.id, code: r.code, name: r.name, status: r.status, health: r.health, st: LH.projectStatus(r), pct: r.percent_complete || 0, delay: r.delay_days, note: r.client_status_message,
      start: r.start_date, forecastDate: r.forecast_completion_date, completedAt: r.completed_at, street: r.site_street || r.name, suburb: r.site_suburb || '',
      client: cl.name || '', type: ty.name || '', stage: cur ? cur.name : '', stageCount: mine.length, stagePos: cur ? cur.position : 0,
      contract: (fin.contract_value_cents || 0) / 100, budget: (fin.original_budget_cents || 0) / 100, forecast: (fin.forecast_cost_cents || 0) / 100, actual: (fin.actual_cost_cents || 0) / 100,
    };
  }
  function margin(p) {
    if (p.contract > 0 && p.forecast > 0) return { pct: ((p.contract - p.forecast) / p.contract) * 100, kind: 'forecast' };
    if (p.contract > 0 && p.budget > 0) return { pct: ((p.contract - p.budget) / p.contract) * 100, kind: 'budget' };
    return null;
  }
  function daysLeft(p) {
    if (p.status === 'completed' || !p.forecastDate) return { text: '—', cls: '' };
    var d = UI.daysUntil(p.forecastDate);
    if (d < 0) return { text: (-d) + (d === -1 ? ' day over' : ' days over'), cls: 'haltc' };
    if (d === 0) return { text: 'Today', cls: 'warn' };
    return { text: d + (d === 1 ? ' day' : ' days'), cls: d <= 14 ? 'warn' : '' };
  }
  function statusLabel(p) {
    if (p.status === 'completed') return { cls: '', text: 'Complete' };
    var s = ST[p.st];
    if (p.st === 'delayed' && p.delay) return { cls: s.cls, text: p.delay + (p.delay === 1 ? ' day behind' : ' days behind') };
    return { cls: s.cls, text: s.label };
  }
  var WD = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' });

  /* =====================================================================
     LIST
     ===================================================================== */
  async function loadList() {
    var sb = LH.sb;
    var r = await Promise.all([
      sb.from('projects').select('id,code,name,status,health,percent_complete,delay_days,start_date,forecast_completion_date,completed_at,created_at,client_status_message,site_street,site_suburb,project_manager_name,clients(name),project_types(name),project_financials(contract_value_cents,original_budget_cents,forecast_cost_cents,actual_cost_cents)').is('deleted_at', null).order('created_at', { ascending: false }),
      sb.from('project_stages').select('project_id,name,status,position'),
      sb.from('project_milestones').select('project_id,title,due_date').is('completed_at', null).order('due_date', { ascending: true }),
    ]);
    if (r[0].error) throw r[0].error; if (r[1].error) throw r[1].error;
    return (r[0].data || []).map(function (x) { return mapProject(x, r[1].data || [], r[2].data || []); });
  }

  async function newProjectForm(existing, onDone) {
    var sb = LH.sb;
    var r = await Promise.all([sb.from('project_types').select('id,name').order('name'), sb.from('stage_templates').select('id,name,is_default').order('name'), sb.from('clients').select('id,name,email,mobile').is('anonymised_at', null).order('name'), sb.rpc('list_project_managers')]);
    var types = r[0].data || [], templates = r[1].data || [], clients = r[2].data || [], managers = r[3].data || [];
    var def = templates.filter(function (t) { return t.is_default; })[0] || templates[0];
    return UI.form({
      title: 'New project', submitLabel: 'Create project', wide: true,
      values: { template: def ? def.id : '', state: 'SA', client: '', manager: managers[0] ? managers[0].user_id : '' },
      fields: [
        { name: 'name', label: 'Project name', required: true, span: 2 },
        { name: 'client', label: 'Client', type: 'select', options: [{ v: '', l: 'New client…' }].concat(clients.map(function (c) { return { v: c.id, l: c.name + (c.email ? ' · ' + c.email : '') }; })), span: 2 },
        { name: 'cname', label: 'Client name' }, { name: 'cemail', label: 'Client email', type: 'email' }, { name: 'cmobile', label: 'Client mobile', type: 'tel' },
        { name: 'type', label: 'Project type', type: 'select', options: [{ v: '', l: 'Choose…' }].concat(types.map(function (t) { return { v: t.name, l: t.name }; })) }, { name: 'newtype', label: 'Or a new type' },
        { name: 'template', label: 'Stage template', type: 'select', options: templates.map(function (t) { return { v: t.id, l: t.name }; }) },
        { name: 'manager', label: 'Project manager', type: 'select', options: managers.length ? managers.map(function (m) { return { v: m.user_id, l: m.display_name }; }) : [{ v: '', l: 'No admin has set a full name yet' }], required: true },
        { name: 'street', label: 'Site street address', required: true, span: 2 }, { name: 'suburb', label: 'Suburb', required: true }, { name: 'postcode', label: 'Postcode', required: true },
        { name: 'state', label: 'State', type: 'select', options: STATES.map(function (s) { return { v: s, l: s }; }) },
        { name: 'start', label: 'Start date', type: 'date', required: true }, { name: 'finish', label: 'Forecast completion', type: 'date', required: true },
        { name: 'contract', label: 'Contract value', type: 'money', required: true }, { name: 'budget', label: 'Original budget', type: 'money' }],
      onOpen: function (el) {
        var sel = el.querySelector('[name=client]');
        function toggle() { var isNew = sel.value === ''; ['cname', 'cemail', 'cmobile'].forEach(function (n) { el.querySelector('[name=' + n + ']').closest('.lh-field-wrap').style.display = isNew ? '' : 'none'; }); }
        sel.addEventListener('change', toggle); toggle();
      },
      onSubmit: async function (v) {
        var typeName = UI.nullIfBlank(v.newtype || v.type); if (!typeName) throw new Error('Choose or add a project type.');
        if (!v.client && !v.cname) throw new Error('Client name is required.');
        if (!v.manager) throw new Error('Choose a project manager.');
        var dup = (existing || []).filter(function (p) { return p.status !== 'completed' && p.street.toLowerCase() === v.street.toLowerCase() && p.suburb.toLowerCase() === v.suburb.toLowerCase(); })[0];
        if (dup) throw new Error('A project at this address is already running.');
        var tid = await sb.rpc('ensure_project_type', { p_name: typeName }); if (tid.error) throw tid.error;
        var clientId = UI.nullIfBlank(v.client), newClient = null;
        if (!clientId) {
          var email = UI.nullIfBlank(v.cemail);
          var fields = { name: v.cname, email: email, mobile: UI.nullIfBlank(v.cmobile), second_contact_name: null, second_contact_phone: null, notes: null };
          if (email) { var ex = await sb.from('clients').select('id').ilike('email', email).limit(1); if (!ex.error && ex.data && ex.data[0]) { clientId = ex.data[0].id; await sb.from('clients').update(fields).eq('id', clientId); } }
          if (!clientId) newClient = fields;
        }
        var res = await sb.rpc('create_project', {
          p_name: v.name, p_client_id: clientId, p_new_client: newClient, p_project_type_id: tid.data, p_custom_type_name: null,
          p_site: { street: v.street, suburb: v.suburb, state: v.state, postcode: v.postcode }, p_template_id: UI.nullIfBlank(v.template),
          p_start_date: v.start, p_forecast_completion: v.finish, p_contract_value_cents: UI.cents(v.contract), p_original_budget_cents: UI.cents(v.budget), p_project_manager: null,
        });
        if (res.error) throw res.error;
        var mg = await sb.rpc('set_project_manager', { p_project_id: res.data, p_user_id: v.manager }); if (mg.error) throw mg.error;
        newProjectForm.createdId = res.data;
      },
    }).then(function (ok) { if (ok) { UI.toast('Project created.'); if (onDone) onDone(newProjectForm.createdId); } return ok; });
  }

  function renderList(view, args) {
    var P = null, destroyed = false, drawn = false, S = { type: 'all', show: 'active' };
    view.innerHTML = UI.skeleton([[110], [150, 24], [380, 24]]);

    async function refresh() {
      try { P = await loadList(); LH.touchSynced(); if (!destroyed) draw(); }
      catch (e) { console.error(e); if (!P && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load projects. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    refresh().then(function () { if (args && args[0] === 'new' && !destroyed) { history.replaceState(null, '', '#/projects'); newProjectForm(P, function (id) { LH.go('projects/' + id); }); } });

    function activeSet() { return P.filter(function (p) { return p.status === 'active' || p.status === 'on_hold'; }); }
    function shown() {
      return P.filter(function (p) {
        var inGroup = S.show === 'active' ? (p.status === 'active' || p.status === 'on_hold') : p.status === 'completed';
        return inGroup && (S.type === 'all' || p.type === S.type);
      });
    }
    function portfolioCard(act) {
      var sum = function (a, k) { return a.reduce(function (t, p) { return t + p[k]; }, 0); };
      var contract = sum(act, 'contract'), earned = act.reduce(function (t, p) { return t + p.contract * Math.min(100, p.pct) / 100; }, 0);
      var withC = act.filter(function (p) { return p.contract > 0; }), avg = withC.length ? contract / withC.length : 0;
      var year = LH.today().y;
      var sold = P.filter(function (p) { return p.created && +fmt.dayKey(p.created).slice(0, 4) === year; });
      var soldValue = sum(sold, 'contract'), bp = fmt.moneyParts(soldValue);
      return '<div class="lh-card lift stat big wash" style="animation-delay:0ms;--wash:var(--steel)"><div class="cap">Money picture</div><div class="bigrow"><span class="bigv">' + esc(bp.num) + (bp.unit ? '<small>' + bp.unit + '</small>' : '') + '</span>' +
        '<span class="faint" style="font-size:11px">sold in ' + year + ' · ' + sold.length + (sold.length === 1 ? ' project' : ' projects') + '</span></div>' +
        '<div class="mini3">' + [['Contract under way', money(contract)], ['Earned to date', money(earned)], ['Avg. project value', money(avg)]].map(function (x) { return '<div><div class="faint tiny">' + x[0] + '</div><div class="serif">' + x[1] + '</div></div>'; }).join('') + '</div></div>';
    }
    function draw() {
      var act = activeSet(), L = shown(), y = window.scrollY;
      view.classList.toggle('enter', !drawn); drawn = true;
      var onTrack = act.filter(function (p) { return p.st === 'ontime'; }).length;
      var soon = act.filter(function (p) { var d = UI.daysUntil(p.start); return d != null && d >= 0 && d <= 30; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
      var next = act.filter(function (p) { return p.forecastDate; }).sort(function (a, b) { return a.forecastDate < b.forecastDate ? -1 : 1; })[0];
      var types = []; P.forEach(function (p) { if (p.type && types.indexOf(p.type) === -1) types.push(p.type); });
      var contractAll = act.reduce(function (t, p) { return t + p.contract; }, 0);
      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap">Portfolio</div><h1 class="ov-hello">Projects</h1><div class="hero-sub">' + act.length + (act.length === 1 ? ' active project' : ' active projects') + ' · ' + fmt.money(contractAll) + ' contract value · all figures live from the app</div></div>' +
        '<div class="ov-actions no-print"><button class="lh-btn" type="button" data-act="csv">Export Excel</button><button class="lh-btn" type="button" data-act="pdf">PDF report</button><button class="lh-btn primary" type="button" data-act="new">+ New project</button></div></div>' +
        UI.sect('Portfolio') +
        '<div class="pf-grid">' + portfolioCard(act) +
        UI.stat('On track', onTrack + ' of ' + act.length, '', '', '', 60, 'ok') +
        UI.stat('Starting soon', String(soon.length), '', soon.length ? esc('Next: ' + fmt.date(soon[0].start) + ' · ' + soon[0].street) : 'Nothing starts in the next 30 days', soon.length ? 'steel' : '', 120, 'wait') +
        UI.stat('Next handover', next ? fmt.date(next.forecastDate) : '—', '', next ? esc(next.street) : 'No forecast dates', '', 180, 'steel') + '</div>' +
        UI.sect('All projects') +
        '<section class="lh-card"><div class="lh-card-head"><div class="chip-row" style="margin:0">' + UI.chips([['all', 'All']].concat(types.map(function (t) { return [t, t]; })), S.type, 'type') + '</div>' +
        '<div class="chip-row" style="margin:0">' + UI.chips([['active', 'Active'], ['complete', 'Complete']], S.show, 'show') + '</div></div>' +
        (L.length ? '<div class="tbl-scroll"><div class="tbl-inner wide"><div class="pr-head pr-grid"><div>ID</div><div>Project · client</div><div>Type</div><div>Contract</div><div>Budget</div><div>Days left</div><div>Next milestone</div><div>Project manager</div><div>Stage</div><div>Progress</div><div>Status</div></div>' +
          L.map(function (p, i) {
            var sl = statusLabel(p), dl = daysLeft(p);
            return '<a class="pr-row pr-grid" href="#/projects/' + p.id + '" style="--i:' + i + '"><div class="faint code">' + esc(p.code || '') + '</div><div><div class="n">' + esc(p.street) + '</div><div class="s">' + esc([p.client, p.suburb].filter(Boolean).join(' · ')) + '</div></div>' +
              '<div>' + esc(p.type || '—') + '</div><div>' + money(p.contract) + '</div><div>' + money(p.budget) + '</div><div class="' + dl.cls + '">' + esc(dl.text) + '</div>' +
              '<div class="mile">' + (p.nextMile ? esc(p.nextMile) + '<div class="faint tiny">' + esc(fmt.date(p.nextMileDate)) + '</div>' : '—') + '</div><div>' + esc(p.mgr || '—') + '</div><div>' + esc(p.stage || '—') + '</div>' +
              '<div><div class="prog"><div class="bar"><i style="width:' + Math.min(100, p.pct) + '%"></i></div><span>' + p.pct + '%</span></div></div><div>' + (sl.cls ? UI.pill(sl.cls, sl.text) : '<span class="lh-pill"><i></i>' + esc(sl.text) + '</span>') + '</div></a>';
          }).join('') + '</div></div>' : '<div class="lh-empty">No projects here yet.</div>') + '</section>';
      window.scrollTo(0, y);
    }
    function onClick(e) {
      var el = e.target.closest('[data-type],[data-show],[data-act]'); if (!el || !P) return;
      if (el.hasAttribute('data-type')) S.type = el.getAttribute('data-type');
      else if (el.hasAttribute('data-show')) S.show = el.getAttribute('data-show');
      else {
        var a = el.getAttribute('data-act');
        if (a === 'new') { newProjectForm(P, function (id) { LH.go('projects/' + id); }); return; }
        var rows = shown();
        if (a === 'csv') { UI.csv('projects', [['ID', 'Project', 'Client', 'Suburb', 'Type', 'Contract', 'Original budget', 'Forecast cost', 'Actual cost', 'Margin %', 'Stage', 'Progress %', 'Status', 'Completion']].concat(rows.map(function (p) { var m = margin(p); return [p.code, p.street, p.client, p.suburb, p.type, p.contract, p.budget, p.forecast, p.actual, m ? m.pct.toFixed(1) : '', p.stage, p.pct, statusLabel(p).text, p.forecastDate || '']; }))); return; }
        if (a === 'pdf') { UI.printSheet('Lotti Homes — projects', S.show === 'active' ? 'Active projects' : 'Completed projects', ['ID', 'Project', 'Client', 'Type', 'Contract', 'Stage', 'Progress', 'Status', 'Completion'], rows.map(function (p) { return [p.code, p.street + ', ' + p.suburb, p.client, p.type, p.contract ? fmt.moneyFull(p.contract) : '—', p.stage || '—', p.pct + '%', statusLabel(p).text, fmt.date(p.forecastDate)]; })); return; }
      }
      draw();
    }
    view.addEventListener('click', onClick);
    return { watch: ['projects', 'project_stages', 'project_financials', 'clients', 'project_types'], refresh: refresh, destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); } };
  }

  /* =====================================================================
     DETAIL
     ===================================================================== */
  function weekRange() {
    var t = LH.today(), d = new Date(Date.UTC(t.y, t.m, t.d)), mon = new Date(Date.UTC(t.y, t.m, t.d - ((d.getUTCDay() + 6) % 7)));
    var from = LH.keyOf(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate()), end = new Date(mon.getTime() + 7 * 86400000);
    return { from: LH.adelaideToISO(from + 'T00:00'), to: LH.adelaideToISO(LH.keyOf(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) + 'T00:00') };
  }

  function renderDetail(view, id) {
    var D = null, destroyed = false, drawn = false, photoFilter = 'all', urls = {};
    view.innerHTML = UI.skeleton([[130], [300, 24], [200, 24]]);

    async function refresh() {
      try {
        var sb = LH.sb, wk = weekRange();
        var r = await Promise.all([
          sb.from('projects').select('id,code,name,status,health,percent_complete,delay_days,start_date,forecast_completion_date,completed_at,client_status_message,site_street,site_suburb,site_state,site_postcode,project_manager_name,project_manager_id,client_id,clients(id,name,email,mobile),project_types(name),project_financials(contract_value_cents,original_budget_cents,forecast_cost_cents,actual_cost_cents)').eq('id', id).maybeSingle(),
          sb.from('project_stages').select('id,project_id,position,name,status').eq('project_id', id).order('position', { ascending: true }),
          sb.from('bookings').select('id,kind,title,starts_at,ends_at').eq('project_id', id).neq('status', 'cancelled').gte('ends_at', wk.from).lte('starts_at', wk.to).order('starts_at', { ascending: true }),
          sb.from('project_milestones').select('id,title,due_date,completed_at,visible_to_client').eq('project_id', id).order('due_date', { ascending: true }),
          sb.from('project_risks').select('id,kind,title,detail,severity,state').eq('project_id', id).neq('state', 'closed').order('created_at', { ascending: false }),
          sb.from('project_notes').select('id,body,visible_to_client,created_at').eq('project_id', id).order('created_at', { ascending: false }),
          sb.from('project_photos').select('id,caption,taken_at,room_id,status,path,photo_internal(original_path)').eq('project_id', id).order('created_at', { ascending: false }).limit(48),
          sb.from('project_rooms').select('id,name').eq('project_id', id),
          sb.from('project_documents').select('id,title,doc_type,storage_path,mime_type,size_bytes,shared_with_client,created_at').eq('project_id', id).order('created_at', { ascending: false }),
          sb.from('weather_notices').select('notice_date').eq('project_id', id).eq('visible_to_client', true),
          sb.from('business_settings').select('rain_risk_threshold_pct').limit(1).maybeSingle(),
          sb.from('budget_variations').select('budget_delta_cents,contract_delta_cents').eq('project_id', id),
        ]);
        for (var i = 0; i < 10; i++) if (r[i].error) throw r[i].error;
        if (!r[0].data) { view.innerHTML = '<div class="lh-card soon"><h2>Project not found</h2><p class="muted">It may have been deleted.</p><a class="lh-btn primary" href="#/projects">Back to projects</a></div>'; return; }
        var raw = r[0].data, stages = r[1].data || [];
        D = {
          raw: raw, p: mapProject(raw, stages), stages: stages, week: r[2].data || [], miles: r[3].data || [], risks: r[4].data || [], notes: r[5].data || [], photos: r[6].data || [], rooms: r[7].data || [],
          docs: r[8].data || [], told: (r[9].data || []).map(function (n) { return n.notice_date; }), rain: (r[10].data && r[10].data.rain_risk_threshold_pct) || 60,
          vars: (r[11].data || []).reduce(function (a, v) { a.b += (v.budget_delta_cents || 0) / 100; a.c += (v.contract_delta_cents || 0) / 100; return a; }, { b: 0, c: 0 }), client: one(raw.clients) || {},
        };
        LH.touchSynced();
        if (!destroyed) { draw(); loadPhotoUrls(); }
        LH.weather().then(function (w) { D.wx = w; if (!destroyed) paintWeather(); });
      } catch (e) { console.error(e); if (!D && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load this project. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    refresh();

    async function loadPhotoUrls() {
      var need = D.photos.filter(function (p) { return !urls[p.id] && p.path; });
      if (!need.length) return;
      var res = await LH.sb.storage.from('project-photos').createSignedUrls(need.map(function (p) { return p.path; }), 3600);
      if (res.error || !res.data) return;
      var byPath = {}; res.data.forEach(function (x) { if (x.signedUrl) byPath[x.path] = x.signedUrl; });
      need.forEach(function (p) { if (byPath[p.path]) urls[p.id] = byPath[p.path]; });
      if (!destroyed) paintPhotos();
    }

    function paintPhotos() {
      var box = LH.$('#phGrid', view); if (!box) return;
      var list = D.photos.filter(function (p) { return photoFilter === 'all' || p.room_id === photoFilter; });
      box.innerHTML = list.length ? list.slice(0, 12).map(function (p) {
        var src = urls[p.id];
        return '<button type="button" class="ph" data-photo="' + p.id + '" aria-label="' + esc(p.caption || 'Photo') + '">' + (src ? '<img loading="lazy" alt="" src="' + esc(src) + '">' : '') + '</button>';
      }).join('') + (list.length > 12 ? '<div class="ph more">+' + (list.length - 12) + ' more</div>' : '') : '<div class="faint ph-empty">No photos here yet. Upload them from the app.</div>';
    }
    function paintWeather() {
      var box = LH.$('#wxBox', view); if (!box || !D) return;
      var w = D.wx;
      if (!w || !w.forecast || !w.forecast.length) { box.innerHTML = ''; return; }
      var d0 = w.forecast[0], temp = w.currentTempC != null ? Math.round(w.currentTempC) : d0.maxTempC;
      var wet = w.forecast.filter(function (d) { return d.chanceOfRain != null && d.chanceOfRain >= D.rain; })[0];
      var h = '<div class="wx-top"><span class="cloud" aria-hidden="true"><i></i><i></i></span><span class="serif wx-t">' + esc(temp) + '°</span><span class="faint tiny">Adelaide · today</span></div>' +
        '<div class="faint tiny" style="margin:6px 0 14px">' + esc(d0.precis) + (wet ? '' : ' · no impact on site') + '</div><div class="wx-days">';
      w.forecast.forEach(function (d) {
        var pct = d.chanceOfRain || 0, hot = pct >= D.rain;
        h += '<div class="wx-d' + (hot ? ' hot' : '') + '"><span class="w">' + WD.format(new Date(d.date + 'T00:00:00Z')).toUpperCase() + '</span><span class="g"><i style="height:' + Math.max(8, pct) + '%"></i></span><span class="p">' + pct + '%</span></div>';
      });
      h += '</div>';
      if (wet && D.p.status !== 'completed') {
        var sent = D.told.indexOf(wet.date) !== -1, name = WD.format(new Date(wet.date + 'T00:00:00Z'));
        h += '<div class="wx-note"><span class="dotw"></span><span>' + esc(name + ' ' + wet.chanceOfRain + '% rain may delay ' + (D.p.stage ? D.p.stage.toLowerCase() : 'work on site')) + '</span>' +
          (sent ? '<span class="lh-pill ok"><i></i>Client told</span>' : '<button type="button" class="lh-btn primary sm" data-act="notify" data-date="' + esc(wet.date) + '" data-pct="' + wet.chanceOfRain + '">Notify client</button>') + '</div>';
      }
      box.innerHTML = h;
    }

    function draw() {
      var p = D.p, raw = D.raw, y = window.scrollY, sl = statusLabel(p), c = D.client;
      view.classList.toggle('enter', !drawn); drawn = true;
      var total = D.stages.length, curI = D.stages.findIndex(function (s) { return s.status === 'current'; });
      var segs = D.stages.map(function (s, i) { return '<button type="button" class="seg ' + (s.status === 'complete' ? 'done' : s.status === 'current' ? 'now' : '') + '" data-pos="' + s.position + '" title="' + esc(s.name) + '"></button>'; }).join('');
      var openMiles = D.miles.filter(function (m) { return !m.completed_at; }), nextM = openMiles[0];
      var stagePill = p.status === 'completed' ? UI.pill('ok', 'Complete') : (curI >= 0 ? UI.pill('steel', 'In progress') : UI.pill('', 'Not started'));
      var stageText = p.status === 'completed' ? 'All stages complete' : (total ? 'Stage ' + (curI >= 0 ? curI + 1 : total) + ' of ' + total : 'No stages yet');
      var contract = p.contract, earned = contract * Math.min(100, p.pct) / 100, dl = daysLeft(p);
      var toStart = UI.daysUntil(p.start), totalDays = (p.start && p.forecastDate) ? Math.round((Date.parse(p.forecastDate + 'T00:00:00Z') - Date.parse(p.start + 'T00:00:00Z')) / 86400000) : null;
      var dayCount = '—', dayCls = '';
      if (p.status === 'completed') dayCount = 'Completed';
      else if (toStart != null && toStart > 0) dayCount = 'Starts in ' + toStart + (toStart === 1 ? ' day' : ' days');
      else if (toStart != null && totalDays) { var dayNo = -toStart + 1; dayCount = 'Day ' + dayNo + ' of ' + totalDays; if (dayNo > totalDays) dayCls = 'haltc'; }
      var weekRows = D.week.map(function (b) {
        var col = b.kind === 'contractor' ? 'var(--ok)' : b.kind === 'admin' ? 'var(--wait)' : 'var(--steel)';
        return '<div class="wk"><span class="d">' + WD.format(new Date(fmt.dayKey(b.starts_at) + 'T00:00:00Z')) + ' ' + new Date(fmt.dayKey(b.starts_at) + 'T00:00:00Z').getUTCDate() + '</span><i style="background:' + col + '"></i><span class="t">' + esc(b.title) + '</span></div>';
      }).join('') || '<div class="faint" style="padding:6px 0">Nothing booked on site this week.</div>';

      view.innerHTML =
        '<a class="crumb" href="#/projects">← Projects</a><div class="cap" style="margin-top:14px">' + esc([p.code, p.type, p.suburb].filter(Boolean).join(' · ')) + '</div>' +
        '<div class="ov-hero" style="margin-top:12px;margin-bottom:26px"><div><h1 class="ov-hello" style="margin:0"><em>' + esc(p.street) + '</em></h1><div class="hero-sub">' +
        esc(c.name || '') + '</div></div>' +
        '<div class="ov-actions no-print"><button class="lh-btn" type="button" data-act="edit">Edit project</button><button class="lh-btn" type="button" data-act="status">Set status</button>' +
        (p.status !== 'completed' && curI >= 0 && curI < total - 1 ? '<button class="lh-btn" type="button" data-act="advance">Next stage</button>' : '') +
        (p.status !== 'completed' ? '<button class="lh-btn" type="button" data-act="complete">Mark complete</button>' : '') + '<button class="lh-btn primary" type="button" data-act="message">Message client</button></div></div>' +
        UI.sect('Progress &amp; financials') +
        '<div class="pd-top"><section class="lh-card"><div class="pg-row"><div class="pg-num"><span class="serif">' + p.pct + '<small>%</small></span><span class="pg-lbl">Complete</span></div>' +
        '<div class="pg-side"><div class="segs">' + segs + '</div></div></div>' +
        '<div class="pg-strip"><div><div class="cap">Project start date</div><div class="serif fact">' + esc(p.start ? fmt.dateY(p.start) : '—') + '</div></div>' +
        '<div><div class="cap">Current stage</div><div class="serif fact">' + esc(p.stage || (p.status === 'completed' ? 'Complete' : '—')) + '</div><div class="faint tiny" style="margin-top:4px">' + esc(stageText) + '</div></div>' +
        '<div><div class="cap">Forecast completion</div><div class="fact fc"><span class="serif">' + esc(fmt.date(p.forecastDate)) + '</span> ' + (sl.cls ? UI.pill(sl.cls, sl.text) : '<span class="lh-pill"><i></i>' + esc(sl.text) + '</span>') + '</div></div>' +
        '<div><div class="cap">Next milestone</div><div class="serif fact">' + (nextM ? esc(nextM.title) + ' · ' + esc(fmt.date(nextM.due_date)) : '—') + '</div></div>' +
        '<div><div class="cap">Project manager</div><div class="serif fact">' + esc(raw.project_manager_name || '—') + '</div></div></div>' +
        '<div class="pg-split"><div><div class="split-h"><span class="cap">On site this week</span><span class="faint tiny">Synced to Google Calendar</span></div>' + weekRows + '</div><div id="wxBox" class="wxbox"></div></div></section>' +
        '<section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Financials</h2><span class="cap">Owner view</span></div>' +
        '<div class="fin"><div><span>Contract value</span><b>' + (contract ? fmt.moneyFull(contract) : '—') + '</b></div><div><span>Original budget</span><b>' + (p.budget ? fmt.moneyFull(p.budget) : '—') + '</b></div>' +
        (D.vars.b || D.vars.c ? '<div><span>Variations</span><b>' + (D.vars.c >= 0 ? '+' : '−') + fmt.moneyFull(Math.abs(D.vars.c)) + '</b></div>' : '') +
        '<div><span>Earned to date</span><b>' + (contract ? fmt.moneyFull(earned) + ' · ' + p.pct + '%' : '—') + '</b></div>' +
        '<div><span>Day count</span><b class="' + dayCls + '">' + esc(dayCount) + '</b></div><div><span>Days left</span><b class="' + dl.cls + '">' + esc(dl.text) + '</b></div></div>' +
        (contract ? '<div class="faint tiny" style="margin:18px 0 8px">Earned to date · ' + p.pct + '%</div><div class="bar fat"><i style="width:' + Math.min(100, p.pct) + '%"></i></div>' : '<div class="faint tiny" style="margin-top:18px">Add a contract value to see what has been earned.</div>') +
        '<div style="margin-top:18px"><button type="button" class="lh-btn sm" data-act="fin">Edit financials</button></div></section></div>' +
        UI.sect('Delivery') +
        '<div class="pd-three">' +
        '<section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Upcoming milestones</h2><button type="button" class="lh-link" data-act="addm">+ Add</button></div>' +
        (openMiles.length ? openMiles.map(function (m) { return '<div class="li"><span class="due">' + esc(fmt.date(m.due_date)) + '</span><span class="t">' + esc(m.title) + '</span><span class="tools"><button type="button" data-mdone="' + m.id + '" title="Mark done" aria-label="Mark done">✓</button><button type="button" data-mdel="' + m.id + '" title="Delete" aria-label="Delete">×</button></span></div>'; }).join('') : '<div class="faint">No upcoming milestones.</div>') + '</section>' +
        '<section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Risks &amp; issues</h2><button type="button" class="lh-link" data-act="addr">+ Add</button></div>' +
        (D.risks.length ? D.risks.map(function (k) { var s = SEV[k.severity] || SEV.low; return '<div class="li risk"><div class="t">' + esc(k.title) + (k.detail ? '<div class="faint tiny">' + esc(k.detail) + '</div>' : '') + '<div style="margin-top:8px">' + UI.pill(s[0], s[1]) + ' <span class="faint tiny">' + esc(k.kind) + '</span></div></div><span class="tools"><button type="button" data-rclose="' + k.id + '" title="Resolve" aria-label="Resolve">✓</button></span></div>'; }).join('') : '<div class="faint">No open risks or issues.</div>') + '</section>' +
        '<section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Client notes</h2><button type="button" class="lh-link" data-act="addn">+ Add note</button></div>' +
        (D.notes.length ? D.notes.slice(0, 6).map(function (n) { return '<div class="li note"><div class="t">' + esc(n.body) + '<div class="cap" style="margin-top:7px">' + (n.visible_to_client ? 'Visible to client' : 'Team only') + ' · <button type="button" class="lh-link" data-nvis="' + n.id + '" data-v="' + (n.visible_to_client ? 0 : 1) + '">' + (n.visible_to_client ? 'Hide' : 'Share') + '</button></div></div><span class="tools"><button type="button" data-ndel="' + n.id + '" title="Delete" aria-label="Delete">×</button></span></div>'; }).join('') : '<div class="faint">No notes yet.</div>') + '</section></div>' +
        UI.sect('Media &amp; documents') +
        '<div class="pd-media' + (D.photos.length ? '' : ' no-photos') + '"><section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Photos</h2><div class="chip-row" style="margin:0">' + UI.chips([['all', 'All']].concat(D.rooms.map(function (r) { return [r.id, r.name]; })), photoFilter, 'room') + '</div></div><div id="phGrid" class="ph-grid"></div></section>' +
        '<section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Documents</h2><button type="button" class="lh-link" data-act="upload">Upload</button></div><input type="file" id="docFile" hidden multiple accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.dwg">' +
        (D.docs.length ? D.docs.map(function (d) { var ext = DOC_ICON[d.mime_type] || (d.title.split('.').pop() || 'FILE').slice(0, 4).toUpperCase(); return '<div class="doc"><span class="ico">' + esc(ext) + '</span><button type="button" class="dt" data-open-doc="' + d.id + '"><span class="n">' + esc(d.title) + '</span><span class="faint tiny">' + esc(fmt.date(fmt.dayKey(d.created_at))) + (d.size_bytes ? ' · ' + Math.max(1, Math.round(d.size_bytes / 1024)) + ' KB' : '') + '</span></button><button type="button" class="lh-link" data-share="' + d.id + '" data-v="' + (d.shared_with_client ? 0 : 1) + '">' + (d.shared_with_client ? 'Shared ✓' : 'Share') + '</button></div>'; }).join('') : '<div class="faint">No documents yet.</div>') + '</section></div>' +
        '<div style="margin-top:34px"><button type="button" class="lh-link danger" data-act="delete">Delete project</button></div>';
      paintPhotos(); paintWeather();
      window.scrollTo(0, y);
    }
    /* ---- actions ---- */
    async function run(fn, okMsg) { try { await fn(); if (okMsg) UI.toast(okMsg); await refresh(); } catch (e) { console.error(e); UI.toast(LH.errMsg(e), 'error'); } }
    async function sbDo(promise) { var r = await promise; if (r.error) throw r.error; return r.data; }

    async function onClick(e) {
      if (!D) return;
      var t = e.target, el;
      if ((el = t.closest('[data-room]'))) { photoFilter = el.getAttribute('data-room'); draw(); return; }
      if ((el = t.closest('[data-photo]'))) { openPhoto(el.getAttribute('data-photo')); return; }
      if ((el = t.closest('[data-pos]'))) {
        var pos = +el.getAttribute('data-pos'), st = D.stages.filter(function (s) { return s.position === pos; })[0];
        if (st && st.status !== 'current' && D.p.status !== 'completed' && await UI.confirm('Set "' + st.name + '" as the current stage? Stages before it are marked complete.', { title: 'Change stage', yes: 'Set stage' })) run(function () { return sbDo(LH.sb.rpc('set_project_progress', { p_project_id: id, p_current_position: pos })); }, 'Stage updated.');
        return;
      }
      if ((el = t.closest('[data-mdone]'))) { run(function () { return sbDo(LH.sb.from('project_milestones').update({ completed_at: new Date().toISOString() }).eq('id', el.getAttribute('data-mdone'))); }); return; }
      if ((el = t.closest('[data-mdel]'))) { if (await UI.confirm('Delete this milestone?', { yes: 'Delete', danger: true })) run(function () { return sbDo(LH.sb.from('project_milestones').delete().eq('id', el.getAttribute('data-mdel'))); }); return; }
      if ((el = t.closest('[data-rclose]'))) { run(function () { return sbDo(LH.sb.from('project_risks').update({ state: 'closed' }).eq('id', el.getAttribute('data-rclose'))); }, 'Resolved.'); return; }
      if ((el = t.closest('[data-ndel]'))) { if (await UI.confirm('Delete this note?', { yes: 'Delete', danger: true })) run(function () { return sbDo(LH.sb.from('project_notes').delete().eq('id', el.getAttribute('data-ndel'))); }); return; }
      if ((el = t.closest('[data-nvis]'))) { run(function () { return sbDo(LH.sb.rpc('publish_note_to_client', { p_note_id: el.getAttribute('data-nvis'), p_visible: el.getAttribute('data-v') === '1' })); }); return; }
      if ((el = t.closest('[data-share]'))) { run(function () { return sbDo(LH.sb.from('project_documents').update({ shared_with_client: el.getAttribute('data-v') === '1' }).eq('id', el.getAttribute('data-share'))); }); return; }
      if ((el = t.closest('[data-open-doc]'))) { openDoc(el.getAttribute('data-open-doc')); return; }
      if ((el = t.closest('[data-act]'))) act(el.getAttribute('data-act'), el);
    }
    function act(a, el) {
      var p = D.p;
      if (a === 'advance') run(function () { return sbDo(LH.sb.rpc('advance_project_stage', { p_project_id: id })); }, 'Moved to the next stage.');
      else if (a === 'complete') UI.confirm('Mark ' + p.street + ' as complete? The client is told their project is finished.', { title: 'Complete project', yes: 'Mark complete' }).then(function (ok) { if (ok) run(function () { return sbDo(LH.sb.rpc('complete_project', { p_project_id: id })); }, 'Project completed.'); });
      else if (a === 'delete') UI.confirm('Delete ' + p.street + '? It disappears from the app and the dashboard.', { title: 'Delete project', yes: 'Delete', danger: true }).then(function (ok) { if (ok) run(async function () { await sbDo(LH.sb.rpc('delete_projects', { p_project_ids: [id] })); destroyed = true; LH.go('projects'); }, 'Project deleted.'); });
      else if (a === 'message') run(async function () { var tid = await sbDo(LH.sb.rpc('start_conversation', { p_project_id: id })); destroyed = true; LH.go('inbox/' + tid); });
      else if (a === 'notify') {
        var date = el.getAttribute('data-date'), pct = el.getAttribute('data-pct'), day = WD.format(new Date(date + 'T00:00:00Z'));
        run(function () { return sbDo(LH.sb.from('weather_notices').insert({ project_id: id, notice_date: date, kind: 'rain_risk', message: day + ' looks wet (' + pct + '% chance of rain). Work on site may be delayed.', visible_to_client: true })); }, 'Client notified.');
      }
      else if (a === 'status') statusForm(); else if (a === 'fin') finForm(); else if (a === 'edit') editForm();
      else if (a === 'addm') milestoneForm(); else if (a === 'addr') riskForm(); else if (a === 'addn') noteForm();
      else if (a === 'upload') LH.$('#docFile', view).click();
    }
    function statusForm() {
      var p = D.p;
      UI.form({
        title: 'Project status', intro: 'The client sees this on their app.', submitLabel: 'Save',
        values: { state: p.st === 'ontime' ? 'on_time' : p.st, reason: p.note || '', days: p.delay || '' },
        fields: [{ name: 'state', label: 'Status', type: 'select', options: [{ v: 'on_time', l: 'On time' }, { v: 'delayed', l: 'Delayed' }, { v: 'halted', l: 'Halted' }], required: true },
          { name: 'days', label: 'Days behind (if delayed)', type: 'number', min: 0 }, { name: 'reason', label: 'Message for the client', type: 'textarea', rows: 3, span: 2, placeholder: 'e.g. Tile delivery delayed by the supplier' }],
        onSubmit: async function (v) { await sbDo(LH.sb.rpc('set_project_status', { p_project_id: id, p_state: v.state, p_reason: UI.nullIfBlank(v.reason), p_delay_days: v.state === 'delayed' ? (parseInt(v.days, 10) || null) : null })); },
      }).then(function (ok) { if (ok) { UI.toast('Status updated.'); refresh(); } });
    }
    function finForm() {
      var p = D.p;
      UI.form({
        title: 'Edit financials', intro: 'Owner-only. The contract value and budget drive the earned-to-date figures.', submitLabel: 'Save', wide: true,
        values: { contract: p.contract || '', budget: p.budget || '' },
        fields: [{ name: 'contract', label: 'Contract value', type: 'money' }, { name: 'budget', label: 'Original budget', type: 'money' }],
        onSubmit: async function (v) {
          var cols = {}; ['contract:contract_value_cents', 'budget:original_budget_cents'].forEach(function (m) { var k = m.split(':'); var c = UI.cents(v[k[0]]); if (c != null) cols[k[1]] = c; });
          await sbDo(LH.sb.from('project_financials').update(cols).eq('project_id', id));
        },
      }).then(function (ok) { if (ok) { UI.toast('Financials saved.'); refresh(); } });
    }
    async function editForm() {
      var raw = D.raw, c = D.client;
      var mg = await LH.sb.rpc('list_project_managers'), managers = mg.data || [];
      UI.form({
        title: 'Edit project', submitLabel: 'Save', wide: true,
        values: { name: raw.name, street: raw.site_street || '', suburb: raw.site_suburb || '', postcode: raw.site_postcode || '', state: raw.site_state || 'SA', start: raw.start_date || '', finish: raw.forecast_completion_date || '', manager: raw.project_manager_id || '', cname: c.name || '', cemail: c.email || '', cmobile: c.mobile || '' },
        fields: [{ name: 'name', label: 'Project name', required: true, span: 2 }, { name: 'street', label: 'Site street address', required: true, span: 2 }, { name: 'suburb', label: 'Suburb', required: true }, { name: 'postcode', label: 'Postcode', required: true },
          { name: 'state', label: 'State', type: 'select', options: STATES.map(function (s) { return { v: s, l: s }; }) }, { name: 'manager', label: 'Project manager', type: 'select', options: [{ v: '', l: 'Keep as is' }].concat(managers.map(function (m) { return { v: m.user_id, l: m.display_name }; })) },
          { name: 'start', label: 'Start date', type: 'date', required: true }, { name: 'finish', label: 'Forecast completion', type: 'date', required: true },
          { name: 'cname', label: 'Client name', required: true }, { name: 'cemail', label: 'Client email', type: 'email' }, { name: 'cmobile', label: 'Client mobile', type: 'tel' }],
        onSubmit: async function (v) {
          await sbDo(LH.sb.from('projects').update({ name: v.name, site_street: v.street, site_suburb: v.suburb, site_postcode: v.postcode, site_state: v.state, start_date: v.start, forecast_completion_date: v.finish }).eq('id', id));
          if (raw.client_id) await sbDo(LH.sb.from('clients').update({ name: v.cname, email: UI.nullIfBlank(v.cemail), mobile: UI.nullIfBlank(v.cmobile) }).eq('id', raw.client_id));
          if (v.manager && v.manager !== raw.project_manager_id) await sbDo(LH.sb.rpc('set_project_manager', { p_project_id: id, p_user_id: v.manager }));
        },
      }).then(function (ok) { if (ok) { UI.toast('Project saved.'); refresh(); } });
    }
    function milestoneForm() {
      UI.form({
        title: 'Add milestone', submitLabel: 'Add',
        values: { vis: '1' },
        fields: [{ name: 'title', label: 'Milestone', required: true, span: 2 }, { name: 'due', label: 'Due date', type: 'date', required: true }, { name: 'vis', label: 'Show to client', type: 'select', options: [{ v: '1', l: 'Yes' }, { v: '0', l: 'No' }] }],
        onSubmit: async function (v) { await sbDo(LH.sb.from('project_milestones').insert({ project_id: id, title: v.title, due_date: v.due, visible_to_client: v.vis === '1' })); },
      }).then(function (ok) { if (ok) { UI.toast('Milestone added.'); refresh(); } });
    }
    function riskForm() {
      UI.form({
        title: 'Add risk or issue', submitLabel: 'Add', values: { kind: 'risk', severity: 'medium' },
        fields: [{ name: 'title', label: 'What is it?', required: true, span: 2 }, { name: 'kind', label: 'Type', type: 'select', options: [{ v: 'risk', l: 'Risk' }, { v: 'issue', l: 'Issue' }] },
          { name: 'severity', label: 'Severity', type: 'select', options: [{ v: 'low', l: 'Low' }, { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }] }, { name: 'detail', label: 'Detail (optional)', type: 'textarea', rows: 3, span: 2 }],
        onSubmit: async function (v) { await sbDo(LH.sb.from('project_risks').insert({ project_id: id, kind: v.kind, title: v.title, detail: UI.nullIfBlank(v.detail), severity: v.severity })); },
      }).then(function (ok) { if (ok) { UI.toast('Added.'); refresh(); } });
    }
    function noteForm() {
      UI.form({
        title: 'Add note', submitLabel: 'Add note', values: { vis: '0' },
        fields: [{ name: 'body', label: 'Note', type: 'textarea', rows: 5, required: true, span: 2 }, { name: 'vis', label: 'Who can see it', type: 'select', options: [{ v: '0', l: 'Team only' }, { v: '1', l: 'Visible to the client' }], span: 2 }],
        onSubmit: async function (v) {
          var row = await sbDo(LH.sb.from('project_notes').insert({ project_id: id, body: v.body }).select('id').single());
          if (v.vis === '1') await sbDo(LH.sb.rpc('publish_note_to_client', { p_note_id: row.id, p_visible: true }));
        },
      }).then(function (ok) { if (ok) { UI.toast('Note added.'); refresh(); } });
    }
    async function openPhoto(pid) {
      var ph = D.photos.filter(function (x) { return x.id === pid; })[0]; if (!ph) return;
      var orig = one(ph.photo_internal), url = urls[pid];
      if (orig && orig.original_path) { var s = await LH.sb.storage.from('photo-originals').createSignedUrl(orig.original_path, 600); if (!s.error && s.data) url = s.data.signedUrl; }
      if (url) UI.lightbox(url, ph.caption || ''); else UI.toast('That photo is still processing.', 'error');
    }
    async function openDoc(did) {
      var d = D.docs.filter(function (x) { return x.id === did; })[0]; if (!d) return;
      var s = await LH.sb.storage.from('project-documents').createSignedUrl(d.storage_path, 300);
      if (s.error || !s.data) { UI.toast('Couldn\'t open that file.', 'error'); return; }
      window.open(s.data.signedUrl, '_blank', 'noopener');
    }
    async function onFiles(e) {
      if (e.target.id !== 'docFile' || !e.target.files.length) return;
      var files = Array.prototype.slice.call(e.target.files), n = 0, skipped = [];
      UI.toast('Uploading…');
      for (var i = 0; i < files.length; i++) {
        var f = files[i], ext = (f.name.split('.').pop() || '').toLowerCase(), mime = DOC_MIMES[ext];
        if (!mime) { skipped.push(f.name); continue; }
        if (f.size > 25 * 1024 * 1024) { skipped.push(f.name + ' (over 25 MB)'); continue; }
        var path = id + '/' + Date.now() + '-' + i + '.' + ext;
        var up = await LH.sb.storage.from('project-documents').upload(path, f, { contentType: mime });
        if (up.error) { UI.toast(LH.errMsg(up.error), 'error'); continue; }
        var ins = await LH.sb.from('project_documents').insert({ project_id: id, title: f.name, storage_path: path, mime_type: mime, size_bytes: f.size });
        if (ins.error) { await LH.sb.storage.from('project-documents').remove([path]); UI.toast(LH.errMsg(ins.error), 'error'); continue; }
        n++;
      }
      e.target.value = '';
      UI.toast(n + (n === 1 ? ' document uploaded.' : ' documents uploaded.') + (skipped.length ? ' Skipped: ' + skipped.join(', ') : ''), skipped.length && !n ? 'error' : undefined);
      refresh();
    }
    view.addEventListener('click', onClick); view.addEventListener('change', onFiles);

    return {
      watch: ['projects', 'project_stages', 'project_financials', 'bookings', 'project_milestones', 'project_risks', 'project_notes', 'project_photos', 'project_documents', 'project_rooms', 'weather_notices', 'budget_variations', 'clients'],
      refresh: refresh, destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); view.removeEventListener('change', onFiles); },
    };
  }

  LH.screens.projects = {
    title: 'Projects',
    render: function (view, args) { return args && args[0] && args[0] !== 'new' ? renderDetail(view, args[0]) : renderList(view, args); },
  };
})();
