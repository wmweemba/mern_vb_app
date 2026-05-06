import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';

const AVATAR_COLORS = [
  { bg: '#F5E6DC', text: '#C8501A' },
  { bg: '#E8F0F8', text: '#2C5F8A' },
  { bg: '#EAF5E8', text: '#2D7A2D' },
  { bg: '#F5EAF0', text: '#8A2C5F' },
  { bg: '#F8F0E8', text: '#8A5F2C' },
  { bg: '#E8F5F0', text: '#2C8A6B' },
];

const ROLE_BADGE = {
  admin:        'bg-brand-light text-brand-primary',
  treasurer:    'bg-blue-50 text-blue-700',
  loan_officer: 'bg-status-paid-bg text-status-paid-text',
  member:       'bg-surface-page text-text-secondary',
};

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export default function MemberSelect({ value, onChange, placeholder = 'Search member...' }) {
  const [members, setMembers] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const containerRef = useRef(null);

  // Fetch members once on mount
  useEffect(() => {
    axios.get(`${API_BASE_URL}/users`)
      .then(res => setMembers(res.data))
      .catch(() => {});
  }, []);

  // Sync selected from external value prop
  useEffect(() => {
    if (!value) { setSelected(null); setQuery(''); return; }
    const match = members.find(m => m.name === value);
    if (match) setSelected(match);
  }, [value, members]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = members
    .filter(m => {
      const q = query.toLowerCase();
      return (m.name || '').toLowerCase().includes(q) || (m.username || '').toLowerCase().includes(q);
    })
    .slice(0, 5);

  const handleSelect = (member) => {
    setSelected(member);
    setQuery('');
    setOpen(false);
    onChange(member.name);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setSelected(null);
    setQuery('');
    onChange('');
  };

  const avatarColor = selected ? getAvatarColor(selected.name || selected.username) : null;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={`flex items-center h-12 border rounded-md bg-surface-card px-3.5 gap-2 cursor-text transition-colors ${
          open ? 'border-brand-primary' : 'border-border-default'
        }`}
        onClick={() => { if (!selected) setOpen(true); }}
      >
        {/* Selected avatar */}
        {selected && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{ backgroundColor: avatarColor.bg, color: avatarColor.text }}
          >
            {getInitials(selected.name || selected.username)}
          </div>
        )}

        {/* Input or selected name */}
        {selected ? (
          <span className="flex-1 text-sm text-text-primary truncate">{selected.name || selected.username}</span>
        ) : (
          <input
            className="flex-1 text-sm text-text-primary bg-transparent outline-none placeholder:text-text-muted"
            placeholder={placeholder}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
          />
        )}

        {/* Clear button */}
        {selected && (
          <button
            type="button"
            onClick={handleClear}
            className="flex-shrink-0 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && !selected && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-surface-card border border-border-default rounded-md shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-text-muted">No members found</div>
          ) : (
            <ul className="max-h-[220px] overflow-y-auto">
              {filtered.map(member => {
                const ac = getAvatarColor(member.name || member.username);
                return (
                  <li key={member._id}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-page transition-colors text-left"
                      onClick={() => handleSelect(member)}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{ backgroundColor: ac.bg, color: ac.text }}
                      >
                        {getInitials(member.name || member.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{member.name || member.username}</p>
                        <p className="text-xs text-text-secondary truncate">{member.email || ''}</p>
                      </div>
                      <span className={`text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0 ${ROLE_BADGE[member.role] || ROLE_BADGE.member}`}>
                        {member.role}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
