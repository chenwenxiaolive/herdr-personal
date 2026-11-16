const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default class", "globalThis.Mod = class");

function fixture(storage = new Map()) {
  const list = [], terms = [], notices = [], closed = [], jobs = [];
  const hosts = [{ name: "remote", layout: "ready" }];
  const context = vm.createContext({ View: class {},
    agents: () => list, terminals: () => terms, spaces: () => [], panes: () => [],
    machines: () => hosts, window: () => ({ platform: "unknown" }),
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    notify: n => { notices.push(n); return `toast-${notices.length}`; },
    closeOverlay: id => closed.push(id),
  });
  vm.runInContext(source, context);
  const mod = new context.Mod();
  mod.init({}, { spawn() {}, timer: { every() {} } });
  const cx = { spawn: job => jobs.push(job) };
  const drain = async () => { while (jobs.length) await jobs.shift()(cx); };
  return { mod, list, terms, hosts, storage, notices, closed, drain,
    sync: () => mod.syncQuestions(list, cx),
    counts: () => context.agentCounts(list), matches: context.needsAnswer };
}

const codex = (address = "remote/t1", space = "sample-space") => ({ address, space, space_name: space,
  app: "codex", program: { key: "codex" }, title: "[ ! ] Action Required | Review pending changes | sample-space",
  status: "working", focused: true });

(async () => {
  const f = fixture(), a = codex(); f.list.push(a);
  for (const title of ["Action Required", "Action Required | Fix", "[!] Action Required | Fix", "[ ! ] Action Required | Fix", "[.] Action Required | Fix", "[ . ] Action Required | Fix", "⚠ Action Required — Fix"])
    assert.equal(f.matches({ ...a, title }), true, title);
  for (const title of ["Fix Action Required parser", "Action Requiredness", "Working | Fix", "", "~/Action Required", "[task] Action Required | Fix", "[ . ] Working | Fix"])
    assert.equal(f.matches({ ...a, title }), false, title);
  assert.equal(f.matches({ ...a, app: "claude-code", program: { key: "claude" } }), false);
  assert.equal(f.matches({ ...a, app: null }), true, "program identity is a supported fallback");

  f.sync(); f.sync(); await f.drain();
  assert.equal(f.notices.length, 1, "pending questions alert even in the focused Space");
  assert.equal(f.notices[0].title, "sample-space · 待回答");
  assert.equal(f.notices[0].action.name, "agent.focus");
  assert.equal(f.notices[0].action.args.terminal, a.address, "click targets the actual remote agent");
  assert.equal(f.counts().get(a.space).question, 1);
  assert.equal(f.counts().get(a.space).working, undefined);
  assert.equal(a.status, "working", "the core lifecycle is never rewritten");
  for (let frame = 0; frame < 20; frame++) {
    a.title = `[ ${frame % 2 ? "!" : "."} ] Action Required | Review pending changes | sample-space`;
    f.sync(); await f.drain();
    assert.equal(f.counts().get(a.space).question, 1, "every title animation frame keeps the same badge");
    assert.equal(f.notices.length, 1, "title blinking never posts a second toast");
    assert.equal(f.closed.length, 0, "title blinking never closes the existing toast");
  }
  a.title = "Action Required | Another task title"; a.seq = 100;
  f.sync(); await f.drain();
  assert.equal(f.notices.length, 1, "output/title suffix updates don't re-alert");

  const reload = fixture(f.storage); reload.list.push(a); reload.sync(); await reload.drain();
  assert.equal(reload.notices.length, 0, "hot reload/restart preserves deduplication");
  f.hosts[0].layout = "unavailable"; f.list.length = 0; f.sync();
  f.hosts[0].layout = "ready"; f.list.push(a); f.sync(); await f.drain();
  assert.equal(f.notices.length, 1, "a temporary disconnect doesn't repeat an existing question");

  a.title = "Review pending changes"; f.sync(); await f.drain();
  assert.equal(f.counts().get(a.space).working, 1, "answering restores the underlying working state");
  assert.deepEqual(f.closed, ["toast-1"], "answering dismisses an outstanding toast");
  assert.deepEqual(JSON.parse(f.storage.get("codex.questions.seen")), []);
  a.status = "idle"; assert.equal(f.counts().get(a.space).idle, 1);
  a.status = "blocked"; assert.equal(f.counts().get(a.space).blocked, 1, "native blocked remains intact");
  a.title = "Action Required | Follow-up"; f.sync(); await f.drain();
  assert.equal(f.notices.length, 2, "a subsequent question alerts again");

  const b = codex("remote/t2", "other-space"); f.list.push(b); f.sync(); await f.drain();
  assert.equal(f.notices.length, 3, "separate agents get independent alerts");
  f.list.push({ address: "remote/parent", space: "parent-space", status: "working", app: "codex" });
  f.terms.push({ address: a.address, parent: "remote/parent", state: "live", status: "working" });
  a.status = "working";
  assert.equal(f.counts().get(a.space).question, 1, "the question stays in its actual Space");
  assert.equal(f.counts().get("parent-space").question, undefined, "a child's question does not label the parent's Space");
  assert.equal(f.counts().get("parent-space").working, 1);
  a.status = "blocked";
  assert.equal(f.counts().get("parent-space").blocked, 1, "native child status propagation is preserved");
  f.terms[0].state = "exited";
  assert.equal(f.counts().get("parent-space").working, 1, "exited children don't keep their parent pending");
  f.list.at(-1).title = "[ . ] Action Required | Parent's own question";
  assert.equal(f.counts().get("parent-space").question, 1, "the parent's own question still labels its Space");

  const race = fixture(), c = codex(); race.list.push(c); race.sync();
  c.title = "Working"; race.sync(); await race.drain();
  assert.equal(race.notices.length, 0, "a question answered before dispatch never produces a stale toast");
  c.title = "Action Required | Next"; race.sync(); race.mod.close(); await race.drain();
  assert.equal(race.notices.length, 0, "a closed mod cannot post delayed alerts");
  f.list.length = 0; f.sync(); await f.drain();
  assert.equal(f.mod.questionSeen.size, 0, "ended/removed agents release deduplication state");
  console.log("ok: Codex title animation, question Space isolation, status recovery, toast routing, deduplication, reloads, reconnects and races.");
})().catch(error => { console.error(error); process.exitCode = 1; });
