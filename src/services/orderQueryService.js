/**
 * Database Query & Tool Service for NovaAI Assistant
 * Single Source of Truth — 100% verified PostgreSQL data.
 */

import { supabase } from '../lib/supabase.js';
import { getDhakaNow } from './aiDateParser.js';

/**
 * Standardize order status for queries
 */
export function normalizeStatus(status) {
  if (!status) return null;
  const s = String(status).trim().toLowerCase();

  if (s === 'confirmed' || s === 'কনফার্ম' || s === 'কনফার্মড') return ['Confirmed'];
  if (s === 'pending' || s === 'পেন্ডিং' || s === 'pending call' || s === 'পেন্ডিং কল') return ['Pending Call', 'New'];
  if (s === 'new' || s === 'নতুন' || s === 'new order') return ['New'];
  if (s === 'cancelled' || s === 'বাতিল' || s === 'ক্যানসেল' || s === 'ক্যানসেলড' || s === 'canceled') return ['Cancelled'];
  if (s === 'bulk exported' || s === 'বাল্ক এক্সপোর্ট' || s === 'exported') return ['Bulk Exported'];
  if (s === 'courier ready' || s === 'কুরিয়ার রেডি') return ['Courier Ready'];
  if (s === 'courier submitted' || s === 'কুরিয়ার সাবমিটেড') return ['Courier Submitted'];
  if (s === 'factory processing' || s === 'ফ্যাক্টরি') return ['Factory Processing'];
  if (s === 'completed' || s === 'সম্পন্ন' || s === 'complete') return ['Completed'];
  if (s === 'incomplete' || s === 'অসম্পূর্ণ' || s === 'ড্রাফট') return ['Incomplete'];
  if (s === 'fake' || s === 'ভুয়া' || s === 'ভুয়া') return ['Fake Order'];

  return [status];
}

/**
 * 1. getOrderCount: Exact count, revenue, and status breakdown
 */
export async function getOrderCount({ startIso, endIso, status, source } = {}) {
  try {
    let query = supabase.from('orders').select('id, amount, status, source, product_name, quantity, created_at');

    if (startIso) query = query.gte('created_at', startIso);
    if (endIso) query = query.lte('created_at', endIso);

    const statuses = normalizeStatus(status);
    if (statuses && statuses.length === 1) {
      query = query.eq('status', statuses[0]);
    } else if (statuses && statuses.length > 1) {
      query = query.in('status', statuses);
    }

    if (source) query = query.ilike('source', `%${source}%`);

    query = query.order('created_at', { ascending: false });

    const { data: rows, error } = await query;
    if (error) throw error;

    const orders = rows || [];
    const statusBreakdown = {};
    const sourceBreakdown = {};
    let totalAmount = 0;

    orders.forEach(o => {
      const st = o.status || 'Unknown';
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;

      const src = o.source || 'Direct';
      sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;

      totalAmount += Number(o.amount) || 0;
    });

    return {
      success: true,
      count: orders.length,
      totalAmount,
      statusBreakdown,
      sourceBreakdown,
      timeWindow: { startIso, endIso, status: statuses ? statuses.join(', ') : 'All' }
    };
  } catch (err) {
    console.error('getOrderCount failed:', err);
    return { success: false, error: err.message, count: 0, totalAmount: 0, statusBreakdown: {} };
  }
}

/**
 * 2. getOrders: List orders with details
 */
export async function getOrders({ startIso, endIso, status, limit = 20 } = {}) {
  try {
    let query = supabase.from('orders').select('id, customer_name, phone, address, product_name, size, quantity, amount, status, source, created_at');

    if (startIso) query = query.gte('created_at', startIso);
    if (endIso) query = query.lte('created_at', endIso);

    const statuses = normalizeStatus(status);
    if (statuses && statuses.length === 1) {
      query = query.eq('status', statuses[0]);
    } else if (statuses && statuses.length > 1) {
      query = query.in('status', statuses);
    }

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data: rows, error } = await query;
    if (error) throw error;

    return { success: true, count: (rows || []).length, orders: rows || [] };
  } catch (err) {
    console.error('getOrders failed:', err);
    return { success: false, error: err.message, count: 0, orders: [] };
  }
}

/**
 * 3. getOrdersByDateRange
 */
export async function getOrdersByDateRange(params) {
  return getOrders(params);
}

/**
 * 4. getOrdersByStatus
 */
export async function getOrdersByStatus(params) {
  return getOrders(params);
}

/**
 * 5. getOrderDetails: Fetch complete order record by ID or Phone
 */
