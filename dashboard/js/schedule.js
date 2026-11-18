/* Schedule — a project's stages as a Gantt: planned against actual, who is booked on each,
   and what needs doing next. Built from the same stages and contractor bookings the app uses. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;
  var DAY = 86400000;

  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function numOfKey(k) { return Math.round(Date.parse(k.slice(0, 10) + 'T00:00:00Z') / DAY); }
  function keyOfNum(n) { var d = new Date(n * DAY); return LH.keyOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
  function numOfInstant(iso) { return numOfKey(fmt.dayKey(iso)); }
  function todayNum() { var t = LH.today(); return Math.round(Date.UTC(t.y, t.m, t.d) / DAY); }
  function shortDate(n) { return fmt.date(keyOfNum(n)).toUpperCase(); }

  /** Plans every stage in order from the project's start date, and lines up what really happened. */
  function plan(project, stages, crews) {
    var start = numOfKey(project.start_date), today = todayNum(), cum = 0, chain = start, rows = [];
    stages.slice().sort(function (a, b) { return a.position - b.position; }).forEach(function (s) {
      var crew = crews[s.name] || '';
      if (s.status === 'skipped') { rows.push({ id: s.id, name: s.name, status: 'skipped', crew: crew, slip: 0 }); return; }
      var dur = Math.max(1, s.duration_days || 5), pS = start + cum, pE = pS + dur - 1, aS = null, aE = null, slip = 0;
      cum += dur;
      if ((s.status === 'complete' || s.status === 'current') && s.started_at) aS = numOfInstant(s.started_at);
      if (s.status === 'complete') { if (aS == null) aS = pS; aE = s.completed_at ? Math.max(numOfInstant(s.completed_at), aS) : pE; slip = aE - pE; }
      else if (s.status === 'current') { if (aS == null) aS = pS; aE = Math.max(today, aS); slip = Math.max(0, today - pE); }
      var bS = chain;
      if ((s.status === 'complete' || s.status === 'current') && aS != null) bS = aS;
      var bE = bS + dur - 1;
      if (s.status === 'complete') bE = Math.max(aE, bS);
      if (s.status === 'current') bE = Math.max(bE, today);
      chain = bE + 1;
      var frac = s.status === 'complete' ? 1 : s.status === 'current' ? Math.max(0, Math.min(1, (today - bS + 1) / (bE - bS + 1))) : 0;
      rows.push({ id: s.id, name: s.name, status: s.status, dur: dur, pS: pS, pE: pE, aS: aS, aE: aE, bS: bS, bE: bE, frac: frac, slip: slip, crew: crew });
    });
    return { start: start, today: today, rows: rows };
  }

  function stats(pl, project) {
    var live = pl.rows.filter(function (r) { return r.status !== 'skipped'; });
    var onTime = live.filter(function (r) { return r.slip <= 0; }).length;
    var cur = live.filter(function (r) { return r.status === 'current'; })[0];
    var done = live.filter(function (r) { return r.status === 'complete'; });
    var last = done[done.length - 1];
    var slip = cur && cur.slip > 0 ? cur.slip : (last ? last.slip : 0);
    var slipRow = cur && cur.slip > 0 ? cur : (last && last.slip !== 0 ? last : null);
    var st = LH.projectStatus(project), crit = null;
    if (st !== 'ontime' && cur) crit = { name: cur.name, sub: project.client_status_message || (st === 'halted' ? 'Work is paused' : 'Running behind') };
    else if (cur && cur.slip > 0) crit = { name: cur.name, sub: cur.slip + (cur.slip === 1 ? ' day over plan' : ' days over plan') };
    var open = live.filter(function (r) { return r.status !== 'complete'; });
    var unassigned = open.filter(function (r) { return !r.crew; })[0], upcoming = live.filter(function (r) { return r.status === 'upcoming'; })[0], next;
    if (unassigned) next = { title: 'Assign contractor', sub: 'for ' + unassigned.name };
    else if (upcoming) next = { title: 'Start ' + upcoming.name, sub: 'planned ' + fmt.date(keyOfNum(upcoming.pS)) };
    else next = { title: live.length ? 'All stages done' : '—', sub: '' };
    return { onTime: onTime, total: live.length, slip: slip, slipRow: slipRow, crit: crit, next: next };
  }

  function render(view, args) {
    var D = null, destroyed = false, drawn = false, selected = args && args[0] ? args[0] : null;
    view.innerHTML = UI.skeleton([[110], [120, 24], [420, 24]]);

    async function refresh() {
      try {
        var sb = LH.sb;
        var pr = await sb.from('projects').select('id,name,code,status,health,start_date,delay_days,client_status_message,site_street,site_suburb,project_manager_name').is('deleted_at', null).in('status', ['active', 'on_hold']).order('created_at', { ascending: false });
        if (pr.error) throw pr.error;
        var projects = pr.data || [];
        if (!projects.length) { D = { projects: [], project: null }; draw(); return; }
        if (!selected || !projects.some(function (p) { return p.id === selected; })) selected = projects[0].id;
        var project = projects.filter(function (p) { return p.id === selected; })[0];
        var r = await Promise.all([
          sb.from('project_stages').select('id,position,name,status,started_at,completed_at,duration_days').eq('project_id', selected).order('position', { ascending: true }),
          sb.from('bookings').select('id,title,starts_at,ends_at,booking_internal(contractor_id)').eq('project_id', selected).eq('kind', 'contractor').neq('status', 'cancelled'),
          sb.from('contractors').select('id,name').eq('is_active', true).order('name'),
        ]);
        for (var i = 0; i < 3; i++) if (r[i].error) throw r[i].error;
        var names = {}; (r[2].data || []).forEach(function (c) { names[c.id] = c.name; });
        var crews = {};
        (r[1].data || []).forEach(function (b) {
          var title = String(b.title || ''), cut = title.lastIndexOf(' — '), stage = cut > 0 ? title.slice(0, cut) : '', bi = one(b.booking_internal), who = (bi && names[bi.contractor_id]) || (cut > 0 ? title.slice(cut + 3) : '');
          if (!stage || !who) return;
          crews[stage] = crews[stage] && crews[stage].indexOf(who) === -1 ? crews[stage] + ', ' + who : (crews[stage] || who);
        });
        D = { projects: projects, project: project, stages: r[0].data || [], contractors: r[2].data || [], crews: crews };
        D.plan = project.start_date ? plan(project, D.stages, crews) : null;
        LH.touchSynced();
        if (!destroyed) draw();
      } catch (e) { console.error(e); if (!D && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load the schedule. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    refresh();

    function gantt(pl) {
      var rows = pl.rows.filter(function (r) { return r.status !== 'skipped'; });
      var maxDay = pl.today;
      rows.forEach(function (r) { maxDay = Math.max(maxDay, r.bE); });
      var weeks = Math.min(40, Math.max(8, Math.ceil((maxDay - pl.start + 1) / 7) + 1)), total = weeks * 7;
      var pct = function (n) { return ((n - pl.start) / total) * 100; };
      var heads = ''; for (var i = 0; i < weeks; i++) heads += '<span>' + shortDate(pl.start + i * 7) + '</span>';
      return { weeks: weeks, total: total, pct: pct, heads: heads };
    }

    function draw() {
      var y = window.scrollY; view.classList.toggle('enter', !drawn); drawn = true;
      if (!D.projects.length) { view.innerHTML = '<div class="lh-card soon"><div class="cap" style="margin-bottom:14px">Schedule</div><h2>No active projects</h2><p class="muted">Create a project and its stages will appear here.</p><a class="lh-btn primary" href="#/projects/new">+ New project</a></div>'; return; }
      var p = D.project, pl = D.plan;
      var head = '<div class="ov-hero"><div><div class="cap">Schedule · ' + esc(p.site_street || p.name) + '</div><h1 class="ov-hello">Schedule</h1><div class="hero-sub">Actual progress by stage · Contractor bookings push to Google Calendar</div></div>' +
        '<div class="ov-actions no-print"><label class="proj-pick"><span class="cap">Project</span><select id="schProject" class="pick-sel">' + D.projects.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.site_street || x.name) + '</option>'; }).join('') + '</select></label>' +
        '<button class="lh-btn" type="button" data-act="csv">Export</button><button class="lh-btn primary" type="button" data-act="assign">+ Assign contractor</button></div></div>';
      if (!pl) { view.innerHTML = head + '<div class="lh-card lh-empty">This project has no start date yet. Set one with Edit project.</div>'; return; }
      var st = stats(pl, p), g = gantt(pl);
      var slipTxt = st.slip > 0 ? '+' + st.slip + (st.slip === 1 ? ' day' : ' days') : st.slip < 0 ? '−' + (-st.slip) + (st.slip === -1 ? ' day' : ' days') : 'On plan';
      var rowsHtml = pl.rows.filter(function (r) { return r.status !== 'skipped'; }).map(function (r, i) {
        var col = r.slip > 0 ? 'var(--wait)' : (r.status === 'current' && LH.projectStatus(p) === 'halted' ? 'var(--halt)' : r.status === 'current' && LH.projectStatus(p) === 'delayed' ? 'var(--wait)' : 'var(--ok)');
        var bars = '<div class="gt-track" style="--w:' + (100 / g.weeks) + '%"><i class="gt-bar ' + (r.status === 'upcoming' ? 'up' : 'on') + '" style="left:' + g.pct(r.bS) + '%;width:' + Math.max(1.2, (r.bE - r.bS + 1) / g.total * 100) + '%;--c:' + col + ';--done:' + Math.round(r.frac * 100) + '%"></i><i class="gt-today" style="left:' + g.pct(pl.today) + '%"></i></div>';
        var pill = r.status === 'complete' ? UI.pill('ok', 'Done') : r.status === 'current' ? UI.pill(r.slip > 0 ? 'wait' : 'ok', 'In progress') : (r.crew ? UI.pill('', 'Booked') : UI.pill('', 'Planned'));
        var sub = r.slip > 0 ? '<div class="gt-over">+' + r.slip + (r.slip === 1 ? ' day' : ' days') + ' over</div>' : (r.status === 'complete' && r.slip < 0 ? '<div class="gt-ahead">' + (-r.slip) + ' ' + (r.slip === -1 ? 'day' : 'days') + ' early</div>' : '');
        var action = r.status === 'current' ? '<button type="button" class="lh-btn sm" data-complete="' + r.id + '">Complete stage</button>' : (r.status === 'upcoming' && !r.crew ? '<button type="button" class="lh-btn sm" data-assign="' + esc(r.name) + '">Assign contractor</button>' : '<span class="faint">—</span>');
        return '<div class="gt-row gt-grid" style="--i:' + i + '"><div><div class="n">' + esc(r.name) + '</div><div class="s">' + esc(p.project_manager_name || '') + '</div></div><div>' + (r.crew ? esc(r.crew) : '<span class="faint">Not assigned</span>') + '</div><div>' + bars + '</div><div>' + pill + sub + '</div><div>' + action + '</div></div>';
      }).join('');
      view.innerHTML = head + UI.sect('At a glance') + '<div class="ov-glance">' +
        UI.stat('Tasks on time', st.onTime + ' of ' + st.total, '', '', '', 0, 'ok') +
        UI.stat('Days ahead / behind', slipTxt, '', st.slipRow ? esc(st.slipRow.name + (st.slipRow.slip > 0 ? ' ran over' : ' finished early')) : 'Right on plan', st.slip > 0 ? 'wait' : 'ok', 60, st.slip > 0 ? 'wait' : 'steel') +
        UI.stat('Critical path risk', st.crit ? esc(st.crit.name) : 'None', '', st.crit ? esc(st.crit.sub) : 'Nothing is slipping', st.crit ? 'halt' : 'ok', 120, st.crit ? 'halt' : 'ok') +
        UI.stat('Next action', esc(st.next.title), '', esc(st.next.sub), '', 180, 'steel') + '</div>' +
        UI.sect('Tasks') + '<section class="lh-card"><div class="tbl-scroll"><div class="tbl-inner" style="min-width:980px"><div class="gt-head gt-grid"><div>Task · responsible</div><div>Contractor</div><div class="gt-weeks" style="--n:' + g.weeks + '">' + g.heads + '</div><div>Status</div><div>Next action</div></div>' + rowsHtml + '</div></div>' +
        '<div class="gt-legend"><span><i class="lg-done"></i>Complete</span><span><i class="lg-prog"></i>In progress</span><span><i class="lg-up"></i>Up next</span><span><i class="lg-over"></i>Ran over</span><span><i class="lg-today"></i>Today</span></div></section>';
      window.scrollTo(0, y);
    }

    function assignForm(stageName) {
      var open = D.stages.filter(function (s) { return s.status !== 'complete' && s.status !== 'skipped'; });
      if (!open.length) { UI.toast('Every stage is finished.', 'error'); return; }
      if (!D.contractors.length) { UI.toast('Add a contractor first.', 'error'); LH.go('contractors'); return; }
      var pr = D.plan && D.plan.rows.filter(function (r) { return r.name === (stageName || open[0].name); })[0];
      UI.form({
        title: 'Assign a contractor', intro: 'They are booked for those days and it lands on the Google Calendar.', submitLabel: 'Assign',
        values: { stage: stageName || open[0].name, start: pr && pr.pS ? keyOfNum(pr.pS) : '', end: pr && pr.pE ? keyOfNum(pr.pE) : '' },
        fields: [{ name: 'stage', label: 'Stage', type: 'select', options: open.map(function (s) { return { v: s.name, l: s.name }; }), required: true },
          { name: 'contractor', label: 'Contractor', type: 'select', options: D.contractors.map(function (c) { return { v: c.id, l: c.name }; }), required: true },
          { name: 'start', label: 'First day', type: 'date', required: true }, { name: 'end', label: 'Last day', type: 'date', required: true },
          { name: 'notes', label: 'Notes (optional)', type: 'textarea', rows: 3, span: 2 }],
        onSubmit: async function (v) {
          var r = await LH.sb.rpc('assign_contractor', { p_project_id: selected, p_contractor_id: v.contractor, p_stage_name: v.stage, p_start: v.start, p_end: v.end, p_notes: UI.nullIfBlank(v.notes) });
          if (r.error) throw r.error;
        },
      }).then(function (ok) { if (ok) { UI.toast('Contractor assigned.'); refresh(); } });
    }

    async function onClick(e) {
      var el = e.target.closest('[data-act],[data-assign],[data-complete]'); if (!el || !D || !D.project) return;
      if (el.hasAttribute('data-complete')) {
        if (!(await UI.confirm('Mark this stage complete and move to the next one?', { title: 'Complete stage', yes: 'Complete stage' }))) return;
        var r = await LH.sb.rpc('advance_project_stage', { p_project_id: selected });
        if (r.error) { UI.toast(LH.errMsg(r.error), 'error'); return; }
        UI.toast('Stage completed.'); refresh(); return;
      }
      if (el.hasAttribute('data-assign')) { assignForm(el.getAttribute('data-assign')); return; }
      if (el.getAttribute('data-act') === 'assign') assignForm();
      else if (el.getAttribute('data-act') === 'csv' && D.plan) {
        UI.csv('schedule-' + (D.project.site_street || 'project').replace(/\s+/g, '-').toLowerCase(), [['Stage', 'Status', 'Contractor', 'Planned start', 'Planned finish', 'Actual start', 'Actual finish', 'Days over plan']].concat(
          D.plan.rows.map(function (r) { return [r.name, r.status, r.crew, r.pS != null ? keyOfNum(r.pS) : '', r.pE != null ? keyOfNum(r.pE) : '', r.aS != null ? keyOfNum(r.aS) : '', r.aE != null && r.status === 'complete' ? keyOfNum(r.aE) : '', r.slip || 0]; })));
      }
    }
    function onChange(e) { if (e.target.id === 'schProject') { selected = e.target.value; history.replaceState(null, '', '#/schedule/' + selected); refresh(); } }
    view.addEventListener('click', onClick); view.addEventListener('change', onChange);
    return { watch: ['projects', 'project_stages', 'bookings', 'booking_internal', 'contractors'], refresh: refresh, destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); view.removeEventListener('change', onChange); } };
  }

  LH.screens.schedule = { title: 'Schedule', render: render };
  LH.schedulePlan = { plan: plan, stats: stats, keyOfNum: keyOfNum };
})();
