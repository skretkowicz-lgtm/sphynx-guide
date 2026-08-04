// Shared page chrome for login.html and profile.html: the bilingual
// language toggle plus the small helpers both pages need.
//
// index.html keeps its own inline copy on purpose — it shipped first and
// carries the contact-form logic, so it is left untouched here.
(function () {
  var root = document.documentElement;
  var langListeners = [];

  function setLang(lang) {
    root.setAttribute('data-lang', lang);
    var btnEn = document.getElementById('btn-en');
    var btnPl = document.getElementById('btn-pl');
    if (btnEn) btnEn.setAttribute('aria-pressed', String(lang === 'en'));
    if (btnPl) btnPl.setAttribute('aria-pressed', String(lang === 'pl'));
    langListeners.forEach(function (fn) { fn(lang); });
  }

  // True when the page is currently showing Polish. Content rendered from
  // data (dates, category labels) has to ask at render time, since the
  // CSS-driven <span lang="..."> mechanism only covers static markup.
  window.isPl = function () {
    return root.getAttribute('data-lang') === 'pl';
  };

  // Lets a page re-render its data-driven content when the language flips,
  // so dynamic rows don't stay in the previous language.
  window.onLangChange = function (fn) {
    langListeners.push(fn);
  };

  // Toggles only the modifier class, leaving base classes (e.g. the
  // "upload-status" hook) intact.
  window.setStatus = function (el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('status--error', 'status--success');
    if (kind) el.classList.add('status--' + kind);
  };

  function choose(lang) {
    setLang(lang);
    window.rememberLang(lang);
  }

  var btnEn = document.getElementById('btn-en');
  var btnPl = document.getElementById('btn-pl');
  if (btnEn) btnEn.addEventListener('click', function () { choose('en'); });
  if (btnPl) btnPl.addEventListener('click', function () { choose('pl'); });

  // The browser's own languages decide the first paint; see js/lang.js.
  setLang(window.preferredLang());
})();
