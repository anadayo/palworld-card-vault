const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_FILE = path.join(ROOT, 'cards-jp.json');
const META_FILE = path.join(ROOT, 'market-meta.json');
const STATE_FILE = path.join(ROOT, 'japan-price-state.json');
const REPORT_FILE = path.join(ROOT, 'price-update-report-jp.json');
const JAPAN_CARD_LIST_URL = 'https://palworld-official-cardgame.com/cardlist/';
const JAPAN_CARD_API_URL = 'https://palworld-official-cardgame.com/manage/card-list-user/list';
const JAPAN_CARD_IMAGE_BASE = 'https://palworld-official-cardgame.com/wordpress/wp-content/images/cardlist/';
const MERCARI_SEARCH_URL = 'https://jp.mercari.com/search';
const MINIMUM_CARD_COUNT = Number(process.env.MINIMUM_JAPAN_CARD_COUNT || 200);
const BATCH_SIZE = Number(process.env.JAPAN_PRICE_BATCH_SIZE || 30);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 2500);
const USER_AGENT = 'Mozilla/5.0 (compatible; PalworldCardVaultJapanUpdater/1.0; +https://github.com/anadayo/palworld-card-vault)';
const TODAY_JST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

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
    .replace(/\s+/g, ' ').trim();
}

function absoluteUrl(value, base) {
  try { return new URL(decodeHtml(value), base).toString(); } catch { return ''; }
}

function parseJapaneseCardList(html) {
  const links = [...html.matchAll(/<a\b[^>]*href=["'][^"']*\/cardlist\/detail\?id=[^"']+["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const cards = [];
  for (const link of links) {
    const body = link[1];
    const text = textOnly(body);
    const jpCardNo = text.match(/\b(?:BP|TD|SS|PR)\d{2}-\d{3}(?:[A-Z]{1,4})?\b/i)?.[0]?.toUpperCase();
    if (!jpCardNo) continue;
    const imageMatch = body.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["'][^>]*>/i);
    const altMatch = body.match(/<img\b[^>]*alt=["']([^"']+)["'][^>]*>/i);
    const rarity = text.match(/\b(SSS|SSP|OSR|TSP|TSR|SP|SR|RR|TD|PR|R|U|C)\b/)?.[1] || '';
    const withoutNumber = text.replace(jpCardNo, ' ').replace(new RegExp(`\\b${rarity}\\b`), ' ').replace(/MORE|詳しく見る/g, ' ').replace(/\s+/g, ' ').trim();
    const nameJa = decodeHtml(altMatch?.[1] || withoutNumber).trim();
    const imageJa = absoluteUrl(imageMatch?.[1] || '', JAPAN_CARD_LIST_URL);
    if (!nameJa || !imageJa) continue;
    cards.push({ id: `JP-${jpCardNo}`, jpCardNo, nameJa, imageJa, sub: rarity });
  }
  return [...new Map(cards.map(card => [card.jpCardNo, card])).values()];
}

function parseJapaneseApiItems(items) {
  const colorMap = {
    '赤': ['Red', '#ff6557'], '青': ['Blue', '#55c6e8'],
    '緑': ['Green', '#60d98a'], '紫': ['Purple', '#b983ed'],
  };
  return items.map(item => {
    const jpCardNo = String(item.card_number || '').trim().toUpperCase();
    const nameJa = String(item.card_name || '').trim();
    const picture = String(item.picture || '').trim();
    if (!jpCardNo || !nameJa || !picture) return null;
    const [color, dot] = colorMap[item.color] || ['Neutral', '#8c9aa0'];
    return {
      id: `JP-${jpCardNo}`,
      jpCardNo,
      nameJa,
      imageJa: absoluteUrl(picture, JAPAN_CARD_IMAGE_BASE),
      sub: String(item.rare || '').trim(),
      set: String(item.expansion_name || '').trim(),
      setCode: String(item.expansion || '').trim(),
      color,
      dot,
    };
  }).filter(Boolean);
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

function parseMercariSold(html, card) {
  const script = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!script) return [];
  let data;
  try { data = JSON.parse(decodeHtml(script)); } catch { return []; }
  const candidates = [];
  walk(data, value => {
    const title = String(value.name || value.itemName || value.title || '').trim();
    const price = Number(value.price || value.itemPrice || value.sellingPrice);
    const id = String(value.id || value.itemId || '').trim();
    if (title && price > 0 && id) candidates.push({ title, price, id, soldAt: value.soldAt || value.updatedAt || value.createdAt || '' });
  });
  const number = card.jpCardNo.toUpperCase();
  const blocked = /(BOX|ボックス|パック|セット|まとめ|引退品|デッキ|スリーブ|プレイマット)/i;
  return [...new Map(candidates
    .filter(sale => sale.title.toUpperCase().includes(number) && !blocked.test(sale.title))
    .map(sale => [sale.id, sale])).values()]
    .slice(0, 20);
}

function calculateMercariAverage(sales) {
  const prices = sales.map(sale => Number(sale.price)).filter(price => Number.isFinite(price) && price > 0).sort((a, b) => a - b);
  if (prices.length < 3) return null;
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const filtered = prices.filter(price => price >= median * 0.4 && price <= median * 2.5);
  if (filtered.length < 3) return null;
  return { average: Math.round(filtered.reduce((sum, price) => sum + price, 0) / filtered.length / 10) * 10, sampleCount: filtered.length };
}

function calculateMercariMarket(sales) {
  if (!sales.length) return null;
  const average = calculateMercariAverage(sales);
  return {
    mercariLatestPrice: Number(sales[0].price),
    mercariLatestAt: sales[0].soldAt || TODAY_JST,
    mercariAverage: average?.average || null,
    mercariSampleCount: average?.sampleCount || sales.length,
    mercariUpdatedAt: TODAY_JST,
  };
}

function buildMercariSearchUrl(card) {
  const url = new URL(MERCARI_SEARCH_URL);
  url.searchParams.set('keyword', `${card.nameJa} ${card.jpCardNo} パルワールド カード`);
  url.searchParams.set('status', 'sold_out');
  url.searchParams.set('sort', 'created_time');
  url.searchParams.set('order', 'desc');
  return url.toString();
}

async function fetchHtml(url, label) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html' } });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.text();
}

async function fetchJapaneseCatalog() {
  const cards = [];
  let page = 1;
  let total = Infinity;
  while (cards.length < total) {
    const url = new URL(JAPAN_CARD_API_URL);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '100');
    url.searchParams.set('sort', 'newest');
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
    if (!response.ok) throw new Error(`Japanese official card API: HTTP ${response.status}`);
    const data = await response.json();
    const items = parseJapaneseApiItems(data.items || []);
    total = Number(data.total || 0);
    cards.push(...items);
    if (!items.length || page > 20) break;
    page += 1;
    await sleep(REQUEST_DELAY_MS);
  }
  return [...new Map(cards.map(card => [card.jpCardNo, card])).values()];
}

function mergeCatalog(officialCards, previousCards) {
  const previous = new Map(previousCards.map(card => [card.jpCardNo, card]));
  return officialCards.map(card => {
    const old = previous.get(card.jpCardNo) || {};
    return {
      ...old,
      ...card,
      color: card.color || old.color || 'Neutral',
      dot: card.dot || old.dot || '#8c9aa0',
      mercariAverage: old.mercariAverage || null,
      mercariSampleCount: old.mercariSampleCount || 0,
      mercariUpdatedAt: old.mercariUpdatedAt || '',
      mercariLatestPrice: old.mercariLatestPrice || null,
      mercariLatestAt: old.mercariLatestAt || '',
    };
  });
}

function updateMeta(value) {
  const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, 'utf8')) : {};
  meta.jp = value;
  fs.writeFileSync(META_FILE, `${JSON.stringify(meta, null, 2)}\n`);
}

