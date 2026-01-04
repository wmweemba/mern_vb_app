import React, { useEffect, useState } from 'react';
import AddSavingsForm from '../features/savings/AddSavingsForm';
import EditSavingsForm from '../features/savings/EditSavingsForm';
import axios from 'axios';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/utils';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { FaPiggyBank, FaCalendarAlt, FaStickyNote, FaEdit } from 'react-icons/fa';

const Savings = () => {
  const { user } = useAuth();
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingSaving, setEditingSaving] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

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

  const handleEditSaving = (saving) => {
    setEditingSaving(saving);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    setIsEditModalOpen(false);
    setEditingSaving(null);
    fetchSavings();
  };

  const handleEditCancel = () => {
    setIsEditModalOpen(false);
    setEditingSaving(null);
  };

  // Group savings by userId
  const savingsByUser = savings.reduce((acc, s) => {
    const key = s.userId?._id || s.userId || s.username;
    if (!acc[key]) {
      acc[key] = {
        user: s.userId,
        total: 0,
        entries: [],
      };
    }
    acc[key].total += Number(s.amount);
    acc[key].entries.push(s);
    return acc;
  }, {});

  return (
    <div className="p-2 sm:p-4 w-full max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">Savings</h1>
      <div className="flex flex-col lg:flex-row gap-8 items-start w-full">
        {canAddSavings && (
          <div className="w-full md:max-w-md lg:mx-0 lg:w-1/3">
            <AddSavingsForm onSuccess={fetchSavings} />
          </div>
        )}
        <div className="w-full lg:w-2/3">
          <h2 className="text-lg font-semibold mb-2">Savings History</h2>
          {loading && <div>Loading...</div>}
          {error && <div className="text-red-500">{error}</div>}
          {!loading && !error && (
            <Accordion type="single" collapsible>
              {Object.values(savingsByUser).map(({ user, total, entries }) => (
                <AccordionItem key={user?._id || user?.username || user} value={user?._id || user?.username || user}>
                  <AccordionTrigger>
                    <div className="flex items-center gap-2 w-full">
                      <FaPiggyBank className="text-green-600" />
                      <span className="font-semibold">{user?.name}</span>
                      <span className="ml-auto text-green-700 font-bold">K{Number(total).toLocaleString()}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2">
                      {entries.sort((a, b) => a.month - b.month).map((s, idx) => (
                        <div key={s._id || idx} className="rounded shadow bg-gray-50 p-2 mb-2 flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-sm">
                            <FaCalendarAlt className="text-gray-500" />
                            <span>Month: <span className="font-semibold">{s.month}</span></span>
                            <span className="ml-4">Amount: <span className="font-semibold text-green-700">K{Number(s.amount).toLocaleString()}</span></span>
                            {canEditSavings && (
                              <button
                                onClick={() => handleEditSaving(s)}
                                className="ml-auto bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded flex items-center gap-1"
                                title="Edit savings entry"
                              >
                                <FaEdit /> Edit
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-700 mt-1">
                            <span>Date: {s.date ? new Date(s.date).toLocaleDateString() : 'N/A'}</span>
                            {s.notes && (
                              <span className="flex items-center gap-1 ml-4"><FaStickyNote className="text-yellow-500" /> Notes: {s.notes}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </div>
      </div>

      {/* Edit Savings Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Savings Entry</DialogTitle>
          </DialogHeader>
          {editingSaving && (
            <EditSavingsForm
              saving={editingSaving}
              onSuccess={handleEditSuccess}
              onCancel={handleEditCancel}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Savings; 