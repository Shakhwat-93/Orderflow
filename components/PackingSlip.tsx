import React from 'react';

interface PackingSlipProps {
  orders?: any[];
}

export const PackingSlip: React.FC<PackingSlipProps> = ({ orders = [] }) => {
  if (!orders || orders.length === 0) return null;

  return (
    <div className="packing-slip-print-container">
      {orders.map((order, index) => (
        <div key={order.id || index} className="label-page">
          <div className="label-header">
            <div className="order-id">
              <span>ORDER ID:</span>
              <strong>#{order.id}</strong>
            </div>
            <div className="courier-badge">
              {order.courier_name || 'STEADFAST'}
            </div>
          </div>

          <div className="label-section recipient-box">
            <div className="section-title">RECIPIENT / DELIVERY TO:</div>
            <div className="customer-name">{order.customer_name}</div>
            <div className="customer-phone">{order.phone}</div>
            <div className="customer-address">{order.address}</div>
          </div>

          <div className="label-section products-box">
            <div className="section-title">ORDER CONTENTS:</div>
            <table className="product-table">
              <thead>
                <tr>
                  <th>PRODUCT</th>
                  <th className="text-right">QTY</th>
                </tr>
              </thead>
              <tbody>
                {((Array.isArray(order.order_lines_payload) && order.order_lines_payload.length > 0) || (Array.isArray(order.ordered_items) && order.ordered_items.length > 0)) ? (
                  ((Array.isArray(order.order_lines_payload) && order.order_lines_payload.length > 0) ? order.order_lines_payload : order.ordered_items).map((item: any, i: number) => (
                    <tr key={i}>
                      <td>{typeof item === 'object' ? (item.name || item.product_name || item.title || order.product_name) : (String(item) || order.product_name)}</td>
                      <td className="text-right">{typeof item === 'object' ? (Number(item.quantity ?? item.qty) || 1) : 1}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td>{order.product_name}</td>
                    <td className="text-right">{order.quantity || 1}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="label-footer">
            <div className="footer-left">
              STEADFAST ID: <strong>{order.courier_assigned_id || 'SYNC REQUIRED'}</strong>
              <div className="tracking-ref mt-1">TRACKING: {order.tracking_id || 'N/A'}</div>
            </div>
            <div className="footer-right">
              {new Date().toLocaleDateString()}
            </div>
          </div>
          
          {/* Print Separator */}
          <div className="print-separator"></div>
        </div>
      ))}
    </div>
  );
};
