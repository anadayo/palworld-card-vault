# PALWORLD CARD VAULT

日本版・アメリカ版を切り替えて相場を確認できる、非公式のカード価格・収集管理サイトです。

## 運用

- 日本版相場: 1日3回更新
- アメリカ版相場: 1日2回更新
- アクセス・クリック履歴: 毎朝Notionへ保存

Notion連携の設定は `NOTION_ANALYTICS_SETUP.md` を参照してください。

Unofficial, non-commercial information hub for Palworld OFFICIAL CARD GAME.

## Local preview

```sh
python3 -m http.server 3344
```

Open `http://localhost:3344/palworld-card-vault/` from the parent workspace.

## Price updates

The two markets are independent:

- `scripts/update-prices.js` joins Palworld products and daily USD market data
  from TCGCSV's TCGplayer export, then writes the 80 strongest priced cards to
  `cards-us.json`.
- `scripts/update-japan-prices.js` imports the full Japanese catalog and images
  from the official Japanese API, then checks Mercari sold searches in small
  rotating batches and writes `cards-jp.json`.
- `market-meta.json` keeps separate source, date, and card-count metadata.

The workflows run independently. US data updates at 10:20 and 18:20 JST.
Japanese data updates at 11:00, 16:00, and 21:00 JST. Safety thresholds of 200
records prevent a partial or blocked catalog response from replacing published
data. Run both parser test suites locally with:

```sh
node scripts/test-update-prices.js
node scripts/test-update-japan-prices.js
```

The two market tabs intentionally use independent catalog sizes. Japan is the
primary catalog and keeps every imported card candidate. The US tab is limited
to the 80 cards with the strongest available TCGplayer market values by default
(`US_CARD_LIMIT` can override this in Actions).

The US market shows daily TCGplayer-derived USD market values cached by TCGCSV.
The Japan market displays a Mercari sold-listing average only when at least
three exact card-number matches are available. With one or two verified sales,
it falls back to the latest sold price. BOX, pack, set, deck, and bundle titles
are excluded and statistical outliers are removed. Mercari currently renders
search results after page load, so an empty server response never clears prior
verified prices or creates a synthetic value. Cards without verified sales keep
live on-sale and sold-search Ambassador links and show `相場取得待ち`.

## Asset policy

Official product images and the card back are taken from the official media kit and must not be altered. Keep the site non-commercial while these assets are in use. Credit: `©Bushiroad ©PALWORLD`.

Before publishing advertisements or affiliate links, obtain permission or
replace the media-kit assets with licensed originals.
