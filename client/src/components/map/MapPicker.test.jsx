import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MapPicker from './MapPicker';

// Leaflet needs a real browser. The map is replaced by a stub that exposes
// the click handler, so the test can "click" a location.
const leaflet = vi.hoisted(() => ({ click: null }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position }) => <div data-testid="marker">{position.join(',')}</div>,
  useMap: () => ({ panTo: () => {} }),
  useMapEvents: (handlers) => { leaflet.click = handlers.click; return null; },
}));
vi.mock('leaflet', () => ({ default: { icon: () => ({}), Marker: { prototype: { options: {} } } } }));
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('leaflet/dist/images/marker-icon.png', () => ({ default: '' }));
vi.mock('leaflet/dist/images/marker-shadow.png', () => ({ default: '' }));

function Controlled({ onChange }) {
  const [value, setValue] = useState(null);
  return <MapPicker value={value} onChange={(v) => { setValue(v); onChange(v); }} />;
}

describe('MapPicker', () => {
  it('reports a map click as { lat, lng } and shows the pin', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    leaflet.click({ latlng: { lat: -1.28641, lng: 36.81723 } });
    expect(onChange).toHaveBeenLastCalledWith({ lat: -1.28641, lng: 36.81723 });
  });

  it('accepts typed coordinates as the keyboard alternative', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '-1.3' } });
    expect(onChange).toHaveBeenLastCalledWith({ lat: -1.3, lng: 36.8219 });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '36.9' } });
    expect(onChange).toHaveBeenLastCalledWith({ lat: -1.3, lng: 36.9 });
    expect(screen.getByTestId('marker')).toHaveTextContent('-1.3,36.9');
  });

  it('ignores out-of-range values', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '123' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
