# Orderflow MCP Server

This is a custom, secure Model Context Protocol (MCP) server that connects your AI Assistant (Claude, Cursor, ChatGPT, etc.) directly to your **Orderflow** Database. 

It exposes high-level, read-only analytical tools that let your assistant instantly query daily reports, calculate profit margins, analyze inventory stocks, and rank sales agents.

---

## 🛠️ Security Architecture
This server does **NOT** expose a general-purpose SQL command box. Instead, it exposes **pre-defined, parameterized tools** using the official MCP SDK. This ensures:
- **No Mutative Actions**: Prevents AI from dropping tables, editing records, or corrupting data.
- **Credential Protection**: The Supabase URL and API keys are injected via local environment variables.

---

## 🚀 Pre-requisites & Setup

1. Make sure you have Node.js (v18+) installed.
2. Build the project:
   ```bash
   cd orderflow-mcp-server
   npm install
   npm run build
   ```

---

## ⚙️ Configuration in AI Editors

### 1. Claude Desktop App
To connect this MCP server to Claude Desktop, open your Claude config file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the server under `mcpServers`:

```json
{
  "mcpServers": {
    "orderflow-mcp-analytics": {
      "command": "node",
      "args": ["C:/projects/order management system/Order-management/orderflow-mcp-server/dist/index.js"],
      "env": {
        "SUPABASE_URL": "YOUR_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY": "YOUR_SUPABASE_SERVICE_ROLE_KEY"
      }
    }
  }
}
```
*(Make sure to replace `C:/projects/order management system/Order-management/orderflow-mcp-server/dist/index.js` with the actual absolute path to your compiled script, and fill in your Supabase credentials).*

### 2. Cursor Editor
To connect this to Cursor:
1. Open Cursor and go to **Settings** -> **Features** -> **MCP**.
2. Click **+ Add New MCP Server**.
3. Fill in details:
   - **Name**: `orderflow-analytics`
   - **Type**: `stdio`
   - **Command**: `node "C:/projects/order management system/Order-management/orderflow-mcp-server/dist/index.js"`
4. Set Environment Variables:
   - Name: `SUPABASE_URL`, Value: `YOUR_SUPABASE_URL`
   - Name: `SUPABASE_SERVICE_ROLE_KEY`, Value: `YOUR_SUPABASE_SERVICE_ROLE_KEY`
5. Click **Save**.

---

## 🤖 Available AI Tools

Once connected, your AI assistant will automatically gain access to:

1. `get_sales_analytics`
   - **Description**: Generates sales reports, revenue sums, average order values, and conversion rates.
   - **Inputs**: `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD), `source` (optional filter).

2. `get_inventory_health`
   - **Description**: Displays inventory totals, out-of-stock and low-stock alerts, COGS valuation, retail valuation, and average profit margins.

3. `get_factory_ledger_summary`
   - **Description**: Computes daily production yields, total production expenses, cleared payments, and outstanding factory dues.

4. `analyze_agent_performance`
   - **Description**: Provides performance rankings of sales agents based on total processed orders, confirmed counts, and conversion percentages.
