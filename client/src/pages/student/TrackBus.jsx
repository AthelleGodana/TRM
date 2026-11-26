import { useEffect, useMemo, useRef, useState } from 'react';
import { BusFront, Clock, MapPin, WifiOff } from 'lucide-react';
import LiveMap from '../../components/map/LiveMap';
import { SkeletonCard } from '../../components/common/Skeleton';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import PageHeader from '../../components/layout/PageHeader';
import { getMyBus } from '../../services/student.service';
import { useToast } from '../../context/ToastContext';
import { useBusFeed, useConnectionState, useSocketEvent } from '../../hooks/useLive';
import { useNow } from '../../hooks/useNow';
import { plural } from '../../utils/format';
import {
  busStatus, distanceMeters, etaMinutes, formatDistance, MOVING_KMH, remainingAlongRoute, timeAgo, todayAt,
} from '../../utils/geo';

const STATUS_VARIANT = { moving: 'success', stopped: 'warning', offline: 'neutral' };
const APPROACH_METERS = 1000;
const APPROACH_MINUTES = 3;
const RESET_METERS = 2000;

// The passenger's stop for this part of the day: the morning pickup until
// an hour before the route's departure time, then the evening drop-off.
function currentStop(bus, passenger, now) {
  const stops = bus?.route?.pickupPoints || [];
  const departure = todayAt(bus?.route?.schoolDeparture);
  const evening = departure && now >= departure.getTime() - 60 * 60_000;
  const preferred = evening ? passenger?.eveningStopId : passenger?.morningStopId;
  const id = preferred || passenger?.morningStopId || passenger?.eveningStopId;
  return { stop: stops.find((s) => s.id === id) || null, evening };
}

