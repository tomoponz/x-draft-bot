import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function resolveFromRoot(relativePath) {
  return path.resolve(rootDir, relativePath);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(dateString, timezone) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function renderDraftCard(draft, index, timezone, timezoneLabel) {
  const copyLabel = `候補${index + 1}`;
  return `
    <article class="card">
      <header class="card-header">
        <div class="meta">${copyLabel} / ${escapeHtml(draft.category)} / ${escapeHtml(draft.id)}</div>
        <div class="meta">生成日時: ${escapeHtml(formatDate(draft.createdAt, timezone))} (${escapeHtml(timezoneLabel)})</div>
      </header>
      <p class="topic">元ネタ: ${escapeHtml(draft.topic)} (${escapeHtml(draft.sourceId)})</p>
      <textarea readonly onclick="this.select()">${escapeHtml(draft.text)}</textarea>
      <p class="hint">上の本文をタップ（クリック）して全選択→コピーしてください。</p>
    </article>
  `;
}

function renderHistoryItem(item, timezone, timezoneLabel) {
  return `
    <li>
      <strong>${escapeHtml(item.id)}</strong>
      <span> / ${escapeHtml(item.category)} / posted: ${item.posted ? "true" : "false"}</span><br />
      <small>${escapeHtml(formatDate(item.createdAt, timezone))} (${escapeHtml(timezoneLabel)})</small>
    </li>
  `;
}

async function main() {
  const settings = JSON.parse(await readFile(resolveFromRoot("data/settings.json"), "utf8"));
  const history = JSON.parse(await readFile(resolveFromRoot(settings.output.historyPath), "utf8"));

  let latestDrafts = { drafts: [], generatedAt: new Date().toISOString() };
  try {
    latestDrafts = JSON.parse(await readFile(resolveFromRoot(settings.output.latestDraftsPath), "utf8"));
  } catch {
    // 初回実行などで latest_drafts.json が無い場合でもページを壊さない
  }

  const drafts = Array.isArray(latestDrafts.drafts) ? latestDrafts.drafts : [];
  const recentHistory = [...history].reverse().slice(0, settings.recentHistoryLimit);

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(settings.siteTitle)}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", sans-serif;
      margin: 0;
      padding: 16px;
      line-height: 1.5;
      background: #0b1020;
      color: #e8eefc;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 1.4rem; }
    p.description { margin-top: 0; color: #b8c5e6; }
    .section-title { margin-top: 24px; font-size: 1.1rem; }
    .card {
      border: 1px solid #334;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
      background: #121a33;
    }
    .meta { font-size: 0.85rem; color: #9db0de; }
    .topic { margin: 8px 0; }
    textarea {
      width: 100%;
      min-height: 120px;
      border: 1px solid #445;
      border-radius: 8px;
      padding: 10px;
      box-sizing: border-box;
      font-size: 0.95rem;
      background: #0d152b;
      color: #e8eefc;
    }
    .hint { margin: 6px 0 0; font-size: 0.8rem; color: #9db0de; }
    ul { padding-left: 18px; }
    .footer { margin-top: 28px; color: #9db0de; font-size: 0.8rem; }
    @media (max-width: 600px) {
      body { padding: 12px; }
      textarea { min-height: 140px; }
    }
  </style>
</head>
<body>
  <main class="container">
    <h1>${escapeHtml(settings.siteTitle)}</h1>
    <p class="description">${escapeHtml(settings.siteDescription)}</p>
    <p class="description">最終更新: ${escapeHtml(formatDate(latestDrafts.generatedAt, settings.timezone))} (${escapeHtml(settings.timezoneLabel)})</p>

    <h2 class="section-title">最新の投稿候補</h2>
    ${drafts.length > 0 ? drafts.map((draft, index) => renderDraftCard(draft, index, settings.timezone, settings.timezoneLabel)).join("\n") : "<p>まだ候補が生成されていません。GitHub Actions または npm run build を実行してください。</p>"}

    <h2 class="section-title">直近履歴</h2>
    <ul>
      ${recentHistory.map((item) => renderHistoryItem(item, settings.timezone, settings.timezoneLabel)).join("\n")}
    </ul>

    <p class="footer">このページは下書き確認用です。Xへの投稿は手動で行ってください。</p>
  </main>
</body>
</html>
`;

  await writeFile(resolveFromRoot("docs/index.html"), html, "utf8");
  console.log("docs/index.html updated.");
}

main().catch((error) => {
  console.error("build_pages.mjs failed:", error.message);
  process.exitCode = 1;
});