export async function getOrderDetails({ orderId, phone } = {}) {
  try {
    if (!orderId && !phone) throw new Error('Order ID or Phone is required');
    let query = supabase.from('orders').select('*');

    if (orderId) {
      const cleanId = String(orderId).trim();
      query = query.ilike('id', `%${cleanId}%`);
    } else if (phone) {
      const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
      query = query.ilike('phone', `%${cleanPhone}%`);
    }

    const { data: rows, error } = await query.limit(1);
    if (error) throw error;

    if (!rows || rows.length === 0) {
      return { success: true, found: false, message: 'অর্ডারটি পাওয়া যায়নি।' };
    }
    return { success: true, found: true, order: rows[0] };
  } catch (err) {
    console.error('getOrderDetails failed:', err);
    return { success: false, found: false, error: err.message };
  }
}

/**
 * 6. getSalesSummary: Total revenue, total orders, average order value, status breakdown, top products
 */
export async function getSalesSummary({ startIso, endIso } = {}) {
  const result = await getOrderCount({ startIso, endIso });
  if (!result.success) return result;

  const count = result.count;
  const totalRevenue = result.totalAmount;
  const avgOrderValue = count > 0 ? Math.round(totalRevenue / count) : 0;

  let topProducts = [];
  if (count > 0) {
    try {
      let q = supabase.from('orders').select('product_name, quantity, amount');
      if (startIso) q = q.gte('created_at', startIso);
      if (endIso) q = q.lte('created_at', endIso);
      const { data: pRows } = await q.limit(500);
      if (pRows) {
        const pMap = {};
        pRows.forEach(r => {
          const name = r.product_name || 'Other';
          if (!pMap[name]) pMap[name] = { product: name, quantity: 0, revenue: 0 };
          pMap[name].quantity += Number(r.quantity) || 1;
          pMap[name].revenue += Number(r.amount) || 0;
        });
        topProducts = Object.values(pMap).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
      }
    } catch (e) {
      console.warn('Could not fetch top products in sales summary:', e);
    }
  }

  return {
    success: true,
    totalOrders: count,
    totalRevenueBDT: totalRevenue,
    averageOrderValue: avgOrderValue,
    statusBreakdown: result.statusBreakdown,
    sourceBreakdown: result.sourceBreakdown,
    topProducts,
    timeWindow: result.timeWindow
  };
}

/**
 * 7. getProductOrderCount: Get count and total quantity for a specific product
 */
export async function getProductOrderCount({ productName, startIso, endIso } = {}) {
  try {
    if (!productName) throw new Error('Product name is required');
    let query = supabase.from('orders').select('id, product_name, quantity, amount, status, created_at');

    if (startIso) query = query.gte('created_at', startIso);
    if (endIso) query = query.lte('created_at', endIso);

    query = query.ilike('product_name', `%${productName}%`);

    const { data: rows, error } = await query;
    if (error) throw error;

    const orders = rows || [];
    let totalQty = 0;
    let totalRevenue = 0;
    const statusMap = {};

    orders.forEach(o => {
      totalQty += Number(o.quantity) || 1;
      totalRevenue += Number(o.amount) || 0;
      statusMap[o.status] = (statusMap[o.status] || 0) + 1;
    });

    return {
      success: true,
      productName,
      orderCount: orders.length,
      totalQuantity: totalQty,
      totalRevenue,
      statusBreakdown: statusMap,
      sampleOrders: orders.slice(0, 5)
    };
  } catch (err) {
    console.error('getProductOrderCount failed:', err);
    return { success: false, error: err.message, orderCount: 0, totalQuantity: 0, totalRevenue: 0 };
  }
}

/**
 * 8. getProductSales: Top selling products and quantities in date range
 */
export async function getProductSales({ startIso, endIso, limit = 10 } = {}) {
  try {
    let query = supabase.from('orders').select('product_name, quantity, amount, status, created_at');

    if (startIso) query = query.gte('created_at', startIso);
    if (endIso) query = query.lte('created_at', endIso);

    const { data: rows, error } = await query;
    if (error) throw error;

    const map = {};
    (rows || []).forEach(r => {
      const name = r.product_name || 'Unknown Product';
      if (!map[name]) map[name] = { productName: name, orderCount: 0, totalQuantity: 0, totalRevenue: 0 };
      map[name].orderCount += 1;
      map[name].totalQuantity += Number(r.quantity) || 1;
      map[name].totalRevenue += Number(r.amount) || 0;
    });

    const topProducts = Object.values(map)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, limit);

    return {
      success: true,
      totalProductsFound: Object.keys(map).length,
      topProducts,
      timeWindow: { startIso, endIso }
    };
  } catch (err) {
    console.error('getProductSales failed:', err);
    return { success: false, error: err.message, topProducts: [] };
  }
}

/**
 * 9. getPendingOrders
 */
