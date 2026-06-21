import { useState, useEffect } from 'react';
import Map from '../components/Map';
import api from '../services/api';
import socket from '../services/socket';

const StudentDashboard = () => {
  const [profile, setProfile] = useState(null);
  const [busLocation, setBusLocation] = useState({ lat: -1.286389, lng: 36.817223 }); // Default Nairobi

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/student/profile');
        setProfile(res.data);
        if (res.data?.busId) {
          socket.connect();
          socket.emit('joinBus', res.data.busId);
          socket.on('locationUpdate', (data) => {
            setBusLocation(data);
          });
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchProfile();
    return () => socket.disconnect();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Bus Tracker</h1>
          <p className="text-gray-500 font-medium">Assigned to: {profile?.bus?.plateNumber || 'No bus assigned'}</p>
        </div>
        <div className="text-right">
          <span className={`px-4 py-1 rounded-full text-sm font-bold tracking-wide uppercase ${
            profile?.paymentTier === 'ADAMS' ? 'bg-purple-100 text-purple-700' :
            profile?.paymentTier === 'LAVINGTON' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {profile?.paymentTier} TIER
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-[500px] bg-white p-4 rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <Map
            center={[busLocation.lat, busLocation.lng]}
            markers={[{ position: [busLocation.lat, busLocation.lng], popup: 'Your Bus' }]}
          />
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Pickup Point</h3>
            {profile?.pickupPoint ? (
              <div className="space-y-2">
                <p className="text-xl font-semibold text-blue-600">{profile.pickupPoint.name}</p>
                <p className="text-sm text-gray-500">Route: {profile.bus?.route?.name}</p>
              </div>
            ) : (
              <p className="text-gray-400 italic">No pickup point selected</p>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Payment History</h3>
            <div className="space-y-4">
              {profile?.payments?.slice(0, 3).map(payment => (
                <div key={payment.id} className="flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold text-gray-800">{payment.tierPurchased} Tier</p>
                    <p className="text-xs text-gray-400">{new Date(payment.createdAt).toLocaleDateString()}</p>
                  </div>
                  <span className="font-mono text-green-600">KES {payment.amount}</span>
                </div>
              ))}
              {(!profile?.payments || profile.payments.length === 0) && (
                <p className="text-gray-400 text-center py-4">No recent payments</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
