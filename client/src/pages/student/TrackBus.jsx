import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import LiveMap from '../../components/map/LiveMap';
import { SkeletonCard } from '../../components/common/Skeleton';
import ErrorMessage from '../../components/common/ErrorMessage';
import StatusBadge from '../../components/common/StatusBadge';
import { getMyBus } from '../../services/student.service';
import { useSocket } from '../../hooks/useSocket';
import { useToast } from '../../context/ToastContext';

export default function TrackBus() {
  const [bus, setBus] = useState(null);
  const [position, setPosition] = useState(null);
  const [emergency, setEmergency] = useState(null);
  const [delay, setDelay] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const socketRef = useSocket();
  const toast = useToast();

  useEffect(() => {
    getMyBus()
      .then((data) => {
        setBus(data.bus);
        if (data.bus.lastLocation) {
          setPosition({ lat: data.bus.lastLocation.lat, lng: data.bus.lastLocation.lng });
        }
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load your bus.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!bus) return;
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit('student:watchBus', { busId: bus.id });
    socket.on('bus:location', (payload) => {
      if (payload.busId === bus.id) setPosition({ lat: payload.lat, lng: payload.lng });
    });
    socket.on('bus:emergency', (payload) => {
      if (payload.busId === bus.id) {
        setEmergency(payload.message || '🚨 Emergency reported by the driver.');
        toast.emergency(payload.message || '🚨 Emergency reported by the driver.', { title: 'Emergency' });
      }
    });
    socket.on('bus:delay', (payload) => {
      if (payload.busId === bus.id) {
        setDelay(`Running ~${payload.minutes} min behind schedule.`);
        toast.warning(`Bus delayed by ~${payload.minutes} minutes.`, { title: 'Delay' });
      }
    });

    return () => {
      socket.off('bus:location');
      socket.off('bus:emergency');
      socket.off('bus:delay');
    };
  }, [bus, socketRef, toast]);

  if (loading) {
    return (
      <div className="p-4 pb-24 sm:pb-8 max-w-lg mx-auto flex flex-col gap-3">
        <SkeletonCard />
        <div className="skeleton h-[420px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 sm:pb-8 max-w-lg mx-auto">
      <ErrorMessage message={error} />
      {bus && (
        <>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5 mb-3 flex items-center justify-between">
            <div>
              <p className="font-bold text-lg text-gray-800 dark:text-gray-100">{bus.licensePlate}</p>
              {bus.driver && <p className="text-sm text-gray-400">Driver: {bus.driver}</p>}
            </div>
            <StatusBadge variant={position ? 'success' : 'neutral'} dot>
              {position ? 'Live' : 'No signal'}
            </StatusBadge>
          </motion.div>
<LiveMap
            position={position}
            label={bus.licensePlate}
            driverName={bus.driver}
            pickupPoints={bus.route?.pickupPoints || []}
            emergency={emergency}
            delay={delay}
          />
        </>
      )}
    </div>
  );
}
