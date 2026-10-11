const assert = require('assert');
const { parsePriceGuide, parseTcgCsvGroup, inferColor } = require('./update-prices');

const fixture = `
<table><tbody><tr>
  <td><a href="/product/713906/alarm-bell"><img alt="Alarm Bell"></a><a href="/product/713906/alarm-bell">Alarm Bell</a></td>
  <td>Normal</td><td>Common</td><td>EBP01-018</td><td>$0.12</td><td>$0.20</td>
</tr></tbody></table>`;
const cards = parsePriceGuide(fixture, { code: 'BP01', name: 'Dawn of Palpagos' });
assert.equal(cards.length, 1);
assert.equal(cards[0].name, 'Alarm Bell');
assert.equal(cards[0].cardNo, 'EBP01-018');
assert.equal(cards[0].marketPrice, 0.12);
assert.equal(cards[0].productId, '713906');
assert.deepEqual(inferColor('A Purple card'), { color: 'Purple', dot: '#b983ed' });
const parsed = parseTcgCsvGroup([{ productId: 713879, name: 'Jormuntide Ignis', url: 'https://www.tcgplayer.com/product/713879/', extendedData: [{ name: 'Number', value: 'EBP01-001' }, { name: 'Rarity', value: 'RR' }, { name: 'Color', value: 'Red' }] }], [{ productId: 713879, marketPrice: 2.49, subTypeName: 'Foil' }], { code: 'BP01', name: 'Dawn of Palpagos' });
assert.equal(parsed.length, 1);
assert.equal(parsed[0].cardNo, 'EBP01-001');
assert.equal(parsed[0].marketPrice, 2.49);
assert.match(parsed[0].image, /713879_in_1000x1000/);
console.log('US price updater tests passed');
