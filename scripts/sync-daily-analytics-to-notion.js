const fs = require('fs');
const crypto = require('crypto');

const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID || '552987217';
const NOTION_DATA_SOURCE_ID = process.env.NOTION_PALWORLD_DATA_SOURCE_ID || '5dfea9e5-6274-4944-a330-2cc1bbf0dccf';
const NOTION_VERSION = '2026-03-11';
const SITE_URL = 'https://anadayo.github.io/palworld-card-vault/';
const PAGE_PATH = '/palworld-card-vault/';
const EVENTS = [
  'palworld_mercari_affiliate_click',
  'shopping_price_click',
  'search',
  'share',
  'market_switch',
  'watchlist_toggle',
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function jstDate(offsetDays = -1) {
  const value = Date.now() + (9 * 60 * 60 * 1000) + (offsetDays * 86400000);
  return new Date(value).toISOString().slice(0, 10);
}

function jstNowIso() {
  return new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().replace('Z', '+09:00');
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function googleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: account.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), account.private_key).toString('base64url');
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function gaReport(token, date, body) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ dateRanges: [{ startDate: date, endDate: date }], ...body }),
  });
  if (!response.ok) throw new Error(`GA4 report failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function metrics(report) {
  const headers = report.metricHeaders || [];
  const values = report.rows?.[0]?.metricValues || [];
  return Object.fromEntries(headers.map((header, index) => [header.name, Number(values[index]?.value || 0)]));
}

function eventCounts(report) {
  return Object.fromEntries((report.rows || []).map(row => [
    row.dimensionValues?.[0]?.value || 'unknown',
    Number(row.metricValues?.[0]?.value || 0),
  ]));
}

async function notion(path, options = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${required('NOTION_TOKEN')}`,
      'notion-version': NOTION_VERSION,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`Notion API failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function number(value) {
  return { number: Number.isFinite(value) ? value : 0 };
}

function title(date) {
  const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' })
    .format(new Date(`${date}T00:00:00+09:00`));
  return `${date}（${weekday}）｜PALWORLD CARD VAULT`;
}

async function upsert(date, properties) {
  const id = NOTION_DATA_SOURCE_ID.replace(/-/g, '');
  const query = await notion(`/data_sources/${id}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: { property: '日付', date: { equals: date } },
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 20,
    }),
  });
  const [existing, ...duplicates] = query.results || [];
  if (existing) {
    await notion(`/pages/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    for (const duplicate of duplicates) {
      await notion(`/pages/${duplicate.id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
    }
    return { action: 'updated', pageId: existing.id, duplicatesArchived: duplicates.length };
  }
  const created = await notion('/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { data_source_id: id }, properties }),
  });
  return { action: 'created', pageId: created.id };
}

async function main() {
  const date = process.env.REPORT_DATE || jstDate(-1);
  const account = JSON.parse(required('GA_SERVICE_ACCOUNT_JSON'));
  const token = await googleAccessToken(account);
  const [summary, eventReport] = await Promise.all([
    gaReport(token, date, {
      metrics: ['activeUsers', 'newUsers', 'sessions', 'screenPageViews'].map(name => ({ name })),
      dimensionFilter: { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: PAGE_PATH } } },
    }),
    gaReport(token, date, {
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { andGroup: { expressions: [
        { filter: { fieldName: 'eventName', inListFilter: { values: EVENTS } } },
        { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'BEGINS_WITH', value: PAGE_PATH } } },
      ] } },
    }),
  ]);
  const totals = metrics(summary);
  const events = eventCounts(eventReport);
  const externalClicks = (events.palworld_mercari_affiliate_click || 0) + (events.shopping_price_click || 0);
  const pageViews = totals.screenPageViews || 0;
  const marketMeta = JSON.parse(fs.readFileSync('market-meta.json', 'utf8'));
  const priceDate = marketMeta.jp?.updatedAt || marketMeta.us?.updatedAt || '';
  const properties = {
    '日次レポート': { title: [{ text: { content: title(date) } }] },
    '日付': { date: { start: date } },
    '月': { select: { name: date.slice(0, 7) } },
    'アクティブユーザー': number(totals.activeUsers),
    '新規ユーザー': number(totals.newUsers),
    'セッション': number(totals.sessions),
    'PV': number(pageViews),
    '外部価格クリック': number(externalClicks),
    'CTR': number(pageViews ? externalClicks / pageViews : 0),
    'カード詳細表示': number(events.shopping_price_click || 0),
    '検索回数': number(events.search || 0),
    'Xシェア': number(events.share || 0),
    '市場切替': number(events.market_switch || 0),
    'ウォッチ登録': number(events.watchlist_toggle || 0),
    '価格データ日': priceDate ? { date: { start: priceDate } } : { date: null },
    '価格更新': { select: { name: priceDate >= date ? '最新' : '要確認' } },
    'サイト': { url: SITE_URL },
    '同期日時': { date: { start: jstNowIso() } },
  };
  console.log(JSON.stringify({ date, metrics: totals, events, priceDate, ...(await upsert(date, properties)) }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
