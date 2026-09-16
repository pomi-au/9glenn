/* Canonical primitive tree -> SVG or semantic geometry. Shapes are stored once.
 * Metadata references stable element IDs; it does not carry duplicate positions. */
(() => {
  const namespace = "http://www.w3.org/2000/svg";
  function element(node) {
    const result = document.createElementNS(namespace, node.tag);
    for (const [key, value] of Object.entries(node.attributes || {}))
      result.setAttribute(key, value);
    if (node.text) result.append(document.createTextNode(node.text));
    for (const child of node.children || []) result.append(element(child));
    return result;
  }
  const documentFor = (drawing) => element(drawing.vector);
  const svgFor = (drawing) =>
    new XMLSerializer().serializeToString(documentFor(drawing));
  const points = (node) =>
    node
      .getAttribute("points")
      .trim()
      .split(/\s+/)
      .map((p) => p.split(",").map(Number));
  function resolve(drawing) {
    const doc = documentFor(drawing);
    const n = (node, key) => Number(node.getAttribute(key));
    function entity(record) {
      const item = { ...record };
      const id = CSS.escape(item.id || "");
      if (item.type === "wall" || item.type === "elevation-window") {
        const attribute =
          item.type === "wall" ? "data-wall" : "data-elevation-window";
        const node = doc.querySelector(`[${attribute}="${id}"]`);
        for (const key of ["x", "y", "width", "height"])
          item[key] = n(node, key);
      } else if (item.type === "window") {
        const node = doc.querySelector(`[data-window="${id}"] rect.window`);
        const horizontal = item.axis === "h";
        item.wall = n(node, horizontal ? "height" : "width");
        item.length = n(node, horizontal ? "width" : "height");
        item.x = n(node, "x") + (horizontal ? 0 : item.wall / 2);
        item.y = n(node, "y") + (horizontal ? item.wall / 2 : 0);
      } else if (item.type === "door") {
        const group = doc.querySelector(`[data-door="${id}"]`);
        const transform = group.getAttribute("transform");
        const values = (type) =>
          transform
            .match(new RegExp(type + "\\(([^)]+)\\)"))[1]
            .trim()
            .split(/[ ,]+/)
            .map(Number);
        [item.x, item.y] = values("translate");
        item.angle = values("rotate")[0];
        item.swing = values("scale")[1];
        item.width = n(group.querySelector("rect"), "width");
      } else if (item.type === "site-area") {
        item.points = points(doc.querySelector(`[data-site-area="${id}"]`));
      } else if (item.type === "site-plant") {
        const plant = doc.querySelector(`[data-site-plant="${id}"]`);
        item.x = n(plant, "cx");
        item.z = n(plant, "cy");
        item.radius = n(plant, "r");
        const soil = doc.querySelector(`[data-planter-soil="${id}"]`);
        if (soil) item.soilPoints = points(soil);
      } else if (item.type === "pool") {
        const group = doc.querySelector(`[data-pool="${id}"]`);
        item.parts = Object.fromEntries(
          [...group.querySelectorAll("[data-pool-part]")].map((node) => [
            node.getAttribute("data-pool-part"),
            points(node),
          ]),
        );
      } else if (item.type === "furniture") {
        item.points = points(
          doc.querySelector(
            `[data-furniture="${id}"] [data-furniture-outline]`,
          ),
        );
      } else if (item.type === "fixture") {
        const group = doc.querySelector(`[data-fixture="${id}"]`);
        item.points = points(group.querySelector("[data-fixture-outline]"));
        item.holes = [...group.querySelectorAll("[data-fixture-hole]")].map(
          (hole) =>
            Array.from({ length: 48 }, (_, i) => {
              const angle = (i / 48) * Math.PI * 2;
              return [
                n(hole, "cx") + Math.cos(angle) * n(hole, "rx"),
                n(hole, "cy") + Math.sin(angle) * n(hole, "ry"),
              ];
            }),
        );
      } else if (item.type === "guard") {
        const group = doc.querySelector(`[data-guard="${id}"]`);
        const outline = group.querySelector("[data-guard-outline]");
        const ring = points(outline);
        const levels = outline
          .getAttribute("data-rise-levels")
          .split(/\s+/)
          .map(Number);
        item.panels = levels.slice(1).map((end, index) => ({
          points: [
            ring[index],
            ring[index + 1],
            ring[ring.length - 2 - index],
            ring[ring.length - 1 - index],
          ],
          start: levels[index],
          end,
        }));
      } else if (item.type === "stair" || item.type === "stair-treads") {
        const group = doc.querySelector(`[data-stair="${id}"]`);
        if (group)
          item.treads = item.treads.map((tread) => ({
            ...tread,
            points: points(
              group.querySelector(`[data-tread-level="${tread.level}"]`),
            ),
          }));
      }
      return item;
    }
    const rooms = drawing.spaces.map((room) => ({
      ...room,
      pointsMm: points(
        doc.querySelector(`[data-room="${CSS.escape(room.id)}"]`),
      ),
    }));
    return {
      ...drawing,
      geometry: drawing.entities.map(entity),
      rooms,
      document: doc,
    };
  }
  window.DrawingModel = { documentFor, svgFor, resolve };
  for (const drawing of window.DRAWINGS) {
    Object.defineProperties(drawing, {
      svg: {
        get() {
          return svgFor(this);
        },
      },
      geometry: {
        get() {
          return resolve(this).geometry;
        },
      },
      rooms: {
        get() {
          return resolve(this).rooms;
        },
      },
    });
  }
})();
