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
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return {};
  } catch {
    return {};
  }
}

function safeJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatDate(dateString, timezone) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "-";
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
  const text = String(draft.text ?? "");
  const tags = Array.isArray(draft.tags) ? draft.tags.join(" ") : "";
  const charCount = draft.charCount ?? text.length;

  return `
    <article class="card">
      <div class="card-top">
        <div>
          <div class="badge">候補 ${index + 1}</div>
          <h3>${escapeHtml(draft.topic || "トピック未設定")}</h3>
        </div>
        <button class="copy-btn" type="button" data-copy-target="draft-${index}">コピー</button>
      </div>

      <div class="meta-grid">
        <div><span>カテゴリ</span><strong>${escapeHtml(draft.category || "未分類")}</strong></div>
        <div><span>元ネタID</span><strong>${escapeHtml(draft.sourceId || "-")}</strong></div>
        <div><span>文字数</span><strong>${escapeHtml(charCount)}</strong></div>
        <div><span>生成日時</span><strong>${escapeHtml(formatDate(draft.createdAt, timezone))} (${escapeHtml(timezoneLabel)})</strong></div>
      </div>

      <textarea id="draft-${index}" readonly>${escapeHtml(text)}</textarea>
      <p class="tags">${escapeHtml(tags)}</p>
      <small class="draft-id">ID: ${escapeHtml(draft.id || "-")}</small>
    </article>
  `;
}

function renderHistoryItem(item, timezone, timezoneLabel) {
  return `
    <li>
      <strong>${escapeHtml(item.id || "-")}</strong>
      <span> / ${escapeHtml(item.category || "-")} / posted: ${item.posted ? "true" : "false"}</span><br />
      <small>${escapeHtml(formatDate(item.createdAt, timezone))} (${escapeHtml(timezoneLabel)})</small>
    </li>
  `;
}

async function main() {
  const settings = safeJsonObject(await readFile(resolveFromRoot("data/settings.json"), "utf8"));
  const history = safeJsonArray(
    await readFile(resolveFromRoot(settings.output?.historyPath || "data/history.json"), "utf8").catch(() => "[]")
  );

  const latestDrafts = safeJsonObject(
    await readFile(resolveFromRoot(settings.output?.latestDraftsPath || "data/latest_drafts.json"), "utf8").catch(() => "{}")
  );

  const timezone = settings.timezone || "Asia/Tokyo";
  const timezoneLabel = settings.timezoneLabel || "JST";
  const drafts = Array.isArray(latestDrafts.drafts) ? latestDrafts.drafts : [];
  const recentHistory = [...history].reverse().slice(0, Number(settings.recentHistoryLimit || 20));

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(settings.siteTitle || "X Draft Bot")}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans JP", sans-serif;
      margin: 0;
      padding: 12px;
      background: #f5f7fb;
      color: #1b2430;
    }
    .container { max-width: 920px; margin: 0 auto; }
    h1 { margin: 4px 0 8px; font-size: 1.3rem; }
    .top-note { margin: 0 0 14px; color: #4d596a; font-size: 0.92rem; }
    .card {
      background: #fff;
      border: 1px solid #d8e0ea;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
      box-shadow: 0 1px 2px rgba(10, 30, 60, 0.06);
    }
    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .badge {
      display: inline-block;
      background: #1d6ff2;
      color: #fff;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 0.8rem;
      margin-bottom: 6px;
    }
    h2 { margin: 16px 0 10px; font-size: 1.1rem; }
    h3 { margin: 0 0 4px; font-size: 1.05rem; }
    .copy-btn {
      border: 1px solid #1d6ff2;
      background: #1d6ff2;
      color: #fff;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 0.9rem;
      cursor: pointer;
    }
    .copy-btn:active { transform: translateY(1px); }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 10px 0;
      font-size: 0.86rem;
    }
    .meta-grid span { display: block; color: #5f6e82; font-size: 0.76rem; }
    textarea {
      width: 100%;
      box-sizing: border-box;
      min-height: 120px;
      border-radius: 8px;
      border: 1px solid #cbd6e5;
      padding: 10px;
      font-size: 0.95rem;
      line-height: 1.45;
      resize: vertical;
      background: #fbfdff;
    }
    .tags { margin: 8px 0 4px; color: #375680; font-size: 0.88rem; }
    .draft-id { color: #687a90; }
    .history-card {
      background: #fff;
      border: 1px solid #d8e0ea;
      border-radius: 12px;
      padding: 12px;
    }
    ul { margin: 0; padding-left: 18px; }
    li { margin-bottom: 8px; }
    details { margin-top: 18px; }
    details summary { cursor: pointer; color: #2f4b72; }
    .footer { margin: 24px 0 10px; font-size: 0.8rem; color: #607086; }
    @media (max-width: 640px) {
      .meta-grid { grid-template-columns: 1fr; }
      .copy-btn { width: 100%; }
      .card-top { flex-direction: column; align-items: stretch; }
      textarea { min-height: 150px; }
    }
  </style>
</head>
<body>
  <main class="container">
    <h1>${escapeHtml(settings.siteTitle || "X Draft Bot")}</h1>
    <p class="top-note">最終更新: ${escapeHtml(formatDate(latestDrafts.generatedAt, timezone))} (${escapeHtml(timezoneLabel)}) / 候補数: ${escapeHtml(latestDrafts.count ?? drafts.length)}</p>

    <h2>最新の投稿候補</h2>
    ${drafts.length > 0 ? drafts.map((draft, index) => renderDraftCard(draft, index, timezone, timezoneLabel)).join("\n") : '<div class="card"><p>候補がありません。Actions または `npm run build` を実行してください。</p></div>'}

    <h2>直近履歴</h2>
    <section class="history-card">
      <ul>
        ${recentHistory.length > 0 ? recentHistory.map((item) => renderHistoryItem(item, timezone, timezoneLabel)).join("\n") : "<li>履歴がありません。</li>"}
      </ul>
    </section>

    <details>
      <summary>このページについて（運用メモ）</summary>
      <p>このページは X 投稿の下書き確認専用です。自動投稿は行いません。本文は手動でコピーして投稿してください。public repository では下書きが公開されるため、機微情報は含めないでください。</p>
    </details>

    <p class="footer">Built by x-draft-bot / X APIなし・ブラウザ自動操作なし</p>
  </main>

  <script>
    document.querySelectorAll('.copy-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.getAttribute('data-copy-target');
        const textarea = document.getElementById(id);
        if (!textarea) return;

        textarea.focus();
        textarea.select();

        try {
          await navigator.clipboard.writeText(textarea.value);
          const original = button.textContent;
          button.textContent = 'コピー済み';
          setTimeout(() => {
            button.textContent = original;
          }, 1200);
        } catch {
          // clipboard API が使えない場合は select() まででフォールバック
        }
      });
    });
  </script>
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
