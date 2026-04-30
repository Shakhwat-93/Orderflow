import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { Loader2, CheckCircle, PackageSearch, Zap, AlertTriangle, Package, Edit2, Download, FileSpreadsheet, CalendarDays, Truck, History } from 'lucide-react';
import { PremiumSearch } from '../components/PremiumSearch';
import { usePersistentState } from '../utils/persistentState';
import { getToyBoxStockKey } from '../utils/productCatalog';
import { useRouteOrderReadState } from '../hooks/useRouteOrderReadState';
import * as XLSX from 'xlsx';
import './FactoryPanel.css';
import { BulkExportModal } from '../components/BulkExportModal';

const containerVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { staggerChildren: 0.1, duration: 0.4, ease: [0.4, 0, 0.2, 1] }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 }
};
const FACTORY_PAGE_SIZE = 10;

const getVisiblePageNumbers = (currentPage, totalPages, maxVisible = 5) => {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const formatExportDate = (value) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-BD', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const DATE_PRESETS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'thisMonth', label: 'This Month' }
];

const EXPORT_PRESETS = [
  { id: 'sinceLast', label: 'Since Last Export' },
  ...DATE_PRESETS
];

const EXPORT_HISTORY_KEY = 'factory:confirmed-export-history';

const getRangeBoundary = (value, boundary) => {
  if (!value) return null;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  if (boundary === 'start') {
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

const parseDateTimeRangeBoundary = (value, boundary) => {
  if (!value) return null;

  if (value.length === 10) {
    return getRangeBoundary(value, boundary);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const toDateTimeLocalValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const formatExportWindow = (from, to, fallback = 'All Time') => {
  const start = from ? formatExportDate(from) : '';
  const end = to ? formatExportDate(to) : '';

  if (start && end) return `${start} - ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return fallback;
};

const matchesDatePreset = (value, preset) => {
  if (!value || preset === 'all') return true;

  const orderDate = new Date(value);
  if (Number.isNaN(orderDate.getTime())) return false;

  const now = new Date();

  if (preset === 'today') {
    return now.getTime() - orderDate.getTime() <= 24 * 60 * 60 * 1000;
  }

  if (preset === 'yesterday') {
    const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return orderDate >= yesterdayStart && orderDate < yesterdayEnd;
  }

  if (preset === 'thisMonth') {
    return (
      orderDate.getFullYear() === now.getFullYear() &&
      orderDate.getMonth() === now.getMonth()
    );
  }

  return true;
};

const matchesCustomDateRange = (value, startDate, endDate) => {
  if (!value) return false;

  const orderDate = new Date(value);
  if (Number.isNaN(orderDate.getTime())) return false;

  if (startDate && orderDate < startDate) {
    return false;
  }

  if (endDate && orderDate > endDate) {
    return false;
  }

  return true;
};

const formatProductSummary = (order) => {
  const items = Array.isArray(order?.ordered_items) ? order.ordered_items : [];

  if (items.length === 0) {
    const fallbackQty = Number(order?.quantity) || 1;
    return `${order?.product_name || ''} x${fallbackQty}`.trim();
  }

  return items
    .map((item) => {
      const name = item?.name || order?.product_name || 'Item';
      const quantity = Number(item?.quantity) || 1;
      const size = item?.size ? ` (${item.size})` : '';
      return `${name}${size} x${quantity}`;
    })
    .join(', ');
};

const getOrderQuantity = (order) => {
  if (Number(order?.quantity) > 0) return Number(order.quantity);

  const items = getOrderItems(order);
  if (items.length === 0) return 1;

  return items.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0);
};

const getOrderItems = (order) => {
  if (Array.isArray(order?.order_lines_payload) && order.order_lines_payload.length > 0) {
    return order.order_lines_payload;
  }

  if (Array.isArray(order?.ordered_items) && order.ordered_items.length > 0) {
    return order.ordered_items.filter((item) => item && typeof item === 'object');
  }

  return [];
};

const parseEmbeddedDeliveryCharge = (value) => {
  const text = String(value || '');
  const matches = [...text.matchAll(/(\d{2,5})/g)];
  if (matches.length === 0) return null;

  const parsed = Number(matches[matches.length - 1][1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getDeliveryCharge = (order) => {
  const directCharge = Number(order?.delivery_charge);
  if (directCharge > 0) return directCharge;

  const summaryCharge = Number(order?.pricing_summary?.delivery_charge);
  if (summaryCharge > 0) return summaryCharge;

  const embeddedCharge = parseEmbeddedDeliveryCharge(order?.shipping_zone);
  if (embeddedCharge !== null) return embeddedCharge;

  return order?.shipping_zone === 'Inside Dhaka' ? 60 : 130;
};

const getProductPrice = (order) => {
  const items = getOrderItems(order);
  const firstPricedItem = items.find((item) => {
    const unitPrice = Number(item?.unit_price ?? item?.price);
    const lineTotal = Number(item?.line_total);
    return unitPrice > 0 || lineTotal > 0;
  });

  if (firstPricedItem) {
    const unitPrice = Number(firstPricedItem.unit_price ?? firstPricedItem.price);
    if (unitPrice > 0) return unitPrice;

    const quantity = Number(firstPricedItem.quantity) || 1;
    const lineTotal = Number(firstPricedItem.line_total);
    if (lineTotal > 0) return Math.round((lineTotal / quantity) * 100) / 100;
  }

  const pricingSubtotal = Number(order?.pricing_summary?.subtotal);
  const quantity = getOrderQuantity(order);
  if (pricingSubtotal > 0) return Math.round((pricingSubtotal / Math.max(1, quantity)) * 100) / 100;

  const total = Number(order?.amount) || 0;
  const deliveryCharge = getDeliveryCharge(order);
  return Math.round((Math.max(0, total - deliveryCharge) / Math.max(1, quantity)) * 100) / 100;
};

const getTotalAmount = (order) => {
  const total = Number(order?.amount);
  if (total > 0) return total;

  return getProductPrice(order) + getDeliveryCharge(order);
};

const getProductText = (order) => {
  const itemText = Array.isArray(order?.ordered_items)
    ? order.ordered_items.map((item) => [
        item?.name,
        item?.product_name,
        item?.color,
        item?.variant,
        item?.size
      ].filter(Boolean).join(' ')).join(' ')
    : '';

  return [
    order?.product_name,
    order?.size,
    itemText,
    formatProductSummary(order)
  ].filter(Boolean).join(' ');
};

const getOrderShortForm = (order) => {
  const idPrefix = String(order?.id || '').match(/^#?([A-Z]{2,12})[-_]/i)?.[1];
  if (idPrefix && idPrefix.toUpperCase() !== 'ORD') {
    return idPrefix.toUpperCase();
  }

  const productText = getProductText(order).toLowerCase();
  if (productText.includes('toy box') || productText.includes('toybox')) return 'TB';
  if (productText.includes('sunglass') || productText.includes('sunglasses')) return 'Sunglass';
  if (productText.includes('travel bag') || productText.includes('canvas') || productText.includes('bag')) return 'STB';

  return order?.product_name || '';
};

const getColorCode = (order) => {
  const productText = getProductText(order).toLowerCase();
  const knownColors = [
    'black', 'beige', 'silver', 'golden', 'gold', 'blue', 'red',
    'green', 'white', 'brown', 'gray', 'grey', 'pink', 'purple', 'cream'
  ];

  const matches = knownColors.filter((color) => (
    new RegExp(`\\b${color}\\b`, 'i').test(productText)
  ));

  return [...new Set(matches.map((color) => (color === 'gold' ? 'golden' : color)))].join(', ');
};

const EXPORT_COLUMNS = [
  'DATE',
  'NOTE',
  'NAME',
  'ADDRESS',
  'inside and outside',
  'Phone',
  'code',
  'CODE',
  'Source',
  'QTY(TOY)',
  'QTY(MPB)',
  'ORG QTY',
  'MMB',
  'STB BAG',
  'OTHER',
  'toy box am',
  'MPB AM',
  'ORG AM',
  'MMB AM',
  'BAG',
  'OTHER (AM)',
  'DELIVERY CHARGE',
  'Total amount'
];

const EXPORT_QTY_COLUMNS = {
  toy: 'QTY(TOY)',
  mpb: 'QTY(MPB)',
  org: 'ORG QTY',
  mmb: 'MMB',
  stb: 'STB BAG',
  other: 'OTHER'
};

const EXPORT_AMOUNT_COLUMNS = {
  toy: 'toy box am',
  mpb: 'MPB AM',
  org: 'ORG AM',
  mmb: 'MMB AM',
  stb: 'BAG',
  other: 'OTHER (AM)'
};

const formatSheetDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

const formatExportPhone = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.replace(/^88/, '').replace(/^0/, '');
};

const formatExportZone = (value = '') => {
  const text = String(value || '').replace(/\(?৳?\d{2,5}\)?/g, '').replace(/\s+/g, ' ').trim();
  const normalized = text.toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('inside') || normalized === 'dhaka') return 'Dhaka';
  if (normalized.includes('outside')) return 'Outside Dhaka';
  return text;
};

const formatExportSource = (value = '') => {
  const source = String(value || '').trim();
  if (!source) return '';
  if (source.toLowerCase() === 'website') return 'NEW WEB';
  return source.toUpperCase();
};

const getItemText = (item, order) => [
  item?.name,
  item?.product_name,
  item?.product,
  item?.title,
  item?.variant,
  item?.color,
  item?.size,
  order?.product_name,
  order?.size
].filter(Boolean).join(' ');

const getExportCategory = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  if (normalized.includes('toy box') || normalized.includes('toybox')) return 'toy';
  if (normalized.includes('mpb') || normalized.includes('multipurpose') || normalized.includes('multi purpose')) return 'mpb';
  if (normalized.includes('org') || normalized.includes('organizer') || normalized.includes('organiser')) return 'org';
  if (normalized.includes('mmb') || normalized.includes('mini')) return 'mmb';
  if (normalized.includes('stb') || normalized.includes('travel bag') || normalized.includes('canvas') || /\bbag\b/.test(normalized)) return 'stb';
  return 'other';
};

const getExportCode = (order) => {
  const category = getExportCategory(getProductText(order));
  if (category === 'toy') return 'Toy Box';
  if (category === 'mpb') return 'MPB';
  if (category === 'org') return 'ORG';
  if (category === 'mmb') return 'MMB';
  if (category === 'stb') return 'Travel bag';
  return order?.product_name || 'OTHER';
};

const toTitleCase = (value = '') => String(value || '')
  .split(/[\s,]+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(' ');

const getExportVariantCode = (order) => {
  const shortCode = getOrderShortForm(order);
  const colors = toTitleCase(getColorCode(order));
  return [shortCode, colors].filter(Boolean).join(' ').trim();
};

const getItemQuantity = (item) => Math.max(1, Number(item?.quantity ?? item?.qty) || 1);

const getItemAmount = (item) => {
  const quantity = getItemQuantity(item);
  const lineTotal = Number(item?.line_total ?? item?.total ?? item?.amount);
  if (lineTotal > 0) return lineTotal;

  const unitPrice = Number(item?.unit_price ?? item?.price);
  if (unitPrice > 0) return unitPrice * quantity;

  return 0;
};

const buildConfirmedExportRow = (order) => {
  const row = Object.fromEntries(EXPORT_COLUMNS.map((column) => [column, '']));
  const deliveryCharge = getDeliveryCharge(order);
  const totalAmount = getTotalAmount(order);
  const productAmount = Math.max(0, totalAmount - deliveryCharge);
  const items = getOrderItems(order);

  row.DATE = formatSheetDate(order.created_at);
  row.NOTE = order.notes || '';
  row.NAME = order.customer_name || '';
  row.ADDRESS = order.address || '';
  row['inside and outside'] = formatExportZone(order.shipping_zone);
  row.Phone = formatExportPhone(order.phone);
  row.code = getExportCode(order);
  row.CODE = getExportVariantCode(order);
  row.Source = formatExportSource(order.source);
  row['DELIVERY CHARGE'] = deliveryCharge || '';
  row['Total amount'] = totalAmount || '';

  if (items.length === 0) {
    const category = getExportCategory(getProductText(order));
    row[EXPORT_QTY_COLUMNS[category]] = getOrderQuantity(order);
    row[EXPORT_AMOUNT_COLUMNS[category]] = productAmount || '';
    return row;
  }

  let allocatedAmount = 0;
  items.forEach((item) => {
    const category = getExportCategory(getItemText(item, order));
    const qtyColumn = EXPORT_QTY_COLUMNS[category];
    const amountColumn = EXPORT_AMOUNT_COLUMNS[category];
    const quantity = getItemQuantity(item);
    const amount = getItemAmount(item);

    row[qtyColumn] = (Number(row[qtyColumn]) || 0) + quantity;
    if (amount > 0) {
      row[amountColumn] = (Number(row[amountColumn]) || 0) + amount;
      allocatedAmount += amount;
    }
  });

  if (allocatedAmount === 0) {
    const category = getExportCategory(getProductText(order));
    row[EXPORT_AMOUNT_COLUMNS[category]] = productAmount || '';
  }

  return row;
};

export const FactoryPanel = () => {
  const { orders, toyBoxes, autoDistributeOrders, updateOrderStatus } = useOrders();
  const { updatePresenceContext, profile, user } = useAuth();

  useEffect(() => {
    updatePresenceContext('Reviewing Confirmed Orders');
  }, [updatePresenceContext]);
  
  const [searchTerm, setSearchTerm] = usePersistentState('panel:factory:search', '');
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributeResult, setDistributeResult] = useState(null);
  const [activeTab, setActiveTab] = usePersistentState('panel:factory:tab', 'confirmed'); // 'confirmed' | 'queued'
  const [datePreset, setDatePreset] = usePersistentState('panel:factory:date-preset', 'all');
  const [dateFrom, setDateFrom] = usePersistentState('panel:factory:date-from', '');
  const [dateTo, setDateTo] = usePersistentState('panel:factory:date-to', '');
  const [currentPage, setCurrentPage] = useState(1);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [exportDatePreset, setExportDatePreset] = useState('sinceLast');
  const [exportDateFrom, setExportDateFrom] = useState('');
  const [exportDateTo, setExportDateTo] = useState('');
  const [exportHistory, setExportHistory] = useState(() => {
    try {
      const raw = localStorage.getItem(EXPORT_HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [lastExportedBatch, setLastExportedBatch] = useState(null);
  const [isMovingExportBatch, setIsMovingExportBatch] = useState(false);
  const [isExportingBatch, setIsExportingBatch] = useState(false);
  const [selectedConfirmedIds, setSelectedConfirmedIds] = useState([]);
  const [isMovingSelectedConfirmed, setIsMovingSelectedConfirmed] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(exportHistory.slice(0, 20)));
    } catch {
      // Export history is a convenience layer; exporting should not depend on storage.
    }
  }, [exportHistory]);

  const handleOpenEditModal = (order) => {
    setSelectedOrder(order);
    setIsEditModalOpen(true);
  };

  const handleRowClick = (order) => {
    markOrderRead(order);
    setSelectedOrder(order);
    setIsDetailsModalOpen(true);
  };

  // Confirmed = incoming, Factory Queue = waiting for stock
  const normalizedSearchTerm = searchTerm.toLowerCase();
  const rangeStartDate = useMemo(() => getRangeBoundary(dateFrom, 'start'), [dateFrom]);
  const rangeEndDate = useMemo(() => getRangeBoundary(dateTo, 'end'), [dateTo]);
  const hasCustomRange = Boolean(dateFrom || dateTo);

  const matchesActiveDateFilter = (value) => {
    if (hasCustomRange) {
      return matchesCustomDateRange(value, rangeStartDate, rangeEndDate);
    }

    return matchesDatePreset(value, datePreset);
  };

  const matchesPanelFilters = (order) => (
    (
      order.id.toLowerCase().includes(normalizedSearchTerm) ||
      (order.product_name || '').toLowerCase().includes(normalizedSearchTerm) ||
      (order.customer_name || '').toLowerCase().includes(normalizedSearchTerm)
    ) &&
    matchesActiveDateFilter(order.created_at)
  );

  const matchesSearchFilter = (order) => (
    order.id.toLowerCase().includes(normalizedSearchTerm) ||
    (order.product_name || '').toLowerCase().includes(normalizedSearchTerm) ||
    (order.customer_name || '').toLowerCase().includes(normalizedSearchTerm)
  );

  const confirmedOrders = orders.filter(
    (order) => order.status === 'Confirmed' && matchesPanelFilters(order)
  );

  const queuedOrders = orders.filter(
    (order) => order.status === 'Factory Queue' && matchesPanelFilters(order)
  );

  const displayOrders = activeTab === 'confirmed' ? confirmedOrders : queuedOrders;
  const { isOrderUnread, markOrderRead, unreadCount } = useRouteOrderReadState(`confirmed-panel:${activeTab}`, displayOrders);
  const latestExportHistory = exportHistory[0] || null;
  const latestConfirmedExportHistory = exportHistory.find((item) => item.tab === 'confirmed') || null;
  const exportRangeStartDate = useMemo(() => parseDateTimeRangeBoundary(exportDateFrom, 'start'), [exportDateFrom]);
  const exportRangeEndDate = useMemo(() => parseDateTimeRangeBoundary(exportDateTo, 'end'), [exportDateTo]);
  const exportHasCustomRange = exportDatePreset !== 'sinceLast' && Boolean(exportDateFrom || exportDateTo);
  const totalPages = Math.max(1, Math.ceil(displayOrders.length / FACTORY_PAGE_SIZE));
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * FACTORY_PAGE_SIZE;
    return displayOrders.slice(startIndex, startIndex + FACTORY_PAGE_SIZE);
  }, [displayOrders, currentPage]);
  const visiblePages = useMemo(() => getVisiblePageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, datePreset, dateFrom, dateTo]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setSelectedConfirmedIds((prev) => {
      const next = prev.filter((id) => confirmedOrders.some((order) => order.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [confirmedOrders]);

  useEffect(() => {
    if (activeTab !== 'confirmed') {
      setSelectedConfirmedIds([]);
    }
  }, [activeTab]);

  const selectedConfirmedOrders = useMemo(
    () => confirmedOrders.filter((order) => selectedConfirmedIds.includes(order.id)),
    [confirmedOrders, selectedConfirmedIds]
  );

  const paginatedConfirmedIds = useMemo(
    () => paginatedOrders
      .filter((order) => order.status === 'Confirmed')
      .map((order) => order.id),
    [paginatedOrders]
  );

  const isCurrentPageSelected = paginatedConfirmedIds.length > 0 &&
    paginatedConfirmedIds.every((id) => selectedConfirmedIds.includes(id));

  const handleSelectConfirmedOrder = (orderId) => {
    setSelectedConfirmedIds((prev) => (
      prev.includes(orderId)
        ? prev.filter((id) => id !== orderId)
        : [...prev, orderId]
    ));
  };

  const handleSelectConfirmedPage = () => {
    if (isCurrentPageSelected) {
      setSelectedConfirmedIds((prev) => prev.filter((id) => !paginatedConfirmedIds.includes(id)));
      return;
    }

    setSelectedConfirmedIds((prev) => Array.from(new Set([...prev, ...paginatedConfirmedIds])));
  };

  const handleMoveSelectedToBulkExported = async () => {
    if (selectedConfirmedOrders.length === 0) return;

    const confirmed = window.confirm(`Move ${selectedConfirmedOrders.length} selected confirmed orders to Bulk Exported?`);
    if (!confirmed) return;

    setIsMovingSelectedConfirmed(true);
    try {
      for (const order of selectedConfirmedOrders) {
        await updateOrderStatus(order.id, 'Bulk Exported');
      }
      setSelectedConfirmedIds([]);
      setDistributeResult({
        distributed: selectedConfirmedOrders.length,
        queued: 0,
        total: selectedConfirmedOrders.length,
        sourceStatus: 'Manual move to Bulk Exported'
      });
      setTimeout(() => setDistributeResult(null), 6000);
    } catch (error) {
      console.error('Selected confirmed move failed:', error);
      alert(`Move failed: ${error.message}`);
    } finally {
      setIsMovingSelectedConfirmed(false);
    }
  };

  // Stock availability check helper
  const getStockStatus = (order) => {
    const items = order.ordered_items || [];
    const isToyBox = (order.product_name || '').toUpperCase().includes('TOY BOX');
    if (!isToyBox || items.length === 0) return { matched: true, label: 'Auto Pass', missing: [] };

    const stockMap = {};
    toyBoxes.forEach((box) => {
      stockMap[getToyBoxStockKey(box.product_name || 'TOY BOX', box.toy_box_number)] = Number(box.stock_quantity) || 0;
    });

    const missing = items.filter(item => {
      const boxNum = typeof item === 'object' ? item.toyBoxNumber : item;
      if (boxNum == null) return false;
      const productName = typeof item === 'object' ? (item.name || order.product_name || 'TOY BOX') : 'TOY BOX';
      return (stockMap[getToyBoxStockKey(productName, boxNum)] || 0) < 1;
    });

    return {
      matched: missing.length === 0,
      label: missing.length === 0 ? 'Stock OK' : `${missing.length} Missing`,
      missing
    };
  };

  const handleAutoDistribute = async () => {
    setIsDistributing(true);
    setDistributeResult(null);
    try {
      const result = await autoDistributeOrders();
      setDistributeResult(result);
      setTimeout(() => setDistributeResult(null), 8000);
    } catch (error) {
      console.error('Auto distribute error:', error);
      setDistributeResult({ error: error.message });
    } finally {
      setIsDistributing(false);
    }
  };

  const handleManualSend = async (orderId) => {
    await updateOrderStatus(orderId, 'Courier Ready');
  };

  const handleRetryDistribute = async (orderId) => {
    await updateOrderStatus(orderId, 'Confirmed');
  };

  const getExportOrders = (preset, from, to) => {
    const startDate = parseDateTimeRangeBoundary(from, 'start');
    const endDate = parseDateTimeRangeBoundary(to, 'end');
    const hasRange = preset !== 'sinceLast' && Boolean(from || to);
    const targetStatus = activeTab === 'confirmed' ? 'Confirmed' : 'Factory Queue';
    const sinceLastStart = preset === 'sinceLast' && activeTab === 'confirmed' && latestConfirmedExportHistory?.exported_until
      ? new Date(latestConfirmedExportHistory.exported_until)
      : null;
    const sinceLastEnd = preset === 'sinceLast'
      ? (endDate || new Date())
      : null;

    return orders.filter((order) => {
      if (order.status !== targetStatus) {
        return false;
      }

      if (!matchesSearchFilter(order)) {
        return false;
      }

      if (preset === 'sinceLast') {
        return matchesCustomDateRange(order.created_at, sinceLastStart, sinceLastEnd);
      }

      if (hasRange) {
        return matchesCustomDateRange(order.created_at, startDate, endDate);
      }

      return matchesDatePreset(order.created_at, preset);
    });
  };

  const exportPreviewOrders = useMemo(
    () => getExportOrders(exportDatePreset, exportDateFrom, exportDateTo),
    [orders, activeTab, normalizedSearchTerm, exportDatePreset, exportDateFrom, exportDateTo, latestConfirmedExportHistory?.exported_until]
  );

  const handlePresetChange = (presetId) => {
    setDatePreset(presetId);
    setDateFrom('');
    setDateTo('');
  };

  const handleDateRangeChange = (field, value) => {
    setDatePreset('all');

    if (field === 'from') {
      setDateFrom(value);
      return;
    }

    setDateTo(value);
  };

  const handleClearDateRange = () => {
    setDateFrom('');
    setDateTo('');
    setDatePreset('all');
  };

  const handleOpenExportModal = () => {
    const defaultPreset = activeTab === 'confirmed' ? 'sinceLast' : datePreset;
    setExportDatePreset(defaultPreset);
    setExportDateFrom('');
    setExportDateTo(defaultPreset === 'sinceLast' ? toDateTimeLocalValue(new Date()) : '');
    setLastExportedBatch(null);
    setIsExportModalOpen(true);
  };

  const handleExportPresetChange = (presetId) => {
    setExportDatePreset(presetId);
    setExportDateFrom('');
    setExportDateTo(presetId === 'sinceLast' ? toDateTimeLocalValue(new Date()) : '');
  };

  const handleExportDateRangeChange = (field, value) => {
    if (!(exportDatePreset === 'sinceLast' && field === 'to')) {
      setExportDatePreset('all');
    }

    if (field === 'from') {
      setExportDateFrom(value);
      return;
    }

    setExportDateTo(value);
  };

  const handleClearExportDateRange = () => {
    setExportDatePreset(activeTab === 'confirmed' ? 'sinceLast' : 'all');
    setExportDateFrom('');
    setExportDateTo(activeTab === 'confirmed' ? toDateTimeLocalValue(new Date()) : '');
  };

  const handleBulkExport = async () => {
    if (exportPreviewOrders.length === 0) return;
    setIsExportingBatch(true);
    const exportedAt = new Date().toISOString();
    const exportedBy = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    const sortedExportOrders = [...exportPreviewOrders].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    const lastOrder = sortedExportOrders[sortedExportOrders.length - 1] || null;
    const explicitEnd = exportRangeEndDate && !Number.isNaN(exportRangeEndDate.getTime())
      ? exportRangeEndDate.toISOString()
      : exportedAt;
    const explicitStart = exportDatePreset === 'sinceLast'
      ? latestConfirmedExportHistory?.exported_until || null
      : (exportRangeStartDate && !Number.isNaN(exportRangeStartDate.getTime()) ? exportRangeStartDate.toISOString() : null);

    const exportRows = sortedExportOrders.map(buildConfirmedExportRow);

    const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: EXPORT_COLUMNS });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeTab === 'confirmed' ? 'Confirmed Orders' : 'Queued Orders');

    const dateLabel = new Date().toISOString().split('T')[0];
    const tabLabel = activeTab === 'confirmed' ? 'confirmed' : 'queue';
    const rangeLabel = exportHasCustomRange
      ? `range-${(exportDateFrom || 'start').replace(':', '')}-to-${(exportDateTo || 'now').replace(':', '')}`
      : (exportDatePreset === 'sinceLast' ? 'since-last-export' : (exportDatePreset === 'all' ? 'all-time' : exportDatePreset.toLowerCase()));
    XLSX.writeFile(workbook, `confirmed-panel-${tabLabel}-${rangeLabel}-${dateLabel}.xlsx`);

    const batch = {
      id: `export-${Date.now()}`,
      tab: activeTab,
      exported_at: exportedAt,
      exported_by: exportedBy,
      exported_from: explicitStart,
      exported_until: explicitEnd,
      preset: exportDatePreset,
      order_count: sortedExportOrders.length,
      order_ids: sortedExportOrders.map((order) => order.id),
      last_order_id: lastOrder?.id || null,
      last_order_created_at: lastOrder?.created_at || null,
      moved_to_courier_at: null,
      moved_to_courier_by: null
    };

    try {
      let updatedBatch = batch;

      if (activeTab === 'confirmed') {
        const movedAt = new Date().toISOString();
        for (const order of sortedExportOrders) {
          if (order.status === 'Confirmed') {
            // Sequential updates keep load low while live orders continue coming in.
            await updateOrderStatus(order.id, 'Bulk Exported');
          }
        }

        updatedBatch = {
          ...batch,
          moved_to_courier_at: movedAt,
          moved_to_courier_by: exportedBy,
          moved_count: sortedExportOrders.length
        };
      }

      setLastExportedBatch(updatedBatch);
      setExportHistory((prev) => [updatedBatch, ...prev].slice(0, 20));
    } catch (error) {
      console.error('Export batch move failed:', error);
      setLastExportedBatch(batch);
      setExportHistory((prev) => [batch, ...prev].slice(0, 20));
      alert(`Export downloaded, but moving orders to Bulk Exported failed: ${error.message}`);
    } finally {
      setIsExportingBatch(false);
    }
  };

  const handleMoveExportedToCourier = async () => {
    if (!lastExportedBatch?.order_ids?.length || activeTab !== 'confirmed') return;

    const targetOrders = orders.filter((order) =>
      lastExportedBatch.order_ids.includes(order.id) &&
      order.status === 'Confirmed'
    );

    if (targetOrders.length === 0) {
      alert('No confirmed orders from this export batch are left to move.');
      return;
    }

    const confirmed = window.confirm(`Move ${targetOrders.length} exported orders to Bulk Exported?`);
    if (!confirmed) return;

    setIsMovingExportBatch(true);
    const movedBy = profile?.name || user?.user_metadata?.full_name || user?.email || 'Unknown User';
    const movedAt = new Date().toISOString();

    try {
      for (const order of targetOrders) {
        // Sequential updates keep load low on the live order system.
        await updateOrderStatus(order.id, 'Bulk Exported');
      }

      const updatedBatch = {
        ...lastExportedBatch,
        moved_to_courier_at: movedAt,
        moved_to_courier_by: movedBy,
        moved_count: targetOrders.length
      };

      setLastExportedBatch(updatedBatch);
      setExportHistory((prev) => prev.map((item) => (
        item.id === updatedBatch.id ? updatedBatch : item
      )));
    } catch (error) {
      console.error('Moving exported orders failed:', error);
      alert(`Move failed: ${error.message}`);
    } finally {
      setIsMovingExportBatch(false);
    }
  };

  const exportScopeLabel = exportHasCustomRange
    ? 'Custom Date & Time'
    : EXPORT_PRESETS.find((preset) => preset.id === exportDatePreset)?.label;
  const exportWindowLabel = exportHasCustomRange
    ? formatExportWindow(exportRangeStartDate, exportRangeEndDate, 'Custom Date & Time')
    : exportDatePreset === 'sinceLast'
      ? formatExportWindow(latestConfirmedExportHistory?.exported_until, exportRangeEndDate || new Date(), latestConfirmedExportHistory ? 'Since Last Export' : 'New export window')
      : exportScopeLabel;

  return (
    <motion.div 
      className="factory-panel"
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      <header className="page-header">
        <div>
          <h1 className="premium-title">Confirmed Panel</h1>
          <p className="page-subtitle">Confirmed order review, distribution and inventory verification hub.</p>
        </div>
        <div className="factory-header-actions">
          <Button
            variant="primary"
            onClick={handleOpenExportModal}
            disabled={confirmedOrders.length === 0}
            className="factory-export-btn"
          >
            <FileSpreadsheet size={18} />
            <span>Bulk Export ({confirmedOrders.length})</span>
            <Download size={16} />
          </Button>
        </div>
      </header>

      {/* Result Toast */}
      <AnimatePresence>
        {distributeResult && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`distribute-result-toast ${distributeResult.error ? 'error' : 'success'}`}
          >
            {distributeResult.error ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            <span>
              {distributeResult.error ? `Error: ${distributeResult.error}` : (
                <>
                  Distribution complete! <strong>{distributeResult.distributed}</strong> Approvals, 
                  <strong> {distributeResult.queued}</strong> Queued for stock.
                </>
              )}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats */}
      <section className="factory-stats-row">
        <motion.div variants={itemVariants}>
          <Card className="factory-stat-card">
            <div className="stat-icon-box blue"><Package size={22} /></div>
            <div className="stat-info">
              <span className="label">Confirmed</span>
              <span className="value">{confirmedOrders.length}</span>
            </div>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants}>
          <Card className="factory-stat-card">
            <div className="stat-icon-box orange"><AlertTriangle size={22} /></div>
            <div className="stat-info">
              <span className="label">Total Queued</span>
              <span className="value">{queuedOrders.length}</span>
            </div>
          </Card>
        </motion.div>
        <motion.div variants={itemVariants}>
          <Card className="factory-stat-card">
            <div className="stat-icon-box green"><CheckCircle size={22} /></div>
            <div className="stat-info">
              <span className="label">Bulk Exported</span>
              <span className="value">{orders.filter(o => o.status === 'Bulk Exported').length}</span>
            </div>
          </Card>
        </motion.div>
      </section>

      {/* Tab Toggle */}
      <div className="factory-tabs-container">
        <div className="factory-tabs">
          <button className={`factory-tab ${activeTab === 'confirmed' ? 'active' : ''}`} onClick={() => setActiveTab('confirmed')}>
            <Package size={16} /> Confirmed ({confirmedOrders.length})
          </button>
          <button className={`factory-tab ${activeTab === 'queued' ? 'active' : ''}`} onClick={() => setActiveTab('queued')}>
            <AlertTriangle size={16} /> Queue ({queuedOrders.length})
          </button>
        </div>
      </div>

      <Card className="table-card" noPadding>
        <div className="table-search-bar">
          <PremiumSearch
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by ID, name or product..."
            suggestions={
              searchTerm ? orders.filter(o => 
                o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (o.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (o.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase())
              ).slice(0, 5).map(o => ({
                id: o.id,
                label: o.customer_name,
                sub: `${o.id} • ${o.product_name}`,
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
          <div className="factory-date-preset-bar">
            <div className="factory-date-preset-label">
              <CalendarDays size={15} />
              <span>Premium Filter</span>
            </div>
            <div className="factory-date-preset-tabs">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`factory-date-chip ${!hasCustomRange && datePreset === preset.id ? 'active' : ''}`}
                  onClick={() => handlePresetChange(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="factory-range-filter">
            <div className="factory-range-input-group">
              <label className="factory-range-label" htmlFor="factory-date-from">From</label>
              <input
                id="factory-date-from"
                type="date"
                className="factory-range-input"
                value={dateFrom}
                onChange={(event) => handleDateRangeChange('from', event.target.value)}
              />
            </div>
            <div className="factory-range-input-group">
              <label className="factory-range-label" htmlFor="factory-date-to">To</label>
              <input
                id="factory-date-to"
                type="date"
                className="factory-range-input"
                value={dateTo}
                onChange={(event) => handleDateRangeChange('to', event.target.value)}
              />
            </div>
            <button
              type="button"
              className="factory-range-clear-btn"
              onClick={handleClearDateRange}
              disabled={!hasCustomRange && datePreset === 'all'}
            >
              Reset
            </button>
          </div>
          <div className="filter-actions-group">
            {unreadCount > 0 && (
              <span className="route-unread-count-pill" title="Orders not opened in this Confirmed panel tab">
                {unreadCount} unread
              </span>
            )}
            <span className="order-count-badge order-count-badge--scope">
              {hasCustomRange ? 'Custom Range' : DATE_PRESETS.find((preset) => preset.id === datePreset)?.label}
            </span>
            <span className="order-count-badge">{displayOrders.length} records found</span>
          </div>
          {activeTab === 'confirmed' && selectedConfirmedIds.length > 0 && (
            <div className="factory-selection-toolbar">
              <div className="factory-selection-copy">
                <strong>{selectedConfirmedIds.length}</strong>
                <span>confirmed orders selected</span>
              </div>
              <button
                type="button"
                className="factory-selection-clear"
                onClick={() => setSelectedConfirmedIds([])}
                disabled={isMovingSelectedConfirmed}
              >
                Clear
              </button>
              <Button
                variant="primary"
                onClick={handleMoveSelectedToBulkExported}
                disabled={isMovingSelectedConfirmed || selectedConfirmedOrders.length === 0}
              >
                {isMovingSelectedConfirmed ? <Loader2 size={16} className="spin" /> : <Truck size={16} />}
                <span>{isMovingSelectedConfirmed ? 'Moving...' : 'Move to Bulk Exported'}</span>
              </Button>
            </div>
          )}
        </div>
        
        <div className="factory-table-wrapper">
          <table className="factory-management-table">
            <thead>
              <tr>
                {activeTab === 'confirmed' && (
                  <th className="factory-select-col">
                    <input
                      type="checkbox"
                      className="factory-checkbox"
                      checked={isCurrentPageSelected}
                      onChange={handleSelectConfirmedPage}
                      disabled={paginatedConfirmedIds.length === 0 || isMovingSelectedConfirmed}
                      aria-label="Select visible confirmed orders"
                    />
                  </th>
                )}
                <th>Reference</th>
                <th>Recipient</th>
                <th>Focus Products</th>
                <th>Stock Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {paginatedOrders.map(order => {
                  const stock = getStockStatus(order);
                  const isToyBox = (order.product_name || '').toUpperCase().includes('TOY BOX');
                  
                  return (
                    <motion.tr 
                      key={order.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`factory-order-row cursor-pointer ${isOrderUnread(order) ? 'route-unread-row' : ''}`}
                      onClick={() => handleRowClick(order)}
                    >
                      {activeTab === 'confirmed' && (
                        <td className="factory-select-cell" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="factory-checkbox"
                            checked={selectedConfirmedIds.includes(order.id)}
                            onChange={() => handleSelectConfirmedOrder(order.id)}
                            disabled={isMovingSelectedConfirmed || order.status !== 'Confirmed'}
                            aria-label={`Select order ${order.id}`}
                          />
                        </td>
                      )}
                      <td className="order-id-cell">
                        <div className="route-read-card-header">
                          {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                          <span className="saas-id">#{(order.id || '').replace('ORD-', '')}</span>
                          {isOrderUnread(order) && <span className="route-unread-chip">New</span>}
                        </div>
                      </td>
                      <td>
                        <div className="factory-customer-stack">
                          <span className="saas-text-dark">{order.customer_name}</span>
                          <span className="saas-text">{order.phone}</span>
                        </div>
                      </td>
                      <td>
                        <div className="factory-product-stack">
                          <div className="factory-product-line">
                            <span className="saas-text-dark">{order.product_name}</span>
                            {order.size && <span className="factory-size-pill">T-{order.size}</span>}
                          </div>
                          {isToyBox && (order.ordered_items || []).length > 0 && (
                            <div className="factory-item-pills">
                              {(order.ordered_items || []).map((item, idx) => {
                                const boxNum = typeof item === 'object' ? item.toyBoxNumber : item;
                                if (boxNum == null) return null;
                                const productName = typeof item === 'object' ? (item.name || order.product_name || 'TOY BOX') : 'TOY BOX';
                                const stockKey = getToyBoxStockKey(productName, boxNum);
                                const stockQty = toyBoxes.find((box) => getToyBoxStockKey(box.product_name || 'TOY BOX', box.toy_box_number) === stockKey)?.stock_quantity || 0;
                                const isOut = stockQty < 1;

                                return (
                                  <span key={`${order.id}-item-${idx}`} className={`factory-item-pill ${isOut ? 'out' : ''}`}>
                                    {item?.name ? `${item.name.charAt(0)}${boxNum}` : `#${boxNum}`}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="factory-stock-block">
                          <Badge variant={stock.matched ? 'success' : 'warning'} className="factory-stock-pill">
                            {stock.matched ? 'Full Stock' : `${stock.missing.length} Missing`}
                          </Badge>
                          {!stock.matched && (
                             <div className="factory-meta-note">Awaiting replenishment</div>
                          )}
                        </div>
                      </td>
                      <td className="factory-actions-cell">
                        <div className="factory-action-grid">
                          <button className="factory-action-btn edit" onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }} title="Adjust Order">
                            <Edit2 size={14} /> <span>Edit</span>
                          </button>
                          {order.status === 'Factory Queue' && (
                            <button className="factory-action-btn retry" onClick={(e) => { e.stopPropagation(); handleRetryDistribute(order.id); }} title="Recheck Inventory">
                               <Zap size={14} /> <span>Recheck</span>
                             </button>
                          )}
                          {!stock.matched && (
                            <span className="factory-inline-note">{order.status === 'Confirmed' ? 'Blocked' : 'Insufficient'}</span>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {displayOrders.length === 0 && (
                <tr>
                  <td colSpan={activeTab === 'confirmed' ? 6 : 5} className="empty-state-cell">
                    <motion.div 
                      className="empty-state-content"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <div className="empty-icon-wrapper" style={{ opacity: 0.2 }}>
                        <PackageSearch size={64} />
                      </div>
                      <h3>No records found</h3>
                      <p>
                        {activeTab === 'confirmed' 
                          ? 'Incoming confirmed orders will appear here for verification.' 
                          : 'Queue is empty. No orders are currently blocked due to stock.'}
                      </p>
                    </motion.div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {displayOrders.length > 0 && (
          <div className="factory-pagination-footer">
            <div className="factory-pagination-info">
              Showing {(currentPage - 1) * FACTORY_PAGE_SIZE + 1}-
              {Math.min(currentPage * FACTORY_PAGE_SIZE, displayOrders.length)} of {displayOrders.length} records
            </div>
            <div className="factory-pagination-actions">
              <button
                className="factory-page-btn"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <div className="factory-page-numbers">
                {visiblePages.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    className={`factory-page-btn factory-page-num ${currentPage === pageNumber ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>
              <button
                className="factory-page-btn"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      <OrderEditModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        order={selectedOrder} 
      />

      <BulkExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        confirmedOrders={orders.filter(o => o.status === 'Confirmed')}
        selectedIds={selectedConfirmedIds}
        onStatusChange={updateOrderStatus}
        exportedBy={profile?.name || user?.user_metadata?.full_name || user?.email || 'User'}
      />


      <OrderDetailsModal 
        isOpen={isDetailsModalOpen} 
        onClose={() => setIsDetailsModalOpen(false)} 
        order={selectedOrder}
        onEdit={handleOpenEditModal}
      />
    </motion.div>
  );
};
