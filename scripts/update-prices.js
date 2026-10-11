const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'index.html');
const CATALOG_FILE = path.join(ROOT, 'cards.json');
const REPORT_FILE = path.join(ROOT, 'price-update-report.json');
const MINIMUM_CARD_COUNT = Number(process.env.MINIMUM_CARD_COUNT || 200);
const REQUEST_DELAY_MS = Number(process.env.REQUEST_DELAY_MS || 1200);
const USER_AGENT = 'Mozilla/5.0 (compatible; PalworldCardVaultPriceUpdater/1.0; +https://github.com/anadayo/palworld-card-vault)';
const TODAY_JST = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const SETS = [
  ['BP01', 'Dawn of Palpagos', 'bp01-dawn-of-palpagos'],
  ['TD01', 'Dawn of Palpagos Red/Blue', 'td01-dawn-of-palpagos-red%E2%80%A2blue'],
  ['TD02', 'Dawn of Palpagos Green/Purple', 'td02-dawn-of-palpagos-green%E2%80%A2purple'],
  ['PROMO', 'Promo Cards', 'palworld-promo-cards'],
  ['PROTOTYPE', 'Prototype Cards', 'palworld-prototype-cards'],
].map(([code, name, slug]) => ({
  code,
  name,
  url: `https://www.tcgplayer.com/categories/trading-and-collectible-card-games/palworld-official-card-game/price-guides/${slug}`,
}));

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
      .map(match => textOnly(match[1]))
      .filter(Boolean);
    const imageAlt = row.match(/<img\b[^>]*alt=["']([^"']+)["']/i)?.[1];
    const name = productLinks.sort((a, b) => b.length - a.length)[0] || decodeHtml(imageAlt || '') || cardNo;
    const numberCell = cells.findIndex(cell => cell.includes(cardNo));
    const sub = numberCell > 0 ? cells[numberCell - 1] : (cells.find(cell => /^(SP|OSR|RR|R|U|C|Promo|Common|Rare)/i.test(cell)) || 'Card');
    const colorInfo = inferColor(rowText);

    cards.push({
      id: `${cardNo}-${productId}`,
      cardNo,
      productId,
      name,
      nameJa: '',
      set: set.name,
      setCode: set.code,
      sub,
      ...colorInfo,
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

function readPreviousCards(indexHtml) {
  if (fs.existsSync(CATALOG_FILE)) return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
  const match = indexHtml.match(/const cards=(\[[\s\S]*?\n\s*\]);/);
  if (!match) return [];
  return Function(`return ${match[1]}`)();
}

function mergePreviousData(cards, previousCards) {
  const byProduct = new Map(previousCards.filter(card => card.productId).map(card => [String(card.productId), card]));
  return cards.map(card => {
    const previous = byProduct.get(String(card.productId));
    return {
      ...card,
      nameJa: previous?.nameJa || '',
      color: previous?.color || card.color,
      dot: previous?.dot || card.dot,
    };
  });
}

function replaceCatalog(indexHtml, cards) {
  const serialized = JSON.stringify(cards, null, 2).replace(/^/gm, '    ').trimStart();
  return indexHtml
    .replace(/const PRICE_DATA_META=\{[^;]+\};/, `const PRICE_DATA_META={updatedAt:'${TODAY_JST}',source:'TCGplayer'};`)
    .replace(/const cards=\[[\s\S]*?\n\s*\];/, `const cards=${serialized};`);
}

async function main() {
  const indexHtml = fs.readFileSync(INDEX_FILE, 'utf8');
  const previousCards = readPreviousCards(indexHtml);
  const allCards = [];
  const setReport = [];

  for (const set of SETS) {
    const html = await fetchHtml(set.url, set.code);
    const cards = parsePriceGuide(html, set);
    allCards.push(...cards);
    setReport.push({ set: set.code, cards: cards.length, url: set.url });
    console.log(`${set.code}: ${cards.length} cards`);
    await sleep(REQUEST_DELAY_MS);
  }

  const uniqueCards = [...new Map(allCards.map(card => [card.productId, card])).values()];
  if (uniqueCards.length < MINIMUM_CARD_COUNT) {
    throw new Error(`Safety stop: parsed ${uniqueCards.length} cards; expected at least ${MINIMUM_CARD_COUNT}`);
  }

  const cards = mergePreviousData(uniqueCards, previousCards)
    .sort((a, b) => a.setCode.localeCompare(b.setCode) || a.cardNo.localeCompare(b.cardNo) || b.marketPrice - a.marketPrice);
  fs.writeFileSync(CATALOG_FILE, `${JSON.stringify(cards, null, 2)}\n`);
  fs.writeFileSync(INDEX_FILE, replaceCatalog(indexHtml, cards));
  fs.writeFileSync(REPORT_FILE, `${JSON.stringify({ date: TODAY_JST, total: cards.length, sets: setReport }, null, 2)}\n`);
  console.log(`Updated ${cards.length} Palworld cards for ${TODAY_JST}`);
}

module.exports = { parsePriceGuide, mergePreviousData, replaceCatalog };
if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });
