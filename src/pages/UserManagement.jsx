import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Calendar, Building, Phone as PhoneIcon, User as UserIcon, 
  Shield, Check, X, AlertCircle, Plus, Search, Mail, 
  Edit2, Power, Trash2, MoreHorizontal, ShieldCheck, ChevronDown, Sparkles 
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { Input } from '../components/Input';
import { PremiumSearch } from '../components/PremiumSearch';
import { createStaggerContainer, pageVariants, scaleItemVariants } from '../lib/motion';
import './UserManagement.css';

const AVAILABLE_ROLES = [
  'Admin',
  'Moderator',
  'Call Team',
  'Courier Team',
  'Factory Team',
  'Digital Marketer'
];

const ROLE_DESCRIPTIONS = {
  'Admin': 'Full system access — orders, users, reports, all panels',
  'Moderator': 'Order management and inventory access',
  'Call Team': 'Handles incoming customer calls and order confirmations',
  'Courier Team': 'Manages deliveries and shipment tracking',
  'Factory Team': 'Manages production tasks and factory workflow',
  'Digital Marketer': 'Tracks daily ad spend, campaign performance, and reports',
};

export const UserManagement = () => {
  const userCardGridVariants = createStaggerContainer(0.08, 0.04);
  const { user: currentUser, profile: currentProfile, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
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

  const [resetPasswordData, setResetPasswordData] = useState({
    userId: '',
    userName: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

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
    if (user.id === currentUser?.id) {
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
      await api.adminCreateUser({
        name: addFormData.name,
        email: addFormData.email,
        password: addFormData.password,
        role: addFormData.role
      });

      setIsAddModalOpen(false);
      setAddFormData({ name: '', email: '', password: '', role: 'Call Team' });
      
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

  const handleResetPasswordClick = (user) => {
    setResetPasswordData({
      userId: user.id,
      userName: user.name,
      newPassword: '',
      confirmPassword: ''
    });
    setIsResetModalOpen(true);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
    if (resetPasswordData.newPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    setIsResetting(true);
    try {
      await api.adminResetPassword(resetPasswordData.userId, resetPasswordData.newPassword);
      
      const adminName = currentProfile?.name || currentUser?.email || 'Admin';
      await api.logActivity({
        action_type: 'PASSWORD_RESET',
        changed_by_user_id: currentUser?.id,
        changed_by_user_name: adminName,
        action_description: `${adminName} reset the password for ${resetPasswordData.userName}`
      });

      alert(`Password for ${resetPasswordData.userName} has been reset successfully.`);
      setIsResetModalOpen(false);
    } catch (error) {
      alert("Error resetting password: " + error.message);
    } finally {
      setIsResetting(false);
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
      <motion.div 
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="user-header-container"
      >
        <div className="page-header users-header elite-glass">
          <div className="header-content-left">
            <div className="title-group">
              <h1 className="premium-title">{filteredUsers.length} Team Members</h1>
              <p className="premium-subtitle">Manage roles, security, and profile details for your staff.</p>
            </div>
          </div>

          <div className="header-actions">
            <PremiumSearch
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search candidates/staff..."
              suggestions={
                searchTerm ? users.filter(u => 
                  u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  u.email?.toLowerCase().includes(searchTerm.toLowerCase())
                ).slice(0, 5).map(u => ({
                  id: u.id,
                  label: u.name,
                  sub: u.email,
                  type: 'user',
                  original: u
                })) : []
              }
              onSuggestionClick={(item) => {
                if (item.type === 'user') {
                  setSearchTerm(item.label);
                }
              }}
            />
            
            <Button 
              variant="primary" 
              className="add-member-btn-elite premium-glow-btn" 
              onClick={() => setIsAddModalOpen(true)}
            >
              <Plus size={20} />
              <span className="btn-text">Add Candidate</span>
            </Button>
          </div>
        </div>
      </motion.div>

      <div className="user-grid-container">
        {loading ? (
          <div className="loading-state-elite">
            <div className="shimmer-card"></div>
            <div className="shimmer-card"></div>
            <div className="shimmer-card"></div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state-elite">
            <AlertCircle size={48} />
            <h3>No Members Found</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        ) : (
          <motion.div 
            className="user-cards-grid"
            initial="hidden"
            animate="visible"
            variants={userCardGridVariants}
          >
            {filteredUsers.map(user => (
              <motion.div 
                key={user.id}
                variants={scaleItemVariants}
                className={`elite-user-card ${user.status === 'inactive' ? 'deactivated' : ''}`}
              >
                <div className="card-top">
                  <div className="user-profile-compact">
                    <div className="avatar-wrapper-elite">
                      <div className="avatar-circle-elite">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" />
                        ) : (
                          <div className="initials-elite">{user.name?.charAt(0).toUpperCase()}</div>
                        )}
                        <div className={`status-dot ${user.status === 'active' ? 'online' : 'offline'}`}></div>
                      </div>
                    </div>
                    <div className="user-main-info">
                      <h3 className="user-name-elite">{user.name}</h3>
                      <span className="user-primary-role">{(userRoles[user.id] || [])[0] || 'Member'}</span>
                    </div>
                  </div>
                  
                  <div className="card-actions-popover">
                    <Button variant="ghost" size="small" className="dot-menu-btn">
                      <MoreHorizontal size={20} />
                    </Button>
                    <div className="popover-menu-elite">
                      <button onClick={() => handleEditUser(user)}><Edit2 size={14} /> Edit Profile</button>
                      <button onClick={() => handleResetPasswordClick(user)}><Shield size={14} /> Reset Pass</button>
                      <button className="del" onClick={() => handleDeleteUser(user)}><Trash2 size={14} /> Remove</button>
                    </div>
                  </div>
                </div>

                <div className="card-details-grid">
                  <div className="detail-item">
                    <span className="detail-label">Department</span>
                    <span className="detail-value">{(userRoles[user.id] || [])[0] || 'Staff'} Team</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Hired Date</span>
                    <span className="detail-value">{new Date(user.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="card-contact-info">
                  <div className="contact-row">
                    <Mail size={14} className="contact-icon" />
                    <span className="contact-text">{user.email}</span>
                  </div>
                  <div className="contact-row">
                    <PhoneIcon size={14} className="contact-icon" />
                    <span className="contact-text">(229) 555-0109</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

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
                        <span className="role-desc">{ROLE_DESCRIPTIONS[role]}</span>
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
          <div className="elite-select-wrapper">
            <label className="input-label">Initial Role</label>
            <select 
              className="elite-select"
              value={addFormData.role}
              onChange={e => setAddFormData({...addFormData, role: e.target.value})}
              required
            >
              {AVAILABLE_ROLES.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <ChevronDown size={14} className="elite-select-chevron" />
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

      {/* Reset Password Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => !isResetting && setIsResetModalOpen(false)}
        title={`Reset Password: ${resetPasswordData.userName}`}
      >
        <form onSubmit={handleResetPassword} className="reset-password-form">
          <div className="modal-hint warning">
            <AlertCircle size={16} />
            <span>You are about to change the security credentials for this user. This will take effect immediately.</span>
          </div>
          
          <Input 
            label="New Password"
            type="password"
            placeholder="Min 6 characters"
            value={resetPasswordData.newPassword}
            onChange={e => setResetPasswordData({...resetPasswordData, newPassword: e.target.value})}
            required
            minLength={6}
            autoFocus
          />
          
          <Input 
            label="Confirm New Password"
            type="password"
            placeholder="Repeat new password"
            value={resetPasswordData.confirmPassword}
            onChange={e => setResetPasswordData({...resetPasswordData, confirmPassword: e.target.value})}
            required
            minLength={6}
          />

          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsResetModalOpen(false)} disabled={isResetting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isResetting}>
              {isResetting ? 'Resetting...' : 'Confirm Reset'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
