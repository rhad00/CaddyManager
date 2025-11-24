import React, { useState } from 'react';

const UserForm = ({ onCreate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('read-only');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    await onCreate({ email, password, role });
    setEmail('');
    setPassword('');
    setRole('read-only');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm text-gray-600">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 p-2 border rounded w-full" />
      </div>
      <div>
        <label className="block text-sm text-gray-600">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 p-2 border rounded w-full" />
      </div>
      <div>
        <label className="block text-sm text-gray-600">Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 p-2 border rounded w-full">
          <option value="read-only">Read-only</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Create User</button>
      </div>
    </form>
  );
};

export default UserForm;
