'use client';

import React, { useState, useMemo, useRef, useEffect, Suspense, useDeferredValue, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useOrders } from '@/context/OrderContext';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Search, Globe, ChevronDown, ChevronLeft, ChevronRight, CheckCircle, Clock, Printer, Trash2, X, AlertTriangle, Edit2, Plus, Download, Calendar, MoreHorizontal, Phone, Sparkles, Copy, MessageCircle, RotateCcw } from 'lucide-react';
import CurrencyIcon from '@/components/CurrencyIcon';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { PremiumSearch } from '@/components/PremiumSearch';
import { Input } from '@/components/Input';
import { DateRangePicker } from '@/components/DateRangePicker';
import { OrderRow } from '@/components/OrderRow';
import dynamic from 'next/dynamic';
import api from '@/services/api';
import { getProductCheckpoints, getFormattedProductName } from '@/utils/productCatalog';
import { useRouteOrderReadState } from '@/hooks/useRouteOrderReadState';
import { isIncompleteConversion, getDisplayStatusLabel } from '@/utils/orderStatusHelper';
import { TableSkeleton } from '@/components/skeletons/TableSkeleton';
import { useConfirm } from '@/hooks/useConfirm';

import { OrderDetailsModal } from '@/components/OrderDetailsModal';
import { OrderEditModal } from '@/components/OrderEditModal';
import { BulkOrderCreator } from '@/components/BulkOrderCreator';
import { ExportModal } from '@/components/ExportModal';
import { PrintPreviewModal } from '@/components/PrintSystem/PrintPreviewModal';

const ORDER_STATUSES = [
  'New',
  'Pending Call',
  'Final Call Pending',
  'Confirmed',
  'Bulk Exported',
  'Courier Ready',
  'Courier Submitted',
  'Factory Processing',
  'Completed',
  'Fake Order',
  'Cancelled',
  'Incomplete',
  'Test'
];

const SOURCES = ['Website', 'Facebook', 'Instagram', 'Direct', 'Messenger'];

const DELIVERY_ZONES = [
  { value: 'Inside Dhaka', charge: 80 },
  { value: 'Outside Dhaka', charge: 150 }
];

const BD_PHONE_REGEX = /^01\d{9}$/;

