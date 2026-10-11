# PALWORLD CARD VAULT 日次レポート

毎朝9:25（JST）に、前日のGA4アクセス数・外部価格クリック・検索・市場切替・ウォッチ登録と価格更新日をNotionへ保存します。同じ日付で再実行した場合は既存行を更新し、重複を増やしません。

- Notion DB: https://app.notion.com/p/a2175ef6fb174cc49733233cdc0222e4
- データソースID: `5dfea9e5-6274-4944-a330-2cc1bbf0dccf`
- 公開予定URL: https://anadayo.github.io/palworld-card-vault/

Notionには日付降順の「月次確認」と「日付カレンダー」ビューを作成済みです。

## GitHub Secrets

リポジトリの `Settings > Secrets and variables > Actions` に以下を登録します。

- `NOTION_TOKEN`: Notionインテグレーションのトークン
- `GA_SERVICE_ACCOUNT_JSON`: GA4閲覧用サービスアカウント鍵のJSON全文

Notion DBの接続設定から、`NOTION_TOKEN`に対応するインテグレーションを追加してください。Google Cloud側ではAnalytics Data APIを有効にし、サービスアカウントをGA4プロパティ `552987217` の閲覧者にします。

GitHub Actionsの `Save Palworld daily analytics to Notion` から日付を指定して手動実行もできます。
