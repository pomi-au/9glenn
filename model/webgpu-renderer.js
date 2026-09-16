import {
  WebGPURenderer,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  PCFShadowMap,
} from "three/webgpu";

function deferUniformBufferDisposal(backend) {
  // Three r185 rebuilds render objects when ClippingGroup state changes. Their
  // old uniforms can still be referenced by the current, unsubmitted render pass.
  // Remove the cache entry immediately, then free the GPU buffer after this turn
  // has submitted its commands and the device has finished using them.
  backend.destroyUniformBuffer = function (binding) {
    const buffer = this.get(binding).buffer;
    this.delete(binding);
    if (!buffer) return;
    queueMicrotask(() => {
      const destroy = () => buffer.destroy();
      this.device.queue.onSubmittedWorkDone().then(destroy, destroy);
    });
  };
}

/** Create an actual WebGPU renderer. Never fall back to another graphics API. */
export async function createWebGPURenderer(options = {}) {
  if (!globalThis.isSecureContext || !navigator.gpu) {
    throw new Error(
      "WebGPU is required for 3D. Open this viewer in a WebGPU-capable browser on HTTPS or localhost. Drawings remain available.",
    );
  }
  const renderer = new WebGPURenderer({
    antialias: true,
    ...options,
    forceWebGL: false,
  });
  // Three installs a WebGL fallback in its constructor; disable it before init.
  renderer._getFallback = null;
  try {
    await renderer.init();
    if (!renderer.backend.isWebGPUBackend)
      throw new Error("A WebGPU device could not be initialized.");
  } catch (error) {
    renderer.dispose();
    throw new Error(`WebGPU could not start. ${error.message}`);
  }
  deferUniformBufferDisposal(renderer.backend);
  renderer.backend.device.addEventListener("uncapturederror", (event) => {
    renderer.domElement.dispatchEvent(
      new CustomEvent("webgpu-error", { detail: event.error.message }),
    );
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
}
