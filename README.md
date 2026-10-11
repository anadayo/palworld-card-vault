# PALWORLD CARD VAULT

Unofficial, non-commercial information hub for Palworld OFFICIAL CARD GAME.

## Local preview

```sh
python3 -m http.server 3344
```

Open `http://localhost:3344/palworld-card-vault/` from the parent workspace.

## Price updates

`scripts/update-prices.js` imports all five Palworld sets listed by TCGplayer,
updates `cards.json`, embeds the catalog into `index.html`, and writes an audit
report to `price-update-report.json`.

The GitHub Actions workflow runs at 10:20, 15:20, 18:20, and 21:20 JST. It has
a safety threshold of 200 cards: a partial or blocked response cannot overwrite
the published catalog. Run the parser tests locally with:

```sh
node scripts/test-update-prices.js
```

The two market tabs intentionally use independent catalog sizes. Japan is the
primary catalog and keeps every imported card candidate. The US tab is limited
to the 80 cards with the strongest available TCGplayer market values by default
(`US_CARD_LIMIT` can override this in Actions).

The US market shows TCGplayer's USD market value. The Japan market displays a
Mercari sold-listing average when at least three same-card sales are available.
With one or two verified sales, it falls back to the latest sold price. The
average excludes values below 40% or above 250% of the median. Cards with no
verified sales display `売却実績なし` and retain links to live Mercari on-sale
and sold searches with the Ambassador ID.

## Asset policy

Official product images and the card back are taken from the official media kit and must not be altered. Keep the site non-commercial while these assets are in use. Credit: `©Bushiroad ©PALWORLD`.

Before publishing advertisements or affiliate links, obtain permission or
replace the media-kit assets with licensed originals.