export async function getPendingOrders({ startIso, endIso, limit = 20 } = {}) {
  return getOrders({ startIso, endIso, status: 'Pending', limit });
}

/**
 * 10. getConfirmedOrders
 */
export async function getConfirmedOrders({ startIso, endIso, limit = 20 } = {}) {
  return getOrders({ startIso, endIso, status: 'Confirmed', limit });
}

/**
 * 11. getNewOrders
 */
export async function getNewOrders({ startIso, endIso, limit = 20 } = {}) {
  return getOrders({ startIso, endIso, status: 'New', limit });
}

/**
 * 12. getCancelledOrders
 */
export async function getCancelledOrders({ startIso, endIso, limit = 20 } = {}) {
  return getOrders({ startIso, endIso, status: 'Cancelled', limit });
}

/**
 * 13. getCustomerOrderHistory
 */
export async function getCustomerOrderHistory({ phone, customerName, limit = 10 } = {}) {
  try {
    let query = supabase.from('orders').select('id, customer_name, phone, address, product_name, amount, status, created_at');

    if (phone) {
      const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
      query = query.ilike('phone', `%${cleanPhone}%`);
    } else if (customerName) {
      query = query.ilike('customer_name', `%${customerName}%`);
    } else {
      throw new Error('Phone number or customer name is required');
    }

    query = query.order('created_at', { ascending: false }).limit(limit);

    const { data: rows, error } = await query;
    if (error) throw error;

    const orders = rows || [];
    let totalSpent = 0;
    const statusMap = {};
    orders.forEach(o => {
      totalSpent += Number(o.amount) || 0;
      statusMap[o.status] = (statusMap[o.status] || 0) + 1;
    });

    return {
      success: true,
      orders,
      customerOrders: orders,
      totalOrdersPlaced: orders.length,
      totalSpent,
      statusBreakdown: statusMap
    };
  } catch (err) {
    console.error('getCustomerOrderHistory failed:', err);
    return { success: false, error: err.message, orders: [], customerOrders: [] };
  }
}

/**
 * 14. getProductStock
 */
export async function getProductStock({ productName } = {}) {
  try {
    const { data: tbRows, error } = await supabase
      .from('toy_box_inventory')
      .select('*')
      .order('toy_box_number', { ascending: true });

    if (error) throw error;

    const toyBoxes = tbRows || [];
    const totalToyBoxStock = toyBoxes.reduce((sum, b) => sum + (Number(b.stock_quantity) || 0), 0);
    const lowStockToyBoxes = toyBoxes.filter(b => (Number(b.stock_quantity) || 0) <= 2);
    const emptyBoxes = toyBoxes.filter(b => (Number(b.stock_quantity) || 0) === 0);

    return {
      success: true,
      totalProducts: toyBoxes.length,
      productName: productName || 'Toy Box Inventory',
      totalStock: totalToyBoxStock,
      totalBoxes: toyBoxes.length,
      emptyBoxesCount: emptyBoxes.length,
      lowStockBoxes: lowStockToyBoxes.map(b => ({ box: `#${b.toy_box_number}`, stock: b.stock_quantity }))
    };
  } catch (err) {
    console.error('getProductStock failed:', err);
    return { success: false, error: err.message, totalProducts: 0, totalStock: 0 };
  }
}

/**
 * 15. getProductDetails
 */
export async function getProductDetails({ productName } = {}) {
  return getProductStock({ productName });
}

/**
 * Master Tool Dispatcher: Executes requested tool by name with parsed arguments
 */
export async function executeAiTool(toolName, args = {}) {
  console.log(`[AI Tool Call] Executing: ${toolName}`, args);

  switch (toolName) {
    case 'getOrderCount':
      return await getOrderCount(args);
    case 'getOrders':
      return await getOrders(args);
    case 'getOrdersByDateRange':
      return await getOrdersByDateRange(args);
    case 'getOrdersByStatus':
      return await getOrdersByStatus(args);
    case 'getOrderDetails':
      return await getOrderDetails(args);
    case 'getSalesSummary':
      return await getSalesSummary(args);
    case 'getProductOrderCount':
      return await getProductOrderCount(args);
    case 'getProductSales':
      return await getProductSales(args);
    case 'getPendingOrders':
      return await getPendingOrders(args);
    case 'getConfirmedOrders':
      return await getConfirmedOrders(args);
    case 'getNewOrders':
      return await getNewOrders(args);
    case 'getCancelledOrders':
      return await getCancelledOrders(args);
    case 'getCustomerOrderHistory':
      return await getCustomerOrderHistory(args);
    case 'getProductStock':
      return await getProductStock(args);
    case 'getProductDetails':
      return await getProductDetails(args);
    default:
      return { success: false, error: `Tool ${toolName} is not recognized.` };
  }
}
