import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { OrderEditModal } from '../components/OrderEditModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { Loader2, CheckCircle, PackageSearch, Zap, AlertTriangle, Package, Edit2, Download, FileSpreadsheet, CalendarDays, Truck, History, ArrowUpDown, Filter, Globe, Calendar, MapPin, Phone, User, Clock, Copy, MessageCircle, FileText, ChevronDown, Tag, Palette, Layers } from 'lucide-react';
import { PremiumSearch } from '../components/PremiumSearch';
import { usePersistentState } from '../utils/persistentState';
import { getToyBoxStockKey } from '../utils/productCatalog';
import { useRouteOrderReadState } from '../hooks/useRouteOrderReadState';
import CurrencyIcon from '../components/CurrencyIcon';
import * as XLSX from 'xlsx';
import './FactoryPanel.css';
import '../components/OrderRow.css';
import { BulkExportModal } from '../components/BulkExportModal';

const SourceBadge = ({ traffic_source, source }) => {
  const raw = traffic_source || source;
  if (!raw) return null;
  const s = String(raw).toLowerCase();

  let label = raw;
  let cls = 'source-badge-default';

  if (s.includes('messenger') || s === 'msg') {
    cls = 'source-badge-messenger';
    label = 'Messenger';
  } else if (s.includes('facebook') || s === 'fb' || s.includes('l.facebook.com') || s.includes('m.facebook.com')) {
    cls = 'source-badge-fb';
    label = 'Facebook';
  } else if (s.includes('tiktok') || s.includes('ttclid')) {
    cls = 'source-badge-tiktok';
    label = 'TikTok';
  } else if (s.includes('instagram') || s === 'ig' || s.includes('l.instagram.com')) {
    cls = 'source-badge-ig';
    label = 'Instagram';
  } else if (s.includes('youtube') || s === 'yt') {
    cls = 'source-badge-yt';
    label = 'YouTube';
  } else if (s.includes('google') || s === 'cpc') {
    cls = 'source-badge-google';
    label = 'Google';
  } else if (s.includes('website') || s.includes('web') || s.includes('new web') || s.includes('stb-landing') || s.includes('-landing')) {
    cls = 'source-badge-web';
    label = 'Website';
  } else if (s.includes('direct')) {
    cls = 'source-badge-direct';
    label = 'Direct';
  } else if (s.includes('whatsapp')) {
    cls = 'source-badge-wa';
    label = 'WhatsApp';
  }

  return <span className={`source-badge ${cls}`}>{label}</span>;
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
  { id: '7days', label: '7 Days' },
  { id: '30days', label: '30 Days' },
  { id: 'thisMonth', label: 'This Month' }
];

