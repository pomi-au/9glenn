import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { DataUtils, Mesh, BoxGeometry, MeshPhysicalMaterial } from "three";
import {
  PHOTO_DENOISE_WGSL,
  isThinGuideGlass,
} from "../model/photo-denoiser.js";
const testGeometry = new BoxGeometry(1, 1, 0.006);
const glass = new Mesh(
  testGeometry,
  new MeshPhysicalMaterial({
    transmission: 1,
    thickness: 0.006,
    ior: 1.52,
    roughness: 0.025,
  }),
);
assert(
  isThinGuideGlass(glass),
  "Clipped panes without metadata retain guide-through behavior",
);
glass.userData = { opticalSurface: "glass", paneThickness: 0.006 };
assert(
  isThinGuideGlass(glass),
  "Six-millimetre clear glass guides through to its contents",
);
glass.material.thickness = 1.4;
glass.userData = { part: "water" };
glass.material.ior = 1.333;
assert(!isThinGuideGlass(glass), "Water must retain its surface guides");
glass.userData = {};
glass.material.thickness = 0.06;
glass.material.ior = 1.52;
assert(
  !isThinGuideGlass(glass),
  "Thick refracting glass must retain surface guides",
);
glass.material.thickness = 0.006;
glass.material.roughness = 0.5;
assert(!isThinGuideGlass(glass), "Frosted glass must retain surface guides");
glass.material.dispose();
testGeometry.dispose();
const require = createRequire(import.meta.url);
const {
  chromium,
} = require("/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const width = 32,
  height = 32,
  raw = [],
  albedo = [],
  geometry = [];
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const base = y < 16 ? 0.6 : y < 20 ? 0.15 : x < 16 ? 0.8 : 0.2;
    const noise =
      y < 16
        ? 0
        : ((((x * 73 + y * 151) ^ (x * y * 31)) % 101) / 100 - 0.5) * 0.7;
    raw.push(base * (1 + noise), base * (1 + noise), base * (1 + noise), 1);
    const guideBase = y < 20 ? 0 : base;
    albedo.push(
      ...[guideBase, guideBase, guideBase, 1].map(DataUtils.toHalfFloat),
    );
    const guide = (
      y < 8
        ? [0, 0, 0, y < 4 ? 1 : 0]
        : [x < 16 ? 0 : 1, 0, x < 16 ? 1 : 0, x < 16 ? 2 : 4]
    ).map(DataUtils.toHalfFloat);
    if (y >= 8 && y < 12) guide[0] = 0x7e00; // Half-float NaN.
    if (y >= 12 && y < 16) guide[2] = 0x7c00; // Half-float infinity.
    geometry.push(...guide);
  }
const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
  args: ["--enable-unsafe-webgpu"],
  ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve("index.html")).href);
  const result = await page.evaluate(
    async ({ code, raw, albedo, geometry, width, height }) => {
      const adapter = await navigator.gpu.requestAdapter();
      const device = await adapter.requestDevice();
      device.pushErrorScope("validation");
      const shader = device.createShaderModule({ code });
      const info = await shader.getCompilationInfo();
      const layout = device.createBindGroupLayout({
        entries: [
          ...[0, 1, 2].map((binding) => ({
            binding,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: "unfilterable-float" },
          })),
          {
            binding: 3,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { access: "write-only", format: "rgba16float" },
          },
          {
            binding: 4,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: "uniform" },
          },
        ],
      });
      const pipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: shader, entryPoint: "main" },
      });
      const upload = (data, format, pixelBytes) => {
        const texture = device.createTexture({
          size: [width, height],
          format,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
          { texture },
          data,
          { bytesPerRow: width * pixelBytes },
          [width, height],
        );
        return texture;
      };
      const source = upload(new Float32Array(raw), "rgba32float", 16);
      const guides = [albedo, geometry].map((values) =>
        upload(new Uint16Array(values), "rgba16float", 8),
      );
      const targets = [0, 1].map(() =>
        device.createTexture({
          size: [width, height],
          format: "rgba16float",
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_SRC,
        }),
      );
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      for (let iteration = 0; iteration < 3; iteration++) {
        const buffer = device.createBuffer({
          size: 16,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(
          buffer,
          0,
          new Uint32Array([1 << iteration, iteration, width, height]),
        );
        const textures = [
          iteration === 0 ? source : targets[(iteration - 1) % 2],
          ...guides,
          targets[iteration % 2],
        ];
        const group = device.createBindGroup({
          layout,
          entries: [
            ...textures.map((texture, binding) => ({
              binding,
              resource: texture.createView(),
            })),
            { binding: 4, resource: { buffer } },
          ],
        });
        pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      }
      pass.end();
      const buffer = device.createBuffer({
        size: width * height * 8,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      encoder.copyTextureToBuffer(
        { texture: targets[0] },
        { buffer, bytesPerRow: width * 8 },
        [width, height],
      );
      device.queue.submit([encoder.finish()]);
      await buffer.mapAsync(GPUMapMode.READ);
      const values = Array.from(new Uint16Array(buffer.getMappedRange()));
      buffer.unmap();
      const error = await device.popErrorScope();
      device.destroy();
      return {
        values,
        error: error?.message || null,
        messages: info.messages.map((m) => ({
          type: m.type,
          message: m.message,
        })),
      };
    },
    { code: PHOTO_DENOISE_WGSL, raw, albedo, geometry, width, height },
  );
  assert.equal(result.error, null);
  assert.deepEqual(result.messages, []);
  const filtered = result.values.map(DataUtils.fromHalfFloat);
  assert(
    filtered.every(Number.isFinite),
    "Denoised HDR output must remain finite",
  );
  let rawError = 0,
    filteredError = 0,
    seamError = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4,
        expected = y < 16 ? 0.6 : y < 20 ? 0.15 : x < 16 ? 0.8 : 0.2;
      if (y < 16) {
        assert(
          Math.abs(filtered[offset] - raw[offset]) < 0.001,
          `Invalid/background guide must preserve raw color at ${x},${y}: ${filtered[offset]}`,
        );
        continue;
      }
      rawError += (raw[offset] - expected) ** 2;
      filteredError += (filtered[offset] - expected) ** 2;
      if (y >= 20 && (x === 15 || x === 16))
        seamError += Math.abs(filtered[offset] - expected) / expected;
      assert.equal(filtered[offset + 3], 1, "Alpha must remain unchanged");
    }
  const ratio = filteredError / rawError;
  assert(
    ratio < 0.3,
    `Spatial filtering must reduce noise variance substantially: ${ratio}`,
  );
  assert(
    seamError / ((height - 20) * 2) < 0.1,
    "Normal/depth/albedo edges must prevent cross-surface bleeding",
  );
  console.log(
    `PASS native WebGPU denoising: 3 dispatches, noise variance ${(ratio * 100).toFixed(1)}% of raw, depth/normal/albedo edge retained, zero/nonfinite guides preserve raw sky, black albedo remains finite, unchanged alpha`,
  );
} finally {
  await browser.close();
}
