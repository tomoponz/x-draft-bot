import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function resolveFromRoot(relativePath) {
  return path.resolve(rootDir, relativePath);
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? "";
    });
    return record;
  });
}

function pickRandom(array, offset = 0) {
  if (!Array.isArray(array) || array.length === 0) return "";
  return array[offset % array.length];
}

function formatDateForId(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function trimToLimit(text, limit) {
  if (text.length <= limit) return text;
  const suffix = "…";
  return text.slice(0, Math.max(1, limit - suffix.length)).trimEnd() + suffix;
}

function buildHashtags(post, templates) {
  const tagsFromPost = (post.tags || "")
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));

  const categoryTags = templates.categoryHashtags?.[post.category] || [];
  const defaultTags = templates.defaultHashtags || [];

  const merged = [...tagsFromPost, ...categoryTags, ...defaultTags];

  // 重複除去
  return [...new Set(merged)].slice(0, 4).join(" ");
}

function scorePost(post, recentIds) {
  const priority = Number(post.priority || 1);
  const penalty = recentIds.has(post.id) ? -1000 : 0;
  const jitter = Math.random() * 0.2;
  return priority * 10 + jitter + penalty;
}

function createDraft(post, templates, settings, index, createdAt, usedTexts) {
  const opener = pickRandom(templates.openers, index);
  const bridge = pickRandom(templates.bridges, index + 1);
  const closer = pickRandom(templates.closers, index + 2);
  const hashtags = buildHashtags(post, templates);

  let core = `${opener} ${post.body}`.trim();
  const extra = `${bridge}、${closer}`;
  core = `${core} ${extra}`.trim();

  // 文字数上限を守るため、段階的に短縮
  let candidate = `${core} ${hashtags}`.trim();
  if (candidate.length > settings.characterLimit) {
    const compressedBody = trimToLimit(post.body, settings.maxBodyLengthBeforeTrim);
    candidate = `${opener} ${compressedBody} ${hashtags}`.trim();
  }
  if (candidate.length > settings.characterLimit) {
    candidate = trimToLimit(candidate, settings.characterLimit);
  }

  // 同文面が重なる場合は締め文を変更して揺らぎを作る
  if (usedTexts.has(candidate)) {
    const altCloser = pickRandom(templates.closers, index + 3);
    const alt = `${opener} ${post.body} ${altCloser} ${hashtags}`.replace(/\s+/g, " ").trim();
    candidate = trimToLimit(alt, settings.characterLimit);
  }

  const serial = String(index + 1).padStart(3, "0");
  return {
    id: `draft-${formatDateForId(createdAt)}-${serial}`,
    sourceId: post.id,
    category: post.category,
    topic: post.topic,
    text: candidate,
    createdAt: createdAt.toISOString(),
    posted: false
  };
}

async function main() {
  const settingsPath = resolveFromRoot("data/settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));

  const postsCsvPath = resolveFromRoot(settings.output.postsCsvPath);
  const templatesPath = resolveFromRoot(settings.output.templatesPath);
  const historyPath = resolveFromRoot(settings.output.historyPath);
  const latestDraftsPath = resolveFromRoot(settings.output.latestDraftsPath);

  const [postsCsv, templatesRaw, historyRaw] = await Promise.all([
    readFile(postsCsvPath, "utf8"),
    readFile(templatesPath, "utf8"),
    readFile(historyPath, "utf8")
  ]);

  const posts = parseCsv(postsCsv);
  const templates = JSON.parse(templatesRaw);
  const history = JSON.parse(historyRaw);

  if (!Array.isArray(posts) || posts.length === 0) {
    throw new Error("posts.csv に有効なデータがありません。");
  }

  const recentSourceIds = new Set(
    history
      .slice(-settings.avoidRecentSourceCount)
      .map((item) => item.sourceId)
      .filter(Boolean)
  );

  const scored = [...posts].sort(
    (a, b) => scorePost(b, recentSourceIds) - scorePost(a, recentSourceIds)
  );

  const selected = scored.slice(0, settings.draftsPerRun);
  const createdAt = new Date();
  const usedTexts = new Set(history.map((h) => h.text));

  const drafts = selected.map((post, index) => {
    const draft = createDraft(post, templates, settings, index, createdAt, usedTexts);
    usedTexts.add(draft.text);
    return draft;
  });

  const newHistory = [...history, ...drafts];

  await Promise.all([
    writeFile(historyPath, JSON.stringify(newHistory, null, 2) + "\n", "utf8"),
    writeFile(
      latestDraftsPath,
      JSON.stringify(
        {
          generatedAt: createdAt.toISOString(),
          timezone: settings.timezone,
          timezoneLabel: settings.timezoneLabel,
          drafts
        },
        null,
        2
      ) + "\n",
      "utf8"
    )
  ]);

  console.log(`Generated ${drafts.length} drafts.`);
}

main().catch((error) => {
  console.error("build_post.mjs failed:", error.message);
  process.exitCode = 1;
});
