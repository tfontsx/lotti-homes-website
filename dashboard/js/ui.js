/* Shared building blocks for the dashboard screens: forms in dialogs, confirmations,
   toasts, section headings, stat cards, chips, CSV export and print sheets. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc;
  var UI = (LH.ui = {});

  /* ---------- small renderers ---------- */
  UI.sect = function (label, right) {
    return '<div class="lh-sect"><span class="cap">' + label + '</span><span class="rule"></span>' + (right || '') + '</div>';
  };
  UI.stat = function (label, value, unit, sub, tone, delay, wash) {
    return '<div class="lh-card lift stat' + (wash ? ' wash' : '') + '" style="animation-delay:' + (delay || 0) + 'ms' + (wash ? ';--wash:var(--' + wash + ')' : '') + '"><div class="cap">' + esc(label) + '</div><div class="v">' + value + (unit ? '<small>' + esc(unit) + '</small>' : '') +
      '</div><div class="s ' + (tone || '') + '">' + sub + '</div></div>';
  };
  /** Pill-shaped filter chips. items: [[value,label],...]. */
  UI.chips = function (items, current, attr) {
    return items.map(function (i) { return '<button type="button" class="lh-chip' + (current === i[0] ? ' on' : '') + '" data-' + attr + '="' + esc(i[0]) + '">' + esc(i[1]) + '</button>'; }).join('');
  };
  UI.pill = function (cls, text) { return '<span class="lh-pill ' + cls + '"><i></i>' + esc(text) + '</span>'; };
  UI.skeleton = function (blocks) {
    return blocks.map(function (b) { return '<div class="lh-skel" style="height:' + b[0] + 'px;margin-top:' + (b[1] || 0) + 'px"></div>'; }).join('');
  };

  /** Friendly text for a database error. */
  LH.errMsg = function (e) {
    var m = (e && (e.message || e.error_description)) || String(e || 'Something went wrong');
    if (e && e.code === '42501') return 'You don\'t have permission to do that.';
    if (/duplicate key/i.test(m)) return 'That already exists.';
    return m;
  };

  /* ---------- time zone: "2026-11-20T09:30" typed in Adelaide time -> ISO ---------- */
  function tzOffsetMin(utcMs) {
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: LH.tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(utcMs)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return (asUtc - utcMs) / 60000;
  }
  LH.adelaideToISO = function (local) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || '');
    if (!m) return null;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var t = guess - tzOffsetMin(guess) * 60000;
    t = guess - tzOffsetMin(t) * 60000;
    return new Date(t).toISOString();
  };
  /** An instant as "YYYY-MM-DDTHH:mm" in Adelaide time (for datetime-local inputs). */
  LH.toLocalInput = function (iso) { return LH.fmt.dayKey(iso) + 'T' + LH.fmt.time(iso); };

  /* ---------- toast ---------- */
  var toastEl = null, toastTimer = null;
  UI.toast = function (msg, kind) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'lh-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.className = 'lh-toast show' + (kind === 'error' ? ' err' : '');
    toastEl.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, kind === 'error' ? 6000 : 3200);
  };

  /* ---------- dialog ---------- */
  function openDialog(inner, wide) {
    var back = document.createElement('div');
    back.className = 'lh-back';
    back.innerHTML = '<div class="lh-dialog' + (wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' + inner + '</div>';
    document.body.appendChild(back);
    document.body.classList.add('lh-noscroll');
    requestAnimationFrame(function () { back.classList.add('in'); });
    var prev = document.activeElement;
    function close() {
      back.classList.remove('in');
      document.body.classList.remove('lh-noscroll');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () { back.remove(); }, 180);
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { /* gone */ } }
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); back.dispatchEvent(new CustomEvent('lh-cancel')); close(); } }
    document.addEventListener('keydown', onKey);
    back.addEventListener('mousedown', function (e) { if (e.target === back) { back.dispatchEvent(new CustomEvent('lh-cancel')); close(); } });
    return { el: back, close: close };
  }

  function fieldHtml(f, vals) {
    var v = vals[f.name] != null ? vals[f.name] : (f.value != null ? f.value : '');
    var id = 'f_' + f.name, req = f.required ? ' required' : '', ph = f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '';
    var span = f.span === 2 ? ' span2' : '';
    var label = '<label class="lh-flabel" for="' + id + '">' + esc(f.label) + (f.required ? ' <i>*</i>' : '') + '</label>';
    var hint = f.hint ? '<div class="lh-fhint">' + esc(f.hint) + '</div>' : '';
    var input;
    if (f.type === 'select') {
      input = '<select class="lh-input" id="' + id + '" name="' + f.name + '"' + req + '>' + (f.options || []).map(function (o) {
        return '<option value="' + esc(o.v) + '"' + (String(o.v) === String(v) ? ' selected' : '') + '>' + esc(o.l) + '</option>';
      }).join('') + '</select>';
    } else if (f.type === 'textarea') {
      input = '<textarea class="lh-input area" id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 4) + '"' + req + ph + '>' + esc(v) + '</textarea>';
    } else if (f.type === 'money') {
      input = '<div class="lh-money"><span>$</span><input class="lh-input" id="' + id + '" name="' + f.name + '" type="number" inputmode="numeric" min="0" step="1"' + req + ph + ' value="' + esc(v) + '"></div>';
    } else if (f.type === 'number') {
      input = '<input class="lh-input" id="' + id + '" name="' + f.name + '" type="number" inputmode="numeric"' + (f.min != null ? ' min="' + f.min + '"' : '') + (f.max != null ? ' max="' + f.max + '"' : '') + ' step="' + (f.step || 1) + '"' + req + ph + ' value="' + esc(v) + '">';
    } else {
      input = '<input class="lh-input" id="' + id + '" name="' + f.name + '" type="' + (f.type || 'text') + '"' + req + ph + ' value="' + esc(v) + '" autocomplete="off">';
    }
    return '<div class="lh-field-wrap' + span + '">' + label + input + hint + '</div>';
  }

  /** A form in a dialog. Resolves true once onSubmit succeeds, false if cancelled.
      opts: { title, intro, fields, values, submitLabel, danger, wide, onSubmit(values) }. */
  UI.form = function (opts) {
    return new Promise(function (resolve) {
      var vals = opts.values || {};
      var body = '<form novalidate><div class="lh-dhead"><h2>' + esc(opts.title) + '</h2><button type="button" class="lh-x" data-close aria-label="Close">×</button></div>' +
        (opts.intro ? '<p class="lh-dintro">' + esc(opts.intro) + '</p>' : '') +
        '<div class="lh-fgrid">' + (opts.fields || []).map(function (f) { return fieldHtml(f, vals); }).join('') + '</div>' +
        (opts.extra || '') +
        '<div class="lh-derr" role="alert"></div>' +
        '<div class="lh-dfoot"><button type="button" class="lh-btn" data-close>Cancel</button><button type="submit" class="lh-btn ' + (opts.danger ? 'danger-fill' : 'primary') + '">' + esc(opts.submitLabel || 'Save') + '</button></div></form>';
      var d = openDialog(body, opts.wide), form = d.el.querySelector('form'), errEl = d.el.querySelector('.lh-derr'), done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } }
      d.el.addEventListener('lh-cancel', function () { finish(false); });
      d.el.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { finish(false); d.close(); }); });
      if (opts.onOpen) opts.onOpen(d.el, form);
      var first = form.querySelector('input,select,textarea'); if (first) setTimeout(function () { first.focus(); }, 60);
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errEl.textContent = '';
        var out = {}, bad = null;
        (opts.fields || []).forEach(function (f) {
          var el = form.elements[f.name]; if (!el) return;
          var v = el.value; if (typeof v === 'string') v = v.trim();
          if (f.required && v === '' && !bad) bad = f.label + ' is required.';
          out[f.name] = v;
        });
        (form.querySelectorAll('[data-collect]') || []).forEach(function () { /* extras gathered by onSubmit */ });
        if (bad) { errEl.textContent = bad; return; }
        var btn = form.querySelector('[type=submit]'); btn.disabled = true;
        try {
          await opts.onSubmit(out, form);
          finish(true); d.close();
        } catch (ex) {
          console.error(ex); errEl.textContent = LH.errMsg(ex); btn.disabled = false;
        }
      });
    });
  };

  /** Yes/no confirmation. Resolves true or false. */
  UI.confirm = function (message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var d = openDialog('<div class="lh-dhead"><h2>' + esc(opts.title || 'Are you sure?') + '</h2></div><p class="lh-dintro">' + esc(message) + '</p>' +
        '<div class="lh-dfoot"><button type="button" class="lh-btn" data-no>' + esc(opts.no || 'Cancel') + '</button><button type="button" class="lh-btn ' + (opts.danger ? 'danger-fill' : 'primary') + '" data-yes>' + esc(opts.yes || 'Confirm') + '</button></div>');
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } d.close(); }
      d.el.addEventListener('lh-cancel', function () { if (!done) { done = true; resolve(false); } });
      d.el.querySelector('[data-no]').addEventListener('click', function () { finish(false); });
      d.el.querySelector('[data-yes]').addEventListener('click', function () { finish(true); });
      setTimeout(function () { d.el.querySelector('[data-yes]').focus(); }, 60);
    });
  };

  /** A dialog with several action buttons. choices: [{key,label,primary,danger}]. Resolves the key or null. */
  UI.choose = function (title, intro, choices) {
    return new Promise(function (resolve) {
      var d = openDialog('<div class="lh-dhead"><h2>' + esc(title) + '</h2><button type="button" class="lh-x" data-no aria-label="Close">×</button></div>' + (intro ? '<p class="lh-dintro">' + esc(intro) + '</p>' : '') +
        '<div class="lh-choices">' + choices.map(function (c) { return '<button type="button" class="lh-btn block ' + (c.primary ? 'primary' : c.danger ? 'danger' : '') + '" data-k="' + esc(c.key) + '">' + esc(c.label) + '</button>'; }).join('') + '</div>');
      var done = false;
      function finish(v) { if (!done) { done = true; resolve(v); } d.close(); }
      d.el.addEventListener('lh-cancel', function () { if (!done) { done = true; resolve(null); } });
      d.el.querySelectorAll('[data-no]').forEach(function (b) { b.addEventListener('click', function () { finish(null); }); });
      d.el.querySelectorAll('[data-k]').forEach(function (b) { b.addEventListener('click', function () { finish(b.getAttribute('data-k')); }); });
    });
  };

  /** Full-size image viewer. */
  UI.lightbox = function (url, caption) {
    var d = openDialog('<button type="button" class="lh-x light" data-close aria-label="Close">×</button><img class="lh-lbimg" alt="' + esc(caption || '') + '" src="' + esc(url) + '">' + (caption ? '<div class="lh-lbcap">' + esc(caption) + '</div>' : ''), true);
    d.el.classList.add('lightbox');
    d.el.querySelector('[data-close]').addEventListener('click', d.close);
  };

  /* ---------- exports ---------- */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  /** Downloads rows (first row = headings) as a CSV file that opens in Excel. */
  UI.csv = function (name, rows) {
    var text = '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = name + '-' + LH.fmt.dayKey(new Date()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  /** Opens a clean print view (also lets the user "Save as PDF"). */
  UI.printSheet = function (title, subtitle, headings, rows) {
    var w = window.open('', '_blank');
    if (!w) { UI.toast('Allow pop-ups for this site to open the report.', 'error'); return; }
    w.document.write('<!doctype html><title>' + esc(title) + '</title><style>body{font:13px/1.45 system-ui,sans-serif;margin:32px;color:#111F2E}h1{font:300 28px Georgia,serif;margin:0 0 4px}p{color:#4F5B66;margin:0 0 22px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px 8px;border-bottom:1px solid #ccd;vertical-align:top}th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#4F5B66}</style>' +
      '<h1>' + esc(title) + '</h1><p>' + esc(subtitle) + '</p><table><thead><tr>' + headings.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>');
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 250);
  };

  /** One print view holding several reports, each starting on its own page. */
  UI.printSheets = function (title, subtitle, sections) {
    var w = window.open('', '_blank');
    if (!w) { UI.toast('Allow pop-ups for this site to open the reports.', 'error'); return; }
    w.document.write('<!doctype html><title>' + esc(title) + '</title><style>body{font:13px/1.45 system-ui,sans-serif;margin:32px;color:#111F2E}h1{font:300 28px Georgia,serif;margin:0 0 4px}p{color:#4F5B66;margin:0 0 22px}section+section{break-before:page;margin-top:48px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px 8px;border-bottom:1px solid #ccd;vertical-align:top}th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#4F5B66}</style>' +
      sections.map(function (s) {
        return '<section><h1>' + esc(s.title) + '</h1><p>' + esc(subtitle) + '</p><table><thead><tr>' + s.headings.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          s.rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></section>';
      }).join(''));
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 400);
  };

  /** Whole dollars from a money field value, or null. */
  UI.dollars = function (v) { var n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? null : n; };
  UI.cents = function (v) { var n = UI.dollars(v); return n == null ? null : n * 100; };
  UI.nullIfBlank = function (v) { v = (v == null ? '' : String(v)).trim(); return v === '' ? null : v; };

  /** Relative time like "2h ago", "Yesterday", or "12 Sep". */
  UI.ago = function (iso) {
    var d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    var t = LH.today(), y = LH.keyOf(t.y, t.m, t.d - 1);
    if (LH.fmt.dayKey(d) === y) return 'Yesterday';
    return LH.fmt.dateY(LH.fmt.dayKey(d)).replace(/ \d{4}$/, '');
  };
  /** Days from today to a date column (negative = overdue). */
  UI.daysUntil = function (dateStr) {
    if (!dateStr) return null;
    var t = LH.today();
    return Math.round((Date.parse(dateStr + 'T00:00:00Z') - Date.UTC(t.y, t.m, t.d)) / 86400000);
  };
})();
