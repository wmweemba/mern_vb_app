import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../ui/button';
import { useAuth } from '../../store/auth';
import { FaTachometerAlt, FaMoneyCheckAlt, FaPiggyBank, FaChartBar, FaSignOutAlt, FaCog } from 'react-icons/fa';
import ManageBankBalanceModal from '../ui/ManageBankBalanceModal';
import ChangePasswordModal from '../ui/ChangePasswordModal';
import ManagePaymentModal from '../ui/ManagePaymentModal';
import AddFineModal from '../ui/AddFineModal';
import axios from 'axios';
import InstallPWAButton from '../ui/InstallPWAButton';

const navItems = [
  { name: 'Dashboard', to: '/dashboard', icon: <FaTachometerAlt /> },
  { name: 'Loans', to: '/loans', icon: <FaMoneyCheckAlt /> },
  { name: 'Savings', to: '/savings', icon: <FaPiggyBank /> },
  { name: 'Reports', to: '/reports', icon: <FaChartBar /> },
];

const canAddFine = user => ['admin', 'treasurer', 'loan_officer'].includes(user?.role);
const canManageBankBalanceOrPayment = user => ['admin', 'treasurer', 'loan_officer'].includes(user?.role);

const Navbar = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showBankBalance, setShowBankBalance] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showFine, setShowFine] = useState(false);
  const [deletingFines, setDeletingFines] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDeleteAllFines = async () => {
    if (!window.confirm('Are you sure you want to delete all fines? This cannot be undone.')) return;
    setDeletingFines(true);
    try {
      await axios.delete('/api/payments/fines');
      alert('All fines deleted successfully!');
    } catch (err) {
      alert('Failed to delete fines.');
    } finally {
      setDeletingFines(false);
    }
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
            {/* Settings dropdown for admin/treasurer/loan_officer */}
            {user && (
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
                    {user?.role === 'admin' && (
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); navigate('/users'); }}>Manage Users</button>
                    )}
                    {canManageBankBalanceOrPayment(user) && (
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); setShowBankBalance(true); }}>Manage Bank Balance</button>
                    )}
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); setShowChangePassword(true); }}>Change Password</button>
                    {canManageBankBalanceOrPayment(user) && (
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); setShowPayment(true); }}>Manage Payment</button>
                    )}
                    {canAddFine(user) && (
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); setShowFine(true); }}>Add Fine/Penalty</button>
                    )}
                    {user?.role === 'admin' && (
                      <button className="w-full text-left px-4 py-2 hover:bg-red-100 text-red-600 font-semibold" onClick={() => { setShowSettings(false); handleDeleteAllFines(); }} disabled={deletingFines}>
                        {deletingFines ? 'Deleting Fines...' : 'Delete All Fines'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <InstallPWAButton />
            <Button variant="destructive" size="sm" onClick={handleLogout} className="flex items-center gap-1">
              <FaSignOutAlt />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </nav>
      <ManageBankBalanceModal open={showBankBalance} onClose={() => setShowBankBalance(false)} />
      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <ManagePaymentModal open={showPayment} onClose={() => setShowPayment(false)} />
      <AddFineModal open={showFine} onClose={() => setShowFine(false)} />
    </>
  );
};

export default Navbar; 