import { readFile } from "node:fs/promises";
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

async function readJsonArray(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} は配列JSONである必要があります`);
  }
  return parsed;
}

async function main() {
  const settingsRaw = await readFile(resolveFromData("settings.json"), "utf8");
  const settings = JSON.parse(settingsRaw);

  const history = await readJsonArray(resolveFromData("history.json"));
  const latestRaw = await readFile(resolveFromData("latest_drafts.json"), "utf8");
  const latest = JSON.parse(latestRaw);

  if (!Array.isArray(latest.drafts)) {
    throw new Error("latest_drafts.json の drafts は配列である必要があります");
  }

  for (const item of latest.drafts) {
    if (!item.id || !item.text) {
      throw new Error("latest_drafts.json に id または text が空の候補があります");
    }

    if (typeof item.charCount === "number" && item.charCount !== item.text.length) {
      throw new Error(`charCount と text.length が一致しません: ${item.id}`);
    }

    if (item.text.length > Number(settings.characterLimit || 140)) {
      throw new Error(`文字数上限を超える候補があります: ${item.id}`);
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
