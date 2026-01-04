import React, { useState, useEffect } from 'react';
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
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE_URL}/reports/cycles`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch cycles');
      
      const data = await response.json();
      setAvailableCycles(data.availableCycles || []);
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
      day: 'numeric' 
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Select Report Period</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="text-center py-4">
            <div className="text-sm text-gray-600">Loading available cycles...</div>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="text-red-500 text-sm">{error}</div>
            )}
            
            <div className="space-y-3">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="cycleType"
                  value="current"
                  checked={cycleType === 'current'}
                  onChange={(e) => setCycleType(e.target.value)}
                  className="text-blue-600"
                />
                <span className="font-medium">Current Cycle</span>
              </label>
              <p className="text-sm text-gray-600 ml-6">
                Show data from the currently active cycle
              </p>

              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="cycleType"
                  value="historical"
                  checked={cycleType === 'historical'}
                  onChange={(e) => setCycleType(e.target.value)}
                  className="text-blue-600"
                />
                <span className="font-medium">Historical Cycle</span>
              </label>
              
              {cycleType === 'historical' && (
                <div className="ml-6 space-y-2">
                  <p className="text-sm text-gray-600">
                    Select a previous cycle to view archived data
                  </p>
                  {availableCycles.length > 0 ? (
                    <select
                      value={selectedCycle}
                      onChange={(e) => setSelectedCycle(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Choose a cycle...</option>
                      {availableCycles.map((cycle) => (
                        <option key={cycle.cycleNumber} value={cycle.cycleNumber}>
                          Cycle {cycle.cycleNumber} ({formatCycleDate(cycle.createdAt)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      No historical cycles available
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={cycleType === 'historical' && !selectedCycle}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportSelectionModal;