const { MICRO, PUBLISHER_SHARE_BPS, MIN_WITHDRAW_CENTS } = require('../config/constants');
const { fail } = require('./errors');

// Network revenue -> publisher 60% / platform 40%. Rounding dust always stays with the platform.
function splitRevenue(grossMicro) {
  if (!Number.isSafeInteger(grossMicro) || grossMicro < 0 || grossMicro > 1e11) throw new Error('Invalid revenue amount');
  const publisher = Math.floor((grossMicro * PUBLISHER_SHARE_BPS) / 10000);
  return { publisher, platform: grossMicro - publisher };
}

// $5-$9.99 = 5%, exactly $10 = 3%, above $10 = 1% (charged on the gross amount)
const feeBps = (cents) => (cents < 1000 ? 500 : cents === 1000 ? 300 : 100);
function withdrawalQuote(cents) {
  if (!Number.isInteger(cents) || cents < MIN_WITHDRAW_CENTS || cents > 1e7) fail(400, 'Minimum payout is $5.');
  const grossMicro = cents * 10000;
  const feeMicro = Math.round((grossMicro * feeBps(cents)) / 10000);
  return { grossMicro, feeMicro, netMicro: grossMicro - feeMicro };
}
const usd = (micro) => (micro || 0) / MICRO;
module.exports = { splitRevenue, withdrawalQuote, usd, feeBps };
