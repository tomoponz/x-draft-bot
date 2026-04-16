import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--id") {
      result.id = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.id) {
    console.error("使い方: node scripts/mark_posted.mjs --id draft-20260416-001");
    process.exitCode = 1;
    return;
  }

  const historyPath = path.resolve(rootDir, "data/history.json");
  const raw = await readFile(historyPath, "utf8");
  const history = JSON.parse(raw);

  const index = history.findIndex((item) => item.id === args.id);
  if (index === -1) {
    console.error(`指定したIDが見つかりませんでした: ${args.id}`);
    process.exitCode = 1;
    return;
  }

  if (history[index].posted) {
    console.log(`すでに posted=true です: ${args.id}`);
    return;
  }

  history[index].posted = true;
  await writeFile(historyPath, JSON.stringify(history, null, 2) + "\n", "utf8");
  console.log(`posted=true に更新しました: ${args.id}`);
}

main().catch((error) => {
  console.error("mark_posted.mjs failed:", error.message);
  process.exitCode = 1;
});
