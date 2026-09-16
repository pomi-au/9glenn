import { build } from "esbuild";

// Bundle image imports away for this CPU-only material check. The test supplies
// a loaded synthetic height map, so no DOM or GPU is needed.
const result = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
import assert from 'node:assert/strict';
import { MeshStandardMaterial, DataTexture, RepeatWrapping, ClampToEdgeWrapping } from 'three';
import { createDoorReliefMaterial, awaitDoorReliefMaterials } from './model/door-relief-material.js';
import { carvedDoorLayout } from './model/door-relief.js';
const bytes = new Uint8Array(16 * 16 * 4);
for (let i = 0; i < 256; i++) {
  bytes[i*4] = bytes[i*4+1] = bytes[i*4+2] = (i % 16) * 17;
  bytes[i*4+3] = 255;
}
const grain = new DataTexture(bytes, 16, 16);
grain.wrapS = grain.wrapT = RepeatWrapping;
const base = new MeshStandardMaterial({map:grain, roughnessMap:grain, bumpMap:grain});
const layout = carvedDoorLayout({width:0.9, height:2.1, thickness:0.04});
const options = {...layout, depth:0.008, woodUVOffset:[0.12,0.3]};
const material = createDoorReliefMaterial(base, options);
const shared = createDoorReliefMaterial(base, options);
await awaitDoorReliefMaterials();
assert.equal(material.map, base.map);
assert.equal(material.roughnessMap, base.roughnessMap);
assert.equal(material.bumpMap, shared.bumpMap);
assert.equal(material.normalMap, shared.normalMap);
assert.equal(base.bumpMap, grain);
assert.equal(material.userData.doorRelief.depth, 0.0011, 'macro geometry depth cannot amplify fine carving');
for (const map of [material.bumpMap, material.normalMap]) {
  assert.equal(map.channel, 1);
  assert.equal(map.wrapS, ClampToEdgeWrapping);
  assert.equal(map.wrapT, ClampToEdgeWrapping);
  assert.deepEqual(map.repeat.toArray(), [1,1]);
  assert.deepEqual(map.offset.toArray(), [0,0]);
}
const b = material.bumpMap.image.data, n = material.normalMap.image.data;
let min = 255, max = 0, normalVariation = 0;
for (let i = 0; i < b.length; i += 4) {
  min = Math.min(min, b[i]); max = Math.max(max, b[i]);
  normalVariation = Math.max(normalVariation, Math.abs(n[i]-128), Math.abs(n[i+1]-128));
  assert.equal(b[i+3],255); assert.equal(n[i+3],255);
  const length = Math.hypot(n[i]/255*2-1, n[i+1]/255*2-1, n[i+2]/255*2-1);
  assert.ok(Number.isFinite(length) && Math.abs(length-1)<0.015, 'finite unit normal');
}
assert.ok(max-min>60, 'physical height contains visible recessed fine carving');
assert.ok(normalVariation>20, 'normal map contains carving slopes');
for (const panel of layout.panels) {
  const x = Math.round(((panel.left+panel.fieldInset+0.012)/layout.width+0.5)*384-0.5);
  const y = Math.round(((panel.top+panel.bottom)/2/layout.height+0.5)*768-0.5);
  assert.ok(b[(y*384+x)*4]<110, 'router cut aligns with actual panel interior');
}
console.log('PASS door relief material: shared generated finishes, bounded whole-leaf height/normal maps, UV1 layout and physical carving depth');
`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  loader: { ".png": "empty", ".jpg": "empty" },
  logLevel: "silent",
});
await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
