const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export default class", "globalThis.Mod = class");
const sample = (busy, idle, available = 2048) =>
  `cpu ${busy} 0 0 ${idle} 0 0 0 0 900 100\nMemTotal: 4096 kB\nMemAvailable: ${available} kB\n`;

const env = { View: class {}, spaces: () => [], panes: () => [], machines: () => [] };
const context = vm.createContext(env);
vm.runInContext(source, context);
const parse = context.parseResources, usage = context.cpuPercent;
const first = parse(sample(100, 100));
assert.equal(first.ticks, 200, "guest counters are already included and must not be counted twice");
assert.equal(first.memory, 50, "available memory, including reclaimable cache, is subtracted");
assert.equal(first.used, 2048);
assert.equal(usage(null, first), null, "one sample cannot give an interval CPU utilization");
assert.equal(usage(first, parse(sample(150, 150))), 50);
assert.equal(usage(first, parse(sample(100, 200))), 0);
assert.equal(usage(first, parse(sample(200, 100))), 100);
assert.equal(usage(first, first), null, "an unchanged counter is not a zero-percent measurement");
assert.equal(usage(first, parse(sample(1, 1))), null, "a reset counter needs a new baseline");
assert.equal(usage(first, parse(sample(300, 99))), null, "an idle counter must not go backwards");
for (const bad of ["", sample(100, 100).replace("cpu ", "cpu0 "), sample(100, 100, 5000),
  sample(100, 100).replace("MemAvailable: 2048 kB", ""), sample(100, 100).replace("100 0", "NaN 0")]) {
  assert.throws(() => parse(bad), undefined, "incomplete or invalid data must not produce plausible readings");
}

async function polling() {
  let online = [], clock = 1000, execute;
  const calls = [], tasks = [];
  const cx = { notify() {}, spawn: job => tasks.push(Promise.resolve().then(() => job(cx))) };
  const drain = async () => { while (tasks.length) await Promise.all(tasks.splice(0)); };
  const ctx = vm.createContext({ ...env, machines: () => online,
    Date: class extends Date { static now() { return clock; } },
    localStorage: { getItem: () => null },
    hc: async args => { calls.push(args); return execute(args); },
  });
  vm.runInContext(source, ctx);
  const mod = new ctx.Mod();
  mod.init({}, { spawn() {}, timer: { every() {} } });
  online = [{ name: "vps", layout: "ready" }, { name: "offline", layout: "unavailable" }];
  execute = async () => ({ code: 0, stdout: sample(100, 100) });
  mod.refreshResources(cx); await drain();
  assert.equal(calls.length, 1, "only connected remote machines are sampled");
  assert.deepEqual(Array.from(calls[0].slice(0, 7)), ["exec", "--on", "vps", "--timeout", "5", "--", "sh"]);
  assert.equal(mod.resources.vps.cpu, null);
  assert.equal(mod.resources.vps.memory, 50);
  clock += 5000;
  execute = async () => ({ code: 0, stdout: sample(125, 175, 1024) });
  mod.refreshResources(cx); await drain();
  assert.equal(mod.resources.vps.cpu, 25, "CPU uses the interval between samples");
  assert.equal(mod.resources.vps.memory, 75);

  let finish;
  execute = () => new Promise(resolve => { finish = resolve; });
  mod.refreshResources(cx); await Promise.resolve();
  const count = calls.length;
  mod.refreshResources(cx); await Promise.resolve();
  assert.equal(calls.length, count, "slow requests cannot overlap on the same machine");
  online = [];
  mod.refreshResources(cx);
  finish({ code: 0, stdout: sample(200, 200) }); await drain();
  assert.equal(mod.resources.vps, undefined, "late responses cannot restore data for an offline machine");
  assert.equal(mod.resourceCpu.vps, undefined);

  online = [{ name: "vps", layout: "ready" }];
  execute = async () => ({ code: 0, stdout: sample(300, 300) });
  mod.refreshResources(cx); await drain();
  assert.equal(mod.resources.vps.cpu, null, "reconnecting discards the old CPU baseline");
  execute = async () => ({ code: 1, stdout: "" });
  mod.refreshResources(cx); await drain();
  assert.equal(mod.resources.vps, undefined, "a failed sample clears displayed data");
  execute = async () => ({ code: 0, stdout: "not system counters" });
  mod.refreshResources(cx); await drain();
  assert.equal(mod.resources.vps, undefined, "invalid output is handled as unavailable");
  execute = () => new Promise(resolve => { finish = resolve; });
  mod.refreshResources(cx); await Promise.resolve();
  mod.close();
  finish({ code: 0, stdout: sample(400, 400) }); await drain();
  const closedCalls = calls.length;
  mod.refreshResources(cx); await drain();
  assert.equal(calls.length, closedCalls, "closed panels stop scheduling work");
  assert.equal(mod.resources.vps, undefined, "closing ignores the in-flight response");
}

polling().then(() => console.log("ok: CPU deltas, guest counters, available memory, first/reset samples, invalid data, remote routing, overlap prevention, disconnects, failures and panel shutdown."))
  .catch(error => { console.error(error); process.exit(1); });
