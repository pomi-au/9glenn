import {
  Box3,
  Color,
  FrontSide,
  Frustum,
  HalfFloatType,
  Matrix4,
  NodeMaterial,
  Plane,
  RenderTarget,
  Vector2,
  Vector3,
  Vector4,
} from "three/webgpu";
import {
  cameraWorldMatrix,
  positionViewDirection,
  float,
  normalLocal,
  normalWorld,
  positionWorld,
  texture,
  uniform,
  vec2,
  vec4,
} from "three/tsl";

const physicalMaterials = new WeakMap();
export function setPhysicalMaterial(mesh, material) {
  physicalMaterials.set(mesh, material);
}
/** The path tracer must receive the original physical glass/water materials. */
export function getPhysicalMaterial(mesh) {
  return physicalMaterials.get(mesh) || mesh.material;
}

const visible = (object) => {
  for (let parent = object; parent; parent = parent.parent)
    if (!parent.visible) return false;
  return true;
};

/**
 * Native WebGPU planar reflection passes, composited with dielectric Fresnel.
 * Call update(camera) immediately before rendering that camera. Reflections
 * render scene geometry beyond the camera's screen; clear transmission uses
 * ordinary alpha composition, avoiding screen-space refraction duplicates.
 */
export function createPlanarOptics(renderer, scene, root = scene) {
  if (!renderer.backend?.isWebGPUBackend)
    throw new Error("Planar optics requires native WebGPU");
  const surfaces = [],
    planes = new Map();
  const placeholder = new RenderTarget(1, 1, { type: HalfFloatType });
  const size = new Vector2(),
    frustum = new Frustum(),
    projection = new Matrix4();
  let rendering = false,
    disposed = false,
    frames = 0,
    lastPasses = 0,
    sceneRevision = 0,
    pending = 0,
    oldestAge = 0;
  const pendingByCamera = new WeakMap();

  function add(mesh, options = {}) {
    const existing = surfaces.find((surface) => surface.mesh === mesh);
    if (existing) return existing;
    const water = options.water ?? mesh.userData.part === "water";
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const bounds = mesh.geometry.boundingBox;
    const axis =
      options.axis ||
      mesh.userData.paneAxis ||
      (bounds.max.x - bounds.min.x < bounds.max.z - bounds.min.z ? "x" : "z");
    const normal =
      options.normal?.clone() ||
      new Vector3(
        !water && axis === "x" ? 1 : 0,
        water ? 1 : 0,
        !water && axis !== "x" ? 1 : 0,
      );
    const point = options.point?.clone() || bounds.getCenter(new Vector3());
    if (water && !options.point)
      point.y = mesh.userData.restWaterLevel ?? bounds.max.y;
    const localPlane = new Plane().setFromNormalAndCoplanarPoint(
      normal.normalize(),
      point,
    );
    const reflection = texture(placeholder.texture);
    const reflectedProjection = uniform(new Matrix4());
    const planeNormal = uniform(new Vector3(0, 1, 0));
    const available = uniform(0);
    const ior = options.ior || (water ? 1.333 : 1.52);
    const f0 = Math.pow((ior - 1) / (ior + 1), 2);
    const cosine = normalWorld
      .dot(positionViewDirection.transformDirection(cameraWorldMatrix))
      .abs()
      .clamp(0, 1);
    const fresnel = float(f0).add(
      float(1 - f0).mul(float(1).sub(cosine).pow(5)),
    );
    // Perturb only along the reflecting plane using the actual CPU wave normals.
    const tangent = normalWorld.sub(
      planeNormal.mul(normalWorld.dot(planeNormal)),
    );
    const samplePoint = positionWorld.add(
      tangent.mul(options.distortion ?? (water ? 0.35 : 0)),
    );
    const projected = reflectedProjection.mul(vec4(samplePoint, 1));
    reflection.uvNode = vec2(
      projected.x.div(projected.w).mul(0.5).add(0.5),
      projected.y.div(projected.w).mul(-0.5).add(0.5),
    ).clamp(0.001, 0.999);
    const faceMask = normalLocal
      .dot(uniform(normal))
      .abs()
      .smoothstep(0.7, 0.95);
    const reflectedWeight = fresnel.mul(available).mul(faceMask);
    const absorption = water ? 0.025 : 0;
    const alpha = reflectedWeight.add(
      float(1).sub(reflectedWeight).mul(absorption),
    );
    const tint = uniform(new Color(water ? 0x5baba5 : 0xffffff));
    const radiance = reflection.rgb
      .mul(reflectedWeight)
      .add(tint.mul(float(1).sub(reflectedWeight).mul(absorption)))
      .div(alpha.max(0.00001));
    const material = new NodeMaterial();
    material.name = water
      ? "Planar water · dielectric Fresnel"
      : "Planar glazing · dielectric Fresnel";
    material.fragmentNode = vec4(radiance, alpha);
    material.transparent = true;
    material.depthWrite = false;
    material.side = options.side ?? FrontSide;
    material.forceSinglePass = true;
    physicalMaterials.set(mesh, mesh.material);
    mesh.material = material;
    const surface = {
      mesh,
      material,
      localPlane,
      reflection,
      reflectedProjection,
      planeNormal,
      available,
      worldPlane: new Plane(),
      worldBounds: new Box3(),
    };
    surfaces.push(surface);
    return surface;
  }

  function update(camera) {
    if (disposed || rendering) return;
    rendering = true;
    lastPasses = 0;
    const visibility = surfaces.map(({ mesh }) => mesh.visible);
    const target = renderer.getRenderTarget(),
      mrt = renderer.getMRT();
    const autoClear = renderer.autoClear;
    const shadows = [];
    scene.traverse((object) => {
      if (object.isLight && object.castShadow && object.shadow)
        shadows.push([object.shadow, object.shadow.autoUpdate]);
    });
    try {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      // This helper can run before the camera's first renderer.render(). Match
      // WebGPU now, otherwise the renderer would rebuild the mirrored camera's
      // projection and erase the oblique clipping plane on its first capture.
      if (camera.coordinateSystem !== renderer.coordinateSystem) {
        camera.coordinateSystem = renderer.coordinateSystem;
        camera.updateProjectionMatrix();
      }
      renderer.getDrawingBufferSize(size);
      projection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      frustum.setFromProjectionMatrix(projection, renderer.coordinateSystem);
      const groups = new Map();
      for (const surface of surfaces) {
        surface.available.value = 0;
        if (!visible(surface.mesh)) continue;
        const plane = surface.worldPlane
          .copy(surface.localPlane)
          .applyMatrix4(surface.mesh.matrixWorld);
        // Canonical orientation lets opposing faces of coplanar glazing share.
        const n = plane.normal;
        if ((Math.abs(n.x) > 0.5 ? n.x : Math.abs(n.y) > 0.5 ? n.y : n.z) < 0)
          plane.negate();
        const key = [...n.toArray(), plane.constant]
          .map((value) => Math.round(value * 1000))
          .join(":");
        if (!groups.has(key))
          groups.set(key, {
            plane: plane.clone(),
            surfaces: [],
            pixels: 0,
            representative: surface.mesh.uuid,
          });
        surface.worldBounds
          .copy(surface.mesh.geometry.boundingBox)
          .applyMatrix4(surface.mesh.matrixWorld);
        if (!frustum.intersectsBox(surface.worldBounds)) continue;
        // Reject only sub-pixel panes. Larger panes remain eligible even when
        // their reflected objects lie outside the main camera's frustum.
        const screenBounds = new Box3();
        for (const x of [surface.worldBounds.min.x, surface.worldBounds.max.x])
          for (const y of [
            surface.worldBounds.min.y,
            surface.worldBounds.max.y,
          ])
            for (const z of [
              surface.worldBounds.min.z,
              surface.worldBounds.max.z,
            ])
              screenBounds.expandByPoint(
                new Vector3(x, y, z).applyMatrix4(projection),
              );
        const width =
          (Math.max(
            0,
            Math.min(1, screenBounds.max.x) - Math.max(-1, screenBounds.min.x),
          ) *
            size.x) /
          2;
        const height =
          (Math.max(
            0,
            Math.min(1, screenBounds.max.y) - Math.max(-1, screenBounds.min.y),
          ) *
            size.y) /
          2;
        if (width * height < 1) continue;
        groups.get(key).surfaces.push(surface);
        groups.get(key).pixels += width * height;
      }
      const viewSignature = [
        ...camera.matrixWorld.elements,
        ...camera.projectionMatrix.elements,
        camera.layers.mask,
        size.x,
        size.y,
      ].join(":");
      const activeGroups = [];
      for (const group of groups.values()) {
        if (!group.surfaces.length) continue;
        // The representative includes offscreen coplanar panes, so an orbit
        // changes the reflection projection without allocating a new target.
        // Each source camera owns its image; triple views must never share one.
        const key = `${camera.uuid}:${group.representative}`;
        let state = planes.get(key);
        if (!state) {
          state = {
            target: new RenderTarget(1, 1, { type: HalfFloatType }),
            camera: null,
            projection: new Matrix4(),
            lastFrame: -1,
            revision: -1,
            signature: null,
          };
          planes.set(key, state);
        }
        group.state = state;
        group.signature = `${viewSignature}:${group.plane.normal.toArray()}:${group.plane.constant}`;
        group.dirty =
          state.revision !== sceneRevision ||
          state.signature !== group.signature;
        for (const surface of group.surfaces) {
          surface.planeNormal.value.copy(group.plane.normal);
          if (state.lastFrame >= 0) {
            surface.reflection.value = state.target.texture;
            surface.reflectedProjection.value.copy(state.projection);
            surface.available.value = 1;
          }
        }
        activeGroups.push(group);
      }
      // Oldest first gives every visible plane a turn even if moving scenery
      // invalidates the scene each frame. New planes tie at -1: largest first.
      const queued = activeGroups
        .filter((group) => group.dirty)
        .sort(
          (a, b) =>
            a.state.lastFrame - b.state.lastFrame || b.pixels - a.pixels,
        );
      pending = queued.length;
      pendingByCamera.set(camera, pending);
      // Neither another glass pane nor the closed water volume may be sampled
      // recursively into a reflection. Opaque room/basin geometry stays visible.
      for (const surface of surfaces) surface.mesh.visible = false;
      renderer.setMRT(null);
      renderer.autoClear = true;
      for (const group of queued.slice(0, 3)) {
        const state = group.state;
        if (!state.camera || state.camera.type !== camera.type)
          state.camera = camera.clone();
        const mirror = state.camera,
          plane = group.plane;
        const eye = camera.getWorldPosition(new Vector3());
        if (plane.distanceToPoint(eye) < 0) plane.negate();
        const reflectPoint = (p) =>
          p.addScaledVector(plane.normal, -2 * plane.distanceToPoint(p));
        mirror.position.copy(reflectPoint(eye.clone()));
        const forward = camera.getWorldDirection(new Vector3());
        mirror.up
          .set(0, 1, 0)
          .transformDirection(camera.matrixWorld)
          .reflect(plane.normal);
        mirror.lookAt(reflectPoint(eye.clone().add(forward)));
        mirror.coordinateSystem = renderer.coordinateSystem;
        mirror.near = camera.near;
        mirror.far = camera.far;
        mirror.layers.mask = camera.layers.mask;
        mirror.updateMatrixWorld(true);
        mirror.projectionMatrix.copy(camera.projectionMatrix);
        // General oblique near-plane clipping for WebGPU z in [0,1]. Unlike
        // perspective-specific formulas, inverse projection supports ortho too.
        const clip = plane.clone().applyMatrix4(mirror.matrixWorldInverse);
        const c = new Vector4(...clip.normal.toArray(), clip.constant);
        const q = new Vector4(
          Math.sign(c.x),
          Math.sign(c.y),
          1,
          1,
        ).applyMatrix4(mirror.projectionMatrix.clone().invert());
        const denominator = c.dot(q);
        if (Math.abs(denominator) < 1e-8) continue;
        c.multiplyScalar(1 / denominator);
        const elements = mirror.projectionMatrix.elements;
        elements[2] = c.x;
        elements[6] = c.y;
        elements[10] = c.z;
        elements[14] = c.w;
        mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();
        // Spend pixels on the surfaces visible in this view. Small distant
        // windows must not lower the resolution of a dominant pool reflection.
        const coverage = Math.min(1, group.pixels / (size.x * size.y));
        const edge =
          coverage >= 0.1
            ? 1024
            : coverage >= 0.03
              ? 768
              : coverage >= 0.005
                ? 512
                : 256;
        const scale = Math.min(1, edge / Math.max(size.x, size.y));
        state.target.setSize(
          Math.max(64, Math.round(size.x * scale)),
          Math.max(64, Math.round(size.y * scale)),
        );
        renderer.setRenderTarget(state.target);
        renderer.render(scene, mirror);
        // The same light-space shadow map serves every mirrored camera.
        // Update on the first capture, then reuse it for this batch.
        for (const [shadow] of shadows) shadow.autoUpdate = false;
        state.projection.multiplyMatrices(
          mirror.projectionMatrix,
          mirror.matrixWorldInverse,
        );
        state.lastFrame = frames;
        state.revision = sceneRevision;
        state.signature = group.signature;
        for (const surface of group.surfaces) {
          surface.reflection.value = state.target.texture;
          surface.reflectedProjection.value.copy(state.projection);
          surface.planeNormal.value.copy(plane.normal);
          surface.available.value = 1;
        }
        lastPasses++;
      }
      pending -= lastPasses;
      pendingByCamera.set(camera, pending);
      oldestAge = activeGroups.reduce(
        (age, { state }) =>
          Math.max(
            age,
            state.lastFrame < 0 ? frames + 1 : frames - state.lastFrame,
          ),
        0,
      );
      frames++;
      return pending > 0;
    } finally {
      surfaces.forEach(({ mesh }, index) => {
        mesh.visible = visibility[index];
      });
      renderer.setRenderTarget(target);
      renderer.setMRT(mrt);
      renderer.autoClear = autoClear;
      for (const [shadow, autoUpdate] of shadows)
        shadow.autoUpdate = autoUpdate;
      rendering = false;
    }
  }

  root.traverse((mesh) => {
    if (
      mesh.isMesh &&
      (mesh.userData.opticalSurface === "glass" ||
        mesh.userData.part === "water")
    )
      add(mesh);
  });
  return {
    add,
    update,
    invalidate() {
      sceneRevision++;
    },
    get needsUpdate() {
      return pending > 0;
    },
    needsUpdateFor(camera) {
      return (pendingByCamera.get(camera) || 0) > 0;
    },
    get diagnostics() {
      return {
        frames,
        passes: lastPasses,
        pending,
        oldestAge,
        sceneRevision,
        registeredSurfaces: surfaces.length,
        cachedPlanes: planes.size,
        rendering,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { mesh, material } of surfaces) {
        mesh.material = getPhysicalMaterial(mesh);
        physicalMaterials.delete(mesh);
        material.dispose();
      }
      for (const state of planes.values()) state.target.dispose();
      planes.clear();
      placeholder.dispose();
    },
  };
}
