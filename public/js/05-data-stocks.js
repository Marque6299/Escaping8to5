/* RAT RACE · 05-data-stocks.js · RR.data.stocks — the 8-stock universe (§1.9). Fictional companies only (no real brands). */
(function (RR) {
  'use strict';

  RR.data.stocks = [
    { symbol: 'UTLX', name: 'Unity Power & Water', sector: 'UTILITIES',        price: 48.00,  mu: 0.06, sigma: 0.15, dpsAnnual: 2.40 },
    { symbol: 'STPL', name: 'Staple Foods Co',     sector: 'CONSUMER_STAPLES', price: 62.00,  mu: 0.07, sigma: 0.16, dpsAnnual: 2.10 },
    { symbol: 'BNKR', name: 'Bankroll Financial',  sector: 'FINANCIALS',       price: 35.00,  mu: 0.08, sigma: 0.25, dpsAnnual: 1.20 },
    { symbol: 'MEDX', name: 'MedixCare',           sector: 'HEALTHCARE',       price: 90.00,  mu: 0.09, sigma: 0.24, dpsAnnual: 1.00 },
    { symbol: 'ENRG', name: 'Terra Energy',        sector: 'ENERGY',           price: 28.00,  mu: 0.08, sigma: 0.38, dpsAnnual: 1.60 },
    { symbol: 'RETL', name: 'Cartwheel Retail',    sector: 'CONSUMER',         price: 40.00,  mu: 0.07, sigma: 0.30, dpsAnnual: 0.80 },
    { symbol: 'NOVA', name: 'Nova Robotics',       sector: 'TECH',             price: 120.00, mu: 0.14, sigma: 0.45, dpsAnnual: 0.00 },
    { symbol: 'SPKL', name: 'Sparkle Labs',        sector: 'SPECULATIVE',      price: 4.50,   mu: 0.18, sigma: 0.80, dpsAnnual: 0.00 }
  ];
  RR.data.sectors = ['UTILITIES', 'CONSUMER_STAPLES', 'FINANCIALS', 'HEALTHCARE', 'ENERGY', 'CONSUMER', 'TECH', 'SPECULATIVE'];
})(window.RR);
