const assert = require('assert');
const {
  parseJapaneseCardList,
  parseJapaneseApiItems,
  parseMercariSold,
  calculateMercariAverage,
  calculateMercariMarket,
  buildMercariSearchUrl,
  mergeCatalog,
} = require('./update-japan-prices');

const officialFixture = `<a href="/cardlist/detail?id=25"><img src="/images/cards/BP01-025OSR.png" alt="竜を呼ぶ声 - オコチョ"><span>BP01-025OSR</span><span>OSR</span></a>`;
const cards = parseJapaneseCardList(officialFixture);
assert.equal(cards.length, 1);
assert.equal(cards[0].jpCardNo, 'BP01-025OSR');
assert.equal(cards[0].nameJa, '竜を呼ぶ声 - オコチョ');
assert.match(cards[0].imageJa, /^https:\/\/palworld-official-cardgame\.com\/images\/cards\//);

const apiCards = parseJapaneseApiItems([{ card_number: 'BP01-025OSR', card_name: '竜を呼ぶ声 - オコチョ', picture: 'BP01/BP01-025OSR.png', rare: 'OSR', expansion: 'BP01', expansion_name: '第一弾', color: '青' }]);
assert.equal(apiCards.length, 1);
assert.equal(apiCards[0].nameJa, '竜を呼ぶ声 - オコチョ');
assert.equal(apiCards[0].color, 'Blue');
assert.equal(apiCards[0].imageJa, 'https://palworld-official-cardgame.com/wordpress/wp-content/images/cardlist/BP01/BP01-025OSR.png');

const nextData = { props: { items: [
  { id: 'm1', name: '竜を呼ぶ声 オコチョ BP01-025OSR パルワールドカード', price: 1000, soldAt: '2026-10-11' },
  { id: 'm2', name: 'BP01-025OSR オコチョ', price: 1100 },
  { id: 'm3', name: 'BP01-025OSR オコチョ', price: 1200 },
  { id: 'm4', name: 'BP01-025OSR 1BOX', price: 9000 },
  { id: 'm5', name: '英語版 EBP01-025', price: 800 },
] } };
const mercariFixture = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
const sales = parseMercariSold(mercariFixture, cards[0]);
assert.equal(sales.length, 3);
assert.deepEqual(calculateMercariAverage(sales), { average: 1100, sampleCount: 3 });
const market = calculateMercariMarket([sales[0]]);
assert.equal(market.mercariLatestPrice, 1000);
assert.equal(market.mercariLatestAt, '2026-10-11');
assert.equal(market.mercariAverage, null);
assert.equal(market.mercariSampleCount, 1);
const search = new URL(buildMercariSearchUrl(cards[0]));
assert.equal(search.searchParams.get('status'), 'sold_out');
assert.match(search.searchParams.get('keyword'), /竜を呼ぶ声/);
assert.match(search.searchParams.get('keyword'), /BP01-025OSR/);
const merged = mergeCatalog(cards, [{ jpCardNo: 'BP01-025OSR', mercariAverage: 1100, imageJa: 'old' }]);
assert.equal(merged[0].mercariAverage, 1100);
assert.notEqual(merged[0].imageJa, 'old');
console.log('Japan price updater tests passed');
