import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import DesktopSidebar from './DesktopSidebar';
import TopBar from './TopBar';
import MobileBottomNav from './MobileBottomNav';
import TrialBanner from '../TrialBanner';
import ManageBankBalanceModal from '../ui/ManageBankBalanceModal';
import ChangePasswordModal from '../ui/ChangePasswordModal';
import ManagePaymentModal from '../ui/ManagePaymentModal';
import AddFineModal from '../ui/AddFineModal';
import BeginNewCycleModal from '../ui/BeginNewCycleModal';
import FinesModal from '../ui/FinesModal';
import { DollarSign, PiggyBank, CreditCard, Landmark, AlertTriangle, Eye, X } from 'lucide-react';

const canAccessOperations = user => ['admin', 'treasurer', 'loan_officer'].includes(user?.role);

export default function AppShell({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Modal state (moved from Navbar)
  const [showBankBalance, setShowBankBalance] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showFine, setShowFine] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [showFinesModal, setShowFinesModal] = useState(false);

  // Action sheet state (the + button on mobile)
  const [showActionSheet, setShowActionSheet] = useState(false);

  const ACTION_ITEMS = [
    { label: 'Add Loan', icon: DollarSign, action: () => { setShowActionSheet(false); navigate('/loans'); } },
    { label: 'Add Savings', icon: PiggyBank, action: () => { setShowActionSheet(false); navigate('/savings'); } },
    { label: 'Manage Payment', icon: CreditCard, action: () => { setShowActionSheet(false); setShowPayment(true); } },
    { label: 'Manage Bank Balance', icon: Landmark, action: () => { setShowActionSheet(false); setShowBankBalance(true); } },
    { label: 'Add Fine / Penalty', icon: AlertTriangle, action: () => { setShowActionSheet(false); setShowFine(true); } },
    { label: 'View Fines & Penalties', icon: Eye, action: () => { setShowActionSheet(false); setShowFinesModal(true); } },
  ];

  return (
    <div className="min-h-screen bg-surface-page">
      <DesktopSidebar />
      <TopBar />

      {/* Mobile bottom nav */}
      <MobileBottomNav onActionSheet={() => setShowActionSheet(true)} />

      {/* Main content */}
      <main className="md:ml-60 pt-16 pb-28 md:pb-8 px-4 md:px-8">
        <TrialBanner />
        {children}
      </main>

      {/* Action Sheet (mobile + button) */}
      {showActionSheet && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-50 md:hidden"
            onClick={() => setShowActionSheet(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-surface-card rounded-t-xl border-t border-border-default">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
              <span className="text-base font-bold text-text-primary">Actions</span>
              <button onClick={() => setShowActionSheet(false)} className="text-text-secondary">
                <X size={20} />
              </button>
            </div>
            <ul>
              {ACTION_ITEMS.filter(() => canAccessOperations(user)).map(({ label, icon: Icon, action }) => (
                <li key={label}>
                  <button
                    onClick={action}
                    className="w-full flex items-center gap-4 px-5 h-[52px] text-left border-b border-border-default last:border-0 hover:bg-surface-page transition-colors"
                  >
                    <Icon size={20} className="text-brand-primary flex-shrink-0" />
                    <span className="text-sm font-medium text-text-primary">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="h-safe-bottom pb-4" />
          </div>
        </>
      )}

      {/* Modals */}
      <ManageBankBalanceModal open={showBankBalance} onClose={() => setShowBankBalance(false)} />
      <ChangePasswordModal open={showChangePassword} onClose={() => setShowChangePassword(false)} />
      <ManagePaymentModal open={showPayment} onClose={() => setShowPayment(false)} />
      <AddFineModal open={showFine} onClose={() => setShowFine(false)} />
      <FinesModal open={showFinesModal} onClose={() => setShowFinesModal(false)} />
      <BeginNewCycleModal
        isOpen={showNewCycle}
        onClose={() => setShowNewCycle(false)}
        onSuccess={() => window.location.reload()}
      />
    </div>
  );
}
