import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../lib/utils';

const initialForm = { username: '', password: '', role: 'member', name: '', email: '', phone: '' };

const Users = () => {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleting, setDeleting] = useState('');
  const [editId, setEditId] = useState(null);

  const fetchUsers = async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/users`);
      setUsers(res.data);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddOrEditUser = async e => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      if (editId) {
        // Update user details
        await axios.put(`${API_BASE_URL}/users/${editId}`, {
          username: form.username,
          name: form.name,
          email: form.email,
          phone: form.phone,
          role: form.role,
        });
        // If password is set, update password
        if (form.password) {
          await axios.put(`${API_BASE_URL}/users/${editId}/password`, { newPassword: form.password, oldPassword: '' });
        }
        setSuccess('User updated!');
      } else {
        await axios.post(`${API_BASE_URL}/users`, form);
        setSuccess('User created!');
      }
      setForm(initialForm);
      setEditId(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save user');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    setDeleting(id);
    setError(''); setSuccess('');
    try {
      await axios.delete(`${API_BASE_URL}/users/${id}`);
      setSuccess('User deleted!');
      fetchUsers();
    } catch (err) {
      setError('Failed to delete user');
    } finally {
      setDeleting('');
    }
  };

  const handleEdit = (user) => {
    setEditId(user._id);
    setForm({
      username: user.username || '',
      password: '', // blank for security
      role: user.role || 'member',
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
    });
    setSuccess(''); setError('');
  };

  const handleCancelEdit = () => {
    setEditId(null);
    setForm(initialForm);
    setSuccess(''); setError('');
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">User Management</h1>
      <form onSubmit={handleAddOrEditUser} className="bg-white rounded shadow p-4 mb-6 flex flex-col gap-3">
        <h2 className="font-semibold mb-2">{editId ? 'Edit User' : 'Add New User'}</h2>
        <div className="flex gap-2 flex-wrap">
          <input name="username" value={form.username} onChange={handleChange} placeholder="Username" className="border rounded px-3 py-2 flex-1" required />
          <input name="password" value={form.password} onChange={handleChange} placeholder={editId ? 'New Password (optional)' : 'Password'} type="password" className="border rounded px-3 py-2 flex-1" />
        </div>
        <div className="flex gap-2 flex-wrap">
          <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="border rounded px-3 py-2 flex-1" />
          <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className="border rounded px-3 py-2 flex-1" />
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" className="border rounded px-3 py-2 flex-1" />
        </div>
        <select name="role" value={form.role} onChange={handleChange} className="border rounded px-3 py-2 w-40">
          <option value="admin">Admin</option>
          <option value="treasurer">Treasurer</option>
          <option value="loan_officer">Loan Officer</option>
          <option value="member">Member</option>
        </select>
        <div className="flex gap-2 mt-2">
          <button type="submit" className="bg-blue-600 text-white rounded py-2 w-40" disabled={loading}>{loading ? (editId ? 'Saving...' : 'Adding...') : (editId ? 'Save Changes' : 'Add User')}</button>
          {editId && <button type="button" className="bg-gray-300 text-gray-800 rounded py-2 w-32" onClick={handleCancelEdit}>Cancel</button>}
        </div>
        {success && <div className="text-green-600 text-sm mt-1">{success}</div>}
        {error && <div className="text-red-500 text-sm mt-1">{error}</div>}
      </form>
      <h2 className="font-semibold mb-2">All Users</h2>
      {loading && <div>Loading...</div>}
      <table className="w-full border rounded shadow text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Username</th>
            <th className="p-2">Name</th>
            <th className="p-2">Email</th>
            <th className="p-2">Role</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u._id} className="border-t">
              <td className="p-2">{u.username}</td>
              <td className="p-2">{u.name}</td>
              <td className="p-2">{u.email}</td>
              <td className="p-2 capitalize">{u.role.replace('_', ' ')}</td>
              <td className="p-2 flex gap-2">
                <button onClick={() => handleEdit(u)} className="text-blue-600 hover:underline">Edit</button>
                <button onClick={() => handleDelete(u._id)} className="text-red-600 hover:underline" disabled={deleting === u._id}>{deleting === u._id ? 'Deleting...' : 'Delete'}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Users; 