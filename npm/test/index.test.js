const assert = require('node:assert/strict');
const { test } = require('node:test');
const { TaxPreFlight } = require('../dist/index.js');

const overThresholdIntent = (claim) => ({
    state: 'NY',
    sales_data: { amount: 600000, transactions: 0 },
    ...(claim === undefined ? {} : { claimed_collects_tax: claim }),
});

test('blocks an over-threshold sale with a structured no-tax claim', () => {
    const result = TaxPreFlight.audit(overThresholdIntent(false));

    assert.equal(result.allowed, false);
    assert.match(result.blocks[0], /Nexus threshold exceeded in NY/);
});

test('allows an over-threshold sale with a structured tax-collection claim', () => {
    const result = TaxPreFlight.audit(overThresholdIntent(true));

    assert.equal(result.allowed, true);
    assert.deepEqual(result.blocks, []);
});

test('keeps the legacy no-tax claim working for over-threshold sales', () => {
    const result = TaxPreFlight.audit({
        ...overThresholdIntent(),
        tax_decision: 'no_tax',
    });

    assert.equal(result.allowed, false);
    assert.match(result.blocks[0], /Nexus threshold exceeded in NY/);
});

test('allows a below-threshold sale with a structured no-tax claim', () => {
    const result = TaxPreFlight.audit({
        ...overThresholdIntent(false),
        sales_data: { amount: 100, transactions: 0 },
    });

    assert.equal(result.allowed, true);
    assert.deepEqual(result.blocks, []);
});
