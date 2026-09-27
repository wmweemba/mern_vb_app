import React, { useEffect, useState, useRef } from 'react';
import AddSavingsForm from '../features/savings/AddSavingsForm';
import EditSavingsForm from '../features/savings/EditSavingsForm';
import SlideoverDrawer from '../components/ui/SlideoverDrawer';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { FaPiggyBank, FaCalendarAlt, FaStickyNote, FaEdit, FaBan } from 'react-icons/fa';

const btnPrimary = 'bg-brand-primary hover:bg-brand-hover text-white font-semibold rounded-md w-full py-3 text-sm transition-colors';
const btnGhost = 'border border-border-default text-text-primary rounded-full px-5 py-2 text-sm hover:bg-surface-page transition-colors';
const btnDestructive = 'bg-status-overdue-bg text-status-overdue-text rounded-full px-5 py-2 text-sm font-semibold border border-status-overdue-text/30 transition-colors disabled:opacity-60';
const labelClass = 'block text-xs font-medium uppercase tracking-wider text-text-secondary mb-1.5';
const inputClass = 'w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary';

const Savings = () => {
  const { user } = useAuth();
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddSavings, setShowAddSavings] = useState(false);
  const [editingSaving, setEditingSaving] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [reversingSaving, setReversingSaving] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseError, setReverseError] = useState('');
  const accordionRefs = useRef({});

  const fetchSavings = async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/savings`);
      setSavings(res.data);
    } catch (err) {
      setError('Failed to load savings history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSavings(); }, []);

  const canAddSavings = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);
  const canEditSavings = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);
  const canReverseSavings = ['admin', 'treasurer', 'loan_officer'].includes(user?.role);

  const handleEditSaving = (saving) => { setEditingSaving(saving); setIsEditModalOpen(true); };
  const handleEditSuccess = () => { setIsEditModalOpen(false); setEditingSaving(null); fetchSavings(); };
  const handleEditCancel = () => { setIsEditModalOpen(false); setEditingSaving(null); };

  const handleReverse = async () => {
    if (!cancelReason.trim()) {
      setReverseError('Please provide a reason for reversing this entry');
      return;
    }
    setReverseLoading(true);
    setReverseError('');
    try {
      await axios.put(`${API_BASE_URL}/savings/${reversingSaving._id}/reverse`, { cancelReason });
      setReversingSaving(null);
      setCancelReason('');
      fetchSavings();
    } catch (err) {
      setReverseError(err.response?.data?.error || 'Failed to reverse savings entry');
    } finally {
      setReverseLoading(false);
    }
  };

  const handleAccordionChange = (value) => {
    if (value && accordionRefs.current[value]) {
      setTimeout(() => {
        accordionRefs.current[value].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const savingsByUser = savings.reduce((acc, s) => {
    const key = s.userId?._id || s.userId || s.username;
    if (!acc[key]) acc[key] = { user: s.userId, total: 0, entries: [] };
    if (!s.cancelled) acc[key].total += Number(s.amount);
    acc[key].entries.push(s);
    return acc;
  }, {});

  return (
    <div className="py-4 w-full max-w-2xl mx-auto mobile-safe-bottom px-0">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-text-primary">Savings</h1>
        {canAddSavings && (
          <button
            onClick={() => setShowAddSavings(true)}
            className="bg-brand-primary hover:bg-brand-hover text-white text-sm font-semibold rounded-full px-4 py-2 transition-colors"
          >
            + Record Savings
          </button>
        )}
      </div>

      {loading && <div className="text-text-secondary text-sm">Loading...</div>}
      {error && <div className="text-status-overdue-text text-sm">{error}</div>}

      {!loading && !error && (
        <Accordion type="single" collapsible onValueChange={handleAccordionChange}>
          {Object.values(savingsByUser).map(({ user, total, entries }) => {
            const itemKey = user?._id || user?.username || user;
            return (
              <AccordionItem
                key={itemKey}
                value={itemKey}
                ref={(el) => accordionRefs.current[itemKey] = el}
                className="scroll-mt-4 bg-surface-card rounded-lg mb-2 border border-border-default px-4"
              >
                <AccordionTrigger className="py-4">
                  <div className="flex items-center gap-2 w-full">
                    <FaPiggyBank className="text-text-secondary flex-shrink-0" />
                    <span className="font-semibold text-text-primary">{user?.name}</span>
                    <span className="ml-auto font-bold text-amount-positive">K{Number(total).toLocaleString()}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2 pb-3">
                    {entries.sort((a, b) => a.month - b.month).map((s, idx) => (
                      <div key={s._id || idx} className={`rounded-md border border-border-default p-3 flex flex-col gap-1 bg-surface-page ${s.cancelled ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-2 text-sm">
                          <FaCalendarAlt className="text-text-secondary flex-shrink-0" />
                          <span className="text-text-secondary">Month <span className="font-semibold text-text-primary">{s.month}</span></span>
                          <span className={`ml-auto font-bold ${s.cancelled ? 'line-through text-text-secondary' : 'text-amount-positive'}`}>K{Number(s.amount).toLocaleString()}</span>
                          {!s.cancelled && canEditSavings && (
                            <button
                              onClick={() => handleEditSaving(s)}
                              className="ml-2 border border-border-default text-text-secondary text-xs px-2 py-1 rounded-full hover:bg-surface-card flex items-center gap-1 transition-colors"
                              title="Edit savings entry"
                            >
                              <FaEdit size={10} /> Edit
                            </button>
                          )}
                          {!s.cancelled && canReverseSavings && (
                            <button
                              onClick={() => { setReversingSaving(s); setCancelReason(''); setReverseError(''); }}
                              className="border border-border-default text-text-secondary text-xs px-2 py-1 rounded-full hover:bg-surface-card flex items-center gap-1 transition-colors"
                              title="Reverse savings entry"
                            >
                              <FaBan size={10} /> Reverse
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5">
                          <span>Date: {s.date ? new Date(s.date).toLocaleDateString() : 'N/A'}</span>
                          {s.notes && (
                            <span className="flex items-center gap-1 ml-4">
                              <FaStickyNote className="text-text-muted" /> {s.notes}
                            </span>
                          )}
                        </div>
                        {s.cancelled && (
                          <div className="text-xs font-medium text-text-secondary mt-1">
                            Reversed{s.cancelReason ? ` — ${s.cancelReason}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Edit Savings Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Savings Entry</DialogTitle></DialogHeader>
          {editingSaving && (
            <EditSavingsForm
              saving={editingSaving}
              onSuccess={handleEditSuccess}
              onCancel={handleEditCancel}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Add Savings Drawer */}
      <SlideoverDrawer
        open={showAddSavings}
        onClose={() => setShowAddSavings(false)}
        title="Record Savings"
        footer={
          <button type="submit" form="add-savings-form" className={btnPrimary}>
            Record Savings
          </button>
        }
      >
        <AddSavingsForm
          formId="add-savings-form"
          onSuccess={() => { setShowAddSavings(false); fetchSavings(); }}
        />
      </SlideoverDrawer>

      {/* Reverse Savings Dialog */}
      {reversingSaving && (
        <Dialog open={true} onOpenChange={() => { setReversingSaving(null); setCancelReason(''); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reverse Savings Entry — {reversingSaving.userId?.name}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-text-primary mb-3">
              Amount: <strong>K{Number(reversingSaving.amount).toLocaleString()}</strong> (Month {reversingSaving.month})
              <span className="ml-2 font-medium" style={{ color: '#B85A00' }}>(Bank balance will be reversed)</span>
            </p>
            <div>
              <label className={labelClass}>Reason <span className="text-status-overdue-text">*</span></label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className={`${inputClass} min-h-[80px] resize-none`}
                placeholder="Explain why this entry is being reversed…"
              />
            </div>
            {reverseError && <p className="text-status-overdue-text text-xs mt-1">{reverseError}</p>}
            <div className="flex gap-3 mt-4">
              <button className={btnDestructive} disabled={reverseLoading} onClick={handleReverse}>
                {reverseLoading ? 'Reversing…' : 'Reverse Entry'}
              </button>
              <button className={btnGhost} onClick={() => { setReversingSaving(null); setCancelReason(''); }} disabled={reverseLoading}>
                Cancel
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Savings;
