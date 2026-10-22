/** Inline SVG icons for the shell (no external icon pack). */

/** @param {string} path @param {{ size?: number }} [opts] */
function svg(path, { size = 20 } = {}) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export const icons = {
  dashboard: () => svg('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
  admin: () => svg('<path d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/><path d="M4 21v-1a6 6 0 0 1 6-6h4"/><path d="M16 16.5l1.6 1.6L21 15"/>'),
  users: () => svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
  user: () => svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  settings: () => svg('<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'),
  lock: () => svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  logout: () => svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
  menu: () => svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  panel: () => svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>'),
  chevron: () => svg('<path d="M6 9l6 6 6-6"/>', { size: 16 }),
  plus: () => svg('<path d="M12 5v14M5 12h14"/>'),
  refresh: () => svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
  close: () => svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  sun: () => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>'),
  moon: () => svg('<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a7 7 0 0 0 11.5 11.5z"/>'),
  camera: () => svg('<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  library: () => svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  folder: () => svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  training: () => svg('<path d="M2 8l10-4 10 4-10 4z"/><path d="M6 10.5V16c0 1.8 2.4 3 6 3s6-1.2 6-3v-5.5"/>'),
  invoice: () => svg('<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  shield: () => svg('<path d="M12 3l8 3v6c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6z"/>'),
  activity: () => svg('<path d="M4 19V5M4 19h16"/><path d="M8 15l3-4 3 2 4-6"/>'),
  archive: () => svg('<path d="M3 6h18v3H3z"/><path d="M5 9v10h14V9"/><path d="M10 13h4"/>')
};
