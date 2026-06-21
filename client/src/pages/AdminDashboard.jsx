import { useState, useEffect } from 'react';
import api from '../services/api';

const AdminDashboard = () => {
  const [stats, setStats] = useState({ buses: 0, students: 0, routes: 0, payments: 0 });
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const busRes = await api.get('/admin/buses');
        setBuses(busRes.data);
        // Mock stats based on fetched data
        setStats({
          buses: busRes.data.length,
          students: busRes.data.reduce((acc, b) => acc + b.students.length, 0),
          routes: new Set(busRes.data.map(b => b.routeId)).size,
          payments: 125000 // Mock
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="p-8 text-center">Loading Admin Panel...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
      <header>
        <h1 className="text-4xl font-black text-gray-900 tracking-tight">Admin Console</h1>
        <p className="text-gray-500 font-medium mt-1">System oversight and resource management</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Students', value: stats.students, color: 'blue' },
          { label: 'Active Buses', value: stats.buses, color: 'green' },
          { label: 'Total Routes', value: stats.routes, color: 'purple' },
          { label: 'Revenue (KES)', value: stats.payments.toLocaleString(), color: 'emerald' }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-1">{stat.label}</p>
            <p className={`text-3xl font-black text-${stat.color}-600`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex justify-between items-center">
          <h3 className="text-xl font-bold text-gray-900">Fleet Management</h3>
          <button className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700">
            Add New Bus
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-400 text-xs font-bold uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Plate Number</th>
                <th className="px-6 py-4">Route</th>
                <th className="px-6 py-4">Driver</th>
                <th className="px-6 py-4">Capacity</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {buses.map(bus => (
                <tr key={bus.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-gray-900">{bus.plateNumber}</td>
                  <td className="px-6 py-4 text-gray-600">{bus.route?.name || 'Unassigned'}</td>
                  <td className="px-6 py-4 text-gray-600">
                    {bus.driver ? `${bus.driver.user.firstName} ${bus.driver.user.lastName}` : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{bus.students.length} / {bus.capacity}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase">
                      Active
                    </span>
                  </td>
                </tr>
              ))}
              {buses.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-400 italic">
                    No buses found in the system
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
