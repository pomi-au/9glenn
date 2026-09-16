/* Interface navigation is independent of the optional WebGPU engine. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  const controls = $("#workspace-controls");
  const drawingSelect = $("#quick-drawing");
  const floorSelect = $("#quick-floor");
  const cameraSelect = $("#quick-camera");
  const floorButtons = [...document.querySelectorAll("[data-floor]")];
  const cameraButtons = [...document.querySelectorAll("[data-camera]")];
  let lastDrawing = "ground";
  let rendererPromise;
  let navigation = 0;

  function loadRenderer() {
    if (window.Building3D) return Promise.resolve(window.Building3D);
    if (!rendererPromise) {
      rendererPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = document.body.dataset.rendererSrc;
        script.onload = () => {
          if (window.Building3D?.activate) resolve(window.Building3D);
          else fail();
        };
        function fail() {
          script.remove();
          rendererPromise = undefined;
          reject(
            new Error(
              "The 3D viewer could not load. Check your connection and try again.",
            ),
          );
        }
        script.onerror = fail;
        document.head.append(script);
      });
    }
    return rendererPromise;
  }

  async function route() {
    const request = ++navigation;
    let hash = location.hash;
    if (!["#3d", "#tour"].includes(hash) && !hash.startsWith("#compare/")) {
      const id = hash.slice(1);
      hash = `#compare/${window.DRAWINGS.some((d) => d.id === id) ? id : lastDrawing}`;
      history.replaceState(null, "", hash);
    }
    const comparing = hash.startsWith("#compare/");
    const touring = hash === "#tour";
    const modeling = hash === "#3d" || touring;
    const id = comparing ? hash.slice(9).replace(/^roof-/, "") : hash.slice(1);
    if (window.DRAWINGS.some((drawing) => drawing.id === id)) lastDrawing = id;
    drawingSelect.value = lastDrawing;
    if (comparing) $("#triple-drawing").value = hash.slice(9);
    if (controls.matches(":popover-open")) controls.hidePopover();
    document.body.classList.toggle("mode-compare", comparing);
    document.body.classList.toggle("mode-3d", modeling);
    document.body.classList.toggle("mode-tour", touring);
    $("#mode-3d").setAttribute("aria-pressed", String(modeling));
    $("#mode-compare").setAttribute("aria-pressed", String(comparing));
    if (!comparing && !modeling) {
      await window.Building3D?.activate();
      return;
    }
    const status = $(comparing ? "#triple-loading" : "#model-loading");
    status.hidden = false;
    status.querySelector('[role="status"]').textContent = "Loading 3D viewer…";
    status.querySelector("button").hidden = true;
    try {
      const renderer = await loadRenderer();
      if (request !== navigation) return;
      await renderer.activate();
      if (request === navigation) status.hidden = true;
    } catch (error) {
      if (request !== navigation) return;
      status.querySelector('[role="status"]').textContent = error.message;
      status.querySelector("button").hidden = false;
    }
  }

  $("#mode-3d").onclick = () => {
    location.hash = "3d";
  };
  $("#mode-compare").onclick = () => {
    location.hash = `compare/${lastDrawing}`;
  };
  drawingSelect.onchange = () => {
    location.hash = drawingSelect.value;
  };
  $("#triple-drawing").onchange = (event) => {
    location.hash = `compare/${event.target.value}`;
  };
  for (const button of document.querySelectorAll("[data-retry-renderer]"))
    button.onclick = route;

  controls.addEventListener("toggle", () => {
    $("#controls-toggle").setAttribute(
      "aria-expanded",
      String(controls.matches(":popover-open")),
    );
  });
  $(".inspector-close").onclick = () => $("#details-button").click();
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !$("#accuracy-dialog").open &&
      !$("#inspector").hidden
    )
      $("#details-button").click();
  });
  floorSelect.onchange = () => $(`[data-floor="${floorSelect.value}"]`).click();
  cameraSelect.onchange = () =>
    $(`[data-camera="${cameraSelect.value}"]`).click();
  function syncModelSelects() {
    floorSelect.value =
      floorButtons.find(
        (button) => button.getAttribute("aria-pressed") === "true",
      )?.dataset.floor || "all";
    cameraSelect.value =
      cameraButtons.find(
        (button) => button.getAttribute("aria-pressed") === "true",
      )?.dataset.camera || "";
  }
  const observer = new MutationObserver(syncModelSelects);
  for (const button of [...floorButtons, ...cameraButtons])
    observer.observe(button, {
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });
  syncModelSelects();
  window.addEventListener("hashchange", route);
  route();
})();
