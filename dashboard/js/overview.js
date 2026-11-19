/* Overview — the command centre: greeting + weather, headline numbers, schedule,
   what needs attention, and every active project. Reads the same tables the app writes. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt;

  var KIND = {
    SITE: { label: 'SITE', color: 'var(--i3)' },
    CONSULT: { label: 'CONSULT', color: 'var(--steel)' },
    TRADE: { label: 'CONTRACTOR', color: 'var(--ok)' },
    CALL: { label: 'CALL', color: 'var(--i2)' },
    ADMIN: { label: 'ADMIN', color: 'var(--wait)' },
  };
  var STATUS = { ontime: { cls: 'ok', label: 'On time', c: 'var(--ok)' }, delayed: { cls: 'wait', label: 'Delayed', c: 'var(--wait)' }, halted: { cls: 'halt', label: 'Halted', c: 'var(--halt)' } };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOWL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var DOW3 = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  var DOWN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* ---- date helpers on plain y/m/d (no time zones involved) ---- */
  function utc(y, m, d) { return new Date(Date.UTC(y, m, d)); }
  function keyOfDate(dt) { return LH.keyOf(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()); }
  function addDays(dt, n) { return utc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + n); }
  function mondayOf(dt) { return addDays(dt, -((dt.getUTCDay() + 6) % 7)); }
  function parseKey(k) { var p = k.split('-'); return utc(+p[0], +p[1] - 1, +p[2]); }

  function kindOf(b) {
    if (b.lead_id) return 'CONSULT';
    return { site: 'SITE', consultation: 'CONSULT', contractor: 'TRADE', call: 'CALL', admin: 'ADMIN' }[b.kind] || 'ADMIN';
  }
  function one(x) { return Array.isArray(x) ? x[0] : x; }

  async function load() {
    var sb = LH.sb, today = LH.today();
    var from = utc(today.y, today.m - 1, 1).toISOString();
    var to = utc(today.y, today.m + 4, 1).toISOString();
    var r = await Promise.all([
      sb.from('projects').select('id,code,name,status,health,percent_complete,delay_days,start_date,forecast_completion_date,completed_at,created_at,client_status_message,site_street,site_suburb,clients(name),project_types(name),project_financials(contract_value_cents,forecast_cost_cents,original_budget_cents)').is('deleted_at', null),
      sb.from('project_stages').select('project_id,name,position').eq('status', 'current'),
      sb.from('leads').select('id,name,status,est_value_cents,probability_pct'),
      sb.from('bookings').select('id,project_id,lead_id,kind,title,starts_at,ends_at,status').neq('status', 'cancelled').gte('ends_at', from).lte('starts_at', to).order('starts_at', { ascending: true }),
      sb.from('business_settings').select('rain_risk_threshold_pct').limit(1).maybeSingle(),
      sb.from('weather_notices').select('project_id,notice_date').gte('notice_date', LH.keyOf(today.y, today.m, today.d)),
      sb.from('project_milestones').select('project_id,title,due_date').is('completed_at', null).order('due_date', { ascending: true }),
    ]);
    for (var i = 0; i < 4; i++) if (r[i].error) throw r[i].error;

    var stageBy = {};
    (r[1].data || []).forEach(function (s) { stageBy[s.project_id] = s.name; });
    var mileBy = {};
    ((r[6] && r[6].data) || []).forEach(function (m) { if (!mileBy[m.project_id]) mileBy[m.project_id] = m; });
    var projects = (r[0].data || []).map(function (p) {
      var fin = one(p.project_financials) || {}, cl = one(p.clients) || {}, ty = one(p.project_types) || {};
      return {
        id: p.id, code: p.code, name: p.name, status: p.status, health: p.health, st: LH.projectStatus(p),
        pct: p.percent_complete || 0, delay: p.delay_days, note: p.client_status_message,
        forecast: p.forecast_completion_date, completedAt: p.completed_at, createdAt: p.created_at,
        address: [p.site_street, p.site_suburb].filter(Boolean).join(', ') || p.name,
        street: p.site_street || p.name, client: cl.name || '', type: ty.name || '',
        nextMile: mileBy[p.id] ? mileBy[p.id].title : '', nextMileDate: mileBy[p.id] ? mileBy[p.id].due_date : null,
        stage: stageBy[p.id] || '', contract: (fin.contract_value_cents || 0) / 100,
        cost: (fin.forecast_cost_cents || 0) / 100, budget: (fin.original_budget_cents || 0) / 100,
      };
    });
    var byId = {}; projects.forEach(function (p) { byId[p.id] = p; });
    var notified = {};
    ((r[5] && r[5].data) || []).forEach(function (n) { notified[n.project_id + '|' + n.notice_date] = true; });
    return {
      projects: projects, byId: byId, leads: r[2].data || [], bookings: r[3].data || [], notified: notified,
      rainThreshold: (r[4].data && r[4].data.rain_risk_threshold_pct) || 60,
    };
  }

  function metrics(d) {
    var t = LH.today();
    var active = d.projects.filter(function (p) { return p.status === 'active' || p.status === 'on_hold'; });
    var contract = 0, added = 0;
    var qStart = utc(t.y, Math.floor(t.m / 3) * 3, 1).getTime();
    active.forEach(function (p) {
      contract += p.contract;
      if (p.createdAt && new Date(p.createdAt).getTime() >= qStart) added += p.contract;
    });
    var open = d.leads.filter(function (l) { return l.status !== 'won' && l.status !== 'lost'; });
    var weighted = 0;
    open.forEach(function (l) { weighted += ((l.est_value_cents || 0) / 100) * ((l.probability_pct || 0) / 100); });
    var done = d.projects.filter(function (p) { return p.status === 'completed' && p.completedAt && +fmt.dayKey(p.completedAt).slice(0, 4) === t.y; });
    var delivered = 0; done.forEach(function (p) { delivered += p.contract; });
    var won = d.leads.filter(function (l) { return l.status === 'won'; }), wonValue = 0;
    won.forEach(function (l) { wonValue += (l.est_value_cents || 0) / 100; });
    var rate = d.leads.length ? Math.round((won.length / d.leads.length) * 100) : null;
    return { active: active, contract: contract, added: added, rate: rate, won: won.length, wonValue: wonValue, open: open.length, weighted: weighted, done: done.length, delivered: delivered };
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

  /** For each project, the days it has someone on site (site or contractor bookings). */
  function laneDays(d) {
    var by = {};
    d.bookings.forEach(function (b) {
      if (!b.project_id || (b.kind !== 'site' && b.kind !== 'contractor')) return;
      var a = parseKey(fmt.dayKey(b.starts_at)), end = parseKey(fmt.dayKey(new Date(new Date(b.ends_at).getTime() - 1)));
      by[b.project_id] = by[b.project_id] || {};
      for (var n = 0; a <= end && n < 62; n++) { by[b.project_id][keyOfDate(a)] = true; a = addDays(a, 1); }
    });
    return by;
  }

  function greeting() {
    var h = fmt.hour(new Date());
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function render(view) {
    var data = null, wx = null, destroyed = false, M = null, drawn = false;
    var t = LH.today();
    var S = { y: t.y, m: t.m, d: t.d, view: 'Month', filter: 'all' };
    var todayKey = LH.keyOf(t.y, t.m, t.d);

    view.innerHTML = '<div class="lh-skel" style="height:8.125rem;margin-bottom:1.625rem"></div>' +
      '<div class="ov-glance">' + [1, 2, 3, 4].map(function () { return '<div class="lh-skel" style="height:7rem"></div>'; }).join('') + '</div>' +
      '<div class="lh-skel" style="height:26.25rem;margin-top:2.25rem"></div>';

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

    /* ---------- weather pill + rain risk ---------- */
    function rainDays() {
      var out = [];
      if (!wx || !wx.forecast) return out;
      var ev = eventsByDay(data);
      wx.forecast.forEach(function (day) {
        if (day.chanceOfRain == null || day.chanceOfRain < data.rainThreshold) return;
        var seen = {}, projects = [];
        (ev[day.date] || []).forEach(function (e) {
          var p = e.project && data.byId[e.project];
          if (p && !seen[p.id] && (e.k === 'SITE' || e.k === 'TRADE') && p.status !== 'completed') { seen[p.id] = 1; projects.push(p); }
        });
        if (projects.length) out.push({ date: day.date, pct: day.chanceOfRain, projects: projects });
      });
      return out;
    }
    function weekdayOf(key) { return DOWN[parseKey(key).getUTCDay()]; }

    function weatherBlock(rain) {
      if (!wx || !wx.forecast || !wx.forecast.length) return '';
      var d0 = wx.forecast[0];
      var temp = wx.currentTempC != null ? Math.round(wx.currentTempC) : d0.maxTempC;
      var h = '<div class="ov-wx"><span class="cloud" aria-hidden="true"><i></i><i></i></span>' +
        (temp != null ? '<span class="t">' + esc(temp) + '°</span>' : '') + '<span>' + esc(d0.precis) + '</span>';
      if (rain.length) {
        var r0 = rain[0];
        h += '<span class="vr"></span><span class="warn"><i></i>' + esc(weekdayOf(r0.date).slice(0, 3) + ' ' + r0.pct + '% rain may affect ' + r0.projects[0].street) + '</span><a href="#/schedule">Review</a>';
      }
      return h + '</div><div class="ov-credit">Weather by WeatherAPI.com</div>';
    }

    /* ---------- schedule card ---------- */
    function weekStrip(ev, cls) {
      var mon = mondayOf(utc(S.y, S.m, S.d)), selKey = LH.keyOf(S.y, S.m, S.d), h = '<div class="week-grid ' + (cls || '') + '">';
      for (var i = 0; i < 7; i++) {
        var dt = addDays(mon, i), key = keyOfDate(dt), c = (ev[key] || []).length;
        h += '<button type="button" class="' + (key === selKey ? 'sel ' : '') + (key === todayKey ? 'today' : '') + '" data-pick="' + key + '"><span class="w">' + DOW3[i] + '</span><span class="d">' + dt.getUTCDate() + '</span>' +
          '<i style="display:block;height:0.1875rem;border-radius:2px;width:' + (c > 1 ? 9 : 4) + 'px;background:' + (c ? 'currentColor' : 'transparent') + '"></i></button>';
      }
      return h + '</div>';
    }
    function monthGrid(ev) {
      var first = utc(S.y, S.m, 1), lead = (first.getUTCDay() + 6) % 7, days = utc(S.y, S.m + 1, 0).getUTCDate();
      var h = '<div class="cal-grid">' + DOWL.map(function (x, i) { return '<div class="cal-dow' + (i > 4 ? ' we' : '') + '">' + x + '</div>'; }).join('');
      for (var i = 0; i < lead; i++) h += '<div style="height:2.875rem"></div>';
      for (var n = 1; n <= days; n++) {
        var key = LH.keyOf(S.y, S.m, n), c = (ev[key] || []).length;
        var cls = 'cal-cell' + (c ? ' has' : '') + (key === todayKey ? ' today' : '') + (n === S.d ? ' sel' : '');
        h += '<button type="button" class="' + cls + '" data-day="' + n + '" aria-label="' + n + ' ' + MONTHS[S.m] + (c ? ', ' + c + (c === 1 ? ' booking' : ' bookings') : '') + '"><span>' + n + '</span>' +
          '<i style="width:' + (c > 2 ? 14 : c > 1 ? 9 : 4) + 'px;background:' + (c ? (n === S.d ? 'var(--onT)' : 'var(--steel)') : 'transparent') + '"></i></button>';
      }
      h += '</div><div class="cal-legend">' + [['Site', 'var(--i3)'], ['Consult', 'var(--steel)'], ['Contractor', 'var(--ok)'], ['Admin', 'var(--wait)']].map(function (k) { return '<span><i style="background:' + k[1] + '"></i>' + k[0] + '</span>'; }).join('') + '</div>';
      return '<div>' + h + '</div>';
    }
    function lanes() {
      var mon = mondayOf(utc(S.y, S.m, S.d)), by = laneDays(data), rows = M.active.filter(function (p) {
        for (var i = 0; i < 7; i++) if (by[p.id] && by[p.id][keyOfDate(addDays(mon, i))]) return true;
        return false;
      });
      var h = '<div class="lanes"><div class="cap">On site this week</div>';
      if (!rows.length) return h + '<div class="faint" style="margin-top:-0.375rem">Nobody is booked on site this week.</div></div>';
      rows.forEach(function (p) {
        var on = [], i; for (i = 0; i < 7; i++) on.push(!!by[p.id][keyOfDate(addDays(mon, i))]);
        var col = STATUS[p.st].c;
        h += '<div><div class="lane-top"><span class="dot" style="background:' + col + '"></span><span class="n">' + esc(p.street) + '</span><span class="sub">' + esc(p.stage || p.type || '') + '</span></div><div class="lane-bar" style="--c:' + col + '">';
        for (i = 0; i < 7; i++) h += '<i class="' + (on[i] ? 'on ' + (on[i - 1] ? '' : 'f ') + (on[i + 1] ? '' : 'l ') + (p.st === 'halted' ? 'halt' : '') : '') + '"></i>';
        h += '</div></div>';
      });
      return h + '</div>';
    }
    function agenda(ev) {
      var key = LH.keyOf(S.y, S.m, S.d), list = ev[key] || [], dt = utc(S.y, S.m, S.d);
      var label = key === todayKey ? 'Today' : DOWN[dt.getUTCDay()].slice(0, 3) + ' ' + S.d + ' ' + MONTHS[S.m].slice(0, 3);
      var h = '<div class="agenda"><div class="agenda-top"><div class="agenda-label">' + esc(label) + '</div><div class="cap">' + (list.length ? list.length + ' BOOKED' : '') + '</div></div>' +
        '<div class="agenda-sub">Synced to Google Calendar</div>';
      if (!list.length) h += '<div class="agenda-clear">A clear day — nothing on site.</div>';
      h += '<div class="agenda-list">';
      list.forEach(function (e) {
        var kd = KIND[e.k];
        h += '<div class="ev"><div class="t">' + esc(e.t) + '</div><div class="nm"><div class="a">' + esc(e.title) + '</div><div class="kind" style="color:' + kd.color + '">' + kd.label + '</div></div></div>';
      });
      h += '</div>';
      if (S.view !== 'Day') h += '<button type="button" class="open-day" data-view="Day">Open day view<i></i></button>';
      return h + '</div>';
    }
    function dayView(ev) {
      var list = ev[LH.keyOf(S.y, S.m, S.d)] || [], H = 40, startH = 7, endH = 18;
      var h = '<div class="dayview" style="height:' + (endH - startH) * H + 'px">';
      for (var hr = startH; hr < endH; hr++) h += '<div class="hr" style="top:' + (hr - startH) * H + 'px">' + (hr === 12 ? '12 pm' : hr > 12 ? hr - 12 : hr + (hr === startH ? ' am' : '')) + '</div>';
      list.forEach(function (e, ix) {
        var s = new Date(e.start), en = new Date(e.end);
        var st = Math.max(startH, fmt.hour(s) + +fmt.time(s).slice(3) / 60), du = Math.max(0.5, Math.min(8, (en - s) / 3600000));
        if (st >= endH) return;
        h += '<div class="de" style="--c:' + KIND[e.k].color + ';top:' + ((st - startH) * H + 1) + 'px;height:' + Math.max(36, du * H - 4) + 'px"><div class="a" style="font:400 max(11.96px, 0.8125rem)/1.3 Geist,sans-serif">' + esc(e.title) + '</div>' +
          '<div class="kind" style="color:' + KIND[e.k].color + '">' + esc(e.t) + ' · ' + KIND[e.k].label + '</div></div>';
      });
      if (LH.keyOf(S.y, S.m, S.d) === todayKey) {
        var now = new Date(), nh = fmt.hour(now) + +fmt.time(now).slice(3) / 60;
        if (nh >= startH && nh < endH) h += '<div class="now" style="top:' + (nh - startH) * H + 'px"></div>';
      }
      return h + '</div>';
    }
    function scheduleCard() {
      var ev = eventsByDay(data), sel = utc(S.y, S.m, S.d), title, sub;
      var wcount = 0, mon = mondayOf(sel), sun = addDays(mon, 6);
      for (var i = 0; i < 7; i++) wcount += (ev[keyOfDate(addDays(mon, i))] || []).length;
      var dayCount = (ev[LH.keyOf(S.y, S.m, S.d)] || []).length;
      if (S.view === 'Month') { title = MONTHS[S.m] + ' ' + S.y; sub = 'Select a day to see bookings'; }
      else if (S.view === 'Week') {
        title = mon.getUTCMonth() === sun.getUTCMonth() ? mon.getUTCDate() + ' – ' + sun.getUTCDate() + ' ' + MONTHS[sun.getUTCMonth()]
          : mon.getUTCDate() + ' ' + MONTHS[mon.getUTCMonth()].slice(0, 3) + ' – ' + sun.getUTCDate() + ' ' + MONTHS[sun.getUTCMonth()].slice(0, 3);
        sub = wcount + (wcount === 1 ? ' booking' : ' bookings') + ' this week · select a day';
      } else { title = DOWN[sel.getUTCDay()] + ' ' + S.d + ' ' + MONTHS[S.m]; sub = dayCount ? dayCount + ' booked' : 'Nothing booked'; }

      var body;
      if (S.view === 'Month') body = '<div class="cal-body">' + monthGrid(ev) + agenda(ev) + '</div>';
      else if (S.view === 'Week') body = '<div class="cal-body"><div>' + weekStrip(ev) + lanes() + '</div>' + agenda(ev) + '</div>';
      else body = '<div style="margin-top:1.25rem">' + weekStrip(ev, 'day') + dayView(ev) + '</div>';

      return '<section class="cal-card" id="ovCal"><div class="cal-head"><div class="ttl"><div class="cap">Schedule</div><div class="cal-title">' + esc(title) + '</div><div class="cal-sub">' + esc(sub) + '</div></div>' +
        '<div class="lh-seg" role="tablist">' + ['Month', 'Week', 'Day'].map(function (v) { return '<button type="button" data-view="' + v + '" class="' + (S.view === v ? 'on' : '') + '">' + v + '</button>'; }).join('') + '</div>' +
        '<div class="cal-ctl"><button type="button" class="lh-circle prev" data-step="-1" aria-label="Previous"><i></i></button><button type="button" class="today" data-today>Today</button><button type="button" class="lh-circle next" data-step="1" aria-label="Next"><i></i></button></div></div>' + body + '</section>';
    }

    /* ---------- needs attention ---------- */
    function attentionCard(rain) {
      var items = [];
      M.active.forEach(function (p) {
        if (p.st === 'ontime') return;
        items.push({
          halt: p.st === 'halted', tag: p.street,
          title: p.note || (p.st === 'halted' ? 'Work is paused' : 'Behind schedule' + (p.delay ? ' · +' + p.delay + (p.delay === 1 ? ' day' : ' days') : '')),
          sub: [p.stage, p.client].filter(Boolean).join(' · '),
          href: p.st === 'halted' ? '#/inbox' : '#/projects/' + p.id, act: p.st === 'halted' ? 'Message client' : 'Open project',
        });
      });
      items.sort(function (a, b) { return (b.halt ? 1 : 0) - (a.halt ? 1 : 0); });
      rain.slice(0, 3).forEach(function (r) {
        var p = r.projects[0], more = r.projects.length - 1;
        var told = r.projects.every(function (q) { return data.notified[q.id + '|' + r.date]; });
        items.push({ halt: false, tag: p.street + (more > 0 ? ' +' + more + ' more' : ''), title: weekdayOf(r.date) + ' rain · ' + r.pct + '%', sub: (p.stage || 'Work') + ' may pause · client' + (more > 0 ? 's ' : ' ') + (told ? 'notified' : 'not yet notified'), href: '#/projects/' + p.id, act: 'Open project' });
      });
      var h = '<section class="lh-card lift" style="animation-delay:240ms"><div class="lh-card-head"><h2 class="lh-card-title">Needs attention</h2><a class="lh-link" href="#/projects">View all</a></div>';
      if (!items.length) h += '<div class="lh-empty">Nothing needs attention. Every active project is on time.</div>';
      items.slice(0, 8).forEach(function (i) {
        h += '<div class="att' + (i.halt ? ' halt' : '') + '"><div class="bar"></div><div style="min-width:0"><div class="tg">' + esc(i.tag) + '</div><div class="tt">' + esc(i.title) + '</div>' +
          (i.sub ? '<div class="sb">' + esc(i.sub) + '</div>' : '') + '</div><a class="lh-btn" href="' + i.href + '">' + i.act + '</a></div>';
      });
      return h + '</section>';
    }

    /* ---------- projects table ---------- */
    function projectsCard() {
      var rows = M.active.filter(function (p) { return S.filter === 'all' || (S.filter === 'ontime' ? p.st === 'ontime' : p.st !== 'ontime'); });
      var h = '<section class="lh-card lift" style="animation-delay:360ms"><div class="lh-card-head"><h2 class="lh-card-title">Active projects</h2>' +
        '<div style="display:flex;gap:0.375rem">' + [['all', 'All'], ['ontime', 'On track'], ['risk', 'At risk']].map(function (f) { return '<button type="button" class="lh-chip' + (S.filter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div></div>';
      if (!rows.length) return h + '<div class="lh-empty">No projects here yet.</div></section>';
      h += '<div class="pj-scroll"><div class="pj-inner"><div class="pj-head"><div>Project</div><div>Stage</div><div>Progress</div><div>Contract</div><div>Next milestone</div><div>Completion</div><div>Status</div></div>';
      rows.forEach(function (p) {
        var st = STATUS[p.st];
        var label = st.label; if (p.st === 'delayed' && p.delay) label = p.delay + (p.delay === 1 ? ' day behind' : ' days behind');
        h += '<div class="pj-row" data-open="' + esc(p.id) + '"><div><div class="n">' + esc(p.street) + '</div><div class="s">' + esc([p.type, p.client].filter(Boolean).join(' · ')) + '</div></div>' +
          '<div>' + esc(p.stage || '—') + '</div><div><div class="prog"><div class="bar"><i style="width:' + Math.min(100, p.pct) + '%"></i></div><span>' + p.pct + '%</span></div></div>' +
          '<div>' + (p.contract ? fmt.money(p.contract) : '—') + '</div><div class="mile">' + (p.nextMile ? esc(p.nextMile) + '<div class="faint tiny">' + esc(fmt.date(p.nextMileDate)) + '</div>' : '—') + '</div><div>' + fmt.date(p.forecast) + '</div>' +
          '<div><span class="lh-pill ' + st.cls + '"><i></i>' + esc(label) + '</span></div></div>';
      });
      return h + '</div></div></section>';
    }

    /* ---------- page ---------- */
    function stat(label, value, unit, sub, tone, delay, wash) {
      return '<div class="lh-card lift stat wash" style="animation-delay:' + delay + 'ms;--wash:var(--' + wash + ')"><div class="cap">' + esc(label) + '</div><div class="v">' + esc(value) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</div><div class="s ' + tone + '">' + esc(sub) + '</div></div>';
    }
    function sect(label) { return '<div class="lh-sect"><span class="cap">' + label + '</span><span class="rule"></span></div>'; }

    function draw() {
      M = metrics(data);
      var rain = rainDays(), first = (LH.state.name || '').split(' ')[0] || 'there';
      var c = fmt.moneyParts(M.contract), w = fmt.moneyParts(M.weighted), dl = fmt.moneyParts(M.delivered);
      var added = M.added > 0 ? '+' + fmt.money(M.added) + ' this quarter' : M.active.length + ' active ' + (M.active.length === 1 ? 'project' : 'projects');
      var rate = M.rate == null ? '—' : String(M.rate);
      var rateSub = M.rate == null ? 'No leads yet' : M.won + ' won · ' + fmt.money(M.wonValue);
      var y = window.scrollY;
      view.classList.toggle('enter', !drawn); drawn = true;

      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap">' + esc(fmt.long(new Date())) + '</div><h1 class="ov-hello">' + greeting() + ', <em>' + esc(first) + '</em></h1>' + weatherBlock(rain) + '</div>' +
        '<div class="ov-actions no-print"><button class="lh-btn" type="button" id="ovSheet">Export day sheet</button><a class="lh-btn primary" href="#/projects/new">+ New project</a></div></div>' +
        sect('At a glance') +
        '<div class="ov-glance">' +
        stat('Active contract value', c.num, c.unit, added, 'ok', 0, 'steel') +
        stat('Lead conversion', rate, M.rate == null ? '' : '%', rateSub, M.rate == null ? '' : 'ok', 60, 'ok') +
        stat('Pipeline (weighted)', w.num, w.unit, M.open + ' open ' + (M.open === 1 ? 'lead' : 'leads'), 'ok', 120, 'wait') +
        stat('Delivered value · ' + t.y, dl.num, dl.unit, M.done + (M.done === 1 ? ' project completed' : ' projects completed'), 'steel', 180, 'steel') + '</div>' +
        sect('Schedule &amp; attention') +
        '<div class="ov-grid">' + scheduleCard() + attentionCard(rain) + '</div>' +
        sect('Active projects') + projectsCard();
      window.scrollTo(0, y);
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
      watch: ['projects', 'project_stages', 'project_financials', 'leads', 'bookings', 'weather_notices', 'business_settings', 'clients'],
      refresh: refresh, destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); } };
  }

  LH.screens.overview = { title: 'Overview', render: render };
})();
