import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import { Plus, ToggleLeft, ToggleRight, Pencil, Check, X } from 'lucide-react';

const inputCls = 'h-10 w-full border border-border-default rounded-md px-3 text-sm text-text-primary bg-surface-card focus:border-brand-primary focus:outline-none transition-colors placeholder:text-text-muted';
const labelCls = 'block text-xs font-medium uppercase tracking-widest text-text-secondary mb-1';

function RoutingBadge({ affectsMainBalance }) {
  return affectsMainBalance ? (
    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide bg-brand-light text-brand-primary">
      Main Account
    </span>
  ) : (
    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-wide bg-blue-50 text-blue-700">
      Social Fund
    </span>
  );
}

export default function ContributionTypesManager() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', affectsMainBalance: true });
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');

  const fetchTypes = () => {
    axios.get(`${API_BASE_URL}/contribution-types`)
      .then(res => setTypes(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTypes(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/contribution-types`, addForm);
      setAddForm({ name: '', affectsMainBalance: true });
      setShowAdd(false);
      fetchTypes();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add type');
    } finally {
      setAddLoading(false);
    }
  };

  const handleToggleActive = async (type) => {
    try {
      await axios.patch(`${API_BASE_URL}/contribution-types/${type._id}`, { active: !type.active });
      fetchTypes();
    } catch {
      // silent — user sees no visual change if it fails
    }
  };

  const handleRename = async (type) => {
    if (!editName.trim() || editName.trim() === type.name) {
      setEditingId(null);
      return;
    }
    setEditError('');
    try {
      await axios.patch(`${API_BASE_URL}/contribution-types/${type._id}`, { name: editName.trim() });
      setEditingId(null);
      fetchTypes();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to rename');
    }
  };

  const startEdit = (type) => {
    setEditingId(type._id);
    setEditName(type.name);
    setEditError('');
  };

  if (loading) return <p className="text-sm text-text-secondary">Loading contribution types...</p>;

  return (
    <div className="space-y-3">
      {/* Existing types */}
      {types.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-border-dashed rounded-md">
          <p className="text-sm text-text-secondary">No contribution types yet</p>
        </div>
      ) : (
        <div className="divide-y divide-border-default border border-border-default rounded-md overflow-hidden">
          {types.map(type => (
            <div key={type._id} className={`flex items-center gap-3 px-4 py-3 bg-surface-card ${!type.active ? 'opacity-50' : ''}`}>
              {/* Name or edit input */}
              <div className="flex-1 min-w-0">
                {editingId === type._id ? (
                  <div className="flex items-center gap-2">
                    <input
                      className={inputCls + ' h-8'}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(type); if (e.key === 'Escape') setEditingId(null); }}
                      autoFocus
                    />
                    <button type="button" onClick={() => handleRename(type)} className="text-status-paid-text flex-shrink-0"><Check size={15} /></button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-text-secondary flex-shrink-0"><X size={15} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-text-primary truncate">{type.name}</span>
                    {type.isDefault && (
                      <span className="text-xs text-text-muted flex-shrink-0">(default)</span>
                    )}
                  </div>
                )}
                {editError && editingId === type._id && (
                  <p className="text-xs text-status-overdue-text mt-1">{editError}</p>
                )}
              </div>

              <RoutingBadge affectsMainBalance={type.affectsMainBalance} />

              {/* Edit name button — hidden for default types */}
              {!type.isDefault && editingId !== type._id && (
                <button
                  type="button"
                  onClick={() => startEdit(type)}
                  className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
                  title="Rename"
                >
                  <Pencil size={14} />
                </button>
              )}

              {/* Active toggle */}
              <button
                type="button"
                onClick={() => handleToggleActive(type)}
                className={`flex-shrink-0 transition-colors ${type.active ? 'text-brand-primary' : 'text-text-muted'}`}
                title={type.active ? 'Deactivate' : 'Activate'}
              >
                {type.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add type form */}
      {showAdd ? (
        <form onSubmit={handleAdd} className="border border-border-default rounded-md p-4 bg-surface-page space-y-3">
          <div>
            <label className={labelCls}>Type Name</label>
            <input
              className={inputCls}
              value={addForm.name}
              onChange={e => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="e.g. Development Levy"
              required
              autoFocus
            />
          </div>

          {/* Routing toggle */}
          <div>
            <label className={labelCls}>Where does this go?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAddForm({ ...addForm, affectsMainBalance: true })}
                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-md border text-left transition-colors ${
                  addForm.affectsMainBalance
                    ? 'bg-brand-light border-brand-primary/40 text-brand-primary'
                    : 'bg-surface-card border-border-default text-text-secondary'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full mt-0.5 flex-shrink-0 ${addForm.affectsMainBalance ? 'bg-brand-primary' : 'bg-border-default'}`} />
                <div>
                  <p className="text-xs font-semibold leading-tight">Main account</p>
                  <p className="text-xs leading-tight opacity-70">Available to lend</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setAddForm({ ...addForm, affectsMainBalance: false })}
                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-md border text-left transition-colors ${
                  !addForm.affectsMainBalance
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-surface-card border-border-default text-text-secondary'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full mt-0.5 flex-shrink-0 ${!addForm.affectsMainBalance ? 'bg-blue-600' : 'bg-border-default'}`} />
                <div>
                  <p className="text-xs font-semibold leading-tight">Social fund</p>
                  <p className="text-xs leading-tight opacity-70">Tracked separately</p>
                </div>
              </button>
            </div>
          </div>

          {addError && <p className="text-xs text-status-overdue-text">{addError}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => { setShowAdd(false); setAddError(''); setAddForm({ name: '', affectsMainBalance: true }); }}
              className="flex-1 border border-border-default text-text-primary rounded-md py-2 text-sm hover:bg-surface-card transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addLoading}
              className="flex-1 bg-brand-primary hover:bg-brand-hover text-white rounded-md py-2 text-sm font-semibold transition-colors disabled:opacity-60"
            >
              {addLoading ? 'Adding…' : 'Add Type'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm font-medium text-brand-primary border border-brand-primary/30 rounded-md px-4 py-2 hover:bg-brand-light transition-colors"
        >
          <Plus size={15} />
          Add contribution type
        </button>
      )}
    </div>
  );
}
