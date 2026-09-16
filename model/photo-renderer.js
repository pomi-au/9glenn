import { Vector2 } from "three";
import { WebGPUPathTracer } from "three-gpu-pathtracer/src/webgpu/WebGPUPathTracer.js";
import { TRANSMISSIVE_BACKGROUND_ENVIRONMENT } from "three-gpu-pathtracer/src/webgpu/constants.js";
import { createPhotoScene } from "./photo-scene.js";
import { createPhotoDenoiser } from "./photo-denoiser.js";
import { installPhotoAtlasCompatibility } from "./photo-atlas.js";

export const PATH_TRACER_REVISION = "010d21099bc9a998364f0f698f5aa2865782130e";

/** Progressive WebGPU wavefront path tracing. Creation requires an initialized
 * WebGPU renderer; no renderer or WebGL fallback is created by this module. */
export async function createPhotoRenderer(renderer, scene, camera) {
  await renderer.init();
  if (!renderer.backend?.isWebGPUBackend)
    throw new Error("Photo mode requires a WebGPU device.");
  installPhotoAtlasCompatibility();
  const tracer = new WebGPUPathTracer(renderer);
  tracer.maxBounces = 10;
  tracer.maxTransparentBounces = 12;
  tracer.frameBudget = 160000;
  tracer.maxSamples = 128;
  tracer.dynamicLowRes = false;
  tracer.renderDelay = 0;
  tracer.fadeDuration = 0;
  tracer.minSamples = 0;
  tracer.synchronizeRenderSize = false;
  tracer.transmissiveBackground = TRANSMISSIVE_BACKGROUND_ENVIRONMENT;
  tracer.clampIndirect = 8;
  const denoiser = createPhotoDenoiser(renderer);
  let snapshot;
  let disposed = false;
  let revision = 0;
  let measurement = null;
  let photoWidth = 0;
  let photoHeight = 0;
  let counts = { min: 0, max: 0, avg: 0, samplesPerSecond: 0 };
  let smoothedSamples = 0;
  const clearCounts = () => {
    revision++;
    smoothedSamples = 0;
    counts = { min: 0, max: 0, avg: 0, samplesPerSecond: 0 };
  };
  function smooth(force = false) {
    if (!denoiser.enabled || !tracer.target || counts.min < 1) return;
    // Reuse guides between bounded refinement milestones; exports refresh the
    // latest accumulation without changing its sample buffer.
    const milestone = counts.min >= smoothedSamples + 8;
    const finished =
      counts.min >= tracer.maxSamples && smoothedSamples < tracer.maxSamples;
    if (force || milestone || finished) {
      denoiser.refresh(tracer.target);
      smoothedSamples = counts.min;
    }
  }
  const photo = {
    backend: "webgpu",
    revision: PATH_TRACER_REVISION,
    get samples() {
      return counts.avg;
    },
    get sampleCounts() {
      return { ...counts };
    },
    get complete() {
      return counts.min >= tracer.maxSamples;
    },
    get maxSamples() {
      return tracer.maxSamples;
    },
    get target() {
      return tracer.target;
    },
    get denoiseDiagnostics() {
      return { ...denoiser.diagnostics, samples: smoothedSamples };
    },
    setDenoiseEnabled(enabled) {
      if (disposed) return;
      denoiser.enabled = Boolean(enabled);
      if (denoiser.enabled) smooth(true);
    },
    setScene(nextScene = scene, nextCamera = camera) {
      if (disposed) return;
      const next = createPhotoScene(nextScene, nextCamera);
      try {
        tracer.setScene(next.scene, nextCamera);
      } catch (error) {
        next.dispose();
        throw error;
      }
      snapshot?.dispose();
      snapshot = next;
      scene = nextScene;
      camera = nextCamera;
      clearCounts();
    },
    setCamera(nextCamera) {
      if (disposed) return;
      camera = nextCamera;
      tracer.setCamera(camera);
      denoiser.setCamera(camera);
      clearCounts();
    },
    updateCamera() {
      if (disposed) return;
      tracer.updateCamera();
      clearCounts();
    },
    reset() {
      if (disposed) return;
      tracer.reset();
      clearCounts();
    },
    setSize(width, height) {
      if (disposed) return;
      // Keep native aspect ratio while containing GPU memory and convergence time.
      const scale = Math.min(
        1,
        Math.sqrt(1000000 / Math.max(1, width * height)),
      );
      const nextWidth = Math.max(1, Math.floor(width * scale));
      const nextHeight = Math.max(1, Math.floor(height * scale));
      if (nextWidth === photoWidth && nextHeight === photoHeight) return;
      tracer.setSize(nextWidth, nextHeight);
      photoWidth = nextWidth;
      photoHeight = nextHeight;
      clearCounts();
    },
    renderSample() {
      if (disposed) return;
      smooth();
      tracer.renderSample();
    },
    present(refresh = true) {
      if (disposed) return;
      smooth(refresh);
      tracer.pause = true;
      try {
        tracer.renderSample();
      } finally {
        tracer.pause = false;
      }
    },
    async measureSamples() {
      if (disposed) return { ...counts };
      if (measurement) return measurement;
      const generation = revision;
      measurement = tracer
        .getSampleCountsAsync()
        .then((value) => {
          if (!disposed && generation === revision) counts = value;
          return { ...counts };
        })
        .finally(() => {
          measurement = null;
        });
      return measurement;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      tracer.dispose();
      snapshot?.dispose();
    },
  };
  try {
    tracer.setDenoiser(denoiser);
    photo.setScene(scene, camera);
    const size = renderer.getDrawingBufferSize(new Vector2());
    photo.setSize(size.x, size.y);
  } catch (error) {
    photo.dispose();
    throw error;
  }
  photo.ready = Promise.resolve(photo);
  return photo;
}
