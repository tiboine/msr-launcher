/* MSR Launcher — grensesnitt */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let api = null;       // window.pywebview.api, eller en etterligning i nettleser
  let state = null;

  // ---------- klokke ----------
  function tick() {
    const now = new Date();
    $("time").textContent = now.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
    $("date").textContent = now.toLocaleDateString("nb-NO", { weekday: "long", day: "numeric", month: "long" });
  }
  tick();
  setInterval(tick, 5000);

  // ---------- toast ----------
  let toastTimer;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  // ---------- tegning ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function isImage(icon) {
    return /^(https?:|data:|\.{0,2}\/)|\.(png|svg|jpe?g|webp)$/i.test(icon || "");
  }

  const ICONS = window.MSR_ICONS || { list: {}, svg: () => null };
  const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // Ikon: navn fra ikonsettet → SVG, adresse → bilde, ellers emoji/bokstav
  function iconNode(app, cls) {
    const box = el("div", cls);
    const svg = ICONS.svg(app.icon);
    if (svg) box.innerHTML = svg;
    else if (isImage(app.icon)) {
      const img = document.createElement("img");
      img.src = app.icon; img.alt = "";
      box.appendChild(img);
    } else box.textContent = app.icon || (app.name || "?").charAt(0).toUpperCase();
    return box;
  }

  function tile(app, i) {
    const b = el("button", "tile");
    b.type = "button";
    b.style.setProperty("--i", i);
    if (app.color) b.style.setProperty("--c", app.color);
    if (app.size === "large") b.classList.add("large");
    if (!app.available) b.classList.add("missing");

    // Stort, svakt vannmerke (bare for ikoner fra ikonsettet)
    const mark = ICONS.svg(app.icon, "mark");
    if (mark) b.insertAdjacentHTML("beforeend", mark);

    b.appendChild(iconNode(app, "badge-icon"));
    const chips = el("div", "chips");
    if (!app.available) chips.appendChild(el("span", "chip", "Ikke installert"));
    else if (app.kind === "url") chips.appendChild(el("span", "chip web", "På nett"));
    if (chips.childNodes.length) b.appendChild(chips);

    const text = el("div", "text");
    text.appendChild(el("div", "name", app.name));
    if (app.description) text.appendChild(el("div", "desc", app.description));
    b.appendChild(text);
    if (app.available) b.insertAdjacentHTML("beforeend", '<span class="go">' + ARROW + "</span>");

    b.addEventListener("click", () => launch(app, b));
    return b;
  }

  // Velg antall kolonner/rader så flisene fyller skjermen uten å bli for flate
  function layout() {
    const grid = $("grid");
    const tiles = [...grid.children];
    if (!tiles.length) return;
    const main = $("main");
    const cs = getComputedStyle(main);
    const W = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
    const large = tiles.filter((t) => t.classList.contains("large")).length;
    const n = tiles.length;

    let best = null;
    for (let cols = 1; cols <= 6; cols++) {
      const useLarge = cols >= 3 && large > 0;
      const cells = n + (useLarge ? large * 3 : 0);
      let rows = Math.ceil(cells / cols);
      if (useLarge) rows = Math.max(rows, 2);
      const cw = (W - gap * (cols - 1)) / cols;
      const ch = (H - gap * (rows - 1)) / rows;
      if (cw < 200) continue;
      const empty = rows * cols - cells;
      // mål: litt bredere enn høye fliser, få tomme felt, ikke for lave
      const score = Math.abs(Math.log((cw / ch) / 1.35)) + empty * 0.18 + (ch < 160 ? 5 : 0);
      if (!best || score < best.score) best = { cols, rows, ch, useLarge, score };
    }
    if (!best) best = { cols: 1, rows: n, ch: 160, useLarge: false };

    const scroll = best.ch < 160;
    grid.classList.toggle("scroll", scroll);
    grid.style.setProperty("--cols", best.cols);
    grid.style.gridTemplateRows = scroll ? "" : `repeat(${best.rows}, minmax(0, 1fr))`;
    grid.style.gridAutoFlow = "row dense";
    const rowH = scroll ? 180 : best.ch;
    tiles.forEach((t) => {
      if (!best.useLarge) t.classList.remove("large");
      else if (t.dataset.large) t.classList.add("large");
      t.classList.toggle("compact", rowH < 230 && !t.classList.contains("large"));
    });
  }
  let layoutTimer;
  window.addEventListener("resize", () => { clearTimeout(layoutTimer); layoutTimer = setTimeout(layout, 60); });

  function render() {
    if (!state) return;
    document.title = state.title;
    $("subtitle").textContent = state.subtitle || state.title;

    const bg = $("bg");
    if (state.background) {
      bg.style.backgroundImage = `url("${state.background.replace(/"/g, "")}")`;
      bg.classList.add("has-image");
    } else {
      bg.style.backgroundImage = "";
      bg.classList.remove("has-image");
    }

    const msgs = $("messages");
    msgs.replaceChildren(...(state.messages || []).map((m) =>
      el("div", "msg" + (m.type === "warning" ? " warning" : ""), m.text)));

    const hours = $("hours");
    hours.replaceChildren();
    (state.hours || []).forEach((h) => {
      const line = el("div");
      line.appendChild(el("b", null, h.label + " "));
      line.appendChild(document.createTextNode(h.time));
      hours.appendChild(line);
    });

    // Flisene i samme rekkefølge som i WP-admin
    const grid = $("grid");
    grid.replaceChildren(...state.apps.map((a, i) => {
      const t = tile(a, i);
      if (a.size === "large") t.dataset.large = "1";
      return t;
    }));
    requestAnimationFrame(layout);

    const src = { nett: "", "lokal kopi": " · uten nett (lokal kopi)", innebygd: " · standardoppsett" }[state.source] || "";
    $("meta").textContent = (state.machine || "") + src;
  }

  // ---------- handlinger ----------
  async function launch(app, btn) {
    if (!app.available) {
      toast(`${app.name} er ikke installert på denne maskinen`);
      return;
    }
    btn.classList.add("starting");
    setTimeout(() => btn.classList.remove("starting"), 2500);
    const r = await api.launch(app.id);
    if (!r || !r.ok) toast((r && r.error) || "Noe gikk galt");
  }

  $("btn-desktop").addEventListener("click", () => api.hide());

  // ---------- admin (hold inne logoen i 3 sek) ----------
  let holdTimer;
  const logo = $("logo");
  const startHold = () => {
    if (!state || !state.admin_enabled) return;
    holdTimer = setTimeout(openAdmin, 3000);
  };
  const stopHold = () => clearTimeout(holdTimer);
  logo.addEventListener("pointerdown", startHold);
  ["pointerup", "pointerleave", "pointercancel"].forEach((e) => logo.addEventListener(e, stopHold));

  function openAdmin() {
    $("pin").value = "";
    $("pin-err").hidden = true;
    $("admin").hidden = false;
    $("pin").focus();
  }
  const closeAdmin = () => { $("admin").hidden = true; };
  $("adm-cancel").addEventListener("click", closeAdmin);

  async function withPin(fn) {
    const r = await api.check_pin($("pin").value);
    if (!r.ok) { $("pin-err").hidden = false; return; }
    await fn();
  }
  $("adm-reload").addEventListener("click", () => withPin(async () => {
    state = await api.reload();
    render();
    closeAdmin();
    toast("Oppsettet er hentet på nytt");
  }));
  $("adm-quit").addEventListener("click", () => withPin(() => api.quit($("pin").value)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAdmin();
    if (e.key === "Enter" && !$("admin").hidden) $("adm-quit").focus();
  });

  // Kalles fra Python
  window.msrOnShow = () => { closeAdmin(); main && main.scrollTo({ top: 0 }); };
  window.msrRefresh = async () => { state = await api.get_state(); render(); };
  const main = document.querySelector("main");

  // ---------- oppstart ----------
  async function boot(realApi) {
    api = realApi;
    state = await api.get_state();
    render();
  }

  // Forhåndsvisning i vanlig nettleser (uten Python).
  //   ?draft=1          → ulagrede endringer fra WP-admin (localStorage)
  //   ?config=<adresse> → lagret oppsett fra nettsiden
  //   ellers            → eksempel-oppsettet
  function mockApi() {
    const params = new URLSearchParams(location.search);
    const load = async () => {
      if (params.get("draft")) {
        try {
          const d = localStorage.getItem("msrl-draft");
          if (d) return JSON.parse(d);
        } catch (e) { /* faller tilbake */ }
      }
      const src = params.get("config") || "../config.example.json";
      return (await fetch(src, { cache: "no-store" })).json();
    };
    const get = async () => {
      const cfg = await load();
      return {
        ...cfg,
        apps: (cfg.apps || []).filter((a) => !a.hidden).map((a) => ({
          ...a, kind: a.url ? "url" : "cmd", available: a.url ? true : !!(a.cmd && a.cmd.linux),
        })).filter((a) => a.kind === "url" || a.available),
        machine: "Forhåndsvisning (Linux)", source: "nett", admin_enabled: true,
      };
    };
    return {
      get_state: get, reload: get,
      launch: async (id) => { toast("Ville startet: " + id); return { ok: true }; },
      hide: async () => toast("Ville vist skrivebordet"),
      check_pin: async () => ({ ok: true }),
      quit: async () => toast("Ville avsluttet"),
    };
  }

  if (window.pywebview && window.pywebview.api) boot(window.pywebview.api);
  else {
    let booted = false;
    window.addEventListener("pywebviewready", () => { booted = true; boot(window.pywebview.api); });
    setTimeout(() => { if (!booted && !window.pywebview) boot(mockApi()); }, 800);
  }
})();
