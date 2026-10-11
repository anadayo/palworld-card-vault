const assert = require('assert');
const { parsePriceGuide, mergePreviousData, calculateMercariAverage, replaceCatalog } = require('./update-prices');

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

const merged = mergePreviousData(cards, [{ productId: '713906', nameJa: '警報ベル', color: 'Red', dot: '#f00' }]);
assert.equal(merged[0].nameJa, '警報ベル');
assert.equal(merged[0].color, 'Red');

const market = calculateMercariAverage([
  { price: 1000 }, { price: 1100 }, { price: 1200 }, { price: 15000 },
]);
assert.deepEqual(market, { average: 1100, sampleCount: 3 });
assert.equal(calculateMercariAverage([{ price: 1000 }, { price: 1100 }]), null);

const source = "const PRICE_DATA_META={updatedAt:'old',source:'TCGplayer'};\nconst cards=[\n];";
const replaced = replaceCatalog(source, cards);
assert.match(replaced, /Alarm Bell/);
assert.doesNotMatch(replaced, /updatedAt:'old'/);
console.log('Palworld price updater tests passed');