async function main() {
  const previousCards = fs.existsSync(CATALOG_FILE) ? JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')) : [];
  const officialCards = await fetchJapaneseCatalog();
  if (officialCards.length < MINIMUM_CARD_COUNT) {
    throw new Error(`Safety stop: parsed ${officialCards.length} Japanese cards; expected at least ${MINIMUM_CARD_COUNT}`);
  }
  const cards = mergeCatalog(officialCards, previousCards);
  const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { cursor: 0 };
  const start = Number(state.cursor || 0) % cards.length;
  const targets = Array.from({ length: Math.min(BATCH_SIZE, cards.length) }, (_, index) => cards[(start + index) % cards.length]);
  const report = [];
  for (const card of targets) {
    try {
      const html = await fetchHtml(buildMercariSearchUrl(card), card.jpCardNo);
      const sales = parseMercariSold(html, card);
      const market = calculateMercariMarket(sales);
      if (market) Object.assign(card, market);
      report.push({ card: card.jpCardNo, sales: sales.length, updated: Boolean(market) });
    } catch (error) {
      report.push({ card: card.jpCardNo, sales: 0, updated: false, error: error.message });
    }
    await sleep(REQUEST_DELAY_MS);
  }
  cards.sort((a, b) => a.jpCardNo.localeCompare(b.jpCardNo));
  fs.writeFileSync(CATALOG_FILE, `${JSON.stringify(cards, null, 2)}\n`);
  fs.writeFileSync(STATE_FILE, `${JSON.stringify({ cursor: (start + targets.length) % cards.length, updatedAt: TODAY_JST }, null, 2)}\n`);
  updateMeta({ updatedAt: TODAY_JST, source: 'Mercari sold listings / Japanese official catalog', cardCount: cards.length, checkedThisRun: targets.length });
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify({ date: TODAY_JST, catalogCards: cards.length, imageCount: cards.filter(card => card.imageJa).length, checked: targets.length, updated: report.filter(item => item.updated).length, cards: report }, null, 2)}\n`);
  console.log(`Updated Japanese catalog (${cards.length} cards, ${targets.length} Mercari checks)`);
}

module.exports = { parseJapaneseCardList, parseJapaneseApiItems, parseMercariSold, calculateMercariAverage, calculateMercariMarket, buildMercariSearchUrl, mergeCatalog };
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
