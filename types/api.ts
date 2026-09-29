/**
 * OrderFlow Strict TypeScript Definitions
 * Covers all database entities, API contracts, filter payloads, and return types.
 * Strict parity with Supabase schemas and operational state.
 */

// --- Authentication & Users ---

export type UserRole =
  | 'Admin'
  | 'Moderator'
  | 'Call Team'
  | 'Courier Team'
  | 'Factory Team'
  | 'Digital Marketer';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  status: 'active' | 'inactive' | 'Deactivated';
  last_active_at?: string | null;
  created_at?: string;
  roles?: UserRole[];
}

export interface AdminCreateUserInput {
  email: string;
  password?: string;
  name: string;
  roles: UserRole[];
}

// --- Orders ---

export type OrderStatus =
  | 'New'
  | 'Pending Call'
  | 'Final Call Pending'
  | 'Confirmed'
  | 'Bulk Exported'
  | 'Courier Ready'
  | 'Courier Submitted'
  | 'Factory Queue'
  | 'Factory Processing'
  | 'Processing'
  | 'Shipped'
  | 'Completed'
  | 'Fake Order'
  | 'Cancelled'
  | 'Incomplete'
  | 'Test';

export type TrafficSource =
  | 'Website'
  | 'Facebook'
  | 'Instagram'
  | 'Messenger'
  | 'Direct'
  | 'TikTok'
  | 'WhatsApp'
  | string;

export interface OrderItem {
  name: string;
  quantity: number;
  price?: number;
  isToyBox?: boolean;
  toyBoxNumber?: number;
}