const OrdersBoard = () => {
  const confirm = useConfirm();
  const { userRoles, isAdmin, hasAnyRole, updatePresenceContext } = useAuth();
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    updatePresenceContext?.('Browsing Orders');
    
    // Check for global "New Order" trigger
    if (searchParams.get('openModal') === 'new') {
      setIsNewOrderModalOpen(true);
      if (typeof window !== 'undefined') {
        const queryParams = new URLSearchParams(window.location.search);
        queryParams.delete('openModal');
        const nextUrl = queryParams.toString() ? `${pathname}?${queryParams.toString()}` : pathname;
        window.history.replaceState({}, '', nextUrl);
      }
    }

    const handleGlobalNewOrder = () => setIsNewOrderModalOpen(true);
    window.addEventListener('open-new-order-modal', handleGlobalNewOrder);
    
    return () => window.removeEventListener('open-new-order-modal', handleGlobalNewOrder);
  }, [updatePresenceContext, searchParams, pathname]);

  const { 
    orders, totalCount, loading, page, setPage, setFilters, 
    fetchOrderLogs, fetchStats, stats, addOrder, deleteOrder, fraudFlags, automationFlags,
    pageSize, filters, updateOrderStatus, autoDistributeOrders, toyBoxes, inventory
  } = useOrders();
  const inventoryProductCheckpoints = useMemo(() => getProductCheckpoints(inventory), [inventory]);
  const deferredSearchTerm = useDeferredValue(filters.searchTerm);

  const hasActiveFilters = useMemo(() => {
    return Boolean(
      (filters.searchTerm && filters.searchTerm.trim()) ||
      (filters.status && filters.status !== 'All') ||
      (filters.source && filters.source !== 'All') ||
      filters.productName ||
      filters.dateRange?.start ||
      filters.dateRange?.end
    );
  }, [filters]);

  const filteredOrders = useMemo(() => {
    const search = String(deferredSearchTerm || '').trim().toLowerCase();
    const productName = String(filters.productName || '').trim().toLowerCase();
    const dateStart = filters.dateRange?.start ? new Date(filters.dateRange.start).getTime() : null;
    const dateEnd = filters.dateRange?.end ? new Date(filters.dateRange.end).getTime() : null;

    return (Array.isArray(orders) ? orders : []).filter((order) => {
      if (filters.status && filters.status !== 'All' && order.status !== filters.status) return false;
      if (filters.source && filters.source !== 'All' && order.source !== filters.source) return false;
      if (productName && !String(order.product_name || '').toLowerCase().includes(productName)) return false;

      if (dateStart || dateEnd) {
        const orderTime = order.created_at ? new Date(order.created_at).getTime() : 0;
        if (dateStart && orderTime < dateStart) return false;
        if (dateEnd && orderTime > dateEnd) return false;
      }

      if (search) {
        const searchable = [
          order.id,
          order.customer_name,
          order.phone,
          order.product_name,
          order.address
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(search)) return false;
      }

      return true;
    });
  }, [filters, orders]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pagedOrders = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, page, pageSize]);

  const paginationRange = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (page <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (page >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', page - 1, page, page + 1, '...', totalPages];
  }, [page, totalPages]);

  // Phase 9.8: Construct indexed duplicate maps ONCE per orders dataset update, avoiding rebuilds on UI state changes
  const orderLookupMaps = useMemo(() => {
    const normalizePhone = (phone: any) => String(phone || '').replace(/\D/g, '').replace(/^88/, '');
    const normalizeName = (name: any) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const normalizeIp = (ip: any) => String(ip || '').trim().toLowerCase();

    const phoneMap = new Map<string, any[]>();
    const nameMap = new Map<string, any[]>();
    const ipMap = new Map<string, any[]>();

    (Array.isArray(orders) ? orders : []).forEach((order: any) => {
      const p = normalizePhone(order.phone);
      if (p.length >= 6) {
        let list = phoneMap.get(p);
        if (!list) { list = []; phoneMap.set(p, list); }
        list.push(order);
      }
      const n = normalizeName(order.customer_name);
      if (n.length >= 3) {
        let list = nameMap.get(n);
        if (!list) { list = []; nameMap.set(n, list); }
        list.push(order);
      }
      const ip = normalizeIp(order.ip_address);
      if (ip.length >= 3) {
        let list = ipMap.get(ip);
        if (!list) { list = []; ipMap.set(ip, list); }
        list.push(order);
      }
    });

    return { phoneMap, nameMap, ipMap, normalizePhone, normalizeName, normalizeIp };
  }, [orders]);

  // Derive duplicate warnings for the current page slice using precomputed lookup maps
  const duplicateWarnings = useMemo(() => {
    const { phoneMap, nameMap, ipMap, normalizePhone, normalizeName, normalizeIp } = orderLookupMaps;
    const warnings: Record<string, any> = {};

    (Array.isArray(pagedOrders) ? pagedOrders : []).forEach((order: any) => {
      const matches: any[] = [];
      const phoneMatches = phoneMap.get(normalizePhone(order.phone)) || [];
      const nameMatches = nameMap.get(normalizeName(order.customer_name)) || [];
      const ipMatches = ipMap.get(normalizeIp(order.ip_address)) || [];

      if (phoneMatches.length > 1) matches.push({ label: 'Phone', count: phoneMatches.length });
      if (nameMatches.length > 1) matches.push({ label: 'Name', count: nameMatches.length });
      if (ipMatches.length > 1) matches.push({ label: 'IP', count: ipMatches.length });

      if (matches.length > 0) {
        warnings[order.id] = {
          matches,
          label: matches.map(match => match.label).join(' + '),
          title: `Duplicate detected by ${matches.map(match => `${match.label} (${match.count})`).join(', ')}`
        };
      }
    });

    return warnings;
  }, [orderLookupMaps, pagedOrders]);
  const { isOrderUnread, markOrderRead, unreadCount } = useRouteOrderReadState('orders-board', filteredOrders);

  useEffect(() => {
    const statusFromRoute = searchParams.get('status');
    const normalizedStatus = statusFromRoute === 'All'
      ? 'All'
      : ORDER_STATUSES.includes(statusFromRoute as any) ? statusFromRoute : null;

    if (normalizedStatus && filters.status !== normalizedStatus) {
      setFilters((prev: any) => ({ ...prev, status: normalizedStatus }));
    }
  }, [searchParams, filters.status, setFilters]);

  const [distributing, setDistributing] = useState(false);
  const [deepLinkOrder, setDeepLinkOrder] = useState<any>(null);
  const [productBreakdown, setProductBreakdown] = useState<any[]>([]);
  const [isLoadingProductBreakdown, setIsLoadingProductBreakdown] = useState(false);
  const [statusBreakdown, setStatusBreakdown] = useState<any[]>([]);
  const [isLoadingStatusBreakdown, setIsLoadingStatusBreakdown] = useState(false);
  const [breakdownRefreshTrigger, setBreakdownRefreshTrigger] = useState(0);

  const [selectedOrderId, setSelectedOrderId] = useState<any>(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [isBulkCreatorOpen, setIsBulkCreatorOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<any>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<any[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false); // Enterprise Print System

  // Deep Link Observer: Handle direct order modal triggers
  useEffect(() => {
    const viewOrderId = searchParams.get('viewOrder');
    
    if (viewOrderId) {
      const existing = (orders || []).find((o: any) => o.id === viewOrderId);
      if (existing) {
        markOrderRead(existing);
        setSelectedOrderId(viewOrderId);
        setIsDetailsModalOpen(true);
        if (typeof window !== 'undefined') {
          const queryParams = new URLSearchParams(window.location.search);
          queryParams.delete('viewOrder');
          const nextUrl = queryParams.toString() ? `${pathname}?${queryParams.toString()}` : pathname;
          window.history.replaceState({}, '', nextUrl);
        }
      } else {
        api.getOrderById(viewOrderId).then((order: any) => {
          setDeepLinkOrder(order);
          markOrderRead(order);
          setSelectedOrderId(viewOrderId);
          setIsDetailsModalOpen(true);
          if (typeof window !== 'undefined') {
            const queryParams = new URLSearchParams(window.location.search);
            queryParams.delete('viewOrder');
            const nextUrl = queryParams.toString() ? `${pathname}?${queryParams.toString()}` : pathname;
            window.history.replaceState({}, '', nextUrl);
          }
        }).catch((err: any) => console.error('Deep link fetch error:', err));
      }
    }
  }, [searchParams, orders, pathname, markOrderRead]);

  const handleSelectOrder = useCallback((id: any) => {
    setSelectedOrderIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const handleSelectAll = () => {
    const pageIds = pagedOrders.map(o => o.id);
    const isPageSelected = pageIds.length > 0 && pageIds.every(id => selectedOrderIds.includes(id));

    if (isPageSelected) {
      setSelectedOrderIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedOrderIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleClearSelection = () => {
      setSelectedOrderIds([]);
  };

  const handleBulkStatusChange = async (status) => {};

  const handleBulkDelete = async () => {};

  const handleOpenEditModal = useCallback((order: any) => {
    setSelectedOrderForEdit(order);
    setIsEditModalOpen(true);
  }, []);

  const handleStatusChange = useCallback((orderId: string | number, status: string) => {
    updateOrderStatus(orderId, status);
    setBreakdownRefreshTrigger(prev => prev + 1);
  }, [updateOrderStatus]);

  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const sourceDropdownRef = useRef<HTMLDivElement | null>(null);

  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const handleResetFilters = useCallback(() => {
    setFilters({
      searchTerm: '',
      status: 'All',
      source: 'All',
      productName: '',
      dateRange: { start: null, end: null }
    });
  }, [setFilters]);

  useEffect(() => {
    const handleClickOutside = (event: any) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(event.target)) {
        setSourceDropdownOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const statusTabsRef = useRef<HTMLDivElement | null>(null);
  const checkpointsRef = useRef<HTMLDivElement | null>(null);

  const scrollContainer = (ref: any, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const currentOrder = useMemo(() =>
    orders.find((o: any) => o.id === selectedOrderId) || deepLinkOrder,
    [orders, selectedOrderId, deepLinkOrder]
  );


  const [formData, setFormData] = useState<any>({
    customer_name: '',
    phone: '',
    address: '',
    shipping_zone: '',
    source: 'Website',
    notes: '',
    order_lines: [],
    duplicate_policy: 'merge'
  });
  const [lineDraft, setLineDraft] = useState({
    product_name: '',
    size: '',
    quantity: '1',
    unit_price: '',
    toybox_serial: ''
  });
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, any>>({});

  const selectedZone = DELIVERY_ZONES.find(zone => zone.value === formData.shipping_zone) || null;
  const deliveryCharge = selectedZone?.charge || 0;
  const orderSubtotal = (formData.order_lines || []).reduce((sum, line) => sum + (Number(line.line_total) || 0), 0);
  const payableTotal = orderSubtotal + deliveryCharge;

  const createLineId = () => `ln-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const normalizeLineDraft = () => {
    const qty = Math.max(1, parseInt(lineDraft.quantity, 10) || 1);
    const unitPrice = Math.max(0, parseFloat(lineDraft.unit_price) || 0);
    const isToyBox = lineDraft.product_name === 'TOY BOX';
    const serialValue = isToyBox ? String(lineDraft.toybox_serial || '').trim() : '';
    const lineKey = `${lineDraft.product_name}|${lineDraft.size || ''}|${serialValue}|${unitPrice}`;

    return {
      qty,
      unitPrice,
      isToyBox,
      serialValue,
      lineKey
    };
  };

  const resetLineDraft = () => {
    setLineDraft({
      product_name: '',
      size: '',
      quantity: '1',
      unit_price: '',
      toybox_serial: ''
    });
    setEditingLineId(null);
  };

  const addOrUpdateLineItem = () => {
    const nextErrors: Record<string, string> = {};
    const { qty, unitPrice, isToyBox, serialValue, lineKey } = normalizeLineDraft();

    if (!lineDraft.product_name) nextErrors.line_product = 'Select a product first.';
    if (isToyBox && !serialValue) nextErrors.line_serial = 'Select a Toy Box serial.';
    if (qty < 1) nextErrors.line_quantity = 'Quantity must be at least 1.';
    if (unitPrice < 0) nextErrors.line_price = 'Unit price cannot be negative.';

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(prev => ({ ...prev, ...nextErrors }));
      return;
    }

    const candidateLine = {
      line_id: editingLineId || createLineId(),
      product_name: lineDraft.product_name,
      size: lineDraft.size,
      quantity: qty,
      unit_price: unitPrice,
      toybox_serial: serialValue,
      line_key: lineKey,
      line_total: qty * unitPrice
    };

    setFormData((prev: any) => {
      let lines = [...(prev.order_lines || [])];

      if (editingLineId) {
        lines = lines.map((line: any) => line.line_id === editingLineId ? candidateLine : line);
      } else if (prev.duplicate_policy === 'merge') {
        const existingIndex = lines.findIndex((line: any) => line.line_key === candidateLine.line_key);
        if (existingIndex !== -1) {
          const existing = lines[existingIndex];
          const mergedQty = (existing.quantity || 0) + candidateLine.quantity;
          lines[existingIndex] = {
            ...existing,
            quantity: mergedQty,
            line_total: mergedQty * (existing.unit_price || 0)
          };
        } else {
          lines.push(candidateLine);
        }
      } else {
        lines.push(candidateLine);
      }

      return { ...prev, order_lines: lines };
    });

    setFormErrors(prev => ({
      ...prev,
      line_product: '',
      line_serial: '',
      line_quantity: '',
      line_price: '',
      order_lines: ''
    }));
    resetLineDraft();
  };

  const handleEditLine = (line: any) => {
    setEditingLineId(line.line_id);
    setLineDraft({
      product_name: line.product_name || '',
      size: line.size || '',
      quantity: String(line.quantity || 1),
      unit_price: String(line.unit_price ?? ''),
      toybox_serial: line.toybox_serial || ''
    });
  };

  const handleRemoveLine = (lineId: string) => {
    setFormData((prev: any) => ({
      ...prev,
      order_lines: (prev.order_lines || []).filter((line: any) => line.line_id !== lineId)
    }));
  };

  const updateLineQuantity = (lineId: string, qty: number) => {
    const safeQty = Math.max(1, qty || 1);
    setFormData((prev: any) => ({
      ...prev,
      order_lines: (prev.order_lines || []).map((line: any) => line.line_id === lineId
        ? { ...line, quantity: safeQty, line_total: safeQty * (line.unit_price || 0) }
        : line)
    }));
  };

  const handleAutoDistribute = async () => {
    const ok = await confirm({
      title: 'Start Automatic Distribution?',
      description: 'This will confirm eligible orders strictly based on inventory availability and queue them for courier readiness.',
      confirmLabel: 'Start Distribution',
      variant: 'default',
    });
    if (!ok) return;
    setDistributing(true);
    try {
      const result = await autoDistributeOrders('Confirmed');
      alert(`Distribution complete! Courier ready: ${result.distributed}, queued: ${result.queued}`);
    } catch (error) {
      console.error('Distribution failed:', error);
      alert('Distribution engine encountered an error.');
    } finally {
      setDistributing(false);
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'New': return 'new';
      case 'Pending Call': return 'pending-call';
      case 'Final Call Pending': return 'final-call-pending';
      case 'Confirmed': return 'confirmed';
      case 'Bulk Exported': return 'bulk-exported';
      case 'Fake Order': return 'fake-order';
      case 'Cancelled': return 'cancelled';
      case 'Incomplete': return 'incomplete';
      case 'Courier Submitted': return 'courier';
      case 'Factory Processing': return 'factory';
      case 'Completed': return 'completed';
      case 'Test': return 'test';
      default: return 'default';
    }
  };

  const handleNewOrderSubmit = async (e) => {
    e.preventDefault();

    const nextErrors: Record<string, string> = {};
    const normalizedPhone = (formData.phone || '').replace(/\D/g, '');
    if (!formData.customer_name.trim()) nextErrors.customer_name = 'Customer name is required.';
    if (!formData.phone.trim()) {
      nextErrors.phone = 'Phone number is required.';
    } else if (!BD_PHONE_REGEX.test(normalizedPhone)) {
      nextErrors.phone = 'Phone number must start with 01 and be exactly 11 digits.';
    }
    if (!formData.address.trim()) nextErrors.address = 'Delivery address is required.';
    if (!formData.shipping_zone) nextErrors.shipping_zone = 'Select a delivery zone to continue.';
    if (!formData.order_lines || formData.order_lines.length === 0) nextErrors.order_lines = 'Add at least one product line item.';

    if (Object.keys(nextErrors).length > 0) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});

    try {
      const totalQuantity = (formData.order_lines || []).reduce((sum: number, line: any) => sum + (line.quantity || 0), 0);
      const firstLine = formData.order_lines?.[0];
      const toyboxSerials = (formData.order_lines || [])
        .filter((line: any) => line.product_name === 'TOY BOX' && line.toybox_serial)
        .map((line: any) => Number(line.toybox_serial));

      await addOrder({
        customer_name: formData.customer_name,
        phone: normalizedPhone,
        address: formData.address,
        shipping_zone: formData.shipping_zone,
        delivery_charge: deliveryCharge,
        product_name: (formData.order_lines || []).length > 1 ? `Multi Item (${formData.order_lines.length})` : (firstLine?.product_name || ''),
        size: firstLine?.size || '',
        source: formData.source,
        notes: formData.notes,
        status: 'New',
        amount: payableTotal,
        quantity: totalQuantity || 1,
        ordered_items: toyboxSerials,
        order_lines_payload: formData.order_lines,
        pricing_summary: {
          subtotal: orderSubtotal,
          delivery_charge: deliveryCharge,
          payable_total: payableTotal
        }
      });

      // Reset filters so the new order is visible
      setFilters(prev => ({ ...prev, searchTerm: '', status: 'All', productName: '' }));

      setIsNewOrderModalOpen(false);
      setFormData({
        customer_name: '',
        phone: '',
        address: '',
        shipping_zone: '',
        source: 'Website',
        notes: '',
        order_lines: [],
        duplicate_policy: 'merge'
      });
      resetLineDraft();
      setFormErrors({});
    } catch (error) {
      console.error('Failed to create order:', error);
      alert('Failed to create order. Please try again.');
    }
  };

  const handleRowClick = useCallback((order: any) => {
    markOrderRead(order);
    setSelectedOrderId(order.id);
    setIsDetailsModalOpen(true);
  }, [markOrderRead]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const copyPhoneNumber = (event, phone) => {
    event.stopPropagation();
    if (!phone) return;
    navigator.clipboard.writeText(String(phone));
  };

  const getWhatsAppLink = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('880')) return `https://wa.me/${digits}`;
    if (digits.startsWith('0')) return `https://wa.me/88${digits}`;
    return `https://wa.me/${digits}`;
  };


  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages, setPage]);

  useEffect(() => {
    let isActive = true;

    const loadProductBreakdown = async () => {
      setIsLoadingProductBreakdown(true);
      try {
        const data = await api.getOrderProductBreakdown({
          ...filters,
          productName: ''
        });

        if (isActive) {
          setProductBreakdown(data || []);
        }
      } catch (error) {
        console.error('Failed to load product breakdown:', error);
        if (isActive) {
          setProductBreakdown([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingProductBreakdown(false);
        }
      }
    };

    const timer = window.setTimeout(loadProductBreakdown, 180);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [filters.dateRange, filters.searchTerm, filters.source, filters.status]);

  useEffect(() => {
    let isActive = true;

    const loadStatusBreakdown = async () => {
      setIsLoadingStatusBreakdown(true);
      try {
        const data = await api.getOrderStatusBreakdown({
          ...filters,
          status: 'All'
        });

        if (isActive) {
          setStatusBreakdown(data || []);
        }
      } catch (error) {
        console.error('Failed to load status breakdown:', error);
        if (isActive) {
          setStatusBreakdown([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingStatusBreakdown(false);
        }
      }
    };

    const timer = window.setTimeout(loadStatusBreakdown, 180);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [filters.dateRange, filters.productName, filters.searchTerm, filters.source, breakdownRefreshTrigger]);

  const inventoryColorMap = useMemo(
    () => new Map(
      inventoryProductCheckpoints
        .filter((item) => item.id !== 'all')
        .map((item) => [item.name, item.color])
    ),
    [inventoryProductCheckpoints]
  );

  const getFallbackProductColor = (productName = '') => {
    const palette = ['#6366f1', '#22c55e', '#f97316', '#06b6d4', '#e11d48', '#8b5cf6', '#14b8a6', '#f59e0b'];
    const hash = String(productName)
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return palette[hash % palette.length];
  };

  const visibleProductBreakdown = useMemo(() => {
    const fallbackBreakdown = Array.from(
      filteredOrders.reduce((acc, order) => {
        const productName = String(order?.product_name || 'Unknown Product').trim() || 'Unknown Product';
        acc.set(productName, (acc.get(productName) || 0) + 1);
        return acc;
      }, new Map())
    )
      .map(([name, count]: any) => ({ name, count }))
      .sort((a: any, b: any) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });

    const source = productBreakdown.length > 0 ? productBreakdown : fallbackBreakdown;
    const totalOrdersForBreakdown = source.reduce((sum, item) => sum + item.count, 0);

    return [
      {
        id: 'all',
        name: 'All Products',
        color: '#64748b',
        count: totalOrdersForBreakdown
      },
      ...source.map((item) => ({
        id: item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: item.name,
        color: inventoryColorMap.get(item.name) || getFallbackProductColor(item.name),
        count: item.count
      }))
    ];
  }, [filteredOrders, inventoryColorMap, productBreakdown]);

  const statusCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    (statusBreakdown || []).forEach((item: any) => {
      if (item?.status) {
        map.set(item.status, Number(item.count) || 0);
      }
    });
    return map;
  }, [statusBreakdown]);

  const liveStatusBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    (Array.isArray(orders) ? orders : []).forEach((order: any) => {
      if (order?.status) {
        counts.set(order.status, (counts.get(order.status) || 0) + 1);
      }
    });
    return counts;
  }, [orders]);

  const statusTabs = useMemo(() => {
    const hasDbCounts = statusBreakdown && statusBreakdown.length > 0;
    const totalOrders = hasDbCounts
      ? (statusCountsMap.get('All') ?? totalCount)
      : (totalCount || (Array.isArray(orders) ? orders : []).length);

    return [
      { value: 'All', label: 'All Orders', count: totalOrders },
      ...ORDER_STATUSES.map((status) => ({
        value: status,
        label: status === 'Final Call Pending' ? 'Final Call' : status === 'Cancelled' ? 'Canceled' : status,
        count: hasDbCounts
          ? (statusCountsMap.get(status) ?? 0)
          : (liveStatusBreakdown.get(status) || 0)
      }))
    ];
  }, [liveStatusBreakdown, orders, statusBreakdown, statusCountsMap, totalCount]);


  return (
    <div className="orders-management">
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="orders-header-container"
      >
        <div className="page-header orders-header elite-enterprise-header">
          <div className="header-main-stack">
            <div className="title-group-elite">
              <h1 className="orders-main-heading">Orders Management</h1>
              <p className="orders-sub-heading">Manage customer orders, track status and deliver happiness.</p>
            </div>
          </div>

          <div className="header-actions-enterprise">
            <Button variant="ghost" className="export-btn-light" onClick={() => setIsExportModalOpen(true)}>
              <Download size={15} /> <span>Export</span>
            </Button>
            
            <Button
              variant="secondary"
              className="action-btn-distribute"
              onClick={handleAutoDistribute}
              disabled={distributing}
            >
              <Sparkles size={14} />
              <span>{distributing ? 'Processing...' : 'Auto Distribute'}</span>
            </Button>

            {hasAnyRole(['Admin', 'Moderator']) && (
              <Button variant="primary" className="action-btn-new-order" onClick={() => setIsNewOrderModalOpen(true)}>
                <Plus size={15} />
                <span>New Order</span>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Status Tabs ── */}
      <div className="scrollable-strip-wrapper status-strip-wrapper">
        <button className="strip-arrow left" onClick={() => scrollContainer(statusTabsRef, 'left')} aria-label="Scroll left">
          <ChevronLeft size={15} />
        </button>
        <div className="status-tabs-bar" ref={statusTabsRef}>
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`status-tab ${filters.status === tab.value ? 'active' : ''}`}
              onClick={() => handleFilterChange('status', tab.value)}
            >
              <span className="status-tab-label">{tab.label}</span>
              <span className="status-tab-count">{tab.count}</span>
            </button>
          ))}
        </div>
        <button className="strip-arrow right" onClick={() => scrollContainer(statusTabsRef, 'right')} aria-label="Scroll right">
          <ChevronRight size={15} />
        </button>
      </div>
      {isLoadingStatusBreakdown && (
        <div className="status-breakdown-status">Refreshing status-wise order counts...</div>
      )}

      {/* ── Unified Filter Bar ── */}
      <div className="unified-filter-bar">
        <div className="filter-date-segment">
          <DateRangePicker
            value={filters.dateRange}
            onChange={(range) => handleFilterChange('dateRange', range)}
          />
        </div>

        <div className="filter-divider" />

        <div className="filter-search-segment">
          <PremiumSearch
            value={filters.searchTerm}
            onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
            placeholder="Search orders, customers, phone, product..."
            suggestions={
              filters.searchTerm ? orders.filter(o => 
                o.id.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
                o.customer_name?.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
                o.phone?.includes(filters.searchTerm)
              ).slice(0, 5).map(o => ({
                id: o.id,
                label: o.customer_name,
                sub: o.id,
                type: 'order',
                original: o
              })) : []
            }
            onSuggestionClick={(item) => {
              if (item.type === 'order') {
                handleRowClick(item.original);
              }
            }}
          />
        </div>

        <div className="filter-divider" />

        <div className="filter-buttons-row">
          <div 
            className="elite-select-wrapper" 
            ref={sourceDropdownRef}
            onClick={() => setSourceDropdownOpen(!sourceDropdownOpen)}
            style={{ position: 'relative', cursor: 'pointer' }}
          >
            <Globe size={14} className="elite-select-icon" />
            <span className="elite-select-selected-value">
              {filters.source === 'All' ? 'All Sources' : filters.source}
            </span>
            <ChevronDown size={13} className="elite-select-chevron" style={{ transform: sourceDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', marginLeft: 'auto', flexShrink: 0 }} />
            
            <AnimatePresence>
              {sourceDropdownOpen && (
                <motion.div 
                  className="premium-select-dropdown"
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  <div 
                    className={`select-dropdown-item ${filters.source === 'All' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFilterChange('source', 'All');
                      setSourceDropdownOpen(false);
                    }}
                  >
                    All Sources
                  </div>
                  {SOURCES.map(s => (
                    <div 
                      key={s} 
                      className={`select-dropdown-item ${filters.source === s ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFilterChange('source', s);
                        setSourceDropdownOpen(false);
                      }}
                    >
                      {s}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="filter-divider" />

          <div 
            className="elite-select-wrapper" 
            ref={statusDropdownRef}
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            style={{ position: 'relative', cursor: 'pointer' }}
          >
            <span className="elite-select-selected-value">
              {filters.status === 'All' ? 'All Status' : (filters.status === 'Final Call Pending' ? 'Final Call' : filters.status === 'Cancelled' ? 'Canceled' : filters.status)}
            </span>
            <ChevronDown size={13} className="elite-select-chevron" style={{ transform: statusDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease', marginLeft: 'auto', flexShrink: 0 }} />
            
            <AnimatePresence>
              {statusDropdownOpen && (
                <motion.div 
                  className="premium-select-dropdown"
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
                  <div 
                    className={`select-dropdown-item ${filters.status === 'All' ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFilterChange('status', 'All');
                      setStatusDropdownOpen(false);
                    }}
                  >
                    All Status
                  </div>
                  {ORDER_STATUSES.map(st => (
                    <div 
                      key={st} 
                      className={`select-dropdown-item ${filters.status === st ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFilterChange('status', st);
                        setStatusDropdownOpen(false);
                      }}
                    >
                      {st === 'Final Call Pending' ? 'Final Call' : st === 'Cancelled' ? 'Canceled' : st}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="filter-divider" />

          <button
            type="button"
            className={`filter-reset-btn ${hasActiveFilters ? 'active' : ''}`}
            title="Reset all filters"
            onClick={handleResetFilters}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        </div>

        {unreadCount > 0 && (
          <div className="filter-unread-wrapper">
            <span className="route-unread-count-pill" title="Orders not opened in this route">
              <span className="unread-dot" />
              {unreadCount} unread
            </span>
          </div>
        )}
      </div>

      {/* ── Product Checkpoints (Horizontal Scroll) ── */}
      <div className="scrollable-strip-wrapper product-strip-wrapper">
        <button className="strip-arrow left" onClick={() => scrollContainer(checkpointsRef, 'left')} aria-label="Scroll left">
          <ChevronLeft size={15} />
        </button>
        <div className="product-checkpoints-strip" ref={checkpointsRef}>
          {visibleProductBreakdown.map((product) => (
            <button
              key={product.id}
              className={`checkpoint-pill ${filters.productName === (product.id === 'all' ? '' : product.name) ? 'active' : ''}`}
              style={{
                '--pill-color': product.color,
              } as React.CSSProperties}
              onClick={() => handleFilterChange('productName', product.id === 'all' ? '' : product.name)}
            >
              <span className="dot" style={{ backgroundColor: product.color }}></span>
              <span className="checkpoint-label" title={product.name}>{product.name}</span>
              <span className="checkpoint-count">{product.count}</span>
            </button>
          ))}
        </div>
        <button className="strip-arrow right" onClick={() => scrollContainer(checkpointsRef, 'right')} aria-label="Scroll right">
          <ChevronRight size={15} />
        </button>
      </div>
      {isLoadingProductBreakdown && (
        <div className="product-breakdown-status">Refreshing product-wise order counts...</div>
      )}

      <Card className="table-card liquid-glass" noPadding>
        <div className="orders-table-wrapper desktop-only">
          <table className="management-table premium-table">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <input 
                    type="checkbox" 
                    className="premium-checkbox" 
                    checked={pagedOrders.length > 0 && pagedOrders.every(order => selectedOrderIds.includes(order.id))}
                    onChange={handleSelectAll}
                    aria-label="Select all orders"
                  />
                </th>
                <th className="col-id">Order ID</th>
                <th className="col-customer">Customer</th>
                <th className="col-phone">Contact Phone</th>
                <th className="col-product">Product</th>
                <th className="col-amount">Amount</th>
                <th className="col-area">Area</th>
                <th className="col-status">Status</th>
                <th className="col-time">Time</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody className="orders-table-body">
              <AnimatePresence mode="popLayout">
                {Array.isArray(pagedOrders) && pagedOrders.map(order => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    onDetails={handleRowClick}
                    onStatusChange={handleStatusChange}
                    onEdit={handleOpenEditModal}
                    isSelected={selectedOrderIds.includes(order.id)}
                    onSelect={handleSelectOrder}
                    fraudFlag={fraudFlags[order.id]}
                    automationFlag={automationFlags[order.id]}
                    isUnread={isOrderUnread(order)}
                    duplicateWarning={duplicateWarnings[order.id]}
                  />
                ))}
              </AnimatePresence>
              {(!pagedOrders || pagedOrders.length === 0) && (
                <tr>
                  <td colSpan={10} className="empty-state-cell">
                    {loading ? 'Loading orders...' : 'No orders found matching your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (Elite Upgrade) */}
        <div className="orders-mobile-list mobile-only">
          {Array.isArray(pagedOrders) && pagedOrders.map(order => (
            <div
              key={order.id}
              className={`order-mobile-card elite-card ${isOrderUnread(order) ? 'route-unread-card' : ''}`}
              onClick={() => handleRowClick(order)}
            >
              <div className="card-header-elite">
                <div className="id-group">
                  <div className="route-read-card-header">
                    {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                    {order.first_caller_name ? (
                      <div className="first-caller-cell">
                        <span className="first-caller-avatar">
                          {order.first_caller_name.charAt(0).toUpperCase()}
                        </span>
                        <div className="first-caller-info">
                          <span className="first-caller-name">{order.first_caller_name}</span>
                          <span className="first-caller-id-sub">#{String(order.id).replace('ORD-', '').replace('STB-', '').replace('MGB-', '').slice(0, 8)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="first-caller-cell no-caller">
                        <span className="first-caller-avatar no-caller-avatar">—</span>
                        <div className="first-caller-info">
                          <span className="first-caller-name no-caller-text">Not called</span>
                          <span className="first-caller-id-sub">#{String(order.id).replace('ORD-', '').replace('STB-', '').replace('MGB-', '').slice(0, 8)}</span>
                        </div>
                      </div>
                    )}
                    {isOrderUnread(order) && <span className="route-unread-chip">New</span>}
                  </div>
                  <div className="card-flags">
                    {duplicateWarnings[order.id] && (
                      <AlertTriangle size={14} className="flag-icon duplicate" />
                    )}
                    {fraudFlags[order.id] && (
                      <AlertTriangle size={14} className="flag-icon fraud" />
                    )}
                    {automationFlags[order.id] && (
                      <Clock size={14} className="flag-icon auto" />
                    )}
                  </div>
                </div>
                <Badge
                  variant={getStatusBadgeVariant(order.status)}
                  className={isIncompleteConversion(order) ? 'is-inco-converted' : ''}
                  title={isIncompleteConversion(order) ? 'Converted from Incomplete Checkout' : ''}
                >
                  {getDisplayStatusLabel(order)}
                </Badge>
              </div>

              <div className="card-body-elite">
                <div className="customer-primary-box">
                  <h3 className="customer-name-large">{order.customer_name}</h3>
                  <div className="phone-row">
                    <Phone size={12} />
                    <span>{order.phone}</span>
                    <div className="phone-quick-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="phone-quick-btn"
                        title="Copy phone"
                        onClick={(e) => copyPhoneNumber(e, order.phone)}
                      >
                        <Copy size={12} />
                      </button>
                      <a
                        href={order.phone ? `tel:${order.phone}` : undefined}
                        className="phone-quick-btn"
                        title="Call customer"
                        onClick={(e) => e.stopPropagation()}
                        aria-disabled={!order.phone}
                      >
                        <Phone size={12} />
                      </a>
                      <a
                        href={getWhatsAppLink(order.phone) || undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="phone-quick-btn whatsapp"
                        title="Open WhatsApp"
                        onClick={(e) => e.stopPropagation()}
                        aria-disabled={!getWhatsAppLink(order.phone)}
                      >
                        <MessageCircle size={12} />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="details-grid-elite">
                  <div className="detail-box-elite">
                    <span className="detail-label">Product</span>
                    <span className="detail-value product">{getFormattedProductName(order)}</span>
                    <span className="detail-subvalue">{order.size || 'No Size'}</span>
                    {order.source && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', marginTop: '3px',
                        padding: '2px 8px', borderRadius: '999px', fontSize: '10.5px',
                        fontWeight: 700, letterSpacing: '0.03em', whiteSpace: 'nowrap',
                        border: '1px solid',
                        ...(
                          String(order.source).toLowerCase().includes('messenger') || String(order.source).toLowerCase() === 'msg'
                            ? { background: 'rgba(0,132,255,0.1)', color: '#0084ff', borderColor: 'rgba(0,132,255,0.22)' }
                          : String(order.source).toLowerCase().includes('facebook') || String(order.source).toLowerCase() === 'fb'
                            ? { background: 'rgba(24,119,242,0.1)', color: '#1877f2', borderColor: 'rgba(24,119,242,0.22)' }
                          : String(order.source).toLowerCase().includes('tiktok')
                            ? { background: 'rgba(0,0,0,0.07)', color: '#1a1a1a', borderColor: 'rgba(0,0,0,0.14)' }
                          : String(order.source).toLowerCase().includes('instagram')
                            ? { background: 'rgba(225,48,108,0.1)', color: '#e1306c', borderColor: 'rgba(225,48,108,0.22)' }
                          : String(order.source).toLowerCase().includes('web')
                            ? { background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderColor: 'rgba(99,102,241,0.22)' }
                          : String(order.source).toLowerCase().includes('direct')
                            ? { background: 'rgba(16,185,129,0.1)', color: '#059669', borderColor: 'rgba(16,185,129,0.22)' }
                          : { background: 'rgba(100,116,139,0.08)', color: '#64748b', borderColor: 'rgba(100,116,139,0.18)' }
                        )
                      }}>
                        {order.source}
                      </span>
                    )}
                  </div>
                  <div className="detail-box-elite">
                    <span className="detail-label">Logistics</span>
                    <span className="detail-value">
                      <CurrencyIcon size={12} className="currency-icon-elite" />
                      {Number(order.amount || 0).toLocaleString()}
                    </span>
                    <span className="detail-subvalue">{order.shipping_zone || 'Outside Dhaka'}</span>
                  </div>
                </div>
                {duplicateWarnings[order.id] && (
                  <div className="mobile-duplicate-warning" title={duplicateWarnings[order.id].title}>
                    <AlertTriangle size={13} />
                    <span>Duplicate: {duplicateWarnings[order.id].label}</span>
                  </div>
                )}
              </div>

              <div className="card-footer-elite">
                <span className="created-at">
                  {order.created_at
                    ? new Date(order.created_at).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })
                    : 'N/A'}
                </span>
                <div className="footer-actions">
                  <button 
                    className="details-btn-mobile"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(order);
                    }}
                  >
                    View Details
                  </button>
                  <button 
                    className="edit-btn-mobile"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(order);
                    }}
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {(!pagedOrders || pagedOrders.length === 0) && !loading && (
            <div className="mobile-empty-state">No orders found.</div>
          )}
          {loading && <div className="mobile-loading-state">Loading...</div>}
        </div>


        {totalPages > 1 && (
          <div className="pagination-footer">
            <div className="pagination-info">
              Showing {filteredOrders.length > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredOrders.length)} of {filteredOrders.length} orders
            </div>
            <div className="pagination-actions">
              <button
                type="button"
                className="page-nav-btn"
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="page-numbers">
                {paginationRange.map((item, i) => (
                  typeof item === 'number' ? (
                    <button
                      key={i}
                      type="button"
                      className={`page-num ${page === item ? 'active' : ''}`}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={i} className="page-ellipsis">…</span>
                  )
                ))}
              </div>
              <button
                type="button"
                className="page-nav-btn"
                disabled={page === totalPages}
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

      {/* ── Bulk Action Bar ── */}
      {selectedOrderIds.length > 0 && (
        <div className="bulk-action-bar-container orders-floating-bulk-actions">
          <div className="bulk-action-bar liquid-glass">
            <div className="bulk-info">
              <div className="selection-count">{selectedOrderIds.length}</div>
              <div className="selection-text">Selected</div>
            </div>

            {/* ── Print Button ── */}
            <button
              className="bulk-action-btn"
              onClick={() => setIsPrintModalOpen(true)}
              title={`Print ${selectedOrderIds.length} order(s)`}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '8px',
                border: '1px solid rgba(99,102,241,0.35)',
                background: 'rgba(99,102,241,0.12)',
                color: '#818cf8', fontSize: '12.5px', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(99,102,241,0.22)'; e.currentTarget.style.boxShadow='0 2px 10px rgba(99,102,241,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.background='rgba(99,102,241,0.12)'; e.currentTarget.style.boxShadow='none'; }}
            >
              <Printer size={14} />
              Print ({selectedOrderIds.length})
            </button>

            <button className="bulk-close" onClick={handleClearSelection}>
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      </Card>


      <OrderEditModal
        isOpen={isNewOrderModalOpen}
        onClose={() => {
          setIsNewOrderModalOpen(false);
        }}
        order={null}
      />








      {isDetailsModalOpen && currentOrder && (
        <OrderDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedOrderId(null);
          }}
          order={currentOrder}
        />
      )}

      {isEditModalOpen && selectedOrderForEdit && (
        <OrderEditModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          order={selectedOrderForEdit}
        />
      )}

      {isBulkCreatorOpen && (
        <BulkOrderCreator
          isOpen={isBulkCreatorOpen}
          onClose={() => setIsBulkCreatorOpen(false)}
        />
      )}

      {/* Enterprise Export Modal */}
      {isExportModalOpen && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          allOrders={filteredOrders}
          selectedOrderIds={selectedOrderIds}
          currentFilters={filters}
        />
      )}

      {/* Enterprise Print System Modal */}
      {isPrintModalOpen && (
        <PrintPreviewModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          orders={orders.filter(o => selectedOrderIds.includes(o.id))}
        />
      )}
    </div>
  );
};

export default function OrdersPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <OrdersBoard />
    </Suspense>
  );
}
