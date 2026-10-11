const assert = require('assert');
const { parsePriceGuide, parseJapaneseCardList, mergePreviousData, mergeJapaneseCatalog, calculateMercariAverage, calculateMercariMarket, replaceCatalog } = require('./update-prices');

const fixture = `
<table><tbody><tr>
  <td><a href="/product/713906/alarm-bell"><img alt="Alarm Bell"></a><a href="/product/713906/alarm-bell">Alarm Bell</a></td>
  <td>Normal</td><td>Common</td><td>EBP01-018</td><td>$0.12</td><td>$0.20</td>
</tr></tbody></table>`;
const set = { code: 'BP01', name: 'Dawn of Palpagos' };
const cards = parsePriceGuide(fixture, set);
assert.equal(cards.length, 1);
assert.equal(cards[0].name, 'Alarm Bell');
assert.equal(cards[0].cardNo, 'EBP01-018');
assert.equal(cards[0].marketPrice, 0.12);
assert.equal(cards[0].productId, '713906');

const japaneseFixture = `<a href="/cardlist/detail?id=25"><img src="/images/cards/BP01-025OSR.png" alt="竜を呼ぶ声 - オコチョ"><span>BP01-025OSR</span><span>OSR</span></a>`;
const japaneseCards = parseJapaneseCardList(japaneseFixture);
assert.equal(japaneseCards.length, 1);
assert.equal(japaneseCards[0].jpCardNo, 'BP01-025OSR');
assert.equal(japaneseCards[0].nameJa, '竜を呼ぶ声 - オコチョ');
assert.match(japaneseCards[0].imageJa, /^https:\/\/palworld-official-cardgame\.com\/images\/cards\//);

const merged = mergePreviousData(cards, [{ productId: '713906', nameJa: '警報ベル', color: 'Red', dot: '#f00' }]);
assert.equal(merged[0].nameJa, '警報ベル');
assert.equal(merged[0].color, 'Red');
const localized = mergeJapaneseCatalog([{ ...cards[0], jpCardNo: 'BP01-025OSR' }], japaneseCards);
assert.equal(localized[0].nameJa, '竜を呼ぶ声 - オコチョ');
assert.ok(localized[0].imageJa);

const market = calculateMercariAverage([
  { price: 1000 }, { price: 1100 }, { price: 1200 }, { price: 15000 },
]);
assert.deepEqual(market, { average: 1100, sampleCount: 3 });
assert.equal(calculateMercariAverage([{ price: 1000 }, { price: 1100 }]), null);
assert.deepEqual(calculateMercariMarket([{ price: 980, soldAt: '2026-10-11' }]), {
  latestPrice: 980, latestAt: '2026-10-11', average: null, sampleCount: 1,
});

const source = "const PRICE_DATA_META={updatedAt:'old',source:'TCGplayer'};\nconst cards=[\n];";
const replaced = replaceCatalog(source, cards);
assert.match(replaced, /Alarm Bell/);
assert.doesNotMatch(replaced, /updatedAt:'old'/);
console.log('Palworld price updater tests passed');
