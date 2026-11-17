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

  // Material 3 Expressive-former (scallop/«cookie», kløver, sol …), tegnet som polarkurver
  const SHAPES = [
    { n: 9, a: 0.07 },  // cookie 9
    { n: 4, a: 0.16 },  // kløver
    { n: 12, a: 0.045 }, // cookie 12
    { n: 6, a: 0.11 },  // blomst
    { n: 8, a: 0.08 },  // sol
    { n: 5, a: 0.13 },  // myk stjerne
  ];
  function shapePath(s) {
    let d = "";
    for (let k = 0; k <= 360; k += 2) {
      const t = (k * Math.PI) / 180;
      const r = 50 * (1 + s.a * Math.cos(s.n * t)) / (1 + s.a);
      d += (k ? "L" : "M") + (50 + r * Math.cos(t)).toFixed(2) + " " + (50 + r * Math.sin(t)).toFixed(2);
    }
    return d + "Z";
  }
  function hash(str) {
    let h = 0;
    for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  // Grafikken som dekker flisa: bilde (helt ut i kantene) eller form + stort ikon
  function art(app) {
    const box = el("div", "art");
    if (isImage(app.icon)) {
      box.classList.add("photo");
      const img = document.createElement("img");
      img.src = app.icon; img.alt = "";
      box.appendChild(img);
      return box;
    }
    const s = SHAPES[hash(app.id || app.name) % SHAPES.length];
    box.insertAdjacentHTML("beforeend",
      '<svg class="shape" viewBox="0 0 100 100" aria-hidden="true"><path d="' + shapePath(s) + '"/></svg>');
    const g = el("div", "glyph");
    const svg = ICONS.svg(app.icon);
    if (svg) g.innerHTML = svg;
    else g.appendChild(el("span", "emoji", app.icon || (app.name || "?").charAt(0).toUpperCase()));
    box.appendChild(g);
    return box;
  }

  // Material-ripple der du trykker
  function ripple(e) {
    const b = e.currentTarget;
    const r = b.getBoundingClientRect();
    const size = Math.hypot(r.width, r.height) * 2;
    const s = el("span", "ripple");
    s.style.width = s.style.height = size + "px";
    s.style.left = e.clientX - r.left - size / 2 + "px";
    s.style.top = e.clientY - r.top - size / 2 + "px";
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }

  function tile(app, i) {
    const b = el("button", "tile");
    b.type = "button";
    b.style.setProperty("--i", i);
    if (app.color) b.style.setProperty("--c", app.color);
    if (app.size === "large") b.classList.add("large");
    if (!app.available) b.classList.add("missing");

    b.appendChild(art(app));
    b.appendChild(el("span", "state"));

    if (!app.available) b.appendChild(el("span", "chip", "Ikke installert"));
    else if (app.kind === "url") b.appendChild(el("span", "chip", "På nett"));

    const label = el("div", "label");
    label.appendChild(el("div", "name", app.name));
    if (app.description) label.appendChild(el("div", "desc", app.description));
    b.appendChild(label);

    b.addEventListener("pointerdown", ripple);
    b.addEventListener("click", () => launch(app, b));
    return b;
  }

  // Størrelse på grafikken etter flisas form
  function sizeArt() {
    document.querySelectorAll(".tile").forEach((t) => {
      const w = t.clientWidth, h = t.clientHeight;
      const wide = w / h > 1.25;
      const size = wide ? Math.min(h * 1.25, w * 0.72) : Math.min(w * 0.95, h * 0.95);
      t.style.setProperty("--art", Math.round(size) + "px");
      t.classList.toggle("wide", wide);
    });
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
      t.classList.toggle("compact", rowH < 200 && !t.classList.contains("large"));
    });
    sizeArt();
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
