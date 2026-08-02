import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) must be provided.');
  process.exit(1);
}

// Initializing Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Define active confirmed statuses (matching client system logic)
const CONFIRMED_STATUSES = [
  'Confirmed',
  'Confirmed & Printed',
  'Bulk Exported',
  'Courier Ready',
  'Courier Submitted',
  'Factory Processing',
  'Processing',
  'Shipped',
  'Completed'
];

const isConfirmedStatus = (status: string) => CONFIRMED_STATUSES.includes(status);

const server = new Server(
  {
    name: 'orderflow-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register MCP tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_sales_analytics',
        description: 'Retrieve real-time sales reports, order counts, status breakdowns, and revenue analytics for a specified date range.',
        inputSchema: {
          type: 'object',
          properties: {
            start_date: {
              type: 'string',
              description: 'Start date in YYYY-MM-DD format (inclusive). Defaults to today.',
            },
            end_date: {
              type: 'string',
              description: 'End date in YYYY-MM-DD format (inclusive). Defaults to today.',
            },
            source: {
              type: 'string',
              description: 'Filter sales by marketing traffic source (e.g., website, facebook, messenger).',
            },
          },
        },
      },
      {
        name: 'get_inventory_health',
        description: 'Get an overview of stock catalog health, including low stock notifications, out of stock counts, retail value, COGS cost value, and calculated profit margins.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_factory_ledger_summary',
        description: 'Query factory production history, daily finished yields, accumulated manufacturing costs, total paid, and outstanding factory dues.',
        inputSchema: {
          type: 'object',
          properties: {
            start_date: {
              type: 'string',
              description: 'Start date in YYYY-MM-DD format (inclusive).',
            },
            end_date: {
              type: 'string',
              description: 'End date in YYYY-MM-DD format (inclusive).',
            },
          },
        },
      },
      {
        name: 'analyze_agent_performance',
        description: 'Fetch rankings of sales agents based on total processed orders, confirmed counts, confirmation rates, and incomplete order conversions.',
        inputSchema: {
          type: 'object',
          properties: {
            start_date: {
              type: 'string',
              description: 'Start date in YYYY-MM-DD format (inclusive).',
            },
            end_date: {
              type: 'string',
              description: 'End date in YYYY-MM-DD format (inclusive).',
            },
          },
        },
      },
    ],
  };
});

