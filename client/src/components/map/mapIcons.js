import L from 'leaflet';

// Map markers drawn with HTML/CSS (styles in index.css), so no image
// assets are needed and colours follow the bus status.

// Lucide "bus-front" as static SVG.
const BUS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" '
  + 'stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/>'
  + '<path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 21v-2"/></svg>';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const busIcons = new Map();

// status: 'moving' | 'stopped' | 'offline'; label: optional plate shown under the marker.
export function busIcon(status = 'moving', label = '', selected = false) {
  const key = `${status}|${label}|${selected}`;
  if (!busIcons.has(key)) {
    busIcons.set(key, L.divIcon({
      className: 'transtrack-bus-icon',
      html: `<div class="bus-marker bus-marker--${status}${selected ? ' bus-marker--selected' : ''}">${BUS_SVG}</div>`
        + (label ? `<div class="bus-marker-label">${escapeHtml(label)}</div>` : ''),
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -22],
    }));
  }
  return busIcons.get(key);
}

const stopIcons = {};
export function stopIcon(mine = false) {
  const key = mine ? 'mine' : 'stop';
  if (!stopIcons[key]) {
    stopIcons[key] = L.divIcon({
      className: 'transtrack-bus-icon',
      html: `<div class="stop-marker${mine ? ' stop-marker--mine' : ''}"></div>`,
      iconSize: mine ? [22, 22] : [14, 14],
      iconAnchor: mine ? [11, 11] : [7, 7],
    });
  }
  return stopIcons[key];
}

// Nairobi CBD, used when nothing has a position yet.
export const DEFAULT_CENTER = [-1.2921, 36.8219];
