import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../ui/button';
import { useAuth } from '../../store/auth';
import { FaTachometerAlt, FaMoneyCheckAlt, FaPiggyBank, FaChartBar, FaSignOutAlt, FaCog, FaRecycle, FaTools } from 'react-icons/fa';
import ManageBankBalanceModal from '../ui/ManageBankBalanceModal';
import ChangePasswordModal from '../ui/ChangePasswordModal';
import ManagePaymentModal from '../ui/ManagePaymentModal';
import AddFineModal from '../ui/AddFineModal';
import BeginNewCycleModal from '../ui/BeginNewCycleModal';
import FinesModal from '../ui/FinesModal';
import axios from 'axios';
import InstallPWAButton from '../ui/InstallPWAButton';

const navItems = [
  { name: 'Dashboard', to: '/dashboard', icon: <FaTachometerAlt className="text-xl sm:text-lg" /> },
  { name: 'Loans', to: '/loans', icon: <FaMoneyCheckAlt className="text-xl sm:text-lg" /> },
  { name: 'Savings', to: '/savings', icon: <FaPiggyBank className="text-xl sm:text-lg" /> },
  { name: 'Reports', to: '/reports', icon: <FaChartBar className="text-xl sm:text-lg" /> },
];

const canAccessOperations = user => ['admin', 'treasurer', 'loan_officer'].includes(user?.role);

const Navbar = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showSettings, setShowSettings] = useState(false);
  const [showOperations, setShowOperations] = useState(false);
  const [showBankBalance, setShowBankBalance] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showFine, setShowFine] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [showFinesModal, setShowFinesModal] = useState(false);
  const [deletingFines, setDeletingFines] = useState(false);
  const dropdownRef = useRef(null);
  const operationsRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowSettings(false);
      }
      if (operationsRef.current && !operationsRef.current.contains(event.target)) {
        setShowOperations(false);
      }
    };

    if (showSettings || showOperations) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showSettings, showOperations]);

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

            {/* Operations dropdown — admin, loan_officer, treasurer only */}
            {user && canAccessOperations(user) && (
              <div className="relative ml-2" ref={operationsRef}>
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                  onClick={() => { setShowOperations((v) => !v); setShowSettings(false); }}
                  aria-label="Operations"
                >
                  <FaTools className="text-xl sm:text-lg" />
                  <span className="hidden sm:inline">Operations</span>
                </button>
                {showOperations && (
                  <div className="absolute left-0 mt-2 w-60 bg-white border rounded shadow-lg z-50">
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowOperations(false); setShowBankBalance(true); }}>Manage Bank Balance</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowOperations(false); setShowPayment(true); }}>Manage Payment</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowOperations(false); setShowFine(true); }}>Add Fine/Penalty</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowOperations(false); setShowFinesModal(true); }}>View Fines &amp; Penalties</button>
                    <hr className="my-1" />
                    <button
                      className="w-full text-left px-4 py-2 hover:bg-red-100 text-red-600 font-semibold flex items-center gap-2"
                      onClick={() => { setShowOperations(false); setShowNewCycle(true); }}
                    >
                      <FaRecycle className="text-sm" />
                      Begin New Cycle
                    </button>
                    {user?.role === 'admin' && (
                      <>
                        <hr className="my-1" />
                        <button className="w-full text-left px-4 py-2 hover:bg-red-100 text-red-600 font-semibold" onClick={() => { setShowOperations(false); handleDeleteAllFines(); }} disabled={deletingFines}>
                          {deletingFines ? 'Deleting Fines...' : 'Delete All Fines'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Settings dropdown — all logged in users */}
            {user && (
              <div className="relative ml-2" ref={dropdownRef}>
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
                  onClick={() => { setShowSettings((v) => !v); setShowOperations(false); }}
                  aria-label="Settings"
                >
                  <FaCog className="text-xl sm:text-lg" />
                  <span className="hidden sm:inline">Settings</span>
                </button>
                {showSettings && (
                  <div className="absolute left-0 mt-2 w-56 bg-white border rounded shadow-lg z-50">
                    {user?.role === 'admin' && (
                      <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); navigate('/users'); }}>Manage Users</button>
                    )}
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-100" onClick={() => { setShowSettings(false); setShowChangePassword(true); }}>Change Password</button>
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
      <FinesModal open={showFinesModal} onClose={() => setShowFinesModal(false)} />
      <BeginNewCycleModal 
        isOpen={showNewCycle}
        onClose={() => setShowNewCycle(false)}
        onSuccess={() => {
          // Optionally refresh page or show success message
          window.location.reload();
        }}
      />
    </>
  );
};

export default Navbar; 