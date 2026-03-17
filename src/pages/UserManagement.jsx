import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { User, Shield, Check, X, AlertCircle, Plus, Search, Mail, Edit2, Power, Trash2, MoreVertical, ShieldCheck } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Input } from '../components/Input';
import './UserManagement.css';

const AVAILABLE_ROLES = [
  'Admin',
  'Moderator',
  'Call Team',
  'Courier Team',
  'Factory Team'
];

export const UserManagement = () => {
  const { user: currentUser, profile: currentProfile, isAdmin, updateProfile } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [userRoles, setUserRoles] = useState({}); // {userId: [roleIds]}
  
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    status: 'active'
  });

  const [addFormData, setAddFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Call Team'
  });

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch users and their roles
      const [{ data: usersData }, { data: rolesData }] = await Promise.all([
        supabase.from('users').select('*'),
        supabase.from('user_roles').select('*')
      ]);

      setUsers(usersData || []);
      
      const rolesMap = {};
      rolesData?.forEach(mapping => {
        if (!rolesMap[mapping.user_id]) rolesMap[mapping.user_id] = [];
        rolesMap[mapping.user_id].push(mapping.role_id);
      });
      setUserRoles(rolesMap);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setEditFormData({
      name: user.name || '',
      email: user.email || '',
      status: user.status || 'active'
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      await api.updateUserProfile(selectedUser.id, editFormData, isAdmin);
      setIsEditModalOpen(false);
      fetchUsers();
    } catch (error) {
      alert("Error updating user: " + error.message);
    }
  };


  const handleDeleteUser = async (user) => {
    if (user.id === (supabase.auth.getUser()?.id)) {
      alert("You cannot delete your own admin account.");
      return;
    }

    if (window.confirm(`Are you sure you want to PERMANENTLY delete user "${user.name}"? This action cannot be undone.`)) {
      try {
        await api.deleteUser(user.id, isAdmin);
        fetchUsers();
      } catch (error) {
        alert("Error deleting user: " + error.message);
      }
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      // Call administrative Edge Function for secure creation
      await api.adminCreateUser({
        name: addFormData.name,
        email: addFormData.email,
        password: addFormData.password,
        role: addFormData.role
      });

      setIsAddModalOpen(false);
      setAddFormData({ name: '', email: '', password: '', role: 'Call Team' });
      
      // Log the addition
      const adminName = currentProfile?.name || currentUser?.email || 'Admin';
      await api.logActivity({
        action_type: 'USER_CREATE',
        changed_by_user_id: currentUser?.id,
        changed_by_user_name: adminName,
        action_description: `${adminName} added a new team member: ${addFormData.name} (${addFormData.role})`
      });

      fetchUsers();
    } catch (error) {
      alert("Error adding user: " + error.message);
    }
  };

  const toggleRole = async (userId, roleId) => {
    const currentRoles = userRoles[userId] || [];
    const hasRole = currentRoles.includes(roleId);

    try {
      const newRoles = hasRole 
        ? currentRoles.filter(r => r !== roleId)
        : [...currentRoles, roleId];

      if (newRoles.length === 0) {
        alert("A user must have at least one role.");
        return;
      }

      await api.updateUserRoles(userId, newRoles, isAdmin);

      // Log the role change
      const adminName = currentProfile?.name || currentUser?.email || 'Admin';
      const targetUser = users.find(u => u.id === userId);
      await api.logActivity({
        action_type: 'ROLE_UPDATE',
        changed_by_user_id: currentUser?.id,
        changed_by_user_name: adminName,
        action_description: `${adminName} updated roles for ${targetUser?.name || 'user'}: [${newRoles.join(', ')}]`
      });

      fetchUsers();
    } catch (error) {
      console.error('Error toggling role:', error);
    }
  };


  if (!isAdmin) {
    return (
      <div className="access-denied">
        <AlertCircle size={48} />
        <h1>Access Denied</h1>
        <p>You do not have permission to access this area.</p>
      </div>
    );
  }

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="user-management">
      <div className="page-header">
        <div>
          <h1>User Management</h1>
          <p>Assign roles, manage account status, and edit team profiles.</p>
        </div>
        <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
          <Plus size={18} /> Add Team Member
        </Button>
      </div>

      <Card className="user-management-card" noPadding>
        <div className="table-header">
          <div className="header-search">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Filter by name or email..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="user-count">
            {filteredUsers.length} total users
          </div>
        </div>

        <div className="user-table-wrapper">
          <table className="user-table">
            <thead>
              <tr>
                <th>Member</th>
                <th className="desktop-only">Contact</th>
                <th>Roles</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="loading-state">Loading team members...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-state">No users found matching your search.</td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className={user.status === 'inactive' ? 'row-deactivated' : ''}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar-sm">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" />
                          ) : (
                            user.name?.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="user-name-cell">
                          <span className="name">{user.name}</span>
                          <span className="mobile-only subtext">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="desktop-only">
                      <span className="email-text">{user.email}</span>
                    </td>
                    <td>
                      <div className="role-badges">
                        {(userRoles[user.id] || []).map(role => (
                          <Badge key={role} variant="primary" className="compact-badge">
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Badge variant={user.status === 'active' ? 'completed' : 'cancelled'}>
                        {user.status === 'active' ? 'Active' : 'Deactivated'}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <div className="action-buttons">
                        <Button 
                          variant="ghost" 
                          size="small"
                          onClick={() => handleEditUser(user)}
                          title="Edit User"
                        >
                          <Edit2 size={16} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="small"
                          className="delete-action"
                          onClick={() => handleDeleteUser(user)}
                          title="Delete User"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Member: ${selectedUser?.name}`}
      >
        <div className="manager-tabs">
          <form onSubmit={handleUpdateUser} className="edit-user-form">
            <section className="modal-section">
              <h4>Profile Details</h4>
              <div className="form-grid">
                <Input 
                  label="Full Name"
                  value={editFormData.name}
                  onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                />
                <Input 
                  label="Email Address"
                  value={editFormData.email}
                  onChange={e => setEditFormData({...editFormData, email: e.target.value})}
                />
              </div>
              <div className="status-toggle">
                <label>Account Status</label>
                <div className="toggle-box">
                  <span className={`status-label ${editFormData.status}`}>
                    {editFormData.status === 'active' ? 'Active' : 'Deactivated'}
                  </span>
                  <Button 
                    variant={editFormData.status === 'active' ? 'cancelled' : 'confirmed'}
                    size="small"
                    type="button"
                    onClick={() => setEditFormData({
                      ...editFormData, 
                      status: editFormData.status === 'active' ? 'inactive' : 'active'
                    })}
                  >
                    {editFormData.status === 'active' ? 'Deactivate Account' : 'Reactivate Account'}
                  </Button>
                </div>
              </div>
            </section>

            <section className="modal-section">
              <h4>Role Permissions</h4>
              <p className="modal-hint">Select multiple roles for combined permissions.</p>
              <div className="role-selector-list">
                {AVAILABLE_ROLES.map(role => {
                  const isAssigned = userRoles[selectedUser?.id]?.includes(role);
                  return (
                    <div 
                      key={role} 
                      className={`role-option ${isAssigned ? 'assigned' : ''}`}
                      onClick={() => toggleRole(selectedUser.id, role)}
                    >
                      <div className="role-option-info">
                        <span className="role-name">{role}</span>
                      </div>
                      {isAssigned ? <Check size={20} className="check-icon" /> : <div className="check-placeholder" />}
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Changes
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Team Member"
      >
        <form onSubmit={handleAddUser} className="add-user-form">
          <div className="modal-hint">
            <strong>Full Managed Account:</strong> You are creating a login-ready account. Provide a secure password for the user.
          </div>
          <Input 
            label="Full Name"
            placeholder="Enter name"
            value={addFormData.name}
            onChange={e => setAddFormData({...addFormData, name: e.target.value})}
            required
          />
          <Input 
            label="Email Address"
            placeholder="user@example.com"
            value={addFormData.email}
            onChange={e => setAddFormData({...addFormData, email: e.target.value})}
            required
          />
          <Input 
            label="Password"
            type="password"
            placeholder="Min 6 characters"
            value={addFormData.password}
            onChange={e => setAddFormData({...addFormData, password: e.target.value})}
            required
            minLength={6}
          />
          <div className="select-wrapper">
            <label className="input-label">Initial Role</label>
            <select 
              className="premium-select"
              value={addFormData.role}
              onChange={e => setAddFormData({...addFormData, role: e.target.value})}
              required
            >
              {AVAILABLE_ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
