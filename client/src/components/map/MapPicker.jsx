import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icons in Vite/React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position === null ? null : (
    <Marker position={position} />
  );
}

export default function MapPicker({ initialPosition, onPositionSelect }) {
  // If initialPosition is provided as [lng, lat] from Prisma, flip it for Leaflet [lat, lng]
  const defaultCenter = initialPosition 
    ? [initialPosition[1], initialPosition[0]] 
    : [-1.2921, 36.8219]; // Default: Nairobi

  const [position, setPosition] = useState(initialPosition ? [initialPosition[1], initialPosition[0]] : null);

  const handlePositionChange = (newPos) => {
    setPosition(newPos);
    if (onPositionSelect) {
      // Convert back to [lng, lat] format for Postgres/Prisma PostGIS storage
      onPositionSelect([newPos[1], newPos[0]]);
    }
  };

  return (
    <div className="w-full h-[400px] rounded-xl overflow-hidden shadow-inner border border-slate-300">
      <MapContainer 
        center={defaultCenter} 
        zoom={14} 
        className="w-full h-full z-0 cursor-crosshair"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap'
        />
        <LocationMarker position={position} setPosition={handlePositionChange} />
      </MapContainer>
      <div className="bg-slate-50 text-xs text-slate-500 p-2 text-center border-t border-slate-200">
        Click anywhere on the map to drop a pin.
      </div>
    </div>
  );
}