/* GameNet Infinity — inline SVG icon system (no dependencies, RTL-safe).
   24x24 viewBox, 1.8px stroke, round caps. Use: Icons.get('consoles') */
const Icons = (function () {
  const P = {
    consoles: '<path d="M6 9h12a4 4 0 0 1 4 4v2a4 4 0 0 1-7 2.6L13.5 16h-3L9 17.6A4 4 0 0 1 2 15v-2a4 4 0 0 1 4-4Z"/><path d="M7 12v3M5.5 13.5h3"/><circle cx="15.5" cy="12.5" r=".9" fill="currentColor" stroke="none"/><circle cx="17.8" cy="14.5" r=".9" fill="currentColor" stroke="none"/>',
    billiard: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/><path d="M10.8 11.2 12 12l1.4 1.6"/>',
    pcs: '<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M9.5 20.5h5M12 16.5v4"/>',
    cafe: '<path d="M5 9h12v5.5A4.5 4.5 0 0 1 12.5 19h-3A4.5 4.5 0 0 1 5 14.5V9Z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 5.5c0-1 .8-1 .8-2M12 5.5c0-1 .8-1 .8-2"/>',
    games: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
    customers: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.3 7.3 0 0 1 14.4 0"/>',
    customerClub: '<circle cx="12" cy="9" r="5"/><path d="M9 9.5l2 2 4-4.5"/><path d="M8.6 13.5 7 20l5-2.4L17 20l-1.6-6.5"/>',
    debts: '<rect x="3.5" y="6.5" width="17" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/>',
    reports: '<path d="M4 4v15.5h16"/><path d="M8.5 15v-4M12.5 15V7.5M16.5 15v-6.5"/>',
    instantReport: '<path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z"/>',
    monthlyReport: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    activityLog: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
    purchases: '<path d="M3.5 5.5h2l2.4 11h10.4l2.2-8H6"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    inventory: '<path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
    staff: '<circle cx="9" cy="8.5" r="3"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0"/><path d="M15.5 5.7a3 3 0 0 1 0 5.7M17.5 13.7a6.2 6.2 0 0 1 3.7 5.8"/>',
    backup: '<ellipse cx="12" cy="5.8" rx="7.5" ry="2.8"/><path d="M4.5 5.8v12.4c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.8"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
    adminPanel: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2Z"/>',
    tournaments: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H4.5a3.5 3.5 0 0 0 3.6 3.9M16 5h3.5a3.5 3.5 0 0 1-3.6 3.9"/><path d="M12 13v4M8.5 20h7M9.5 17h5"/>',
    overnight: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5 7.5 7.5 0 1 0 19.5 14.5Z"/><path d="M15.5 3.5v2.4M14.3 4.7h2.4"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    wallet: '<path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h11a2.5 2.5 0 0 1 2.5 2.5V18a2 2 0 0 1-2 2h-11a2.5 2.5 0 0 1-2.5-2.5v-10Z"/><path d="M14.5 12h.01M3.5 9.5h13"/>'
  };

  function get(name, size) {
    const s = size || 18;
    return `<svg class="svg-icon svg-${name}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || P.reports}</svg>`;
  }

  return { get, names: Object.keys(P) };
})();
