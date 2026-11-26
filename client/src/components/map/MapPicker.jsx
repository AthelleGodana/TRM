import { useEffect, useId, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Default Leaflet marker icons do not resolve under Vite without this.
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

L.Marker.prototype.options.icon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });

const NAIROBI = { lat: -1.2921, lng: 36.8219 };
const round = (n) => Math.round(n * 1e6) / 1e6;

function ClickToPin({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: round(e.latlng.lat), lng: round(e.latlng.lng) }) });
  return null;
}

// Keeps the map centred on the pin when it changes from outside (typed
// coordinates, or switching to another stop).
function FollowValue({ value }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.panTo([value.lat, value.lng], { animate: false });
  }, [map, value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps -- value is compared by its coordinates
  return null;
}

function CoordinateInput({ id, label, value, min, max, onCommit }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { setText(value == null ? '' : String(value)); }, [value]);
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="field-label">{label}</label>
      <input
        id={id} type="number" inputMode="decimal" step="any" min={min} max={max}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
        }}
        className="input-field tabular-nums"
      />
    </div>
  );
}

// Controlled location picker: click the map or type coordinates.
//   value:    { lat, lng } or null
//   onChange: ({ lat, lng }) => void
export default function MapPicker({ value, onChange, label = 'Stop location' }) {
  const id = useId();
  const pick = (next) => onChange?.(next);
  const center = value || NAIROBI;

  return (
    <div className="w-full rounded-xl overflow-hidden border border-border">
      <div role="region" aria-label={`${label} map`} className="h-[320px] sm:h-[400px]">
        <MapContainer center={[center.lat, center.lng]} zoom={14} className="w-full h-full z-0 cursor-crosshair" keyboard>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          <ClickToPin onPick={pick} />
          <FollowValue value={value} />
          {value && <Marker position={[value.lat, value.lng]} title={label} />}
        </MapContainer>
      </div>
      <fieldset className="bg-muted/40 p-3 border-t border-border">
        <legend className="sr-only">{label} coordinates</legend>
        <p className="text-xs text-muted-foreground mb-2">Click the map to drop a pin, or type the coordinates.</p>
        <div className="flex gap-3">
          <CoordinateInput id={`${id}-lat`} label="Latitude" value={value?.lat ?? null} min={-90} max={90}
            onCommit={(lat) => pick({ lat, lng: value?.lng ?? NAIROBI.lng })} />
          <CoordinateInput id={`${id}-lng`} label="Longitude" value={value?.lng ?? null} min={-180} max={180}
            onCommit={(lng) => pick({ lat: value?.lat ?? NAIROBI.lat, lng })} />
        </div>
      </fieldset>
    </div>
  );
}
