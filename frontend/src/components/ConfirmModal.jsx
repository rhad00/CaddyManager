import React, { useEffect, useRef } from 'react';

const ConfirmModal = ({ open, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel }) => {
  const cancelRef = useRef(null);

  // Focus the cancel button when the modal opens and trap focus
  useEffect(() => {
    if (open && cancelRef.current) {
      cancelRef.current.focus();
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full p-6">
        <h3 id="confirm-modal-title" className="text-lg font-medium mb-2">{title}</h3>
        <p id="confirm-modal-desc" className="text-sm text-gray-600 mb-4">{message}</p>
        <div className="flex justify-end space-x-2">
          <button ref={cancelRef} onClick={onCancel} className="px-4 py-2 bg-gray-100 rounded">{cancelText}</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded">{confirmText}</button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
