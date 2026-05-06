import { useNavigate } from 'react-router-dom';
import { useClerk } from '@clerk/clerk-react';
import { Shield, LifeBuoy } from 'lucide-react';
import { useAuth } from '../../store/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const AVATAR_COLORS = [
  { bg: '#F5E6DC', text: '#C8501A' },
  { bg: '#E8F0F8', text: '#2C5F8A' },
  { bg: '#EAF5E8', text: '#2D7A2D' },
  { bg: '#F5EAF0', text: '#8A2C5F' },
  { bg: '#F8F0E8', text: '#8A5F2C' },
  { bg: '#E8F5F0', text: '#2C8A6B' },
];

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export default function TopBar() {
  const { user, clerkUser, isSuperAdmin, adminMode, toggleAdminMode } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const displayName = user?.name || clerkUser?.fullName || 'User';
  const groupLabel = user?.groupName || 'My Group';

  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase();

  const avatarColor = getAvatarColor(displayName);

  const handleSignOut = () => signOut(() => navigate('/sign-in'));

  return (
    <header className="fixed top-0 left-0 right-0 md:left-60 h-16 bg-surface-card border-b border-border-default z-40 flex items-center justify-between px-4 md:px-8">
      <span className="text-base font-semibold text-text-primary truncate">{groupLabel}</span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 focus:outline-none"
            style={{ backgroundColor: avatarColor.bg, color: avatarColor.text }}
            aria-label="User menu"
          >
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-text-primary truncate">{displayName}</p>
            <p className="text-xs text-text-secondary truncate">{user?.role}</p>
          </div>
          <DropdownMenuSeparator />
          {isSuperAdmin && (
            <>
              <DropdownMenuItem
                onClick={() => { toggleAdminMode(); navigate(adminMode ? '/dashboard' : '/admin'); }}
                className="flex items-center gap-2"
              >
                <Shield size={16} className="text-brand-primary" />
                {adminMode ? 'Switch to My Group' : 'Switch to Platform Admin'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onClick={() => navigate('/settings')}>
            Account Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.dispatchEvent(new Event('openSupport'))}
            className="flex items-center gap-2"
          >
            <LifeBuoy size={16} className="text-text-secondary" />
            Help & Support
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-status-overdue-text focus:text-status-overdue-text">
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
