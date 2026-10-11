const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_FILE = path.join(ROOT, 'cards-us.json');
const META_FILE = path.join(ROOT, 'market-meta.json');
const REPORT_FILE = path.join(ROOT, 'price-update-report-us.json');
const MINIMUM_CARD_COUNT = Number(process.env.MINIMUM_CARD_COUNT || 200);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 350);
const US_CARD_LIMIT = Number(process.env.US_CARD_LIMIT || 80);
const USER_AGENT = 'Mozilla/5.0 (compatible; PalworldCardVaultPriceUpdater/2.0; +https://github.com/anadayo/palworld-card-vault)';
const TODAY_JST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const TCGCSV_CATEGORY_ID = 91;
const GROUPS = [
  [24842, 'BP01', 'Dawn of Palpagos'],
  [24843, 'TD01', 'Dawn of Palpagos Red/Blue'],
  [24844, 'TD02', 'Dawn of Palpagos Green/Purple'],
  [24850, 'BP02', 'Legends Awaken'],
  [24851, 'PROMO', 'Palworld Promo Cards'],
  [24852, 'TD03', 'Eternal Ascent Red/Green'],
  [24853, 'TD04', 'Eternal Ascent Blue/Purple'],
  [24876, 'PROTOTYPE', 'Palworld Prototype Cards'],
].map(([id, code, name]) => ({ id, code, name }));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function decodeHtml(value = '') {
  const named = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ' };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function textOnly(html = '') {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function inferColor(text) {
  const value = text.match(/\b(Red|Blue|Green|Purple)\b/i)?.[1];
  if (!value) return { color: 'Neutral', dot: '#8c9aa0' };
  const color = value[0].toUpperCase() + value.slice(1).toLowerCase();
  return { color, dot: { Red: '#ff6557', Blue: '#55c6e8', Green: '#60d98a', Purple: '#b983ed' }[color] };
}

function parsePriceGuide(html, set) {
  const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
  const cards = [];
  for (const row of rows) {
    const productMatch = row.match(/(?:https?:\/\/www\.tcgplayer\.com)?\/product\/(\d+)(?:\/[^"'?<]*)?/i);
    if (!productMatch) continue;
    const productId = productMatch[1];
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => textOnly(match[1]));
    const rowText = textOnly(row);
    const cardNo = rowText.match(/\b[A-Z]{1,8}\d{0,3}-[A-Z0-9]{1,10}(?:-[A-Z0-9]+)?\b/i)?.[0]?.toUpperCase();
    const prices = [...rowText.matchAll(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g)].map(match => Number(match[1]));
    if (!cardNo || !prices.length) continue;
    const productLinks = [...row.matchAll(/<a\b[^>]*href=["'][^"']*\/product\/\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(match => textOnly(match[1])).filter(Boolean);
    const imageAlt = row.match(/<img\b[^>]*alt=["']([^"']+)["']/i)?.[1];
    const name = productLinks.sort((a, b) => b.length - a.length)[0] || decodeHtml(imageAlt || '') || cardNo;
    const numberCell = cells.findIndex(cell => cell.includes(cardNo));
    const sub = numberCell > 0 ? cells[numberCell - 1] : (cells.find(cell => /^(SP|OSR|RR|R|U|C|Promo|Common|Rare)/i.test(cell)) || 'Card');
    cards.push({
      id: `${cardNo}-${productId}`,
      cardNo,
      productId,
      name,
      set: set.name,
      setCode: set.code,
      sub,
      ...inferColor(rowText),
      marketPrice: prices[0],
      image: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
      tcgUrl: `https://www.tcgplayer.com/product/${productId}/`,
    });
  }
  return [...new Map(cards.map(card => [card.productId, card])).values()];
}

async function fetchHtml(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(5000 * attempt);
    }
  }
  throw new Error(`${label}: ${lastError.message}`);
}

async function fetchJson(url, label) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.success === false) throw new Error(`${label}: ${JSON.stringify(data.errors || [])}`);
  return data.results || [];
}

function extendedValue(product, key) {
  return product.extendedData?.find(item => item.name === key)?.value || '';
}

function parseTcgCsvGroup(products, prices, group) {
  const pricesByProduct = new Map();
  for (const price of prices) {
    if (!Number.isFinite(Number(price.marketPrice)) || Number(price.marketPrice) <= 0) continue;
    const current = pricesByProduct.get(String(price.productId));
    if (!current || Number(price.marketPrice) > Number(current.marketPrice)) pricesByProduct.set(String(price.productId), price);
  }
  return products.map(product => {
    const cardNo = String(extendedValue(product, 'Number')).trim().toUpperCase();
    const price = pricesByProduct.get(String(product.productId));
    if (!cardNo || !price) return null;
    const colorInfo = inferColor(extendedValue(product, 'Color'));
    return {
      id: `${cardNo}-${product.productId}`,
      cardNo,
      productId: String(product.productId),
      name: product.name,
      set: group.name,
      setCode: group.code,
      sub: extendedValue(product, 'Rarity') || price.subTypeName || 'Card',
      ...colorInfo,
      marketPrice: Number(price.marketPrice),
      image: `https://tcgplayer-cdn.tcgplayer.com/product/${product.productId}_in_1000x1000.jpg`,
      tcgUrl: product.url || `https://www.tcgplayer.com/product/${product.productId}/`,
    };
  }).filter(Boolean);
}

function updateMeta(market, value) {
  const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, 'utf8')) : {};
  meta[market] = value;
  fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`);
}

async function main() {
  const allCards = [];
  const setReport = [];
  for (const group of GROUPS) {
    const base = `https://tcgcsv.com/tcgplayer/${TCGCSV_CATEGORY_ID}/${group.id}`;
    const [products, prices] = await Promise.all([
      fetchJson(`${base}/products`, `${group.code} products`),
      fetchJson(`${base}/prices`, `${group.code} prices`),
    ]);
    const cards = parseTcgCsvGroup(products, prices, group);
    allCards.push(...cards);
    setReport.push({ set: group.code, cards: cards.length, groupId: group.id });
    console.log(`${group.code}: ${cards.length} cards`);
    await sleep(REQUEST_DELAY_MS);
  }
  const uniqueCards = [...new Map(allCards.map(card => [card.productId, card])).values()];
  if (uniqueCards.length < MINIMUM_CARD_COUNT) {
    throw new Error(`Safety stop: parsed ${uniqueCards.length} cards; expected at least ${MINIMUM_CARD_COUNT}`);
  }
  const cards = uniqueCards
    .sort((a, b) => b.marketPrice - a.marketPrice)
    .slice(0, US_CARD_LIMIT)
    .sort((a, b) => a.setCode.localeCompare(b.setCode) || a.cardNo.localeCompare(b.cardNo));
  fs.writeFileSync(CATALOG_FILE, `${JSON.stringify(cards, null, 2)}\n`);
  updateMeta('us', { updatedAt: TODAY_JST, source: 'TCGCSV / TCGplayer daily market data', cardCount: cards.length });
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify({ date: TODAY_JST, parsed: uniqueCards.length, published: cards.length, sets: setReport }, null, 2)}\n`);
  console.log(`Updated ${cards.length} US Palworld cards for ${TODAY_JST}`);
}

module.exports = { parsePriceGuide, parseTcgCsvGroup, inferColor };
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
