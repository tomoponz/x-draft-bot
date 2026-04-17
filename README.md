# x-draft-bot

X（旧Twitter）向けの投稿候補を**テンプレート方式で自動生成**し、GitHub Pages に表示する運用用リポジトリです。  
**X APIは使いません。ブラウザ自動操作もしません。**

> 目的は「候補生成 + 履歴管理 + 見やすい表示」まで。最終投稿は人間が手動で行います。

---

## 1. この構成でできること

- `posts.csv` から投稿候補を生成
- 最近使ったネタを避けつつ `priority` を考慮
- `history.json` に履歴を蓄積
- `docs/index.html` に運用画面を生成（コピーしやすいUI）
- GitHub Actions で定期・手動更新
- GitHub Pages で確認ページ公開

## 2. この構成でしないこと

- X API を使った自動投稿
- Playwright / Selenium 等のブラウザ自動操作
- 有料SaaSへの依存

---

## 3. ディレクトリ概要

- `data/posts.csv` : 元ネタ一覧（手動編集）
- `data/templates.json` : 文体テンプレート
- `data/settings.json` : 文字数・件数・表示設定
- `data/history.json` : 全候補履歴（生成される）
- `data/latest_drafts.json` : 最新生成結果（生成される）
- `scripts/build_post.mjs` : 候補生成
- `scripts/build_pages.mjs` : Pages用HTML生成
- `scripts/mark_posted.mjs` : 投稿済みフラグ更新
- `scripts/validate.mjs` : データ整合性チェック
- `docs/index.html` : 公開ページ
- `.github/workflows/*.yml` : 自動実行

---

## 4. 初回セットアップ

### 必要環境

- Node.js 20+
- npm
- Git

### ローカル手順

```bash
npm ci
npm run build
npm run validate
```

---

## 5. 日常運用コマンド

### 追加オプション（競合回避・テスト用）

以下の環境変数を使うと、生成先を切り替えできます。

- `X_DRAFT_BOT_DATA_DIR`: `data/` の代わりに使うディレクトリ
- `X_DRAFT_BOT_DOCS_PATH`: `docs/index.html` の代わりに使う出力先

`npm test` はこの仕組みを使って一時ディレクトリで実行されるため、通常の `data/history.json` を汚しません。


### 候補生成 + ページ生成

```bash
npm run build
```

### 候補を投稿済みにする

```bash
# IDで指定
node scripts/mark_posted.mjs --id draft-20260416-001

# 最新生成の候補番号で指定（1始まり）
node scripts/mark_posted.mjs --index 1

# historyの末尾を投稿済みにする
node scripts/mark_posted.mjs --latest
```

### 軽量チェック

```bash
npm run validate
npm test
```

---

## 6. GitHub Actions の使い方

- `Generate Drafts (Scheduled)`
  - 1日3回実行（UTC基準、コメントでJST併記）
  - 生成→ページ更新→検証→差分があればcommit/push
- `Manual Draft Build`
  - 任意タイミングで同処理を手動実行

両workflowとも `npm ci` を使用し、差分がない場合は正常終了します。

---

## 7. GitHub Pages の有効化

1. GitHub の `Settings > Pages`
2. Source: `Deploy from a branch`
3. Branch: `main` / Folder: `/docs`
4. 保存後、公開URLを確認

---

## 8. 投稿候補の見方（docs/index.html）

- 上段: 最新候補（コピー用ボタン付き）
- 表示項目: 候補番号 / トピック / カテゴリ / 元ネタID / 文字数 / 生成日時
- 下段: 直近履歴（posted状態を確認）

---

## 9. 無料運用の前提と注意

- GitHub Actions / Pages の無料枠前提（public repo が扱いやすい）
- public repo では下書き内容も公開されます
- 個人情報・機密情報を候補データに入れないでください
- この構成は X への自動投稿を行いません（手動投稿のみ）

---

## 10. よくあるトラブル

### Q. `history.json` が壊れて生成に失敗した

`build_post.mjs` は壊れたJSONを検知すると空配列として復旧し、最低1件のフォールバック候補を生成します。まず `npm run build` を再実行してください。

### Q. 候補が重複しやすい

`templates.json` の `openers / bridges / closers / callsToAction` を増やしてください。


### Q. `history.json` の競合が増える

- workflow は `concurrency` で同時実行を抑制しています。
- push前に `git pull --rebase` を入れているため、定期実行と手動実行が近いタイミングでも衝突しにくくしています。

### Q. Actions は成功したのに Pages が古い

`docs/index.html` に差分コミットがあるか確認し、Pages設定が `main / docs` になっているか再確認してください。

### Q. Node 20 の将来サポートが気になる

本リポジトリは Node 20 前提ですが、Actions側は `setup-node@v4` + `node-version: 20` を明示しています。将来は README と workflows を同時に更新してください。

---

## 11. 将来拡張（任意）

Gemini API Free Tier を使う場合は**完全オプション**として追加してください。

- `GEMINI_API_KEY` は GitHub Secrets 管理
- レート制限・無料枠超過時はテンプレ生成にフォールバック
- Previewモデルは避ける
- API依存で運用停止しない設計を維持
