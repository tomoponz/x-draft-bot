import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function resolve(relativePath) {
  return path.resolve(rootDir, relativePath);
}

async function readJsonArray(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} は配列JSONである必要があります`);
  }
  return parsed;
}

async function main() {
  const settingsRaw = await readFile(resolve("data/settings.json"), "utf8");
  const settings = JSON.parse(settingsRaw);

  if (!settings.output?.historyPath || !settings.output?.latestDraftsPath) {
    throw new Error("settings.json の output 設定が不足しています");
  }

  const history = await readJsonArray(resolve(settings.output.historyPath));
  const latestRaw = await readFile(resolve(settings.output.latestDraftsPath), "utf8");
  const latest = JSON.parse(latestRaw);

  if (!Array.isArray(latest.drafts)) {
    throw new Error("latest_drafts.json の drafts は配列である必要があります");
  }

  for (const item of latest.drafts) {
    if (!item.id || !item.text) {
      throw new Error("latest_drafts.json に id または text が空の候補があります");
    }
  }

  if (history.length === 0) {
    console.warn("warning: history.json が空です（初回運用なら問題ありません）");
  }

  console.log("validate: ok");
}

main().catch((error) => {
  console.error("validate.mjs failed:", error.message);
  process.exitCode = 1;
});