// Implement Tool handler calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'get_sales_analytics') {
      const todayStr = new Date().toISOString().slice(0, 10);
      const startDate = (args?.start_date as string) || todayStr;
      const endDate = (args?.end_date as string) || todayStr;
      const source = args?.source as string;

      // Setting boundary timestamps
      const startIso = new Date(`${startDate}T00:00:00.000Z`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999Z`).toISOString();

      let query = supabase
        .from('orders')
        .select('id, amount, status, source, notes, created_at')
        .gte('created_at', startIso)
        .lte('created_at', endIso);

      if (source) {
        query = query.ilike('source', `%${source}%`);
      }

      const { data: orders, error } = await query;
      if (error) throw error;

      const totalOrders = orders.length;
      let totalRevenue = 0;
      let confirmedCount = 0;
      let cancelledCount = 0;
      let fakeCount = 0;
      let pendingCount = 0;
      let incompleteToConfirmedCount = 0;
      let incompleteToConfirmedRevenue = 0;

      const statusBreakdown: Record<string, number> = {};

      orders.forEach((o) => {
        statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
        const amt = Number(o.amount || 0);

        if (isConfirmedStatus(o.status)) {
          const isBonus = o.notes && o.notes.includes('[Was Incomplete]');
          if (isBonus) {
            incompleteToConfirmedCount++;
            incompleteToConfirmedRevenue += amt;
          } else {
            confirmedCount++;
            totalRevenue += amt;
          }
        } else if (o.status === 'Cancelled') {
          cancelledCount++;
        } else if (o.status === 'Fake Order') {
          fakeCount++;
        } else if (['New', 'Pending Call', 'Final Call Pending', 'Hold'].includes(o.status)) {
          pendingCount++;
        }
      });

      const avgOrderValue = confirmedCount > 0 ? totalRevenue / confirmedCount : 0;
      const confirmRate = totalOrders > 0 ? (confirmedCount / totalOrders) * 100 : 0;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                time_range: { start: startDate, end: endDate },
                total_orders_received: totalOrders,
                confirmed_orders: confirmedCount,
                revenue_bdt: totalRevenue,
                average_order_value: Math.round(avgOrderValue),
                confirmation_rate_pct: Number(confirmRate.toFixed(2)),
                cancelled_orders: cancelledCount,
                fake_orders: fakeCount,
                pending_orders: pendingCount,
                bonus_conversions: {
                  count: incompleteToConfirmedCount,
                  revenue_bdt: incompleteToConfirmedRevenue,
                  note: 'Confirmed from incomplete status (excluded from main KPIs)'
                },
                status_breakdown: statusBreakdown,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'get_inventory_health') {
      const { data: inventory, error } = await supabase
        .from('inventory')
        .select('id, name, sku, category, current_stock, min_stock_level, selling_price, unit_price, making_cost');
      if (error) throw error;

      let totalStockValue = 0;
      let totalCogsValue = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;
      const lowStockItems: any[] = [];
      const outOfStockItems: any[] = [];

      inventory.forEach((item) => {
        const qty = Number(item.current_stock || 0);
        const sellPrice = Number(item.selling_price || item.unit_price || 0);
        const costPrice = Number(item.making_cost || 0);

        totalStockValue += qty * sellPrice;
        totalCogsValue += qty * costPrice;

        if (qty === 0) {
          outOfStockCount++;
          outOfStockItems.push({ name: item.name, sku: item.sku, category: item.category });
        } else if (qty <= item.min_stock_level) {
          lowStockCount++;
          lowStockItems.push({ name: item.name, sku: item.sku, stock: qty, min: item.min_stock_level });
        }
      });

      const netProfitPotential = totalStockValue - totalCogsValue;
      const profitMarginPct = totalStockValue > 0 ? (netProfitPotential / totalStockValue) * 100 : 0;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary: {
                  total_product_records: inventory.length,
                  out_of_stock_count: outOfStockCount,
                  low_stock_alert_count: lowStockCount,
                  total_retail_value_bdt: totalStockValue,
                  total_cogs_value_bdt: totalCogsValue,
                  net_profit_potential_bdt: netProfitPotential,
                  avg_profit_margin_pct: Number(profitMarginPct.toFixed(2))
                },
                low_stock_details: lowStockItems,
                out_of_stock_details: outOfStockItems
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'get_factory_ledger_summary') {
      let query = supabase
        .from('factory_production_logs')
        .select('product_name, quantity_ready, total_cost, payment_status, production_date');

      if (args?.start_date) {
        query = query.gte('production_date', args.start_date);
      }
      if (args?.end_date) {
        query = query.lte('production_date', args.end_date);
      }

      const { data: logs, error } = await query;
      if (error) throw error;

      let totalQty = 0;
      let totalCost = 0;
      let totalPaid = 0;
      let totalDue = 0;
      const breakdown: Record<string, { product: string; qty: number; cost: number; paid: number; due: number }> = {};

      logs.forEach((log) => {
        const qty = Number(log.quantity_ready || 0);
        const cost = Number(log.total_cost || 0);
        const isPaid = log.payment_status === 'Paid';

        totalQty += qty;
        totalCost += cost;
        if (isPaid) {
          totalPaid += cost;
        } else {
          totalDue += cost;
        }

        const name = log.product_name;
        if (!breakdown[name]) {
          breakdown[name] = { product: name, qty: 0, cost: 0, paid: 0, due: 0 };
        }
        breakdown[name].qty += qty;
        breakdown[name].cost += cost;
        if (isPaid) {
          breakdown[name].paid += cost;
        } else {
          breakdown[name].due += cost;
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary: {
                  total_quantity_produced: totalQty,
                  total_production_cost_bdt: totalCost,
                  total_paid_bdt: totalPaid,
                  total_due_outstanding_bdt: totalDue
                },
                product_wise_breakdown: Object.values(breakdown)
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'analyze_agent_performance') {
      let query = supabase
        .from('orders')
        .select('id, amount, status, created_by, notes');

      if (args?.start_date) {
        const startIso = new Date(`${args.start_date}T00:00:00.000Z`).toISOString();
        query = query.gte('created_at', startIso);
      }
      if (args?.end_date) {
        const endIso = new Date(`${args.end_date}T23:59:59.999Z`).toISOString();
        query = query.lte('created_at', endIso);
      }

      const { data: orders, error: ordersError } = await query;
      if (ordersError) throw ordersError;

      // Fetch user profile maps
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, name');
      if (usersError) throw usersError;

      const userMap: Record<string, string> = {};
      users.forEach(u => { userMap[u.id] = u.name; });

      const agentStats: Record<string, { name: string; total: number; confirmed: number; cancelled: number; fake: number; revenue: number; incomplete_conversions: number }> = {};

      orders.forEach((o) => {
        const userId = o.created_by || 'system/unassigned';
        const agentName = userMap[userId] || 'System/Unassigned';

        if (!agentStats[userId]) {
          agentStats[userId] = {
            name: agentName,
            total: 0,
            confirmed: 0,
            cancelled: 0,
            fake: 0,
            revenue: 0,
            incomplete_conversions: 0
          };
        }

        const stats = agentStats[userId];
        stats.total++;

        const amt = Number(o.amount || 0);
        if (isConfirmedStatus(o.status)) {
          const isBonus = o.notes && o.notes.includes('[Was Incomplete]');
          if (isBonus) {
            stats.incomplete_conversions++;
          } else {
            stats.confirmed++;
            stats.revenue += amt;
          }
        } else if (o.status === 'Cancelled') {
          stats.cancelled++;
        } else if (o.status === 'Fake Order') {
          stats.fake++;
        }
      });

      const rankings = Object.values(agentStats).map(agent => {
        const confirmRate = agent.total > 0 ? (agent.confirmed / agent.total) * 100 : 0;
        return {
          ...agent,
          confirm_rate_pct: Number(confirmRate.toFixed(2))
        };
      }).sort((a, b) => b.confirmed - a.confirmed);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(rankings, null, 2),
          },
        ],
      };
    }

    throw new Error(`Tool ${name} not found`);
  } catch (err: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool: ${err?.message || err}`,
        },
      ],
      isError: true,
    };
  }
});

// Start Server using standard Node.js stdio channels
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Orderflow MCP Server running on Stdio Transport.');
