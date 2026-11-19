/* Reviews — what clients wrote on their Handover screen in the app: stars, words, who and which
   project, and the consent each one gave for Lotti Homes to use it publicly. Read-only apart from
   removing a review a client asks to have taken down. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z"/></svg>';

  function stars(n) {
    var h = '';
    for (var i = 1; i <= 5; i++) h += '<span class="rv-star' + (i <= n ? ' on' : '') + '">' + STAR + '</span>';
    return '<span class="rv-stars" role="img" aria-label="' + n + (n === 1 ? ' star' : ' stars') + '">' + h + '</span>';
  }
  function tone(n) { return n >= 4 ? 'ok' : n === 3 ? 'wait' : 'halt'; }

  function render(view) {
    var D = null, destroyed = false, drawn = false, S = { rating: 'all' };
    view.innerHTML = UI.skeleton([[110], [60, 24], [300, 24]]);

    async function refresh() {
      try {
        var r = await LH.sb.from('project_reviews').select('id,project_id,rating,body,reviewer_name,project_label,consent_text,consented_at,created_at').order('created_at', { ascending: false });
        if (r.error) throw r.error;
        D = { list: r.data || [], missing: false };
        LH.touchSynced();
        if (!destroyed) draw();
      } catch (e) {
        console.error(e);
        if (e && (e.code === '42P01' || /does not exist|schema cache/i.test(e.message || ''))) { D = { list: [], missing: true }; if (!destroyed) draw(); return; }
        if (!D && !destroyed) view.innerHTML = '<div class="lh-err">Couldn\'t load reviews. ' + esc(LH.errMsg(e)) + '</div>';
      }
    }
    refresh();

    function card(rv, i) {
      return '<section class="lh-card lift wash rv-card" style="--wash:var(--' + tone(rv.rating) + ');animation-delay:' + Math.min(i * 40, 360) + 'ms">' +
        '<div class="rv-top">' + stars(rv.rating) + '<span class="faint tiny">' + esc(fmt.dateY(fmt.dayKey(rv.created_at))) + '</span></div>' +
        (rv.body ? '<p class="rv-body">' + esc(rv.body) + '</p>' : '<p class="rv-body faint">No written review — stars only.</p>') +
        '<div class="rv-foot"><div class="rv-who"><div class="serif rv-name">' + esc(rv.reviewer_name) + '</div>' +
        '<a class="rv-proj" href="#/projects/' + esc(rv.project_id) + '">' + esc(rv.project_label) + '</a></div>' +
        '<div class="rv-act no-print"><span class="lh-pill ok" title="' + esc(rv.consent_text) + '"><i></i>Public use agreed</span>' +
        '<button type="button" class="lh-link danger" data-del="' + esc(rv.id) + '">Remove</button></div></div></section>';
    }

    function draw() {
      var y = window.scrollY; view.classList.toggle('enter', !drawn); drawn = true;
      var L = D.list, n = L.length, sum = L.reduce(function (a, x) { return a + x.rating; }, 0), avg = n ? sum / n : null;
      var five = n ? Math.round(L.filter(function (x) { return x.rating === 5; }).length / n * 100) : null;
      var shown = L.filter(function (x) { return S.rating === 'all' || String(x.rating) === S.rating; });
      var latest = L[0];
      var counts = [5, 4, 3, 2, 1].map(function (k) { return [String(k), k + ' ★ · ' + L.filter(function (x) { return x.rating === k; }).length]; });
      view.innerHTML =
        '<div class="ov-hero"><div><div class="cap">Client feedback</div><h1 class="ov-hello">Reviews</h1></div>' +
        '<div class="ov-actions no-print"><button class="lh-btn" type="button" data-act="csv"' + (n ? '' : ' disabled') + '>Export</button></div></div>' +
        (D.missing ? '<div class="lh-card lh-empty">Reviews aren\'t switched on in the database yet.</div>' :
        UI.sect('At a glance') + '<div class="ov-glance">' +
        UI.stat('Average rating', avg == null ? '—' : avg.toFixed(1), avg == null ? '' : '/ 5', n + (n === 1 ? ' review' : ' reviews'), avg != null && avg >= 4 ? 'ok' : 'wait', 0, avg != null && avg >= 4 ? 'ok' : 'wait') +
        UI.stat('Total reviews', String(n), '', latest ? 'Latest ' + esc(fmt.date(fmt.dayKey(latest.created_at))) : 'None yet', 'steel', 60, 'steel') +
        UI.stat('Five-star share', five == null ? '—' : String(five), five == null ? '' : '%', 'of all reviews', 'ok', 120, 'ok') +
        UI.stat('With written feedback', String(L.filter(function (x) { return x.body; }).length), '', 'The rest are stars only', 'steel', 180, 'steel') + '</div>' +
        UI.sect('All reviews') + '<div class="chip-row">' + UI.chips([['all', 'All · ' + n]].concat(counts), S.rating, 'rating') + '</div>' +
        (shown.length ? '<div class="rv-grid">' + shown.map(card).join('') + '</div>' : '<div class="lh-card lh-empty">' + (n ? 'No reviews with that rating.' : 'No reviews yet. They arrive here when a client reviews their finished project in the app.') + '</div>'));
      window.scrollTo(0, y);
    }

    async function onClick(e) {
      var el = e.target.closest('[data-rating],[data-del],[data-act]'); if (!el || !D) return;
      if (el.hasAttribute('data-rating')) { S.rating = el.getAttribute('data-rating'); draw(); return; }
      if (el.hasAttribute('data-del')) {
        var id = el.getAttribute('data-del'), rv = D.list.filter(function (x) { return x.id === id; })[0]; if (!rv) return;
        if (!(await UI.confirm('Remove ' + rv.reviewer_name + '\'s review of ' + rv.project_label + '? Use this if they ask for it to be taken down. It can\'t be undone, and they can\'t send another for this project from the app.', { title: 'Remove review', yes: 'Remove', danger: true }))) return;
        var res = await LH.sb.from('project_reviews').delete().eq('id', id);
        if (res.error) { UI.toast(LH.errMsg(res.error), 'error'); return; }
        UI.toast('Review removed.'); refresh(); return;
      }
      if (el.getAttribute('data-act') === 'csv' && D.list.length) {
        UI.csv('client-reviews', [['Reviewer', 'Project', 'Rating', 'Review', 'Received', 'Consent given', 'Consent wording']].concat(D.list.map(function (x) {
          return [x.reviewer_name, x.project_label, x.rating, x.body || '', fmt.dayKey(x.created_at), fmt.dateTime(x.consented_at), x.consent_text];
        })));
      }
    }
    view.addEventListener('click', onClick);
    return { watch: ['project_reviews'], refresh: refresh, destroy: function () { destroyed = true; view.classList.remove('enter'); view.removeEventListener('click', onClick); } };
  }

  LH.screens.reviews = { title: 'Reviews', render: render };
})();
