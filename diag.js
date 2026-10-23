// Classic (non-module) script: shows a readable error instead of an endless "Loading…".
(function () {
  var shown = false;
  function show(msg) {
    if (shown) return; shown = true;
    var el = document.getElementById('app'); if (!el) return;
    el.innerHTML = '<div class="wrap"><div class="card"><h2>Something went wrong</h2>' +
      '<p style="word-break:break-word">' + String(msg).replace(/[<>&]/g, '') + '</p>' +
      '<p class="muted">Page: ' + location.href.replace(/[<>&]/g, '') + '</p></div></div>';
  }
  window.__quizReady = false;
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window && (e.target.src || e.target.href)) show('Could not load file: ' + (e.target.src || e.target.href) + ' (check the file exists at that path in your repository)');
    else show(e.message || 'Script error');
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    show((e.reason && e.reason.message) || e.reason || 'Unhandled error');
  });
  setTimeout(function () {
    if (!window.__quizReady) show('The game is taking too long to start. Most likely it cannot reach Firebase (check config.js, the databaseURL, your internet connection) or a file is missing.');
  }, 10000);
})();
