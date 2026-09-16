import { RenderPipeline, Color } from "three/webgpu";
import { pass, uniform } from "three/tsl";
import { outline } from "three/addons/tsl/display/OutlineNode.js";
import { createPlanarOptics } from "./planar-optics.js";

/** WebGPU node-based silhouettes; selected surfaces retain their materials. */
export function selectionOutline(renderer, scene) {
  const optics = createPlanarOptics(renderer, scene, scene);
  const pipelines = new Map();
  let selected = [];
  function pipelineFor(camera) {
    if (!pipelines.has(camera)) {
      const edges = outline(scene, camera, {
        selectedObjects: selected,
        edgeThickness: uniform(2),
        edgeGlow: uniform(0),
      });
      const pipeline = new RenderPipeline(renderer);
      const blue = uniform(new Color(0x168bff));
      pipeline.outputNode = pass(scene, camera).add(
        edges.visibleEdge
          .mul(blue)
          .mul(4)
          .add(edges.hiddenEdge.mul(blue).mul(0.35)),
      );
      pipelines.set(camera, { pipeline, edges });
    }
    return pipelines.get(camera).pipeline;
  }
  return {
    optics,
    get objects() {
      return selected;
    },
    select(objects = []) {
      selected = objects;
      for (const { edges } of pipelines.values())
        edges.selectedObjects = selected;
    },
    resize() {}, // Node passes follow the renderer's drawing buffer automatically.
    render(camera) {
      optics.update(camera);
      if (selected.length) pipelineFor(camera).render();
      else renderer.render(scene, camera);
    },
    dispose() {
      optics.dispose();
      for (const { pipeline, edges } of pipelines.values()) {
        pipeline.dispose();
        edges.dispose();
      }
      pipelines.clear();
    },
  };
}
