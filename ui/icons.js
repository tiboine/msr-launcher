/* MSR-ikoner — enkle strekikoner (24×24), tegnet for launcheren.
   Brukes som "icon": "<navn>" i oppsettet. Delt mellom launcheren og WP-admin. */
(function (g) {
  "use strict";
  const I = {
    printer: { label: "3D-printer", d:
      '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 8h18"/><path d="M10 8v3h4V8"/><path d="M11 11l1 1.6 1-1.6"/><path d="M6.5 18h11"/><rect x="9" y="14.5" width="6" height="3.5" rx=".6"/>' },
    cube: { label: "Kube / 3D", d:
      '<path d="M12 2.8l8.2 4.6v9.2L12 21.2l-8.2-4.6V7.4z"/><path d="M3.8 7.4L12 12l8.2-4.6"/><path d="M12 12v9.2"/>' },
    bricks: { label: "Klosser", d:
      '<rect x="3" y="13" width="18" height="7" rx="1.5"/><rect x="6" y="6" width="12" height="7" rx="1.5"/><path d="M7.5 13v-1.5M11 13v-1.5M14.5 13v-1.5M9.5 6V4.5M14.5 6V4.5"/>' },
    laser: { label: "Laser", d:
      '<rect x="7" y="2.5" width="10" height="6" rx="1.5"/><path d="M12 8.5v7" stroke-dasharray="1.6 1.6"/><path d="M3.5 20.5h17"/><path d="M12 15.5l-2.6-1.8M12 15.5l2.6-1.8M12 15.5l-3 1.6M12 15.5l3 1.6"/>' },
    pen: { label: "Tegning", d:
      '<path d="M4 20l1.2-4.3L15.8 5.1a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8L8.3 18.8z"/><path d="M13.8 7.1l3.1 3.1"/><path d="M4 20h7"/>' },
    vinyl: { label: "Vinylkutter", d:
      '<circle cx="6.5" cy="7" r="2.8"/><circle cx="6.5" cy="17" r="2.8"/><path d="M8.6 8.8L20 18M8.6 15.2L20 6"/>' },
    code: { label: "Kode", d:
      '<path d="M8 7l-5 5 5 5"/><path d="M16 7l5 5-5 5"/><path d="M13.5 4.5l-3 15"/>' },
    terminal: { label: "Python / terminal", d:
      '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5"/><path d="M12.5 15h4.5"/>' },
    blocks: { label: "Kodeklosser", d:
      '<path d="M4 4h6v2.2a1.3 1.3 0 0 0 2.6 0V4H20v7H4z"/><path d="M4 13h9v2.2a1.3 1.3 0 0 0 2.6 0V13H20v7H4z"/>' },
    chip: { label: "Elektronikk", d:
      '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>' },
    globe: { label: "Nettleser", d:
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>' },
    folder: { label: "Filer", d:
      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10.5h18"/>' },
    image: { label: "Bilde", d:
      '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-10 9"/>' },
    music: { label: "Lyd", d:
      '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>' },
    video: { label: "Video", d:
      '<rect x="3" y="5.5" width="13" height="13" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3z"/>' },
    game: { label: "Spill", d:
      '<path d="M7 7h10a5 5 0 0 1 4.8 6.3l-.8 3a2.6 2.6 0 0 1-4.5 1L14.8 15H9.2l-1.7 2.3a2.6 2.6 0 0 1-4.5-1l-.8-3A5 5 0 0 1 7 7z"/><path d="M8 10v3M6.5 11.5h3"/><circle cx="15.5" cy="10.8" r=".6"/><circle cx="17.3" cy="12.6" r=".6"/>' },
    sparkle: { label: "Annet", d:
      '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>' },
  };

  function svg(name, cls) {
    const ic = I[name];
    if (!ic) return null;
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic.d + "</svg>";
  }

  g.MSR_ICONS = { list: I, svg };
})(window);
