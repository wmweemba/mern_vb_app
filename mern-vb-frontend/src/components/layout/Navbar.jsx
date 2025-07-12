import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../ui/button';
import { useAuth } from '../../store/auth';
import { FaTachometerAlt, FaMoneyCheckAlt, FaPiggyBank, FaChartBar, FaSignOutAlt, FaCog } from 'react-icons/fa';
import ManageBankBalanceModal from '../ui/ManageBankBalanceModal';
import ChangePasswordModal from '../ui/ChangePasswordModal';
import ManagePaymentModal from '../ui/ManagePaymentModal';

const navItems = [
  { name: 'Dashboard', to: '/dashboard', icon: <FaTachometerAlt /> },
  { name: 'Loans', to: '/loans', icon: <FaMoneyCheckAlt /> },
  { name: 'Savings', to: '/savings', icon: <FaPiggyBank /> },
  { name: 'Reports', to: '/reports', icon: <FaChartBar /> },
];

const Navbar = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showBankBalance, setShowBankBalance] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <nav className="sticky top-0 z-50 w-full bg-white border-b shadow-sm">
        <div className="w-full max-w-5xl mx-auto flex items-center px-4 py-2 justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.to}
                className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-sm font-medium ${location.pathname === item.to ? 'text-primary font-bold' : 'text-gray-700'}`}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.name}</span>
              </Link>
            ))}
            {/* Settings dropdown for admin */}
            {user?.role === 'admin' && (
              <div className="relative ml-2">
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                  onClick={() => setShowSettings((v) => !v)}
                  aria-label="Settings"
                >
                  <FaCog />
                  <span className="hidden sm:inline">Settings</span>
                </button>
                {showSettings && (
                  <div className="absolute left-0 mt-2 w-56 bg-white border rounded shadow-lg z-50">
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); navigate('/users'); }}>Manage Users</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); setShowBankBalance(true); }}>Manage Bank Balance</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); setShowChangePassword(true); }}>Change Password</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); setShowPayment(true); }}>Manage Payment</button>
                  </div>
                )}
              </div>
            )}
          </div>
          <Button variant="destructive" size="sm" onClick={handleLogout} className="flex items-center gap-1">
            <FaSignOutAlt />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>
      </nav>
      <ManageBankBalanceModal open={showBankBalance} onClose={() => setShowBankBalance(false)} />
      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <ManagePaymentModal open={showPayment} onClose={() => setShowPayment(false)} />
    </>
  );
};

export default Navbar; 