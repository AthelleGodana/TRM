import { useState, useEffect } from 'react';
import api from '../services/api';
import socket from '../services/socket';
import { useAuth } from '../context/AuthContext';

const DriverDashboard = () => {
  const { user } = useAuth();
  const [driverData, setDriverData] = useState(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
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
      if (typeof watchId === 'number') {
        navigator.geolocation.clearWatch(watchId);
      } else {
        clearInterval(watchId);
      }
      setWatchId(null);
    }
    socket.disconnect();
    setIsBroadcasting(false);
    setIsSimulating(false);
  };

  const startBroadcasting = (simulate = false) => {
    if (!simulate && !navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsBroadcasting(true);
    setIsSimulating(simulate);
    socket.connect();

    if (simulate) {
      let lat = -1.286389;
      let lng = 36.817223;
      const id = setInterval(() => {
        lat += (Math.random() - 0.5) * 0.001;
        lng += (Math.random() - 0.5) * 0.001;
        const newPos = { lat, lng };
        setLocation(newPos);
        socket.emit('updateLocation', {
          busId: driverData.bus.id,
          userId: user.id,
          ...newPos
        });
      }, 2000);
      setWatchId(id);
      return;
    }

    const id = navigator.geolocation.watchPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setLocation({ lat: latitude, lng: longitude });
      socket.emit('updateLocation', {
        busId: driverData.bus.id,
        userId: user.id,
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
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          {!isBroadcasting ? (
            <>
              <button
                onClick={() => startBroadcasting(false)}
                className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-200"
              >
                START TRIP (GPS)
              </button>
              <button
                onClick={() => startBroadcasting(true)}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200"
              >
                SIMULATE TRIP
              </button>
            </>
          ) : (
            <button
              onClick={stopBroadcasting}
              className="px-8 py-3 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-200"
            >
              STOP BROADCASTING
            </button>
          )}
        </div>
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