export interface Order {
  id: string | number;
  customer_name: string;
  phone: string;
  address: string;
  shipping_zone?: 'Inside Dhaka' | 'Outside Dhaka' | string;
  product_name: string;
  size?: string | null;
  quantity: number;
  amount: number;
  total_amount?: number;
  total_price?: number;
  status: OrderStatus;
  notes?: string | null;
  ordered_items?: OrderItem[];
  inventory_id?: string | null;
  delivery_charge?: number;
  source?: string;
  traffic_source?: TrafficSource;
  ip_address?: string | null;
  call_attempts?: number;
  first_call_time?: string | null;
  last_called_at?: string | null;
  tracking_id?: string | null;
  courier_name?: string | null;
  courier_assigned_id?: string | null;
  courier_status?: string | null;
  dispatched_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface OrderFilters {
  status?: string;
  source?: string;
  searchTerm?: string;
  productName?: string;
  dateRange?: {
    start: Date | string;
    end: Date | string;
  };
}

export interface PaginatedOrders {
  data: Order[];
  count: number;
}

export interface OrderActivityLog {
  id?: string | number;
  order_id: string | number;
  action_type: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | 'NOTE' | 'CALL_ATTEMPT' | 'TRACKING_ADDED' | string;
  previous_status?: string | null;
  new_status?: string | null;
  changed_by_user_id?: string | null;
  changed_by_user_name?: string | null;
  action_description?: string;
  timestamp?: string;
  created_at?: string;
}

// --- Inventory ---

export interface InventoryItem {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  current_stock: number;
  unit_price: number;
  selling_price?: number;
  making_cost: number;
  min_stock_level?: number;
  supports_serial_tracking?: boolean;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ToyBoxInventory {
  id: string;
  toy_box_number: number;
  product_name: string;
  stock_quantity: number;
  updated_at?: string;
}

export interface InventoryTransaction {
  id?: string;
  inventory_id: string;
  order_id?: string | number | null;
  type: 'manual_add' | 'manual_deduct' | 'order_fulfill' | 'order_cancel' | 'invoice_bulk' | string;
  quantity: number;
  note?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface InvoiceParsedItem {
  rawLine?: string;
  quantity: number;
  product: string;
  boxNumber?: number | null;
  confidence?: number;
}

export interface StockUpdatePreviewItem {
  rawLine: string;
  product: string;
  quantity: number;
  targetType: 'inventory' | 'toy_box' | 'unmatched';
  targetId?: string;
  targetName?: string;
  boxNumber?: number;
  currentStock: number;
  newStock: number;
  confidence: number;
  reason?: string;
}

export interface InvoicePreviewResult {
  parsedLines: InvoiceParsedItem[];
  preview: StockUpdatePreviewItem[];
  matchedCount: number;
  unmatchedCount: number;
}

export interface InvoiceApplyResult {
  success: boolean;
  updatedCount: number;
  errors: Array<{ item: StockUpdatePreviewItem; error: string }>;
}

// --- Factory & Production ---

export interface ProductionLog {
  id: string;
  product_name: string;
  color?: string | null;
  variant?: string | null;
  quantity_produced: number;
  unit_cost: number;
  total_cost: number;
  paid_amount: number;
  due_amount: number;
  payment_status: 'unpaid' | 'partial' | 'paid';
  production_date: string;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductionPayment {
  id: string;
  production_log_id: string;
  amount: number;
  payment_method: 'cash' | 'bank' | 'bkash' | 'nagad' | string;
  payment_date: string;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  factory_production_logs?: {
    product_name: string;
    color?: string | null;
    variant?: string | null;
    total_cost: number;
    paid_amount: number;
    due_amount: number;
  };
}

// --- Dispatch & Courier ---

export type CourierRiskLevel = 'safe' | 'medium' | 'high' | 'new';

export interface CourierRatioRecord {
  loading: boolean;
  fetched: boolean;
  error: boolean;
  total: number;
  success_count: number;
  cancelled: number;
  ratio: number;
  riskLevel: CourierRiskLevel;
  couriers: Record<string, unknown>;
  raw?: unknown;
  fetchedAt?: string | null;
  updatedAt?: string | null;
  phone: string;
  source: string;
}

export interface CourierDispatchResult {
  success: boolean;
  consignmentId?: string;
  trackingCode?: string;
  status?: string;
  message?: string;
  details?: Record<string, any>;
  error?: string;
}

export interface SteadfastStatusResult {
  success: boolean;
  status: string;
  tracking_code?: string;
  delivery_status?: string;
  details?: Record<string, any>;
  error?: string;
}

// --- Intelligence & Calls ---

export interface CallLogPayload {
  orderId: string | number;
  attemptNumber: number;
  outcome: 'Answered' | 'No Answer' | 'Busy' | 'Switched Off' | 'Wrong Number' | 'Callback Requested' | string;
  note?: string;
  user: {
    id: string;
    name: string;
    roles?: UserRole[];
  };
}

export interface BlockedIpEntry {
  id?: string;
  ip_address: string;
  reason?: string;
  blocked_by?: string;
  created_at?: string;
}

export interface OrderIpIntelligence {
  ip_address: string;
  isBlocked: boolean;
  totalOrdersWithIp: number;
  fakeOrdersWithIp: number;
  cancelledOrdersWithIp: number;
  orders: Array<{
    id: string | number;
    customer_name: string;
    phone: string;
    status: OrderStatus;
    created_at: string;
  }>;
}

// --- Tasks ---

export interface DailyTask {
  id: string;
  title: string;
  description?: string;
  target_role?: UserRole | string;
  points?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DailyTaskCompletion {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  completed_date: string;
  completed_at: string;
}

export interface AssignedTask {
  id: string;
  title: string;
  description?: string;
  assigned_to: string;
  assigned_to_name?: string;
  assigned_by: string;
  assigned_by_name?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  due_date?: string | null;
  comments?: TaskComment[];
  extension_requests?: TaskExtensionRequest[];
  created_at?: string;
  updated_at?: string;
}

export interface TaskComment {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
}

export interface TaskExtensionRequest {
  id: string;
  requested_due_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  requested_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export interface TaskActivityLog {
  id?: string;
  task_id: string;
  action_type: string;
  user_id: string;
  user_name: string;
  details?: string;
  created_at?: string;
}

// --- Notifications ---

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  actor_name?: string;
  target_user_id?: string | null;
  target_role?: string | null;
  read: boolean;
  created_at: string;
}

export interface PushSubscriptionRecord {
  id?: string;
  user_id?: string;
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  created_at?: string;
}

// --- Settings & Backups ---

export interface SystemConfig {
  id?: string;
  key: string;
  value: any;
  description?: string;
  updated_at?: string;
}

export interface BackupSettings {
  id?: number;
  auto_backup_enabled?: boolean;
  autoBackupEnabled?: boolean;
  backup_interval_hours?: number;
  frequencyHours?: number;
  retentionDays?: number;
  targetDestination?: 'supabase_storage' | 'google_drive' | 'local';
  next_backup_at?: string | null;
  last_backup_at?: string | null;
  lastBackupAt?: string | null;
  last_backup_status?: string | null;
  last_backup_size_bytes?: number | null;
  google_drive_client_id?: string | null;
  google_drive_connected?: boolean;
  updated_at?: string;
}

export interface BackupLog {
  id: string | number;
  type?: string;
  backup_type?: 'automated' | 'manual';
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'running' | string;
  file_path?: string | null;
  supabase_storage_path?: string | null;
  google_drive_file_id?: string | null;
  google_drive_link?: string | null;
  file_size_bytes?: number | null;
  total_records?: number | null;
  records_count?: number | null;
  triggered_by_user_id?: string | null;
  triggered_by_user_name?: string | null;
  triggered_by?: string | null;
  notes?: string | null;
  error_message?: string | null;
  created_at: string;
}

// --- Reports & Analytics ---

export interface DashboardStats {
  total: number;
  completed: number;
  pending: number;
  processing: number;
  revenue: number;
  addedTodayCount: number;
  confirmedTodayCount: number;
  averageOrderValue: number;
  totalCustomers: number;
  totalProducts: number;
  cancelledCount: number;
  sourceDistribution: Array<{ name: string; value: number; color: string }>;
  trendData: Array<{ name: string; orders: number }>;
  confirmationData: Array<{ name: string; rate: number }>;
}

export interface OrderProductBreakdownItem {
  product_name: string;
  count: number;
  percentage: number;
}

export interface OrderStatusBreakdownItem {
  status: OrderStatus;
  count: number;
  percentage: number;
}

export interface UserPerformanceRecord {
  userId: string;
  userName: string;
  confirmedCount: number;
  cancelledCount: number;
  fakeCount: number;
  callAttemptsCount: number;
  avgResponseMinutes?: number;
}
