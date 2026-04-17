import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = process.env.X_DRAFT_BOT_DATA_DIR
  ? path.resolve(process.env.X_DRAFT_BOT_DATA_DIR)
  : path.resolve(rootDir, "data");

function resolveFromData(filename) {
  return path.resolve(dataDir, filename);
}

function parseArgs(argv) {
  const result = { id: "", index: null, latest: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--id") {
      result.id = argv[i + 1] || "";
      i += 1;
    } else if (token === "--index") {
      result.index = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--latest") {
      result.latest = true;
    }
  }

  return result;
}

function printUsage() {
  console.log("使い方:");
  console.log("  node scripts/mark_posted.mjs --id draft-20260416-001");
  console.log("  node scripts/mark_posted.mjs --index 1");
  console.log("  node scripts/mark_posted.mjs --latest");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const historyPath = resolveFromData("history.json");
  const latestPath = resolveFromData("latest_drafts.json");

  const historyRaw = await readFile(historyPath, "utf8").catch(() => "[]");
  const history = JSON.parse(historyRaw);

  if (!Array.isArray(history) || history.length === 0) {
    console.error("history.json が空か壊れています。");
    process.exitCode = 1;
    return;
  }

  let targetId = args.id;

  if (!targetId && Number.isInteger(args.index)) {
    const latestRaw = await readFile(latestPath, "utf8").catch(() => "{}");
    const latest = JSON.parse(latestRaw);
    const drafts = Array.isArray(latest.drafts) ? latest.drafts : [];

    if (args.index <= 0 || args.index > drafts.length) {
      console.error(`--index は 1〜${drafts.length || 0} の範囲で指定してください。`);
      process.exitCode = 1;
      return;
    }

    targetId = drafts[args.index - 1]?.id;
  }

  if (!targetId && args.latest) {
    targetId = history[history.length - 1]?.id;
  }

  if (!targetId) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const index = history.findIndex((item) => item.id === targetId);
  if (index === -1) {
    console.error(`指定したIDが見つかりませんでした: ${targetId}`);
    process.exitCode = 1;
    return;
  }

  if (history[index].posted === true) {
    console.log(`すでに posted=true です: ${targetId}`);
    return;
  }

  history[index].posted = true;
  history[index].postedAt = new Date().toISOString();

  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  console.log(`posted=true に更新しました: ${targetId}`);
}

main().catch((error) => {
  console.error("mark_posted.mjs failed:", error.message);
  process.exitCode = 1;
});
