import { chromium, type Page, type Locator, type Download } from "playwright";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

type JsonObject = Record<string, unknown>;

type ActionStep =
  | { op: "open_url"; url: string }
  | { op: "wait_for_selector"; selector: string; timeout_ms?: number }
  | { op: "wait_for_text"; text: string; timeout_ms?: number }
  | { op: "click"; selector: string; timeout_ms?: number }
  | { op: "type"; selector: string; text: string; timeout_ms?: number }
  | {
      op: "paste_large_text";
      target?: string;
      selector?: string;
      from_file: string;
      timeout_ms?: number;
    }
  | {
      op: "upload_files";
      selector?: string;
      files: string[];
      timeout_ms?: number;
    }
  | { op: "read_dom_snapshot"; label: string }
  | { op: "screenshot"; label: string; full_page?: boolean }
  | {
      op: "download_click_and_capture";
      label: string;
      selector?: string;
      timeout_ms?: number;
    }
  | { op: "assert"; selector?: string; text?: string; timeout_ms?: number }
  | { op: "hil_pause"; reason: string };

type ActionSpec = {
  schema_version: string;
  builder_id: string;
  steps: ActionStep[];
};

type CliArgs = {
  actionSpecPath: string;
  inputsDir: string;
  runsRoot: string;
  runDir?: string;
  headless: boolean;
  jsonStdout: boolean;
  slowMoMs: number;
};

function utcTsCompact(): string {
  // YYYYMMDDTHHMMSSZ
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    String(d.getUTCFullYear()) +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function randHex(bytes = 4): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function truthyEnv(name: string): boolean {
  const v = String(process.env[name] || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y" || v === "on";
}

async function sha256File(filePath: string): Promise<string> {
  const h = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const s = createReadStream(filePath);
    s.on("data", (chunk) => h.update(chunk));
    s.on("end", () => resolve());
    s.on("error", reject);
  });
  return h.digest("hex");
}

async function writeJson(filePath: string, obj: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(obj, null, 2) + "\n", "utf-8");
}

async function writeText(filePath: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, "utf-8");
}

async function appendJsonl(filePath: string, obj: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(obj) + "\n", "utf-8");
}

function sanitizeFilename(name: string): string {
  const base = String(name || "").trim() || "download.bin";
  // Keep conservative: ASCII-ish and filesystem safe.
  return base
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/^\.+/, "_")
    .slice(0, 180);
}

async function ensureEmptyDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function loadActionSpec(actionSpecPath: string): Promise<ActionSpec> {
  const raw = await fs.readFile(actionSpecPath, "utf-8");
  const parsed = JSON.parse(raw) as JsonObject;
  const schema_version = String(parsed.schema_version || "").trim();
  const builder_id = String(parsed.builder_id || "").trim();
  const steps = parsed.steps;
  if (!schema_version || !builder_id || !Array.isArray(steps)) {
    throw new Error("invalid_action_spec");
  }
  return parsed as unknown as ActionSpec;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {
    headless: false,
    jsonStdout: false,
    slowMoMs: 0
  };

  const next = (i: number) => {
    if (i + 1 >= argv.length) throw new Error(`missing_value_for:${argv[i]}`);
    return argv[i + 1];
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--action-spec") {
      args.actionSpecPath = next(i);
      i++;
    } else if (a === "--inputs-dir") {
      args.inputsDir = next(i);
      i++;
    } else if (a === "--runs-root") {
      args.runsRoot = next(i);
      i++;
    } else if (a === "--run-dir") {
      args.runDir = next(i);
      i++;
    } else if (a === "--headless") {
      args.headless = true;
    } else if (a === "--json") {
      args.jsonStdout = true;
    } else if (a === "--slowmo-ms") {
      args.slowMoMs = Number(next(i));
      i++;
    } else if (a === "--help" || a === "-h") {
      const msg =
        "Usage: tsx run_action_spec.ts --action-spec <path> --inputs-dir <dir> [--runs-root runs/app_builder] [--run-dir <dir>] [--headless] [--json] [--slowmo-ms <n>]\n";
      process.stdout.write(msg);
      process.exit(0);
    }
  }

  if (!args.actionSpecPath) throw new Error("missing --action-spec");
  if (!args.inputsDir) throw new Error("missing --inputs-dir");
  if (!args.runsRoot) args.runsRoot = "runs/app_builder";

  return args as CliArgs;
}

