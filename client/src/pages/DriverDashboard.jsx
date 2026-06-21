import { useState, useEffect } from 'react';
import api from '../services/api';
import socket from '../services/socket';

const DriverDashboard = () => {
  const [driverData, setDriverData] = useState(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [watchId, setWatchId] = useState(null);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    const fetchDriverData = async () => {
      try {
        const res = await api.get('/driver/trips');
        setDriverData(res.data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchDriverData();
  }, []);

  const stopBroadcasting = () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    socket.disconnect();
    setIsBroadcasting(false);
  };

  const startBroadcasting = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsBroadcasting(true);
    socket.connect();

    const id = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setLocation({ lat: latitude, lng: longitude });
      socket.emit('updateLocation', {
        busId: driverData.bus.id,
        lat: latitude,
        lng: longitude
      });
    }, (err) => {
      console.error(err);
    }, {
      enableHighAccuracy: true,
      maximumAge: 5000
    });

    setWatchId(id);
  };

  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      socket.disconnect();
    };
  }, [watchId]);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Driver Console</h1>
          <p className="text-gray-500 font-medium">Bus: {driverData?.bus?.plateNumber || 'Not assigned'}</p>
        </div>
        <button
          onClick={() => isBroadcasting ? stopBroadcasting() : startBroadcasting()}
          className={`w-full md:w-auto px-8 py-3 rounded-xl font-bold transition-all ${
            isBroadcasting
            ? 'bg-red-100 text-red-600 hover:bg-red-200'
            : 'bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-200'
          }`}
        >
          {isBroadcasting ? 'STOP BROADCASTING' : 'START TRIP'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Passenger List</h3>
          <div className="divide-y divide-gray-50">
            {driverData?.bus?.students?.map(student => (
              <div key={student.id} className="py-3 flex justify-between items-center">
                <span className="font-medium text-gray-700">{student.user.firstName} {student.user.lastName}</span>
                <span className="text-xs font-bold text-gray-400">{student.paymentTier}</span>
              </div>
            ))}
            {(!driverData?.bus?.students || driverData.bus.students.length === 0) && (
                <p className="text-gray-400 text-center py-4 italic">No passengers assigned</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Route Info</h3>
          <p className="text-2xl font-semibold text-blue-600 mb-2">{driverData?.bus?.route?.name || 'N/A'}</p>
          <div className="space-y-2">
            {driverData?.bus?.route?.pickupPoints?.map(point => (
              <div key={point.id} className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                {point.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverDashboard;
