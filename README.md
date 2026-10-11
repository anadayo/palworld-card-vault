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

The US market shows TCGplayer's USD market value. The Japan market links to live
Mercari on-sale and sold searches with the configured Ambassador ID; it does not
claim a locally aggregated JPY value.

## Asset policy

Official product images and the card back are taken from the official media kit and must not be altered. Keep the site non-commercial while these assets are in use. Credit: `©Bushiroad ©PALWORLD`.

Before publishing advertisements or affiliate links, obtain permission or
replace the media-kit assets with licensed originals.
