import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { API_BASE_URL } from '../../lib/utils';
import { useAuth } from '../../store/auth';
import { FaTrash, FaBan, FaPencilAlt, FaCheck, FaTimes } from 'react-icons/fa';

const statusBadge = (fine) => {
  if (fine.cancelled) return <span className="px-2 py-0.5 rounded text-xs bg-gray-200 text-gray-600">Cancelled</span>;
  if (fine.paid) return <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-700">Paid</span>;
  return <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">Unpaid</span>;
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

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <DialogTitle>Fines &amp; Penalties</DialogTitle>
          </DialogHeader>

          {loading && <div className="text-center py-4 text-gray-500">Loading...</div>}
          {fetchError && <div className="text-red-500 text-sm">{fetchError}</div>}

          {!loading && !fetchError && fines.length === 0 && (
            <div className="text-center py-4 text-gray-500">No fines found.</div>
          )}

          {!loading && fines.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100 text-gray-700">
                    {isOfficer && <th className="px-3 py-2 text-left">Member</th>}
                    <th className="px-3 py-2 text-left">Amount</th>
                    <th className="px-3 py-2 text-left">Reason</th>
                    <th className="px-3 py-2 text-left">Issued</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    {isOfficer && <th className="px-3 py-2 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {fines.map((fine) => (
                    <tr key={fine._id} className="border-b last:border-b-0 hover:bg-gray-50">
                      {isOfficer && (
                        <td className="px-3 py-2 font-medium">{fine.userId?.username || '—'}</td>
                      )}
                      <td className="px-3 py-2">K{Number(fine.amount).toLocaleString()}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate" title={fine.note}>{fine.note || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {fine.issuedAt ? new Date(fine.issuedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {statusBadge(fine)}
                        {fine.cancelled && fine.cancelReason && (
                          <div className="text-xs text-gray-500 mt-0.5" title={fine.cancelReason}>
                            Reason: {fine.cancelReason}
                          </div>
                        )}
                      </td>
                      {isOfficer && (
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-2">
                            {!fine.paid && !fine.cancelled && (
                              <button
                                title="Edit fine"
                                className="text-blue-600 hover:text-blue-800 p-1 rounded"
                                onClick={() => startEdit(fine)}
                              >
                                <FaPencilAlt />
                              </button>
                            )}
                            {!fine.cancelled && (
                              <button
                                title="Void fine"
                                className="text-orange-500 hover:text-orange-700 p-1 rounded"
                                onClick={() => { setVoidingFine(fine); setCancelReason(''); setVoidError(''); }}
                              >
                                <FaBan />
                              </button>
                            )}
                            <button
                              title="Delete fine"
                              className="text-red-600 hover:text-red-800 p-1 rounded"
                              onClick={() => { setDeletingFine(fine); setDeleteError(''); }}
                            >
                              <FaTrash />
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
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-3 mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Amount (K)</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                  className="border rounded px-3 py-2"
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Reason / Notes</label>
                <textarea
                  value={editForm.note}
                  onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                  className="border rounded px-3 py-2 min-h-[80px]"
                  placeholder="Reason for fine..."
                />
              </div>
              {editError && <div className="text-red-500 text-sm">{editError}</div>}
              <div className="flex gap-2 mt-1">
                <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2" disabled={editLoading}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className="bg-gray-300 text-gray-700 rounded px-4 py-2" onClick={() => setEditingFine(null)}>
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
            <div className="mb-2 text-sm text-gray-700">
              Amount: <strong>K{Number(voidingFine.amount).toLocaleString()}</strong>
              {voidingFine.paid && (
                <span className="ml-2 text-orange-600 font-medium">(Paid — bank balance will be reversed)</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Cancel Reason <span className="text-red-500">*</span></label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="border rounded px-3 py-2 min-h-[80px]"
                placeholder="Explain why this fine is being voided..."
              />
            </div>
            {voidError && <div className="text-red-500 text-sm mt-1">{voidError}</div>}
            <div className="flex gap-2 mt-3">
              <button
                className="bg-orange-500 text-white rounded px-4 py-2"
                disabled={voidLoading}
                onClick={handleVoid}
              >
                {voidLoading ? 'Voiding...' : 'Void Fine'}
              </button>
              <button
                className="bg-gray-300 text-gray-700 rounded px-4 py-2"
                onClick={() => { setVoidingFine(null); setCancelReason(''); }}
                disabled={voidLoading}
              >
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
            <div className="mb-2 text-sm text-gray-700">
              Permanently delete fine of <strong>K{Number(deletingFine.amount).toLocaleString()}</strong> for{' '}
              <strong>{deletingFine.userId?.username}</strong>?
              {deletingFine.paid && !deletingFine.cancelled && (
                <div className="mt-1 text-orange-600 font-medium">
                  This fine was paid. The collected amount will be reversed from the bank balance.
                </div>
              )}
            </div>
            {deleteError && <div className="text-red-500 text-sm mb-2">{deleteError}</div>}
            <div className="flex gap-2 mt-2">
              <button
                className="bg-red-600 text-white rounded px-4 py-2"
                disabled={deleteLoading}
                onClick={handleDelete}
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
              <button
                className="bg-gray-300 text-gray-700 rounded px-4 py-2"
                onClick={() => setDeletingFine(null)}
                disabled={deleteLoading}
              >
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