async function hilPause(reason: string, evidenceDir: string): Promise<void> {
  const auto = truthyEnv("SOCA_HIL_AUTO");
  const entry = {
    type: "hil_pause",
    reason,
    auto,
    at_utc: new Date().toISOString()
  };
  await appendJsonl(path.join(evidenceDir, "actions_log.jsonl"), entry);

  if (auto) return;
  if (!process.stdin.isTTY) {
    throw new Error("hil_required_no_tty");
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  try {
    const answer = (
      await rl.question(
        `HIL required: ${reason}\nType CONTINUE to proceed, or anything else to abort: `
      )
    )
      .trim()
      .toUpperCase();
    if (answer !== "CONTINUE") {
      throw new Error("hil_abort");
    }
  } finally {
    rl.close();
  }
}

async function resolveTargetLocator(
  page: Page,
  builderId: string,
  target: string
): Promise<Locator> {
  const t = String(target || "").trim();
  if (!t) throw new Error("missing_target");

  // Conservative, fail-closed: if heuristic resolution finds nothing, we error.
  // NOTE: these are intentionally minimal and may need tuning per vendor UI.
  if (builderId === "google_ai_studio_build") {
    if (t === "system_instructions") {
      const byLabel = page.getByLabel(/system instructions/i);
      if ((await byLabel.count()) > 0) return byLabel.first();
      const byText = page.getByText(/system instructions/i);
      if ((await byText.count()) > 0) {
        const near = byText.first().locator("xpath=following::textarea[1]");
        if ((await near.count()) > 0) return near.first();
      }
      const anyTextarea = page.locator("textarea");
      if ((await anyTextarea.count()) > 0) return anyTextarea.first();
      throw new Error("target_not_found:system_instructions");
    }
    if (t === "main_prompt") {
      const anyTextarea = page.locator("textarea");
      const count = await anyTextarea.count();
      if (count > 0) return anyTextarea.nth(count - 1);
      const editable = page.locator("[contenteditable='true']");
      if ((await editable.count()) > 0) return editable.first();
      throw new Error("target_not_found:main_prompt");
    }
  }

  if (builderId === "lovable") {
    if (t === "main_prompt") {
      const anyTextarea = page.locator("textarea");
      if ((await anyTextarea.count()) > 0) return anyTextarea.first();
      const editable = page.locator("[contenteditable='true']");
      if ((await editable.count()) > 0) return editable.first();
      throw new Error("target_not_found:lovable_main_prompt");
    }
  }

  throw new Error(`unsupported_target:${builderId}:${t}`);
}

async function setEditable(
  locator: Locator,
  text: string,
  timeoutMs?: number
): Promise<void> {
  await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs ?? 30_000 });
  await locator.click({ timeout: timeoutMs ?? 30_000 });
  // Playwright supports fill on textarea/input/contenteditable.
  await locator.fill(text, { timeout: timeoutMs ?? 30_000 });
}

async function copyInputFile(srcPath: string, dstPath: string): Promise<void> {
  await fs.mkdir(path.dirname(dstPath), { recursive: true });
  await fs.copyFile(srcPath, dstPath);
}

async function writeSha256Manifest(evidenceDir: string): Promise<string> {
  const entries: Array<{ rel: string; abs: string }> = [];
  async function walk(dir: string) {
    const list = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of list) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(p);
      } else if (ent.isFile()) {
        if (ent.name === "sha256.txt") continue;
        entries.push({
          abs: p,
          rel: path.relative(evidenceDir, p).split(path.sep).join("/")
        });
      }
    }
  }
  await walk(evidenceDir);
  entries.sort((a, b) => a.rel.localeCompare(b.rel));
  const lines: string[] = [];
  for (const e of entries) {
    const h = await sha256File(e.abs);
    lines.push(`${h}  ${e.rel}`);
  }
  const manifestPath = path.join(evidenceDir, "sha256.txt");
  await writeText(manifestPath, lines.length ? lines.join("\n") + "\n" : "");
  return manifestPath;
}

