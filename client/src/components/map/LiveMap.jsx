import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Clock, LocateFixed, Siren } from 'lucide-react';
import { busIcon, DEFAULT_CENTER, stopIcon } from './mapIcons';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Glides the marker between updates (skipped under reduced motion).
function useGlide(position) {
  const [display, setDisplay] = useState(position);
  const fromRef = useRef(position);
  useEffect(() => {
    if (!position) { setDisplay(null); return undefined; }
    const from = fromRef.current;
    if (!from || prefersReducedMotion()) {
      fromRef.current = position;
      setDisplay(position);
      return undefined;
    }
    const start = performance.now();
    let frame;
    const step = (now) => {
      const t = Math.min(1, (now - start) / 800);
      const e = 1 - (1 - t) ** 3;
      const next = { lat: from.lat + (position.lat - from.lat) * e, lng: from.lng + (position.lng - from.lng) * e };
      fromRef.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return display;
}

// Keeps the bus in view: jumps to it on the first position, then pans
// with it until the user drags the map.
function FollowBus({ target, following, onUserMove, fitTo }) {
  const map = useMap();
  const seen = useRef(false);

  useEffect(() => {
    const stop = () => onUserMove();
    map.on('dragstart', stop);
    return () => { map.off('dragstart', stop); };
  }, [map, onUserMove]);

  useEffect(() => {
    if (!target) {
      if (!seen.current && fitTo.length > 1) map.fitBounds(fitTo, { padding: [40, 40] });
      return;
    }
    if (!seen.current) {
      seen.current = true;
      map.setView([target.lat, target.lng], Math.max(map.getZoom(), 15), { animate: false });
    } else if (following) {
      map.panTo([target.lat, target.lng], { animate: !prefersReducedMotion() });
    }
  }, [target?.lat, target?.lng, following]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Live map of one bus with its route and stops. The route follows the
// stored road line when there is one, else straight lines between stops.
// position: { lat, lng, ... } | null; status: 'moving' | 'stopped' | 'offline'
export default function LiveMap({
  position = null,
  status = 'moving',
  label = 'Bus',
  stops = [],
  geometry = null,
  myStopId = null,
  emergency = null,
  delay = null,
  className = 'h-[420px] sm:h-[520px]',
  // Optional (stop, isMine) => tooltip text, e.g. "2 · Sarit · 06:41".
  stopTooltip = null,
}) {
  const [following, setFollowing] = useState(true);
  const stopFollowing = useCallback(() => setFollowing(false), []);
  const display = useGlide(position);
  const mapped = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null), [stops]);
  const line = useMemo(
    () => (geometry?.length > 1 ? geometry : mapped.map((s) => [s.lat, s.lng])),
    [geometry, mapped],
  );
  const center = position ? [position.lat, position.lng] : line[0] || DEFAULT_CENTER;

  return (
    <div className={`relative w-full ${className} rounded-xl overflow-hidden border border-border`}>
      {(emergency || delay) && (
        <div className="absolute top-3 left-3 right-3 z-[400] flex flex-col gap-2 pointer-events-none">
          {emergency && (
            <div role="alert" className="rounded-lg bg-red-600 text-white px-4 py-3 shadow-lg flex items-center gap-2 text-sm font-semibold">
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

      {position && !following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          className="absolute bottom-4 right-4 z-[400] btn-secondary shadow-md"
        >
          <LocateFixed size={18} aria-hidden="true" /> Centre on bus
        </button>
      )}

      <MapContainer center={center} zoom={14} className="w-full h-full z-0" role="region" aria-label={`Map showing ${label}`}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {line.length > 1 && <Polyline positions={line} pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.6 }} />}
        {mapped.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={stopIcon(s.id === myStopId)} keyboard={false}>
            <Tooltip direction="top" offset={[0, -8]} permanent={s.id === myStopId}>
              {stopTooltip ? stopTooltip(s, s.id === myStopId) : s.id === myStopId ? `Your stop: ${s.name}` : s.name}
            </Tooltip>
          </Marker>
        ))}
        {display && (
          <Marker position={[display.lat, display.lng]} icon={busIcon(status)} zIndexOffset={1000} title={label} alt={label}>
            <Tooltip direction="top" offset={[0, -22]}>{label}</Tooltip>
          </Marker>
        )}
        <FollowBus target={position} following={following} onUserMove={stopFollowing} fitTo={line} />
      </MapContainer>
    </div>
  );
}
