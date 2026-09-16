// Reuse the existing controls and their handlers inside a compact workspace.
export function mountCompactUI() {
  const $ = (selector) => document.querySelector(selector);
  document.body.classList.add("compact-ui");
  const sidebar = $(".sidebar");
  sidebar.id = "workspace-controls";
  sidebar.setAttribute("popover", "auto");
  sidebar.setAttribute("aria-label", "View controls");

  const brandGroup = document.createElement("div");
  brandGroup.className = "brand-group";
  $(".brand").before(brandGroup);
  brandGroup.append($(".brand"));
  const toggle = document.createElement("button");
  toggle.id = "controls-toggle";
  toggle.className = "tool";
  toggle.setAttribute("popovertarget", sidebar.id);
  toggle.setAttribute("aria-label", "View controls");
  toggle.setAttribute("aria-controls", sidebar.id);
  toggle.setAttribute("aria-expanded", "false");
  toggle.title = "Floors, layers and display options";
  toggle.innerHTML =
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-6 1v4"/></svg><span>Controls</span>';
  brandGroup.append(toggle);
  sidebar.addEventListener("toggle", () => {
    toggle.setAttribute(
      "aria-expanded",
      String(sidebar.matches(":popover-open")),
    );
  });
  const close = document.createElement("button");
  close.className = "tool controls-close";
  close.setAttribute("popovertarget", sidebar.id);
  close.setAttribute("popovertargetaction", "hide");
  close.setAttribute("aria-label", "Close controls");
  close.textContent = "×";
  // A separate top-level button remains available in both sidebar modes.
  sidebar.prepend(close);
  sidebar.append($(".overlay-toolbar"));
  const closeDetails = document.createElement("button");
  closeDetails.className = "tool inspector-close";
  closeDetails.setAttribute("aria-label", "Close drawing details");
  closeDetails.textContent = "×";
  closeDetails.onclick = () => $("#details-button").click();
  $("#inspector").prepend(closeDetails);
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      !$("#accuracy-dialog").open &&
      $("#inspector").offsetParent !== null
    )
      $("#details-button").click();
  });

  for (const [heading, toolbar] of [
    [".main > .view-heading", ".main > .toolbar"],
    [".model-heading", ".model-camera-toolbar"],
    [".triple-heading", ".triple-toolbar"],
  ])
    $(toolbar).prepend($(heading));

  function select(id, label, options, host) {
    const element = document.createElement("select");
    element.id = id;
    element.setAttribute("aria-label", label);
    for (const [value, title] of options) element.add(new Option(title, value));
    host.append(element);
    return element;
  }
  const drawingSelect = select(
    "quick-drawing",
    "Choose drawing",
    window.DRAWINGS.map((d) => [d.id, d.title]),
    $("#view-title").parentElement,
  );
  drawingSelect.onchange = () => {
    location.hash = drawingSelect.value;
  };
  const floorButtons = [...document.querySelectorAll("[data-floor]")];
  const floorSelect = select(
    "quick-floor",
    "Choose floor",
    floorButtons.map((button) => [
      button.dataset.floor,
      button.firstChild.textContent,
    ]),
    $(".model-heading > div"),
  );
  floorSelect.onchange = () => $(`[data-floor="${floorSelect.value}"]`).click();
  const cameraButtons = [...document.querySelectorAll("[data-camera]")];
  const cameraSelect = select(
    "quick-camera",
    "Camera view",
    cameraButtons.map((button) => [button.dataset.camera, button.textContent]),
    $(".model-heading > div"),
  );
  const customView = new Option("Custom view", "");
  customView.disabled = true;
  cameraSelect.add(customView);
  cameraSelect.onchange = () =>
    $(`[data-camera="${cameraSelect.value}"]`).click();
  function syncSelects() {
    floorSelect.value =
      floorButtons.find(
        (button) => button.getAttribute("aria-pressed") === "true",
      )?.dataset.floor || "all";
    // Keep the mobile selector descriptive after a manual rotation.
    cameraSelect.value =
      cameraButtons.find(
        (button) => button.getAttribute("aria-pressed") === "true",
      )?.dataset.camera || "";
  }
  const observer = new MutationObserver(syncSelects);
  for (const button of [...floorButtons, ...cameraButtons])
    observer.observe(button, {
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });
  function route() {
    if (sidebar.matches(":popover-open")) sidebar.hidePopover();
    const id = location.hash.slice(1);
    if (window.DRAWINGS.some((drawing) => drawing.id === id))
      drawingSelect.value = id;
  }
  window.addEventListener("hashchange", route);
  syncSelects();
  route();
}
