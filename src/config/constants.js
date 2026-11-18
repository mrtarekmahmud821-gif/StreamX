const num = (v, d, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : d; };
module.exports = {
  MICRO: 1e6,                       // all money is stored as integer micro-USD (1 USD = 1,000,000) - no float errors
  DAY_MS: 86400000,
  PUBLISHER_SHARE_BPS: num(process.env.PUBLISHER_SHARE_BPS, 6000, 0, 10000), // 6000 = publisher keeps 60%, platform 40%
  LOCK_DAYS: num(process.env.EARNINGS_LOCK_DAYS, 5, 0, 60),                  // earnings stay locked this long
  MIN_WITHDRAW_CENTS: 500,
  MAX_OPEN_WITHDRAWALS: 3
};
