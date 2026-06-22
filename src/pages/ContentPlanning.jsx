import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Calendar, User, DollarSign, Video, Play, CheckCircle2,
  Trash2, Plus, Edit2, Check, X, AlertTriangle, HelpCircle,
  FolderPlus, Search, RefreshCw, Layers
} from 'lucide-react';
import './ContentPlanning.css';

export const ContentPlanning = () => {
  const { hasAnyRole } = useAuth();
  
  // State management
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  });
  
  const [strategist, setStrategist] = useState('PAPPU');
  const [isEditingStrategist, setIsEditingStrategist] = useState(false);
  const [tempStrategist, setTempStrategist] = useState('PAPPU');
  
  const [plans, setPlans] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Row editing states
  const [editingRowId, setEditingRowId] = useState(null);
  const [editingData, setEditingData] = useState(null);
  const [originalRowData, setOriginalRowData] = useState(null);
  
  // Risk modal confirmation state
  const [riskModal, setRiskModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    targetField: '',
    oldValue: '',
    newValue: '',
    onConfirm: null,
    onCancel: null
  });
  
  // Modal to add new product
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    productId: '',
    customName: '',
    contentNeeded: 0,
    inhouseCount: 0,
    inhouseUnitCost: 0,
    brandName: '',
    brandUnitCount: 0,
    brandUnitCost: 0,
    otherCost: 0
  });
  
  // Generate month list (past 6 months + future 6 months)
  const monthOptions = (() => {
    const list = [];
    const d = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    for (let i = -6; i <= 6; i++) {
      const targetDate = new Date(d.getFullYear(), d.getMonth() + i, 1);
      list.push(`${months[targetDate.getMonth()]} ${targetDate.getFullYear()}`);
    }
    return list;
  })();

  // Fetch Inventory for Product drop-downs
  const fetchInventory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .select('id, name, unit_price')
        .order('name', { ascending: true });
        
      if (error) throw error;
      setInventoryProducts(data || []);
    } catch (err) {
      console.error('Error fetching inventory products:', err);
    }
  }, []);

  // Fetch strategy board plans for selected Month
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('content_plans')
        .select('*')
        .eq('month', selectedMonth)
        .order('created_at', { ascending: true });
        
      if (error) throw error;
      setPlans(data || []);
      
      // Get strategist name from the first record if exists
      if (data && data.length > 0) {
        setStrategist(data[0].strategist_name || 'PAPPU');
        setTempStrategist(data[0].strategist_name || 'PAPPU');
      } else {
        setStrategist('PAPPU');
        setTempStrategist('PAPPU');
      }
    } catch (err) {
      console.error('Error loading content plans:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Calculate live aggregates
  const aggregates = plans.reduce((acc, plan) => {
    const inhouseTotal = (plan.inhouse_count || 0) * (plan.inhouse_unit_cost || 0);
    const brandTotal = (plan.brand_unit_count || 0) * (plan.brand_unit_cost || 0);
    const totalRowCost = inhouseTotal + brandTotal + (plan.other_cost || 0);
    
    return {
      totalNeeded: acc.totalNeeded + (plan.content_needed || 0),
      totalReceived: acc.totalReceived + (plan.received_count || 0),
      totalInProgress: acc.totalInProgress + (plan.in_progress_count || 0),
      inhouseCost: acc.inhouseCost + inhouseTotal,
      brandCost: acc.brandCost + brandTotal,
      otherCost: acc.otherCost + (plan.other_cost || 0),
      totalSpend: acc.totalSpend + totalRowCost
    };
  }, {
    totalNeeded: 0,
    totalReceived: 0,
    totalInProgress: 0,
    inhouseCost: 0,
    brandCost: 0,
    otherCost: 0,
    totalSpend: 0
  });

  // Check if anything is dirty
  const isRowDirty = (rowId) => {
    if (editingRowId !== rowId || !editingData || !originalRowData) return false;
    return JSON.stringify(editingData) !== JSON.stringify(originalRowData);
  };

  // Strategist name update
  const handleSaveStrategist = async () => {
    if (!tempStrategist.trim()) return;
    setActionLoading(true);
    try {
      // Show warning since updating strategist impacts all records for this month
      setRiskModal({
        isOpen: true,
        title: '⚠️ Confirm Owner/Strategist Change',
        message: `You are changing the content strategy owner for ${selectedMonth} to "${tempStrategist}". This will update all planned campaign entries.`,
        targetField: 'Strategist Name',
        oldValue: strategist,
        newValue: tempStrategist,
        onConfirm: async () => {
          try {
            // Update local state
            setStrategist(tempStrategist);
            setIsEditingStrategist(false);
            
            // Sync with Supabase (update strategist_name for all records of this month)
            if (plans.length > 0) {
              const { error } = await supabase
                .from('content_plans')
                .update({ strategist_name: tempStrategist })
                .eq('month', selectedMonth);
              if (error) throw error;
            }
            fetchPlans();
          } catch (e) {
            console.error('Failed updating strategist:', e);
          } finally {
            setRiskModal(prev => ({ ...prev, isOpen: false }));
          }
        },
        onCancel: () => {
          setTempStrategist(strategist);
          setIsEditingStrategist(false);
          setRiskModal(prev => ({ ...prev, isOpen: false }));
        }
      });
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  // Add entry handler
  const handleAddProduct = async () => {
    let finalProductName = '';
    if (newProductForm.productId) {
      const selected = inventoryProducts.find(p => p.id === newProductForm.productId);
      finalProductName = selected ? selected.name : 'Unknown Product';
    } else if (newProductForm.customName) {
      finalProductName = newProductForm.customName;
    } else {
      alert('Please select an inventory product or enter a custom product name.');
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        month: selectedMonth,
        strategist_name: strategist,
        product_id: newProductForm.productId || null,
        product_name: finalProductName,
        content_needed: parseInt(newProductForm.contentNeeded) || 0,
        received_count: 0,
        in_progress_count: 0,
        inhouse_count: parseInt(newProductForm.inhouseCount) || 0,
        inhouse_unit_cost: parseFloat(newProductForm.inhouseUnitCost) || 0,
        brand_name: newProductForm.brandName || '',
        brand_unit_count: parseInt(newProductForm.brandUnitCount) || 0,
        brand_unit_cost: parseFloat(newProductForm.brandUnitCost) || 0,
        other_cost: parseFloat(newProductForm.otherCost) || 0
      };

      const { error } = await supabase
        .from('content_plans')
        .insert([payload]);

      if (error) throw error;
      
      setShowAddModal(false);
      // Reset form
      setNewProductForm({
        productId: '',
        customName: '',
        contentNeeded: 0,
        inhouseCount: 0,
        inhouseUnitCost: 0,
        brandName: '',
        brandUnitCount: 0,
        brandUnitCost: 0,
        otherCost: 0
      });
      fetchPlans();
    } catch (err) {
      console.error('Error inserting plan:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete row handler
  const handleDeleteRow = async (plan) => {
    setRiskModal({
      isOpen: true,
      title: '🗑️ Delete Content Strategy Record',
      message: `You are deleting the content planning entry for "${plan.product_name}". This will remove all associated budget settings and metrics.`,
      targetField: 'Strategy Plan Removal',
      oldValue: plan.product_name,
      newValue: 'DELETED',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('content_plans')
            .delete()
            .eq('id', plan.id);
          if (error) throw error;
          fetchPlans();
        } catch (e) {
          console.error(e);
        } finally {
          setRiskModal(prev => ({ ...prev, isOpen: false }));
        }
      },
      onCancel: () => {
        setRiskModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Edit Row Save Trigger (Double confirmation / Risk control alert)
  const handleSaveRow = (planId) => {
    if (!editingData) return;

    // Detect what changed to present in the risk warning modal
    const changes = [];
    const fieldsToCompare = [
      { key: 'content_needed', label: 'Content Target' },
      { key: 'received_count', label: 'Received Videos' },
      { key: 'in_progress_count', label: 'In Progress Videos' },
      { key: 'inhouse_count', label: 'In-house Shoots' },
      { key: 'inhouse_unit_cost', label: 'In-house Unit Cost' },
      { key: 'brand_unit_count', label: 'Brand Shoots' },
      { key: 'brand_unit_cost', label: 'Brand Unit Cost' },
      { key: 'other_cost', label: 'Other Shoots Cost' }
    ];

    fieldsToCompare.forEach(field => {
      const orig = Number(originalRowData[field.key]) || 0;
      const cur = Number(editingData[field.key]) || 0;
      if (orig !== cur) {
        changes.push(`${field.label}: ${orig} ➔ ${cur}`);
      }
    });

    if (originalRowData.brand_name !== editingData.brand_name) {
      changes.push(`Brand Name: "${originalRowData.brand_name}" ➔ "${editingData.brand_name}"`);
    }

    if (changes.length === 0) {
      setEditingRowId(null);
      setEditingData(null);
      setOriginalRowData(null);
      return;
    }

    // Trigger Risk confirmation modal
    setRiskModal({
      isOpen: true,
      title: '⚠️ RISKY BUDGET UPDATE WARNING',
      message: `You are modifying core content metrics for "${editingData.product_name}". Direct financial planning entries impact budget allocation calculations.`,
      targetField: 'Content Metrics',
      oldValue: originalRowData.product_name,
      newValue: changes.join(' | '),
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('content_plans')
            .update({
              content_needed: editingData.content_needed,
              received_count: editingData.received_count,
              in_progress_count: editingData.in_progress_count,
              inhouse_count: editingData.inhouse_count,
              inhouse_unit_cost: editingData.inhouse_unit_cost,
              brand_name: editingData.brand_name,
              brand_unit_count: editingData.brand_unit_count,
              brand_unit_cost: editingData.brand_unit_cost,
              other_cost: editingData.other_cost,
              updated_at: new Date()
            })
            .eq('id', planId);

          if (error) throw error;
          
          setEditingRowId(null);
          setEditingData(null);
          setOriginalRowData(null);
          fetchPlans();
        } catch (err) {
          console.error(err);
          alert('Failed saving changes: ' + err.message);
        } finally {
          setRiskModal(prev => ({ ...prev, isOpen: false }));
        }
      },
      onCancel: () => {
        // Rollback local changes
        setEditingRowId(null);
        setEditingData(null);
        setOriginalRowData(null);
        setRiskModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleEditClick = (plan) => {
    setEditingRowId(plan.id);
    setEditingData({ ...plan });
    setOriginalRowData({ ...plan });
  };

  const handleFieldChange = (field, val) => {
    setEditingData(prev => ({
      ...prev,
      [field]: val
    }));
  };

  return (
    <div className="dm-panel">
      {/* Header View */}
      <div className="dm-header-elite">
        <div className="dm-header-left">
          <div className="dm-header-icon-premium">
            <Layers size={24} />
          </div>
          <div className="dm-header-text">
            <h1 className="dm-title-elite">Content Planning & Strategy</h1>
            <p className="dm-subtitle-elite">Monthly strategy board, cost attributions, and workflow targets</p>
          </div>
        </div>

        <div className="dm-header-right-elite">
          {/* Month Selector dropdown */}
          <div className="month-picker-container">
            <Calendar size={16} className="calendar-icon" />
            <select
              value={selectedMonth}
              onChange={(e) => {
                if (editingRowId) {
                  alert('Please finish or cancel active edits before changing months.');
                  return;
                }
                setSelectedMonth(e.target.value);
              }}
              className="premium-select-element"
            >
              {monthOptions.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Strategist Config */}
          <div className="strategist-pill">
            <User size={14} className="user-icon" />
            <span>Owner: </span>
            {isEditingStrategist ? (
              <div className="strategist-edit-wrapper">
                <input
                  type="text"
                  value={tempStrategist}
                  onChange={(e) => setTempStrategist(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveStrategist()}
                  className="strategist-input"
                  autoFocus
                />
                <button onClick={handleSaveStrategist} className="icon-save-btn">
                  <Check size={14} />
                </button>
                <button onClick={() => { setIsEditingStrategist(false); setTempStrategist(strategist); }} className="icon-cancel-btn">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <span className="strategist-name" onClick={() => setIsEditingStrategist(true)}>
                {strategist} <Edit2 size={10} className="edit-pencil" />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Aggregate Cards */}
      <div className="dm-stats-grid-elite">
        <div className="dm-stat-card">
          <div className="dm-stat-icon" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>
            <Video size={20} />
          </div>
          <div className="dm-stat-content">
            <p className="dm-stat-label">Videos Needed</p>
            <h3 className="dm-stat-value">{aggregates.totalNeeded}</h3>
            <p className="dm-stat-sub">Monthly targeted videos</p>
          </div>
        </div>

        <div className="dm-stat-card">
          <div className="dm-stat-icon" style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
            <CheckCircle2 size={20} />
          </div>
          <div className="dm-stat-content">
            <p className="dm-stat-label">Videos Received</p>
            <h3 className="dm-stat-value">{aggregates.totalReceived}</h3>
            <p className="dm-stat-sub">{aggregates.totalInProgress} in production</p>
          </div>
        </div>

        <div className="dm-stat-card">
          <div className="dm-stat-icon" style={{ background: 'rgba(245,158,11,0.08)', color: '#f59e0b' }}>
            <Play size={20} />
          </div>
          <div className="dm-stat-content">
            <p className="dm-stat-label">Brand & Model Spend</p>
            <h3 className="dm-stat-value">৳{aggregates.brandCost.toLocaleString()}</h3>
            <p className="dm-stat-sub">Model fees + brand deals</p>
          </div>
        </div>

        <div className="dm-stat-card">
          <div className="dm-stat-icon" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
            <DollarSign size={20} />
          </div>
          <div className="dm-stat-content">
            <p className="dm-stat-label">Total Monthly Spend</p>
            <h3 className="dm-stat-value" style={{ color: '#ef4444' }}>৳{aggregates.totalSpend.toLocaleString()}</h3>
            <p className="dm-stat-sub">Inhouse + Brand + Shoot</p>
          </div>
        </div>
      </div>

      {/* Main Strategy Board Table */}
      <div className="dm-card-section-elite">
        <div className="dm-section-header">
          <div className="dm-header-title-group">
            <h3>Content Strategy & Production Worksheet</h3>
            <p>Granular cost logs, active content targets, and influencer models allocation</p>
          </div>
          <button onClick={() => setShowAddModal(true)} className="dm-btn-add-campaign">
            <Plus size={16} /> Add Product to Strategy
          </button>
        </div>

        {loading ? (
          <div className="board-loading-container">
            <RefreshCw className="animate-spin text-indigo-500" size={32} />
            <p>Gathering strategy board details...</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="board-empty-state">
            <Layers size={48} className="empty-state-icon" />
            <h3>No planned items for {selectedMonth}</h3>
            <p>Start tracking production pipelines by attaching inventory products to the calendar</p>
            <button onClick={() => setShowAddModal(true)} className="dm-btn-add-campaign" style={{ marginTop: '12px' }}>
              <Plus size={16} /> Get Started
            </button>
          </div>
        ) : (
          <div className="planning-table-wrapper">
            <table className="planning-grid-table">
              <thead>
                <tr>
                  <th className="sticky-col">Product Name</th>
                  <th className="num-col">Needed</th>
                  <th className="num-col">Received</th>
                  <th className="num-col">In-Progress</th>
                  <th className="num-col">In-house Count</th>
                  <th className="cost-col">In-house Cost</th>
                  <th className="text-col">Model/Brand Name</th>
                  <th className="num-col">Model Count</th>
                  <th className="cost-col">Model Cost</th>
                  <th className="cost-col">Other Cost</th>
                  <th className="cost-col highlight-col">Total Cost</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const isEditing = editingRowId === plan.id;
                  const rowInhouseTotal = (isEditing ? editingData.inhouse_count * editingData.inhouse_unit_cost : plan.inhouse_count * plan.inhouse_unit_cost) || 0;
                  const rowBrandTotal = (isEditing ? editingData.brand_unit_count * editingData.brand_unit_cost : plan.brand_unit_count * plan.brand_unit_cost) || 0;
                  const rowOther = (isEditing ? editingData.other_cost : plan.other_cost) || 0;
                  const rowTotalCost = rowInhouseTotal + rowBrandTotal + rowOther;
                  const isDirty = isRowDirty(plan.id);

                  return (
                    <tr key={plan.id} className={`${isEditing ? 'row-editing' : ''} ${isDirty ? 'row-dirty' : ''}`}>
                      <td className="sticky-col product-cell">
                        <strong className="cell-product-name">{plan.product_name}</strong>
                        {plan.product_id && (
                          <span className="inventory-badge">Inventory Item</span>
                        )}
                      </td>
                      
                      {/* Needed */}
                      <td className="num-col">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            className="cell-input"
                            value={editingData.content_needed}
                            onChange={(e) => handleFieldChange('content_needed', parseInt(e.target.value) || 0)}
                          />
                        ) : (
                          <span className="cell-value font-bold">{plan.content_needed}</span>
                        )}
                      </td>

                      {/* Received */}
                      <td className="num-col">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            className="cell-input"
                            value={editingData.received_count}
                            onChange={(e) => handleFieldChange('received_count', parseInt(e.target.value) || 0)}
                          />
                        ) : (
                          <span className={`cell-value status-received ${plan.received_count > 0 ? 'active' : ''}`}>{plan.received_count}</span>
                        )}
                      </td>

                      {/* In-Progress */}
                      <td className="num-col">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            className="cell-input"
                            value={editingData.in_progress_count}
                            onChange={(e) => handleFieldChange('in_progress_count', parseInt(e.target.value) || 0)}
                          />
                        ) : (
                          <span className={`cell-value status-progress ${plan.in_progress_count > 0 ? 'active' : ''}`}>{plan.in_progress_count}</span>
                        )}
                      </td>

                      {/* Inhouse Count */}
                      <td className="num-col">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            className="cell-input"
                            value={editingData.inhouse_count}
                            onChange={(e) => handleFieldChange('inhouse_count', parseInt(e.target.value) || 0)}
                          />
                        ) : (
                          <span className="cell-value">{plan.inhouse_count}</span>
                        )}
                      </td>

                      {/* Inhouse Unit Cost */}
                      <td className="cost-col">
                        {isEditing ? (
                          <div className="input-with-currency">
                            <span className="curr-sym">৳</span>
                            <input
                              type="number"
                              min="0"
                              className="cell-input cost-input"
                              value={editingData.inhouse_unit_cost}
                              onChange={(e) => handleFieldChange('inhouse_unit_cost', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        ) : (
                          <span className="cell-value text-muted">৳{plan.inhouse_unit_cost}</span>
                        )}
                      </td>

                      {/* Brand Name */}
                      <td className="text-col">
                        {isEditing ? (
                          <input
                            type="text"
                            placeholder="e.g. Model A"
                            className="cell-input text-input"
                            value={editingData.brand_name}
                            onChange={(e) => handleFieldChange('brand_name', e.target.value)}
                          />
                        ) : (
                          <span className="cell-value brand-tag">{plan.brand_name || '—'}</span>
                        )}
                      </td>

                      {/* Brand Unit Count */}
                      <td className="num-col">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            className="cell-input"
                            value={editingData.brand_unit_count}
                            onChange={(e) => handleFieldChange('brand_unit_count', parseInt(e.target.value) || 0)}
                          />
                        ) : (
                          <span className="cell-value">{plan.brand_unit_count}</span>
                        )}
                      </td>

                      {/* Brand Unit Cost */}
                      <td className="cost-col">
                        {isEditing ? (
                          <div className="input-with-currency">
                            <span className="curr-sym">৳</span>
                            <input
                              type="number"
                              min="0"
                              className="cell-input cost-input"
                              value={editingData.brand_unit_cost}
                              onChange={(e) => handleFieldChange('brand_unit_cost', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        ) : (
                          <span className="cell-value text-muted">৳{plan.brand_unit_cost}</span>
                        )}
                      </td>

                      {/* Other Cost */}
                      <td className="cost-col">
                        {isEditing ? (
                          <div className="input-with-currency">
                            <span className="curr-sym">৳</span>
                            <input
                              type="number"
                              min="0"
                              className="cell-input cost-input"
                              value={editingData.other_cost}
                              onChange={(e) => handleFieldChange('other_cost', parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        ) : (
                          <span className="cell-value text-muted">৳{plan.other_cost}</span>
                        )}
                      </td>

                      {/* Total Cost Column (Calculated Live) */}
                      <td className="cost-col highlight-col">
                        <strong className="total-cost-amount">৳{rowTotalCost.toLocaleString()}</strong>
                      </td>

                      {/* Action Cell */}
                      <td className="actions-col">
                        {isEditing ? (
                          <div className="row-action-flex">
                            <button
                              onClick={() => handleSaveRow(plan.id)}
                              className="btn-action-round check"
                              title="Save changes (High Risk)"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setEditingRowId(null);
                                setEditingData(null);
                                setOriginalRowData(null);
                              }}
                              className="btn-action-round cancel"
                              title="Discard edits"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="row-action-flex">
                            <button
                              onClick={() => handleEditClick(plan)}
                              className="btn-action-round edit"
                              title="Edit line metrics"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteRow(plan)}
                              className="btn-action-round delete"
                              title="Remove item"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ⚠️ Risk Confirmation Dialog (Standardized popup guard) */}
      <AnimatePresence>
        {riskModal.isOpen && (
          <div className="risk-modal-overlay">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="risk-modal-card"
            >
              <div className="risk-header">
                <AlertTriangle className="risk-icon" size={24} />
                <h3>{riskModal.title}</h3>
              </div>
              <div className="risk-body">
                <p className="risk-desc">{riskModal.message}</p>
                
                <div className="risk-field-summary">
                  <div className="summary-field-label">Target Details:</div>
                  <div className="summary-field-val">{riskModal.targetField}</div>
                  
                  {riskModal.oldValue && (
                    <>
                      <div className="summary-field-label">Previous state:</div>
                      <div className="summary-field-val old">{riskModal.oldValue}</div>
                    </>
                  )}
                  
                  <div className="summary-field-label">Proposed state:</div>
                  <div className="summary-field-val new">{riskModal.newValue}</div>
                </div>
                
                <div className="risk-alert-footer-note">
                  🛑 Accidental data insertions skew marketing ROI aggregates. Verify numbers carefully before clicking proceed.
                </div>
              </div>
              
              <div className="risk-actions">
                <button onClick={riskModal.onCancel} className="risk-btn cancel">
                  Cancel Change
                </button>
                <button onClick={riskModal.onConfirm} className="risk-btn confirm">
                  Proceed & Commit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Add Product to strategy Modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <div className="risk-modal-overlay">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="add-product-modal"
            >
              <div className="modal-header-elite">
                <div className="title-area">
                  <FolderPlus size={18} />
                  <h3>Plan Product Marketing Campaign</h3>
                </div>
                <button onClick={() => setShowAddModal(false)} className="close-btn">
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body-elite">
                <div className="form-row">
                  <label className="field-label">Inventory Product lookup</label>
                  <select
                    value={newProductForm.productId}
                    onChange={(e) => setNewProductForm(prev => ({ ...prev, productId: e.target.value }))}
                    className="modal-select-element"
                  >
                    <option value="">-- Choose inventory product --</option>
                    {inventoryProducts.map(p => (
                      <option key={p.id} value={p.id}>{p.name} (৳{p.unit_price})</option>
                    ))}
                  </select>
                </div>

                <div className="divider-or">OR</div>

                <div className="form-row">
                  <label className="field-label">Custom Campaign / Product name</label>
                  <input
                    type="text"
                    placeholder="Enter custom product name if not in inventory"
                    value={newProductForm.customName}
                    onChange={(e) => setNewProductForm(prev => ({ ...prev, customName: e.target.value }))}
                    className="modal-input-element"
                    disabled={!!newProductForm.productId}
                  />
                </div>

                <div className="form-grid-three">
                  <div className="form-row">
                    <label className="field-label">Target Video Count</label>
                    <input
                      type="number"
                      min="0"
                      value={newProductForm.contentNeeded}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, contentNeeded: parseInt(e.target.value) || 0 }))}
                      className="modal-input-element"
                    />
                  </div>

                  <div className="form-row">
                    <label className="field-label">In-house Count</label>
                    <input
                      type="number"
                      min="0"
                      value={newProductForm.inhouseCount}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, inhouseCount: parseInt(e.target.value) || 0 }))}
                      className="modal-input-element"
                    />
                  </div>

                  <div className="form-row">
                    <label className="field-label">In-house Unit Cost</label>
                    <input
                      type="number"
                      min="0"
                      value={newProductForm.inhouseUnitCost}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, inhouseUnitCost: parseFloat(e.target.value) || 0 }))}
                      className="modal-input-element"
                    />
                  </div>
                </div>

                <div className="form-grid-three">
                  <div className="form-row">
                    <label className="field-label">Brand / Model Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Model X"
                      value={newProductForm.brandName}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, brandName: e.target.value }))}
                      className="modal-input-element"
                    />
                  </div>

                  <div className="form-row">
                    <label className="field-label">Model Shoot Count</label>
                    <input
                      type="number"
                      min="0"
                      value={newProductForm.brandUnitCount}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, brandUnitCount: parseInt(e.target.value) || 0 }))}
                      className="modal-input-element"
                    />
                  </div>

                  <div className="form-row">
                    <label className="field-label">Model Unit Cost</label>
                    <input
                      type="number"
                      min="0"
                      value={newProductForm.brandUnitCost}
                      onChange={(e) => setNewProductForm(prev => ({ ...prev, brandUnitCost: parseFloat(e.target.value) || 0 }))}
                      className="modal-input-element"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <label className="field-label">Other Shoot / Editor Costs</label>
                  <input
                    type="number"
                    min="0"
                    value={newProductForm.otherCost}
                    onChange={(e) => setNewProductForm(prev => ({ ...prev, otherCost: parseFloat(e.target.value) || 0 }))}
                    className="modal-input-element"
                  />
                </div>
              </div>

              <div className="modal-footer-elite">
                <button onClick={() => setShowAddModal(false)} className="modal-btn-cancel" disabled={actionLoading}>
                  Cancel
                </button>
                <button onClick={handleAddProduct} className="modal-btn-confirm" disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Add to Strategy Board'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
