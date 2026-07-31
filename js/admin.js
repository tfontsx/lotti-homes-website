/* =========================================================================
   ADMIN PORTAL
   Supabase-Auth-gated dashboard for viewing site_inductions and
   daily_checkins. Requires js/supabase-config.js to be filled in, and
   supabase/admin_access.sql to have been run (read policies + an admin
   user created in the Supabase dashboard).
   ========================================================================= */

(function () {
  const INDUCTION_LABELS = {
    company_safety: 'Company Safety',
    fit_for_work: 'Fit for Work',
    competency_licensing: 'Competency & Licensing',
    white_card: 'White Card',
    ppe: 'PPE',
    swms: 'SWMS',
    site_rules: 'Site Rules',
    heights: 'Working at Heights',
    ladders: 'Ladders',
    scaffolding: 'Scaffolding',
    ewp: 'Elevated Work Platforms',
    excavations: 'Excavations',
    electrical: 'Electrical Safety',
    manual_handling: 'Manual Handling',
    hazardous_chemicals: 'Hazardous Chemicals',
    asbestos: 'Asbestos Awareness',
    silica_dust: 'Silica Dust',
    lead_paint: 'Lead Paint',
    plant_equipment: 'Plant & Equipment',
    housekeeping: 'Housekeeping',
    environmental: 'Environmental Protection',
    incident_reporting: 'Incident Reporting',
    emergency_procedures: 'Emergency Procedures',
    stop_work_authority: 'Stop Work Authority',
  };

  const CHECKIN_LABELS = {
    fit_for_work: 'Fit for Work',
    ppe_worn: 'PPE',
    swms_reviewed: 'SWMS Reviewed',
    hazards_checked: 'Work Area & Hazards',
    plant_prestart: 'Plant Pre-Start',
    weather_suitable: 'Weather',
  };

  const config = window.SUPABASE_CONFIG;
  const configReady = config && config.url && !config.url.includes('YOUR-PROJECT-REF');
  // persistSession + autoRefreshToken (both default true, set explicitly here)
  // keep the admin signed in across page refreshes via localStorage.
  const client = configReady ? window.supabase.createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  }) : null;

  const loginScreen = document.getElementById('loginScreen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const signOutBtn = document.getElementById('signOutBtn');

  const tabs = document.querySelectorAll('.admin-tab');
  const panels = {
    inductions: document.getElementById('panel-inductions'),
    checkins: document.getElementById('panel-checkins'),
  };

  const inductionSearch = document.getElementById('inductionSearch');
  const checkinSearch = document.getElementById('checkinSearch');

  let inductions = [];
  let checkins = [];

  const filterState = {
    inductions: { search: '', range: 'all' },
    checkins: { search: '', range: 'all' },
  };

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtDateTime(d) {
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function todayStr() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }

  function countFlags(responses) {
    if (!responses) return 0;
    return Object.values(responses).filter((e) => e && e.answer === 'no').length;
  }

  function inDateRange(dateStr, range) {
    if (range === 'all' || !dateStr) return true;
    const d = new Date(`${dateStr}T00:00:00`);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (range === 'today') return d.getTime() === startOfToday.getTime();

    if (range === 'week') {
      const weekAgo = new Date(startOfToday);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return d >= weekAgo && d <= startOfToday;
    }

    if (range === 'month') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }

    return true;
  }

  function filterRows(list, state, dateField) {
    const term = state.search.trim().toLowerCase();
    return list.filter((row) => {
      const matchesSearch = !term ||
        (row.worker_name || '').toLowerCase().includes(term) ||
        (row.company || '').toLowerCase().includes(term);
      const matchesRange = inDateRange(row[dateField], state.range);
      return matchesSearch && matchesRange;
    });
  }

  function statusIcon(flags) {
    if (flags > 0) {
      return `<svg class="admin-status admin-status--bad" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="${flags} flagged answer${flags === 1 ? '' : 's'}"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M9 9L15 15M15 9L9 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    }
    return `<svg class="admin-status admin-status--good" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="All clear"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 12.5L10.5 15.5L16.5 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function renderAnswers(responses, labels) {
    if (!responses) return '';
    return Object.keys(labels).map((id) => {
      const entry = responses[id];
      if (!entry) return '';
      const isNo = entry.answer === 'no';
      return `
        <div class="admin-answer">
          <span class="admin-answer__label">${esc(labels[id])}</span>
          <span class="admin-answer__value ${isNo ? 'admin-answer__value--no' : 'admin-answer__value--yes'}">${esc(entry.answer || '—')}</span>
          ${entry.comment ? `<span class="admin-answer__comment">"${esc(entry.comment)}"</span>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderInductions() {
    const list = filterRows(inductions, filterState.inductions, 'induction_date');
    const wrap = document.getElementById('inductionList');
    document.getElementById('inductionCount').textContent = `${list.length} of ${inductions.length} submission${inductions.length === 1 ? '' : 's'}`;

    if (!list.length) {
      wrap.innerHTML = '<p class="admin-empty">No inductions match these filters.</p>';
      return;
    }

    wrap.innerHTML = list.map((row) => {
      const flags = countFlags(row.responses);
      return `
        <details class="admin-row">
          <summary>
            <div class="admin-row__main">
              <span class="admin-row__name">${statusIcon(flags)}${esc(row.worker_name)}</span>
              <span class="admin-row__meta">${esc(row.company)} · ${esc(row.trade)} · ${fmtDate(row.induction_date)}</span>
            </div>
            <div class="admin-row__right">
              ${flags ? `<span class="admin-badge">${flags} flagged</span>` : ''}
              <svg class="admin-row__chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9 L12 15 L18 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </summary>
          <div class="admin-row__body">
            <dl>
              <div><dt>Supervisor</dt><dd>${esc(row.supervisor)}</dd></div>
              <div><dt>Signed</dt><dd>${esc(row.signature_name)}</dd></div>
              <div><dt>Submitted</dt><dd>${fmtDateTime(row.created_at)}</dd></div>
              <div><dt>Declaration</dt><dd>${row.declaration_completed_induction && row.declaration_understand_whs && row.declaration_agree_policies && row.declaration_report_hazards && row.declaration_understand_consequences ? 'Fully signed' : 'Incomplete'}</dd></div>
            </dl>
            <div class="admin-answers">
              ${renderAnswers(row.responses, INDUCTION_LABELS)}
            </div>
          </div>
        </details>
      `;
    }).join('');
  }

  function renderCheckins() {
    const list = filterRows(checkins, filterState.checkins, 'checkin_date');
    const wrap = document.getElementById('checkinList');
    document.getElementById('checkinCount').textContent = `${list.length} of ${checkins.length} submission${checkins.length === 1 ? '' : 's'}`;

    if (!list.length) {
      wrap.innerHTML = '<p class="admin-empty">No check-ins match these filters.</p>';
      return;
    }

    wrap.innerHTML = list.map((row) => {
      const flags = countFlags(row.responses);
      return `
        <details class="admin-row">
          <summary>
            <div class="admin-row__main">
              <span class="admin-row__name">${statusIcon(flags)}${esc(row.worker_name)}</span>
              <span class="admin-row__meta">${esc(row.company)} · ${esc(row.site_address)} · ${fmtDate(row.checkin_date)}</span>
            </div>
            <div class="admin-row__right">
              ${flags ? `<span class="admin-badge">${flags} flagged</span>` : ''}
              <svg class="admin-row__chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9 L12 15 L18 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </summary>
          <div class="admin-row__body">
            <dl>
              <div><dt>Signed</dt><dd>${esc(row.signature_name)}</dd></div>
              <div><dt>Submitted</dt><dd>${fmtDateTime(row.created_at)}</dd></div>
              ${row.hazards_identified ? `<div><dt>Hazards Identified</dt><dd>${esc(row.hazards_identified)}</dd></div>` : ''}
              ${row.incidents_near_misses ? `<div><dt>Incidents / Near Misses</dt><dd>${esc(row.incidents_near_misses)}</dd></div>` : ''}
              ${row.additional_notes ? `<div><dt>Additional Notes</dt><dd>${esc(row.additional_notes)}</dd></div>` : ''}
            </dl>
            <div class="admin-answers">
              ${renderAnswers(row.responses, CHECKIN_LABELS)}
            </div>
          </div>
        </details>
      `;
    }).join('');
  }

  function renderStats() {
    const today = todayStr();

    const inductionsToday = inductions.filter((r) => r.induction_date === today).length;
    const checkinsToday = checkins.filter((r) => r.checkin_date === today).length;

    let totalFlags = 0;
    let weekFlags = 0;
    inductions.forEach((r) => {
      const f = countFlags(r.responses);
      totalFlags += f;
      if (f && inDateRange(r.induction_date, 'week')) weekFlags += f;
    });
    checkins.forEach((r) => {
      const f = countFlags(r.responses);
      totalFlags += f;
      if (f && inDateRange(r.checkin_date, 'week')) weekFlags += f;
    });

    document.getElementById('statInductions').textContent = inductions.length;
    document.getElementById('statInductionsToday').textContent = `${inductionsToday} today`;

    document.getElementById('statCheckins').textContent = checkins.length;
    document.getElementById('statCheckinsToday').textContent = `${checkinsToday} today`;

    document.getElementById('statFlags').textContent = totalFlags;
    document.getElementById('statFlagsWeek').textContent = `${weekFlags} this week`;
  }

  function bindQuickDates() {
    document.querySelectorAll('.admin-quickdates').forEach((group) => {
      const tabKey = group.dataset.quickdates;
      group.querySelectorAll('.admin-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          group.querySelectorAll('.admin-chip').forEach((c) => c.classList.remove('is-active'));
          chip.classList.add('is-active');
          filterState[tabKey].range = chip.dataset.range;
          if (tabKey === 'inductions') renderInductions();
          else renderCheckins();
        });
      });
    });
  }

  inductionSearch.addEventListener('input', () => {
    filterState.inductions.search = inductionSearch.value;
    renderInductions();
  });
  checkinSearch.addEventListener('input', () => {
    filterState.checkins.search = checkinSearch.value;
    renderCheckins();
  });

  bindQuickDates();

  async function loadData() {
    const [inductionsRes, checkinsRes] = await Promise.all([
      client.from('site_inductions').select('*').order('created_at', { ascending: false }),
      client.from('daily_checkins').select('*').order('created_at', { ascending: false }),
    ]);

    if (inductionsRes.error) throw inductionsRes.error;
    if (checkinsRes.error) throw checkinsRes.error;

    inductions = inductionsRes.data || [];
    checkins = checkinsRes.data || [];

    renderStats();
    renderInductions();
    renderCheckins();
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      Object.keys(panels).forEach((key) => panels[key].classList.toggle('is-active', key === tab.dataset.tab));
    });
  });

  function showDashboard() {
    loginScreen.classList.add('is-hidden');
    dashboard.classList.add('is-visible');
    loadData().catch((err) => {
      console.error(err);
      const wrap = document.getElementById('inductionList');
      wrap.innerHTML = `<p class="admin-empty">Could not load submissions. ${esc(err.message || '')}</p>`;
    });
  }

  function showLogin() {
    loginScreen.classList.remove('is-hidden');
    dashboard.classList.remove('is-visible');
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';

    if (!client) {
      loginError.textContent = 'This portal is not yet connected to a database. Fill in js/supabase-config.js.';
      return;
    }

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const { error } = await client.auth.signInWithPassword({
      email: loginForm.email.value.trim(),
      password: loginForm.password.value,
    });

    submitBtn.disabled = false;

    if (error) {
      loginError.textContent = 'Incorrect email or password.';
      return;
    }

    showDashboard();
  });

  signOutBtn.addEventListener('click', async () => {
    if (client) await client.auth.signOut();
    showLogin();
  });

  // On load, resume an existing session if there is one.
  if (client) {
    client.auth.getSession().then(({ data }) => {
      if (data.session) showDashboard();
    });
  }
})();
