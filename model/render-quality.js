function createDefaultPhoto(...args) {
  return import("./photo-renderer.js").then(({ createPhotoRenderer }) =>
    createPhotoRenderer(...args),
  );
}

/** Coordinates responsive exploration and settled WebGPU photo accumulation. */
export function renderQuality({
  renderer,
  scene,
  selection,
  invalidate,
  onModeChange,
  createPhoto = createDefaultPhoto,
}) {
  const status = document.querySelector("#render-progress");
  const buttons = [...document.querySelectorAll("[data-render-mode]")];
  let mode = "explore";
  let photo = null;
  let preparing = false;
  let sceneDirty = true;
  let cameraDirty = true;
  let lastScene = "",
    lastCamera = "";
  let sceneRevision = 0;
  let photoCamera = null;
  let lastChange = performance.now();
  let lastMeasurement = 0;
  let failure = null;
  let engineGeneration = 0;
  let disposed = false;

  function cameraSignature(camera) {
    camera.updateMatrixWorld();
    return (
      camera.uuid +
      camera.matrixWorld.elements.join(",") +
      camera.projectionMatrix.elements.join(",")
    );
  }
  function releasePhoto() {
    engineGeneration++;
    preparing = false;
    const previous = photo;
    photo = null;
    photoCamera = null;
    sceneDirty = cameraDirty = true;
    previous?.dispose();
  }

  function setStatus(text) {
    if (status.textContent !== text) status.textContent = text;
  }
  function fail(error, generation = engineGeneration) {
    if (disposed || generation !== engineGeneration) return;
    releasePhoto();
    if (mode !== "photo") return;
    console.error("WebGPU photo rendering:", error);
    failure = error.message;
    setMode("explore");
    setStatus("Photo could not render. Return to Explore or reload.");
  }
  function setMode(value) {
    if (disposed) return;
    mode = value === "photo" ? "photo" : "explore";
    if (mode === "explore" && preparing) releasePhoto();
    if (mode === "photo") failure = null;
    for (const button of buttons)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.renderMode === mode),
      );
    document.body.classList.toggle("photo-mode", mode === "photo");
    sceneDirty = true;
    lastChange = performance.now();
    setStatus(mode === "photo" ? "Preparing photo…" : "WebGPU · Live");
    onModeChange(mode);
    invalidate();
  }
  const onGPUError = (event) => {
    fail(new Error(event.detail));
  };
  renderer.domElement.addEventListener("webgpu-error", onGPUError);
  buttons.forEach((button) => {
    button.onclick = () => setMode(button.dataset.renderMode);
  });

  return {
    get mode() {
      return mode;
    },
    get photo() {
      return photo;
    },
    get error() {
      return failure;
    },
    get preparing() {
      return preparing;
    },
    setMode,
    sceneChanged() {
      selection.optics?.invalidate();
      sceneRevision++;
      sceneDirty = true;
    },
    resize() {
      if (photo)
        photo.setSize(renderer.domElement.width, renderer.domElement.height);
      cameraDirty = true;
      lastChange = performance.now();
    },
    render(camera, moving, transformKey) {
      if (disposed) return false;
      const now = performance.now();
      const cameraKey = cameraSignature(camera);
      const sceneKey = `${sceneRevision}:${transformKey}`;
      if (sceneKey !== lastScene) {
        sceneDirty = true;
        lastScene = sceneKey;
        lastChange = now;
      }
      if (cameraKey !== lastCamera) {
        cameraDirty = true;
        lastCamera = cameraKey;
        lastChange = now;
      }
      if (moving) lastChange = now;
      if (mode !== "photo") {
        selection.render(camera);
        return false;
      }
      if (preparing) {
        selection.render(camera);
        return true;
      }
      if (moving || now - lastChange < 220) {
        selection.render(camera);
        setStatus("Photo · Settling scene…");
        return true;
      }
      if (!photo) {
        selection.render(camera);
        preparing = true;
        setStatus("Preparing light paths…");
        const generation = engineGeneration;
        const revision = sceneRevision;
        createPhoto(renderer, scene, camera)
          .then((value) => {
            if (
              disposed ||
              generation !== engineGeneration ||
              mode !== "photo"
            ) {
              value.dispose();
              return;
            }
            photo = value;
            photoCamera = camera;
            sceneDirty = revision !== sceneRevision || sceneKey !== lastScene;
            cameraDirty =
              cameraKey !== lastCamera || cameraKey !== cameraSignature(camera);
            lastMeasurement = 0;
          })
          .catch((error) => fail(error, generation))
          .finally(() => {
            if (!disposed && generation === engineGeneration) {
              preparing = false;
              invalidate();
            }
          });
        return true;
      }
      try {
        if (sceneDirty) {
          photo.setScene(scene, camera);
          photoCamera = camera;
          sceneDirty = cameraDirty = false;
        } else if (cameraDirty) {
          if (photoCamera === camera) photo.updateCamera();
          else {
            photo.setCamera(camera);
            photoCamera = camera;
          }
          cameraDirty = false;
        }
        if (photo.complete) photo.present(false);
        else photo.renderSample();
        if (now - lastMeasurement > 600) {
          lastMeasurement = now;
          const generation = engineGeneration;
          photo
            .measureSamples()
            .then(() => {
              if (
                !disposed &&
                generation === engineGeneration &&
                mode === "photo"
              )
                invalidate();
            })
            .catch((error) => fail(error, generation));
        }
        const samples = Math.floor(photo.samples);
        setStatus(
          photo.complete
            ? `Photo ready · ${photo.maxSamples} samples`
            : `Refining · ${samples} / ${photo.maxSamples} samples`,
        );
        return !photo.complete;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    present(camera) {
      if (disposed || preparing) return;
      if (cameraSignature(camera) !== lastCamera) cameraDirty = true;
      try {
        if (mode === "photo" && photo && !sceneDirty && !cameraDirty)
          photo.present();
        else selection.render(camera);
      } catch (error) {
        fail(error);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releasePhoto();
      renderer.domElement.removeEventListener("webgpu-error", onGPUError);
      buttons.forEach((button) => {
        button.onclick = null;
      });
    },
  };
}
