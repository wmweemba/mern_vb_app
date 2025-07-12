import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../ui/button';
import { useAuth } from '../../store/auth';
import { FaTachometerAlt, FaMoneyCheckAlt, FaPiggyBank, FaChartBar, FaSignOutAlt } from 'react-icons/fa';

const navItems = [
  { name: 'Dashboard', to: '/dashboard', icon: <FaTachometerAlt /> },
  { name: 'Loans', to: '/loans', icon: <FaMoneyCheckAlt /> },
  { name: 'Savings', to: '/savings', icon: <FaPiggyBank /> },
  { name: 'Reports', to: '/reports', icon: <FaChartBar /> },
];

const Navbar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
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
        </div>
        <Button variant="destructive" size="sm" onClick={handleLogout} className="flex items-center gap-1">
          <FaSignOutAlt />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </nav>
  );
};

export default Navbar; 