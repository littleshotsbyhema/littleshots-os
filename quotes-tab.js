/* Quotes tab — adds the quote builder (quote.html) to Studio OS without touching the
   rest of the app. Loaded after views.js and app.js; wraps their global render
   functions. The builder sits in #quoteHost, outside #root, so re-rendering the app
   never reloads it and a half-built quote survives switching tabs. */
(function () {
  const baseTabs = tabs, baseView = viewHTML, baseRender = render, baseLogin = renderLogin;

  // The tab appears right after Sales, for admins and anyone with Sales access.
  tabs = function () {
    let h = baseTabs();
    if (!canSee("crm")) return h;
    const q = tab("quote", "Quotes");
    const i = h.indexOf("A.go('crm')");
    if (i < 0) return h + q;
    const end = h.indexOf("</button>", i) + "</button>".length;
    return h.slice(0, end) + q + h.slice(end);
  };

  viewHTML = function () {
    if (S.view !== "quote") return baseView();
    return `<div class="head"><h1>Quotes</h1><span class="tag grey">Maternity</span>
      <a class="archlink" href="/quote" target="_blank" rel="noopener">Open on its own page</a></div>`;
  };

  render = function () {
    if (S.view === "quote" && !canSee("crm")) S.view = firstAllowed();
    baseRender();
    const host = $("quoteHost"), main = $("main"), on = S.view === "quote" && !!main;
    host.hidden = !on;
    if (main) main.classList.toggle("q", on);
    if (on && !$("quoteFrame").getAttribute("src")) $("quoteFrame").setAttribute("src", "/quote");
  };

  renderLogin = function () {
    $("quoteHost").hidden = true;
    $("quoteFrame").removeAttribute("src");
    return baseLogin.apply(this, arguments);
  };

  // app.js may already have drawn the shell before this file loaded
  if (S.session && S.me) render();
})();
