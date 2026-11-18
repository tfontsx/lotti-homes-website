/* Leads — the pipeline board, the open-leads table and each lead's detail page.
   Writes go through the same tables and database functions the app uses. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;

  var STAGES = ['new', 'contacted', 'consulted', 'quoted', 'won', 'lost'];
  var OPEN = ['new', 'contacted', 'consulted', 'quoted'];
  var LABEL = { new: 'New', contacted: 'Contacted', consulted: 'Consulted', quoted: 'Quoted', won: 'Won', lost: 'Lost' };
  var DOT = { new: 'var(--steel)', contacted: 'var(--steel)', consulted: 'var(--ok)', quoted: 'var(--wait)', won: 'var(--ok)', lost: 'var(--halt)' };
  var SRC = { google: 'Google', instagram: 'Instagram', facebook: 'Facebook', referral: 'Referral', website: 'Website form', walk_in: 'Walk-in', other: 'Other' };
  var LOST = [['price', 'Price'], ['timing', 'Timing'], ['scope', 'Scope'], ['chose_competitor', 'Went elsewhere'], ['no_response', 'No response'], ['other', 'Other']];
  var NEXT = { new: 'First contact', contacted: 'Book consultation', consulted: 'Send quote', quoted: 'Follow up quote' };
  var START_WIN = 40;
  var STATES = ['SA', 'NSW', 'VIC', 'QLD', 'WA', 'TAS', 'NT', 'ACT'];
  var WD = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' });

  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function model(r) {
    return {
      id: r.id, name: r.name, email: r.email || '', phone: r.phone || '', source: r.source, status: r.status, lostReason: r.lost_reason, lostNote: r.lost_note,
      typeId: r.project_type_id, type: (one(r.project_types) || {}).name || '', suburb: r.suburb || '', notes: r.notes || '', follow: r.follow_up_date,
      created: r.created_at, updated: r.updated_at, value: (r.est_value_cents || 0) / 100, prob: r.probability_pct == null ? START_WIN : r.probability_pct,
      converted: r.converted_project_id,
    };
  }
  /* ---------- shared writes (same rules as the app) ---------- */
  async function moveTo(id, stage, wasLost) {
    var cols = { status: stage };
    if (stage === 'lost') cols.probability_pct = 0;
    else if (wasLost) cols.probability_pct = START_WIN;
    var r = await LH.sb.from('leads').update(cols).eq('id', id);
    if (r.error) throw r.error;
  }
  async function markLost(id, reason, note) {
    var r = await LH.sb.from('leads').update({ status: 'lost', lost_reason: reason, lost_note: UI.nullIfBlank(note), probability_pct: 0 }).eq('id', id);
    if (r.error) throw r.error;
  }
  async function typeIdFor(name) {
    name = UI.nullIfBlank(name); if (!name) return null;
    var r = await LH.sb.rpc('ensure_project_type', { p_name: name });
    if (r.error) throw r.error;
    return r.data;
  }
  function lostForm(lead, after) {
    return UI.form({
      title: 'Mark ' + lead.name + ' as lost', intro: 'Pick the main reason. You can reopen the lead later.', submitLabel: 'Mark lost', danger: true,
      fields: [{ name: 'reason', label: 'Reason', type: 'select', options: LOST.map(function (x) { return { v: x[0], l: x[1] }; }), required: true },
        { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 3, span: 2 }],
      onSubmit: async function (v) { await markLost(lead.id, v.reason, v.note); }
    }).then(function (ok) { if (ok) { UI.toast('Marked as lost.'); if (after) after(); } return ok; });
  }
  async function convertForm(lead) {
    var r = await Promise.all([LH.sb.from('project_types').select('id,name').order('name'), LH.sb.from('stage_templates').select('id,name,is_default').order('name')]);
    var types = r[0].data || [], templates = r[1].data || [];
    var def = templates.filter(function (t) { return t.is_default; })[0] || templates[0];
    return UI.form({
      title: 'Convert to project', intro: lead.name + ' becomes a client with a new project, and the lead is marked won.', submitLabel: 'Create project', wide: true,
      values: { name: lead.name + (lead.type ? ' — ' + lead.type : ''), type: lead.typeId || '', template: def ? def.id : '', state: 'SA', suburb: lead.suburb, contract: lead.value || '', cname: lead.name, cemail: lead.email, cmobile: lead.phone },
      fields: [
        { name: 'name', label: 'Project name', required: true, span: 2 },
        { name: 'type', label: 'Project type', type: 'select', options: [{ v: '', l: 'Choose…' }].concat(types.map(function (t) { return { v: t.id, l: t.name }; })), required: true },
        { name: 'template', label: 'Stage template', type: 'select', options: templates.map(function (t) { return { v: t.id, l: t.name }; }) },
        { name: 'street', label: 'Site street address', required: true, span: 2 },
        { name: 'suburb', label: 'Suburb', required: true }, { name: 'postcode', label: 'Postcode', required: true },
        { name: 'state', label: 'State', type: 'select', options: STATES.map(function (s) { return { v: s, l: s }; }) },
        { name: 'start', label: 'Start date', type: 'date', required: true }, { name: 'finish', label: 'Forecast completion', type: 'date', required: true },
        { name: 'contract', label: 'Contract value', type: 'money', required: true }, { name: 'budget', label: 'Original budget', type: 'money' },
        { name: 'cname', label: 'Client name', required: true }, { name: 'cemail', label: 'Client email', type: 'email' }, { name: 'cmobile', label: 'Client mobile', type: 'tel' }],
      onSubmit: async function (v) {
        var res = await LH.sb.rpc('convert_lead_to_project', {
          p_lead_id: lead.id, p_name: v.name, p_project_type_id: v.type, p_custom_type_name: null,
          p_site: { street: v.street, suburb: v.suburb, state: v.state, postcode: v.postcode },
          p_template_id: UI.nullIfBlank(v.template), p_start_date: v.start, p_forecast_completion: v.finish,
          p_contract_value_cents: UI.cents(v.contract), p_original_budget_cents: UI.cents(v.budget),
          p_client_overrides: { name: v.cname, email: UI.nullIfBlank(v.cemail), mobile: UI.nullIfBlank(v.cmobile), second_contact_name: null, second_contact_phone: null, notes: null },
        });
        if (res.error) throw res.error;
        convertForm.createdId = res.data;
      }
    }).then(function (ok) { if (ok) { UI.toast('Project created.'); LH.go('projects/' + convertForm.createdId); } return ok; });
  }
  async function addLeadForm(types, onDone) {
    return UI.form({
      title: 'Add lead', submitLabel: 'Add lead', wide: true, values: { source: 'other', value: '' },
      fields: [
        { name: 'name', label: 'Name', required: true, span: 2 },
        { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone', type: 'tel' },
        { name: 'suburb', label: 'Suburb' },
        { name: 'source', label: 'Source', type: 'select', options: Object.keys(SRC).map(function (k) { return { v: k, l: SRC[k] }; }) },
        { name: 'type', label: 'Project type', type: 'select', options: [{ v: '', l: 'Not sure yet' }].concat(types.map(function (t) { return { v: t.name, l: t.name }; })) },
        { name: 'newtype', label: 'Or a new type', placeholder: 'e.g. Extension' },
        { name: 'value', label: 'Estimated value', type: 'money' },
        { name: 'notes', label: 'Notes', type: 'textarea', rows: 3, span: 2 }],
      onSubmit: async function (v) {
        if (v.email || v.phone) {
          var dup = await LH.sb.rpc('find_duplicate_leads', { p_email: UI.nullIfBlank(v.email), p_phone: UI.nullIfBlank(v.phone) });
          if (!dup.error && dup.data && dup.data.length) {
            var d = dup.data[0];
            if (!window.confirm('There is already a ' + d.kind + ' with these details: ' + d.name + ' (' + d.status + '). Add this lead anyway?')) throw new Error('Cancelled — nothing was added.');
          }
        }
        var typeId = await typeIdFor(v.newtype || v.type);
        var ins = await LH.sb.from('leads').insert({
          name: v.name, email: UI.nullIfBlank(v.email), phone: UI.nullIfBlank(v.phone), suburb: UI.nullIfBlank(v.suburb), source: v.source, status: 'new',
          project_type_id: typeId, est_value_cents: UI.cents(v.value) || 0, notes: UI.nullIfBlank(v.notes),
        });
        if (ins.error) throw ins.error;
      }
    }).then(function (ok) { if (ok) { UI.toast('Lead added.'); if (onDone) onDone(); } return ok; });
  }

  /* =====================================================================
     LIST
     ===================================================================== */
  async function loadList() {
    var sb = LH.sb;
    var r = await Promise.all([
      sb.from('leads').select('id,name,email,phone,source,status,lost_reason,lost_note,project_type_id,suburb,notes,follow_up_date,converted_project_id,created_at,updated_at,est_value_cents,probability_pct,project_types(name)'),
      sb.from('lead_activity').select('lead_id,body,created_at').eq('kind', 'status_change'),
      sb.from('consultations').select('lead_id'),
      sb.from('project_types').select('id,name').order('name'),
    ]);
    for (var i = 0; i < 4; i++) if (r[i].error) throw r[i].error;
    return { leads: (r[0].data || []).map(model), acts: r[1].data || [], consults: r[2].data || [], types: r[3].data || [] };
  }

  function stats(d) {
    var t = LH.today(), thisM = LH.keyOf(t.y, t.m, 1).slice(0, 7), prev = new Date(Date.UTC(t.y, t.m - 1, 1)), prevM = prev.getUTCFullYear() + '-' + String(prev.getUTCMonth() + 1).padStart(2, '0');
    var inMonth = function (l, key) { return fmt.dayKey(l.created).slice(0, 7) === key; };
    var nowN = d.leads.filter(function (l) { return inMonth(l, thisM); }).length, prevN = d.leads.filter(function (l) { return inMonth(l, prevM); }).length;
    var prevName = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', month: 'long' }).format(prev);
    var diff = nowN - prevN, deltaTxt = diff === 0 ? 'same as ' + prevName : (diff > 0 ? '+' : '−') + Math.abs(diff) + ' vs ' + prevName;

    var consulted = {}; d.consults.forEach(function (c) { consulted[c.lead_id] = 1; });
    var reachedQuote = {}, firstQuote = {};
    d.acts.forEach(function (a) {
      if (/→ consulted$/.test(a.body)) consulted[a.lead_id] = 1;
      if (/→ quoted$/.test(a.body)) { reachedQuote[a.lead_id] = 1; if (!firstQuote[a.lead_id] || a.created_at < firstQuote[a.lead_id]) firstQuote[a.lead_id] = a.created_at; }
    });
    d.leads.forEach(function (l) { if (['consulted', 'quoted', 'won'].indexOf(l.status) !== -1) consulted[l.id] = 1; if (l.status === 'quoted' || l.status === 'won') reachedQuote[l.id] = 1; });
    var cr = d.leads.length ? Math.round((Object.keys(consulted).length / d.leads.length) * 100) : null;
    var rq = Object.keys(reachedQuote).length, won = d.leads.filter(function (l) { return l.status === 'won'; }).length;
    var wr = rq ? Math.min(100, Math.round((won / rq) * 100)) : null;
    var lost = d.leads.filter(function (l) { return l.status === 'lost'; }), lostValue = 0;
    lost.forEach(function (l) { lostValue += l.value; });
    var lp = d.leads.length ? Math.round((lost.length / d.leads.length) * 100) : null;
    return { newN: nowN, delta: deltaTxt, up: diff >= 0, cr: cr, wr: wr, lp: lp, ln: lost.length, lv: lostValue };
  }

  function footer(l) {
    if (l.status === 'new') return { t: UI.ago(l.created), tone: '' };
    if (l.status === 'contacted') return { t: UI.ago(l.updated), tone: '' };
    if (l.status === 'consulted') return { t: 'Quote needed', tone: 'wait' };
    if (l.status === 'quoted') return { t: 'Sent ' + fmt.date(fmt.dayKey(l.updated)), tone: 'wait' };
    if (l.status === 'won') return { t: 'Won ' + fmt.date(fmt.dayKey(l.updated)), tone: '' };
    return { t: (LOST.filter(function (x) { return x[0] === l.lostReason; })[0] || [0, 'Lost'])[1], tone: '' };
  }

  function renderList(view) {
    var D = null, destroyed = false, drawn = false;
    var S = { type: 'all', source: 'all', sort: 'next', showWon: false, showLost: false };
    view.innerHTML = UI.skeleton([[110], [120, 24], [380, 24]]);

    async function refresh() {
      try { D = await loadList(); LH.touchSynced(); if (!destroyed) draw(); }
      catch (e) { console.error(e); if (!D && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load leads. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    refresh();

    function filtered() {
      return D.leads.filter(function (l) { return (S.type === 'all' || l.type === S.type) && (S.source === 'all' || l.source === S.source); });
    }
    function card(l, i) {
      var f = footer(l);
      return '<a class="kb-card" href="#/leads/' + l.id + '" draggable="' + (l.status !== 'won') + '" data-id="' + l.id + '" style="--i:' + i + '"><div class="nm">' + esc(l.name) + '</div>' +
        '<div class="sub">' + esc([l.type, l.suburb].filter(Boolean).join(' · ') || '—') + '</div>' +
        '<div class="mid"><span class="src">' + esc(SRC[l.source] || l.source) + '</span><span class="val">' + (l.value ? fmt.money(l.value) : '') + '</span></div>' +
        '<div class="ft ' + f.tone + '">' + (f.tone ? '<i></i>' : '') + esc(f.t) + '</div></a>';
    }
    function column(stage, list) {
      var total = list.reduce(function (a, l) { return a + l.value; }, 0), collapsed = (stage === 'won' && !S.showWon) || (stage === 'lost' && !S.showLost);
      var head = '<div class="kb-head"><span class="kb-name"><i style="background:' + DOT[stage] + '"></i>' + LABEL[stage] + '</span><span class="kb-count"><b>' + list.length + '</b>' + (total ? ' · ' + fmt.money(total) : '') + '</span></div>';
      var body = '';
      if (stage === 'won' || stage === 'lost') {
        body += '<button type="button" class="kb-toggle" data-toggle="' + stage + '"><span>' + (collapsed ? 'Show ' + list.length + ' ' + stage : 'Hide ' + stage) + '</span><i class="' + (collapsed ? '' : 'up') + '"></i></button>';
      }
      if (!collapsed) body += list.slice().sort(function (a, b) { return b.created < a.created ? -1 : 1; }).map(function (l, i) { return card(l, i); }).join('');
      if (!list.length && !(stage === 'won' || stage === 'lost')) body += '<div class="kb-empty">No leads</div>';
      return '<div class="kb-col" data-stage="' + stage + '">' + head + '<div class="kb-body">' + body + '</div></div>';
    }
    function sortRows(rows) {
      var order = { new: 0, contacted: 1, consulted: 2, quoted: 3 };
      return rows.sort(function (a, b) {
        if (S.sort === 'value') return b.value - a.value;
        if (S.sort === 'newest') return a.created < b.created ? 1 : -1;
        if (S.sort === 'status') return order[a.status] - order[b.status];
        var o = order[a.status] - order[b.status];
        return o !== 0 ? o : (a.updated < b.updated ? -1 : 1);
      });
    }
    function draw() {
      var L = filtered(), st = stats(D), y = window.scrollY;
      view.classList.toggle('enter', !drawn); drawn = true;
      var types = [], srcs = [];
      D.leads.forEach(function (l) { if (l.type && types.indexOf(l.type) === -1) types.push(l.type); if (srcs.indexOf(l.source) === -1) srcs.push(l.source); });
      var open = L.filter(function (l) { return OPEN.indexOf(l.status) !== -1; });
      var rows = sortRows(open.slice());

      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap">Pipeline</div><h1 class="ov-hello">Leads</h1><div class="hero-sub">' + D.leads.length + (D.leads.length === 1 ? ' lead' : ' leads') + ' · Synced from website forms and the app</div></div>' +
        '<div class="ov-actions no-print"><button class="lh-btn" type="button" data-act="csv">Export CSV</button><button class="lh-btn primary" type="button" data-act="add">+ Add lead</button></div></div>' +
        UI.sect('At a glance') + '<div class="ov-glance">' +
        UI.stat('New this month', String(st.newN), '', esc(st.delta), st.up ? 'ok' : 'wait', 0, 'steel') +
        UI.stat('Consult booking rate', st.cr == null ? '—' : String(st.cr), st.cr == null ? '' : '%', 'enquiry → consultation', 'ok', 60, 'ok') +
        UI.stat('Win rate', st.wr == null ? '—' : String(st.wr), st.wr == null ? '' : '%', 'quoted → won', 'steel', 120, 'wait') +
        UI.stat('Leads lost', st.lp == null ? '—' : String(st.lp), st.lp == null ? '' : '%', st.lp == null ? 'No leads yet' : st.ln + ' lost · ' + fmt.money(st.lv), st.lp == null ? '' : (st.lp > 50 ? 'halt' : st.lp > 30 ? 'wait' : 'ok'), 180, 'halt') + '</div>' +
        UI.sect('Pipeline') +
        '<div class="chip-row">' + UI.chips([['all', 'All types']].concat(types.map(function (t) { return [t, t]; })), S.type, 'type') + '<span class="chip-sep"></span>' +
        UI.chips([['all', 'All sources']].concat(srcs.map(function (s) { return [s, s === 'website' ? 'Website' : (SRC[s] || s)]; })), S.source, 'source') + '</div>' +
        '<div class="kb">' + STAGES.map(function (s) { return column(s, L.filter(function (l) { return l.status === s; })); }).join('') + '</div>' +
        UI.sect('All open leads') +
        '<section class="lh-card"><div class="sort-row left">' + UI.chips([['next', 'Next action'], ['value', 'Value'], ['newest', 'Newest'], ['status', 'Status']], S.sort, 'sort') + '</div>' +
        (rows.length ? '<div class="tbl-scroll"><div class="tbl-inner"><div class="ld-head ld-grid"><div>Lead</div><div>Source</div><div>Status</div><div>Value</div><div>Received</div><div>Next action</div></div>' +
          rows.map(function (l, i) {
            return '<a class="ld-row ld-grid" href="#/leads/' + l.id + '" style="--i:' + i + '"><div><div class="n">' + esc(l.name) + '</div><div class="s">' + esc([l.type, l.suburb].filter(Boolean).join(' · ') || '—') + '</div></div>' +
              '<div class="src">' + esc(SRC[l.source] || l.source) + '</div><div class="st"><i style="background:' + DOT[l.status] + '"></i>' + LABEL[l.status] + '</div><div class="vv">' + (l.value ? fmt.money(l.value) : '—') + '</div>' +
              '<div class="faint">' + fmt.date(fmt.dayKey(l.created)) + '</div><div>' + NEXT[l.status] + '</div></a>';
          }).join('') + '</div></div>' : '<div class="lh-empty">No open leads match these filters.</div>') + '</section>';
      window.scrollTo(0, y);
    }

    /* ---- events ---- */
    async function dropOn(id, stage) {
      var lead = D.leads.filter(function (l) { return l.id === id; })[0];
      if (!lead || lead.status === stage) return;
      if (lead.status === 'won') { UI.toast('A won lead has become a project — manage it under Projects.', 'error'); return; }
      try {
        if (stage === 'lost') { await lostForm(lead, refresh); return; }
        if (stage === 'won') { await convertForm(lead); return; }
        await moveTo(id, stage, lead.status === 'lost');
        UI.toast(lead.name + ' moved to ' + LABEL[stage] + '.');
        refresh();
      } catch (e) { UI.toast(LH.errMsg(e), 'error'); }
    }
    function onClick(e) {
      var el = e.target.closest('[data-type],[data-source],[data-sort],[data-toggle],[data-act]');
      if (!el || !D) return;
      if (el.hasAttribute('data-type')) S.type = el.getAttribute('data-type');
      else if (el.hasAttribute('data-source')) S.source = el.getAttribute('data-source');
      else if (el.hasAttribute('data-sort')) S.sort = el.getAttribute('data-sort');
      else if (el.hasAttribute('data-toggle')) { var k = el.getAttribute('data-toggle'); if (k === 'won') S.showWon = !S.showWon; else S.showLost = !S.showLost; }
      else if (el.getAttribute('data-act') === 'add') { addLeadForm(D.types, refresh); return; }
      else if (el.getAttribute('data-act') === 'csv') {
        UI.csv('leads', [['Name', 'Email', 'Phone', 'Suburb', 'Source', 'Type', 'Status', 'Value', 'Win chance %', 'Received']].concat(
          filtered().map(function (l) { return [l.name, l.email, l.phone, l.suburb, SRC[l.source] || l.source, l.type, LABEL[l.status], l.value, l.prob, fmt.dayKey(l.created)]; })));
        return;
      }
      draw();
    }
    var dragId = null;
    function onDragStart(e) { var c = e.target.closest && e.target.closest('.kb-card'); if (!c) return; dragId = c.getAttribute('data-id'); c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { /* ok */ } }
    function onDragEnd(e) { dragId = null; LH.$$('.kb-card.drag,.kb-col.over', view).forEach(function (x) { x.classList.remove('drag', 'over'); }); }
    function onDragOver(e) { var col = e.target.closest && e.target.closest('.kb-col'); if (!col || !dragId) return; e.preventDefault(); LH.$$('.kb-col.over', view).forEach(function (x) { if (x !== col) x.classList.remove('over'); }); col.classList.add('over'); }
    function onDrop(e) { var col = e.target.closest && e.target.closest('.kb-col'); if (!col || !dragId) return; e.preventDefault(); var id = dragId; onDragEnd(); dropOn(id, col.getAttribute('data-stage')); }
    view.addEventListener('click', onClick); view.addEventListener('dragstart', onDragStart); view.addEventListener('dragend', onDragEnd);
    view.addEventListener('dragover', onDragOver); view.addEventListener('drop', onDrop);

    return {
      watch: ['leads', 'lead_activity', 'consultations', 'project_types'], refresh: refresh,
      destroy: function () { destroyed = true; view.classList.remove('enter'); ['click', 'dragstart', 'dragend', 'dragover', 'drop'].forEach(function (ev) { var h = { click: onClick, dragstart: onDragStart, dragend: onDragEnd, dragover: onDragOver, drop: onDrop }[ev]; view.removeEventListener(ev, h); }); },
    };
  }

  /* =====================================================================
     DETAIL
     ===================================================================== */
  function renderDetail(view, id) {
    var D = null, destroyed = false, drawn = false;
    view.innerHTML = UI.skeleton([[140], [90, 24], [420, 24]]);

    async function refresh() {
      try {
        var sb = LH.sb;
        var r = await Promise.all([
          sb.from('leads').select('id,name,email,phone,source,status,lost_reason,lost_note,project_type_id,suburb,notes,follow_up_date,converted_project_id,created_at,updated_at,est_value_cents,probability_pct,project_types(name)').eq('id', id).maybeSingle(),
          sb.from('consultations').select('id,booking_id,outcome,notes,created_at,bookings(starts_at,ends_at,location,status)').eq('lead_id', id).order('created_at', { ascending: false }),
          sb.from('lead_activity').select('id,kind,body,created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(60),
          sb.from('lead_estimate_items').select('id,label,amount_cents,position').eq('lead_id', id).order('position', { ascending: true }),
          sb.from('project_types').select('id,name').order('name'),
        ]);
        for (var i = 0; i < 5; i++) if (r[i].error) throw r[i].error;
        if (!r[0].data) { view.innerHTML = '<div class="lh-card soon"><h2>Lead not found</h2><p class="muted">It may have been deleted.</p><a class="lh-btn primary" href="#/leads">Back to leads</a></div>'; return; }
        D = { lead: model(r[0].data), consults: r[1].data || [], acts: r[2].data || [], items: r[3].data || [], types: r[4].data || [] };
        LH.touchSynced();
        if (!destroyed) draw();
      } catch (e) { console.error(e); if (!D && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load this lead. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    refresh();

    function consultation() {
      var c = D.consults[0]; if (!c) return null;
      var b = one(c.bookings) || {};
      return { id: c.id, bookingId: c.booking_id, outcome: c.outcome, notes: c.notes || '', start: b.starts_at, end: b.ends_at, place: b.location, cancelled: b.status === 'cancelled' };
    }
    function stepper(l) {
      var steps = [['new', 'New'], ['contacted', 'Contacted'], ['consulted', 'Consulted'], ['quoted', 'Quoted'], ['final', l.status === 'lost' ? 'Lost' : l.status === 'won' ? 'Won' : 'Won / Lost']];
      var cur = OPEN.indexOf(l.status); if (l.status === 'won' || l.status === 'lost') cur = 4;
      var h = '<div class="stepper">';
      steps.forEach(function (s, i) {
        var done = i < cur || (i === 4 && l.status === 'won'), now = i === cur && !done, lost = i === 4 && l.status === 'lost';
        h += '<button type="button" class="step' + (done ? ' done' : '') + (now ? ' now' : '') + (lost ? ' lost' : '') + '" data-step="' + s[0] + '"><span class="dot">' + (done ? '✓' : lost ? '×' : (i + 1)) + '</span><span class="lb">' + s[1] + '</span></button>';
        if (i < 4) h += '<span class="line' + (i < cur ? ' on' : '') + '"></span>';
      });
      return h + '</div>';
    }
    function row(k, v) { return '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>'; }

    function draw() {
      var l = D.lead, c = consultation(), y = window.scrollY;
      view.classList.toggle('enter', !drawn); drawn = true;
      var total = D.items.reduce(function (a, i) { return a + i.amount_cents / 100; }, 0) || l.value;
      var lo = Math.round(total * 0.9), hi = Math.round(total * 1.1);
      var consultText = '<span class="muted">Not booked</span>';
      if (c && c.start) {
        var pill = c.cancelled ? ['', 'Cancelled'] : c.outcome === 'completed' ? ['ok', 'Completed'] : c.outcome === 'no_show' ? ['halt', 'No show'] : c.outcome === 'cancelled' ? ['', 'Cancelled'] : ['steel', 'Scheduled'];
        consultText = fmt.wdDM(c.start).replace(',', '') + ' · ' + fmt.time(c.start) + '<div style="margin-top:6px">' + UI.pill(pill[0], pill[1]) + '</div>';
      }
      var notesText = c && c.notes ? c.notes : l.notes;
      var hasBooking = !!(c && !c.cancelled && c.outcome !== 'cancelled');
      var bookBtn = hasBooking ? '<button class="lh-btn" type="button" disabled>Consultation booked</button>' : (OPEN.indexOf(l.status) !== -1 ? '<button class="lh-btn" type="button" data-act="book">Book consultation</button>' : '');
      var activity = D.acts.map(function (a) {
        var text = a.kind === 'status_change' ? 'Moved ' + a.body.replace(/(\w+) → (\w+)/, function (m, f, t) { return 'from ' + (LABEL[f] || f) + ' to ' + (LABEL[t] || t); }) : a.body;
        return '<div class="act"><span class="d">' + fmt.date(fmt.dayKey(a.created_at)) + '</span><i class="' + (a.kind === 'note' ? 'note' : '') + '"></i><span class="t">' + esc(text) + '</span></div>';
      }).join('') || '<div class="faint">No activity yet.</div>';

      view.innerHTML =
        '<a class="crumb" href="#/leads">← Leads</a><div class="cap" style="margin-top:16px">Lead · ' + esc(l.type || 'Enquiry') + '</div>' +
        '<div class="ov-hero" style="margin-top:12px;margin-bottom:26px"><div><h1 class="ov-hello" style="margin:0"><em>' + esc(l.name) + '</em></h1><div class="hero-sub">' +
        esc([l.suburb, 'Enquired ' + fmt.date(fmt.dayKey(l.created)) + ' via ' + (SRC[l.source] || l.source).toLowerCase()].filter(Boolean).join(' · ')) + '</div></div>' +
        '<div class="ov-actions no-print">' + bookBtn + (l.phone ? '<a class="lh-btn" href="tel:' + esc(l.phone.replace(/\s+/g, '')) + '">Call</a>' : '') + (l.email ? '<a class="lh-btn" href="mailto:' + esc(l.email) + '">Message</a>' : '') +
        (l.converted ? '<a class="lh-btn primary" href="#/projects/' + l.converted + '">Open project</a>' : (l.status !== 'won' ? '<button class="lh-btn primary" type="button" data-act="convert">Convert to project</button>' : '')) + '</div></div>' +
        UI.sect('Status') + '<section class="lh-card" style="padding:22px 28px">' + stepper(l) +
        (l.status === 'lost' ? '<div class="lostnote">Lost · ' + esc((LOST.filter(function (x) { return x[0] === l.lostReason; })[0] || [0, 'Other'])[1]) + (l.lostNote ? ' — ' + esc(l.lostNote) : '') + '</div>' : '') + '</section>' +
        UI.sect('Client &amp; consultation') +
        '<div class="ld-detail">' +
        '<section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Details</h2><button type="button" class="lh-link" data-act="edit">Edit</button></div>' +
        row('Phone', l.phone ? esc(l.phone) : '<span class="faint">—</span>') + row('Email', l.email ? esc(l.email) : '<span class="faint">—</span>') + row('Enquiry type', esc(l.type || '—')) +
        row('Lead source', esc(SRC[l.source] || l.source)) + row('Enquiry received', esc(fmt.dateY(fmt.dayKey(l.created)))) + row('Consultation', consultText) +
        '<div class="kvfoot">' + '<button type="button" class="lh-link danger" data-act="delete">Delete lead</button></div></section>' +
        '<div class="stack"><section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Consultation notes</h2><button type="button" class="lh-link" data-act="notes">Edit</button></div>' +
        (notesText ? '<p class="notes">' + esc(notesText) + '</p>' : '<p class="faint">No notes yet. Add what you heard on the consultation.</p>') + '</section>' +
        '<section class="lh-card"><div class="lh-card-head"><h2 class="lh-card-title">Activity</h2></div>' +
        '<form class="note-form" data-note><input class="lh-input" name="note" placeholder="Add a note…" aria-label="Add a note" autocomplete="off"><button class="lh-btn" type="submit">Add</button></form>' +
        '<div class="acts">' + activity + '</div></section></div>' +
        '<div class="stack"><section class="lh-card"><div class="cap">Estimated project value</div><div class="est">' + fmt.moneyFull(total) + '</div>' +
        '<div class="faint tiny">Range ' + fmt.money(lo) + ' – ' + fmt.money(hi) + '</div>' +
        '<div class="est-items">' + (D.items.length ? D.items.map(function (i) {
          var a = i.amount_cents / 100; return '<div class="ei"><div class="el"><span>' + esc(i.label) + '</span><span>' + fmt.money(a) + '</span></div><div class="bar"><i style="width:' + (total ? Math.min(100, (a / total) * 100) : 0) + '%"></i></div></div>';
        }).join('') : '<div class="faint tiny" style="margin-top:14px">No line items yet. Edit the estimate to itemise it.</div>') + '</div>' +
        '<div class="est-actions"><button type="button" class="lh-btn" data-act="estimate">Edit estimate</button>' + (['new', 'contacted', 'consulted'].indexOf(l.status) !== -1 ? '<button type="button" class="lh-btn primary" data-act="quote">Mark as quoted</button>' : '') + '</div></section>' +
        '<section class="lh-card"><div class="lh-card-head" style="margin-bottom:12px"><div class="cap">Probability</div><button type="button" class="lh-link" data-act="prob">Edit</button></div>' +
        '<div class="prob"><span class="serif">' + l.prob + '<small>%</small></span><span class="faint tiny">Weighted ' + fmt.money(total * l.prob / 100) + '</span></div><div class="bar fat"><i style="width:' + l.prob + '%"></i></div></section></div></div>';
      window.scrollTo(0, y);
    }

    /* ---- actions ---- */
    async function run(fn, okMsg) {
      try { await fn(); if (okMsg) UI.toast(okMsg); await refresh(); } catch (e) { console.error(e); UI.toast(LH.errMsg(e), 'error'); }
    }
    async function onClick(e) {
      var stepEl = e.target.closest('[data-step]'), act = e.target.closest('[data-act]');
      if (!D) return;
      var l = D.lead;
      if (stepEl) {
        var s = stepEl.getAttribute('data-step');
        if (s === 'final') {
          if (l.status === 'won') { UI.toast('Won — this lead has become a project.'); return; }
          var pick = await UI.choose('Close out ' + l.name, 'Won leads become a project. Lost leads can be reopened.', [{ key: 'won', label: 'Won — convert to project', primary: true }, { key: 'lost', label: 'Lost', danger: true }]);
          if (pick === 'won') convertForm(l); else if (pick === 'lost') lostForm(l, refresh);
        } else if (s !== l.status) {
          if (l.status === 'won') { UI.toast('A won lead has become a project — manage it under Projects.', 'error'); return; }
          run(function () { return moveTo(l.id, s, l.status === 'lost'); }, 'Moved to ' + LABEL[s] + '.');
        }
        return;
      }
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'convert') convertForm(l);
      else if (a === 'edit') editForm();
      else if (a === 'book') bookForm();
      else if (a === 'notes') notesForm();
      else if (a === 'estimate') estimateForm();
      else if (a === 'prob') probForm();
      else if (a === 'quote') markQuoted();
      else if (a === 'delete') {
        if (await UI.confirm('Delete ' + l.name + '? This removes the lead and its history.', { title: 'Delete lead', yes: 'Delete', danger: true })) {
          run(async function () { var r = await LH.sb.rpc('delete_leads', { p_lead_ids: [l.id] }); if (r.error) throw r.error; destroyed = true; LH.go('leads'); }, 'Lead deleted.');
        }
      }
    }
    async function onSubmit(e) {
      var f = e.target.closest('[data-note]'); if (!f) return;
      e.preventDefault();
      var text = f.elements.note.value.trim(); if (!text) return;
      run(async function () { var r = await LH.sb.from('lead_activity').insert({ lead_id: id, kind: 'note', body: text }); if (r.error) throw r.error; });
    }
    view.addEventListener('click', onClick); view.addEventListener('submit', onSubmit);

    function editForm() {
      var l = D.lead, ec = consultation(), elen = 60;
      if (ec && ec.start && ec.end) elen = Math.max(15, Math.round((new Date(ec.end) - new Date(ec.start)) / 60000));
      var lens = [30, 45, 60, 90, 120]; if (lens.indexOf(elen) === -1) { lens.push(elen); lens.sort(function (a, b) { return a - b; }); }
      UI.form({
        title: 'Edit details', submitLabel: 'Save', wide: true,
        values: { name: l.name, email: l.email, phone: l.phone, suburb: l.suburb, source: l.source, type: l.type,
          cwhen: ec && ec.start && !ec.cancelled ? LH.toLocalInput(ec.start) : '', clen: String(elen), cplace: ec && ec.place ? ec.place : '' },
        fields: [{ name: 'name', label: 'Name', required: true, span: 2 }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'suburb', label: 'Suburb' },
          { name: 'source', label: 'Source', type: 'select', options: Object.keys(SRC).map(function (k) { return { v: k, l: SRC[k] }; }) },
          { name: 'type', label: 'Project type', type: 'select', options: [{ v: '', l: 'Not sure yet' }].concat(D.types.map(function (t) { return { v: t.name, l: t.name }; })) },
          { name: 'newtype', label: 'Or a new type' },
          { name: 'cwhen', label: 'Consultation date and time (Adelaide)', type: 'datetime-local', span: 2, hint: ec && ec.start && !ec.cancelled ? 'Change this to move the booking. It updates the calendar and the app.' : 'Fill this in to book a consultation.' },
          { name: 'clen', label: 'Consultation length', type: 'select', options: lens.map(function (m) { return { v: String(m), l: m < 60 ? m + ' minutes' : (m % 60 === 0 ? (m / 60) + (m === 60 ? ' hour' : ' hours') : m + ' minutes') }; }) },
          { name: 'cplace', label: 'Consultation location' }],
        onSubmit: async function (v) {
          var typeId = await typeIdFor(v.newtype || v.type);
          var r = await LH.sb.from('leads').update({ name: v.name, email: UI.nullIfBlank(v.email), phone: UI.nullIfBlank(v.phone), suburb: UI.nullIfBlank(v.suburb), source: v.source, project_type_id: typeId }).eq('id', id);
          if (r.error) throw r.error;
          var when = UI.nullIfBlank(v.cwhen);
          if (when) {
            var startISO = LH.adelaideToISO(when); if (!startISO) throw new Error('Pick a valid consultation date and time.');
            var endISO = new Date(new Date(startISO).getTime() + (parseInt(v.clen, 10) || 60) * 60000).toISOString();
            var booked = ec && ec.start && !ec.cancelled && ec.outcome !== 'cancelled' && ec.bookingId;
            if (booked) { var ub = await LH.sb.from('bookings').update({ starts_at: startISO, ends_at: endISO, location: UI.nullIfBlank(v.cplace) }).eq('id', ec.bookingId); if (ub.error) throw ub.error; }
            else { var bk = await LH.sb.rpc('book_consultation', { p_lead_id: id, p_starts: startISO, p_ends: endISO, p_location: UI.nullIfBlank(v.cplace) }); if (bk.error) throw bk.error; }
          }
        },
      }).then(function (ok) { if (ok) { UI.toast('Saved.'); refresh(); } });
    }
    function bookForm() {
      var l = D.lead, tomorrow = LH.keyOf(LH.today().y, LH.today().m, LH.today().d + 1);
      UI.form({
        title: 'Book a consultation', intro: 'It is added to the calendar and the app.', submitLabel: 'Book',
        values: { when: tomorrow + 'T09:00', len: '60', place: l.suburb },
        fields: [{ name: 'when', label: 'Date and time (Adelaide)', type: 'datetime-local', required: true, span: 2 },
          { name: 'len', label: 'Length', type: 'select', options: [['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['90', '1.5 hours'], ['120', '2 hours']].map(function (x) { return { v: x[0], l: x[1] }; }) },
          { name: 'place', label: 'Location' }],
        onSubmit: async function (v) {
          var start = LH.adelaideToISO(v.when); if (!start) throw new Error('Pick a date and time.');
          var end = new Date(new Date(start).getTime() + (+v.len) * 60000).toISOString();
          var r = await LH.sb.rpc('book_consultation', { p_lead_id: id, p_starts: start, p_ends: end, p_location: UI.nullIfBlank(v.place) });
          if (r.error) throw r.error;
        },
      }).then(function (ok) { if (ok) { UI.toast('Consultation booked.'); refresh(); } });
    }
    function notesForm() {
      var c = consultation(), l = D.lead;
      var fields = [{ name: 'notes', label: 'Notes', type: 'textarea', rows: 7, span: 2 }];
      var vals = { notes: c ? c.notes : l.notes, outcome: '' };
      if (c) fields.unshift({ name: 'outcome', label: 'Consultation outcome', type: 'select', options: [{ v: '', l: 'Keep as is' }, { v: 'completed', l: 'Completed' }, { v: 'no_show', l: 'No show' }, { v: 'cancelled', l: 'Cancelled' }], span: 2 });
      UI.form({
        title: 'Consultation notes', submitLabel: 'Save', values: vals, fields: fields, wide: true,
        onSubmit: async function (v) {
          if (c && v.outcome) { var r = await LH.sb.rpc('record_consultation_outcome', { p_consultation_id: c.id, p_outcome: v.outcome, p_notes: UI.nullIfBlank(v.notes) }); if (r.error) throw r.error; }
          else if (c) { var r2 = await LH.sb.from('consultations').update({ notes: UI.nullIfBlank(v.notes) }).eq('id', c.id); if (r2.error) throw r2.error; }
          else { var r3 = await LH.sb.from('leads').update({ notes: UI.nullIfBlank(v.notes) }).eq('id', id); if (r3.error) throw r3.error; }
        },
      }).then(function (ok) { if (ok) { UI.toast('Notes saved.'); refresh(); } });
    }
    function probForm() {
      UI.form({
        title: 'Chance of winning', submitLabel: 'Save', values: { p: D.lead.prob },
        fields: [{ name: 'p', label: 'Probability (%)', type: 'number', min: 0, max: 100, required: true, hint: 'Used to weight the pipeline value on the Overview.' }],
        onSubmit: async function (v) {
          var p = Math.max(0, Math.min(100, parseInt(v.p, 10) || 0));
          var r = await LH.sb.from('leads').update({ probability_pct: p }).eq('id', id); if (r.error) throw r.error;
        },
      }).then(function (ok) { if (ok) { UI.toast('Saved.'); refresh(); } });
    }
    function estimateForm() {
      var rows = D.items.length ? D.items.map(function (i) { return { label: i.label, amount: i.amount_cents / 100 }; }) : [{ label: '', amount: '' }];
      function rowHtml(r) { return '<div class="est-row"><input class="lh-input" data-l placeholder="Item e.g. Joinery" value="' + esc(r.label) + '"><div class="lh-money"><span>$</span><input class="lh-input" data-a type="number" min="0" step="1" value="' + esc(r.amount) + '"></div><button type="button" class="lh-x sm" data-rm aria-label="Remove">×</button></div>'; }
      UI.form({
        title: 'Edit estimate', submitLabel: 'Save estimate', wide: true, intro: 'Itemise the quote. The estimated value becomes the total of the items.',
        values: { value: D.items.length ? '' : (D.lead.value || '') },
        fields: [{ name: 'value', label: 'Estimated value (used when there are no items)', type: 'money', span: 2 }],
        extra: '<div class="cap" style="margin:18px 0 10px">Line items</div><div id="estRows">' + rows.map(rowHtml).join('') + '</div><button type="button" class="lh-link" id="estAdd" style="margin-top:10px">+ Add item</button>',
        onOpen: function (el) {
          el.querySelector('#estAdd').addEventListener('click', function () { el.querySelector('#estRows').insertAdjacentHTML('beforeend', rowHtml({ label: '', amount: '' })); });
          el.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (b) b.closest('.est-row').remove(); });
        },
        onSubmit: async function (v, form) {
          var items = LH.$$('.est-row', form).map(function (r) { return { label: r.querySelector('[data-l]').value.trim(), amount: UI.dollars(r.querySelector('[data-a]').value) }; }).filter(function (i) { return i.label && i.amount; });
          if (items.length) {
            var r = await LH.sb.rpc('save_lead_estimate', { p_lead_id: id, p_items: items.map(function (i) { return { label: i.label, amount_cents: i.amount * 100 }; }) }); if (r.error) throw r.error;
          } else {
            var r2 = await LH.sb.rpc('save_lead_estimate', { p_lead_id: id, p_items: [] }); if (r2.error) throw r2.error;
            var r3 = await LH.sb.from('leads').update({ est_value_cents: (UI.dollars(v.value) || 0) * 100 }).eq('id', id); if (r3.error) throw r3.error;
          }
        },
      }).then(function (ok) { if (ok) { UI.toast('Estimate saved.'); refresh(); } });
    }
    function markQuoted() {
      run(function () { return moveTo(D.lead.id, 'quoted', false); }, 'Marked as quoted.');
    }

    return { watch: ['leads', 'lead_activity', 'consultations', 'lead_estimate_items', 'bookings'], refresh: refresh, destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); view.removeEventListener('submit', onSubmit); } };
  }

  LH.screens.leads = {
    title: 'Leads',
    render: function (view, args) { return args && args[0] ? renderDetail(view, args[0]) : renderList(view); },
  };
  LH.leadForms = { convert: convertForm, lost: lostForm, add: addLeadForm };
})();