async function validateEvidenceRequiredArtifacts(
  evidenceDir: string
): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  const existsNonEmptyDir = async (p: string) => {
    try {
      const st = await fs.stat(p);
      if (!st.isDirectory()) return false;
      const files = (await fs.readdir(p)).filter((x) => x !== ".DS_Store");
      return files.length > 0;
    } catch {
      return false;
    }
  };
  const existsNonEmptyFile = async (p: string) => {
    try {
      const st = await fs.stat(p);
      return st.isFile() && st.size > 0;
    } catch {
      return false;
    }
  };

  if (!(await existsNonEmptyDir(path.join(evidenceDir, "rendered_prompts"))))
    missing.push("rendered_prompts");
  if (!(await existsNonEmptyFile(path.join(evidenceDir, "actions_log.jsonl"))))
    missing.push("actions_log_jsonl");
  if (!(await existsNonEmptyDir(path.join(evidenceDir, "dom_snapshots"))))
    missing.push("dom_snapshots");
  if (!(await existsNonEmptyDir(path.join(evidenceDir, "screenshots"))))
    missing.push("screenshots");
  if (
    !(await existsNonEmptyDir(path.join(evidenceDir, "downloaded_artifacts")))
  )
    missing.push("downloaded_artifacts");
  if (!(await existsNonEmptyFile(path.join(evidenceDir, "sha256.txt"))))
    missing.push("sha256_manifest");

  return { ok: missing.length === 0, missing };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const actionSpecPath = path.resolve(args.actionSpecPath);
  const inputsDir = path.resolve(args.inputsDir);
  const runsRoot = path.resolve(args.runsRoot);

  const spec = await loadActionSpec(actionSpecPath);

  const runDir =
    args.runDir && String(args.runDir).trim()
      ? path.resolve(args.runDir)
      : path.join(
          runsRoot,
          new Date().toISOString().slice(0, 10).replaceAll("-", "/"),
          `${utcTsCompact()}-${spec.builder_id}-${randHex(4)}`
        );
  const evidenceDir = path.join(runDir, "evidence");

  await ensureEmptyDir(evidenceDir);
  await ensureEmptyDir(path.join(evidenceDir, "rendered_prompts"));
  await ensureEmptyDir(path.join(evidenceDir, "uploaded_inputs"));
  await ensureEmptyDir(path.join(evidenceDir, "dom_snapshots"));
  await ensureEmptyDir(path.join(evidenceDir, "screenshots"));
  await ensureEmptyDir(path.join(evidenceDir, "downloaded_artifacts"));

  const startedUtc = new Date().toISOString();
  await writeJson(path.join(evidenceDir, "run_context.json"), {
    schema_version: "soca.openbrowser.app_builder.run_context.v1",
    created_utc: startedUtc,
    action_spec_path: actionSpecPath,
    inputs_dir: inputsDir,
    builder_id: spec.builder_id,
    headless: args.headless,
    slowMoMs: args.slowMoMs,
    env_context: {
      approval_policy: process.env.SOCA_APPROVAL_POLICY || "UNKNOWN",
      sandbox_mode: process.env.SOCA_SANDBOX_MODE || "UNKNOWN",
      network_access: process.env.SOCA_NETWORK_ACCESS || "UNKNOWN",
      hil_auto: truthyEnv("SOCA_HIL_AUTO")
    }
  });
  await writeJson(path.join(evidenceDir, "action_spec.json"), spec);

  const actionsLogPath = path.join(evidenceDir, "actions_log.jsonl");
  await writeText(actionsLogPath, "");

  const downloads: Array<{
    label: string;
    filename: string;
    path: string;
    sha256: string;
  }> = [];
  let failure: { step_index: number; op: string; error: string } | null = null;
  let lastClickSelector: string | null = null;

  const browser = await chromium.launch({
    headless: args.headless,
    slowMo: args.slowMoMs > 0 ? args.slowMoMs : undefined
  });

  const context = await browser.newContext({
    acceptDownloads: true
  });
  const page = await context.newPage();

  const stepTimeoutDefault = 30_000;

  const recordStep = async (payload: JsonObject) => {
    await appendJsonl(actionsLogPath, payload);
  };

  const captureErrorArtifacts = async (stepIndex: number) => {
    try {
      const label = `error_step_${String(stepIndex).padStart(3, "0")}`;
      const shotPath = path.join(evidenceDir, "screenshots", `${label}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      const htmlPath = path.join(evidenceDir, "dom_snapshots", `${label}.html`);
      const html = await page.content();
      await writeText(htmlPath, html);
    } catch {
      // Best effort.
    }
  };

  try {
    for (let i = 0; i < spec.steps.length; i++) {
      if (failure) break;
      const step = spec.steps[i];
      const op = (step as any).op as string;
      const started = Date.now();
      const startedIso = new Date().toISOString();

      const baseLog: JsonObject = {
        type: "action_step",
        step_index: i,
        op,
        started_utc: startedIso
      };

      try {
        if (op === "open_url") {
          const url = (step as any).url as string;
          if (!url) throw new Error("missing_url");
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 90_000
          });
        } else if (op === "wait_for_selector") {
          const selector = (step as any).selector as string;
          const timeout = (step as any).timeout_ms ?? stepTimeoutDefault;
          await page.waitForSelector(selector, { timeout });
        } else if (op === "wait_for_text") {
          const text = (step as any).text as string;
          const timeout = (step as any).timeout_ms ?? 60_000;
          await page.waitForFunction(
            (t) => {
              const body = document.body;
              if (!body) return false;
              const s = body.innerText || "";
              return s.includes(String(t));
            },
            text,
            { timeout }
          );
        } else if (op === "click") {
          const selector = (step as any).selector as string;
          const timeout = (step as any).timeout_ms ?? stepTimeoutDefault;
          lastClickSelector = selector;
          await page.locator(selector).first().click({ timeout });
        } else if (op === "type") {
          const selector = (step as any).selector as string;
          const text = (step as any).text as string;
          const timeout = (step as any).timeout_ms ?? stepTimeoutDefault;
          const loc = page.locator(selector).first();
          await setEditable(loc, text, timeout);
        } else if (op === "paste_large_text") {
          const fromFile = (step as any).from_file as string;
          const timeout = (step as any).timeout_ms ?? stepTimeoutDefault;
          const abs = path.join(inputsDir, fromFile);
          const text = await fs.readFile(abs, "utf-8");
          await copyInputFile(
            abs,
            path.join(evidenceDir, "rendered_prompts", path.basename(fromFile))
          );

          let loc: Locator | null = null;
          const selector = (step as any).selector as string | undefined;
          const target = (step as any).target as string | undefined;
          if (selector) {
            loc = page.locator(selector).first();
          } else if (target) {
            loc = await resolveTargetLocator(page, spec.builder_id, target);
          } else {
            throw new Error("paste_large_text_requires_selector_or_target");
          }
          await setEditable(loc, text, timeout);
        } else if (op === "upload_files") {
          const files = ((step as any).files || []) as string[];
          if (!Array.isArray(files) || files.length === 0)
            throw new Error("upload_files_missing_files");
          const timeout = (step as any).timeout_ms ?? 60_000;
          const selector = (step as any).selector as string | undefined;
          const loc = selector
            ? page.locator(selector).first()
            : page.locator("input[type='file']").first();
          const absFiles: string[] = [];
          for (const f of files) {
            const abs = path.join(inputsDir, f);
            absFiles.push(abs);
            await copyInputFile(
              abs,
              path.join(evidenceDir, "uploaded_inputs", path.basename(f))
            );
          }
          await loc.setInputFiles(absFiles, { timeout });
        } else if (op === "read_dom_snapshot") {
          const label = (step as any).label as string;
          if (!label) throw new Error("missing_label");
          const html = await page.content();
          const outPath = path.join(
            evidenceDir,
            "dom_snapshots",
            `${sanitizeFilename(label)}.html`
          );
          await writeText(outPath, html);
        } else if (op === "screenshot") {
          const label = (step as any).label as string;
          const fullPage = Boolean((step as any).full_page);
          if (!label) throw new Error("missing_label");
          const outPath = path.join(
            evidenceDir,
            "screenshots",
            `${sanitizeFilename(label)}.png`
          );
          await page.screenshot({ path: outPath, fullPage });
        } else if (op === "download_click_and_capture") {
          const label = (step as any).label as string;
          const selector = (step as any).selector as string | undefined;
          const timeout = (step as any).timeout_ms ?? 180_000;
          if (!label) throw new Error("missing_label");

          // HIL-gated by default because downloads are explicit policy gate in the lane.
          await hilPause(`download_or_export_code: ${label}`, evidenceDir);

          const clickSelector = selector || lastClickSelector;
          if (!clickSelector) {
            throw new Error("download_click_and_capture_missing_selector");
          }
          const downloadPromise = page.waitForEvent("download", { timeout });
          await page
            .locator(clickSelector)
            .first()
            .click({ timeout: stepTimeoutDefault });
          const download = await downloadPromise;
          const saved = await saveDownload(download, evidenceDir, label);
          downloads.push(saved);
        } else if (op === "assert") {
          const selector = (step as any).selector as string | undefined;
          const text = (step as any).text as string | undefined;
          const timeout = (step as any).timeout_ms ?? stepTimeoutDefault;
          if (selector) {
            const count = await page.locator(selector).count();
            if (count <= 0)
              throw new Error(`assert_failed_selector:${selector}`);
          } else if (text) {
            await page.waitForFunction(
              (t) => (document.body?.innerText || "").includes(String(t)),
              text,
              { timeout }
            );
          } else {
            throw new Error("assert_requires_selector_or_text");
          }
        } else if (op === "hil_pause") {
          const reason = (step as any).reason as string;
          await hilPause(reason || "HIL checkpoint", evidenceDir);
        } else {
          throw new Error(`unsupported_op:${op}`);
        }

        const endedIso = new Date().toISOString();
        await recordStep({
          ...baseLog,
          ok: true,
          ended_utc: endedIso,
          duration_ms: Date.now() - started
        });
      } catch (e: any) {
        const endedIso = new Date().toISOString();
        const msg = String(e?.message || e);
        await captureErrorArtifacts(i);
        await recordStep({
          ...baseLog,
          ok: false,
          ended_utc: endedIso,
          duration_ms: Date.now() - started,
          error: msg
        });
        failure = { step_index: i, op, error: msg };
        // Fail-closed: stop the run after first failure, but still emit summary + manifest.
        break;
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const endedUtc = new Date().toISOString();
  await writeSha256Manifest(evidenceDir);
  const required = await validateEvidenceRequiredArtifacts(evidenceDir);

  const summary = {
    ok: failure === null && required.ok,
    builder_id: spec.builder_id,
    started_utc: startedUtc,
    ended_utc: endedUtc,
    run_dir: runDir,
    evidence_dir: evidenceDir,
    downloads,
    failure,
    evidence_required: required
  };
  await writeJson(path.join(evidenceDir, "run_summary.json"), summary);

  if (args.jsonStdout) {
    process.stdout.write(JSON.stringify(summary) + "\n");
  } else {
    process.stdout.write(`${summary.ok ? "OK" : "FAIL"}: ${runDir}\n`);
  }

  if (!summary.ok) {
    process.exitCode = 2;
  }
}

async function saveDownload(
  download: Download,
  evidenceDir: string,
  label: string
): Promise<{ label: string; filename: string; path: string; sha256: string }> {
  const suggested = sanitizeFilename(download.suggestedFilename());
  const downloadsDir = path.join(evidenceDir, "downloaded_artifacts");
  await fs.mkdir(downloadsDir, { recursive: true });
  let outPath = path.join(
    downloadsDir,
    `${sanitizeFilename(label)}__${suggested}`
  );
  // Avoid clobbering.
  for (let i = 0; i < 10; i++) {
    try {
      await fs.stat(outPath);
      const ext = path.extname(outPath);
      const base = outPath.slice(0, outPath.length - ext.length);
      outPath = `${base}.${i + 1}${ext}`;
    } catch {
      break;
    }
  }
  await download.saveAs(outPath);
  const h = await sha256File(outPath);
  await writeJson(path.join(downloadsDir, `${sanitizeFilename(label)}.json`), {
    label,
    suggestedFilename: suggested,
    savedPath: outPath,
    sha256: h
  });
  return { label, filename: suggested, path: outPath, sha256: h };
}

main().catch(async (err) => {
  const msg = String((err as any)?.message || err);
  process.stderr.write(msg + "\n");
  process.exit(2);
});
