'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import { Suspense } from 'react';
import { RoleGate } from '@/components/RoleGate';
import { CardSkeleton } from '@/components/skeletons/CardSkeleton';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/services/api/client';
import { normalizeSource } from '@/components/SourceBadge';
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, ShoppingCart, CheckCircle2, XCircle, DollarSign, Clock,
  FileDown, Printer, BarChart3, Package, Trophy,
  Settings, X, ChevronDown, MoreHorizontal, Calendar, SlidersHorizontal, Search
} from 'lucide-react';

// ── Constants & Status Definitions ────────────────────────────────
const CONFIRMED_STATUSES = [
  'Confirmed',
  'Confirmed & Printed',
  'Bulk Exported',
  'Courier Ready',
  'Courier Submitted',
  'Factory Processing',
  'Processing',
  'Shipped',
  'Completed',
  'Delivered'
];

const PENDING_STATUSES = [
  'New',
  'Pending Call',
  'Final Call Pending',
  'Hold',
  'Incomplete'
];

const CANCELLED_STATUSES = [
  'Cancelled',
  'Fake Order'
];

const isConfirmedStatus = (status: any) => {
  const s = String(status || '').trim().toLowerCase();
  return CONFIRMED_STATUSES.some(c => c.toLowerCase() === s);
};

const isPendingStatus = (status: any) => {
  const s = String(status || '').trim().toLowerCase();
  return PENDING_STATUSES.some(c => c.toLowerCase() === s);
};

const isCancelledStatus = (status: any) => {
  const s = String(status || '').trim().toLowerCase();
  return CANCELLED_STATUSES.some(c => c.toLowerCase() === s);
};

const STATUS_COLORS: Record<string, string> = {
  'Confirmed': '#10b981', 
  'Confirmed & Printed': '#10b981',
  'Bulk Exported': '#10b981', 
  'Courier Ready': '#10b981', 
  'Courier Submitted': '#06b6d4',
  'Factory Processing': '#eab308',
  'Processing': '#06b6d4', 
  'Shipped': '#3b82f6', 
  'Completed': '#059669',
  'Delivered': '#059669',
  'Cancelled': '#ef4444', 
  'Fake Order': '#f59e0b',
  'New': '#6366f1', 
  'Pending Call': '#3b82f6',
  'Final Call Pending': '#8b5cf6', 
  'Hold': '#94a3b8',
  'Incomplete': '#ec4899',
};
const PIE_COLORS = ['#10b981','#6366f1','#ef4444','#f59e0b','#3b82f6','#8b5cf6','#94a3b8','#14b8a6'];

// ── Date Helpers & Formatters ─────────────────────────────────────
const midnight = (d: any) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d: any) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const today    = () => midnight(new Date());
const fmtNum   = (n: any) => Number(n||0).toLocaleString();
const fmtTk    = (n: any) => '৳' + fmtNum(n);

const PRESETS = [
  { key:'today',      label:'Today' },
  { key:'yesterday',  label:'Yesterday' },
  { key:'week',       label:'This Week' },
  { key:'lastweek',   label:'Last Week' },
  { key:'month',      label:'This Month' },
  { key:'lastmonth',  label:'Last Month' },
  { key:'custom',     label:'Custom' },
];

const getPresetRange = (key: string) => {
  const now = new Date();
  switch (key) {
    case 'today':     return { start: today(), end: endOfDay(now) };
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate()-1); return { start: midnight(y), end: endOfDay(y) }; }
    case 'week':      { const s = new Date(now); s.setDate(now.getDate()-now.getDay()+1); return { start: midnight(s), end: endOfDay(now) }; }
    case 'lastweek':  { const s = new Date(now); s.setDate(now.getDate()-now.getDay()-6); const e = new Date(s); e.setDate(s.getDate()+6); return { start: midnight(s), end: endOfDay(e) }; }
    case 'month':     return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: endOfDay(now) };
    case 'lastmonth': { const s = new Date(now.getFullYear(), now.getMonth()-1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return { start: s, end: endOfDay(e) }; }
    default:          return { start: today(), end: endOfDay(now) };
  }
};

