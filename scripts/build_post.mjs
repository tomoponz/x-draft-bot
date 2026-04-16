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

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const required = ["id", "category", "topic", "body", "tags", "priority"];
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length > 0) {
    throw new Error(`posts.csv のヘッダー不足: ${missing.join(", ")}`);
  }

  const idSet = new Set();
  const records = [];

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] ?? "").trim();
    });

    if (!record.id || !record.body) {
      // 空行・異常行はスキップ
      continue;
    }
    if (idSet.has(record.id)) {
      // 重複IDは後勝ちにせずスキップ（予期せぬ上書きを防ぐ）
      continue;
    }

    idSet.add(record.id);
    records.push(record);
  }

  return records;
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

function safeJsonArray(raw, fallbackName) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`${fallbackName} が壊れているため空配列として復旧します。`);
    return [];
  }
}

function safeJsonObject(raw, fallbackName) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return {};
  } catch {
    console.warn(`${fallbackName} が壊れているため既定値で復旧します。`);
    return {};
  }
}

function normalizePriority(rawPriority) {
  const n = Number(rawPriority);
  if (Number.isNaN(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function seededIndex(seed, size, salt) {
  if (!size) return 0;
  let hash = 0;
  const text = `${seed}:${salt}`;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % size;
}

function pickBySeed(array, seed, salt) {
  if (!Array.isArray(array) || array.length === 0) return "";
  return array[seededIndex(seed, array.length, salt)];
}

function buildHashtags(post, templates, settings) {
  const tagsFromPost = (post.tags || "")
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));

  const categoryTags = templates.categoryHashtags?.[post.category] || [];
  const defaultTags = templates.defaultHashtags || [];
  const merged = [...tagsFromPost, ...categoryTags, ...defaultTags]
    .map((tag) => tag.trim())
    .filter(Boolean);

  const unique = [...new Set(merged)];
  const hashtagLimit = Number(settings.hashtagLimit || 4);
  return unique.slice(0, hashtagLimit);
}

function scorePost(post, recentIds, seed) {
  const priority = normalizePriority(post.priority);
  const recentPenalty = recentIds.has(post.id) ? -1000 : 0;
  const varietyBonus = seededIndex(seed + post.id, 7, post.topic || "topic") / 100;
  return priority * 10 + varietyBonus + recentPenalty;
}

function composeCandidate(post, templates, settings, seed, variant) {
  const opener = pickBySeed(templates.openers, seed, `${post.id}-opener-${variant}`);
  const bridge = pickBySeed(templates.bridges, seed, `${post.id}-bridge-${variant}`);
  const closer = pickBySeed(templates.closers, seed, `${post.id}-closer-${variant}`);
  const cta = pickBySeed(templates.callsToAction || [], seed, `${post.id}-cta-${variant}`);
  const hashtags = buildHashtags(post, templates, settings);

  let sentence = `${opener} ${post.body}`.replace(/\s+/g, " ").trim();
  if (bridge && closer) {
    sentence = `${sentence} ${bridge}、${closer}`;
  }
  if (cta) {
    sentence = `${sentence} ${cta}`;
  }

  let text = `${sentence} ${hashtags.join(" ")}`.replace(/\s+/g, " ").trim();

  if (text.length > settings.characterLimit) {
    const shortBody = trimToLimit(post.body, settings.maxBodyLengthBeforeTrim);
    text = `${opener} ${shortBody} ${hashtags.join(" ")}`.replace(/\s+/g, " ").trim();
  }

  if (text.length > settings.characterLimit) {
    text = trimToLimit(text, settings.characterLimit);
  }

  return {
    text,
    hashtags,
    charCount: text.length,
    reason: {
      priority: normalizePriority(post.priority),
      skippedRecentlyUsed: false,
      templateVariant: variant
    }
  };
}

function createFallbackDraft(settings, createdAt, serial = 1) {
  const id = `draft-${formatDateForId(createdAt)}-${String(serial).padStart(3, "0")}`;
  const text = trimToLimit(
    "今日は新しい候補を作れませんでした。posts.csv の内容や history.json の形式を確認して、再実行してください。 #X運用 #下書き",
    settings.characterLimit
  );

  return {
    id,
    sourceId: "fallback",
    category: "システム",
    topic: "生成失敗フォールバック",
    text,
    tags: ["#X運用", "#下書き"],
    charCount: text.length,
    reason: {
      priority: 0,
      skippedRecentlyUsed: false,
      templateVariant: "fallback"
    },
    createdAt: createdAt.toISOString(),
    posted: false
  };
}

async function main() {
  const settings = safeJsonObject(await readFile(resolveFromRoot("data/settings.json"), "utf8"), "settings.json");
  const output = settings.output || {};

  const postsCsvPath = resolveFromRoot(output.postsCsvPath || "data/posts.csv");
  const templatesPath = resolveFromRoot(output.templatesPath || "data/templates.json");
  const historyPath = resolveFromRoot(output.historyPath || "data/history.json");
  const latestDraftsPath = resolveFromRoot(output.latestDraftsPath || "data/latest_drafts.json");

  const [postsCsv, templatesRaw, historyRaw] = await Promise.all([
    readFile(postsCsvPath, "utf8"),
    readFile(templatesPath, "utf8"),
    readFile(historyPath, "utf8").catch(() => "[]")
  ]);

  const templates = safeJsonObject(templatesRaw, "templates.json");
  const history = safeJsonArray(historyRaw, "history.json");
  const posts = parseCsv(postsCsv);

  const normalizedSettings = {
    characterLimit: Number(settings.characterLimit || 140),
    draftsPerRun: Number(settings.draftsPerRun || 3),
    avoidRecentSourceCount: Number(settings.avoidRecentSourceCount || 5),
    maxBodyLengthBeforeTrim: Number(settings.maxBodyLengthBeforeTrim || 120),
    hashtagLimit: Number(settings.hashtagLimit || 4),
    timezone: settings.timezone || "Asia/Tokyo",
    timezoneLabel: settings.timezoneLabel || "JST",
    historyKeepMax: Number(settings.historyKeepMax || 300)
  };

  const createdAt = new Date();
  const seed = `${createdAt.toISOString().slice(0, 13)}-${history.length}`;

  let drafts = [];
  const recentSourceIds = new Set(
    history
      .slice(-normalizedSettings.avoidRecentSourceCount)
      .map((item) => item?.sourceId)
      .filter(Boolean)
  );

  if (posts.length > 0) {
    const sortedPosts = [...posts].sort(
      (a, b) => scorePost(b, recentSourceIds, seed) - scorePost(a, recentSourceIds, seed)
    );

    const selected = sortedPosts.slice(0, normalizedSettings.draftsPerRun);
    const usedTexts = new Set(history.map((item) => item?.text).filter(Boolean));

    drafts = selected.map((post, index) => {
      let variant = 0;
      let candidate = composeCandidate(post, templates, normalizedSettings, seed, variant);

      while (usedTexts.has(candidate.text) && variant < 4) {
        variant += 1;
        candidate = composeCandidate(post, templates, normalizedSettings, seed, variant);
      }

      usedTexts.add(candidate.text);

      return {
        id: `draft-${formatDateForId(createdAt)}-${String(index + 1).padStart(3, "0")}`,
        sourceId: post.id,
        category: post.category || "未分類",
        topic: post.topic || "トピック未設定",
        text: candidate.text,
        tags: candidate.hashtags,
        charCount: candidate.charCount,
        reason: {
          ...candidate.reason,
          skippedRecentlyUsed: recentSourceIds.has(post.id)
        },
        createdAt: createdAt.toISOString(),
        posted: false
      };
    });
  }

  if (drafts.length === 0) {
    drafts = [createFallbackDraft(normalizedSettings, createdAt, 1)];
  }

  const mergedHistory = [...history, ...drafts].slice(-normalizedSettings.historyKeepMax);

  const latest = {
    generatedAt: createdAt.toISOString(),
    timezone: normalizedSettings.timezone,
    timezoneLabel: normalizedSettings.timezoneLabel,
    count: drafts.length,
    drafts
  };

  await Promise.all([
    writeFile(historyPath, `${JSON.stringify(mergedHistory, null, 2)}\n`, "utf8"),
    writeFile(latestDraftsPath, `${JSON.stringify(latest, null, 2)}\n`, "utf8")
  ]);

  console.log(`Generated ${drafts.length} drafts.`);
}

main().catch((error) => {
  console.error("build_post.mjs failed:", error.message);
  process.exitCode = 1;
});
