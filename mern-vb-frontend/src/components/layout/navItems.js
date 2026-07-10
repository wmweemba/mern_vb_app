import { LayoutGrid, Users, Wallet, DollarSign, FileText, Settings, Zap, Coins } from 'lucide-react';

export const NAV_ITEMS = [
  { label: 'Dashboard',     to: '/dashboard',     icon: LayoutGrid },
  { label: 'Members',       to: '/members',        icon: Users },
  { label: 'Savings',       to: '/savings',        icon: Wallet },
  { label: 'Loans',         to: '/loans',          icon: DollarSign },
  { label: 'Contributions', to: '/contributions',  icon: Coins },
  { label: 'Reports',       to: '/reports',        icon: FileText },
  { label: 'Operations',    to: '/operations',     icon: Zap, roles: ['admin', 'treasurer', 'loan_officer'] },
  { label: 'Settings',      to: '/settings',       icon: Settings },
];
