const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const fs = require("node:fs"),
  path = require("node:path");
const OUT = path.resolve("audit/elevation-match");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
    ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
    args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 2800, height: 1100 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("file://" + path.resolve("9-glenn-viewer.html") + "#3d");
    await page.waitForFunction(() => window.Building3D?.instance);
    await page.addScriptTag({
      path: path.resolve("tmp/elevation-match/render.js"),
    });
    const all = [];
    for (const view of ["front", "rear", "left", "right"]) {
      const result = await page.evaluate(
        (view) => ElevationAudit.renderView(Building3D.instance, view),
        view,
      );
      fs.writeFileSync(
        path.resolve(`tmp/elevation-match/${view}.f32`),
        Buffer.from(result.buffer, "base64"),
      );
      delete result.buffer;
      fs.writeFileSync(
        path.join(OUT, `${view}-model-flat.png`),
        Buffer.from(result.flat.split(",")[1], "base64"),
      );
      delete result.flat;
      all.push(result);
      const source = fs.readFileSync(`drawings/${result.drawing}.svg`, "utf8");
      fs.writeFileSync(
        path.join(OUT, "before", `${result.drawing}.svg`),
        source,
      );
      const svg = await page.evaluate(
        ({ source, result }) => {
          const doc = new DOMParser().parseFromString(source, "image/svg+xml"),
            svg = doc.documentElement;
          svg.setAttribute("viewBox", result.bounds.join(" "));
          svg.setAttribute("width", result.width);
          svg.setAttribute("height", result.height);
          svg
            .querySelectorAll(
              '[data-layer="dimensions"],[data-layer="labels"],text,title',
            )
            .forEach((el) => el.remove());
          // Remove below-grade cellar notation; retain every above-grade façade line,
          // including the drafting symbols which have no physical 3D counterpart.
          svg.querySelectorAll(".dash").forEach((el) => {
            const nums = (el.getAttribute("points") || "")
              .trim()
              .split(/[ ,]+/)
              .map(Number);
            if (
              nums.length &&
              nums.filter((_, i) => i % 2).every((y) => y > 6041)
            )
              el.remove();
          });
          svg
            .querySelectorAll('[data-layer="fixtures"] polyline')
            .forEach((el) => {
              const nums = (el.getAttribute("points") || "")
                .trim()
                .split(/[ ,]+/)
                .map(Number);
              if (nums.length === 4 && nums[1] < 0 && nums[3] < 0) el.remove();
            });
          const style = doc.createElementNS(
            "http://www.w3.org/2000/svg",
            "style",
          );
          style.textContent =
            "*{stroke:#000!important} svg{background:white} .room{fill:white!important;stroke:none!important}";
          svg.appendChild(style);
          return new XMLSerializer().serializeToString(svg);
        },
        { source, result },
      );
      fs.writeFileSync(path.join(OUT, `${view}-drawing.svg`), svg);
      const preview = await browser.newPage({
        viewport: { width: result.width, height: result.height },
        deviceScaleFactor: 1,
      });
      await preview.goto("file://" + path.join(OUT, `${view}-drawing.svg`));
      await preview
        .locator("svg")
        .screenshot({ path: path.join(OUT, `${view}-drawing.png`) });
      await preview.close();
      console.log(
        `Captured ${view}: ${result.width}×${result.height}, ${result.actual.length} visible model openings / ${result.expected.length} drawing rectangles`,
      );
    }
    const crypto = require("node:crypto");
    const sources = Object.fromEntries(
      [
        "9-glenn-viewer.html",
        "model/build-model.js",
        "model/model-geometry.js",
        "assets/building-spec.json",
        ...all.map((v) => `drawings/${v.drawing}.svg`),
      ].map((p) => [
        p,
        crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"),
      ]),
    );
    fs.writeFileSync(
      path.join(OUT, "capture.json"),
      JSON.stringify({ views: all, errors, sources }, null, 2),
    );
    if (errors.length) throw new Error(errors.join("\n"));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
