const test = require('node:test');
const assert = require('node:assert/strict');

const pricing = require('../lib/pricing');
const invoice = require('../lib/invoice');
const reports = require('../lib/reports');
const config = require('../config');

function billedOrder(items, coupon) {
  const billed = pricing.computeTotals(items, coupon);
  return {
    id: 1001,
    date: '2021-11-01',
    customer: 'Walk-in',
    paymentMode: 'cash',
    status: 'completed',
    items,
    coupon,
    subtotal: billed.subtotal,
    discount: billed.discount,
    tax: billed.tax,
    total: billed.total
  };
}

test('invoice uses the billed HSN GST slab and split', () => {
  const order = billedOrder([{ id: 1, sku: 'GRN-001', name: 'Rice', hsn: '1006', price: 100, qty: 1 }], '');
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(order.tax, 5);
  assert.equal(order.total, 105);
  assert.deepEqual([printed.rows[0].gstPercent, printed.tax, printed.cgst, printed.sgst, printed.total],
    [5, 5, 2.5, 2.5, 105]);
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('invoice applies the billed SAVE10 cap before GST', () => {
  const order = billedOrder([{ id: 8, sku: 'BEV-001', name: 'Tea', hsn: '0902', price: 2000, qty: 1 }], 'SAVE10');
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual([order.discount, order.tax, order.total], [150, 333, 2183]);
  assert.deepEqual([printed.discount, printed.tax, printed.total], [150, 333, 2183]);
});

test('reconciliation matches billed GST when totals match', () => {
  const order = billedOrder([{ id: 8, sku: 'BEV-001', name: 'Tea', hsn: '0902', price: 1000, qty: 1 }], 'SAVE10');
  const reconciliation = reports.getGstReconciliation({ orders: [order] });

  assert.deepEqual([order.discount, order.tax, order.total], [100, 162, 1062]);
  assert.deepEqual([
    reconciliation.rows[0].invoiceDiscount,
    reconciliation.rows[0].invoiceTax,
    reconciliation.rows[0].invoiceTotal
  ], [100, 162, 1062]);
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.rows[0].matched, true);
  assert.equal(reconciliation.rows[0].delta, 0);
});

test('invoice should match the billed HSN GST and total', () => {
  const order = billedOrder([{ id: 1, sku: 'GRN-001', name: 'Rice', hsn: '1006', price: 100, qty: 1 }], '');
  const printed = invoice.computeInvoiceFigures(order);

  assert.equal(printed.rows[0].gstPercent, 5);
  assert.deepEqual([printed.tax, printed.cgst, printed.sgst, printed.total], [5, 2.5, 2.5, 105]);
  assert.doesNotMatch(invoice.render(order), /Accountant Reconciliation Notice/);
});

test('invoice should match the billed coupon cap, GST, and total', () => {
  const order = billedOrder([{ id: 8, sku: 'BEV-001', name: 'Tea', hsn: '0902', price: 2000, qty: 1 }], 'SAVE10');
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual([printed.discount, printed.tax, printed.total], [150, 333, 2183]);
  assert.equal(printed.rows[0].lineTax, 333);
});

test('invoice keeps billed figures when a coupon is later disabled', () => {
  const order = billedOrder([{ id: 8, sku: 'BEV-001', name: 'Tea', hsn: '0902', price: 1000, qty: 1 }], 'SAVE10');
  const wasActive = config.coupons.SAVE10.active;
  try {
    config.coupons.SAVE10.active = false;
    const printed = invoice.computeInvoiceFigures(order);
    assert.deepEqual([printed.discount, printed.tax, printed.total, printed.rows[0].lineTax],
      [100, 162, 1062, 162]);
  } finally {
    config.coupons.SAVE10.active = wasActive;
  }
});
