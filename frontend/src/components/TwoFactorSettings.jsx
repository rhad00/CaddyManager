import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function TwoFactorSettings() {
  const { token, csrfToken } = useAuth();
  const [status, setStatus] = useState(null); // null | { enabled: bool }
  const [step, setStep] = useState('idle'); // idle | setup | verify | disable
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [loading, setLoading] = useState(false);

  const headers = (extra = {}) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-csrf-token': csrfToken,
    ...extra,
  });

  const loadStatus = async () => {
    const res = await fetch(`${API_URL}/auth/2fa/status`, { headers: headers() });
    const d = await res.json();
    if (d.success) setStatus(d);
  };

  useEffect(() => { loadStatus(); }, []);

  const startSetup = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/setup`, { method: 'POST', headers: headers() });
      const d = await res.json();
      if (!d.success) throw new Error(d.message);
      setQr(d.qr);
      setSecret(d.secret);
      setStep('setup');
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  };

  const confirmSetup = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/verify`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message);
      setBackupCodes(d.backup_codes);
      setCode('');
      setStep('backup');
      await loadStatus();
      toast.success('2FA enabled successfully');
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  };

  const startDisable = () => { setStep('disable'); setCode(''); };

  const confirmDisable = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/2fa/disable`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.message);
      setStep('idle');
      setCode('');
      await loadStatus();
      toast.success('2FA disabled');
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  };

  if (!status) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-medium text-gray-900">Two-Factor Authentication</h3>
          <p className="text-sm text-gray-500">
            {status.enabled ? '2FA is currently enabled on your account.' : 'Add an extra layer of security to your account.'}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
          {status.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      {step === 'idle' && (
        status.enabled
          ? <button onClick={startDisable} className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50">Disable 2FA</button>
          : <button onClick={startSetup} disabled={loading} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Setting up…' : 'Enable 2FA'}
            </button>
      )}

      {step === 'setup' && (
        <div className="space-y-4 border rounded-lg p-4">
          <p className="text-sm text-gray-700">
            Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to confirm.
          </p>
          {qr && <img src={qr} alt="2FA QR code" className="mx-auto w-48 h-48 border p-2 rounded" />}
          {secret && (
            <p className="text-xs text-center text-gray-500 font-mono bg-gray-50 rounded p-2 select-all">
              Manual key: {secret}
            </p>
          )}
          <form onSubmit={confirmSetup} className="flex gap-2 justify-center">
            <input type="text" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)}
              placeholder="6-digit code" maxLength={6} required autoFocus
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-36 text-center tracking-widest" />
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => setStep('idle')} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
          </form>
        </div>
      )}

      {step === 'backup' && backupCodes && (
        <div className="space-y-3 border rounded-lg p-4 bg-yellow-50">
          <p className="text-sm font-medium text-yellow-800">Save your backup codes</p>
          <p className="text-xs text-yellow-700">Each code can be used once if you lose access to your authenticator app. Store them somewhere safe.</p>
          <div className="grid grid-cols-2 gap-1">
            {backupCodes.map((c, i) => (
              <span key={i} className="font-mono text-xs bg-white border rounded px-2 py-1 text-center">{c}</span>
            ))}
          </div>
          <button onClick={() => setStep('idle')} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">
            Done
          </button>
        </div>
      )}

      {step === 'disable' && (
        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm text-gray-700">Enter your current authenticator code to disable 2FA.</p>
          <form onSubmit={confirmDisable} className="flex gap-2">
            <input type="text" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)}
              placeholder="6-digit code" maxLength={6} required autoFocus
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-36 text-center tracking-widest" />
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
              {loading ? 'Disabling…' : 'Disable'}
            </button>
            <button type="button" onClick={() => setStep('idle')} className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50">Cancel</button>
          </form>
        </div>
      )}
    </div>
  );
}
