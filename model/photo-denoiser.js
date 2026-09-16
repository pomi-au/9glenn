import {
  Color,
  ColorManagement,
  HalfFloatType,
  NearestFilter,
  NoToneMapping,
  RenderTarget,
  StorageTexture,
} from "three/webgpu";
import { diffuseColor, mrt, normalView, positionView, vec4 } from "three/tsl";

// A bounded, spatial à-trous filter. No history or external model weights are
// retained, so changing camera/scene cannot leak an older image into a render.
export const PHOTO_DENOISE_WGSL = /* wgsl */ `
struct Settings { step: u32, iteration: u32, width: u32, height: u32 }
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var albedo: texture_2d<f32>;
@group(0) @binding(2) var geometry: texture_2d<f32>;
@group(0) @binding(3) var result: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<uniform> settings: Settings;
fn luminance(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn finite4(value: vec4f) -> bool {
  return all((bitcast<vec4u>(value) & vec4u(0x7f800000u)) != vec4u(0x7f800000u));
}
fn validGeometry(value: vec4f) -> bool {
  return finite4(value) && value.w > 0.0 && dot(value.xyz, value.xyz) > 0.00001;
}
fn coordinate(p: vec2i) -> vec2i {
  return clamp(p, vec2i(0), vec2i(i32(settings.width)-1, i32(settings.height)-1));
}
fn kernel(i: i32) -> f32 {
  if (i == 0) { return 6.0; }
  if (abs(i) == 1) { return 4.0; }
  return 1.0;
}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) invocation: vec3u) {
  if (invocation.x >= settings.width || invocation.y >= settings.height) { return; }
  let pixel = vec2i(invocation.xy);
  let center = max(textureLoad(source, pixel, 0), vec4f(0.0));
  let centerBase = textureLoad(albedo, pixel, 0);
  let centerAlbedo = max(centerBase.rgb, vec3f(0.08));
  let centerGeometry = textureLoad(geometry, pixel, 0);
  // Cleared/background and unlit guide pixels can have positive alpha/depth
  // but zero normals. Never normalize them or spread them into real surfaces.
  if (!validGeometry(centerGeometry) || !finite4(centerBase)) {
    textureStore(result, pixel, min(center, vec4f(65000.0)));
    return;
  }
  let centerIllumination = center.rgb / centerAlbedo;
  let centerLog = log(1.0 + luminance(centerIllumination));
  // A local estimate lets grain be smoothed more than coherent lighting edges.
  var logSum = 0.0;
  var logSquares = 0.0;
  var logCount = 0.0;
  var depthGradient = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let p = coordinate(pixel + vec2i(x, y));
      let g = textureLoad(geometry, p, 0);
      let rawColor = textureLoad(source, p, 0);
      let rawBase = textureLoad(albedo, p, 0);
      if (!validGeometry(g) || !finite4(rawColor) || !finite4(rawBase)) { continue; }
      let color = max(rawColor.rgb, vec3f(0.0));
      let base = max(rawBase.rgb, vec3f(0.08));
      let value = log(1.0 + luminance(color / base));
      logSum += value;
      logSquares += value * value;
      logCount += 1.0;
      // Exclude silhouettes when estimating slope on a continuous surface.
      if (dot(g.xyz, centerGeometry.xyz) > 0.8 && g.w > 0.0 && centerGeometry.w > 0.0) {
        depthGradient = max(depthGradient, min(abs(g.w - centerGeometry.w), centerGeometry.w * 0.02));
      }
    }
  }
  let count = max(1.0, logCount);
  let variance = max(0.0, logSquares / count - (logSum / count) * (logSum / count));
  let colorSigma = max(0.12, sqrt(variance) * 2.0) / (1.0 + f32(settings.iteration) * 0.25);
  let depthSigma = max(0.002, abs(centerGeometry.w) * 0.001 + depthGradient * f32(settings.step) * 2.0);
  var total = vec3f(0.0);
  var weightSum = 0.0;
  for (var y = -2; y <= 2; y++) {
    for (var x = -2; x <= 2; x++) {
      let p = coordinate(pixel + vec2i(x, y) * i32(settings.step));
      let g = textureLoad(geometry, p, 0);
      let rawColor = textureLoad(source, p, 0);
      let rawBase = textureLoad(albedo, p, 0);
      if (!validGeometry(g) || !finite4(rawColor) || !finite4(rawBase)) { continue; }
      let color = max(rawColor.rgb, vec3f(0.0));
      let base = max(rawBase.rgb, vec3f(0.08));
      let normalWeight = pow(max(0.0, dot(normalize(centerGeometry.xyz), normalize(g.xyz))), 32.0);
      let geometryWeight = normalWeight * exp(-abs(g.w - centerGeometry.w) / depthSigma);
      let baseDelta = base - centerAlbedo;
      let albedoWeight = exp(-dot(baseDelta, baseDelta) / 0.08);
      let illumination = color / base;
      let logValue = log(1.0 + luminance(illumination));
      let colorWeight = exp(-abs(logValue - centerLog) / colorSigma);
      let weight = kernel(x) * kernel(y) * geometryWeight * albedoWeight * colorWeight;
      total += illumination * weight;
      weightSum += weight;
    }
  }
  let filtered = total / max(weightSum, 0.00001) * centerAlbedo;
  textureStore(result, pixel, vec4f(min(filtered, vec3f(65000.0)), center.a));
}`;

