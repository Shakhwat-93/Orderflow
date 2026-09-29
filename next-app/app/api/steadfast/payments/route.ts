import { NextRequest, NextResponse } from 'next/server';
import {
  getSteadfastBalance,
  getRecentPayments,
  getPaymentDetails,
  mapConsignmentsToOmsOrders,
  SteadfastPayment,
  SteadfastConsignment
} from '@/lib/steadfast';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(5, parseInt(searchParams.get('pageSize') || '20', 10)));
    const statusFilter = searchParams.get('status') || 'all'; // all | paid | processing | pending
    const methodFilter = (searchParams.get('method') || 'all').trim().toLowerCase();
    const searchTerm = (searchParams.get('search') || '').trim().toLowerCase();
    const includeConsignments = searchParams.get('includeConsignments') !== 'false';

    // 1. Fetch live balance and recent payments concurrently
    const [balanceResult, paymentsResult] = await Promise.all([
      getSteadfastBalance().catch((err) => ({ current_balance: 0, status: 500, error: err.message })),
      getRecentPayments({ page, pageSize })
    ]);

    let payments = paymentsResult.payments;

    // Filter by status if requested
    if (statusFilter && statusFilter !== 'all') {
      payments = payments.filter(
        (p) => (p.status_label || '').toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Filter by disbursement method if requested
    if (methodFilter && methodFilter !== 'all') {
      payments = payments.filter(
        (p) => (p.method || '').toLowerCase() === methodFilter
      );
    }

    // Filter payments by search term if matching payment ID, method, or amount
    if (searchTerm) {
      payments = payments.filter((p) => {
        const idMatch = p.payment_id.toLowerCase().includes(searchTerm);
        const methodMatch = (p.method || '').toLowerCase().includes(searchTerm);
        const amountMatch = String(p.amount || '').includes(searchTerm);
        return idMatch || methodMatch || amountMatch;
      });
    }

    // 2. If consignments are requested, load and map consignments for the top 3 visible payment batches
    let recentConsignments: SteadfastConsignment[] = [];
    if (includeConsignments && payments.length > 0) {
      const topBatchIds = payments.slice(0, 3).map((p) => p.payment_id);
      try {
        const batchDetails = await Promise.all(
          topBatchIds.map((id) => getPaymentDetails(id).catch(() => null))
        );

        const allConsignments: SteadfastConsignment[] = [];
        batchDetails.forEach((batch) => {
          if (batch && Array.isArray(batch.consignments)) {
            // Attach payment parent id to each consignment for reference
            batch.consignments.forEach((c) => {
              (c as any).payment_id = batch.payment_id;
              (c as any).payment_status = batch.status_label;
            });
            allConsignments.push(...batch.consignments);
          }
        });

        // Map consignments to OMS orders
        recentConsignments = await mapConsignmentsToOmsOrders(allConsignments);

        // Populate consignment count into each payment item
        payments = payments.map((p) => {
          const matchingBatch = batchDetails.find((b) => b?.payment_id === p.payment_id);
          return {
            ...p,
            consignment_count: matchingBatch?.consignments?.length || undefined
          };
        });
      } catch (err) {
        console.warn('[Payments API] Error loading consignments:', err);
      }
    }

    // 3. Compute summary statistics from actual API responses
    const totalDisbursedCod = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalCharges = payments.reduce((sum, p) => sum + (Number(p.charges) || 0), 0);
    const totalNetPayout = payments.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    const totalDueBills = payments.reduce((sum, p) => sum + (Number(p.due_bills) || 0), 0);

    return NextResponse.json({
      success: true,
      balance: balanceResult.current_balance,
      summary: {
        current_balance: balanceResult.current_balance,
        total_disbursed_cod: totalDisbursedCod,
        total_charges: totalCharges,
        total_net_payout: totalNetPayout,
        total_due_bills: totalDueBills,
        total_batches: paymentsResult.pagination.totalCount || payments.length
      },
      payments,
      recentConsignments,
      pagination: paymentsResult.pagination
    });
  } catch (error: any) {
    console.error('[Steadfast Payments API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to retrieve payments from Steadfast Courier'
      },
      { status: 500 }
    );
  }
}
