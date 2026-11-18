/* Screens still to come: each is built, tested and signed off one at a time. */
(function () {
  'use strict';
  var LH = window.LH;
  var COMING = {
    leads: 'Leads', projects: 'Projects', schedule: 'Schedule', contractors: 'Contractors',
    inbox: 'Inbox', reports: 'Reports', settings: 'Settings',
  };
  Object.keys(COMING).forEach(function (id) {
    if (LH.screens[id]) return;
    LH.screens[id] = {
      title: COMING[id],
      render: function (view) {
        view.innerHTML = '<div class="lh-card soon"><div class="cap" style="margin-bottom:14px">Coming next</div><h2>' + COMING[id] + '</h2>' +
          '<p class="muted">This screen is being built. For now, use the app for ' + COMING[id].toLowerCase() + '.</p></div>';
      },
    };
  });
})();
