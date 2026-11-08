const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "main.js"), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace("export default class", "globalThis.Mod = class");
const theme = JSON.parse(fs.readFileSync(path.join(__dirname, "../../themes/herdr-personal.json")));
const colors = { ...theme.colors, selection: theme.selection, primary: theme.colors.accent,
  accent: theme.colors.hover, foreground: theme.foreground, surface: theme.background };

function fixture(accent = colors.accent) {
  let palette = { appearance: "dark", colors: { ...colors, accent }, spacing: { md: 8 }, radius: { md: 6 } };
  const writes = [], tasks = [];
  const context = vm.createContext({ View: class {}, theme: () => theme.colors,
    localStorage: { getItem: () => null },
    set_theme: value => { const copy = JSON.parse(JSON.stringify(value)); writes.push(copy); palette = { appearance: copy.appearance, ...copy.tokens }; },
  });
  vm.runInContext(source, context);
  const cx = { theme: () => palette, spawn: task => tasks.push(task) };
  new context.Mod().init({}, cx);
  // The first task sets the editor palette; the second waits for app commands.
  return { writes, run: () => tasks[0](cx), palette: () => palette };
}

// Actual editor selection colors are composited over the surface at 40%.
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  return rgb.reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(accent) {
  const channel = hex => hex.slice(1).match(/../g).map(x => parseInt(x, 16));
  const bg = channel(theme.background), fg = channel(accent);
  const mixed = "#" + bg.map((x, i) => Math.round(x * 0.6 + fg[i] * 0.4).toString(16).padStart(2, "0")).join("");
  const [a, b] = [luminance(mixed), luminance(theme.background)].sort((a, b) => b - a);
  return (a + 0.05) / (b + 0.05);
}

(async () => {
  const f = fixture(), before = JSON.parse(JSON.stringify(f.palette()));
  await f.run();
  assert.equal(f.writes.length, 1, "restored previews receive the correction on initialization");
  const expected = { ...before, colors: { ...before.colors, accent: before.colors.primary } };
  assert.deepEqual(f.palette(), expected, "only the native accent projection changes");
  assert.equal(f.palette().colors.hover, theme.colors.hover, "personal hover color stays intact");
  assert.ok(contrast(colors.accent) < 1.1, "fixture reproduces the nearly invisible selection");
  assert.ok(contrast(f.palette().colors.accent) > 1.8, "selection clearly contrasts with the preview surface");
  await f.run();
  assert.equal(f.writes.length, 1, "the correction does not create a refresh loop");
  const opaque = fixture(colors.accent + "ff"); await opaque.run();
  assert.equal(opaque.writes.length, 1, "opaque RGBA palette snapshots are accepted");
  const future = fixture("#336699"); await future.run();
  assert.equal(future.writes.length, 0, "a fixed native mapping or another custom palette is preserved");
  console.log("Editor selection palette checks passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
