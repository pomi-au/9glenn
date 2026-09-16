import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
import { DataTexture, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, WebGPURenderer } from 'three/webgpu';
import { AtlasTexture } from 'three-gpu-pathtracer/src/webgpu/AtlasTexture.js';
import { installPhotoAtlasCompatibility } from './model/photo-atlas.js';
import { createPhotoScene } from './model/photo-scene.js';
window.checkFoliage = async () => {
  const renderer = new WebGPURenderer({forceWebGL:false});
  renderer._getFallback = null;
  await renderer.init();
  if (!renderer.backend.isWebGPUBackend) throw new Error('Native WebGPU required');
  const size = 64, leafBytes = new Uint8Array(size*size*4), reliefBytes = new Uint8Array(size*size*4);
  let expectedOpaque = 0;
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const index = (y*size+x)*4;
    const leaf = ((x-32)/22)**2 + ((y-32)/28)**2 < 1;
    leafBytes.set([24,180,40,leaf?255:0], index);
    reliefBytes.set([128,128,255,255], index);
    expectedOpaque += Number(leaf);
  }
  const leaves = new DataTexture(leafBytes,size,size);
  const relief = new DataTexture(reliefBytes,size,size);
  leaves.needsUpdate = relief.needsUpdate = true;
  // Deterministic packing order makes the UV1 texture compile the shared blit
  // material first. The leaf tile's transparent corner exposes the old defect.
  relief.source.uuid = '00000000-0000-0000-0000-000000000000';
  leaves.source.uuid = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  relief.channel = 1;
  relief.offset.set(.2,.3); relief.repeat.set(2,3); relief.updateMatrix();
  const originalMatrix = relief.matrix.clone();
  async function readAtlas() {
    const atlas = new AtlasTexture();
    try {
      atlas.setTextures(renderer,[leaves,relief]);
      const info = atlas.textureInfo[0];
      const bytes = await renderer.readRenderTargetPixelsAsync(atlas.renderTarget,
        info.x&65535,info.x>>>16,info.y&65535,info.y>>>16,0,info.z&65535);
      let opaque=0,transparent=0;
      for(let i=3;i<bytes.length;i+=4) {
        opaque += Number(bytes[i]>=115);
        transparent += Number(bytes[i]<115);
      }
      return {opaque,transparent};
    } finally { atlas.dispose(); }
  }
  const before = await readAtlas();
  installPhotoAtlasCompatibility();
  const wrapper = AtlasTexture.prototype._renderTextures;
  installPhotoAtlasCompatibility();
  const idempotent = wrapper === AtlasTexture.prototype._renderTextures;
  const after = await readAtlas();
  const source = new Scene();
  const material = new MeshStandardMaterial({map:leaves,alphaTest:.45,side:DoubleSide});
  material.userData.generatedTexture = 'foliage';
  const crown = new InstancedMesh(new PlaneGeometry(2,2),material,420);
  for(let i=0;i<crown.count;i++) crown.setMatrixAt(i,new Matrix4().makeTranslation(i*.01,2,0));
  source.add(crown);
  const snapshot = createPhotoScene(source,new PerspectiveCamera());
  const copy = snapshot.scene.children[0];
  const snapshotOK = copy.isInstancedMesh && copy.count===420 && copy.material===material &&
    copy.material.alphaTest===.45 && copy.material.side===DoubleSide &&
    copy.instanceMatrix.array.every((v,i)=>v===crown.instanceMatrix.array[i]);
  snapshot.dispose(); crown.geometry.dispose(); material.dispose();
  const result = {before,after,expectedOpaque,idempotent,snapshotOK,
    channelPreserved:relief.channel===1,matrixPreserved:relief.matrix.equals(originalMatrix)};
  leaves.dispose(); relief.dispose(); renderer.dispose();
  return result;
};`,
  },
  bundle: true,
  write: false,
  format: "iife",
  logLevel: "silent",
});
const directory = await mkdtemp(path.join(tmpdir(), "photo-foliage-"));
await writeFile(
  path.join(directory, "index.html"),
  "<!doctype html><title>Photo foliage regression</title>",
);
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--enable-unsafe-webgpu", "--disable-frame-rate-limit"],
  ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("file://" + path.join(directory, "index.html"));
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(() => window.checkFoliage());
  assert.equal(
    result.before.opaque,
    0,
    "fixture reproduces upstream UV1 atlas alpha loss",
  );
  assert.equal(
    result.after.opaque,
    result.expectedOpaque,
    "every opaque leaf pixel survives atlas upload",
  );
  assert.equal(
    result.after.transparent,
    64 * 64 - result.expectedOpaque,
    "transparent leaf holes remain transparent",
  );
  assert.equal(
    result.channelPreserved,
    true,
    "actual door material retains UV1",
  );
  assert.equal(
    result.matrixPreserved,
    true,
    "source texture transforms remain untouched",
  );
  assert.equal(result.idempotent, true);
  assert.equal(
    result.snapshotOK,
    true,
    "native foliage instances and alpha material survive Photo snapshot",
  );
  assert.deepEqual(errors, []);
  console.log("PASS native Photo foliage:", JSON.stringify(result));
} finally {
  await browser.close();
  await rm(directory, { recursive: true, force: true });
}
