/* Overview — the command centre: greeting + weather, headline numbers, schedule,
   what needs attention, and every active project. Reads the same tables the app writes. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt;

  var KIND = {
    SITE: { label: 'Site', color: 'var(--i3)' },
    CONSULT: { label: 'Consult', color: 'var(--steel)' },
    TRADE: { label: 'Contractor', color: 'var(--ok)' },
    CALL: { label: 'Call', color: 'var(--i2)' },
    ADMIN: { label: 'Admin', color: 'var(--wait)' },
  };
  var STATUS = {
    ontime: { cls: 'ok', label: 'On time' },
    delayed: { cls: 'wait', label: 'Delayed' },
    halted: { cls: 'halt', label: 'Halted' },
  };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var DOW3 = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  /* ---- date helpers on plain y/m/d (no time zones involved) ---- */
  function utc(y, m, d) { return new Date(Date.UTC(y, m, d)); }
  function keyOfDate(dt) { return LH.keyOf(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()); }
  function addDays(dt, n) { return utc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + n); }
  function mondayOf(dt) { return addDays(dt, -((dt.getUTCDay() + 6) % 7)); }

  function kindOf(b) {
    if (b.lead_id) return 'CONSULT';
    return { site: 'SITE', consultation: 'CONSULT', contractor: 'TRADE', call: 'CALL', admin: 'ADMIN' }[b.kind] || 'ADMIN';
  }
  function one(x) { return Array.isArray(x) ? x[0] : x; }

  async function load() {
    var sb = LH.sb;
    var today = LH.today();
    var from = utc(today.y, today.m - 1, 1).toISOString();
    var to = utc(today.y, today.m + 4, 1).toISOString();
    var r = await Promise.all([
      sb.from('projects').select('id,code,name,status,health,percent_complete,delay_days,start_date,forecast_completion_date,completed_at,created_at,client_status_message,site_street,site_suburb,clients(name),project_types(name),project_financials(contract_value_cents,forecast_cost_cents,original_budget_cents)').is('deleted_at', null),
      sb.from('project_stages').select('project_id,name,position').eq('status', 'current'),
      sb.from('leads').select('id,name,status,est_value_cents,probability_pct'),
      sb.from('bookings').select('id,project_id,lead_id,kind,title,starts_at,ends_at,status').neq('status', 'cancelled').gte('ends_at', from).lte('starts_at', to).order('starts_at', { ascending: true }),
      sb.from('business_settings').select('rain_risk_threshold_pct').limit(1).maybeSingle(),
    ]);
    for (var i = 0; i < 4; i++) if (r[i].error) throw r[i].error;

    var stageBy = {};
    (r[1].data || []).forEach(function (s) { stageBy[s.project_id] = s.name; });
    var projects = (r[0].data || []).map(function (p) {
      var fin = one(p.project_financials) || {};
      var cl = one(p.clients) || {}, ty = one(p.project_types) || {};
      return {
        id: p.id, code: p.code, name: p.name, status: p.status, health: p.health, st: LH.projectStatus(p),
        pct: p.percent_complete || 0, delay: p.delay_days, note: p.client_status_message,
        forecast: p.forecast_completion_date, completedAt: p.completed_at, createdAt: p.created_at,
        address: [p.site_street, p.site_suburb].filter(Boolean).join(', ') || p.name,
        street: p.site_street || p.name, client: cl.name || '', type: ty.name || '',
        stage: stageBy[p.id] || '', contract: (fin.contract_value_cents || 0) / 100,
        cost: (fin.forecast_cost_cents || 0) / 100, budget: (fin.original_budget_cents || 0) / 100,
      };
    });
    var byId = {}; projects.forEach(function (p) { byId[p.id] = p; });
    return {
      projects: projects, byId: byId, leads: r[2].data || [], bookings: r[3].data || [],
      rainThreshold: (r[4].data && r[4].data.rain_risk_threshold_pct) || 60,
    };
  }

  function metrics(d) {
    var t = LH.today();
    var active = d.projects.filter(function (p) { return p.status === 'active' || p.status === 'on_hold'; });
    var contract = 0, added = 0, withCost = { c: 0, f: 0, b: 0, bc: 0 };
    var qStart = utc(t.y, Math.floor(t.m / 3) * 3, 1).getTime();
    active.forEach(function (p) {
      contract += p.contract;
      if (p.createdAt && new Date(p.createdAt).getTime() >= qStart) added += p.contract;
      if (p.contract > 0 && p.cost > 0) { withCost.c += p.contract; withCost.f += p.cost; }
      if (p.contract > 0 && p.cost > 0 && p.budget > 0) { withCost.b += p.budget; withCost.bc += p.contract; }
    });
    var margin = withCost.c > 0 ? ((withCost.c - withCost.f) / withCost.c) * 100 : null;
    var vsBudget = withCost.bc > 0 ? margin - ((withCost.bc - withCost.b) / withCost.bc) * 100 : null;
    var open = d.leads.filter(function (l) { return l.status !== 'won' && l.status !== 'lost'; });
    var weighted = 0;
    open.forEach(function (l) { weighted += ((l.est_value_cents || 0) / 100) * ((l.probability_pct || 0) / 100); });
    var done = d.projects.filter(function (p) {
      return p.status === 'completed' && p.completedAt && +fmt.dayKey(p.completedAt).slice(0, 4) === t.y;
    });
    var delivered = 0; done.forEach(function (p) { delivered += p.contract; });
    return { active: active, contract: contract, added: added, margin: margin, vsBudget: vsBudget, open: open.length, weighted: weighted, done: done.length, delivered: delivered };
  }

  /** Bookings grouped by Adelaide calendar day. */
  function eventsByDay(d) {
    var out = {};
    d.bookings.forEach(function (b) {
      var k = fmt.dayKey(b.starts_at);
      (out[k] = out[k] || []).push({ id: b.id, k: kindOf(b), title: b.title, start: b.starts_at, end: b.ends_at, t: fmt.time(b.starts_at), project: b.project_id, lead: b.lead_id });
    });
    return out;
  }

  /** For each active project, the days it has someone on site (site or contractor bookings). */
  function laneDays(d) {
    var by = {};
    d.bookings.forEach(function (b) {
      if (!b.project_id || (b.kind !== 'site' && b.kind !== 'contractor')) return;
      var a = fmt.dayKey(b.starts_at), z = fmt.dayKey(new Date(new Date(b.ends_at).getTime() - 1));
      var cur = utc(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8)); var end = utc(+z.slice(0, 4), +z.slice(5, 7) - 1, +z.slice(8));
      by[b.project_id] = by[b.project_id] || {};
      for (var n = 0; cur <= end && n < 62; n++) { by[b.project_id][keyOfDate(cur)] = true; cur = addDays(cur, 1); }
    });
    return by;
  }

  /* ================== rendering ================== */
  function greeting() {
    var h = fmt.hour(new Date());
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function render(view) {
    var data = null, wx = null, destroyed = false;
    var t = LH.today();
    var S = { y: t.y, m: t.m, d: t.d, view: 'Month', filter: 'all' };

    view.innerHTML = '<div class="lh-skel" style="height:150px;margin-top:10px"></div>' +
      '<div class="ov-glance" style="margin-top:22px">' + [1, 2, 3, 4].map(function () { return '<div class="lh-skel" style="height:118px"></div>'; }).join('') + '</div>' +
      '<div class="lh-skel" style="height:420px;margin-top:22px"></div>';

    async function refresh() {
      try {
        data = await load(); LH.touchSynced();
        if (destroyed) return;
        draw();
      } catch (e) {
        console.error(e);
        if (!data && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load the dashboard. ' + esc(e.message || '') + '</div>';
      }
    }
    LH.weather().then(function (w) { wx = w; if (data && !destroyed) draw(); });
    refresh();

    /* ---------- weather line ---------- */
    function weatherBlock() {
      if (!wx || !wx.forecast || !wx.forecast.length) return '';
      var today = wx.forecast[0];
      var temp = wx.currentTempC != null ? Math.round(wx.currentTempC) + '°' : (today.maxTempC != null ? today.maxTempC + '°' : '');
      var warn = '';
      var ev = eventsByDay(data);
      for (var i = 0; i < wx.forecast.length; i++) {
        var day = wx.forecast[i];
        if (day.chanceOfRain != null && day.chanceOfRain >= data.rainThreshold) {
          var names = [], seen = {};
          (ev[day.date] || []).forEach(function (e) {
            var p = e.project && data.byId[e.project];
            if (p && !seen[p.id] && (e.k === 'SITE' || e.k === 'TRADE')) { seen[p.id] = 1; names.push(p.street); }
          });
          if (names.length) {
            var lbl = new Date(day.date + 'T00:00:00Z');
            warn = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' }).format(lbl) + ' ' + day.chanceOfRain + '% rain may affect ' + names.slice(0, 2).join(' and ');
            break;
          }
        }
      }
      return '<div class="ov-wx"><b>' + esc(temp) + '</b><span>' + esc(today.precis) + '</span>' +
        (warn ? '<span class="lh-pill wait"><i></i>' + esc(warn) + '</span>' : '') +
        '<span class="faint" style="font-size:11px">Weather by WeatherAPI.com</span></div>';
    }

    /* ---------- schedule card ---------- */
    function monthCells(ev) {
      var first = utc(S.y, S.m, 1), lead = (first.getUTCDay() + 6) % 7, days = utc(S.y, S.m + 1, 0).getUTCDate();
      var h = DOW.map(function (x) { return '<div class="cal-dow">' + x + '</div>'; }).join('');
      for (var i = 0; i < lead; i++) h += '<div></div>';
      for (var n = 1; n <= days; n++) {
        var key = LH.keyOf(S.y, S.m, n), c = (ev[key] || []).length;
        var cls = 'cal-cell' + (c ? ' has' : '') + (key === LH.keyOf(t.y, t.m, t.d) ? ' today' : '') + (n === S.d ? ' sel' : '');
        h += '<button type="button" class="' + cls + '" data-day="' + n + '" aria-label="' + n + ' ' + MONTHS[S.m] + (c ? ', ' + c + ' bookings' : '') + '">' + n +
          '<i style="width:' + (c > 2 ? 14 : c > 1 ? 9 : 4) + 'px;' + (c ? '' : 'background:transparent') + '"></i></button>';
      }
      return '<div class="cal-month">' + h + '</div>';
    }

    function weekHead(ev) {
      var mon = mondayOf(utc(S.y, S.m, S.d)), todayKey = LH.keyOf(t.y, t.m, t.d), selKey = LH.keyOf(S.y, S.m, S.d);
      var h = '<div class="week-grid">';
      for (var i = 0; i < 7; i++) {
        var dt = addDays(mon, i), key = keyOfDate(dt), c = (ev[key] || []).length;
        h += '<button type="button" class="' + (key === selKey ? 'sel ' : '') + (key === todayKey ? 'today' : '') + '" data-pick="' + key + '"><span class="w">' + DOW3[i] + '</span><span class="d">' + dt.getUTCDate() + '</span>' +
          '<i style="display:block;height:3px;border-radius:2px;width:' + (c > 1 ? 9 : 4) + 'px;background:' + (c ? 'currentColor' : 'transparent') + '"></i></button>';
      }
      return h + '</div>';
    }

    function lanes() {
      var mon = mondayOf(utc(S.y, S.m, S.d)), by = laneDays(data), todayKey = LH.keyOf(t.y, t.m, t.d);
      var rows = metricsCache.active.filter(function (p) { return by[p.id]; });
      if (!rows.length) return '';
      var h = '<div class="cap" style="margin:18px 0 4px">On site this week</div><div class="lanes">';
      rows.forEach(function (p) {
        h += '<div class="lane"><div class="nm"><div>' + esc(p.street) + '</div><div class="faint" style="font-size:12px">' + esc(p.stage || p.type || '') + '</div></div>';
        for (var i = 0; i < 7; i++) {
          var k = keyOfDate(addDays(mon, i)), on = by[p.id][k];
          h += '<div class="c' + (on ? ' on ' + STATUS[p.st].cls : '') + '" title="' + k + '"></div>';
        }
        h += '</div>';
      });
      return h + '</div>';
    }

    function agenda(ev) {
      var key = LH.keyOf(S.y, S.m, S.d), list = ev[key] || [];
      var label = key === LH.keyOf(t.y, t.m, t.d) ? 'Today' : fmt.wdDM(new Date(Date.UTC(S.y, S.m, S.d, 3)));
      var h = '<div class="agenda"><div class="agenda-head"><div class="cap">' + esc(label) + '</div><div class="faint" style="font-size:12px">' +
        list.length + (list.length === 1 ? ' booking' : ' bookings') + ' · Synced to Google Calendar</div></div>';
      if (!list.length) h += '<div class="lh-empty" style="padding:18px 0">A clear day — nothing booked.</div>';
      list.forEach(function (e) {
        var kd = KIND[e.k];
        h += '<div class="ev"><div class="t">' + esc(e.t) + '</div><div class="bar" style="background:' + kd.color + '"></div><div class="nm"><div>' + esc(e.title) + '</div><div class="faint" style="font-size:12px">' + kd.label + '</div></div></div>';
      });
      if (S.view !== 'Day') h += '<div style="margin-top:10px"><button type="button" class="lh-link" data-view="Day" style="border:0;background:none;padding:0">Open day view</button></div>';
      return h + '</div>';
    }

    function dayGrid(ev) {
      var list = ev[LH.keyOf(S.y, S.m, S.d)] || [], startH = 7, endH = 18, px = 48;
      var h = '<div class="daygrid" style="height:' + (endH - startH + 1) * px + 'px">';
      for (var hr = startH; hr <= endH; hr++) h += '<div class="dayrow" style="position:absolute;left:0;right:0;top:' + (hr - startH) * px + 'px"><span>' + (hr === 12 ? '12 pm' : hr > 12 ? hr - 12 : hr + (hr === startH ? ' am' : '')) + '</span></div>';
      list.forEach(function (e) {
        var s = new Date(e.start), en = new Date(e.end);
        var sh = Math.max(startH, fmt.hour(s) + +fmt.time(s).slice(3) / 60), eh = Math.min(endH + 1, sh + Math.max(0.6, Math.min(8, (en - s) / 3600000)));
        h += '<div class="dayev" style="top:' + (sh - startH) * px + 'px;height:' + Math.max(28, (eh - sh) * px - 3) + 'px;background:' + KIND[e.k].color + '"><b style="font-weight:500">' + esc(e.title) + '</b><div style="opacity:.85">' + esc(e.t) + ' · ' + KIND[e.k].label + '</div></div>';
      });
      return h + '</div>';
    }

    function scheduleCard() {
      var ev = eventsByDay(data), title, sub = '';
      if (S.view === 'Month') { title = MONTHS[S.m] + ' ' + S.y; }
      else if (S.view === 'Week') {
        var mon = mondayOf(utc(S.y, S.m, S.d)), sun = addDays(mon, 6);
        title = mon.getUTCDate() + ' – ' + sun.getUTCDate() + ' ' + MONTHS[sun.getUTCMonth()].slice(0, 3);
      } else { title = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(utc(S.y, S.m, S.d)); }

      var body;
      if (S.view === 'Month') {
        body = monthCells(ev) +
          '<div class="cal-legend">' + ['SITE', 'CONSULT', 'TRADE', 'ADMIN'].map(function (k) { return '<span><i style="background:' + KIND[k].color + '"></i>' + KIND[k].label + '</span>'; }).join('') + '</div>' + agenda(ev);
      } else if (S.view === 'Week') { body = weekHead(ev) + lanes() + agenda(ev); }
      else { body = weekHead(ev) + dayGrid(ev) + (((ev[LH.keyOf(S.y, S.m, S.d)] || []).length) ? '' : '<div class="lh-empty">A clear day — nothing booked.</div>'); }

      return '<section class="lh-card" id="ovCal"><div class="cal-head"><div class="cal-nav"><button type="button" data-step="-1" aria-label="Previous">‹</button><div class="cal-title">' + esc(title) + '</div><button type="button" data-step="1" aria-label="Next">›</button></div>' +
        '<div style="display:flex;gap:10px;align-items:center"><button type="button" class="lh-btn" data-today style="height:30px">Today</button><div class="lh-seg" role="tablist">' +
        ['Month', 'Week', 'Day'].map(function (v) { return '<button type="button" data-view="' + v + '" class="' + (S.view === v ? 'on' : '') + '">' + v + '</button>'; }).join('') + '</div></div></div>' + body + '</section>';
    }

    /* ---------- needs attention ---------- */
    function attentionCard() {
      var items = [];
      metricsCache.active.forEach(function (p) {
        if (p.st === 'ontime') return;
        items.push({
          halt: p.st === 'halted', tag: p.street.toUpperCase(),
          title: p.note || (p.st === 'halted' ? 'Work is paused' : 'Behind schedule' + (p.delay ? ' · +' + p.delay + (p.delay === 1 ? ' day' : ' days') : '')),
          sub: [p.stage, p.client].filter(Boolean).join(' · '),
          href: p.st === 'halted' ? '#/inbox' : '#/projects/' + p.id, act: p.st === 'halted' ? 'Message client' : 'Open project',
        });
      });
      items.sort(function (a, b) { return (b.halt ? 1 : 0) - (a.halt ? 1 : 0); });
      var h = '<section class="lh-card"><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px"><h2 class="lh-h2">Needs attention</h2><span class="faint">' + items.length + '</span></div>';
      if (!items.length) h += '<div class="lh-empty">Nothing needs attention. Every active project is on time.</div>';
      items.forEach(function (i) {
        h += '<div class="att' + (i.halt ? ' halt' : '') + '"><div style="flex:1;min-width:0"><div class="cap" style="color:' + (i.halt ? 'var(--halt)' : 'var(--wait)') + '">' + esc(i.tag) + '</div><div class="tt">' + esc(i.title) + '</div>' +
          (i.sub ? '<div class="faint" style="font-size:12.5px">' + esc(i.sub) + '</div>' : '') + '<a class="act" href="' + i.href + '">' + i.act + ' →</a></div></div>';
      });
      return h + '</section>';
    }

    /* ---------- projects table ---------- */
    function projectsTable() {
      var rows = metricsCache.active.filter(function (p) {
        return S.filter === 'all' || (S.filter === 'ontime' ? p.st === 'ontime' : p.st !== 'ontime');
      });
      var h = '<section class="lh-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px"><h2 class="lh-h2">Active projects</h2>' +
        '<div class="lh-seg">' + [['all', 'All'], ['ontime', 'On track'], ['risk', 'At risk']].map(function (f) { return '<button type="button" data-filter="' + f[0] + '" class="' + (S.filter === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div></div>';
      if (!rows.length) return h + '<div class="lh-empty">No projects here yet.</div></section>';
      h += '<div class="tablewrap"><table class="tbl"><thead><tr><th>Project</th><th>Stage</th><th>Progress</th><th class="num">Contract</th><th class="num">Margin</th><th>Completion</th><th>Status</th></tr></thead><tbody>';
      rows.forEach(function (p) {
        var st = STATUS[p.st], m = p.contract > 0 && p.cost > 0 ? (((p.contract - p.cost) / p.contract) * 100).toFixed(1) + '%' : '—';
        var label = st.label; if (p.st === 'delayed' && p.delay) label = p.delay + (p.delay === 1 ? ' day behind' : ' days behind');
        h += '<tr class="link" data-open="' + esc(p.id) + '"><td><div class="n">' + esc(p.street) + '</div><div class="faint" style="font-size:12px">' + esc([p.type, p.client].filter(Boolean).join(' · ')) + '</div></td>' +
          '<td>' + esc(p.stage || '—') + '</td><td><div class="prog"><div class="bar"><i style="width:' + Math.min(100, p.pct) + '%"></i></div><span>' + p.pct + '%</span></div></td>' +
          '<td class="num">' + (p.contract ? fmt.money(p.contract) : '—') + '</td><td class="num">' + m + '</td><td>' + fmt.date(p.forecast) + '</td>' +
          '<td><span class="lh-pill ' + st.cls + '"><i></i>' + esc(label) + '</span></td></tr>';
      });
      return h + '</tbody></table></div></section>';
    }

    /* ---------- page ---------- */
    var metricsCache = null;
    function draw() {
      metricsCache = metrics(data);
      var m = metricsCache, first = (LH.state.name || '').split(' ')[0] || 'there';
      var added = m.added > 0 ? '+' + fmt.money(m.added) + ' this quarter' : m.active.length + ' active ' + (m.active.length === 1 ? 'project' : 'projects');
      var mg = m.margin == null ? '—' : m.margin.toFixed(1) + '%';
      var mgSub = m.margin == null ? 'Add forecast costs to see margin' : m.vsBudget == null ? 'on forecast costs' : (m.vsBudget >= 0 ? '+' : '−') + Math.abs(m.vsBudget).toFixed(1) + ' pts vs budget';
      var keep = { y: window.scrollY };

      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap ov-date">' + esc(fmt.long(new Date())) + '</div><h1 class="ov-hello">' + greeting() + ', <em>' + esc(first) + '</em></h1>' + weatherBlock() + '</div>' +
        '<div class="ov-actions no-print"><button class="lh-btn" type="button" id="ovSheet">Export day sheet</button><a class="lh-btn primary" href="#/projects/new">+ New project</a></div></div>' +
        '<div class="lh-sect"><span class="cap">At a glance</span></div>' +
        '<div class="ov-glance">' +
        stat('Active contract value', fmt.money(m.contract), added) +
        stat('Gross margin (forecast)', mg, mgSub) +
        stat('Pipeline (weighted)', fmt.money(m.weighted), m.open + ' open ' + (m.open === 1 ? 'lead' : 'leads')) +
        stat('Delivered value · ' + t.y, fmt.money(m.delivered), m.done + (m.done === 1 ? ' project completed' : ' projects completed')) + '</div>' +
        '<div class="lh-sect"><span class="cap">Schedule &amp; attention</span></div>' +
        '<div class="ov-grid">' + scheduleCard() + attentionCard() + '</div>' +
        '<div class="lh-sect"><span class="cap">Active projects</span><a href="#/projects">View all</a></div>' + projectsTable();
      window.scrollTo(0, keep.y);
    }
    function stat(label, value, sub) {
      return '<div class="lh-card stat"><div class="cap">' + esc(label) + '</div><div class="v">' + esc(value) + '</div><div class="s">' + esc(sub) + '</div></div>';
    }

    /* ---------- events ---------- */
    function step(dir) {
      if (S.view === 'Month') { var dt = utc(S.y, S.m + dir, 1); S.y = dt.getUTCFullYear(); S.m = dt.getUTCMonth(); S.d = Math.min(S.d, utc(S.y, S.m + 1, 0).getUTCDate()); }
      else { var n = addDays(utc(S.y, S.m, S.d), dir * (S.view === 'Week' ? 7 : 1)); S.y = n.getUTCFullYear(); S.m = n.getUTCMonth(); S.d = n.getUTCDate(); }
    }
    function onClick(e) {
      var el = e.target.closest('[data-day],[data-pick],[data-step],[data-today],[data-view],[data-filter],[data-open],#ovSheet');
      if (!el || !data) return;
      if (el.id === 'ovSheet') return daySheet();
      if (el.hasAttribute('data-open')) { LH.go('projects/' + el.getAttribute('data-open')); return; }
      if (el.hasAttribute('data-day')) S.d = +el.getAttribute('data-day');
      else if (el.hasAttribute('data-pick')) { var p = el.getAttribute('data-pick').split('-'); S.y = +p[0]; S.m = +p[1] - 1; S.d = +p[2]; }
      else if (el.hasAttribute('data-step')) step(+el.getAttribute('data-step'));
      else if (el.hasAttribute('data-today')) { var n = LH.today(); S.y = n.y; S.m = n.m; S.d = n.d; }
      else if (el.hasAttribute('data-view')) S.view = el.getAttribute('data-view');
      else if (el.hasAttribute('data-filter')) S.filter = el.getAttribute('data-filter');
      draw();
    }
    view.addEventListener('click', onClick);

    function daySheet() {
      var ev = eventsByDay(data)[LH.keyOf(S.y, S.m, S.d)] || [];
      var title = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(utc(S.y, S.m, S.d));
      var rows = ev.map(function (e) {
        var p = e.project && data.byId[e.project];
        return '<tr><td>' + esc(e.t) + '</td><td>' + esc(e.title) + '</td><td>' + KIND[e.k].label + '</td><td>' + esc(p ? p.address : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="4">Nothing booked.</td></tr>';
      var w = window.open('', '_blank');
      if (!w) { alert('Allow pop-ups for this site to export the day sheet.'); return; }
      w.document.write('<!doctype html><title>Day sheet</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#111F2E}h1{font:300 28px Georgia,serif;margin:0 0 4px}p{color:#4F5B66;margin:0 0 22px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:9px 10px;border-bottom:1px solid #ccd}th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#4F5B66}</style>' +
        '<h1>Lotti Homes — day sheet</h1><p>' + esc(title) + '</p><table><thead><tr><th>Time</th><th>What</th><th>Type</th><th>Where</th></tr></thead><tbody>' + rows + '</tbody></table>');
      w.document.close(); w.focus(); w.print();
    }

    return {
      refresh: refresh,
      destroy: function () { destroyed = true; view.removeEventListener('click', onClick); },
    };
  }

  LH.screens.overview = { title: 'Overview', render: render };
})();
