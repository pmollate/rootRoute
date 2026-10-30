import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, nextStep, receive, stepTs, wmsOrderId } from './store.mjs';

const ORDER = { orderRef: 'email:42', clientId: 'C025', warehouseId: 'W4', carrier: 'E', commitment: 'next_day',
  promiseDate: '2026-10-31', destination: { city: 'Boston', state: 'MA', zip: '02110' }, items: [{ sku: 'HX-616', qty: 45 }] };

test('the WMS order number is WMS- and the email id in six digits', () => {
  assert.equal(wmsOrderId('email:42'), 'WMS-000042');
  assert.equal(wmsOrderId('order:42'), null);
});

test('a new order is 201, the same orderRef again 200 with the same number, a bad body 400', () => {
  const orders = [];
  assert.deepEqual(receive(orders, ORDER, '2026-10-30 09:00'), { status: 201, body: { wmsOrderId: 'WMS-000042' } });
  assert.deepEqual(receive(orders, ORDER, '2026-10-30 09:05'), { status: 200, body: { wmsOrderId: 'WMS-000042' } });
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0].steps, []);
  assert.equal(receive(orders, { ...ORDER, items: [] }, '2026-10-30 09:00').status, 400);
  assert.equal(receive(orders, { orderRef: 'email:7' }, '2026-10-30 09:00').status, 400);
});

test('steps go picked, picked_up, in_transit, out_for_delivery, delivered, then none', () => {
  const o = { ...ORDER, steps: [] };
  for (const step of ['picked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered']) {
    assert.equal(nextStep(o), step);
    o.steps.push({ event: step, ts: '2026-10-30 10:00' });
  }
  assert.equal(nextStep(o), null);
});

test('a step is stamped now, never before the last step; a late delivery lands N days after the promise date', () => {
  const o = { ...ORDER, steps: [{ event: 'picked', ts: '2026-10-30 12:00' }] };
  assert.equal(stepTs(o, 'picked_up', 0, '2026-10-30 13:00'), '2026-10-30 13:00');
  assert.equal(stepTs(o, 'picked_up', 0, '2026-10-30 11:00'), '2026-10-30 12:00');
  assert.equal(stepTs(o, 'delivered', 2, '2026-10-30 13:00'), '2026-11-02 14:00');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const past = { ...ORDER, promiseDate: '2026-10-23', steps: [{ event: 'out_for_delivery', ts: '2026-10-30 15:15' }] };
  assert.equal(stepTs(past, 'delivered', 2, '2026-10-30 15:20'), '2026-10-30 15:15');
});