// Live view of a bus. Students load their own bus; parents pass loadBus
// to follow a child's bus. The server only lets people watch buses they
// may see.
export default function TrackBus({ loadBus = getMyBus }) {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [emergency, setEmergency] = useState(null);
  const [delay, setDelay] = useState(null);
  const now = useNow(5000);
  const connection = useConnectionState();

  useEffect(() => {
    let current = true; // a parent switching child must not see the previous child's bus
    setLoading(true);
    setError('');
    loadBus()
      .then((d) => { if (current) setData(d); })
      .catch((err) => { if (current) setError(err.response?.data?.error || 'Could not load the bus.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [loadBus]);

  const bus = data?.bus;
  const passenger = data?.passenger;
  const { position, offline } = useBusFeed(bus?.id, bus?.lastLocation || null);
  const status = busStatus(position, { offline, now });

  useSocketEvent('bus:emergency', (p) => {
    if (p.busId !== bus?.id) return;
    setEmergency(p.message);
    toast.emergency(p.message, { title: 'Emergency on your bus' });
  });
  useSocketEvent('bus:delay', (p) => {
    if (p.busId !== bus?.id) return;
    setDelay(`The driver reports a delay of about ${plural(p.minutes, 'minute')}.`);
    toast.warning(`Your bus is running about ${plural(p.minutes, 'minute')} late.`, { title: 'Delay' });
  });

  // Recent moving speeds, smoothed for the ETA.
  const speeds = useRef([]);
  useEffect(() => {
    const v = position?.speedKmh;
    if (v == null || v < MOVING_KMH) return;
    speeds.current = [...speeds.current.slice(-4), v];
  }, [position]);
  const avgSpeed = speeds.current.length ? speeds.current.reduce((a, b) => a + b, 0) / speeds.current.length : 0;

  const { stop, evening } = currentStop(bus, passenger, now);
  const stops = useMemo(() => bus?.route?.pickupPoints || [], [bus]);
  const trip = useMemo(() => {
    if (!position || !stop || stop.lat == null) return null;
    const index = stops.findIndex((s) => s.id === stop.id);
    const along = remainingAlongRoute(position, stops, index);
    const meters = along ?? null;
    if (meters == null) {
      return { passed: true, direct: distanceMeters(position, stop) };
    }
    return { meters, minutes: etaMinutes(meters, avgSpeed) };
  }, [position, stop, stops, avgSpeed]);

  // "Approaching your stop" once per approach.
  const announced = useRef(false);
  useEffect(() => {
    if (!trip || trip.passed || status.key === 'offline') return;
    if (!announced.current && (trip.meters <= APPROACH_METERS || trip.minutes <= APPROACH_MINUTES)) {
      announced.current = true;
      toast.info(`About ${trip.minutes} min (${formatDistance(trip.meters)}) from ${stop.name}.`, { title: 'Your bus is close' });
    } else if (announced.current && trip.meters > RESET_METERS) {
      announced.current = false;
    }
  }, [trip, status.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compare the ETA with the time the passenger's run reaches their stop
  // today (or, without a booking, the route time).
  const ride = evening ? passenger?.today?.DROPOFF : passenger?.today?.PICKUP;
  const booked = Boolean(ride?.time || (!evening && passenger?.bookedSlot?.time));
  const plannedTime = ride?.time
    || (!evening && passenger?.bookedSlot?.time)
    || (evening ? bus?.route?.schoolDeparture : null);
  const planned = todayAt(plannedTime);
  let punctuality = null;
  if (planned && trip && !trip.passed && status.key !== 'offline') {
    const lateBy = Math.round((now + trip.minutes * 60_000 - planned.getTime()) / 60_000);
    if (Math.abs(lateBy) <= 180) {
      punctuality = lateBy <= 2
        ? { tone: 'text-emerald-700 dark:text-emerald-400', text: 'On time' }
        : { tone: 'text-amber-700 dark:text-amber-400', text: `About ${lateBy} min late` };
    }
  }

  const title = passenger?.name ? `${passenger.name}'s bus` : 'Live bus';

  if (loading) {
    return (
      <div className="page">
        <PageHeader title={title} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="skeleton h-[420px] lg:h-[calc(100vh-12rem)] w-full lg:order-first" />
          <div className="flex flex-col gap-3 order-first lg:order-none"><SkeletonCard /><SkeletonCard /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={title} subtitle="The bus position updates every few seconds while the driver's app is open." />
      <ErrorMessage message={error} />
      {bus && (
        <div className="flex flex-col gap-4">
          {connection !== 'connected' && (
            <p role="status" className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3.5 py-2.5">
              <WifiOff size={16} aria-hidden="true" /> Reconnecting to live updates...
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <section className="grid sm:grid-cols-2 lg:grid-cols-1 gap-3 lg:col-start-2 lg:row-start-1" aria-label="Bus status">
              <div className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 shrink-0 rounded-lg bg-primary-600 text-white flex items-center justify-center" aria-hidden="true">
                      <BusFront size={20} />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-foreground tabular-nums">{bus.licensePlate}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {bus.route?.name}{bus.driver ? ` · ${bus.driver}` : ''}
                      </p>
                    </div>
                  </div>
                  <StatusBadge variant={STATUS_VARIANT[status.key]} dot>{status.label}</StatusBadge>
                </div>
                {/* Announces moving / stopped / offline changes, not every update. */}
                <p role="status" aria-atomic="true" className="sr-only">{position ? `Bus ${bus.licensePlate}: ${status.label}.` : ''}</p>
                <p className="mt-3 text-sm text-muted-foreground" aria-live="off">
                  {!position && 'The driver has not shared a location yet.'}
                  {position && `${status.key === 'offline' ? 'Last seen' : 'Updated'} ${timeAgo(position.recordedAt, now)}`}
                  {position?.speedKmh != null && status.key === 'moving' ? ` · ${position.speedKmh} km/h` : ''}
                </p>
              </div>

              <div className="glass-card p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MapPin size={16} aria-hidden="true" />
                  {stop ? `${evening ? 'Drop-off' : 'Pickup'}: ${stop.name}` : 'Your stop'}
                </p>
                {!stop && <p className="mt-2 text-sm text-muted-foreground">Choose your stop under My route to see an arrival estimate.</p>}
                {stop && stop.lat == null && <p className="mt-2 text-sm text-muted-foreground">This stop has not been pinned on the map yet.</p>}
                {stop && stop.lat != null && !trip && <p className="mt-2 text-sm text-muted-foreground">Waiting for the bus position.</p>}
                {trip?.passed && <p className="mt-2 text-sm text-foreground">The bus has passed this stop.</p>}
                {trip && !trip.passed && (
                  status.key === 'offline' ? (
                    <p className="mt-2 text-sm text-muted-foreground">No estimate while the bus is offline ({formatDistance(trip.meters)} away when last seen).</p>
                  ) : (
                    <>
                      <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                        About {trip.minutes} min
                        <span className="ml-2 text-base font-medium text-muted-foreground">{formatDistance(trip.meters)}</span>
                      </p>
                      {planned && (
                        <p className="mt-1 flex items-center gap-1.5 text-sm">
                          <Clock size={14} className="text-muted-foreground" aria-hidden="true" />
                          <span className="text-muted-foreground">{booked ? 'Your booked' : 'Scheduled'} {plannedTime}:</span>
                          {punctuality && <span className={`font-medium ${punctuality.tone}`}>{punctuality.text}</span>}
                        </p>
                      )}
                    </>
                  )
                )}
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">
                Arrival estimates use the bus's recent speed and the route between stops, so treat them as a guide.
              </p>
            </section>

            <div className="lg:col-start-1 lg:row-start-1">
              <LiveMap
                position={position}
                status={status.key}
                label={bus.licensePlate}
                stops={stops}
                geometry={bus.route?.geometry}
                myStopId={stop?.id}
                emergency={emergency}
                delay={delay}
                className="h-[420px] sm:h-[520px] lg:h-[calc(100vh-12rem)] lg:min-h-[480px]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
