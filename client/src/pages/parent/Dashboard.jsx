import { useCallback, useEffect, useState } from 'react';
import { Link, Routes, Route, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from '../../components/common/Navbar';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ErrorMessage from '../../components/common/ErrorMessage';
import TrackBus from '../student/TrackBus';
import { useAuth } from '../../context/AuthContext';
import { getChildBus, listChildren } from '../../services/parent.service';

function Children() {
  const { session } = useAuth();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listChildren()
      .then((d) => setChildren(d.children))
      .catch(() => setError('Could not load your children.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner label="Loading..." />;

  return (
    <div className="p-4 pb-10 max-w-md mx-auto flex flex-col gap-3">
      <ErrorMessage message={error} />
      {children.length === 0 && !error && (
        <div className="glass-card p-5 text-sm text-gray-500 dark:text-gray-400">
          No {session.organization?.passengerLabel?.toLowerCase() || 'children'} are linked to your account yet.
          Ask the transport office to link your child.
        </div>
      )}
      {children.map((c, i) => (
        <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
          <Link to={`track/${c.id}`} className="glass-card p-5 flex items-center justify-between hover:brightness-105 active:scale-[0.98] transition-all">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{c.user.firstName} {c.user.lastName}</p>
              <p className="text-xs text-gray-400">
                {c.route ? `${c.route.name}${c.arrivePickupPoint ? ` · ${c.arrivePickupPoint.name}` : ''}` : 'No route assigned yet'}
              </p>
            </div>
            <span className="text-2xl">📍</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

function TrackChild() {
  const { id } = useParams();
  const loadBus = useCallback(() => getChildBus(id), [id]);
  return <TrackBus loadBus={loadBus} />;
}

// PARENT area: your children and live tracking of the bus on their route.
export default function ParentDashboard({ onInstall }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-dark bg-mesh-light dark:bg-mesh-dark">
      <Navbar title="My children" onInstall={onInstall} />
      <Routes>
        <Route index element={<Children />} />
        <Route path="track/:id" element={<TrackChild />} />
      </Routes>
    </div>
  );
}
