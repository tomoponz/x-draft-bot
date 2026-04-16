import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

test("build scripts run successfully", async () => {
  const { stdout, stderr } = await run("node", ["scripts/build_post.mjs"]);
  assert.match(`${stdout}${stderr}`, /Generated \d+ drafts\./);
});

test("pages script runs successfully", async () => {
  const { stdout } = await run("node", ["scripts/build_pages.mjs"]);
  assert.match(stdout, /docs\/index.html updated\./);
});

test("mark_posted supports --latest", async () => {
  const { stdout } = await run("node", ["scripts/mark_posted.mjs", "--latest"]);
  assert.match(stdout, /(posted=true に更新しました|すでに posted=true です)/);
});
