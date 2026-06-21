import { Link } from 'react-router-dom';

const Landing = () => {
  return (
    <div className="min-h-screen bg-white">
      <nav className="flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="text-2xl font-black text-blue-600 tracking-tighter">TRM</div>
        <div className="space-x-4">
          <Link to="/login" className="font-semibold text-gray-600 hover:text-gray-900">Login</Link>
          <Link to="/register" className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-700 transition-colors">Sign Up</Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-6xl md:text-8xl font-black text-gray-900 tracking-tight mb-8">
          School transport, <br />
          <span className="text-blue-600">reimagined.</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-12 font-medium">
          Real-time tracking, secure payments, and seamless coordination for students, drivers, and administrators.
        </p>
        <div className="flex flex-col md:flex-row justify-center gap-4">
          <Link to="/register" className="bg-blue-600 text-white px-10 py-4 rounded-2xl text-lg font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-100">
            Get Started
          </Link>
          <button className="bg-white text-gray-900 border-2 border-gray-100 px-10 py-4 rounded-2xl text-lg font-bold hover:bg-gray-50 transition-all">
            View Demo
          </button>
        </div>

        <div className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-12 text-left">
          <div className="p-8 bg-gray-50 rounded-3xl">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            </div>
            <h3 className="text-xl font-bold mb-2">Live Tracking</h3>
            <p className="text-gray-500">Know exactly where your bus is with real-time GPS updates every 2 seconds.</p>
          </div>
          <div className="p-8 bg-gray-50 rounded-3xl">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
            </div>
            <h3 className="text-xl font-bold mb-2">Easy Payments</h3>
            <p className="text-gray-500">Integrated M-Pesa payments with automated tier assignment and history.</p>
          </div>
          <div className="p-8 bg-gray-50 rounded-3xl">
            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <h3 className="text-xl font-bold mb-2">Admin Control</h3>
            <p className="text-gray-500">Full oversight of routes, drivers, and buses with a comprehensive audit trail.</p>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-100 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-400 text-sm font-medium">
          &copy; 2024 Transport Management System. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
