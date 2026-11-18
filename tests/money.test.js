const test = require('node:test'), assert = require('node:assert');
const { splitRevenue, withdrawalQuote } = require('../src/utils/money');
test('60/40 split, dust stays with platform', () => {
  assert.deepStrictEqual(splitRevenue(1_000_000), { publisher: 600000, platform: 400000 });
  const s = splitRevenue(1_000_001); assert.strictEqual(s.publisher + s.platform, 1_000_001); assert.strictEqual(s.publisher, 600000);
});
test('withdrawal fee examples from the spec', () => {
  const f = (c) => withdrawalQuote(c).feeMicro / 1e6;
  assert.strictEqual(f(500), 0.25); assert.strictEqual(f(800), 0.4); assert.strictEqual(f(1000), 0.3); assert.strictEqual(f(2000), 0.2);
  assert.strictEqual(withdrawalQuote(500).netMicro / 1e6, 4.75);
});
test('below minimum rejected', () => assert.throws(() => withdrawalQuote(499)));
