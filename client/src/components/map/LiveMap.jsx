import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BusFront, Clock, LocateFixed, MapPin, Siren, X } from 'lucide-react';

// ── Bus marker: Lucide "bus-front" as static SVG in a blue disc ────────
const BUS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" '
  + 'stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  + '<path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/>'
  + '<path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 21v-2"/></svg>';
const busIcon = L.divIcon({
  className: 'transtrack-bus-icon',
  html: `<div class="bus-marker">${BUS_SVG}</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

// ── Smooth GPS interpolation between incoming positions ────────────────
function useInterpolatedPosition(position) {
  const [display, setDisplay] = useState(position);
  const animRef = useRef(null);

  useEffect(() => {
    if (!position) return;
    // Fresh position: animate from current display to the target.
    const from = display;
    const to = position;
    const start = performance.now();
    const duration = 500; // ms of smooth easing

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay({
        lat: from.lat + (to.lat - from.lat) * eased,
        lng: from.lng + (to.lng - from.lng) * eased,
      });
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  return display;
}

// ── Center-on-bus helper (uses the map context) ────────────────────────
function CenterControl({ target, onCenter }) {
  const map = useMap();
  useEffect(() => {
    if (onCenter) onCenter(() => {
      if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    });
  }, [target, map, onCenter]);
  return null;
}

// ── Small helper to derive status + ETA text ───────────────────────────
function deriveStatus(position) {
  if (!position) return { label: 'No signal', tone: 'neutral' };
  return { label: 'En Route', tone: 'success' };
}

export default function LiveMap({
  position = null,
  label = 'Bus',
  pickupPoints = [],
  driverName = '—',
  routePolyline = [],
  emergency = null,
  delay = null,
  onBusClick = null,
}) {
  const [simulate, setSimulate] = useState(false);
  const [simPos, setSimPos] = useState(null);
  const [centerBus, setCenterBus] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSelected(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);
  const lastPosRef = useRef(null);
  const lastTimeRef = useRef(null);

  // Simulation mode: move the bus along the route polyline (or a small circle).
  useEffect(() => {
    if (!simulate) { setSimPos(null); return; }
    const pts = routePolyline.length
      ? routePolyline
      : [[-1.2921, 36.8219], [-1.285, 36.83], [-1.278, 36.838], [-1.285, 36.83], [-1.2921, 36.8219]];
    let idx = 0;
    setSimPos({ lat: pts[0][0], lng: pts[0][1] });
    const iv = setInterval(() => {
      idx = (idx + 1) % pts.length;
      setSimPos({ lat: pts[idx][0], lng: pts[idx][1] });
    }, 1200);
    return () => clearInterval(iv);
  }, [simulate, routePolyline]);

  const rawPos = simulate ? simPos : position;
  const displayPos = useInterpolatedPosition(rawPos);

  // Speed estimation from successive positions.
  useEffect(() => {
    if (!rawPos) return;
    const now = Date.now();
    if (lastPosRef.current && lastTimeRef.current) {
      const d = L.latLng(lastPosRef.current).distanceTo(L.latLng(rawPos));
      const dt = (now - lastTimeRef.current) / 1000; // seconds
      if (dt > 0) {
        const kmh = Math.round((d / 1000) / (dt / 3600));
        setSpeed(kmh);
      }
    }
    lastPosRef.current = rawPos;
    lastTimeRef.current = now;
  }, [rawPos]);

  const status = deriveStatus(rawPos);
  const defaultCenter = useMemo(() => (position ? [position.lat, position.lng] : [-1.2921, 36.8219]), [position]);

  // Build the polyline for the route if pickupPoints have coords.
  const polyline = useMemo(() => {
    if (routePolyline.length) return routePolyline;
    const pts = pickupPoints
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => [p.lat, p.lng]);
    return pts;
  }, [pickupPoints, routePolyline]);

  return (
    <div className="relative w-full h-[520px] sm:h-[560px] rounded-2xl overflow-hidden shadow-lg border border-slate-200">
      {/* Simulation toggle */}
      <div className="absolute top-4 right-4 z-[400]">
        <button
          onClick={() => setSimulate((s) => !s)}
          className={`min-h-[48px] px-4 rounded-xl font-medium text-sm shadow border transition-colors ${
            simulate
              ? 'bg-indigo-600 text-white border-indigo-700'
              : 'bg-white/90 text-slate-700 border-slate-200'
          }`}
        >
          {simulate ? 'Live Mode' : 'Simulate'}
        </button>
      </div>

{/* Center-on-bus button */}
      {rawPos && (
        <button
          onClick={() => centerBus && centerBus()}
          aria-label="Center on bus"
          className="absolute bottom-4 right-4 z-[400] min-w-12 min-h-12 flex items-center justify-center rounded-lg bg-card shadow-md border border-border text-link hover:bg-muted"
        >
          <LocateFixed size={22} />
        </button>
      )}

      {/* Emergency / delay banner */}
      {(emergency || delay) && (
        <div className="absolute top-4 left-4 right-16 z-[400] pointer-events-none">
          {emergency && (
            <div role="alert" className="mb-2 rounded-lg bg-red-600 text-white px-4 py-3 shadow-lg flex items-center gap-2 text-sm font-semibold">
              <Siren size={18} aria-hidden="true" /> {emergency}
            </div>
          )}
          {delay && (
            <div role="status" className="rounded-lg bg-amber-400 text-black px-4 py-3 shadow-lg flex items-center gap-2 text-sm font-semibold">
              <Clock size={18} aria-hidden="true" /> {delay}
            </div>
          )}
        </div>
      )}

      {/* Click-on-bus detail modal */}
      {selected && (
        <div className="absolute inset-0 z-[500] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setSelected(false)} aria-hidden="true" />
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
            role="dialog" aria-modal="true" aria-label={`Bus ${label}`}
            className="relative glass-card w-full max-w-sm p-5 shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-primary-600 text-white flex items-center justify-center" aria-hidden="true"><BusFront size={22} /></div>
                <div>
                  <p className="font-bold text-gray-800 dark:text-gray-100">{label}</p>
                  <p className="text-xs text-gray-400">License plate</p>
                </div>
              </div>
              <button type="button" onClick={() => setSelected(false)} className="icon-btn -mr-2" aria-label="Close" autoFocus><X size={20} aria-hidden="true" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Driver</p>
                <p className="font-medium text-gray-800 dark:text-gray-100 truncate">{driverName}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Speed</p>
                <p className="font-medium text-gray-800 dark:text-gray-100">{speed} km/h</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">ETA</p>
                <p className="font-medium text-gray-800 dark:text-gray-100">~{rawPos ? Math.max(5, Math.round(speed ? 40 / Math.max(speed, 10) : 20)) : '—'} min</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className={`font-medium ${status.tone === 'success' ? 'text-emerald-600' : 'text-gray-500'}`}>{status.label}</p>
              </div>
            </div>

            {onBusClick && (
              <button onClick={() => { onBusClick(); setSelected(false); }} className="btn-primary w-full mt-4">
                Center on Bus
              </button>
            )}
          </motion.div>
        </div>
      )}

      <MapContainer center={defaultCenter} zoom={14} className="w-full h-full z-0">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Route polyline */}
        {polyline.length > 1 && (
          <Polyline positions={polyline} pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.7 }} />
        )}

        {/* Pickup point markers */}
        {pickupPoints
          .filter((p) => p.lat != null && p.lng != null)
          .map((p, i) => (
            <Marker key={p.id || i} position={[p.lat, p.lng]}>
              <Popup>
                <div className="p-1 text-sm font-medium">Stop: {p.name || `Stop ${i + 1}`}</div>
              </Popup>
            </Marker>
          ))}

{/* Animated bus marker */}
        {displayPos && (
          <Marker
            position={[displayPos.lat, displayPos.lng]}
            icon={busIcon}
            eventHandlers={{ click: () => setSelected(true) }}
          >
            <Popup>
              <div className="p-2 min-w-[150px]">
                <h3 className="font-bold text-base text-slate-900 mb-1">{label}</h3>
                <div className="text-xs text-slate-600">Tap the bus for details</div>
              </div>
            </Popup>
          </Marker>
        )}

        <CenterControl target={rawPos} onCenter={setCenterBus} />
      </MapContainer>

      {/* Details bottom card */}
      <div className="absolute bottom-4 left-4 right-4 sm:right-16 z-[400]">
        <div className="glass-card p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 shrink-0 rounded-lg bg-primary-600 text-white flex items-center justify-center" aria-hidden="true">
                <BusFront size={22} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-gray-800 dark:text-gray-100 truncate">{label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Driver: {driverName}</p>
              </div>
            </div>
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                status.tone === 'success'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${status.tone === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
              {status.label}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2.5">
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{speed} <span className="text-xs font-medium">km/h</span></p>
              <p className="text-xs text-muted-foreground">Speed</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2.5">
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{rawPos ? '~' : '—'}{rawPos ? Math.max(5, Math.round(speed ? 40 / Math.max(speed, 10) : 20)) : '—'}<span className="text-xs font-medium">m</span></p>
              <p className="text-xs text-muted-foreground">ETA</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-2.5">
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{pickupPoints.length}</p>
              <p className="text-xs text-muted-foreground">Stops</p>
            </div>
          </div>

          {pickupPoints.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pickupPoints.slice(0, 5).map((p, i) => (
                <span key={p.id || i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300">
                  <MapPin size={12} /> {p.name || `Stop ${i + 1}`}
                </span>
              ))}
              {pickupPoints.length > 5 && (
                <span className="px-2 py-1 rounded-lg text-[11px] font-medium bg-gray-100 dark:bg-white/10 text-gray-500">
                  +{pickupPoints.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
