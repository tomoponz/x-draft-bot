# x-draft-bot

X（旧Twitter）向けの**投稿候補だけ**を自動生成し、GitHub Pages に見やすく表示する最小構成です。  
**X APIは使いません。ブラウザ自動操作もしません。**  
最終投稿は、あなたが GitHub Pages を開いて手動でコピペ投稿します。

---

## このリポジトリでできること

- `data/posts.csv` の元ネタから、テンプレート方式で投稿候補を生成
- 最近使った元ネタを避けつつ、`priority` を考慮して候補選定
- 生成履歴を `data/history.json` に蓄積
- 最新候補と直近履歴を `docs/index.html` に反映
- GitHub Actions の定期実行（1日3回）と手動実行
- GitHub Pages で下書き一覧を公開

## このリポジトリで**やらないこと**

- X API を使った自動投稿
- Selenium / Playwright などを使ったX自動操作
- 外部有料SaaSへの依存

---

## 完全無料運用の前提

- GitHub Actions / GitHub Pages の無料枠で回す前提です（public repository 推奨）。
- この構成はテンプレート生成のみなので、外部AI APIなしでも動きます。
- Gemini API Free Tier を将来オプションで追加する場合も、**無料枠内運用**と**Secrets管理**を前提にしてください。
- 無料枠の生成AIは、データが製品改善に使われる可能性があるため、個人情報・機微情報を送らない運用にしてください。

---

## セットアップ手順（ローカル）

### 1) 必要環境

- Node.js 20 以上
- npm
- Git

### 2) インストール

```bash
npm install
```

### 3) 初回ビルド

```bash
npm run build
```

実行後、以下が更新されます。

- `data/history.json`
- `data/latest_drafts.json`
- `docs/index.html`

---

## ローカル実行コマンド

### 投稿候補生成のみ

```bash
npm run build:post
```

### Pages用HTML生成のみ

```bash
npm run build:pages
```

### 一括実行

```bash
npm run build
```

### 投稿済みにマーク

```bash
node scripts/mark_posted.mjs --id draft-20260416-001
```

IDが見つかれば `data/history.json` の `posted` を `true` に更新します。

---

## GitHubで有効化する手順

### 1) リポジトリを public で作成し、コードを push

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

### 2) GitHub Actions を有効化

- リポジトリの **Actions** タブを開く
- ワークフローを許可
- `Generate Drafts (Scheduled)` と `Manual Draft Build` が表示されることを確認

### 3) GitHub Pages を有効化

- **Settings > Pages** を開く
- **Build and deployment > Source** で「Deploy from a branch」を選択
- Branch は `main`、フォルダは `/docs` を選択
- 保存後、公開URLが発行される

---

## ワークフロー

### `.github/workflows/draft.yml`

- `schedule`（1日3回）と `workflow_dispatch` に対応
- 実行内容: checkout → setup-node → npm install → build:post → build:pages → commit/push
- 変更がない場合はコミットせず正常終了

### `.github/workflows/manual.yml`

- `workflow_dispatch` 専用
- 手動で同様のビルド処理を実行

---

## 設定ファイル

### `data/settings.json`

主な設定項目:

- `characterLimit`: 文字数上限
- `draftsPerRun`: 1回あたり生成件数
- `avoidRecentSourceCount`: 直近で使った元ネタ回避件数
- `siteTitle`, `siteDescription`: ページ表示文言
- `timezone`, `timezoneLabel`: JST表示用

### `data/templates.json`

- `openers`（導入）
- `bridges`（接続句）
- `closers`（締め）
- `defaultHashtags`, `categoryHashtags`

---

## 注意点（必読）

- この構成では、**下書きが docs/index.html に出るため public repository だと公開されます**。
- 未公開情報・個人情報・機密情報は下書きデータに入れないでください。
- Xへの投稿は必ず手動で行ってください（規約・安全面のため）。

---

## 将来の拡張メモ（任意）

- Gemini API Free Tier を使う場合:
  - `GEMINI_API_KEY` を GitHub Secrets で管理
  - レート制限や無料枠超過時はテンプレート生成にフォールバック
  - Previewモデルではなく、Free Tierで安定利用できるモデルに限定

このリポジトリ本体は、上記拡張を入れなくても完全動作します。
