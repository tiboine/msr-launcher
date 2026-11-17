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

  function tile(app) {
    const b = el("button", "tile");
    b.type = "button";
    if (app.color) b.style.setProperty("--c", app.color);
    if (app.kind === "url") b.classList.add("web");
    if (!app.available) b.classList.add("missing");

    const icon = el("div", "icon");
    if (isImage(app.icon)) {
      const img = document.createElement("img");
      img.src = app.icon; img.alt = "";
      icon.appendChild(img);
    } else {
      icon.textContent = app.icon || (app.name || "?").charAt(0);
    }
    b.appendChild(icon);
    b.appendChild(el("div", "name", app.name));
    if (app.description) b.appendChild(el("div", "desc", app.description));
    if (!app.available) b.appendChild(el("div", "badge", "Ikke installert"));
    else if (app.kind === "url") b.appendChild(el("div", "badge", "på nett"));

    b.addEventListener("click", () => launch(app, b));
    return b;
  }

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

    // Grupper i kategorier (i den rekkefølgen de står i oppsettet)
    const cats = (state.categories || []).slice();
    const known = new Set(cats.map((c) => c.id));
    if (state.apps.some((a) => !known.has(a.category))) cats.push({ id: null, name: "Andre" });

    const sections = $("sections");
    sections.replaceChildren();
    cats.forEach((c) => {
      const apps = state.apps.filter((a) => (c.id === null ? !known.has(a.category) : a.category === c.id));
      if (!apps.length) return;
      const s = el("section", "section");
      s.appendChild(el("h2", null, c.name));
      const g = el("div", "grid");
      apps.forEach((a) => g.appendChild(tile(a)));
      s.appendChild(g);
      sections.appendChild(s);
    });

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
