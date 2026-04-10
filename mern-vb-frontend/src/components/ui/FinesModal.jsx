import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { API_BASE_URL } from '../../lib/utils';
import { useAuth } from '../../store/auth';
import { FaTrash, FaBan, FaPencilAlt } from 'react-icons/fa';

const statusBadge = (fine) => {
  const base = 'rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em]';
  if (fine.cancelled) return <span className={`${base} bg-surface-page text-text-secondary`}>Cancelled</span>;
  if (fine.paid) return <span className={`${base} bg-[#E8F5E8] text-[#2D7A2D]`}>Paid</span>;
  return <span className={`${base} bg-[#FFF0E0] text-[#B85A00]`}>Unpaid</span>;
};

const FinesModal = ({ open, onClose }) => {
  const { user } = useAuth();
  const isOfficer = ['admin', 'loan_officer', 'treasurer'].includes(user?.role);

  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Edit state
  const [editingFine, setEditingFine] = useState(null);
  const [editForm, setEditForm] = useState({ amount: '', note: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Void state
  const [voidingFine, setVoidingFine] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState('');

  // Delete state
  const [deletingFine, setDeletingFine] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchFines = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/payments/fines`);
      setFines(res.data);
    } catch (err) {
      setFetchError('Failed to load fines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchFines();
  }, [open]);

  const startEdit = (fine) => {
    setEditingFine(fine);
    setEditForm({ amount: fine.amount, note: fine.note || '' });
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError('');
    try {
      await axios.patch(`${API_BASE_URL}/payments/fines/${editingFine._id}`, editForm);
      setEditingFine(null);
      fetchFines();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update fine');
    } finally {
      setEditLoading(false);
    }
  };

  const handleVoid = async () => {
    if (!cancelReason.trim()) {
      setVoidError('Please provide a reason for voiding this fine');
      return;
    }
    setVoidLoading(true);
    setVoidError('');
    try {
      await axios.put(`${API_BASE_URL}/payments/fines/${voidingFine._id}/void`, { cancelReason });
      setVoidingFine(null);
      setCancelReason('');
      fetchFines();
    } catch (err) {
      setVoidError(err.response?.data?.error || 'Failed to void fine');
    } finally {
      setVoidLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await axios.delete(`${API_BASE_URL}/payments/fines/${deletingFine._id}`);
      setDeletingFine(null);
      fetchFines();
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete fine');
    } finally {
      setDeleteLoading(false);
    }
  };

  const inputClass = 'w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary';
  const labelClass = 'block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5';
  const btnPrimary = 'bg-brand-primary hover:bg-brand-hover text-white rounded-full px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-60';
  const btnGhost = 'border border-border-default text-text-primary rounded-full px-5 py-2 text-sm hover:bg-surface-page transition-colors';
  const btnDestructive = 'bg-status-overdue-bg text-status-overdue-text rounded-full px-5 py-2 text-sm font-semibold border border-status-overdue-text/30 transition-colors disabled:opacity-60';

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle>Fines &amp; Penalties</DialogTitle>
          </DialogHeader>

          {loading && <div className="text-center py-4 text-text-secondary text-sm">Loading…</div>}
          {fetchError && <div className="text-status-overdue-text text-sm">{fetchError}</div>}

          {!loading && !fetchError && fines.length === 0 && (
            <div className="text-center py-4 text-text-secondary text-sm">No fines found.</div>
          )}

          {!loading && fines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border-default">
                    {isOfficer && <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Member</th>}
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Amount</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Reason</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Issued</th>
                    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">Status</th>
                    {isOfficer && <th className="px-3 py-3 text-center text-xs font-medium uppercase tracking-wider text-text-secondary">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {fines.map((fine) => (
                    <tr key={fine._id} className="border-b border-border-default last:border-b-0">
                      {isOfficer && (
                        <td className="px-3 py-3 font-medium text-text-primary">{fine.userId?.username || '—'}</td>
                      )}
                      <td className="px-3 py-3 text-text-primary">K{Number(fine.amount).toLocaleString()}</td>
                      <td className="px-3 py-3 max-w-xs text-text-primary" title={fine.note}>{fine.note || '—'}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-text-secondary">
                        {fine.issuedAt ? new Date(fine.issuedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-3">
                        {statusBadge(fine)}
                        {fine.cancelled && fine.cancelReason && (
                          <div className="text-xs text-text-secondary mt-1" title={fine.cancelReason}>
                            {fine.cancelReason}
                          </div>
                        )}
                      </td>
                      {isOfficer && (
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {!fine.paid && !fine.cancelled && (
                              <button
                                title="Edit fine"
                                className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-page transition-colors"
                                onClick={() => startEdit(fine)}
                              >
                                <FaPencilAlt size={13} />
                              </button>
                            )}
                            {!fine.cancelled && (
                              <button
                                title="Void fine"
                                className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-page transition-colors"
                                onClick={() => { setVoidingFine(fine); setCancelReason(''); setVoidError(''); }}
                              >
                                <FaBan size={13} />
                              </button>
                            )}
                            <button
                              title="Delete fine"
                              className="w-8 h-8 flex items-center justify-center rounded-md text-status-overdue-text hover:bg-status-overdue-bg transition-colors"
                              onClick={() => { setDeletingFine(fine); setDeleteError(''); }}
                            >
                              <FaTrash size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Fine Dialog */}
      {editingFine && (
        <Dialog open={true} onOpenChange={() => setEditingFine(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Fine — {editingFine.userId?.username}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-4 mt-2">
              <div>
                <label className={labelClass}>Amount (K)</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Reason / Notes</label>
                <textarea
                  value={editForm.note}
                  onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                  className={`${inputClass} min-h-[80px] resize-none`}
                  placeholder="Reason for fine…"
                />
              </div>
              {editError && <p className="text-status-overdue-text text-xs">{editError}</p>}
              <div className="flex gap-3 mt-1">
                <button type="submit" className={btnPrimary} disabled={editLoading}>
                  {editLoading ? 'Saving…' : 'Save Changes'}
                </button>
                <button type="button" className={btnGhost} onClick={() => setEditingFine(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Void Fine Dialog */}
      {voidingFine && (
        <Dialog open={true} onOpenChange={() => { setVoidingFine(null); setCancelReason(''); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Void Fine — {voidingFine.userId?.username}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-text-primary mb-3">
              Amount: <strong>K{Number(voidingFine.amount).toLocaleString()}</strong>
              {voidingFine.paid && (
                <span className="ml-2 font-medium" style={{ color: '#B85A00' }}>(Paid — bank balance will be reversed)</span>
              )}
            </p>
            <div>
              <label className={labelClass}>Cancel Reason <span className="text-status-overdue-text">*</span></label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className={`${inputClass} min-h-[80px] resize-none`}
                placeholder="Explain why this fine is being voided…"
              />
            </div>
            {voidError && <p className="text-status-overdue-text text-xs mt-1">{voidError}</p>}
            <div className="flex gap-3 mt-4">
              <button className={btnDestructive} disabled={voidLoading} onClick={handleVoid}>
                {voidLoading ? 'Voiding…' : 'Void Fine'}
              </button>
              <button className={btnGhost} onClick={() => { setVoidingFine(null); setCancelReason(''); }} disabled={voidLoading}>
                Cancel
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Fine Dialog */}
      {deletingFine && (
        <Dialog open={true} onOpenChange={() => setDeletingFine(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Fine</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-text-primary mb-2">
              Permanently delete fine of <strong>K{Number(deletingFine.amount).toLocaleString()}</strong> for{' '}
              <strong>{deletingFine.userId?.username}</strong>?
            </p>
            {deletingFine.paid && !deletingFine.cancelled && (
              <p className="text-sm font-medium mb-3" style={{ color: '#B85A00' }}>
                This fine was paid. The collected amount will be reversed from the bank balance.
              </p>
            )}
            {deleteError && <p className="text-status-overdue-text text-xs mb-2">{deleteError}</p>}
            <div className="flex gap-3 mt-2">
              <button className={btnDestructive} disabled={deleteLoading} onClick={handleDelete}>
                {deleteLoading ? 'Deleting…' : 'Delete'}
              </button>
              <button className={btnGhost} onClick={() => setDeletingFine(null)} disabled={deleteLoading}>
                Cancel
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default FinesModal;
