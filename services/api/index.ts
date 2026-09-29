/**
 * OrderFlow Centralized API Service Layer
 * 100% Contract Preservation with Legacy React API Layer + Modular Architecture
 */

import { supabase, schemaState, normalizePhone, normalizeIpAddress, normalizeText, toFiniteNumber } from './client';
import { ordersApi } from './orders';
import { inventoryApi } from './inventory';
import { dispatchApi } from './dispatch';
import { callsApi } from './calls';
import { productionApi } from './production';
import { reportsApi } from './reports';
import { usersApi } from './users';
import { settingsApi } from './settings';
import { tasksApi } from './tasks';
import { notificationsApi } from './notifications';
import { aiApi } from './ai';

// Named exports for modular access
export {
  ordersApi,
  inventoryApi,
  dispatchApi,
  callsApi,
  productionApi,
  reportsApi,
  usersApi,
  settingsApi,
  tasksApi,
  notificationsApi,
  aiApi
};

/**
 * Unified API Client
 * Drop-in 1:1 replacement for legacy `import api from '@/lib/api'`.
 */
export const api = {
  // Schema & State Helpers
  get orderModernColumnsState() {
    return schemaState.orderModernColumnsState;
  },
  set orderModernColumnsState(val: boolean | null) {
    schemaState.orderModernColumnsState = val;
  },
  get courierRatioCacheTableState() {
    return schemaState.courierRatioCacheTableState;
  },
  set courierRatioCacheTableState(val: boolean | null) {
    schemaState.courierRatioCacheTableState = val;
  },
  getToyBoxProductNameColumnState: () => schemaState.getToyBoxProductNameColumnState(),
  setToyBoxProductNameColumnState: (val: boolean) => schemaState.setToyBoxProductNameColumnState(val),
  isMissingColumnError: (err: any, col?: string) => schemaState.isMissingColumnError(err, col),
  isMissingTableError: (err: any, tbl?: string) => schemaState.isMissingTableError(err, tbl),
  isMissingFunctionError: (err: any, fn?: string) => schemaState.isMissingFunctionError(err, fn),
  hasUnsupportedOrderModernColumns: (err: any) => schemaState.hasUnsupportedOrderModernColumns(err),
  inferOrderModernColumnsState: (data: any[]) => schemaState.inferOrderModernColumnsState(data),
  stripUnsupportedOrderModernFields: (payload: any) => schemaState.stripUnsupportedOrderModernFields(payload),
  attachOrderModernFields: (payload: any, src: any) => schemaState.attachOrderModernFields(payload, src),

  // Normalization Helpers
  normalizePhone: (v: string) => normalizePhone(v),
  normalizeIpAddress: (v: string) => normalizeIpAddress(v),
  normalizeText: (v: string) => normalizeText(v),
  toFiniteNumber: (v: any, fallback?: number) => toFiniteNumber(v, fallback),

  // Courier Ratio Methods
  normalizeCourierRatioValue: dispatchApi.normalizeCourierRatioValue.bind(dispatchApi),
  inferCourierRiskLevel: dispatchApi.inferCourierRiskLevel.bind(dispatchApi),
  normalizeCourierRatioPayload: dispatchApi.normalizeCourierRatioPayload.bind(dispatchApi),
  hydrateCourierRatioCacheRecord: dispatchApi.hydrateCourierRatioCacheRecord.bind(dispatchApi),
  getCourierRatioCache: dispatchApi.getCourierRatioCache.bind(dispatchApi),
  getCourierRatioCacheBatch: dispatchApi.getCourierRatioCacheBatch.bind(dispatchApi),
  claimCourierRatioLookup: dispatchApi.claimCourierRatioLookup.bind(dispatchApi),
  waitForCourierRatioCache: dispatchApi.waitForCourierRatioCache.bind(dispatchApi),
  saveCourierRatioCache: dispatchApi.saveCourierRatioCache.bind(dispatchApi),
  markCourierRatioCacheFailed: dispatchApi.markCourierRatioCacheFailed.bind(dispatchApi),

  // Orders Management
  getOrders: ordersApi.getOrders.bind(ordersApi),
  getOrdersWithCount: ordersApi.getOrdersWithCount.bind(ordersApi),
  getOrdersCount: ordersApi.getOrdersCount.bind(ordersApi),
  getOrderById: ordersApi.getOrderById.bind(ordersApi),
  createOrder: ordersApi.createOrder.bind(ordersApi),
  updateOrder: ordersApi.updateOrder.bind(ordersApi),
  changeOrderStatus: ordersApi.changeOrderStatus.bind(ordersApi),
  formatOrderNoteEntry: ordersApi.formatOrderNoteEntry.bind(ordersApi),
  mergeOrderNotes: ordersApi.mergeOrderNotes.bind(ordersApi),
  appendOrderNote: ordersApi.appendOrderNote.bind(ordersApi),
  addTrackingID: ordersApi.addTrackingID.bind(ordersApi),
  logActivity: ordersApi.logActivity.bind(ordersApi),
  getRecentActivity: ordersApi.getRecentActivity.bind(ordersApi),
  getOrderActivity: ordersApi.getOrderActivity.bind(ordersApi),

  // Calls & Intelligence
  logCallAttempt: callsApi.logCallAttempt.bind(callsApi),
  getIpBlocklist: callsApi.getIpBlocklist.bind(callsApi),
  blockIpAddress: callsApi.blockIpAddress.bind(callsApi),
  blockIpAddressForFakeOrder: callsApi.blockIpAddressForFakeOrder.bind(callsApi),
  unblockIpAddress: callsApi.unblockIpAddress.bind(callsApi),
  getOrderIpIntelligence: callsApi.getOrderIpIntelligence.bind(callsApi),

  // Inventory Management
  getInventory: inventoryApi.getInventory.bind(inventoryApi),
  createInventoryItem: inventoryApi.createInventoryItem.bind(inventoryApi),
  updateInventoryItem: inventoryApi.updateInventoryItem.bind(inventoryApi),
  adjustStock: inventoryApi.adjustStock.bind(inventoryApi),
  deleteInventoryItem: inventoryApi.deleteInventoryItem.bind(inventoryApi),
  logInventoryTransaction: inventoryApi.logInventoryTransaction.bind(inventoryApi),
  deductStockByInventoryId: inventoryApi.deductStockByInventoryId.bind(inventoryApi),
  restoreStockByInventoryId: inventoryApi.restoreStockByInventoryId.bind(inventoryApi),
  deductStockByProductName: inventoryApi.deductStockByProductName.bind(inventoryApi),
  getProductOrderStats: inventoryApi.getProductOrderStats.bind(inventoryApi),
  getInventoryPnL: inventoryApi.getInventoryPnL.bind(inventoryApi),
  getToyBoxInventory: inventoryApi.getToyBoxInventory.bind(inventoryApi),
  updateToyBoxStock: inventoryApi.updateToyBoxStock.bind(inventoryApi),
  createToyBoxStocks: inventoryApi.createToyBoxStocks.bind(inventoryApi),
  matchInventoryProduct: inventoryApi.matchInventoryProduct.bind(inventoryApi),
  extractToyBoxNumber: inventoryApi.extractToyBoxNumber.bind(inventoryApi),
  matchToyBoxInventory: inventoryApi.matchToyBoxInventory.bind(inventoryApi),
  parseInvoiceLine: inventoryApi.parseInvoiceLine.bind(inventoryApi),
  parseManualBulkInvoiceInput: inventoryApi.parseManualBulkInvoiceInput.bind(inventoryApi),
  previewInvoiceStockUpdate: inventoryApi.previewInvoiceStockUpdate.bind(inventoryApi),
  applyInvoiceStockUpdate: inventoryApi.applyInvoiceStockUpdate.bind(inventoryApi),

  // Dispatch & Logistics
  dispatchToCourier: dispatchApi.dispatchToCourier.bind(dispatchApi),
  getSteadfastStatus: dispatchApi.getSteadfastStatus.bind(dispatchApi),
  runAutoDistribution: dispatchApi.runAutoDistribution.bind(dispatchApi),
  resetSystem: dispatchApi.resetSystem.bind(dispatchApi),

  // Reports & Analytics
  getDashboardStats: reportsApi.getDashboardStats.bind(reportsApi),
  getOrderProductBreakdown: reportsApi.getOrderProductBreakdown.bind(reportsApi),
  getOrderStatusBreakdown: reportsApi.getOrderStatusBreakdown.bind(reportsApi),
  getUserPerformanceDetails: reportsApi.getUserPerformanceDetails.bind(reportsApi),

  // Team & User Management
  getUsers: usersApi.getUsers.bind(usersApi),
  createUser: usersApi.createUser.bind(usersApi),
  updateUserRoles: usersApi.updateUserRoles.bind(usersApi),
  updateUserProfile: usersApi.updateUserProfile.bind(usersApi),
  deleteUser: usersApi.deleteUser.bind(usersApi),
  adminCreateUser: usersApi.adminCreateUser.bind(usersApi),
  adminConfirmUser: usersApi.adminConfirmUser.bind(usersApi),
  adminResetPassword: usersApi.adminResetPassword.bind(usersApi),
  adminCreateUserViaSignup: usersApi.adminCreateUserViaSignup.bind(usersApi),

  // Production & Factory
  getProductionLogs: productionApi.getProductionLogs.bind(productionApi),
  createProductionLog: productionApi.createProductionLog.bind(productionApi),
  updateProductionLog: productionApi.updateProductionLog.bind(productionApi),
  deleteProductionLog: productionApi.deleteProductionLog.bind(productionApi),
  getProductionPayments: productionApi.getProductionPayments.bind(productionApi),
  createProductionPayment: productionApi.createProductionPayment.bind(productionApi),
  syncProductionLogsPaymentStatuses: productionApi.syncProductionLogsPaymentStatuses.bind(productionApi),

  // Settings & Backups
  getSystemConfig: settingsApi.getSystemConfig.bind(settingsApi),
  updateSystemConfig: settingsApi.updateSystemConfig.bind(settingsApi),
  getBackupSettings: settingsApi.getBackupSettings.bind(settingsApi),
  updateBackupSettings: settingsApi.updateBackupSettings.bind(settingsApi),
  getBackupLogs: settingsApi.getBackupLogs.bind(settingsApi),
  createBackupLog: settingsApi.createBackupLog.bind(settingsApi),
  updateBackupLog: settingsApi.updateBackupLog.bind(settingsApi),
  triggerBackup: settingsApi.triggerBackup.bind(settingsApi),
  pruneOldBackups: settingsApi.pruneOldBackups.bind(settingsApi),
  getBackupDownloadUrl: settingsApi.getBackupDownloadUrl.bind(settingsApi),

  // Tasks Management
  logTaskActivity: tasksApi.logTaskActivity.bind(tasksApi),
  getTaskLogs: tasksApi.getTaskLogs.bind(tasksApi),
  getDailyTasks: tasksApi.getDailyTasks.bind(tasksApi),
  createDailyTask: tasksApi.createDailyTask.bind(tasksApi),
  updateDailyTask: tasksApi.updateDailyTask.bind(tasksApi),
  deleteDailyTask: tasksApi.deleteDailyTask.bind(tasksApi),
  getDailyCompletions: tasksApi.getDailyCompletions.bind(tasksApi),
  completeDailyTask: tasksApi.completeDailyTask.bind(tasksApi),
  uncompleteDailyTask: tasksApi.uncompleteDailyTask.bind(tasksApi),
  getAssignedTasks: tasksApi.getAssignedTasks.bind(tasksApi),
  createAssignedTask: tasksApi.createAssignedTask.bind(tasksApi),
  updateAssignedTask: tasksApi.updateAssignedTask.bind(tasksApi),
  deleteAssignedTask: tasksApi.deleteAssignedTask.bind(tasksApi),
  addCommentToTask: tasksApi.addCommentToTask.bind(tasksApi),
  requestTaskExtension: tasksApi.requestTaskExtension.bind(tasksApi),
  evaluateTaskExtension: tasksApi.evaluateTaskExtension.bind(tasksApi),

  // Notifications
  getNotifications: notificationsApi.getNotifications.bind(notificationsApi),
  markNotificationRead: notificationsApi.markNotificationRead.bind(notificationsApi),
  markAllNotificationsRead: notificationsApi.markAllNotificationsRead.bind(notificationsApi),
  deleteAllNotifications: notificationsApi.deleteAllNotifications.bind(notificationsApi),
  getNotificationUrl: notificationsApi.getNotificationUrl.bind(notificationsApi),
  resolveNotificationPushRecipients: notificationsApi.resolveNotificationPushRecipients.bind(notificationsApi),
  triggerPushNotifications: notificationsApi.triggerPushNotifications.bind(notificationsApi),
  createNotification: notificationsApi.createNotification.bind(notificationsApi),
  savePushSubscription: notificationsApi.savePushSubscription.bind(notificationsApi),
  deletePushSubscription: notificationsApi.deletePushSubscription.bind(notificationsApi),

  // AI Integration
  extractInvoiceItemsWithGroq: aiApi.extractInvoiceItemsWithGroq.bind(aiApi),
  extractOrderWithAI: aiApi.extractOrderWithAI.bind(aiApi)
};

export default api;
