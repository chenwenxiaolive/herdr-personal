const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFile, execFileSync } = require("node:child_process");

const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default class", "globalThis.Mod = class");

function fixture({ spaces, repos, execute, storage = new Map(), props = {} }) {
  let now = 1_000_000;
  const tasks = [], refreshed = [], online = new Set(["remote"]);
  const key = s => JSON.stringify([s.machine ?? null, s.folder]);
  const context = vm.createContext({ View: class {},
    Date: class extends Date { static now() { return now; } },
    spaces: () => spaces, panes: () => [],
    machines: () => [...online].map(name => ({ name, layout: "ready" })), exec: execute,
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  });
  vm.runInContext(source, context);
  const mod = new context.Mod();
  mod.init(props, { spawn() {}, timer: { every() {} } });
  spaces.forEach((s, i) => { mod.git[key(s)] = { repo: repos[i] }; });
  mod.refreshGit = keys => refreshed.push([...keys]);
  const cx = { notify() {}, spawn: job => tasks.push(Promise.resolve().then(() => job(cx))) };
  const settle = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  return { mod, cx, settle, refreshed, storage, online, advance: ms => { now += ms; } };
}

async function scheduling() {
  const spaces = [
    { id: "a", folder: "/a" }, { id: "a-wt", folder: "/a-wt" },
    { id: "b", folder: "/b", machine: "remote" }, { id: "c", folder: "/c" },
  ];
  const repos = ["repo-a", "repo-a", "repo-b", "repo-c"], calls = [], pending = [];
  const execute = (cmd, args, options) => { calls.push(options); return new Promise(resolve => pending.push(resolve)); };
  const f = fixture({ spaces, repos, execute });
  f.mod.fetchDue(f.cx);
  await Promise.resolve();
  assert.equal(calls.length, 2, "only two repositories fetch concurrently");
  assert.deepEqual(calls.map(c => c.cwd), ["/a", "/b"], "linked worktrees share a fetch");
  assert.equal(calls[1].on, "remote", "remote repositories fetch on their own machine");
  f.mod.fetchDue(f.cx);
  assert.equal(f.mod.fetching.size, 2, "timer ticks do not duplicate running requests");
  pending.shift()({ code: 1 });
  await new Promise(setImmediate);
  assert.equal(calls.length, 3, "a failure releases a slot for another repository");
  assert.equal(f.refreshed[0].length, 2, "every linked worktree refreshes even after a partial fetch");
  pending.splice(0).forEach(resolve => resolve({ code: 0 }));
  await f.settle();
  assert.equal(f.mod.fetchState["repo-a"].error, true);
  f.mod.fetchDue(f.cx); await f.settle();
  assert.equal(calls.length, 3, "failed repositories wait for the interval instead of looping");
  const restored = fixture({ spaces, repos, execute, storage: f.storage });
  restored.mod.fetchDue(restored.cx); await restored.settle();
  assert.equal(calls.length, 3, "reloads keep the last attempt time");
  restored.online.clear(); restored.advance(300_000);
  restored.mod.fetchDue(restored.cx); await Promise.resolve();
  assert.deepEqual(calls.slice(3).map(c => c.cwd), ["/a", "/c"], "the next interval skips offline machines");
  pending.splice(0).forEach(resolve => resolve({ code: 0 })); await restored.settle();
  assert.equal(restored.mod.fetchState["repo-a"].error, false, "a successful retry clears the error");
  const manualCalls = [];
  const manual = fixture({ spaces, repos, props: { autoFetch: false },
    execute: async (_cmd, _args, options) => { manualCalls.push(options); return { code: 0 }; } });
  manual.mod.fetchDue(manual.cx); await manual.settle();
  assert.equal(manualCalls.length, 0, "autoFetch=false disables periodic requests");
  manual.mod.fetchDue(manual.cx, true); await manual.settle();
  assert.equal(manualCalls.length, 3, "manual fetch drains all repositories even with automatic fetching off");
  manual.mod.close(); manual.mod.fetchDue(manual.cx, true); await manual.settle();
  assert.equal(manualCalls.length, 3, "closed panels schedule no new work");
}

async function realGit() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-fetch-check-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const identity = cwd => { git(cwd, "config", "user.name", "Fetch Test"); git(cwd, "config", "user.email", "fetch@example.invalid"); };
  try {
    const seed = path.join(root, "seed"), remote = path.join(root, "remote.git");
    const local = path.join(root, "local"), writer = path.join(root, "writer"), worktree = path.join(root, "worktree");
    git(root, "init", "-b", "main", seed); identity(seed);
    fs.writeFileSync(path.join(seed, "tracked"), "base\n");
    git(seed, "add", "tracked"); git(seed, "commit", "-m", "base");
    git(root, "clone", "--bare", seed, remote);
    git(root, "clone", remote, local); identity(local);
    git(root, "clone", remote, writer); identity(writer);
    fs.writeFileSync(path.join(writer, "remote-file"), "remote\n");
    git(writer, "add", "."); git(writer, "commit", "-m", "remote change"); git(writer, "push", "origin", "main");
    fs.writeFileSync(path.join(local, "local-file"), "local\n");
    git(local, "add", "."); git(local, "commit", "-m", "local change");
    git(local, "worktree", "add", "-b", "topic", worktree);
    git(worktree, "branch", "--set-upstream-to=origin/main");
    fs.appendFileSync(path.join(local, "tracked"), "uncommitted\n");
    fs.writeFileSync(path.join(local, "staged"), "staged\n"); git(local, "add", "staged");
    const fetchHead = path.join(local, ".git/FETCH_HEAD"); fs.writeFileSync(fetchHead, "preserve this\n");
    const snapshot = () => [git(local, "rev-parse", "HEAD"), git(worktree, "rev-parse", "HEAD"),
      git(local, "write-tree"), git(local, "diff"), git(local, "status", "--porcelain"), fs.readFileSync(fetchHead, "utf8")];
    const before = snapshot(), calls = [];
    const common = JSON.stringify([null, path.join(local, ".git")]);
    const f = fixture({ spaces: [{ id: "a", folder: local }, { id: "wt", folder: worktree }], repos: [common, common],
      execute: (cmd, args, options) => new Promise(resolve => {
        calls.push(options);
        execFile(cmd, args, { cwd: options.cwd, env, timeout: 30_000 }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr }));
      }) });
    f.mod.fetchDue(f.cx); await f.settle();
    assert.equal(calls.length, 1);
    assert.equal(f.mod.fetchState[common].error, false, "the actual fetch command succeeds");
    for (const cwd of [local, worktree]) assert.match(git(cwd, "rev-list", "--left-right", "--count", "HEAD...@{upstream}"), /^1\s+1$/, "fetch updates ahead/behind in each worktree");
    assert.deepEqual(snapshot(), before, "fetch preserves both HEADs, the index, worktree changes and FETCH_HEAD");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

(async () => {
  await scheduling(); await realGit();
  console.log("ok: automatic fetch interval, worktree deduplication, remote routing, concurrency, retries, persistence, disable/manual mode; real Git updates remote refs without changing working state.");
})().catch(error => { console.error(error); process.exit(1); });