/** Thin clear panes contribute little refraction displacement; guide the
 * filter with their visible contents instead of one uniform glass rectangle. */
export function isThinGuideGlass(object) {
  if (!object.isMesh || object.userData?.part === "water") return false;
  return [object.material].flat().every((material) => {
    const thickness = object.userData?.paneThickness ?? material?.thickness;
    return (
      material?.transmission >= 0.9 &&
      thickness > 0 &&
      thickness <= 0.012 &&
      material.ior >= 1.4 &&
      material.ior <= 1.7 &&
      material.roughness <= 0.15
    );
  });
}

/**
 * Implements the upstream WebGPUPathTracer.setDenoiser() interface. The tracer
 * invokes update(rawTexture) once all pixels reach its sample target, presents
 * texture in its existing HDR output pass, and calls reset on accumulation
 * changes. Guides are rasterized from its photo snapshot, preserving alpha-test
 * silhouettes, albedo texture detail and normal/depth discontinuities.
 */
export function createPhotoDenoiser(initialRenderer) {
  let renderer = initialRenderer,
    scene,
    camera;
  let pipeline,
    bindLayout,
    buffers = [],
    guides,
    outputs = [];
  let output = null,
    complete = false,
    running = false,
    disposed = false,
    enabled = true,
    guidesValid = false;
  let revision = 0,
    width = 0,
    height = 0,
    passes = 0,
    guidePasses = 0,
    skippedGlass = 0;
  const guideMRT = mrt({
    output: vec4(diffuseColor.rgb, 1),
    geometry: vec4(normalView, positionView.z.negate()),
  });
  function init(nextRenderer = renderer) {
    if (!nextRenderer?.backend?.isWebGPUBackend)
      throw new Error("Photo denoising requires native WebGPU");
    if (pipeline) {
      if (nextRenderer !== renderer)
        throw new Error("Denoiser cannot change WebGPU devices");
      return;
    }
    renderer = nextRenderer;
    const device = renderer.backend.device;
    bindLayout = device.createBindGroupLayout({
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
    pipeline = device.createComputePipeline({
      label: "Photo guided atrous denoiser",
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindLayout] }),
      compute: {
        module: device.createShaderModule({ code: PHOTO_DENOISE_WGSL }),
        entryPoint: "main",
      },
    });
    buffers = [0, 1, 2].map(() =>
      device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    );
    guides = new RenderTarget(1, 1, {
      count: 2,
      type: HalfFloatType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
    guides.textures[0].name = "output";
    guides.textures[1].name = "geometry";
    outputs = [0, 1].map(() => {
      const texture = new StorageTexture(1, 1);
      texture.type = HalfFloatType;
      texture.colorSpace = ColorManagement.workingColorSpace;
      texture.generateMipmaps = false;
      texture.name = "Denoised Photo HDR";
      return texture;
    });
  }
  function reset() {
    revision++;
    output = null;
    complete = false;
    running = false;
    guidesValid = false;
  }
  function update(raw) {
    if (disposed || !enabled) return null;
    if (running) return output;
    if (!scene || !camera)
      throw new Error("Photo denoiser needs its current scene and camera");
    init();
    running = true;
    const original = {
      target: renderer.getRenderTarget(),
      mrt: renderer.getMRT(),
      toneMapping: renderer.toneMapping,
      autoClear: renderer.autoClear,
      clearColor: renderer.getClearColor(new Color()),
      clearAlpha: renderer.getClearAlpha(),
      background: scene.background,
      environment: scene.environment,
    };
    const hiddenObjects = [];
    try {
      const nextWidth = raw.width ?? raw.image.width;
      const nextHeight = raw.height ?? raw.image.height;
      if (nextWidth !== width || nextHeight !== height) guidesValid = false;
      width = nextWidth;
      height = nextHeight;
      guides.setSize(width, height);
      for (const texture of outputs) texture.setSize(width, height);
      if (!guidesValid) {
        renderer.toneMapping = NoToneMapping;
        renderer.autoClear = true;
        renderer.setClearColor(0x000000, 0);
        scene.background = null;
        scene.environment = null;
        // Guides contain material albedo and geometric data only. Excluding
        // lights also avoids requiring raster LTC tables for the photo-only
        // RectAreaLight sun, and skips needless shadow/lighting work.
        skippedGlass = 0;
        scene.traverse((object) => {
          const thinGlass = isThinGuideGlass(object);
          if (object.isLight || thinGlass) {
            hiddenObjects.push([object, object.visible]);
            object.visible = false;
            if (thinGlass) skippedGlass++;
          }
        });
        renderer.setRenderTarget(guides);
        renderer.setMRT(guideMRT);
        renderer.render(scene, camera);
        guidesValid = true;
        guidePasses++;
      }
      renderer.setMRT(null);
      const device = renderer.backend.device;
      const gpu = (texture) => {
        renderer.initTexture(texture);
        return renderer.backend.get(texture).texture;
      };
      const albedo = gpu(guides.textures[0]),
        geometry = gpu(guides.textures[1]);
      const rawGPU = gpu(raw),
        outputGPU = outputs.map(gpu);
      const encoder = device.createCommandEncoder({ label: "Photo denoising" });
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      for (let iteration = 0; iteration < 3; iteration++) {
        device.queue.writeBuffer(
          buffers[iteration],
          0,
          new Uint32Array([1 << iteration, iteration, width, height]),
        );
        const input = iteration === 0 ? rawGPU : outputGPU[(iteration - 1) % 2];
        const target = outputGPU[iteration % 2];
        pass.setBindGroup(
          0,
          device.createBindGroup({
            layout: bindLayout,
            entries: [
              { binding: 0, resource: input.createView() },
              { binding: 1, resource: albedo.createView() },
              { binding: 2, resource: geometry.createView() },
              { binding: 3, resource: target.createView() },
              { binding: 4, resource: { buffer: buffers[iteration] } },
            ],
          }),
        );
        pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8));
      }
      pass.end();
      device.queue.submit([encoder.finish()]);
      // Submission and the tracer's presentation share one GPU queue. There is
      // no asynchronous callback that could publish an image after a reset.
      output = outputs[0];
      passes += 3;
      complete = true;
      return output;
    } finally {
      scene.background = original.background;
      scene.environment = original.environment;
      for (const [object, visible] of hiddenObjects) object.visible = visible;
      renderer.setMRT(original.mrt);
      renderer.setRenderTarget(original.target);
      renderer.toneMapping = original.toneMapping;
      renderer.autoClear = original.autoClear;
      renderer.setClearColor(original.clearColor, original.clearAlpha);
      running = false;
    }
  }
  return {
    init,
    setScene(nextScene, nextCamera) {
      scene = nextScene;
      camera = nextCamera;
      reset();
    },
    setCamera(nextCamera) {
      camera = nextCamera;
      reset();
    },
    update,
    denoise: update,
    // New sampling milestone in the same scene: retain expensive guide buffers.
    refresh: update,
    reset,
    invalidate: reset,
    get texture() {
      return enabled ? output : null;
    },
    get enabled() {
      return enabled;
    },
    set enabled(value) {
      enabled = Boolean(value);
    },
    get complete() {
      return complete;
    },
    get running() {
      return running;
    },
    get diagnostics() {
      return {
        backend: "webgpu",
        method: "guided-atrous",
        revision,
        complete,
        running,
        width,
        height,
        passes,
        guidePasses,
        skippedGlass,
        enabled,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      guides?.dispose();
      outputs.forEach((texture) => texture.dispose());
      const retired = buffers;
      buffers = [];
      if (retired.length) {
        const destroy = () => retired.forEach((buffer) => buffer.destroy());
        renderer.backend.device.queue
          .onSubmittedWorkDone()
          .then(destroy, destroy);
      }
    },
  };
}
