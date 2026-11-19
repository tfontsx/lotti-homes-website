/* Lotti Homes dashboard — core: database client, sign-in, theme, router, shell, search.
   Plain scripts, no build step. Screens register themselves on LH.screens. */
(function () {
  'use strict';

  var cfg = window.SUPABASE_CONFIG || {};
  var LH = (window.LH = { screens: {}, state: { user: null, name: '', email: '' }, cfg: cfg });
  var TZ = 'Australia/Adelaide';
  LH.tz = TZ;

  LH.ready = !!(cfg.url && cfg.anonKey && window.supabase);
  LH.sb = LH.ready
    ? window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      })
    : null;

  /* ---------- helpers ---------- */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  LH.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  };
  LH.$ = function (sel, root) { return (root || document).querySelector(sel); };
  LH.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function dtf(opts) { var o = { timeZone: TZ }; for (var k in opts) o[k] = opts[k]; return new Intl.DateTimeFormat('en-AU', o); }
  var f = {
    key: new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }),
    time: dtf({ hour: '2-digit', minute: '2-digit', hour12: false }),
    hour: dtf({ hour: 'numeric', hour12: false }),
    dMon: dtf({ day: 'numeric', month: 'short' }),
    dMonY: dtf({ day: 'numeric', month: 'short', year: 'numeric' }),
    wdDM: dtf({ weekday: 'short', day: 'numeric', month: 'short' }),
    long: dtf({ weekday: 'long', day: 'numeric', month: 'long' }),
    stamp: dtf({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
  };
  var UTC = { dMon: new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short' }),
              dMonY: new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) };

  /* A usable Date, or null for blank and invalid values, so one bad timestamp can't take a whole screen down. */
  function asDate(d) { if (d == null || d === '') return null; var x = d instanceof Date ? d : new Date(d); return isNaN(x) ? null : x; }
  /** The app's money style as {num:'$1.86', unit:'M'}; rounds before choosing the unit so $999,999 reads $1M, and negatives read -$1.5k. */
  function moneyParts(n) {
    n = Number(n); if (!isFinite(n)) n = 0;
    var sign = n < 0 ? '-' : '', a = Math.abs(n);
    if (a >= 999500) { var m = Math.round(a / 10000) / 100; return { num: sign + '$' + (Number.isInteger(m) ? m.toFixed(0) : m.toFixed(2)), unit: 'M' }; }
    if (a >= 999.5) { var k = Math.round(a / 100) / 10; return { num: sign + '$' + (Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)), unit: 'k' }; }
    return { num: (Math.round(a) ? sign : '') + '$' + Math.round(a), unit: '' };
  }

  LH.fmt = {
    /** "2026-11-18" for an instant, in Adelaide time. */
    dayKey: function (d) { var x = asDate(d); return x ? f.key.format(x) : ''; },
    time: function (d) { var x = asDate(d); return x ? f.time.format(x).replace('24:', '00:') : ''; },
    hour: function (d) { var x = asDate(d); return x ? parseInt(f.hour.format(x), 10) % 24 : 0; },
    dateTime: function (d) { var x = asDate(d); return x ? f.stamp.format(x) : '—'; },
    wdDM: function (d) { var x = asDate(d); return x ? f.wdDM.format(x) : '—'; },
    long: function (d) { var x = asDate(d); return x ? f.long.format(x).toUpperCase() : ''; },
    /** A plain date column ("2026-12-12") as "12 Dec". */
    date: function (s) { if (!s) return '—'; var d = new Date(s + 'T00:00:00Z'); return isNaN(d) ? '—' : UTC.dMon.format(d); },
    dateY: function (s) { if (!s) return '—'; var d = new Date(s + 'T00:00:00Z'); return isNaN(d) ? '—' : UTC.dMonY.format(d); },
    /** Same style as the app: $1.86M / $940k / $68k. */
    money: function (n) { var p = moneyParts(n); return p.num + p.unit; },
    /** Same as money(), split so the unit can be set small: {num:'$1.86', unit:'M'}. */
    moneyParts: moneyParts,
    /** How the app shows a stored number: +61412555231 -> 0412 555 231. Anything unrecognised is shown as it is. */
    phone: function (stored) {
      if (!stored) return '';
      var n = String(stored); if (n.indexOf('+61') === 0) n = '0' + n.slice(3);
      if (!/^0\d{9}$/.test(n)) return String(stored);
      return n.indexOf('04') === 0 ? n.slice(0, 4) + ' ' + n.slice(4, 7) + ' ' + n.slice(7) : n.slice(0, 2) + ' ' + n.slice(2, 6) + ' ' + n.slice(6);
    },
    /** Whole dollars, or with cents when `cents` is true and the amount has any ($1,500.50). */
    moneyFull: function (n, cents) {
      n = Number(n); if (!isFinite(n)) n = 0;
      var c = Math.round(Math.abs(n) * 100), neg = n < 0 && c > 0, showCents = cents && c % 100 !== 0;
      var d = showCents ? Math.floor(c / 100) : Math.round(c / 100);
      return (neg ? '-' : '') + '$' + d.toLocaleString('en-AU') + (showCents ? '.' + String(c % 100).padStart(2, '0') : '');
    },
  };
  /** Today in Adelaide as {y, m(0-11), d}. */
  LH.today = function () { var p = LH.fmt.dayKey(new Date()).split('-'); return { y: +p[0], m: +p[1] - 1, d: +p[2] }; };
  LH.keyOf = function (y, m, d) { return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };

  LH.initials = function (name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '··';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };

  /** App status: on-hold or "waiting" = halted, "at risk" = delayed, else on time. */
  LH.projectStatus = function (p) {
    if (p.status === 'on_hold' || p.health === 'waiting') return 'halted';
    if (p.health === 'at_risk') return 'delayed';
    return 'ontime';
  };

  LH.icons = {
    overview: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    leads: '<path d="M3.5 5h17l-6.5 7.5V19l-4 1.5v-8z"/>',
    projects: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    schedule: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 14h3M13.5 14h3M7.5 17.5h3"/>',
    contractors: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3.8 17.2a1.6 1.6 0 0 0 2.3 2.3l5.4-5.4a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.2-.4-.4-2.2z"/>',
    inbox: '<path d="M4 5.5h16v10H9.5L5 19.5v-4H4z"/>',
    compliance: '<path d="M12 3.5 5 6v5.5c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6z"/><path d="m8.8 12.2 2.4 2.4 4-4.4"/>',
    reports: '<path d="M6.5 3.5h8l3.5 3.5v13.5h-11.5z"/><path d="M14.5 3.5V7H18M9.5 12h5M9.5 15.5h5"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    cloud: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 9.5 4.3 4.3 0 0 1 17 18z"/>',
  };
  LH.icon = function (name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (LH.icons[name] || '') + '</svg>';
  };

  LH.NAV = [
    { id: 'overview', label: 'Overview' },
    { id: 'leads', label: 'Leads' },
    { id: 'projects', label: 'Projects' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'contractors', label: 'Contractors' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'compliance', label: 'Compliance' },
    { id: 'reports', label: 'Reports' },
    { id: 'settings', label: 'Settings' },
  ];

  /* ---------- labels: wrap bare text in pills/buttons so it can be trimmed to cap height ---------- */
  var TIDY = '.lh-btn,.lh-chip,.lh-pill,.lh-seg button,.lh-avatar,.cal-ctl .today,.ov-wx .warn';
  function tidy() {
    // Anything truncated with an ellipsis shows its full text on hover.
    LH.$$('.li .nb, .li .t, .doc .n, .in-t .r3 > span, .in-t .r2').forEach(function (el) { if (!el.title && el.textContent.trim()) el.title = el.textContent.trim(); });
    LH.$$(TIDY).forEach(function (el) {
      Array.prototype.slice.call(el.childNodes).forEach(function (n) {
        if (n.nodeType === 3 && n.nodeValue.trim()) {
          var sp = document.createElement('span'); sp.className = 'tx';
          el.replaceChild(sp, n); sp.appendChild(n);
        }
      });
    });
  }

  /* ---------- theme ---------- */
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('lh-theme', t); } catch (e) { /* private window: fine */ }
    drawThemeBtn();
  }
  function drawThemeBtn() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var b = LH.$('#themeBtn');
    if (b) b.innerHTML = LH.icon(dark ? 'sun' : 'moon');
    if (b) b.title = dark ? 'Switch to light' : 'Switch to dark';
  }

  /** 'light', 'dark' or 'system' (follow the device). */
  LH.themeMode = function () { var t = null; try { t = localStorage.getItem('lh-theme'); } catch (e) { /* ok */ } return t === 'light' || t === 'dark' ? t : 'system'; };
  LH.setTheme = function (mode) {
    if (mode === 'system') {
      try { localStorage.removeItem('lh-theme'); } catch (e) { /* ok */ }
      var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); drawThemeBtn();
    } else setTheme(mode);
  };

  /* ---------- sync indicator & polling ---------- */
  var lastSync = 0;
  LH.touchSynced = function () { lastSync = Date.now(); drawSync(); };
  function drawSync() {
    var t = LH.$('#syncText'); var dot = LH.$('#syncDot');
    if (!t) return;
    if (!navigator.onLine) { t.textContent = 'Offline'; dot.classList.add('off'); return; }
    dot.classList.remove('off');
    if (live.on) { t.textContent = 'Synced with app · live'; return; }
    if (!lastSync) { t.textContent = 'Synced with app'; return; }
    var s = Math.round((Date.now() - lastSync) / 1000);
    t.textContent = 'Synced with app · ' + (s < 10 ? 'just now' : s < 60 ? s + 's ago' : Math.round(s / 60) + ' min ago');
  }

  /* ---------- weather (same function the app uses) ---------- */
  var wx = { at: 0, data: null, pending: null };
  LH.weather = function () {
    if (wx.data && Date.now() - wx.at < 15 * 60 * 1000) return Promise.resolve(wx.data);
    if (wx.pending) return wx.pending;
    wx.pending = fetch(cfg.url + '/functions/v1/weather')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.forecast) { wx.data = j; wx.at = Date.now(); } return wx.data; })
      .catch(function () { return wx.data; })
      .then(function (d) { wx.pending = null; return d; });
    return wx.pending;
  };
  function fmt2(d) { return LH.fmt.wdDM(d).replace(/^(\w+),? /, '$1 '); }
  function drawTopWeather() {
    LH.weather().then(function (w) {
      var el = LH.$('#topWx'), vr = LH.$('#topVr'); if (!el) return;
      if (!w) { el.hidden = true; vr.hidden = true; return; }
      var t = w.currentTempC != null ? Math.round(w.currentTempC) + '° ' : '';
      var p = w.forecast && w.forecast[0] ? w.forecast[0].precis : '';
      el.hidden = false; vr.hidden = false;
      el.textContent = fmt2(new Date()) + ' · ' + t + (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '');
    });
  }

  /* ---------- auth ---------- */
  async function loadIdentity(user) {
    var roles = await LH.sb.from('user_roles').select('role').eq('user_id', user.id);
    if (roles.error) throw roles.error;
    var isOwner = (roles.data || []).some(function (r) { return r.role === 'owner'; });
    if (!isOwner) return false;
    var prof = await LH.sb.from('admin_profiles').select('display_name').eq('user_id', user.id).maybeSingle();
    LH.state.user = user;
    LH.state.email = user.email || '';
    LH.state.name = (prof.data && prof.data.display_name) || (user.email || '').split('@')[0];
    return true;
  }

  function showLogin(msg) {
    LH.$('#app').hidden = true;
    LH.$('#login').hidden = false;
    LH.$('#loginError').textContent = msg || '';
    stopPolling(); stopLive();
  }

  async function enter(session) {
    var ok;
    try { ok = await loadIdentity(session.user); }
    catch (e) { console.error(e); showLogin('Could not reach the server. Check your connection and try again.'); return; }
    if (!ok) {
      await LH.sb.auth.signOut();
      showLogin('That account doesn\'t have admin access.');
      return;
    }
    LH.$('#login').hidden = true;
    LH.$('#app').hidden = false;
    LH.$('#avatarBtn').textContent = LH.initials(LH.state.name);
    LH.$('#menuName').textContent = LH.state.name;
    LH.$('#menuEmail').textContent = LH.state.email;
    drawRail(); drawThemeBtn(); drawTopWeather();
    startPolling();
    startLive();
    LH.route();
  }

  LH.signOut = async function () {
    stopPolling(); stopLive();
    LH.state.user = null;
    await LH.sb.auth.signOut();
    LH.$('#password').value = '';
    showLogin('');
  };

  /* ---------- shell ---------- */
  function drawRail() {
    var h = '<span class="lh-rail-mark" aria-label="Lotti Homes">' + (window.LH_MARK || '') + '</span>';
    LH.NAV.forEach(function (n) {
      if (n.id === 'settings') h += '<div class="grow"></div>';
      h += '<a class="lh-nav" href="#/' + n.id + '" data-nav="' + n.id + '" title="' + n.label + '">' +
        '<span class="ic">' + LH.icon(n.id) + '</span><span class="lb">' + n.label + '</span></a>';
    });
    LH.$('#rail').innerHTML = h;
  }
  function markNav(id) {
    LH.$$('.lh-nav').forEach(function (a) {
      var on = a.getAttribute('data-nav') === id;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ---------- router ---------- */
  var current = null;
  LH.go = function (path) { location.hash = '#/' + path; };
  LH.route = function () {
    if (!LH.state.user) return;
    var parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    var id = parts[0] || 'overview';
    var screen = LH.screens[id];
    if (!screen) { id = 'overview'; screen = LH.screens.overview; parts = ['overview']; }
    if (current && current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
    current = null;
    if (LH.fx) LH.fx.reset();
    markNav(id);
    document.title = screen.title + ' | Lotti Homes';
    var view = LH.$('#view');
    view.scrollTop = 0; window.scrollTo(0, 0);
    current = screen.render(view, parts.slice(1)) || null;
  };

  var poll = null;
  function startPolling() {
    stopPolling();
    LH.touchSynced();
    poll = setInterval(function () {
      drawSync();
      if (document.hidden || !current || !current.refresh) return;
      // While the live connection is up, polling is only a safety net.
      if (Date.now() - lastSync > (current.pollMs || (live.on ? 60000 : 30000))) { Promise.resolve(current.refresh()).catch(function () {}); }
    }, 5000);
  }
  function stopPolling() { if (poll) clearInterval(poll); poll = null; }

  /* ---------- live updates (Supabase Realtime) ----------
     Any change the signed-in admin is allowed to see — made in the app, the dashboard or the
     website forms — refreshes the open screen within about a second. Screens may list the
     tables they care about in `watch`; changes to other tables are ignored. */
  var live = { channel: null, on: false, timer: null, last: 0, seen: false };
  function startLive() {
    stopLive();
    live.channel = LH.sb.channel('lh-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public' }, onLiveChange)
      .subscribe(function (status) {
        var was = live.on;
        live.on = status === 'SUBSCRIBED';
        drawSync();
        // After a drop and reconnect, catch up on anything missed.
        if (live.on && !was && live.seen && current && current.refresh) Promise.resolve(current.refresh()).catch(function () {});
        if (live.on) live.seen = true;
      });
  }
  function stopLive() {
    clearTimeout(live.timer);
    if (live.channel && LH.sb) { try { LH.sb.removeChannel(live.channel); } catch (e) { /* already gone */ } }
    live.channel = null; live.on = false; live.seen = false;
  }
  function onLiveChange(p) {
    if (!current || !current.refresh) return;
    var w = current.watch;
    if (w && p && p.table && w.indexOf(p.table) === -1) return;
    clearTimeout(live.timer);
    // Bursts of changes become one refresh, and never more than one every ~2.5 seconds.
    var wait = current.fast ? 150 : Math.max(300, 2500 - (Date.now() - live.last));
    live.timer = setTimeout(function () {
      live.last = Date.now();
      if (current && current.refresh) Promise.resolve(current.refresh()).catch(function () {});
    }, wait);
  }

  /* ---------- search ---------- */
  var index = null, indexAt = 0, indexBusy = false;
  async function buildIndex() {
    var q = function (t, c) { return LH.sb.from(t).select(c); };
    var r = await Promise.all([
      q('projects', 'id,code,name,site_street,site_suburb').is('deleted_at', null),
      q('leads', 'id,name,email,phone,suburb'),
      q('clients', 'id,name,email,mobile'),
      q('contractors', 'id,name,contact_name,phone,email'),
    ]);
    var out = [];
    (r[0].data || []).forEach(function (p) { out.push({ k: 'Project', t: p.name, s: [p.code, p.site_street, p.site_suburb].filter(Boolean).join(' · '), h: '#/projects/' + p.id }); });
    (r[1].data || []).forEach(function (l) { out.push({ k: 'Lead', t: l.name, s: [l.suburb, l.email, LH.fmt.phone(l.phone)].filter(Boolean).join(' · '), h: '#/leads/' + l.id }); });
    (r[2].data || []).forEach(function (c) { out.push({ k: 'Client', t: c.name, s: [c.email, LH.fmt.phone(c.mobile)].filter(Boolean).join(' · '), h: '#/projects' }); });
    (r[3].data || []).forEach(function (c) { out.push({ k: 'Contractor', t: c.name, s: [c.contact_name, LH.fmt.phone(c.phone)].filter(Boolean).join(' · '), h: '#/contractors/' + c.id }); });
    index = out; indexAt = Date.now();
  }
  function bindSearch() {
    var input = LH.$('#search'), box = LH.$('#results'), sel = -1, shown = [];
    function close() { box.hidden = true; sel = -1; }
    function draw() {
      var term = input.value.trim().toLowerCase();
      if (!term) { close(); return; }
      if (!index) { box.hidden = false; box.innerHTML = '<div class="empty">Loading…</div>'; return; }
      shown = index.filter(function (e) { return (e.t + ' ' + e.s).toLowerCase().indexOf(term) !== -1; }).slice(0, 12);
      box.hidden = false;
      box.innerHTML = shown.length
        ? shown.map(function (e, i) { return '<a href="' + e.h + '" data-i="' + i + '"><span class="k">' + e.k + '</span><span><div>' + LH.esc(e.t) + '</div><div class="faint" style="font-size:max(11.04px, 0.75rem)">' + LH.esc(e.s) + '</div></span></a>'; }).join('')
        : '<div class="empty">Nothing matches “' + LH.esc(input.value.trim()) + '”.</div>';
    }
    // Built the first time search is used, then refreshed whenever it is a minute old, so new leads and projects can be found.
    input.addEventListener('focus', function () {
      if (indexBusy || (index && Date.now() - indexAt < 60000)) return;
      indexBusy = true;
      buildIndex().then(draw).catch(function (e) { console.error(e); if (!index) index = []; }).then(function () { indexBusy = false; });
    });
    input.addEventListener('input', draw);
    input.addEventListener('keydown', function (e) {
      var links = LH.$$('a', box);
      if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
      else if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); sel = (sel + 1) % links.length; }
      else if (e.key === 'ArrowUp' && links.length) { e.preventDefault(); sel = (sel - 1 + links.length) % links.length; }
      else if (e.key === 'Enter' && links.length) { e.preventDefault(); (links[sel] || links[0]).click(); }
      else return;
      links.forEach(function (a, i) { a.classList.toggle('on', i === sel); });
    });
    box.addEventListener('click', function () { input.value = ''; close(); });
    document.addEventListener('click', function (e) { if (!e.target.closest('.lh-search')) close(); });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); }
    });
  }

  /* ---------- wire up ---------- */
  LH.boot = async function () {
    new MutationObserver(tidy).observe(document.body, { childList: true, subtree: true }); tidy();
    LH.$$('[data-mark]').forEach(function (el) { el.innerHTML = window.LH_MARK || ''; });
    drawThemeBtn();
    LH.$('#themeBtn').addEventListener('click', function () {
      setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      if (current && current.themeChanged) current.themeChanged();
    });
    var menu = LH.$('#menu');
    LH.$('#avatarBtn').addEventListener('click', function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', function () { menu.hidden = true; });
    LH.$('#signOutBtn').addEventListener('click', LH.signOut);
    bindSearch();
    window.addEventListener('hashchange', LH.route);
    window.addEventListener('online', drawSync); window.addEventListener('offline', drawSync);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && LH.state.user && current && current.refresh && Date.now() - lastSync > 30000) {
        Promise.resolve(current.refresh()).catch(function () {});
      }
    });

    var form = LH.$('#loginForm');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = LH.$('#loginError'), btn = LH.$('#loginBtn');
      err.textContent = '';
      if (!LH.ready) { err.textContent = 'The dashboard isn\'t connected to the database yet.'; return; }
      btn.disabled = true;
      try {
        var res = await LH.sb.auth.signInWithPassword({ email: LH.$('#email').value.trim(), password: LH.$('#password').value });
        if (res.error) { err.textContent = 'Incorrect email or password.'; return; }
        await enter(res.data.session);
      } catch (ex) {
        console.error(ex); err.textContent = 'Could not reach the server. Check your connection and try again.';
      } finally { btn.disabled = false; }
    });

    if (!LH.ready) { showLogin('The dashboard isn\'t connected to the database yet.'); return; }
    var s = await LH.sb.auth.getSession();
    if (s.data && s.data.session) await enter(s.data.session); else showLogin('');

    LH.sb.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' && LH.state.user) { LH.state.user = null; showLogin('You\'ve been signed out.'); } });
  };
})();
