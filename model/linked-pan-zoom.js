/* Shared SVG navigation for calibrated PDF/vector comparisons. */
(() => {
  function bind(svg, { getView, setView, getFitWidth, reset }) {
    const pointers = new Map();
    function transform(from, to, factor = 1) {
      const matrix = svg.getScreenCTM();
      if (!matrix) return;
      const inverse = matrix.inverse();
      const a = new DOMPoint(...from).matrixTransform(inverse);
      const b = new DOMPoint(...to).matrixTransform(inverse);
      const [x, y, width, height] = getView();
      const zoom = getFitWidth() / width;
      factor = Math.max(0.35, Math.min(15, zoom * factor)) / zoom;
      setView([
        a.x - (b.x - x) / factor,
        a.y - (b.y - y) / factor,
        width / factor,
        height / factor,
      ]);
    }
    function zoom(factor) {
      const box = svg.getBoundingClientRect();
      const centre = [box.left + box.width / 2, box.top + box.height / 2];
      transform(centre, centre, factor);
    }
    svg.style.touchAction = "none";
    svg.setAttribute("tabindex", "0");
    svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const delta =
          event.deltaY *
          (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
        const point = [event.clientX, event.clientY];
        transform(
          point,
          point,
          Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.0025),
        );
      },
      { passive: false },
    );
    svg.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      svg.focus({ preventScroll: true });
      svg.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      svg.classList.add("dragging");
    });
    function gesture() {
      const [a, b] = [...pointers.values()];
      return b
        ? {
            centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
            distance: Math.hypot(a[0] - b[0], a[1] - b[1]),
          }
        : { centre: a, distance: 0 };
    }
    svg.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      const before = gesture();
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      const after = gesture();
      transform(
        before.centre,
        after.centre,
        before.distance && after.distance
          ? after.distance / before.distance
          : 1,
      );
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      svg.addEventListener(name, (event) => {
        pointers.delete(event.pointerId);
        if (!pointers.size) svg.classList.remove("dragging");
      });
    svg.addEventListener("dblclick", reset);
    svg.addEventListener("keydown", (event) => {
      if (
        [
          "+",
          "=",
          "-",
          "0",
          "Home",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
        ].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "+" || event.key === "=") zoom(1.25);
        else if (event.key === "-") zoom(0.8);
        else if (event.key === "0" || event.key === "Home") reset();
        else {
          const v = [...getView()];
          v[0] +=
            ({ ArrowLeft: -1, ArrowRight: 1 }[event.key] || 0) * v[2] * 0.08;
          v[1] += ({ ArrowUp: -1, ArrowDown: 1 }[event.key] || 0) * v[3] * 0.08;
          setView(v);
        }
      }
    });
    return { zoom };
  }
  window.LinkedPanZoom = { bind };
})();
