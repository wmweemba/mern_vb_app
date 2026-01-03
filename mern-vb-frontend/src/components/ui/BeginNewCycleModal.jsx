import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { Button } from './button';
import axios from 'axios';
import { API_BASE_URL } from '../../lib/utils';
import { toast } from 'sonner';

const BeginNewCycleModal = ({ isOpen, onClose, onSuccess }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState(1); // 1: Confirmation, 2: Processing, 3: Complete

  const handleBeginNewCycle = async () => {
    if (step !== 1) return;

    setIsProcessing(true);
    setStep(2);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_BASE_URL}/cycle/begin-new-cycle`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { cycleNumber, backupReports, resetData } = response.data;

      // Download backup reports
      if (backupReports) {
        downloadReport('loans_backup.csv', backupReports.loansCSV);
        downloadReport('savings_backup.csv', backupReports.savingsCSV);
        downloadReport('transactions_backup.csv', backupReports.transactionsCSV);
        downloadReport('fines_backup.csv', backupReports.finesCSV);
      }

      setStep(3);
      toast.success(`New cycle ${cycleNumber} has been successfully initiated!`);
      
      // Auto-close after 3 seconds and trigger success callback
      setTimeout(() => {
        onClose();
        setStep(1);
        onSuccess();
      }, 3000);

    } catch (error) {
      console.error('Error beginning new cycle:', error);
      toast.error(error.response?.data?.error || 'Failed to begin new cycle');
      setIsProcessing(false);
      setStep(1);
    }
  };

  const downloadReport = (filename, csvContent) => {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
      setStep(1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">
            {step === 1 && "⚠️ Begin New Cycle"}
            {step === 2 && "🔄 Processing New Cycle"}
            {step === 3 && "✅ New Cycle Complete"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {step === 1 && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-semibold text-red-800 mb-2">
                  This action will reset the entire banking cycle
                </h3>
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• All current loans will be reset to zero</li>
                  <li>• All savings balances will be reset to zero</li>
                  <li>• All fines will be cleared</li>
                  <li>• Bank balance will be reset to zero</li>
                  <li>• Historical data will be preserved for reports</li>
                </ul>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-2">
                  Before proceeding, backup reports will be generated:
                </h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Loans report (CSV)</li>
                  <li>• Savings report (CSV)</li>
                  <li>• Transactions report (CSV)</li>
                  <li>• Fines report (CSV)</li>
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Warning:</strong> This action cannot be undone. Make sure all end-of-cycle activities are complete.
                </p>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Processing new cycle...</p>
              <p className="text-sm text-gray-500 mt-2">Generating backup reports and resetting balances</p>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-8">
              <div className="text-6xl text-green-500 mb-4">✅</div>
              <p className="text-lg font-semibold text-green-800 mb-2">New Cycle Initiated Successfully!</p>
              <p className="text-sm text-gray-600">Backup reports have been downloaded</p>
              <p className="text-sm text-gray-500">This dialog will close automatically</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 1 && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleBeginNewCycle}
                disabled={isProcessing}
              >
                Begin New Cycle
              </Button>
            </>
          )}
          {step === 2 && (
            <p className="text-sm text-gray-500 w-full text-center">
              Please wait while the new cycle is being processed...
            </p>
          )}
          {step === 3 && (
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BeginNewCycleModal;