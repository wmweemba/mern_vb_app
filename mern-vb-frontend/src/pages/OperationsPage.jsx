import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle,
  List,
  Landmark,
  RefreshCw,
  PiggyBank,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import ManagePaymentModal from '../components/ui/ManagePaymentModal';
import AddFineModal from '../components/ui/AddFineModal';
import FinesModal from '../components/ui/FinesModal';
import ManageBankBalanceModal from '../components/ui/ManageBankBalanceModal';
import BeginNewCycleModal from '../components/ui/BeginNewCycleModal';

const hasRole = (user, roles) => roles.includes(user?.role);

export default function OperationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [showPayment, setShowPayment] = useState(false);
  const [paymentType, setPaymentType] = useState('repayment');
  const [showFine, setShowFine] = useState(false);
  const [showFinesModal, setShowFinesModal] = useState(false);
  const [showBankBalance, setShowBankBalance] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);

  const openPayment = (type) => {
    setPaymentType(type);
    setShowPayment(true);
  };

  const GROUPS = [
    {
      label: 'Payments',
      items: [
        {
          icon: CreditCard,
          title: 'Record Loan Repayment',
          description: 'Apply a member\'s installment payment to their active loan',
          roles: ['admin', 'treasurer', 'loan_officer'],
          action: () => openPayment('repayment'),
        },
        {
          icon: ArrowUpRight,
          title: 'Record Payout',
          description: 'Disburse funds to a member and reduce the group bank balance',
          roles: ['admin', 'treasurer', 'loan_officer'],
          action: () => openPayment('payout'),
        },
      ],
    },
    {
      label: 'Fines',
      items: [
        {
          icon: AlertTriangle,
          title: 'Issue Fine / Penalty',
          description: 'Issue a new fine or penalty to a group member',
          roles: ['admin', 'treasurer', 'loan_officer'],
          action: () => setShowFine(true),
        },
        {
          icon: CheckCircle,
          title: 'Record Fine Payment',
          description: 'Mark an outstanding unpaid fine as settled',
          roles: ['admin', 'treasurer', 'loan_officer'],
          action: () => openPayment('fine'),
        },
        {
          icon: List,
          title: 'View & Manage Fines',
          description: 'Review all fines, edit amounts, or void cancelled penalties',
          roles: ['admin', 'treasurer', 'loan_officer'],
          action: () => setShowFinesModal(true),
        },
      ],
    },
    {
      label: 'Administration',
      items: [
        {
          icon: Landmark,
          title: 'Manage Bank Balance',
          description: 'Adjust the group\'s recorded bank balance',
          roles: ['admin', 'treasurer'],
          action: () => setShowBankBalance(true),
        },
        {
          icon: RefreshCw,
          title: 'Begin New Cycle',
          description: 'Reset all balances and start a new banking cycle',
          roles: ['admin'],
          action: () => setShowNewCycle(true),
        },
        {
          icon: PiggyBank,
          title: 'Edit Savings Entry',
          description: 'Correct an existing savings record for a member',
          roles: ['admin', 'treasurer', 'loan_officer'],
          action: () => navigate('/savings'),
        },
      ],
    },
  ];

  return (
    <div className="max-w-3xl mx-auto py-6">
      <h1 className="text-xl font-semibold text-text-primary mb-1">Operations</h1>
      <p className="text-sm text-text-secondary mb-6">Record payments, manage fines, and administer group finances.</p>

      <div className="space-y-8">
        {GROUPS.map(group => {
          const visibleItems = group.items.filter(item => hasRole(user, item.roles));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              <p className="text-xs font-medium uppercase tracking-widest text-text-secondary mb-3">
                {group.label}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.title}
                      onClick={item.action}
                      className="bg-surface-card rounded-xl p-5 flex items-start gap-4 text-left border border-border-default transition-colors hover:border-brand-primary/30 hover:bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                    >
                      <div className="w-10 h-10 rounded-md bg-brand-light flex items-center justify-center text-brand-primary flex-shrink-0">
                        <Icon size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{item.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <ManagePaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        initialType={paymentType}
      />
      <AddFineModal
        open={showFine}
        onClose={() => setShowFine(false)}
      />
      <FinesModal
        open={showFinesModal}
        onClose={() => setShowFinesModal(false)}
      />
      <ManageBankBalanceModal
        open={showBankBalance}
        onClose={() => setShowBankBalance(false)}
      />
      <BeginNewCycleModal
        isOpen={showNewCycle}
        onClose={() => setShowNewCycle(false)}
        onSuccess={() => window.location.reload()}
      />
    </div>
  );
}
