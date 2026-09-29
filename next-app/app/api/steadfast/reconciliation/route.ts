import { NextRequest, NextResponse } from 'next/server';
import { fetchReconciliationData } from '@/lib/steadfast';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const forceRefresh = searchParams.get('forceRefresh') === 'true' || searchParams.get('refresh') === 'true';
    const maxBatches = Math.min(30, Math.max(5, parseInt(searchParams.get('maxBatches') || '15', 10)));

    const result = await fetchReconciliationData({ forceRefresh, maxBatches });

    if (!result.success && result.error) {
      return NextResponse.json(
        { success: false, error: result.error, summary: result.summary, records: [], coverage: result.coverage },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API /api/steadfast/reconciliation error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error during payment reconciliation.'
      },
      { status: 500 }
    );
  }
}
