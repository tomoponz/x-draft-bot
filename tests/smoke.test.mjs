import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, cp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const run = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);

async function setupFixture() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "x-draft-bot-test-"));
  const tempData = path.join(tempRoot, "data");
  const tempDocs = path.join(tempRoot, "docs", "index.html");

  await cp(path.join(repoRoot, "data"), tempData, { recursive: true });

  return { tempRoot, tempData, tempDocs };
}

test("build scripts run successfully on isolated fixture", async () => {
  const { tempData } = await setupFixture();
  const { stdout, stderr } = await run("node", ["scripts/build_post.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      X_DRAFT_BOT_DATA_DIR: tempData
    }
  });

  assert.match(`${stdout}${stderr}`, /Generated \d+ drafts\./);

  const latest = JSON.parse(await readFile(path.join(tempData, "latest_drafts.json"), "utf8"));
  assert.ok(Array.isArray(latest.drafts));
  assert.ok(latest.drafts.length > 0);
});

test("pages script writes custom docs path", async () => {
  const { tempData, tempDocs } = await setupFixture();
  const { stdout } = await run("node", ["scripts/build_pages.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      X_DRAFT_BOT_DATA_DIR: tempData,
      X_DRAFT_BOT_DOCS_PATH: tempDocs
    }
  });

  assert.match(stdout, /updated\./);
  const html = await readFile(tempDocs, "utf8");
  assert.match(html, /最新の投稿候補/);
});

test("mark_posted supports --latest on isolated fixture", async () => {
  const { tempData } = await setupFixture();

  const { stdout } = await run("node", ["scripts/mark_posted.mjs", "--latest"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      X_DRAFT_BOT_DATA_DIR: tempData
    }
  });

  assert.match(stdout, /(posted=true に更新しました|すでに posted=true です)/);
});
