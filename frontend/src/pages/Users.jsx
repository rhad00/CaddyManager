import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import UserForm from '../components/UserForm';
import ConfirmModal from '../components/ConfirmModal';

const Users = () => {
  const { token, csrfToken, currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetUserToDelete, setTargetUserToDelete] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users', token);
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
      else setError(data.message || 'Failed to load users');
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleCreate = async (user) => {
    try {
      const res = await api.post('/users', user, token, csrfToken);
      const data = await res.json();
      if (res.ok) {
        setUsers(prev => [data.user, ...prev]);
      } else {
        setError(data.message || 'Failed to create user');
      }
    } catch {
      setError('Failed to create user');
    }
  };

  const confirmDelete = (user) => {
    setTargetUserToDelete(user);
    setConfirmOpen(true);
  };

  const handleDelete = async (id) => {
    try {
      const res = await api.del(`/users/${id}`, token, csrfToken);
      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== id));
      } else {
        const data = await res.json();
        setError(data.message || 'Failed to delete user');
      }
    } catch {
      setError('Failed to delete user');
    } finally {
      setConfirmOpen(false);
      setTargetUserToDelete(null);
    }
  };

  if (!currentUser || currentUser.role !== 'admin') {
    return <div className="p-6">Only administrators may manage users.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="bg-white shadow-sm rounded-md p-6">
        <h2 className="text-2xl font-semibold mb-4">User Management</h2>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        <UserForm onCreate={handleCreate} />

        {loading ? (
          <div className="mt-4 text-gray-600">Loading users...</div>
        ) : (
          <div className="mt-4">
            {users.length === 0 ? (
              <div className="text-gray-600">No users found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Email</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Role</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Status</th>
                      <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map(u => (
                      <tr key={u.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">{u.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{u.role}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{u.status}</td>
                        <td className="px-4 py-3 text-sm">
                          {u.id !== currentUser.id && (
                            <button onClick={() => confirmDelete(u)} className="text-red-600 hover:underline">Delete</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={`Delete user ${targetUserToDelete ? targetUserToDelete.email : ''}`}
        message="Are you sure you want to delete this user? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={async () => {
          if (targetUserToDelete) await handleDelete(targetUserToDelete.id);
        }}
        onCancel={() => {
          setConfirmOpen(false);
          setTargetUserToDelete(null);
        }}
      />
    </div>
  );
};

export default Users;
