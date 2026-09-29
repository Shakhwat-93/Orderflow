import { NextRequest, NextResponse } from 'next/server';
import {
  getPaymentDetails,
  mapConsignmentsToOmsOrders
} from '@/lib/steadfast';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const paymentId = decodeURIComponent(id || '').trim();

    if (!paymentId) {
      return NextResponse.json({ success: false, error: 'Payment ID is required' }, { status: 400 });
    }

    const payment = await getPaymentDetails(paymentId);
    if (!payment) {
      return NextResponse.json({ success: false, error: `Payment batch #${paymentId} not found` }, { status: 404 });
    }

    // Map all consignments to OMS orders
    const mappedConsignments = await mapConsignmentsToOmsOrders(payment.consignments || []);

    return NextResponse.json({
      success: true,
      payment: {
        ...payment,
        consignments: mappedConsignments,
        consignment_count: mappedConsignments.length
      }
    });
  } catch (error: any) {
    console.error(`[Steadfast Payment Batch Detail Error]:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to retrieve payment details from Steadfast'
      },
      { status: 500 }
    );
  }
}
