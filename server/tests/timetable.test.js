import { describe, it, expect } from 'vitest';
import { cleanOverrides, legSeconds, stopTimes } from '../src/services/timetable.js';
import { effectiveRide, isoWeekday, ridersOn } from '../src/services/rides.js';
import { expiryStatus, scheduleStatus } from '../src/services/fleet.js';

// Pure functions: stop times, effective rides, maintenance due and expiry.

const route = {
  pickupPoints: [
    { id: 1, name: 'A', order: 0, lat: -1.30, lng: 36.80 },
    { id: 2, name: 'B', order: 1, lat: -1.29, lng: 36.81 },
    { id: 3, name: 'Campus', order: 2, lat: -1.28, lng: 36.82 },
  ],
  // 10 and 5 minutes of driving between the stops.
  legs: [{ durationSeconds: 600 }, { durationSeconds: 300 }],
};

describe('stopTimes', () => {
  it('walks the stops in order for a pickup run, adding travel and dwell', () => {
    const times = stopTimes(route, { direction: 'PICKUP', time: '06:30' }, { dwellSeconds: 60 });
    expect(times.map((s) => [s.name, s.time])).toEqual([['A', '06:30'], ['B', '06:41'], ['Campus', '06:47']]);
  });

  it('walks the stops in reverse for a drop-off run', () => {
    const times = stopTimes(route, { direction: 'DROPOFF', time: '16:00' }, { dwellSeconds: 60 });
    expect(times.map((s) => [s.name, s.time])).toEqual([['Campus', '16:00'], ['B', '16:06'], ['A', '16:17']]);
  });

  it('uses hand-set stop times', () => {
    const times = stopTimes(route, { direction: 'PICKUP', time: '06:30', stopTimeOverrides: { 2: '06:50' } }, { dwellSeconds: 60 });
    expect(times.find((s) => s.pickupPointId === 2)).toMatchObject({ time: '06:50', overridden: true });
  });

  it('falls back to a straight-line estimate without a road route', () => {
    const legs = legSeconds(route.pickupPoints, null);
    expect(legs).toHaveLength(2);
    expect(legs[0]).toBeGreaterThan(60);
    const unpinned = [{ id: 9, name: 'X', order: 0, lat: null, lng: null }, ...route.pickupPoints.map((p) => ({ ...p, order: p.order + 1 }))];
    expect(legSeconds(unpinned, route.legs)[0]).toBe(0);
  });

  it('validates overrides against the route stops', () => {
    expect(cleanOverrides({ 1: '07:00', 2: '' }, [1, 2])).toEqual({ 1: '07:00' });
    expect(() => cleanOverrides({ 5: '07:00' }, [1, 2])).toThrow();
    expect(() => cleanOverrides({ 1: '7am' }, [1, 2])).toThrow();
  });
});

describe('rides', () => {
  const monday = '2026-11-16';
  const sunday = '2026-11-22';
  const slot = { id: 10, direction: 'PICKUP', isActive: true, daysOfWeek: [1, 2, 3, 4, 5], capacity: 2 };
  const other = { id: 11, direction: 'PICKUP', isActive: true, daysOfWeek: [1, 2, 3, 4, 5, 6, 7], capacity: 2 };
  const slots = new Map([[10, slot], [11, other]]);

  it('knows ISO weekdays', () => {
    expect(isoWeekday(monday)).toBe(1);
    expect(isoWeekday(sunday)).toBe(7);
  });

  it('works out the ride in effect on a day', () => {
    const booking = { slotId: 10, pickupPointId: 1 };
    expect(effectiveRide(booking, null, slots, monday)).toMatchObject({ source: 'USUAL', slotId: 10 });
    expect(effectiveRide(booking, null, slots, sunday)).toMatchObject({ source: 'NONE', slotId: null });
    expect(effectiveRide(booking, { type: 'SKIP' }, slots, monday)).toMatchObject({ source: 'SKIPPED' });
    expect(effectiveRide(booking, { type: 'CHANGE', slotId: 11, pickupPointId: 2 }, slots, monday))
      .toMatchObject({ source: 'CHANGED', slotId: 11, pickupPointId: 2 });
  });

  it('counts riders with skips and changes', () => {
    const bookings = [
      { studentId: 1, direction: 'PICKUP', slotId: 10, pickupPointId: 1 },
      { studentId: 2, direction: 'PICKUP', slotId: 10, pickupPointId: 2 },
      { studentId: 3, direction: 'PICKUP', slotId: 11, pickupPointId: 1 },
    ];
    const exceptions = [
      { studentId: 1, direction: 'PICKUP', date: new Date(`${monday}T00:00:00Z`), type: 'SKIP' },
      { studentId: 3, direction: 'PICKUP', date: new Date(`${monday}T00:00:00Z`), type: 'CHANGE', slotId: 10, pickupPointId: 3 },
    ];
    expect(ridersOn(slot, monday, bookings, exceptions).map((r) => r.studentId).sort()).toEqual([2, 3]);
    expect(ridersOn(other, monday, bookings, exceptions)).toEqual([]);
    expect(ridersOn(slot, '2026-11-17', bookings, exceptions).map((r) => r.studentId).sort()).toEqual([1, 2]);
  });
});

describe('maintenance and expiry', () => {
  const now = new Date('2026-11-16T10:00:00Z');

  it('is overdue by distance or by time, whichever comes first', () => {
    const s = { intervalKm: 5000, intervalDays: 180, lastDoneOdometer: 10000, lastDoneAt: new Date('2026-09-01T00:00:00Z') };
    expect(scheduleStatus(s, 14000, now).status).toBe('OK');
    expect(scheduleStatus(s, 14700, now).status).toBe('DUE_SOON');
    expect(scheduleStatus(s, 15000, now)).toMatchObject({ status: 'OVERDUE', kmLeft: 0 });
    expect(scheduleStatus({ ...s, lastDoneAt: new Date('2026-05-01T00:00:00Z') }, 11000, now).status).toBe('OVERDUE');
  });

  it('classifies expiry dates', () => {
    expect(expiryStatus(null, now)).toBe('NONE');
    expect(expiryStatus('2026-11-01', now)).toBe('EXPIRED');
    expect(expiryStatus('2026-12-01', now)).toBe('EXPIRING');
    expect(expiryStatus('2027-06-01', now)).toBe('VALID');
  });
});
