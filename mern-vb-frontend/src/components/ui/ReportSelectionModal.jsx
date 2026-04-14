import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { API_BASE_URL } from '../../lib/utils';

const ReportSelectionModal = ({ open, onClose, onSelect }) => {
  const [cycleType, setCycleType] = useState('current');
  const [selectedCycle, setSelectedCycle] = useState('');
  const [availableCycles, setAvailableCycles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      fetchAvailableCycles();
    }
  }, [open]);

  const fetchAvailableCycles = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/reports/cycles`);
      setAvailableCycles(res.data.availableCycles || []);
    } catch (err) {
      setError('Failed to load available cycles');
      console.error('Fetch cycles error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => {
    if (cycleType === 'historical' && !selectedCycle) {
      alert('Please select a historical cycle');
      return;
    }
    onSelect(cycleType, cycleType === 'historical' ? selectedCycle : null);
  };

  const formatCycleDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface-card rounded-xl w-full max-w-md mx-4 shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-border-default">
          <h2 className="text-lg font-bold text-text-primary">Select Report Period</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-page transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="text-center py-6 text-sm text-text-secondary">
              Loading available cycles…
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <p className="text-sm text-status-overdue-text bg-status-overdue-bg rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="space-y-3">
                {/* Current cycle option */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="cycleType"
                    value="current"
                    checked={cycleType === 'current'}
                    onChange={(e) => setCycleType(e.target.value)}
                    className="mt-0.5 accent-brand-primary"
                  />
                  <div>
                    <span className="text-sm font-semibold text-text-primary">Current Cycle</span>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Show data from the currently active cycle
                    </p>
                  </div>
                </label>

                {/* Historical cycle option */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="cycleType"
                    value="historical"
                    checked={cycleType === 'historical'}
                    onChange={(e) => setCycleType(e.target.value)}
                    className="mt-0.5 accent-brand-primary"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-semibold text-text-primary">Historical Cycle</span>
                    <p className="text-xs text-text-secondary mt-0.5">
                      Select a previous cycle to view archived data
                    </p>
                  </div>
                </label>

                {cycleType === 'historical' && (
                  <div className="ml-7">
                    {availableCycles.length > 0 ? (
                      <select
                        value={selectedCycle}
                        onChange={(e) => setSelectedCycle(e.target.value)}
                        className="w-full border border-border-default rounded-xl px-3.5 py-2.5 text-sm text-text-primary bg-surface-card focus:outline-none focus:ring-1 focus:ring-brand-primary"
                      >
                        <option value="">Choose a cycle…</option>
                        {availableCycles.map((cycle) => (
                          <option key={cycle.cycleNumber} value={cycle.cycleNumber}>
                            Cycle {cycle.cycleNumber} ({formatCycleDate(cycle.createdAt)})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-text-muted italic">
                        No historical cycles available
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 pb-5 pt-1">
          <button
            onClick={onClose}
            className="border border-border-default text-text-primary hover:bg-surface-page rounded-full px-4 py-2 text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={cycleType === 'historical' && !selectedCycle}
            className="bg-brand-primary hover:bg-brand-hover text-white rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Generate Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportSelectionModal;
