// Deployment settings. Locally nothing here needs changing.
(function () {
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Folder this site is served from ('/' locally and on Vercel).
  window.BASE = new URL('./', document.currentScript.src).pathname;
  // Locally the API runs on port 3001. On Vercel the page and the API share one address.
  window.API_BASE = local ? 'http://localhost:3001' : '';
  // A public site shares one GitHub quota, so it checks less often.
  window.POLL_MS = local ? 5000 : 30000;
})();
