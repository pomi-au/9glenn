// Pane selection is independent of drawing, roof selection, and shared pan/zoom.
export function mountComparePanes(section, onChange) {
  const key = "9glenn.compare.panes";
  const names = ["model", "svg", "pdf"];
  const surfaces = ["triple-model", "triple-vector", "triple-source"].map(
    (id) => section.querySelector(`#${id}`),
  );
  let selected = names;
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(stored) && names.some((name) => stored.includes(name)))
      selected = names.filter((name) => stored.includes(name));
  } catch {
    /* Local preferences are optional, including for file URLs. */
  }
  const bar = section.querySelector(".compare-pane-controls");
  const buttons = [...bar.querySelectorAll("button")];
  function apply() {
    names.forEach((name, index) => {
      const visible = selected.includes(name);
      surfaces[index].closest("figure").hidden = !visible;
      buttons[index].setAttribute("aria-pressed", String(visible));
      buttons[index].disabled = visible && selected.length === 1;
      buttons[index].title =
        visible && selected.length === 1
          ? "Keep at least one view visible"
          : `Show or hide ${buttons[index].textContent}`;
    });
    section.style.setProperty("--compare-pane-count", selected.length);
    const modelVisible = selected.includes("model");
    section.querySelector("#triple-aligned").parentElement.hidden =
      !modelVisible;
    section.querySelector(".triple-outline-option").hidden = !modelVisible;
  }
  buttons.forEach((button, index) => {
    button.onclick = () => {
      const name = names[index];
      if (selected.length === 1 && selected.includes(name)) return;
      selected = selected.includes(name)
        ? selected.filter((entry) => entry !== name)
        : names.filter((entry) => entry === name || selected.includes(entry));
      apply();
      try {
        localStorage.setItem(key, JSON.stringify(selected));
      } catch {}
      onChange();
    };
  });
  apply();
  return {
    firstSurface: () => surfaces[names.indexOf(selected[0])],
    modelVisible: () => selected.includes("model"),
  };
}
