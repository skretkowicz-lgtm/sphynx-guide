// Which language a page opens in.
//
// Shared by all four pages rather than inlined per page, because the one
// thing worse than guessing wrong is guessing differently: a visitor who
// lands on a Polish homepage and then an English login page would
// reasonably conclude the site is broken.
//
// index.html still owns its own toggle wiring — it shipped first and
// carries the contact form — but the decision itself lives here.
(function () {
  window.SPHYNX_LANG_KEY = 'sphynx-lang';

  // An explicit choice always wins. Failing that the browser decides.
  //
  // Every visitor used to start on English. This practice's clients are
  // mostly Polish, so that put the burden of noticing a two-letter toggle
  // on precisely the people least likely to go looking for one — and since
  // the contact form sends the current language to the server, it also
  // decided which language their confirmation email came back in.
  window.preferredLang = function () {
    try {
      var saved = window.localStorage.getItem(window.SPHYNX_LANG_KEY);
      if (saved === 'en' || saved === 'pl') return saved;
    } catch (e) {
      // Private browsing can throw on read. Fall through to the browser's
      // own setting rather than failing to render a language at all.
    }
    // navigator.languages is the ordered list the visitor actually
    // configured; navigator.language is only the top one, and older
    // browsers have just that.
    var tags = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < tags.length; i++) {
      // Primary subtag only — pl, pl-PL and pl-pl are one language.
      var primary = String(tags[i]).toLowerCase().split('-')[0];
      // The ORDER matters, so both languages are tested at each position
      // rather than scanning for Polish first. Someone whose list reads
      // en-US, pl-PL prefers English and happens to also read Polish;
      // returning Polish there would override a stated preference.
      if (primary === 'pl') return 'pl';
      if (primary === 'en') return 'en';
    }
    return 'en';
  };

  // Records a deliberate choice. Only ever called from the toggle: storing
  // the auto-detected value too would make a guess indistinguishable from a
  // decision, and the guess would then outlive the browser setting that
  // produced it.
  window.rememberLang = function (lang) {
    try {
      window.localStorage.setItem(window.SPHYNX_LANG_KEY, lang);
    } catch (e) {
      // Private mode can throw on write. The page still works; the choice
      // just will not survive to the next page.
    }
  };
})();