// ── CSV Export ────────────────────────────────────────────────────
const exportCSV = (orders: any[], label: string) => {
  const headers = ['Order ID','Date','Customer','Phone','Product','Qty','Amount','Status','Source','Traffic Channel'];
  const rows = orders.map(o => {
    const norm = normalizeSource(o.traffic_source, o.source);
    return [
      o.id,
      new Date(o.created_at).toLocaleDateString('en-GB'),
      `"${(o.customer_name || '').replace(/"/g, '""')}"`,
      `"${(o.phone || '').replace(/"/g, '""')}"`,
      `"${(o.product_name || '').replace(/"/g, '""')}"`,
      o.quantity || 1,
      o.amount || 0,
      o.status || '',
      `"${(o.source || '').replace(/"/g, '""')}"`,
      norm.label
    ].join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sales_report_${label}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
};

// ── Sub-components ────────────────────────────────────────────────
const SummaryKpiCard = ({
  icon: Icon,
  label,
  value,
  sub,
  color
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) => (
  <div className="sr-summary-kpi" style={{ '--kc': color } as React.CSSProperties}>
    <div className="sr-summary-kpi-icon"><Icon size={20} /></div>
    <div className="sr-summary-kpi-body">
      <span className="sr-summary-kpi-label">{label}</span>
      <h3 className="sr-summary-kpi-val">{value}</h3>
      {sub && <span className="sr-summary-kpi-sub">{sub}</span>}
    </div>
  </div>
);

const SectionTitle = ({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) => (
  <div className="sr-section-title">
    <div className="sr-section-icon"><Icon size={16}/></div>
    <div>
      <h3>{title}</h3>
      {sub && <p>{sub}</p>}
    </div>
  </div>
);

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="sr-tooltip">
      <p className="sr-tt-label">{label}</p>
      {payload.map((p,i) => (
        <div key={i} className="sr-tt-row">
          <span className="sr-tt-dot" style={{ background: p.color||p.fill }} />
          <span>{p.name}:</span>
          <strong>{typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue') ? fmtTk(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

const extractColor = (itemName: any, orderItem?: any) => {
  if (orderItem?.color) return orderItem.color.trim();
  
  const commonColors = [
    'black', 'blue', 'beige', 'olive', 'pink', 'white', 'golden', 'gold', 
    'silver', 'grey', 'gray', 'red', 'green', 'yellow', 'purple', 'orange', 'brown',
    'chocolate', 'navy', 'maroon', 'teal'
  ];
  
  const nameLower = String(itemName || '').toLowerCase();
  for (const c of commonColors) {
    if (nameLower.includes(c)) {
      return c.charAt(0).toUpperCase() + c.slice(1);
    }
  }
  return null;
};

const getBaseProductName = (rawName: any) => {
  if (!rawName) return 'Unknown Product';
  let name = String(rawName).trim();

  // 1. Remove bracketed specs like [Black x2, White x1], [Olive x1]
  name = name.replace(/\[[^\]]+\]/g, '');

  // 2. Remove parenthesized specs like (Color: Black)
  name = name.replace(/\([^)]+\)/g, '');

  // 3. Remove "x\d+" or "x \d+" (multipliers) e.g., "Sunglass x2" -> "Sunglass"
  name = name.replace(/\s+x\d+\b/gi, '');

  // 4. Remove common color suffixes and descriptors
  const wordsToRemove = [
    'black', 'blue', 'beige', 'standard', 'olive', 'pink', 'white', 'golden', 'gold', 
    'silver', 'grey', 'gray', 'red', 'green', 'yellow', 'purple', 'orange', 'brown', 
    'chocolate', 'navy', 'maroon', 'teal', 'combo', '1 pcs', '2 pcs', '3 pcs', '1pcs', '2pcs', '3pcs'
  ];

  const parts = name.split(/\s*[-–—,]\s*/);
  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1].toLowerCase().trim();
    const isColorOrDescriptor = wordsToRemove.some(word => lastPart.includes(word)) || lastPart.match(/^\d+\s*pcs?$/i);
    if (isColorOrDescriptor) {
      parts.pop();
      name = parts.join(' - ');
    }
  }

  name = name.replace(/\s*[-–—,]\s*$/, '').trim();

  const lower = name.toLowerCase();
  if (lower.includes('magnetic gym') || lower.includes('magentic gym')) {
    return 'Magnetic Gym Crossbody Bag';
  }
  if (lower.includes('smart travel') || lower.includes('canvas travel')) {
    return 'Smart Travel Bag';
  }
  if (lower.includes('polarized sunglass') || lower.includes('sunglass')) {
    return 'Adjustable Dimming Polarized Sunglass';
  }
  if (lower.includes('canvas family')) {
    return 'Canvas Family Bag';
  }
  if (lower.includes('yoga') || lower.includes('stretch') || lower.includes('strech') || lower.includes('leg strech') || lower.includes('leg stretch')) {
    return 'Professional Yoga Stretch Band';
  }
  if (lower.includes('money management') || lower.includes('mmb')) {
    return 'Smart Money Management Bag';
  }
  if (lower.includes('healthy healing tea')) {
    return 'Healthy Healing Tea';
  }
  if (lower.includes('ac sticker')) {
    return 'Transparent AC Sticker';
  }

  return name.split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

// ── Main Sales Report Component ───────────────────────────────────
const SalesReportInner = () => {
  useAuth();

  const [preset, setPreset]       = useState('month');
  const [dateRange, setDateRange] = useState(getPresetRange('month'));
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'area'
  const [productSort, setProductSort] = useState('confirmedSales'); // default sort by Confirmed Sales
  const [sortDirection, setSortDirection] = useState('desc');
  const [colorFilter, setColorFilter] = useState('All');
  const [reportOrders, setReportOrders] = useState<any[]>([]);
  const [fetching, setFetching]   = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(25);
  const [productSearch, setProductSearch] = useState('');

  // Modals and Sheets
  const [isDateSheetOpen, setIsDateSheetOpen]   = useState(false);
  const [isColorSheetOpen, setIsColorSheetOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [pricingSearchQuery, setPricingSearchQuery] = useState('');

  // 1. Unit Cost State (Internal Cost per Unit)
  const [productUnitCosts, setProductUnitCosts] = useState<Record<string, number>>(() => {
    try {
      const cached = localStorage.getItem('sr_product_unit_costs');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  // 2. Selling Price State (Default Reference Selling Price per Unit)
  const [productSellingPrices, setProductSellingPrices] = useState<Record<string, number>>(() => {
    try {
      const cached = localStorage.getItem('sr_product_selling_prices');
      return cached ? JSON.parse(cached) : {};
    } catch {
      return {};
    }
  });

  // Sync default Unit Costs & Selling Prices from inventory table on mount
  useEffect(() => {
    const fetchInventoryPricing = async () => {
      try {
        const { data } = await supabase.from('inventory').select('name, making_cost, unit_price');
        if (data && data.length > 0) {
          setProductUnitCosts(prev => {
            const next = { ...prev };
            let updated = false;
            data.forEach(item => {
              const baseName = getBaseProductName(item.name);
              const cost = Number(item.making_cost) || 0;
              if (cost > 0 && (next[baseName] === undefined || next[baseName] === 0)) {
                next[baseName] = cost;
                updated = true;
              }
            });
            if (updated) localStorage.setItem('sr_product_unit_costs', JSON.stringify(next));
            return next;
          });

          setProductSellingPrices(prev => {
            const next = { ...prev };
            let updated = false;
            data.forEach(item => {
              const baseName = getBaseProductName(item.name);
              const price = Number(item.unit_price) || 0;
              if (price > 0 && (next[baseName] === undefined || next[baseName] === 0)) {
                next[baseName] = price;
                updated = true;
              }
            });
            if (updated) localStorage.setItem('sr_product_selling_prices', JSON.stringify(next));
            return next;
          });
        }
      } catch (err: any) {
        console.error('Error fetching inventory pricing:', err);
      }
    };
    fetchInventoryPricing();
  }, []);

  // Update Unit Cost independently
  const handleUnitCostChange = async (productName: string, val: any) => {
    const cost = Math.max(0, parseFloat(val) || 0);
    const next = { ...productUnitCosts, [productName]: cost };
    setProductUnitCosts(next);
    localStorage.setItem('sr_product_unit_costs', JSON.stringify(next));

    try {
      const { data: invItems } = await supabase.from('inventory').select('id, name');
      if (invItems) {
        const normName = productName.toLowerCase().replace(/\s+/g, '');
        const match = invItems.find(i => i.name.toLowerCase().replace(/\s+/g, '') === normName || i.name.toLowerCase().includes(productName.toLowerCase()));
        if (match) {
          await supabase.from('inventory').update({ making_cost: cost }).eq('id', match.id);
        }
      }
    } catch (e: any) {
      console.error('Error syncing unit cost to inventory:', e);
    }
  };

  // Update Selling Price independently
  const handleSellingPriceChange = async (productName: string, val: any) => {
    const price = Math.max(0, parseFloat(val) || 0);
    const next = { ...productSellingPrices, [productName]: price };
    setProductSellingPrices(next);
    localStorage.setItem('sr_product_selling_prices', JSON.stringify(next));

    try {
      const { data: invItems } = await supabase.from('inventory').select('id, name');
      if (invItems) {
        const normName = productName.toLowerCase().replace(/\s+/g, '');
        const match = invItems.find(i => i.name.toLowerCase().replace(/\s+/g, '') === normName || i.name.toLowerCase().includes(productName.toLowerCase()));
        if (match) {
          await supabase.from('inventory').update({ unit_price: price }).eq('id', match.id);
        }
      }
    } catch (e: any) {
      console.error('Error syncing selling price to inventory:', e);
    }
  };

  // Fetch all orders in date range directly from Supabase with chunked pagination
  useEffect(() => {
    let active = true;
    const loadReportOrders = async () => {
      setFetching(true);
      try {
        let allData: any[] = [];
        let from = 0;
        const limit = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('orders')
            .select('id, created_at, customer_name, phone, product_name, quantity, amount, status, source, traffic_source, notes, ordered_items, order_lines_payload')
            .gte('created_at', dateRange.start.toISOString())
            .lte('created_at', dateRange.end.toISOString())
            .order('created_at', { ascending: false })
            .range(from, from + limit - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allData = [...allData, ...data];
            if (data.length < limit) {
              hasMore = false;
            } else {
              from += limit;
            }
          } else {
            hasMore = false;
          }
        }

        if (active) {
          setReportOrders(allData);
        }
      } catch (err: any) {
        console.error('Error loading report orders:', err);
      } finally {
        if (active) {
          setFetching(false);
        }
      }
    };

    loadReportOrders();
    return () => {
      active = false;
    };
  }, [dateRange]);

  const applyPreset = useCallback((key: string) => {
    setPreset(key);
    if (key !== 'custom') setDateRange(getPresetRange(key));
  }, []);

  // ── Filtered orders (exclude Test) ──
  const filtered = useMemo(() => {
    if (!reportOrders?.length) return [];
    return reportOrders.filter(o => o.status !== 'Test');
  }, [reportOrders]);

  /**
   * Intelligently unpacks order items and proportionally allocates
   * the exact order amount across line items with zero rounding discrepancy.
   */
  const getOrderItemsList = useCallback((o: any) => {
    const rawItems = (Array.isArray(o?.order_lines_payload) && o.order_lines_payload.length > 0)
      ? o.order_lines_payload
      : (Array.isArray(o?.ordered_items) && o.ordered_items.length > 0 ? o.ordered_items : null);

    const orderAmount = Math.max(0, Number(o?.amount) || 0);

    if (!rawItems || rawItems.length === 0) {
      const qty = Math.max(1, Number(o?.quantity) || 1);
      return [{
        name: o?.product_name || 'Standard Product',
        quantity: qty,
        unit_price: qty > 0 ? orderAmount / qty : orderAmount,
        line_total: orderAmount,
        allocated_amount: orderAmount
      }];
    }

    const parsed = rawItems.map((item: any) => {
      if (typeof item === 'object' && item !== null) {
        const name = item.name || item.product_name || item.title || item.productName || o?.product_name || 'Standard Product';
        const quantity = Math.max(1, Number(item.quantity ?? item.qty) || 1);
        const unit_price = Number(item.price ?? item.unit_price) || 0;
        const line_total = Number(item.line_total ?? (unit_price * quantity)) || 0;
        return {
          ...item,
          name,
          quantity,
          unit_price,
          line_total
        };
      }
      return {
        name: String(item) || o?.product_name || 'Standard Product',
        quantity: 1,
        unit_price: orderAmount,
        line_total: orderAmount
      };
    });

    const sumLineTotals = parsed.reduce((sum: number, item: any) => sum + (item.line_total > 0 ? item.line_total : item.unit_price * item.quantity), 0);
    const totalItemQty = parsed.reduce((sum: number, item: any) => sum + item.quantity, 0);

    let allocatedSum = 0;
    const allocatedItems = parsed.map((item: any) => {
      let allocatedAmount = 0;
      if (sumLineTotals > 0) {
        const itemVal = item.line_total > 0 ? item.line_total : item.unit_price * item.quantity;
        allocatedAmount = Math.round((itemVal / sumLineTotals) * orderAmount);
      } else if (totalItemQty > 0) {
        allocatedAmount = Math.round((item.quantity / totalItemQty) * orderAmount);
      } else {
        allocatedAmount = Math.round(orderAmount / parsed.length);
      }
      allocatedSum += allocatedAmount;
      return {
        ...item,
        allocated_amount: allocatedAmount
      };
    });

    // Reconcile residual difference on the highest value item to guarantee exact order total
    const diff = orderAmount - allocatedSum;
    if (diff !== 0 && allocatedItems.length > 0) {
      let maxIdx = 0;
      for (let i = 1; i < allocatedItems.length; i++) {
        if (allocatedItems[i].allocated_amount > allocatedItems[maxIdx].allocated_amount) {
          maxIdx = i;
        }
      }
      allocatedItems[maxIdx].allocated_amount += diff;
    }

    return allocatedItems;
  }, []);

  // ── Unique Colors List ──
  const uniqueColors = useMemo(() => {
    const colors = new Set<string>();
    filtered.forEach(o => {
      const items = getOrderItemsList(o);
      items.forEach(item => {
        const color = extractColor(item.name || o.product_name, item);
        if (color) {
          colors.add(color);
        }
      });
    });
    return ['All', ...Array.from(colors).sort()] as string[];
  }, [filtered, getOrderItemsList]);

  // ── Color Filtered Data ──
  const colorFilteredData = useMemo(() => {
    if (colorFilter === 'All') return filtered;

    return filtered.map(o => {
      const items = getOrderItemsList(o);

      const matchingItems = items.filter((item: any) => {
        const itemColor = extractColor(item.name || o.product_name, item);
        return itemColor === colorFilter;
      });

      if (matchingItems.length === 0) return null;

      const matchingAmount = matchingItems.reduce((acc: number, item: any) => acc + (Number(item.allocated_amount) || 0), 0);
      const matchingQty = matchingItems.reduce((acc: number, item: any) => acc + (Number(item.quantity) || 1), 0);

      return {
        ...o,
        ordered_items: matchingItems,
        order_lines_payload: matchingItems,
        amount: matchingAmount,
        quantity: matchingQty
      };
    }).filter(Boolean);
  }, [filtered, colorFilter, getOrderItemsList]);

  // ── 1. Product-wise Sales Summary Data ──
  // Exact mathematical alignment: Confirmed Qty & Confirmed Sales match actual confirmed transactions!
  const productData = useMemo(() => {
    const map: Record<string, any> = {};

    colorFilteredData.forEach(o => {
      const items = getOrderItemsList(o);

      const isConf = isConfirmedStatus(o.status);
      const isPend = isPendingStatus(o.status);
      const isCanc = isCancelledStatus(o.status);

      // Track products in this order to count unique orders per product
      const productsInThisOrder = new Set<string>();

      items.forEach((item: any) => {
        const baseName = getBaseProductName(item.name || o.product_name);
        productsInThisOrder.add(baseName);

        if (!map[baseName]) {
          map[baseName] = {
            name: baseName,
            orders: 0,
            confirmedOrders: 0,
            pendingOrders: 0,
            cancelledOrders: 0,
            totalQty: 0,
            confirmedQty: 0,
            pendingQty: 0,
            cancelledQty: 0,
            confirmedSales: 0,
            grossSales: 0,
          };
        }

        const q = Number(item.quantity) || 1;
        const itemAllocated = Number(item.allocated_amount) || 0;

        map[baseName].totalQty += q;
        map[baseName].grossSales += itemAllocated;

        if (isConf) {
          map[baseName].confirmedQty += q;
          map[baseName].confirmedSales += itemAllocated;
        } else if (isPend) {
          map[baseName].pendingQty += q;
        } else if (isCanc) {
          map[baseName].cancelledQty += q;
        }
      });

      // Increment unique order count and status counts per product
      productsInThisOrder.forEach((baseName: string) => {
        map[baseName].orders += 1;
        if (isConf) map[baseName].confirmedOrders += 1;
        if (isPend) map[baseName].pendingOrders += 1;
        if (isCanc) map[baseName].cancelledOrders += 1;
      });
    });

    const result = Object.values(map).map((p: any) => {
      const unitCost = Number(productUnitCosts[p.name]) || 0;
      const sellingPrice = Number(productSellingPrices[p.name]) || 0;

      // Real confirmed sales generated by this product
      const revenue = p.confirmedSales;
      const totalCost = unitCost * p.confirmedQty; // Cost of Goods Sold for confirmed units
      const grossProfit = revenue - totalCost;
      const profitMargin = revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0;

      return {
        ...p,
        unitCost,
        sellingPrice,
        revenue,
        totalCost,
        grossProfit,
        profitMargin,
        // Aliases for clean sorting & display compatibility
        confirmed: p.confirmedOrders,
        pending: p.pendingOrders,
        cancelled: p.cancelledOrders
      };
    });

    // Sort result
    return result.sort((a: any, b: any) => {
      let valA = a[productSort];
      let valB = b[productSort];

      if (productSort === 'name') {
        return sortDirection === 'asc' ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
      }
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
  }, [colorFilteredData, productSort, sortDirection, productUnitCosts, productSellingPrices, getOrderItemsList]);

  const handleSort = (field: string) => {
    if (productSort === field) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setProductSort(field);
      setSortDirection('desc');
    }
  };

  const searchedProductData = useMemo(() => {
    if (!productSearch.trim()) return productData;
    const q = productSearch.toLowerCase();
    return productData.filter((p: any) => p.name.toLowerCase().includes(q));
  }, [productData, productSearch]);

  const totalProductPages = Math.max(1, Math.ceil(searchedProductData.length / productPageSize));
  const safeProductPage = Math.min(productPage, totalProductPages);
  const paginatedProductData = useMemo(() => {
    const start = (safeProductPage - 1) * productPageSize;
    return searchedProductData.slice(start, start + productPageSize);
  }, [searchedProductData, safeProductPage, productPageSize]);

  useEffect(() => {
    setProductPage(1);
  }, [productSearch, productSort, sortDirection, colorFilter]);

  // ── 2. Top Summary KPIs (Total Orders, Confirmed, Pending, Cancelled, Confirmed Sales) ──
  const summaryKpi = useMemo(() => {
    const totalOrders = colorFilteredData.length;
    let confirmedOrders = 0;
    let pendingOrders = 0;
    let cancelledOrders = 0;
    let confirmedSalesAmount = 0;
    let grossOrderAmount = 0;

    colorFilteredData.forEach((o: any) => {
      const amt = Math.max(0, Number(o.amount) || 0);
      grossOrderAmount += amt;

      if (isConfirmedStatus(o.status)) {
        confirmedOrders++;
        confirmedSalesAmount += amt;
      } else if (isPendingStatus(o.status)) {
        pendingOrders++;
      } else if (isCancelledStatus(o.status)) {
        cancelledOrders++;
      }
    });

    const confirmedQty = productData.reduce((sum: number, p: any) => sum + (p.confirmedQty || 0), 0);
    const totalQty = productData.reduce((sum: number, p: any) => sum + (p.totalQty || 0), 0);

    return {
      totalOrders,
      confirmedOrders,
      pendingOrders,
      cancelledOrders,
      confirmedSalesAmount,
      grossOrderAmount,
      confirmedQty,
      totalQty
    };
  }, [colorFilteredData, productData]);

  // ── Daily Sales Trend Chart Data ──
  const dailyData = useMemo(() => {
    const map: Record<string, any> = {};
    colorFilteredData.forEach((o: any) => {
      const d = new Date(o.created_at);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${day}`;

      if (!map[dayKey]) {
        map[dayKey] = {
          name: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          date: dayKey,
          total: 0,
          confirmed: 0,
          pending: 0,
          cancelled: 0,
          revenue: 0
        };
      }
      map[dayKey].total++;
      const s = o.status;
      if (isConfirmedStatus(s)) {
        map[dayKey].confirmed++;
        map[dayKey].revenue += Math.max(0, Number(o.amount) || 0);
      } else if (isPendingStatus(s)) {
        map[dayKey].pending++;
      } else if (isCancelledStatus(s)) {
        map[dayKey].cancelled++;
      }
    });
    return Object.values(map).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [colorFilteredData]);

  // ── Status distribution for Pie ──
  const statusDist = useMemo(() => {
    const map: Record<string, number> = {};
    colorFilteredData.forEach((o: any) => { map[o.status] = (map[o.status]||0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a: any, b: any) => b.value - a.value);
  }, [colorFilteredData]);

  // ── Source breakdown (Normalized across TikTok, Facebook, Instagram, Website, etc.) ──
  const sourceData = useMemo(() => {
    const map: Record<string, any> = {};
    colorFilteredData.forEach((o: any) => {
      const norm = normalizeSource(o.traffic_source, o.source);
      const src = norm.label;
      if (!map[src]) map[src] = { source: src, total: 0, confirmed: 0, revenue: 0 };
      map[src].total++;
      if (isConfirmedStatus(o.status)) {
        map[src].confirmed++;
        map[src].revenue += Math.max(0, Number(o.amount) || 0);
      }
    });
    return Object.values(map).sort((a: any, b: any) => b.total - a.total);
  }, [colorFilteredData]);

  // ── Top Selling Products (by Confirmed Sales) ──
  const topSellers = useMemo(() => {
    return [...productData].sort((a: any, b: any) => b.confirmedSales - a.confirmedSales).slice(0, 8);
  }, [productData]);

  // Filtered list for Pricing & Cost Modal
  const modalFilteredProducts = useMemo(() => {
    if (!pricingSearchQuery.trim()) return productData;
    const q = pricingSearchQuery.toLowerCase();
    return productData.filter(p => p.name.toLowerCase().includes(q));
  }, [productData, pricingSearchQuery]);

  const presetLabel = PRESETS.find(p => p.key === preset)?.label || 'Custom';

  return (
    <div className={`sr-panel ${fetching ? 'fetching' : ''}`}>

      {/* ── Header ── */}
      <div className="sr-header">
        <div className="sr-header-left">
          <div className="sr-header-icon"><TrendingUp size={20}/></div>
          <div>
            <h1>Sales Report</h1>
            <p>Verified sales revenue and multi-channel order performance summary</p>
          </div>
        </div>
        <div className="sr-header-right desktop-only-actions">
          <button className="sr-btn-cost" onClick={() => setIsPricingModalOpen(true)} title="Configure Unit Costs & Selling Prices">
            <Settings size={14}/> Pricing & Cost Config
          </button>
          <button className="sr-btn-export" onClick={() => exportCSV(colorFilteredData, presetLabel)}>
            <FileDown size={14}/> Export CSV
          </button>
          <button className="sr-btn-print" onClick={() => window.print()}>
            <Printer size={14}/> Print
          </button>
        </div>

        {/* Mobile Header Actions */}
        <div className="sr-header-right mobile-only-actions">
          <button className="sr-btn-cost" onClick={() => setIsPricingModalOpen(true)}>
            <Settings size={14}/> Pricing & Costs
          </button>
          <button className="sr-btn-more-menu" onClick={() => setIsHeaderMenuOpen(true)} aria-label="More options">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* ── Mobile Compact Filter Bar (<640px) ── */}
      <div className="sr-mobile-filter-bar">
        <button className="sr-mobile-filter-pill" onClick={() => setIsDateSheetOpen(true)}>
          <Calendar size={13} />
          <span>{presetLabel}</span>
          <ChevronDown size={12} />
        </button>

        <button className="sr-mobile-filter-pill" onClick={() => setIsColorSheetOpen(true)}>
          <SlidersHorizontal size={13} />
          <span>{colorFilter === 'All' ? 'All Colors' : colorFilter}</span>
          <ChevronDown size={12} />
        </button>

        <span className="sr-mobile-order-count">
          {fetching ? '...' : `${fmtNum(colorFilteredData.length)} orders`}
        </span>
      </div>

      {/* ── Desktop Date Presets & Filters Bar (≥640px) ── */}
      <div className="sr-presets-bar desktop-only-presets">
        <div className="sr-presets">
          {PRESETS.map(p => (
            <button key={p.key} className={`sr-preset-btn ${preset===p.key ? 'active' : ''}`} onClick={() => applyPreset(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="sr-custom-dates">
            <input type="date" className="sr-date-input"
              value={dateRange.start.toISOString().split('T')[0]}
              onChange={e => { const d = new Date(e.target.value); d.setHours(0,0,0,0); setDateRange(r => ({...r, start:d})); }} />
            <span>→</span>
            <input type="date" className="sr-date-input"
              value={dateRange.end.toISOString().split('T')[0]}
              onChange={e => { const d = new Date(e.target.value); d.setHours(23,59,59,999); setDateRange(r => ({...r, end:d})); }} />
          </div>
        )}

        {/* Color Filter Dropdown */}
        <div className="sr-color-filter-wrapper">
          <span className="sr-color-label">Color:</span>
          <select 
            className="sr-date-input" 
            value={colorFilter} 
            onChange={e => setColorFilter(e.target.value)}
          >
            {uniqueColors.map(c => (
              <option key={c} value={c}>{c === 'All' ? 'All Colors' : c}</option>
            ))}
          </select>
        </div>

        <span className="sr-order-count">
          {fetching ? 'Syncing...' : `${fmtNum(colorFilteredData.length)} orders`}
        </span>
      </div>

      {/* ── 5 SUMMARY METRICS (Total Orders, Confirmed, Pending, Cancelled, Confirmed Sales) ── */}
      <div className="sr-summary-grid">
        <SummaryKpiCard
          icon={ShoppingCart}
          label="Total Orders"
          value={fmtNum(summaryKpi.totalOrders)}
          sub={`Gross: ${fmtTk(summaryKpi.grossOrderAmount)}`}
          color="#6366f1"
        />
        <SummaryKpiCard
          icon={CheckCircle2}
          label="Confirmed"
          value={fmtNum(summaryKpi.confirmedOrders)}
          sub={`${fmtNum(summaryKpi.confirmedQty)} items sold`}
          color="#10b981"
        />
        <SummaryKpiCard
          icon={Clock}
          label="Pending"
          value={fmtNum(summaryKpi.pendingOrders)}
          sub="Awaiting call / hold"
          color="#3b82f6"
        />
        <SummaryKpiCard
          icon={XCircle}
          label="Cancelled"
          value={fmtNum(summaryKpi.cancelledOrders)}
          sub="Cancelled & Fake"
          color="#ef4444"
        />
        <SummaryKpiCard
          icon={DollarSign}
          label="Confirmed Sales"
          value={fmtTk(summaryKpi.confirmedSalesAmount)}
          sub="Actual verified revenue"
          color="#059669"
        />
      </div>

      {/* ── PRODUCT SALES SUMMARY (Table & Mobile Cards) ── */}
      <div className="sr-card">
        <div className="sr-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <SectionTitle
            icon={Package}
            title="Product Sales Summary"
            sub="Realized product performance, confirmed sales revenue, and order breakdown."
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', color: 'var(--sr-text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                style={{
                  height: '32px',
                  paddingLeft: '28px',
                  paddingRight: '10px',
                  fontSize: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--sr-border)',
                  background: 'var(--sr-btn-bg)',
                  color: 'var(--sr-text)',
                  width: '160px'
                }}
              />
            </div>
            <button
              className="sr-btn-cost desktop-only-actions"
              onClick={() => setIsPricingModalOpen(true)}
              style={{ fontSize: '0.78rem', padding: '6px 12px', height: '32px' }}
            >
              <Settings size={14}/> Pricing & Cost Config
            </button>
          </div>
        </div>

        {searchedProductData.length === 0 ? (
          <div className="sr-empty-compact">No product sales data for this period.</div>
        ) : (
          <>
            {/* Mobile Product Cards (<640px) */}
            <div className="sr-product-mobile-list">
              {paginatedProductData.map((p: any, i: number) => {
                const rank = (safeProductPage - 1) * productPageSize + i + 1;
                return (
                  <div key={p.name} className="sr-prod-simple-card">
                    <div className="sr-prod-sc-head">
                      <span className="sr-prod-rank-pill">#{rank}</span>
                      <h4 className="sr-prod-sc-name">{p.name}</h4>
                    </div>

                    <div className="sr-prod-sc-rev">
                      <span className="sr-prod-sc-amount">{fmtTk(p.confirmedSales)}</span>
                      <span className="sr-prod-sc-meta">{p.confirmedQty} sold · {p.confirmedOrders} confirmed orders</span>
                    </div>

                    <div className="sr-prod-sc-prices">
                      <span>Selling Price: <strong className="text-accent">{p.sellingPrice > 0 ? fmtTk(p.sellingPrice) : 'Not Set'}</strong></span>
                      <span>Unit Cost: <strong className="text-muted">{p.unitCost > 0 ? fmtTk(p.unitCost) : 'Not Set'}</strong></span>
                    </div>

                    <div className="sr-prod-sc-counts">
                      <span className="sr-green">Confirmed: <strong>{p.confirmedOrders}</strong></span>
                      <span className="sr-pending">Pending: <strong>{p.pendingOrders}</strong></span>
                      <span className="sr-red">Cancelled: <strong>{p.cancelledOrders}</strong></span>
                    </div>

                    <div className="sr-prod-sc-cost-row">
                      <button
                        className="sr-prod-sc-edit-btn"
                        onClick={() => setIsPricingModalOpen(true)}
                        title="Edit Selling Price & Unit Cost"
                      >
                        <Settings size={12} />
                        <span>Edit Price & Cost</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Clean Table (≥640px) - With Serial # and Paginated Data */}
            <div className="sr-product-table-wrap desktop-only-table-wrap">
              <table className="sr-product-table">
                <colgroup>
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '7%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center' }}>#</th>
                    <th className="sr-sortable text-left" onClick={() => handleSort('name')}>
                      Product {productSort === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="sr-sortable text-center" onClick={() => handleSort('unitCost')}>
                      Unit Cost {productSort === 'unitCost' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="sr-sortable text-center" onClick={() => handleSort('sellingPrice')}>
                      Selling Price {productSort === 'sellingPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="sr-sortable text-center" onClick={() => handleSort('confirmedQty')} title="Confirmed items sold">
                      Sold Qty {productSort === 'confirmedQty' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="sr-sortable text-right" onClick={() => handleSort('confirmedSales')} title="Realized Confirmed Sales Revenue">
                      Confirmed Sales {productSort === 'confirmedSales' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="sr-sortable text-center" onClick={() => handleSort('orders')}>
                      Orders {productSort === 'orders' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="sr-sortable text-center" onClick={() => handleSort('confirmedOrders')}>
                      Confirmed {productSort === 'confirmedOrders' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="sr-sortable text-center" onClick={() => handleSort('pendingOrders')}>
                      Pending {productSort === 'pendingOrders' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="sr-sortable text-center" onClick={() => handleSort('cancelledOrders')}>
                      Cancelled {productSort === 'cancelledOrders' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedProductData.map((p, i) => {
                    const rank = (safeProductPage - 1) * productPageSize + i + 1;
                    const isTopThree = rank <= 3 && productSort === 'confirmedSales';
                    return (
                      <tr key={p.name} className={isTopThree ? 'sr-top-row' : ''}>
                        <td className="sr-rank-cell">
                          {rank === 1 && productSort === 'confirmedSales' ? '🥇' : rank === 2 && productSort === 'confirmedSales' ? '🥈' : rank === 3 && productSort === 'confirmedSales' ? '🥉' : `${rank}`}
                        </td>
                        <td className="sr-prod-name-cell">
                          <div className="sr-prod-name-flex">
                            <span className="sr-prod-title" title={p.name}>{p.name}</span>
                            {rank === 1 && productSort === 'confirmedSales' && <span className="sr-top-tag">Top Seller</span>}
                          </div>
                        </td>
                        <td className="text-center">
                          <span
                            className={`sr-unit-cost-badge ${p.unitCost > 0 ? 'set' : 'unset'}`}
                            onClick={() => setIsPricingModalOpen(true)}
                            title="Click to edit Unit Cost"
                          >
                            {p.unitCost > 0 ? fmtTk(p.unitCost) : 'Not Set'}
                          </span>
                        </td>
                        <td className="text-center">
                          <span
                            className={`sr-selling-price-badge ${p.sellingPrice > 0 ? 'set' : 'unset'}`}
                            onClick={() => setIsPricingModalOpen(true)}
                            title="Click to edit Selling Price"
                          >
                            {p.sellingPrice > 0 ? fmtTk(p.sellingPrice) : 'Not Set'}
                          </span>
                        </td>
                        <td className="text-center font-bold">{p.confirmedQty}</td>
                        <td className="text-right sr-green font-extrabold">{fmtTk(p.confirmedSales)}</td>
                        <td className="text-center font-bold">{p.orders}</td>
                        <td className="text-center sr-green font-bold">{p.confirmedOrders}</td>
                        <td className="text-center sr-pending font-bold">{p.pendingOrders}</td>
                        <td className="text-center sr-red font-bold">{p.cancelledOrders}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {searchedProductData.length > 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                borderTop: '1px solid var(--sr-border)',
                fontSize: '0.76rem',
                color: 'var(--sr-text-muted)',
                background: 'var(--sr-card)',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <div>
                  Showing <strong>{(safeProductPage - 1) * productPageSize + 1}</strong>–<strong>{Math.min(safeProductPage * productPageSize, searchedProductData.length)}</strong> of <strong>{searchedProductData.length}</strong> products
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    value={productPageSize}
                    onChange={e => { setProductPageSize(Number(e.target.value)); setProductPage(1); }}
                    style={{
                      height: '28px',
                      padding: '0 6px',
                      fontSize: '0.74rem',
                      borderRadius: '4px',
                      border: '1px solid var(--sr-border)',
                      background: 'var(--sr-btn-bg)',
                      color: 'var(--sr-text)'
                    }}
                  >
                    <option value={10}>10 / page</option>
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                  <button
                    disabled={safeProductPage <= 1}
                    onClick={() => setProductPage(p => Math.max(1, p - 1))}
                    style={{
                      height: '28px',
                      padding: '0 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--sr-border)',
                      background: 'var(--sr-btn-bg)',
                      color: 'var(--sr-text)',
                      cursor: safeProductPage <= 1 ? 'not-allowed' : 'pointer',
                      opacity: safeProductPage <= 1 ? 0.4 : 1
                    }}
                  >
                    Prev
                  </button>
                  <span>{safeProductPage} / {totalProductPages}</span>
                  <button
                    disabled={safeProductPage >= totalProductPages}
                    onClick={() => setProductPage(p => Math.min(totalProductPages, p + 1))}
                    style={{
                      height: '28px',
                      padding: '0 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--sr-border)',
                      background: 'var(--sr-btn-bg)',
                      color: 'var(--sr-text)',
                      cursor: safeProductPage >= totalProductPages ? 'not-allowed' : 'pointer',
                      opacity: safeProductPage >= totalProductPages ? 0.4 : 1
                    }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

          </>
        )}
      </div>

      {/* ── Daily Sales Trend Chart ── */}
      <div className="sr-card">
        <div className="sr-card-header">
          <SectionTitle icon={BarChart3} title="Daily Sales Trend" sub="Orders vs Confirmed vs Pending vs Cancelled" />
          <div className="sr-toggle-group">
            <button className={`sr-toggle-btn ${chartType==='bar'?'active':''}`} onClick={() => setChartType('bar')}>Bar</button>
            <button className={`sr-toggle-btn ${chartType==='area'?'active':''}`} onClick={() => setChartType('area')}>Area</button>
          </div>
        </div>
        {dailyData.length === 0 ? (
          <div className="sr-empty-compact">No sales data for this period.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240} minWidth={0} minHeight={0}>
            {chartType === 'bar' ? (
              <BarChart data={dailyData} margin={{ top:10, right:10, left:-15, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <Tooltip content={(props: any) => <ChartTooltip {...props} />} />
                <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                <Bar dataKey="total"     name="Total Orders" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={24} />
                <Bar dataKey="confirmed" name="Confirmed"    fill="#10b981" radius={[4,4,0,0]} maxBarSize={24} />
                <Bar dataKey="pending"   name="Pending"      fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={24} />
                <Bar dataKey="cancelled" name="Cancelled"    fill="#ef4444" radius={[4,4,0,0]} maxBarSize={24} />
              </BarChart>
            ) : (
              <AreaChart data={dailyData} margin={{ top:10, right:10, left:-15, bottom:0 }}>
                <defs>
                  {[['conf','#10b981'],['pend','#3b82f6'],['canc','#ef4444'],['total','#6366f1']].map(([id,c]) => (
                    <linearGradient key={id} id={`sr-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={c} stopOpacity={0}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99,102,241,0.06)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize:11, paddingTop:8 }} />
                <Area dataKey="total"     name="Total Orders" stroke="#6366f1" fill="url(#sr-grad-total)" strokeWidth={2} dot={false} />
                <Area dataKey="confirmed" name="Confirmed"    stroke="#10b981" fill="url(#sr-grad-conf)"  strokeWidth={2} dot={false} />
                <Area dataKey="pending"   name="Pending"      stroke="#3b82f6" fill="url(#sr-grad-pend)"  strokeWidth={2} dot={false} />
                <Area dataKey="cancelled" name="Cancelled"    stroke="#ef4444" fill="url(#sr-grad-canc)"  strokeWidth={2} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Two Column: Order Status + Source ── */}
      <div className="sr-two-col">

        {/* Order Status Distribution */}
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={BarChart3} title="Order Status Distribution" />
          </div>
          {statusDist.length === 0 ? <div className="sr-empty-compact">No order status data for this period.</div> : (
            <>
              <ResponsiveContainer width="100%" height={200} minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={78} paddingAngle={3}>
                    {statusDist.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="sr-pie-legend">
                {statusDist.map((d,i) => (
                  <div key={d.name} className="sr-pie-legend-row">
                    <span className="sr-pie-dot" style={{ background: STATUS_COLORS[d.name] || PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="sr-pie-name">{d.name}</span>
                    <strong>{d.value} orders</strong>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Source Breakdown (Unified with TikTok, Facebook, Instagram, Website, etc.) */}
        <div className="sr-card">
          <div className="sr-card-header">
            <SectionTitle icon={BarChart3} title="Source Breakdown" sub="Where confirmed orders originate" />
          </div>

          <div className="sr-source-mobile-list">
            {sourceData.length === 0 ? (
              <div className="sr-empty-compact">No source data for this period.</div>
            ) : (
              sourceData.map(s => (
                <div key={s.source} className="sr-source-mobile-item">
                  <div className="sr-source-m-top">
                    <span className="sr-source-m-name">{s.source}</span>
                    <span className="sr-source-m-tot">{s.total} orders</span>
                  </div>
                  <div className="sr-source-m-bottom">
                    <span>Confirmed: <strong className="sr-green">{s.confirmed}</strong></span>
                    <span>Confirmed Sales: <strong className="sr-green">{fmtTk(s.revenue)}</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="sr-source-table-wrap desktop-only-table-wrap">
            <div className="sr-source-table">
              <div className="sr-source-head">
                <span>Source</span><span>Total Orders</span><span>Confirmed</span><span>Confirmed Sales</span>
              </div>
              {sourceData.length === 0 ? <div className="sr-empty-compact">No data</div> : sourceData.map(s => (
                <div key={s.source} className="sr-source-row">
                  <span className="sr-source-name">{s.source}</span>
                  <span>{s.total}</span>
                  <span className="sr-green">{s.confirmed}</span>
                  <span className="sr-green font-bold">{fmtTk(s.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Top Selling Products ── */}
      <div className="sr-card">
        <div className="sr-card-header">
          <SectionTitle icon={Trophy} title="Top Selling Products" sub="By confirmed sales revenue" />
        </div>
        {topSellers.length === 0 ? <div className="sr-empty-compact">No confirmed orders yet.</div> : (
          <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={0}>
            <BarChart data={topSellers} layout="vertical" margin={{ top:0, right:16, left:0, bottom:0 }}>
              <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-muted)', fontSize:11 }} tickFormatter={(val) => fmtTk(val)} />
              <YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false} tick={{ fill:'var(--sr-text-sub)', fontSize:11, fontWeight:600 }} tickFormatter={(val) => val.length > 20 ? val.substring(0, 18) + '...' : val} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="confirmedSales" name="Confirmed Sales Revenue" fill="#10b981" radius={[0,6,6,0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Mobile Date Range Bottom Sheet ── */}
      {isDateSheetOpen && (
        <div className="sr-sheet-backdrop" onClick={() => setIsDateSheetOpen(false)}>
          <div className="sr-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sr-sheet-head">
              <h3>Select Date Range</h3>
              <button className="sr-sheet-close" onClick={() => setIsDateSheetOpen(false)}><X size={18} /></button>
            </div>
            <div className="sr-sheet-body">
              <div className="sr-sheet-options">
                {PRESETS.map(p => (
                  <button
                    key={p.key}
                    className={`sr-sheet-option-btn ${preset === p.key ? 'active' : ''}`}
                    onClick={() => {
                      applyPreset(p.key);
                      if (p.key !== 'custom') setIsDateSheetOpen(false);
                    }}
                  >
                    <span>{p.label}</span>
                    {preset === p.key && <CheckCircle2 size={15} className="text-accent" />}
                  </button>
                ))}
              </div>

              {preset === 'custom' && (
                <div className="sr-sheet-custom-dates">
                  <label>From:
                    <input
                      type="date"
                      className="sr-date-input"
                      value={dateRange.start.toISOString().split('T')[0]}
                      onChange={e => { const d = new Date(e.target.value); d.setHours(0,0,0,0); setDateRange(r => ({...r, start:d})); }}
                    />
                  </label>
                  <label>To:
                    <input
                      type="date"
                      className="sr-date-input"
                      value={dateRange.end.toISOString().split('T')[0]}
                      onChange={e => { const d = new Date(e.target.value); d.setHours(23,59,59,999); setDateRange(r => ({...r, end:d})); }}
                    />
                  </label>
                  <button className="sr-sheet-apply-btn" onClick={() => setIsDateSheetOpen(false)}>Apply Custom Range</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Color Filter Bottom Sheet ── */}
      {isColorSheetOpen && (
        <div className="sr-sheet-backdrop" onClick={() => setIsColorSheetOpen(false)}>
          <div className="sr-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sr-sheet-head">
              <h3>Filter by Color</h3>
              <button className="sr-sheet-close" onClick={() => setIsColorSheetOpen(false)}><X size={18} /></button>
            </div>
            <div className="sr-sheet-body">
              <div className="sr-sheet-options">
                {uniqueColors.map(c => (
                  <button
                    key={c}
                    className={`sr-sheet-option-btn ${colorFilter === c ? 'active' : ''}`}
                    onClick={() => {
                      setColorFilter(c);
                      setIsColorSheetOpen(false);
                    }}
                  >
                    <span>{c === 'All' ? 'All Colors' : c}</span>
                    {colorFilter === c && <CheckCircle2 size={15} className="text-accent" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Header Actions Menu ── */}
      {isHeaderMenuOpen && (
        <div className="sr-sheet-backdrop" onClick={() => setIsHeaderMenuOpen(false)}>
          <div className="sr-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="sr-sheet-head">
              <h3>Report Actions</h3>
              <button className="sr-sheet-close" onClick={() => setIsHeaderMenuOpen(false)}><X size={18} /></button>
            </div>
            <div className="sr-sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                className="sr-sheet-action-item"
                onClick={() => {
                  exportCSV(colorFilteredData, presetLabel);
                  setIsHeaderMenuOpen(false);
                }}
              >
                <FileDown size={16} />
                <span>Export CSV ({presetLabel})</span>
              </button>
              <button
                className="sr-sheet-action-item"
                onClick={() => {
                  setIsHeaderMenuOpen(false);
                  window.print();
                }}
              >
                <Printer size={16} />
                <span>Print Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Unit Cost & Selling Price Configuration Modal ── */}
      {isPricingModalOpen && (
        <div className="sr-modal-backdrop" onClick={() => setIsPricingModalOpen(false)}>
          <div className="sr-modal-shell" onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--sr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--sr-accent-bg)', color: 'var(--sr-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Settings size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--sr-text)' }}>Unit Cost & Selling Price Config</h3>
                  <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--sr-text-muted)' }}>Configure internal unit cost and reference customer selling price independently</p>
                </div>
              </div>
              <button onClick={() => setIsPricingModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sr-text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {/* Search filter in modal */}
            <div style={{ padding: '12px 20px 4px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--sr-text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search product..."
                  value={pricingSearchQuery}
                  onChange={e => setPricingSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px 8px 32px',
                    borderRadius: '8px',
                    border: '1px solid var(--sr-btn-bdr)',
                    background: 'var(--sr-btn-bg)',
                    color: 'var(--sr-text)',
                    fontSize: '12px',
                    fontWeight: 600,
                    outline: 'none'
                  }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {modalFilteredProducts.map(p => (
                <div key={p.name} className="sr-pricing-config-row">
                  <div className="sr-pricing-config-info">
                    <span className="sr-pricing-config-name">{p.name}</span>
                    <span className="sr-pricing-config-qty">{p.confirmedQty} units sold · {p.confirmedOrders} confirmed orders</span>
                  </div>
                  
                  <div className="sr-pricing-config-inputs">
                    <div className="sr-pricing-input-group">
                      <label>Unit Cost</label>
                      <div className="sr-currency-input-box">
                        <span>৳</span>
                        <input
                          type="number"
                          min="0"
                          value={p.unitCost || ''}
                          onChange={e => handleUnitCostChange(p.name, e.target.value)}
                          placeholder="Cost"
                        />
                      </div>
                    </div>

                    <div className="sr-pricing-input-group">
                      <label>Selling Price</label>
                      <div className="sr-currency-input-box highlight">
                        <span>৳</span>
                        <input
                          type="number"
                          min="0"
                          value={p.sellingPrice || ''}
                          onChange={e => handleSellingPriceChange(p.name, e.target.value)}
                          placeholder="Price"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--sr-border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsPricingModalOpen(false)}
                style={{ padding: '8px 22px', borderRadius: '8px', background: 'var(--sr-accent)', color: '#fff', border: 'none', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default function SalesReportPage() {
  return (
    <RoleGate roles={['Admin', 'Moderator', 'Call Team']}>
      <Suspense fallback={<CardSkeleton />}>
        <SalesReportInner />
      </Suspense>
    </RoleGate>
  );
}
