import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import LoadingSpinner from '../../../components/common/LoadingSpinner';
import ErrorMessage from '../../../components/common/ErrorMessage';
import StatusBadge from '../../../components/common/StatusBadge';
import { useAuth } from '../../../context/AuthContext';
import { listAnalysisRuns, listAnomalies, reviewAnomaly, runAnalysis } from '../../../services/fuel.service';

const SEVERITY_VARIANT = { LOW: 'neutral', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' };

// AI fuel insights. Until a model is plugged into ai-fuel-service there
// are no anomalies, so this shows an empty state.
export default function FuelInsights() {
  const { session } = useAuth();
  const [anomalies, setAnomalies] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const load = () => Promise.all([listAnomalies({ status: 'OPEN' }), listAnalysisRuns()])
    .then(([a, r]) => { setAnomalies(a.anomalies); setRuns(r.runs); })
    .catch(() => setError('Could not load insights.'))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const review = async (id, status) => {
    try {
      await reviewAnomaly(id, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not update the insight.');
    }
  };

  const analyse = async () => {
    setRunning(true);
    try {
      await runAnalysis();
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not run the analysis.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading insights..." />;
  const lastRun = runs[0];

  return (
    <div className="flex flex-col gap-4">
      <ErrorMessage message={error} />

      {anomalies.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-lime-500 to-emerald-600 text-white flex items-center justify-center mb-3">
            <Sparkles size={22} />
          </div>
          <p className="font-semibold text-gray-800 dark:text-gray-100">AI insights will appear here</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {session.organization?.features?.aiFuelAnalytics
              ? 'Unusual fuel use, overfills and odometer problems will be flagged here for review.'
              : 'AI fuel analytics is not switched on for your organisation yet. Keep recording fuel-ups so insights are ready when it is.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {anomalies.map((a) => (
            <li key={a.id} className="glass-card p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-800 dark:text-gray-100">{a.type.replace(/_/g, ' ').toLowerCase()}</span>
                <StatusBadge variant={SEVERITY_VARIANT[a.severity]}>{a.severity.toLowerCase()} · {Math.round(a.score * 100)}%</StatusBadge>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mt-1">{a.explanation?.summary}</p>
              <p className="text-xs text-gray-400 mt-1">
                {a.bus?.licensePlate ? `${a.bus.licensePlate} · ` : ''}{new Date(a.createdAt).toLocaleDateString('en-KE')}
              </p>
              <div className="flex gap-2 mt-3">
                <button type="button" className="btn-primary flex-1" onClick={() => review(a.id, 'CONFIRMED')}>Confirm<span className="sr-only"> this anomaly</span></button>
                <button type="button" className="btn-secondary flex-1" onClick={() => review(a.id, 'DISMISSED')}>Dismiss<span className="sr-only"> this anomaly</span></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          {lastRun
            ? `Last analysis: ${new Date(lastRun.startedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })} · ${lastRun.status.toLowerCase()}`
            : 'No analysis has run yet.'}
        </span>
        {session.role === 'ORG_ADMIN' && (
          <button type="button" onClick={analyse} disabled={running} className="btn-ghost text-link -mx-2">
            {running ? 'Running...' : 'Run analysis now'}
          </button>
        )}
      </div>
    </div>
  );
}