const SOURCES = ['All', 'Website', 'Facebook', 'Instagram', 'Direct', 'Messenger'];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'amount-high', label: 'Amount: High to Low' },
  { value: 'amount-low', label: 'Amount: Low to High' },
  { value: 'name-asc', label: 'Customer: A-Z' }
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

  if (preset === '7days') {
    return now.getTime() - orderDate.getTime() <= 7 * 24 * 60 * 60 * 1000;
  }

  if (preset === '30days') {
    return now.getTime() - orderDate.getTime() <= 30 * 24 * 60 * 60 * 1000;
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

export const getCleanProductDisplay = (order) => {
  const items = order?.ordered_items || [];
  
  // Total Qty calculation
  let totalQty = Number(order?.quantity || 0);
  if (items.length > 0) {
    const sumQty = items.reduce((acc, item) => {
      const q = typeof item === 'object' ? Number(item.quantity || item.qty || 1) : 1;
      return acc + q;
    }, 0);
    if (sumQty > 0) totalQty = sumQty;
  }
  if (!totalQty || totalQty <= 0) totalQty = 1;

  // Build clean product name string
  let cleanName = '';

  if (items.length > 0) {
    const itemNames = items.map(item => {
      if (typeof item === 'object') {
        const name = (item.name || item.product_name || item.title || '').trim();
        const qty = Number(item.quantity || item.qty || 1);
        return qty > 1 ? `${name} (x${qty})` : name;
      }
      return String(item).trim();
    }).filter(Boolean);

    cleanName = itemNames.join(', ');
  }

  // Fallback check if cleanName is empty or if product_name contains actual product name
  const origName = (order?.product_name || '').trim();

  if (!cleanName || /^\d+\s*items?$/i.test(cleanName)) {
    if (origName && !/^\d+\s*items?$/i.test(origName)) {
      cleanName = origName;
    } else if (items.length > 0) {
      const fallbackItems = items.map(i => (typeof i === 'object' ? (i.name || i.product_name || i.title) : i)).filter(Boolean);
      cleanName = fallbackItems.join(', ') || origName || 'Standard Product';
    } else {
      cleanName = origName || 'Standard Product';
    }
  }

  return { cleanName, totalQty };
};

export const FactoryPanel = () => {
  const { orders, toyBoxes, autoDistributeOrders, updateOrderStatus, dispatchToCourier } = useOrders();
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
  const [sourceFilter, setSourceFilter] = usePersistentState('panel:factory:source-filter', 'All');
  const [productFilter, setProductFilter] = usePersistentState('panel:factory:product-filter', 'All');
  const [colorFilter, setColorFilter] = usePersistentState('panel:factory:color-filter', 'All');
  const [variantFilter, setVariantFilter] = usePersistentState('panel:factory:variant-filter', 'All');
  const [zoneFilter, setZoneFilter] = usePersistentState('panel:factory:zone-filter', 'All');
  const [sortOrder, setSortOrder] = usePersistentState('panel:factory:sort-order', 'newest');
  const [pageSize, setPageSize] = usePersistentState('panel:factory:page-size', 10);
  const [currentPage, setCurrentPage] = useState(1);
  const [copiedPhoneId, setCopiedPhoneId] = useState(null);
  const [activeCourierDropdownId, setActiveCourierDropdownId] = useState(null);

  useEffect(() => {
    const handleGlobalClick = () => setActiveCourierDropdownId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const handleCopyPhone = (e, phone, orderId) => {
    e.stopPropagation();
    if (!phone) return;
    navigator.clipboard.writeText(String(phone));
    setCopiedPhoneId(orderId);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

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
  const [rowLoading, setRowLoading] = useState({});
  const [isDispatchingSelected, setIsDispatchingSelected] = useState(false);

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

  // Extract Unique Products, Colors & Variants for Filter Dropdowns
  const { uniqueProducts, uniqueColors, uniqueVariants } = useMemo(() => {
    const products = new Set();
    const colors = new Set();
    const variants = new Set();

    const commonColors = [
      'red', 'blue', 'black', 'green', 'white', 'pink', 'yellow', 
      'purple', 'orange', 'grey', 'gray', 'gold', 'silver', 'navy', 'brown'
    ];

    orders.forEach(order => {
      // 1. Product Name extraction
      const { cleanName } = getCleanProductDisplay(order);
      if (cleanName) {
        cleanName.split(',').forEach(p => {
          const clean = p.replace(/\(x\d+\)/gi, '').trim();
          if (clean && !/^\d+\s*items?$/i.test(clean)) {
            products.add(clean);
          }
        });
      }
      if (order.product_name && !/^\d+\s*items?$/i.test(order.product_name)) {
        products.add(order.product_name.trim());
      }

      // 2. Items - Color & Variant extraction
      const items = order.ordered_items || [];
      items.forEach(item => {
        let itemName = '';
        if (typeof item === 'object') {
          itemName = item.name || item.product_name || item.title || '';
          if (item.color) colors.add(item.color.trim());
          if (item.variant) variants.add(item.variant.trim());
          if (item.toyBoxNumber != null) variants.add(`Box #${item.toyBoxNumber}`);
        } else {
          itemName = String(item);
        }

        const lowerItem = itemName.toLowerCase();
        commonColors.forEach(c => {
          if (lowerItem.includes(c)) {
            colors.add(c.charAt(0).toUpperCase() + c.slice(1));
          }
        });

        if (itemName.includes('-')) {
          const parts = itemName.split('-').map(s => s.trim());
          if (parts.length > 1) {
            parts.slice(1).forEach(part => {
              const lowerPart = part.toLowerCase();
              if (commonColors.some(c => lowerPart.includes(c))) {
                colors.add(part.charAt(0).toUpperCase() + part.slice(1));
              } else if (part.length > 0) {
                variants.add(part);
              }
            });
          }
        }
      });

      // Also check order.product_name for color
      const lowerProd = (order.product_name || '').toLowerCase();
      commonColors.forEach(c => {
        if (lowerProd.includes(c)) {
          colors.add(c.charAt(0).toUpperCase() + c.slice(1));
        }
      });
    });

    return {
      uniqueProducts: Array.from(products).sort(),
      uniqueColors: Array.from(colors).sort(),
      uniqueVariants: Array.from(variants).sort()
    };
  }, [orders]);

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

  const matchesSearchFilter = (order) => {
    if (!normalizedSearchTerm) return true;
    const idMatch = (order.id || '').toLowerCase().includes(normalizedSearchTerm);
    const productMatch = (order.product_name || '').toLowerCase().includes(normalizedSearchTerm);
    const customerMatch = (order.customer_name || '').toLowerCase().includes(normalizedSearchTerm);
    const phoneMatch = (order.phone || '').includes(normalizedSearchTerm);
    const addressMatch = (order.address || '').toLowerCase().includes(normalizedSearchTerm);
    const trackingMatch = (order.tracking_code || order.consignment_id || '').toLowerCase().includes(normalizedSearchTerm);
    return idMatch || productMatch || customerMatch || phoneMatch || addressMatch || trackingMatch;
  };

  const matchesPanelFilters = (order) => {
    if (!matchesSearchFilter(order)) {
      return false;
    }

    if (sourceFilter !== 'All' && (order.source || 'Direct') !== sourceFilter) {
      return false;
    }

    // Product Filter
    if (productFilter !== 'All') {
      const { cleanName } = getCleanProductDisplay(order);
      const prodStr = `${cleanName} ${order.product_name || ''}`.toLowerCase();
      if (!prodStr.includes(productFilter.toLowerCase())) {
        return false;
      }
    }

    // Color Filter
    if (colorFilter !== 'All') {
      const targetColor = colorFilter.toLowerCase();
      const items = order.ordered_items || [];
      let hasColor = items.some(item => {
        if (typeof item === 'object') {
          if ((item.color || '').toLowerCase().includes(targetColor)) return true;
          if ((item.name || '').toLowerCase().includes(targetColor)) return true;
        }
        return String(item).toLowerCase().includes(targetColor);
      });
      if (!hasColor && (order.product_name || '').toLowerCase().includes(targetColor)) {
        hasColor = true;
      }
      if (!hasColor) return false;
    }

    // Variant Filter
    if (variantFilter !== 'All') {
      const targetVar = variantFilter.toLowerCase();
      const items = order.ordered_items || [];
      let hasVariant = items.some(item => {
        if (typeof item === 'object') {
          if ((item.variant || '').toLowerCase().includes(targetVar)) return true;
          if (item.toyBoxNumber != null && `box #${item.toyBoxNumber}`.toLowerCase().includes(targetVar)) return true;
          if ((item.name || '').toLowerCase().includes(targetVar)) return true;
        }
        return String(item).toLowerCase().includes(targetVar);
      });
      if (!hasVariant && (order.product_name || '').toLowerCase().includes(targetVar)) {
        hasVariant = true;
      }
      if (!hasVariant) return false;
    }

    // Zone / Location Filter
    if (zoneFilter !== 'All') {
      const zoneStr = String(order.shipping_zone || '').trim().toLowerCase();
      const addrStr = String(order.address || '').trim().toLowerCase();
      const deliveryCharge = Number(order.delivery_charge || order.pricing_summary?.delivery_charge || 0);

      const isInside = 
        zoneStr.includes('inside') || 
        zoneStr === 'dhaka' || 
        (addrStr.includes('dhaka') && !addrStr.includes('outside dhaka') && !addrStr.includes('outside')) ||
        (deliveryCharge > 0 && deliveryCharge <= 80 && !zoneStr.includes('outside') && !addrStr.includes('outside'));

      const isOutside = 
        zoneStr.includes('outside') || 
        (addrStr && !addrStr.includes('dhaka')) || 
        addrStr.includes('outside dhaka') || 
        deliveryCharge > 80;

      if (zoneFilter === 'Inside Dhaka' && (!isInside || zoneStr.includes('outside'))) return false;
      if (zoneFilter === 'Outside Dhaka' && !isOutside) return false;
    }

    return matchesActiveDateFilter(order.created_at);
  };

  const confirmedOrders = orders.filter(
    (order) => order.status === 'Confirmed' && matchesPanelFilters(order)
  );

  const queuedOrders = orders.filter(
    (order) => order.status === 'Factory Queue' && matchesPanelFilters(order)
  );

  const rawDisplayOrders = activeTab === 'confirmed' ? confirmedOrders : queuedOrders;

  const displayOrders = useMemo(() => {
    const list = [...rawDisplayOrders];
    return list.sort((a, b) => {
      if (sortOrder === 'newest') {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (sortOrder === 'oldest') {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }
      if (sortOrder === 'amount-high') {
        const amtA = Number(a.total_amount || a.amount || a.total || 0);
        const amtB = Number(b.total_amount || b.amount || b.total || 0);
        return amtB - amtA;
      }
      if (sortOrder === 'amount-low') {
        const amtA = Number(a.total_amount || a.amount || a.total || 0);
        const amtB = Number(b.total_amount || b.amount || b.total || 0);
        return amtA - amtB;
      }
      if (sortOrder === 'name-asc') {
        return (a.customer_name || '').localeCompare(b.customer_name || '');
      }
      return 0;
    });
  }, [rawDisplayOrders, sortOrder]);

  const { isOrderUnread, markOrderRead, unreadCount } = useRouteOrderReadState(`confirmed-panel:${activeTab}`, displayOrders);
  const latestExportHistory = exportHistory[0] || null;
  const latestConfirmedExportHistory = exportHistory.find((item) => item.tab === 'confirmed') || null;
  const exportRangeStartDate = useMemo(() => parseDateTimeRangeBoundary(exportDateFrom, 'start'), [exportDateFrom]);
  const exportRangeEndDate = useMemo(() => parseDateTimeRangeBoundary(exportDateTo, 'end'), [exportDateTo]);
  const exportHasCustomRange = exportDatePreset !== 'sinceLast' && Boolean(exportDateFrom || exportDateTo);
  const totalPages = Math.max(1, Math.ceil(displayOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return displayOrders.slice(startIndex, startIndex + pageSize);
  }, [displayOrders, currentPage, pageSize]);
  const visiblePages = useMemo(() => getVisiblePageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, datePreset, dateFrom, dateTo, sourceFilter, sortOrder, pageSize]);

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

  const handleSingleSendToCourier = async (e, orderId) => {
    e.stopPropagation();
    setRowLoading((prev) => ({ ...prev, [orderId]: true }));
    try {
      await dispatchToCourier(orderId);
      setDistributeResult({
        distributed: 1,
        queued: 0,
        total: 1,
        sourceStatus: `Order #${orderId.replace('ORD-', '')} successfully sent to Steadfast Courier!`
      });
      setTimeout(() => setDistributeResult(null), 6000);
    } catch (err) {
      console.error('Courier dispatch error:', err);
      alert(`Courier dispatch failed for order #${orderId.replace('ORD-', '')}: ${err.message}`);
    } finally {
      setRowLoading((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const handleSingleSendToPathao = async (e, orderId) => {
    e.stopPropagation();
    const loadingKey = `pathao-${orderId}`;
    setRowLoading((prev) => ({ ...prev, [loadingKey]: true }));
    try {
      const trackingCode = window.prompt(`Enter Pathao Tracking/Consignment ID for Order #${String(orderId).replace('ORD-', '')} (Optional):`, '');
      if (trackingCode === null) return;

      const cleanTracking = trackingCode ? trackingCode.trim() : null;

      const { error } = await supabase
        .from('orders')
        .update({
          dispatched_at: new Date().toISOString(),
          courier_name: 'Pathao',
          tracking_id: cleanTracking,
          status: 'Courier Submitted',
          courier_status: 'pending'
        })
        .eq('id', orderId);

      if (error) throw error;

      if (updateOrderStatus) {
        await updateOrderStatus(orderId, 'Courier Submitted', {
          courier_name: 'Pathao',
          tracking_id: cleanTracking
        });
      }

      setDistributeResult({
        distributed: 1,
        queued: 0,
        total: 1,
        sourceStatus: `Order #${orderId.replace('ORD-', '')} successfully sent to Pathao Courier!`
      });
      setTimeout(() => setDistributeResult(null), 6000);
    } catch (err) {
      console.error('Pathao dispatch error:', err);
      alert(`Pathao dispatch failed for order #${orderId.replace('ORD-', '')}: ${err.message}`);
    } finally {
      setRowLoading((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const handleBulkSendToCourier = async () => {
    if (selectedConfirmedOrders.length === 0) return;

    const confirmed = window.confirm(`Dispatch ${selectedConfirmedOrders.length} selected confirmed order(s) directly to Steadfast Courier?`);
    if (!confirmed) return;

    setIsDispatchingSelected(true);
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const order of selectedConfirmedOrders) {
      try {
        await dispatchToCourier(order.id);
        successCount++;
      } catch (err) {
        failCount++;
        errors.push(`#${order.id.replace('ORD-', '')}: ${err.message}`);
      }
    }

    setSelectedConfirmedIds([]);
    setIsDispatchingSelected(false);

    setDistributeResult({
      distributed: successCount,
      queued: failCount,
      total: selectedConfirmedOrders.length,
      sourceStatus: `Bulk Courier Dispatch: ${successCount} sent successfully${failCount > 0 ? `, ${failCount} failed` : ''}.`
    });
    setTimeout(() => setDistributeResult(null), 8000);

    if (failCount > 0) {
      alert(`Dispatched ${successCount} order(s) to Courier.\nFailed (${failCount}):\n${errors.slice(0, 10).join('\n')}`);
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
            placeholder="Search by ID, name, phone, address or product..."
            suggestions={
              searchTerm ? orders.filter(o => 
                (o.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (o.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (o.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (o.phone || '').includes(searchTerm)
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

          <div className="factory-filter-toolbar">
            <div className="factory-date-preset-bar">
              <div className="factory-date-preset-label">
                <CalendarDays size={15} />
                <span>Date Filter</span>
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

            <div className="factory-select-filter-group">
              {/* Product Filter */}
              <div className="factory-filter-select-wrapper">
                <Tag size={14} className="factory-select-icon" />
                <select
                  className="factory-filter-select"
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  aria-label="Filter by product"
                >
                  <option value="All">All Products</option>
                  {uniqueProducts.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Color Filter */}
              <div className="factory-filter-select-wrapper">
                <Palette size={14} className="factory-select-icon" />
                <select
                  className="factory-filter-select"
                  value={colorFilter}
                  onChange={(e) => setColorFilter(e.target.value)}
                  aria-label="Filter by color"
                >
                  <option value="All">All Colors</option>
                  {uniqueColors.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Variant Filter */}
              <div className="factory-filter-select-wrapper">
                <Layers size={14} className="factory-select-icon" />
                <select
                  className="factory-filter-select"
                  value={variantFilter}
                  onChange={(e) => setVariantFilter(e.target.value)}
                  aria-label="Filter by variant"
                >
                  <option value="All">All Variants</option>
                  {uniqueVariants.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Location / Zone Filter */}
              <div className="factory-filter-select-wrapper">
                <MapPin size={14} className="factory-select-icon" />
                <select
                  className="factory-filter-select"
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  aria-label="Filter by location zone"
                >
                  <option value="All">All Locations</option>
                  <option value="Inside Dhaka">Inside Dhaka</option>
                  <option value="Outside Dhaka">Outside Dhaka</option>
                </select>
              </div>

              {/* Source Filter */}
              <div className="factory-filter-select-wrapper">
                <Globe size={14} className="factory-select-icon" />
                <select
                  className="factory-filter-select"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  aria-label="Filter by order source"
                >
                  {SOURCES.map((src) => (
                    <option key={src} value={src}>{src === 'All' ? 'All Sources' : src}</option>
                  ))}
                </select>
              </div>

              {/* Sort Order */}
              <div className="factory-filter-select-wrapper">
                <ArrowUpDown size={14} className="factory-select-icon" />
                <select
                  className="factory-filter-select"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  aria-label="Sort orders"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {(productFilter !== 'All' || colorFilter !== 'All' || variantFilter !== 'All' || sourceFilter !== 'All' || zoneFilter !== 'All') && (
                <button
                  type="button"
                  className="factory-range-clear-btn"
                  onClick={() => {
                    setProductFilter('All');
                    setColorFilter('All');
                    setVariantFilter('All');
                    setSourceFilter('All');
                    setZoneFilter('All');
                  }}
                  title="Clear location, product & variant filters"
                >
                  Clear Filters
                </button>
              )}
            </div>
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
                disabled={isMovingSelectedConfirmed || isDispatchingSelected}
              >
                Clear
              </button>
              <Button
                variant="outline"
                onClick={handleMoveSelectedToBulkExported}
                disabled={isMovingSelectedConfirmed || isDispatchingSelected || selectedConfirmedOrders.length === 0}
              >
                {isMovingSelectedConfirmed ? <Loader2 size={16} className="spin" /> : <Package size={16} />}
                <span>{isMovingSelectedConfirmed ? 'Moving...' : 'Move to Bulk Exported'}</span>
              </Button>
              <Button
                variant="primary"
                onClick={handleBulkSendToCourier}
                disabled={isMovingSelectedConfirmed || isDispatchingSelected || selectedConfirmedOrders.length === 0}
              >
                {isDispatchingSelected ? <Loader2 size={16} className="spin" /> : <Truck size={16} />}
                <span>{isDispatchingSelected ? 'Dispatching...' : 'Send to Courier'}</span>
              </Button>
            </div>
          )}
        </div>
        
      <Card className="table-card liquid-glass" noPadding>
        <div className="orders-table-wrapper desktop-only">
          <table className="management-table premium-table">
            <thead>
              <tr>
                {activeTab === 'confirmed' && (
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      className="premium-checkbox"
                      checked={isCurrentPageSelected}
                      onChange={handleSelectConfirmedPage}
                      disabled={paginatedConfirmedIds.length === 0 || isMovingSelectedConfirmed || isDispatchingSelected}
                      aria-label="Select visible confirmed orders"
                    />
                  </th>
                )}
                <th className="id-col">Caller</th>
                <th className="date-col">Timestamp</th>
                <th className="customer-col">Customer</th>
                <th className="product-col">Product</th>
                <th className="amount-col">Total</th>
                <th className="shipping-col">Delivery</th>
                <th className="items-col">Stock / Items</th>
                <th className="status-col">Fulfilment</th>
                <th className="actions-col">Action</th>
              </tr>
            </thead>
            <tbody className="orders-table-body">
              <AnimatePresence mode="popLayout">
                {paginatedOrders.map(order => {
                  const stock = getStockStatus(order);
                  const { cleanName, totalQty } = getCleanProductDisplay(order);
                  const isToyBox = (cleanName || order.product_name || '').toUpperCase().includes('TOY BOX');
                  const orderTotal = Number(order.total_amount || order.amount || order.total || 0);
                  const rawPhone = String(order.phone || '').trim();
                  const normalizedPhone = rawPhone.replace(/\D/g, '');
                  const whatsappPhone = normalizedPhone.startsWith('880')
                    ? normalizedPhone
                    : normalizedPhone.startsWith('0')
                      ? `88${normalizedPhone}`
                      : normalizedPhone;
                  const whatsappLink = whatsappPhone ? `https://wa.me/${whatsappPhone}` : null;
                  const orderTimestamp = order.created_at
                    ? new Date(order.created_at).toLocaleString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })
                    : 'N/A';

                  return (
                    <motion.tr 
                      key={order.id} 
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className={`order-row clickable-row ${selectedConfirmedIds.includes(order.id) ? 'row-selected' : ''} ${isOrderUnread(order) ? 'route-unread-row' : 'route-read-row'}`}
                      onClick={() => handleRowClick(order)}
                    >
                      {activeTab === 'confirmed' && (
                        <td className="checkbox-cell" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="premium-checkbox"
                            checked={selectedConfirmedIds.includes(order.id)}
                            onChange={() => handleSelectConfirmedOrder(order.id)}
                            disabled={isMovingSelectedConfirmed || isDispatchingSelected || order.status !== 'Confirmed'}
                            aria-label={`Select order ${order.id}`}
                          />
                        </td>
                      )}
                      
                      <td className="id-cell">
                        <div className="route-read-id-wrap">
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
                      </td>

                      <td className="date-cell">
                        <span className="saas-text timestamp-text">{orderTimestamp}</span>
                      </td>

                      <td className="customer-cell">
                        <div className="customer-cell-stack">
                          <span className="saas-text-dark">{order.customer_name}</span>
                          <div className="customer-quick-row">
                            <span className="customer-phone-text">{rawPhone || 'No phone'}</span>
                            <div className="customer-quick-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className={`customer-quick-btn ${copiedPhoneId === order.id ? 'copied' : ''}`}
                                title={copiedPhoneId === order.id ? 'Copied' : 'Copy phone'}
                                onClick={(e) => handleCopyPhone(e, rawPhone, order.id)}
                                disabled={!rawPhone}
                              >
                                <Copy size={12} />
                              </button>
                              <a
                                href={rawPhone ? `tel:${rawPhone}` : undefined}
                                className="customer-quick-btn"
                                title="Call customer"
                                onClick={(e) => e.stopPropagation()}
                                aria-disabled={!rawPhone}
                              >
                                <Phone size={12} />
                              </a>
                              <a
                                href={whatsappLink || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="customer-quick-btn whatsapp"
                                title="Open WhatsApp"
                                onClick={(e) => e.stopPropagation()}
                                aria-disabled={!whatsappLink}
                              >
                                <MessageCircle size={12} />
                              </a>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="product-cell">
                        <div className="product-info-wrapper">
                          <span className="saas-text-dark product-name-cell" title={cleanName}>
                            {cleanName}
                          </span>
                          <div className="product-sub-meta">
                            <span className="product-qty-badge">Qty: {totalQty}</span>
                            <SourceBadge traffic_source={order.traffic_source} source={order.source} />
                          </div>
                        </div>
                      </td>

                      <td className="amount-cell">
                        <span className="saas-text-dark">
                          <CurrencyIcon size={12} className="currency-icon-elite" style={{ marginRight: '2px' }} />
                          {Number(orderTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </td>

                      <td className="shipping-cell">
                        <span className="saas-text">{order.shipping_zone || order.delivery_zone || 'N/A'}</span>
                      </td>

                      <td className="items-cell">
                        <div className="factory-stock-block">
                          <Badge variant={stock.matched ? 'success' : 'warning'} className="factory-stock-pill">
                            {stock.matched ? 'Full Stock' : `${stock.missing.length} Missing`}
                          </Badge>
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

                      <td className="status-cell" onClick={(e) => e.stopPropagation()}>
                        <span className={`saas-badge saas-badge-${getStatusBadgeVariant(order.status)}`}>
                          <span className="dot"></span>
                          {order.status}
                        </span>
                      </td>

                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <div className="saas-actions">
                          {order.status === 'Confirmed' && (
                            <div className="courier-dropdown-wrapper">
                              <button
                                type="button"
                                className="factory-action-btn courier-main-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCourierDropdownId(activeCourierDropdownId === order.id ? null : order.id);
                                }}
                                disabled={rowLoading[order.id] || rowLoading[`pathao-${order.id}`] || isDispatchingSelected || isMovingSelectedConfirmed}
                                title="Dispatch order via Courier"
                              >
                                {rowLoading[order.id] || rowLoading[`pathao-${order.id}`] ? (
                                  <Loader2 size={13} className="spin" />
                                ) : (
                                  <Truck size={13} />
                                )}
                                <span>Dispatch</span>
                                <ChevronDown size={12} />
                              </button>

                              {activeCourierDropdownId === order.id && (
                                <div className="courier-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className="courier-menu-item sfast"
                                    onClick={(e) => {
                                      setActiveCourierDropdownId(null);
                                      handleSingleSendToCourier(e, order.id);
                                    }}
                                  >
                                    <Truck size={14} className="menu-icon" />
                                    <div className="menu-text">
                                      <strong>Steadfast (S-Fast)</strong>
                                      <span>Direct API Dispatch</span>
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    className="courier-menu-item pathao"
                                    onClick={(e) => {
                                      setActiveCourierDropdownId(null);
                                      handleSingleSendToPathao(e, order.id);
                                    }}
                                  >
                                    <Package size={14} className="menu-icon" />
                                    <div className="menu-text">
                                      <strong>Pathao Courier</strong>
                                      <span>Tracking ID Entry</span>
                                    </div>
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          <button className="saas-icon-btn" title="Edit Order" onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }}>
                            <Edit2 size={15} strokeWidth={1.5} />
                          </button>
                          <button className="saas-icon-btn" title="View Details" onClick={(e) => { e.stopPropagation(); handleRowClick(order); }}>
                            <FileText size={15} strokeWidth={1.5} />
                          </button>
                          {order.status === 'Factory Queue' && (
                            <button className="factory-action-btn retry" onClick={(e) => { e.stopPropagation(); handleRetryDistribute(order.id); }} title="Recheck Inventory">
                              <Zap size={14} /> <span>Recheck</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {displayOrders.length === 0 && (
                <tr>
                  <td colSpan={activeTab === 'confirmed' ? 10 : 9} className="empty-state-cell">
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

        {/* Mobile View Card List */}
        <div className="orders-mobile-list mobile-only">
          {paginatedOrders.map(order => {
            const stock = getStockStatus(order);
            const { cleanName, totalQty } = getCleanProductDisplay(order);
            const orderTotal = Number(order.total_amount || order.amount || order.total || 0);
            const rawPhone = String(order.phone || '').trim();

            return (
              <div
                key={order.id}
                className={`order-mobile-card elite-card ${isOrderUnread(order) ? 'route-unread-card' : ''}`}
                onClick={() => handleRowClick(order)}
              >
                <div className="card-header-elite">
                  <div className="id-group">
                    <div className="route-read-card-header">
                      {isOrderUnread(order) && <span className="route-unread-dot" aria-label="Unread order" />}
                      <span className="saas-id">#{(order.id || '').replace('ORD-', '')}</span>
                    </div>
                  </div>
                  <span className={`saas-badge saas-badge-${getStatusBadgeVariant(order.status)}`}>
                    <span className="dot"></span>
                    {order.status}
                  </span>
                </div>
                <div className="card-body-elite">
                  <div className="info-row">
                    <span className="label">Customer:</span>
                    <span className="value">{order.customer_name} ({rawPhone})</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Product:</span>
                    <span className="value product-mobile-value">
                      {cleanName} <span className="product-qty-badge-mobile">Qty: {totalQty}</span>
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="label">Total Amount:</span>
                    <span className="value price">৳{orderTotal.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="label">Stock:</span>
                    <span className="value">{stock.matched ? 'Full Stock' : `${stock.missing.length} Missing`}</span>
                  </div>
                </div>
                <div className="card-actions-elite" onClick={(e) => e.stopPropagation()}>
                  {order.status === 'Confirmed' && (
                    <div className="courier-dropdown-wrapper">
                      <button
                        type="button"
                        className="factory-action-btn courier-main-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveCourierDropdownId(activeCourierDropdownId === order.id ? null : order.id);
                        }}
                        disabled={rowLoading[order.id] || rowLoading[`pathao-${order.id}`] || isDispatchingSelected || isMovingSelectedConfirmed}
                      >
                        {rowLoading[order.id] || rowLoading[`pathao-${order.id}`] ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <Truck size={14} />
                        )}
                        <span>Dispatch</span>
                        <ChevronDown size={12} />
                      </button>

                      {activeCourierDropdownId === order.id && (
                        <div className="courier-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="courier-menu-item sfast"
                            onClick={(e) => {
                              setActiveCourierDropdownId(null);
                              handleSingleSendToCourier(e, order.id);
                            }}
                          >
                            <Truck size={14} className="menu-icon" />
                            <div className="menu-text">
                              <strong>Steadfast (S-Fast)</strong>
                              <span>Direct API Dispatch</span>
                            </div>
                          </button>

                          <button
                            type="button"
                            className="courier-menu-item pathao"
                            onClick={(e) => {
                              setActiveCourierDropdownId(null);
                              handleSingleSendToPathao(e, order.id);
                            }}
                          >
                            <Package size={14} className="menu-icon" />
                            <div className="menu-text">
                              <strong>Pathao Courier</strong>
                              <span>Tracking ID Entry</span>
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button className="saas-icon-btn" onClick={(e) => { e.stopPropagation(); handleOpenEditModal(order); }}>
                    <Edit2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

        {displayOrders.length > 0 && (
          <div className="factory-pagination-footer">
            <div className="factory-pagination-info">
              Showing {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, displayOrders.length)} of {displayOrders.length} records
            </div>
            <div className="factory-pagination-actions">
              <div className="factory-page-size-selector">
                <span className="factory-page-size-label">Per page:</span>
                <select
                  className="factory-page-size-select"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

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
        allOrders={orders}
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
