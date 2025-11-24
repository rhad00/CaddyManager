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
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">User Management</h2>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      <UserForm onCreate={handleCreate} />

      {loading ? (
        <div>Loading users...</div>
      ) : (
        <div className="mt-4">
          {users.length === 0 ? (
            <div>No users found.</div>
          ) : (
            <table className="min-w-full bg-white">
              <thead>
                <tr>
                  <th className="py-2">Email</th>
                  <th className="py-2">Role</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t">
                    <td className="py-2">{u.email}</td>
                    <td className="py-2">{u.role}</td>
                    <td className="py-2">{u.status}</td>
                    <td className="py-2">
                      {u.id !== currentUser.id && (
                        <button onClick={() => confirmDelete(u)} className="text-red-600">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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
