/* Inbox — the same conversation threads as the app: read, reply, attach a file, start a new
   conversation. Replies go to the client as a push notification, exactly as they do from the app. */
(function () {
  'use strict';
  var LH = window.LH, esc = LH.esc, fmt = LH.fmt, UI = LH.ui;
  var MIMES = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  var WDL = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short' });

  var DOC_EXT = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'IMG' };
  function one(x) { return Array.isArray(x) ? x[0] : x; }
  function time12(iso) { var t = fmt.time(iso), h = +t.slice(0, 2), m = t.slice(3); return (h % 12 || 12) + ':' + m + (h < 12 ? ' am' : ' pm'); }
  function when(iso) {
    var t = LH.today(), k = fmt.dayKey(iso), today = LH.keyOf(t.y, t.m, t.d), yest = LH.keyOf(t.y, t.m, t.d - 1);
    if (k === today) return time12(iso);
    if (k === yest) return 'Yesterday';
    var days = (Date.UTC(t.y, t.m, t.d) - Date.parse(k + 'T00:00:00Z')) / 86400000;
    if (days < 7) return WDL.format(new Date(k + 'T00:00:00Z'));
    return fmt.date(k);
  }
  function dayLabel(iso) {
    var t = LH.today(), k = fmt.dayKey(iso);
    if (k === LH.keyOf(t.y, t.m, t.d)) return 'TODAY';
    if (k === LH.keyOf(t.y, t.m, t.d - 1)) return 'YESTERDAY';
    return fmt.dateY(k).toUpperCase();
  }
  function ini(name) { var p = String(name || '').replace(/[&]/g, ' ').trim().split(/\s+/); return ((p[0] || '')[0] || '') + ((p.length > 1 ? p[p.length - 1][0] : '') || ''); }

  function render(view, args) {
    var D = { threads: [], messages: [], docs: [], urls: {} }, destroyed = false, drawn = false;
    var S = { sel: args && args[0] ? args[0] : null, filter: 'all', q: '' };

    view.innerHTML =
      '<div class="ov-hero"><div><div class="cap">Messages</div><h1 class="ov-hello">Inbox</h1><div class="hero-sub">Same threads as the app · Clients get a push notification</div></div>' +
      '<div class="ov-actions no-print"><button class="lh-btn" type="button" data-act="new">+ New conversation</button><button class="lh-btn" type="button" data-act="readall">Mark all read</button></div></div>' +
      UI.sect('Conversations') +
      '<div class="in-grid"><section class="in-list lh-card"><input class="lh-input" id="inQ" type="search" placeholder="Search clients or projects" aria-label="Search conversations"><div class="chip-row" id="inChips" style="margin:0.75rem 0 0.625rem"></div><div id="inThreads" class="in-threads"></div></section>' +
      '<section class="in-chat lh-card"><div id="inHead" class="in-head"></div><div id="inMsgs" class="in-msgs"></div>' +
      '<form id="inForm" class="in-compose" autocomplete="off"><button type="button" class="in-plus" id="inAttach" aria-label="Attach a file">+</button><input type="file" id="inFile" hidden accept=".pdf,.jpg,.jpeg,.png,.webp"><input class="lh-input" id="inText" placeholder="Write a message" aria-label="Message"><button class="lh-btn primary" type="submit" id="inSend">Send</button></form></section>' +
      '<aside class="in-side lh-card" id="inSide"></aside></div>';
    view.classList.add('fit');
    var el = { q: LH.$('#inQ', view), chips: LH.$('#inChips', view), threads: LH.$('#inThreads', view), head: LH.$('#inHead', view), msgs: LH.$('#inMsgs', view), side: LH.$('#inSide', view), text: LH.$('#inText', view), form: LH.$('#inForm', view), file: LH.$('#inFile', view) };
    el.threads.innerHTML = UI.skeleton([[60], [60, 10], [60, 10]]);

    async function load() {
      var sb = LH.sb;
      var r = await Promise.all([
        sb.from('v_thread_summary').select('thread_id,project_id,last_message_at,last_message_preview,unread_count'),
        sb.from('message_threads').select('id,project_id,deleted_at,created_at').is('deleted_at', null),
        sb.from('projects').select('id,site_street,site_suburb,percent_complete,deleted_at,clients(name,mobile),project_stages(name,status)').is('deleted_at', null),
      ]);
      for (var i = 0; i < 3; i++) if (r[i].error) throw r[i].error;
      var sum = {}; (r[0].data || []).forEach(function (s) { sum[s.thread_id] = s; });
      var proj = {}; (r[2].data || []).forEach(function (p) { proj[p.id] = p; });
      D.projects = r[2].data || [];
      D.threads = (r[1].data || []).filter(function (t) { return proj[t.project_id]; }).map(function (t) {
        var s = sum[t.id] || {}, p = proj[t.project_id], c = one(p.clients) || {}, cur = (p.project_stages || []).filter(function (x) { return x.status === 'current'; })[0];
        return { id: t.id, project: t.project_id, street: p.site_street || '', suburb: p.site_suburb || '', client: c.name || 'Client', mobile: c.mobile || '', pct: p.percent_complete || 0, stage: cur ? cur.name : '', last: s.last_message_at || t.created_at, preview: s.last_message_preview || 'No messages yet', unread: Number(s.unread_count || 0) };
      }).sort(function (a, b) { return a.last < b.last ? 1 : -1; });
      if (!S.sel || !D.threads.some(function (t) { return t.id === S.sel; })) S.sel = D.threads[0] ? D.threads[0].id : null;
      D.messages = []; D.docs = [];
      if (S.sel) {
        var th = D.threads.filter(function (t) { return t.id === S.sel; })[0];
        var m = await Promise.all([
          sb.from('v_messages').select('id,thread_id,sender_role,body,attachments,sent_at,sender_name,is_mine').eq('thread_id', S.sel).order('sent_at', { ascending: true }).limit(300),
          sb.from('project_documents').select('id,title,mime_type,size_bytes,storage_path,created_at').eq('project_id', th.project).eq('shared_with_client', true).order('created_at', { ascending: false }).limit(30),
        ]);
        D.messages = m[0].data || []; D.docs = m[1].data || [];
        if (th.unread > 0) { LH.sb.rpc('mark_thread_read', { p_thread_id: S.sel }).then(function () {}); th.unread = 0; }
        await signAttachments();
      }
    }
    async function signAttachments() {
      var paths = [];
      D.messages.forEach(function (m) { (m.attachments || []).forEach(function (a) { if (a.path && !D.urls[a.path]) paths.push(a.path); }); });
      if (!paths.length) return;
      var res = await LH.sb.storage.from('message-attachments').createSignedUrls(paths, 3600);
      if (res.data) res.data.forEach(function (x) { if (x.signedUrl) D.urls[x.path] = x.signedUrl; });
    }
    async function refresh() {
      try { await load(); LH.touchSynced(); if (!destroyed) paint(); }
      catch (e) { console.error(e); if (!destroyed) el.threads.innerHTML = '<div class="lh-err">Couldn\'t load messages. ' + esc(LH.errMsg(e)) + '</div>'; }
    }
    refresh();

    function paint() {
      view.classList.toggle('enter', !drawn); drawn = true;
      var q = S.q.trim().toLowerCase();
      var list = D.threads.filter(function (t) { return (S.filter === 'all' || t.unread > 0) && (!q || (t.client + ' ' + t.street + ' ' + t.suburb).toLowerCase().indexOf(q) !== -1); });
      var listTop = el.threads.scrollTop;
      el.chips.innerHTML = UI.chips([['all', 'All'], ['unread', 'Unread']], S.filter, 'filter');
      el.threads.innerHTML = list.length ? list.map(function (t) {
        return '<button type="button" class="in-t' + (t.id === S.sel ? ' on' : '') + '" data-thread="' + t.id + '"><span class="av">' + esc(ini(t.client)) + '</span><span class="tb"><span class="r1"><b>' + esc(t.client) + '</b><i>' + esc(when(t.last)) + '</i></span><span class="r2">' + esc(t.street) + '</span><span class="r3"><span>' + esc(t.preview) + '</span>' + (t.unread ? '<em>' + t.unread + '</em>' : '') + '</span></span></button>';
      }).join('') : '<div class="faint" style="padding:1.125rem 0.375rem">' + (D.threads.length ? 'No conversations match.' : 'No conversations yet. Start one with + New conversation.') + '</div>';
      el.threads.scrollTop = listTop;
      var th = D.threads.filter(function (t) { return t.id === S.sel; })[0];
      if (!th) { el.head.innerHTML = ''; el.msgs.innerHTML = '<div class="in-empty">Pick a conversation.</div>'; el.side.innerHTML = ''; el.form.hidden = true; return; }
      el.form.hidden = false;
      el.head.innerHTML = '<span class="av lg">' + esc(ini(th.client)) + '</span><div class="hd"><div class="serif nm">' + esc(th.client) + '</div><div class="faint tiny">Client · ' + esc(th.street) + '</div></div>' +
        '<button type="button" class="lh-btn" data-act="delete">Delete</button>';
      var nearBottom = el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight < 80, first = !el.msgs.dataset.thread || el.msgs.dataset.thread !== th.id;
      var h = '', lastDay = '';
      D.messages.forEach(function (m) {
        var d = fmt.dayKey(m.sent_at); if (d !== lastDay) { h += '<div class="in-day">' + esc(dayLabel(m.sent_at)) + '</div>'; lastDay = d; }
        var att = (m.attachments || []).map(function (a) {
          var url = D.urls[a.path] || '', img = /^image\//.test(a.mime || '');
          return img ? '<a class="in-img" href="' + esc(url) + '" target="_blank" rel="noopener"><img alt="' + esc(a.name || 'Photo') + '" src="' + esc(url) + '"></a>' : '<a class="in-file" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(((a.mime || '').split('/')[1] || 'file').toUpperCase()) + ' · ' + esc(a.name || 'File') + '</a>';
        }).join('');
        h += '<div class="in-m ' + (m.is_mine ? 'me' : 'them') + '"><div class="bub">' + att + (m.body ? '<div class="tx2">' + esc(m.body) + '</div>' : '') + '</div><div class="ts">' + esc(time12(m.sent_at)) + '</div></div>';
      });
      el.msgs.innerHTML = h || '<div class="in-empty">No messages yet. Say hello.</div>';
      el.msgs.dataset.thread = th.id;
      if (first || nearBottom) el.msgs.scrollTop = el.msgs.scrollHeight;
      el.side.innerHTML = '<h3 class="lh-card-title">Project</h3><div class="serif" style="font-size:max(14.72px, 1rem);margin-top:0.875rem">' + esc(th.street) + '</div><div class="faint tiny" style="margin-top:0.25rem">' + esc([th.stage, th.pct + '%'].filter(Boolean).join(' · ')) + '</div><div class="bar" style="margin-top:0.75rem"><i style="width:' + Math.min(100, th.pct) + '%"></i></div>' +
        '<div class="cap" style="margin:1.375rem 0 0.25rem">Shared files</div>' + (D.docs.length ? D.docs.map(function (d) { var ext = DOC_EXT[d.mime_type] || (String(d.title).split('.').pop() || 'FILE').slice(0, 4).toUpperCase(); return '<div class="sf-card"><div class="sf-top"><span class="ico">' + esc(ext) + '</span><div class="sf-tx"><span class="n" title="' + esc(d.title) + '">' + esc(d.title) + '</span><span class="faint tiny">' + esc(fmt.date(fmt.dayKey(d.created_at))) + (d.size_bytes ? ' · ' + (d.size_bytes >= 1048576 ? (d.size_bytes / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(d.size_bytes / 1024)) + ' KB') : '') + '</span></div></div><div class="sf-act"><button type="button" class="lh-btn sm" data-sf-open="' + d.id + '">Open</button><button type="button" class="lh-btn sm" data-sf-dl="' + d.id + '">Download</button></div></div>'; }).join('') : '<div class="faint tiny" style="padding:0.5rem 0">Nothing shared yet.</div>') +
        '<a class="lh-btn" style="margin-top:1.125rem;width:100%" href="#/projects/' + th.project + '">Open project</a>';
    }

    async function send(text, file) {
      var th = D.threads.filter(function (t) { return t.id === S.sel; })[0]; if (!th) return;
      var btn = LH.$('#inSend', view); btn.disabled = true;
      try {
        if (file) {
          var ext = (file.name.split('.').pop() || '').toLowerCase(), mime = MIMES[ext];
          if (!mime) throw new Error('Only PDF, JPG, PNG and WebP files can be sent.');
          if (file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.');
          var path = th.project + '/' + Date.now() + '.' + ext;
          var up = await LH.sb.storage.from('message-attachments').upload(path, file, { contentType: mime }); if (up.error) throw up.error;
          var ins = await LH.sb.from('messages').insert({ project_id: th.project, thread_id: th.id, attachments: [{ path: path, name: file.name, mime: mime, size: file.size }] });
          if (ins.error) { await LH.sb.storage.from('message-attachments').remove([path]); throw ins.error; }
        }
        if (text) { var r = await LH.sb.from('messages').insert({ project_id: th.project, thread_id: th.id, body: text }); if (r.error) throw r.error; }
        await refresh(); el.msgs.scrollTop = el.msgs.scrollHeight;
      } catch (e) { console.error(e); UI.toast(LH.errMsg(e), 'error'); }
      btn.disabled = false;
    }

    async function sharedFile(id, download) {
      var d = D.docs.filter(function (x) { return x.id === id; })[0]; if (!d) return;
      var res = await LH.sb.storage.from('project-documents').createSignedUrl(d.storage_path, 300, download ? { download: d.title } : undefined);
      if (res.error || !res.data) { UI.toast('Couldn\'t open that file.', 'error'); return; }
      if (download) { var a = document.createElement('a'); a.href = res.data.signedUrl; a.download = d.title; document.body.appendChild(a); a.click(); a.remove(); } else window.open(res.data.signedUrl, '_blank', 'noopener');
    }
    async function onClick(e) {
      var t = e.target.closest('[data-thread],[data-filter],[data-act],[data-sf-open],[data-sf-dl],#inAttach'); if (!t) return;
      if (t.hasAttribute('data-sf-open')) { sharedFile(t.getAttribute('data-sf-open'), false); return; }
      if (t.hasAttribute('data-sf-dl')) { sharedFile(t.getAttribute('data-sf-dl'), true); return; }
      if (t.id === 'inAttach') { el.file.click(); return; }
      if (t.hasAttribute('data-thread')) { S.sel = t.getAttribute('data-thread'); history.replaceState(null, '', '#/inbox/' + S.sel); refresh(); return; }
      if (t.hasAttribute('data-filter')) { S.filter = t.getAttribute('data-filter'); paint(); return; }
      var a = t.getAttribute('data-act');
      if (a === 'readall') {
        var un = D.threads.filter(function (x) { return x.unread > 0; });
        if (!un.length) { UI.toast('Everything is already read.'); return; }
        await Promise.all(un.map(function (x) { return LH.sb.rpc('mark_thread_read', { p_thread_id: x.id }); }));
        un.forEach(function (x) { x.unread = 0; }); paint(); UI.toast('All read.'); return;
      }
      if (a === 'delete') {
        var th = D.threads.filter(function (x) { return x.id === S.sel; })[0]; if (!th) return;
        if (!(await UI.confirm('Delete the conversation with ' + th.client + '? It disappears from the app for them too, and new messages start a fresh one.', { title: 'Delete conversation', yes: 'Delete', danger: true }))) return;
        var r = await LH.sb.rpc('delete_conversations', { p_thread_ids: [th.id] });
        if (r.error) { UI.toast(LH.errMsg(r.error), 'error'); return; }
        S.sel = null; history.replaceState(null, '', '#/inbox'); UI.toast('Conversation deleted.'); refresh(); return;
      }
      if (a === 'new') {
        var have = {}; D.threads.forEach(function (x) { have[x.project] = 1; });
        var free = (D.projects || []).filter(function (p) { return !have[p.id]; });
        if (!free.length) { UI.toast('Every project already has a conversation.'); return; }
        UI.form({
          title: 'New conversation', intro: 'Starts a thread with the client of this project.', submitLabel: 'Start',
          fields: [{ name: 'project', label: 'Project', type: 'select', options: free.map(function (p) { return { v: p.id, l: (p.site_street || 'Project') + ((one(p.clients) || {}).name ? ' · ' + one(p.clients).name : '') }; }), required: true, span: 2 }],
          onSubmit: async function (v) { var r = await LH.sb.rpc('start_conversation', { p_project_id: v.project }); if (r.error) throw r.error; S.sel = r.data; },
        }).then(function (ok) { if (ok) { history.replaceState(null, '', '#/inbox/' + S.sel); refresh(); setTimeout(function () { el.text.focus(); }, 300); } });
      }
    }
    function onInput(e) { if (e.target.id === 'inQ') { S.q = e.target.value; paint(); } }
    function onSubmit(e) { if (e.target.id !== 'inForm') return; e.preventDefault(); var v = el.text.value.trim(); if (!v) return; el.text.value = ''; send(v, null); }
    function onFile(e) { if (e.target.id !== 'inFile' || !e.target.files.length) return; var f = e.target.files[0]; e.target.value = ''; send(el.text.value.trim(), f); el.text.value = ''; }
    view.addEventListener('click', onClick); view.addEventListener('input', onInput); view.addEventListener('submit', onSubmit); view.addEventListener('change', onFile);

    return { watch: ['messages', 'message_threads', 'thread_reads', 'projects', 'project_documents', 'project_stages'], refresh: refresh, fast: true, pollMs: 8000,
      destroy: function () { destroyed = true; view.classList.remove('enter', 'fit'); view.removeEventListener('click', onClick); view.removeEventListener('input', onInput); view.removeEventListener('submit', onSubmit); view.removeEventListener('change', onFile); } };
  }

  LH.screens.inbox = { title: 'Inbox', render: render };
})();
