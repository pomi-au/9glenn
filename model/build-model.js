import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import { segmentalOpening, segmentalHead } from "./segmental-arch.js";
import { archOpeningProfile, archBandProfile } from "./arch-profile.js";
import { rectangle, bounds } from "./model-geometry.js";
import { advanceDoor, setDoorOpen, pairedDoorId } from "./door-motion.js";
import { guardGeometry } from "./guard-mesh.js";
import { generatedMaterial } from "./generated-textures.js";
import { applyFinishVariation } from "./finish-variation.js";
import { createCarvedDoorGeometry } from "./door-relief.js";
import { createDoorReliefMaterial } from "./door-relief-material.js";
import { geometryFor, roofAssemblyMeshes } from "./roof-assembly-mesh.js";
import { bathroomTileMaterial } from "./bathroom-tile.js";
import { woodMaterial, mosaicMaterial, woodUVs } from "./finish-materials.js";
import { buildPool } from "./pool-mesh.js";
import { buildSite } from "./site-mesh.js";
import { floorFinishGaps } from "./floor-finish-gaps.js";
import { buildFurniture } from "./furniture-mesh.js";
import { separateSlabUnderside } from "./slab-finish.js";
const MM = 1 / 1000;

function orientedShape(polygon, project) {
  // ExtrudeGeometry does not always normalize holes when the outer ring is
  // already clockwise. Normalize every ring so interior faces point into air.
  const rings = polygon.map((ring, index) => {
    const points = ring.map(project);
    if (THREE.ShapeUtils.isClockWise(points) !== (index === 0))
      points.reverse();
    return points;
  });
  const shape = new THREE.Shape(rings[0]);
  for (const hole of rings.slice(1)) shape.holes.push(new THREE.Path(hole));
  return shape;
}
export function shapeOf(polygon) {
  return orientedShape(polygon, ([x, z]) => new THREE.Vector2(x * MM, -z * MM));
}

// Opening coordinates are millimetres; optical thickness is in world metres.
export function glazingGeometry(polygon, thickness = 0.006) {
  if (!Number.isFinite(thickness) || thickness <= 0)
    throw new RangeError("Glazing thickness must be positive metres");
  const shape = orientedShape(
    polygon,
    ([u, y]) => new THREE.Vector2(u * MM, y * MM),
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -thickness / 2);
  return geometry;
}

export function buildModel(data) {
  const root = new THREE.Group(),
    floorGroups = new Map(),
    doors = new Map(),
    poolUpdates = [],
    environmentControllers = [],
    pickables = [],
    labelAnchors = [];
  const mats = {
    gutter: new THREE.MeshStandardMaterial({
      color: 0x30383b,
      roughness: 0.8,
      side: THREE.DoubleSide,
    }),
    wall: generatedMaterial("plaster"),
    slab: generatedMaterial("cement"),
    slabSoffit: new THREE.MeshStandardMaterial({ color: 0xb6afa0, roughness: 1 }),
    room: woodMaterial({ planks: true }),
    carpet: generatedMaterial("carpet"),
    cabinetWood: woodMaterial(),
    mosaic: mosaicMaterial(),
    wet: new THREE.MeshStandardMaterial({ color: 0x69c8be, roughness: 1 }),
    bathroomTile: bathroomTileMaterial(),
    fixture: new THREE.MeshStandardMaterial({
      color: 0xeee9da,
      roughness: 0.22,
    }),
    frame: new THREE.MeshStandardMaterial({
      color: 0x292a27,
      roughness: 0.38,
      metalness: 0,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      ior: 1.52,
      thickness: 0.006,
      attenuationColor: new THREE.Color(0xe3f1ed),
      attenuationDistance: 2,
      roughness: 0.025,
      side: THREE.DoubleSide,
    }),
    showerGlass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 1,
      ior: 1.52,
      thickness: data.spec.fixtureProfiles["shower-glass"].thickness * MM,
      attenuationColor: new THREE.Color(0xd6eee6),
      attenuationDistance: 1.5,
      roughness: 0.045,
      side: THREE.DoubleSide,
    }),
    glassEdge: new THREE.LineBasicMaterial({
      color: 0x56a89e,
      transparent: true,
      opacity: 0.6,
    }),
    door: null,
    entranceTimber: woodMaterial({ dark: true }),
    porch: generatedMaterial("terracotta"),
    roof: generatedMaterial("roof", { side: THREE.DoubleSide }),
    roofCap: generatedMaterial("roof", { normalMap: null }),
    fascia: generatedMaterial("plaster", { side: THREE.DoubleSide }),
    roofInfill: generatedMaterial("plaster", { side: THREE.DoubleSide }),
    outline: new THREE.LineBasicMaterial({
      color: 0x55554e,
      transparent: true,
      opacity: 0.12,
    }),
    plan: new THREE.LineBasicMaterial({
      color: 0x427e8c,
      transparent: true,
      opacity: 0.55,
    }),
  };
  mats.door = mats.cabinetWood;
  function tag(mesh, info) {
    mesh.userData = { ...info };
    pickables.push(mesh);
    return mesh;
  }
  function box(group, x, z, w, d, bottom, height, material, info) {
    if (w <= 0 || d <= 0 || height <= 0) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w * MM, height * MM, d * MM),
      material,
    );
    if (material.userData?.wood || material.userData?.physicalUV)
      woodUVs(mesh.geometry);
    mesh.position.set(
      (x + w / 2) * MM,
      (bottom + height / 2) * MM,
      (z + d / 2) * MM,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (info) tag(mesh, info);
    return mesh;
  }
  function extrude(group, polygons, bottom, height, material, info) {
    const slabFaces = Array.isArray(material) && material[0] === mats.slab;
    const meshMaterial = slabFaces ? [...material, mats.slabSoffit] : material;
    for (const polygon of polygons) {
      const geometry = new THREE.ExtrudeGeometry(shapeOf(polygon), {
        depth: height * MM,
        bevelEnabled: false,
        curveSegments: 12,
      });
      geometry.rotateX(-Math.PI / 2);
      if (slabFaces) separateSlabUnderside(geometry, meshMaterial.length - 1);
      if (
        [material]
          .flat()
          .some((m) => m.userData?.wood || m.userData?.physicalUV)
      )
        woodUVs(geometry);
      const mesh = new THREE.Mesh(geometry, meshMaterial);
      mesh.position.y = bottom * MM;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      if (info) tag(mesh, info);
    }
  }
  function glassEdges(mesh) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      mats.glassEdge,
    );
    edges.userData.clipWithFloor = true;
    mesh.add(edges);
    mesh.castShadow = false;
  }
  function line(group, points, material = mats.outline) {
    const geo = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p.map((v) => v * MM))),
    );
    const l = new THREE.Line(geo, material);
    group.add(l);
    return l;
  }

  function wallWithArch(group, wall, info) {
    const b = wall.bounds,
      horizontal = b.maxX - b.minX > b.maxZ - b.minZ;
    const start = horizontal ? b.minX : b.minZ,
      length = horizontal ? b.maxX - b.minX : b.maxZ - b.minZ;
    const depth = horizontal ? b.maxZ - b.minZ : b.maxX - b.minX;
    const holes = wall.cuts.map((c) => {
      const u0 = Math.max(
          0,
          (horizontal ? c.bounds.minX : c.bounds.minZ) - start,
        ),
        u1 = Math.min(
          length,
          (horizontal ? c.bounds.maxX : c.bounds.maxZ) - start,
        );
      if (!c.arch) return [rectangle(u0, c.sill, u1 - u0, c.head - c.sill)];
      if (c.segmentRise)
        return [segmentalOpening(u0, u1 - u0, c.sill, c.head, c.segmentRise)];
      const radius = c.archProfile?.radius ?? (u1 - u0) / 2;
      return [
        archOpeningProfile(
          u0,
          u1,
          c.sill,
          c.head - radius,
          radius,
          (u0 + u1) / 2,
        ),
      ];
    });
    const profiles = polygonClipping.difference(
      [rectangle(0, 0, length, wall.height)],
      ...holes,
    );
    function extrudeProfiles(profiles, profileBounds, thickness, name) {
      for (const polygon of profiles) {
        const shape = orientedShape(
          polygon,
          ([x, y]) => new THREE.Vector2(x * MM, y * MM),
        );
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: thickness * MM,
          bevelEnabled: false,
        });
        const positions = geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          const u = positions.getX(i),
            y = positions.getY(i),
            d = positions.getZ(i);
          positions.setXYZ(
            i,
            horizontal
              ? profileBounds.minX * MM + u
              : profileBounds.maxX * MM - d,
            y,
            profileBounds.minZ * MM + (horizontal ? d : u),
          );
        }
        geometry.computeVertexNormals();
        woodUVs(geometry);
        const mesh = new THREE.Mesh(geometry, mats.wall);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(tag(mesh, { ...info, name: name || info.name }));
      }
    }
    extrudeProfiles(profiles, b, depth);
    for (const cut of wall.cuts) {
      const profile = cut.archProfile;
      if (!profile || cut.archTrim === false) continue;
      const centre =
        (horizontal
          ? cut.bounds.minX + cut.bounds.maxX
          : cut.bounds.minZ + cut.bounds.maxZ) /
          2 -
        start;
      const origin = centre - profile.x - profile.radius;
      const band = archBandProfile(
        profile.bandStart + origin,
        profile.bandEnd + origin,
        cut.head - profile.radius,
        profile.radius,
        centre,
        profile.bandDepth,
      );
      const face = { ...b };
      // Only the narrow moulding projects from the existing wall face.
      if (horizontal) face.minZ = b.maxZ;
      else if (wall.id === "portico-west") face.maxX = b.minX;
      else face.maxX = b.maxX + 60;
      extrudeProfiles([[band]], face, 60, "Arched impost band");
      for (const cap of profile.plinth || []) {
        const rectangleProfile = rectangle(
          cap.x + origin,
          profile.bottom - cap.y - cap.height,
          cap.width,
          cap.height,
        );
        extrudeProfiles([[rectangleProfile]], face, 60, "Arch pier plinth cap");
      }
    }
  }

  function windowFrame(group, window, profile, floorId) {
    // Hinged glazing is built as moving leaves below, rather than fixed panes.
    if (["door", "single-door"].includes(profile.paneKind)) return;
    if (profile.parts) {
      for (const part of profile.parts) {
        const horizontal = window.axis === "h";
        windowFrame(
          group,
          {
            ...window,
            x: window.x + (horizontal ? part.offset : 0),
            y: window.y + (horizontal ? 0 : part.offset),
            length: part.length,
          },
          part,
          floorId,
        );
      }
      return;
    }
    const horizontal = window.axis === "h",
      x = window.x,
      z = window.y,
      L = window.length;
    const sill = profile.sill,
      head = profile.head,
      H = head - sill;
    const sub = new THREE.Group();
    sub.name = "opening";
    group.add(sub);
    const info = {
      name: window.id.replaceAll("-", " ") + " window",
      floor: floorId,
      kind: "window",
      width: L,
      height: H,
      source: profile.heightSource,
    };
    function member(offset, y, width, height, material, depth = 55) {
      return box(
        sub,
        horizontal ? x + offset : x - depth / 2,
        horizontal ? z - depth / 2 : z + offset,
        horizontal ? width : depth,
        horizontal ? depth : width,
        y,
        height,
        material,
        info,
      );
    }
    if (profile.segmentRise) {
      const outer = segmentalOpening(0, L, sill, head, profile.segmentRise);
      const inner = segmentalOpening(
        45,
        L - 90,
        sill + 45,
        head - 45,
        profile.segmentRise,
      );
      const shape = orientedShape(
        [outer, [...inner].reverse()],
        ([u, y]) => new THREE.Vector2(u * MM, y * MM),
      );
      const frame = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth: 55 * MM,
          bevelEnabled: false,
        }),
        mats.frame,
      );
      frame.position.set(x * MM, 0, (z - 27.5) * MM);
      sub.add(tag(frame, info));
      const glass = new THREE.Mesh(
        glazingGeometry([inner], mats.glass.thickness),
        mats.glass,
      );
      glass.position.set(x * MM, 0, z * MM);
      sub.add(tag(glass, info));
      // Pane divisions are inferred from the visible glazing, not masonry piers.
      for (const fraction of [0.5]) {
        const u = L * fraction,
          top = segmentalHead(u, L, head, profile.segmentRise) - 40;
        member(u - 20, sill, 40, top - sill, mats.frame);
      }
      return;
    }
    if (profile.arch) {
      const radius = profile.archProfile?.radius ?? L / 2,
        centre = L / 2,
        spring = head - radius;
      const points = archOpeningProfile(0, L, sill, spring, radius, centre);
      const doorHoles = (profile.doors || []).map((cut) => {
        const start = horizontal ? cut.bounds.minX - x : cut.bounds.minZ - z;
        return [rectangle(start, sill - 1, cut.door.width, spring - sill + 1)];
      });
      const glazing = doorHoles.length
        ? polygonClipping.difference([points], ...doorHoles)
        : [[points]];
      for (const polygon of glazing) {
        const glass = new THREE.Mesh(
          glazingGeometry(polygon, mats.glass.thickness),
          mats.glass,
        );
        glass.position.set(x * MM, 0, z * MM);
        if (!horizontal) glass.rotation.y = -Math.PI / 2;
        sub.add(tag(glass, info));
      }
      const arc = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i * Math.PI) / 40,
          u = centre + radius * Math.cos(a),
          y = spring + radius * Math.sin(a);
        arc.push(
          new THREE.Vector3(
            (horizontal ? x + u : x) * MM,
            y * MM,
            (horizontal ? z : z + u) * MM,
          ),
        );
      }
      const frame = new THREE.Mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(arc),
          40,
          0.025,
          6,
          false,
        ),
        mats.frame,
      );
      sub.add(frame);
      member(0, sill, 45, spring - sill, mats.frame);
      member(L - 45, sill, 45, spring - sill, mats.frame);
      member(0, sill, L, 45, mats.frame);
      member(0, spring, L, 32, mats.frame);
      const centreBottom =
        profile.archProfile?.centreMullion === false || doorHoles.length
          ? spring
          : sill;
      member(centre - 16, centreBottom, 32, head - centreBottom, mats.frame);
      if (radius < centre) {
        member(centre - radius - 16, sill, 32, spring - sill, mats.frame);
        member(centre + radius - 16, sill, 32, spring - sill, mats.frame);
      }
      if (profile.archProfile?.fanlight)
        for (const angle of [Math.PI / 4, (3 * Math.PI) / 4]) {
          const u = centre + radius * Math.cos(angle),
            y = spring + radius * Math.sin(angle);
          const a = new THREE.Vector3(
            (horizontal ? x + centre : x) * MM,
            spring * MM,
            (horizontal ? z : z + centre) * MM,
          );
          const b = new THREE.Vector3(
            (horizontal ? x + u : x) * MM,
            y * MM,
            (horizontal ? z : z + u) * MM,
          );
          const spoke = new THREE.Mesh(
            new THREE.CylinderGeometry(0.016, 0.016, a.distanceTo(b), 6),
            mats.frame,
          );
          spoke.position.copy(a).add(b).multiplyScalar(0.5);
          spoke.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            b.sub(a).normalize(),
          );
          sub.add(tag(spoke, info));
        }
      return;
    }
    member(
      30,
      sill + 30,
      L - 60,
      H - 60,
      mats.glass,
      mats.glass.thickness / MM,
    );
    member(0, sill, 45, H, mats.frame);
    member(L - 45, sill, 45, H, mats.frame);
    member(0, sill, L, 45, mats.frame);
    member(0, head - 45, L, 45, mats.frame);
    if (L > 2500) {
      for (const ratio of L === 3130
        ? [745 / L, (745 + 820) / L, (745 + 1640) / L]
        : [0.5])
        member(L * ratio - 18, sill, 36, H, mats.frame);
      if (L === 3130) {
        member(0, sill + H * 0.3, 745, 28, mats.frame);
        member(L - 745, sill + H * 0.3, 745, 28, mats.frame);
      }
    }
    // Slim projecting stone sill.
    if (profile.paneKind) return;
    const depth = window.wall + 80;
    box(
      sub,
      horizontal ? x - 50 : x - depth / 2,
      horizontal ? z - depth / 2 : z - 50,
      horizontal ? L + 100 : depth,
      horizontal ? depth : L + 100,
      sill - 65,
      65,
      mats.wall,
    );
  }
  for (const floor of data.floors) {
    const group = new THREE.Group();
    group.name = floor.id;
    group.position.set(
      floor.offset[0] * MM,
      floor.base * MM,
      floor.offset[1] * MM,
    );
    root.add(group);
    const caps = new THREE.Group();
    caps.visible = false;
    const walls = new THREE.Group(),
      details = new THREE.Group(),
      surfaces = new THREE.Group(),
      plans = new THREE.Group();
    const stairGroups = new Map();
    group.add(surfaces, walls, details, plans, caps);
    const floorInfo = {
      name: floor.title + " slab",
      floor: floor.id,
      kind: "slab",
      source: "SVG floor outline and void",
    };
    if (floor.id === "ground") {
      const landscape = new THREE.Group();
      landscape.name = "landscaping";
      surfaces.add(landscape);
      environmentControllers.push(...buildSite(landscape, floor, extrude, tag));
      buildFurniture(details, floor, tag, mats.cabinetWood);
    }
    for (const pool of floor.source.geometry.filter((g) => g.type === "pool")) {
      const poolGroup = new THREE.Group();
      poolGroup.name = pool.id;
      surfaces.add(poolGroup);
      const updatePool = buildPool(
        poolGroup,
        pool,
        data.spec.pool,
        extrude,
        tag,
      );
      poolUpdates.push(updatePool);
      if (updatePool.interaction) {
        Object.assign(updatePool.interaction, {
          kind: "water",
          id: `water:${pool.id}`,
        });
        environmentControllers.push(updatePool.interaction);
      }
    }
    extrude(
      surfaces,
      floor.slab,
      -data.floorZone,
      data.floorZone,
      // Keep the floor finish on horizontal faces; exposed slab edges continue
      // the wall finish instead of drawing brown bands around the exterior.
      [mats.slab, mats.wall],
      floorInfo,
    );
    const porch =
      floor.id === "ground"
        ? polygonClipping.intersection(floor.slab, [
            rectangle(14280, 13790, 3590, 2280),
          ])
        : [];
    if (porch.length) {
      extrude(surfaces, porch, 1, 3, mats.porch, {
        name: "Photographed terracotta porch finish",
        floor: floor.id,
        kind: "finish",
        source: "Entrance photograph; colour approximated in daylight",
      });
    }
    for (const slab of floor.lowerSlabs)
      extrude(
        surfaces,
        slab.polygons,
        slab.top - data.floorZone,
        data.floorZone,
        [mats.slab, mats.wall],
        {
          ...floorInfo,
          name: "Garage slab",
          elevation: slab.top,
          source: data.spec.garageLevelSource,
        },
      );
    for (const room of floor.rooms) {
      if (room.category === "void" || !room.pointsMm?.length) continue;
      const bathroom = ["bath1", "bath2", "ensuite", "wc1", "powder"].includes(
        room.id,
      );
      let floorMaterial = room.category === "wet" ? mats.wet : mats.room;
      if (/^bed[1-5]$/.test(room.id) || room.id === "study")
        floorMaterial = mats.carpet;
      if (bathroom) floorMaterial = mats.bathroomTile;
      if (["kitchen", "laundry"].includes(room.id)) floorMaterial = mats.mosaic;
      if (room.id === "garage") floorMaterial = mats.slab;
      const roomPolygons = polygonClipping.intersection(
        [room.pointsMm],
        floor.slab,
      );
      // Finish regions must be disjoint: coplanar porch and room tops flicker.
      const polygons = porch.length
        ? polygonClipping.difference(roomPolygons, ...porch)
        : roomPolygons;
      extrude(surfaces, polygons, 1, 3, floorMaterial, {
        name: room.name,
        floor: floor.id,
        kind: "room",
        source: "SVG room polygon",
        dimensions: room.dimensions,
      });
      for (const slab of floor.lowerSlabs) {
        const lower = polygonClipping.intersection(
          [room.pointsMm],
          slab.polygons,
        );
        if (lower.length)
          extrude(surfaces, lower, slab.top + 1, 3, floorMaterial, {
            name: room.name,
            floor: floor.id,
            kind: "room",
            elevation: slab.top,
            source: data.spec.garageLevelSource,
            dimensions: room.dimensions,
          });
      }
      const b = bounds(room.pointsMm);
      labelAnchors.push({
        name: room.name,
        floor: floor.id,
        point: new THREE.Vector3(
          (b.minX + b.maxX) / 2000,
          0.16,
          (b.minZ + b.maxZ) / 2000,
        ),
        group,
      });
      line(
        plans,
        [...room.pointsMm, room.pointsMm[0]].map((p) => [p[0], 7, p[1]]),
        mats.plan,
      );
    }
    const finishGaps = floorFinishGaps(floor, porch);
    for (const [region, polygons] of Object.entries(finishGaps)) {
      if (!polygons.length) continue;
      const stair = region === "stair";
      extrude(surfaces, polygons, 1, 3, mats.room, {
        name: stair ? "Stair circulation oak floor finish" : "Interior circulation and threshold oak finish",
        floor: floor.id,
        kind: "finish",
        finishPatch: stair ? "stair-floor" : "interior-floor",
        source: "Unassigned interior slab connected to oak rooms; preserves walls, stairs, voids and existing finishes",
      });
    }
    for (const wall of floor.walls) {
      const info = {
        name: wall.id.replaceAll("-", " "),
        floor: floor.id,
        kind: "wall",
        source: wall.source,
        height: wall.height,
        width: wall.bounds.maxX - wall.bounds.minX,
        depth: wall.bounds.maxZ - wall.bounds.minZ,
      };
      if (wall.cuts.some((c) => c.arch)) wallWithArch(walls, wall, info);
      else
        for (const band of wall.bands)
          extrude(
            walls,
            band.polygons,
            band.bottom,
            band.top - band.bottom,
            mats.wall,
            info,
          );
      for (const band of wall.bands)
        if (band.bottom < 1200 && band.top > 1200)
          extrude(caps, band.polygons, 1199, 2, mats.wall);
    }
    const built = new Set();
    const glazingForDoor = (doorCut) =>
      floor.cuts.find(
        (w) =>
          w.window &&
          w.sill === 0 &&
          doorCut.bounds.minX >= w.bounds.minX - 40 &&
          doorCut.bounds.maxX <= w.bounds.maxX + 40 &&
          doorCut.bounds.minZ >= w.bounds.minZ - 40 &&
          doorCut.bounds.maxZ <= w.bounds.maxZ + 40,
      );
    for (const cut of floor.cuts) {
      if (cut.window && !built.has(`window:${cut.window.id}`)) {
        const embedded = floor.cuts.filter(
          (d) => d.door && glazingForDoor(d) === cut,
        );
        windowFrame(details, cut.window, { ...cut, doors: embedded }, floor.id);
        built.add(`window:${cut.window.id}`);
      }
      if (cut.door && !built.has(`door:${cut.door.id}`)) {
        built.add(`door:${cut.door.id}`);
        const glazing = glazingForDoor(cut);
        const door = cut.door,
          leaf = new THREE.Group();
        const key = `${floor.id}:${door.id}`;
        const height = glazing
          ? glazing.head - (glazing.archProfile?.radius || 0)
          : data.spec.inferredDoorHeight;
        const closedAngle = -THREE.MathUtils.degToRad(door.angle);
        const edgeGap = data.spec.inferredDoorEdgeGap;
        const leafWidth = door.width - 2 * edgeGap;
        const thickness = data.spec.inferredDoorThickness;
        // The plan hinge is at the swing-facing edge of the slab. Centring the
        // thickness on it makes the back corner rotate into the hinge jamb.
        const slabCenter = (-door.swing * thickness) / 2;
        const pairedId = pairedDoorId(
          door,
          floor.source.geometry.filter((g) => g.type === "door"),
        );
        const state = {
          leaf,
          open: false,
          closedAngle,
          swing: door.swing,
          pairedKey: pairedId ? `${floor.id}:${pairedId}` : null,
        };
        doors.set(key, state);
        leaf.name = key;
        leaf.position.set(door.x * MM, 0, door.y * MM);
        leaf.rotation.y = closedAngle;
        details.add(leaf);
        const info = {
          name: door.id.replaceAll("-", " ") + " door",
          floor: floor.id,
          kind: "door",
          doorKey: key,
          width: door.width,
          height,
          source: "SVG door hinge / leaf width",
        };
        if (door.kind === "shower") {
          const glass = data.spec.fixtureProfiles["shower-glass"];
          glassEdges(
            box(
              leaf,
              5,
              -glass.thickness / 2,
              door.width - 10,
              glass.thickness,
              glass.bottom,
              glass.height,
              mats.showerGlass,
              info,
            ),
          );
        } else if (glazing && !door.id.startsWith("front-entry")) {
          box(
            leaf,
            edgeGap + 30,
            slabCenter - mats.glass.thickness / MM / 2,
            leafWidth - 60,
            mats.glass.thickness / MM,
            30,
            height - 60,
            mats.glass,
            info,
          );
          for (const xx of [edgeGap, edgeGap + leafWidth - 30])
            box(
              leaf,
              xx,
              slabCenter - thickness / 2,
              30,
              thickness,
              0,
              height,
              mats.frame,
              info,
            );
          for (const yy of [0, height - 30])
            box(
              leaf,
              edgeGap,
              slabCenter - thickness / 2,
              leafWidth,
              thickness,
              yy,
              30,
              mats.frame,
              info,
            );
        } else {
          const geometry = createCarvedDoorGeometry({
            width: leafWidth * MM,
            height: height * MM,
            thickness: thickness * MM,
          });
          const panelled = new THREE.Mesh(
            geometry,
            door.id.startsWith("front-entry") ? mats.entranceTimber : mats.door,
          );
          panelled.position.set(
            (edgeGap + leafWidth / 2) * MM,
            (height / 2) * MM,
            slabCenter * MM,
          );
          panelled.castShadow = panelled.receiveShadow = true;
          tag(panelled, { ...info, doorRelief: geometry.userData.carvedDoor });
          leaf.add(panelled);
        }
      }
    }
    for (const stair of floor.stairs) {
      const stairGroup = new THREE.Group();
      stairGroup.name = stair.id;
      group.add(stairGroup);
      stairGroups.set(stair.id, stairGroup);
      for (const tread of stair.treads) {
        const bottom = Math.max(
          stair.bottom,
          tread.elevation - stair.rise - data.spec.inferredStairThickness,
        );
        extrude(
          stairGroup,
          [[tread.points]],
          bottom,
          tread.elevation - bottom,
          mats.wall,
          {
            name: stair.id + " tread " + tread.level,
            floor: floor.id,
            kind: "stair",
            stairId: stair.id,
            level: tread.level,
            elevation: floor.base + tread.elevation,
            underside: floor.base + bottom,
            source:
              "Shared tread polygons / section rise; inferred 120 mm underside thickness",
          },
        );
      }
    }
    for (const guard of floor.source.geometry.filter(
      (g) => g.type === "guard",
    )) {
      const stair = floor.stairs.find((s) => s.id === guard.stairId);
      // The upper plan shows the same connecting centre guard; instantiate it
      // once with its stair, whose existing group handles isolation/explosion.
      if (guard.stairId && !stair) continue;
      const host = stair ? stairGroups.get(stair.id) : details;
      for (const [index, panel] of guard.panels.entries()) {
        const extendCurve =
          floor.id === "ground" &&
          guard.id === "stair-outer-guard" &&
          panel.points
            .slice(0, 2)
            .every(([, z]) => z >= stair.y + stair.flight - 0.01);
        const encloseLowerFlight =
          floor.id === "ground" &&
          guard.id === "stair-outer-guard" &&
          panel.points
            .slice(0, 2)
            .every(([x]) => x >= stair.x + stair.width - 0.01);
        // Both exposed faces stop at ground level. The cellar contains no
        // extension of this wall or passage jambs from the earlier version.
        const base = extendCurve || encloseLowerFlight ? 0 : null;
        const mesh = new THREE.Mesh(
          guardGeometry(
            shapeOf([panel.points]),
            panel,
            stair?.rise ?? 0,
            data.spec.inferredGuardHeight,
            stair ? stair.rise + data.spec.inferredStairThickness : 0,
            base,
          ),
          mats.wall,
        );
        mesh.position.y = (stair?.bottom ?? 0) * MM;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        host.add(mesh);
        tag(mesh, {
          name: guard.id.replaceAll("-", " "),
          kind: "guard",
          guardId: guard.id,
          panel: index,
          floor: floor.id,
          height: data.spec.inferredGuardHeight,
          baseElevation: base,
          source: guard.source,
        });
      }
    }
    // Only typed shared footprints become solids. Decorative plan rectangles
    // and clear room centres are never inferred to be full cabinet volumes.
    for (const fixture of floor.source.geometry.filter(
      (g) => g.type === "fixture",
    )) {
      const profile = data.spec.fixtureProfiles[fixture.profile];
      if (!profile)
        throw new Error(`Unknown fixture profile: ${fixture.profile}`);
      const info = {
        name: fixture.name,
        floor: floor.id,
        kind: fixture.profile === "shower-glass" ? "shower-screen" : "fixture",
        fixtureId: fixture.id,
        profile: fixture.profile,
        source: fixture.source,
        height: profile.height,
        bottom: profile.bottom,
      };
      if (fixture.profile === "shower-glass") {
        const [[x, z], [endX, endZ]] = fixture.points;
        const length = Math.hypot(endX - x, endZ - z);
        const panel = new THREE.Group();
        panel.position.set(x * MM, 0, z * MM);
        panel.rotation.y = -Math.atan2(endZ - z, endX - x);
        details.add(panel);
        glassEdges(
          box(
            panel,
            profile.jointGap,
            -profile.thickness / 2,
            length - profile.jointGap * 2,
            profile.thickness,
            profile.bottom,
            profile.height,
            mats.showerGlass,
            info,
          ),
        );
      } else {
        if (profile.enclosedBase) {
          extrude(
            details,
            [[fixture.points]],
            0,
            profile.bottom,
            [mats.fixture, mats.cabinetWood],
            {
              ...info,
              name: `${fixture.name} — bottom cover`,
              part: "bottom-cover",
              bottom: 0,
              height: profile.bottom,
            },
          );
        }
        extrude(
          details,
          [[fixture.points, ...fixture.holes]],
          profile.bottom,
          profile.height,
          fixture.profile === "shelf"
            ? mats.cabinetWood
            : mats[profile.material],
          info,
        );
        if (profile.baseThickness) {
          extrude(
            details,
            [[fixture.points]],
            profile.bottom,
            profile.baseThickness,
            mats[profile.material],
            info,
          );
        }
      }
    }
    plans.visible = false;
    floorGroups.set(floor.id, {
      group,
      walls,
      details,
      surfaces,
      plans,
      stairGroups,
      caps,
      floor,
    });
  }
  // Every elevation and this model use the same registered roof face polygons.
  const roof = new THREE.Group();
  roof.name = "roof";
  root.add(roof);
  const garageRoof = new THREE.Group();
  garageRoof.name = "lower-roofs";
  floorGroups.get("ground").group.add(garageRoof);
  roofAssemblyMeshes(data.spec.roofAssembly, roof, garageRoof, mats, tag);
  for (const face of data.spec.corniceAssembly.faces) {
    const mesh = new THREE.Mesh(
      geometryFor(face.rings),
      face.material === "wall"
        ? mats.wall
        : face.material === "gutter"
          ? mats.gutter
          : mats.fascia,
    );
    const entry = floorGroups.get(face.level === "upper" ? "first" : "ground");
    // Assembly coordinates are world millimetres; each floor group has its own datum.
    mesh.position.copy(entry.group.position).multiplyScalar(-1);
    mesh.castShadow = mesh.receiveShadow = true;
    tag(mesh, {
      kind: face.kind === "pilaster" ? "pilaster" : "cornice",
      pilasterId: face.pilasterId,
      name: face.component.replaceAll("-", " "),
      corniceFaceId: face.id,
      floor: entry.floor.id,
      source: data.spec.corniceAssembly.source,
    });
    entry.details.add(mesh);
  }
  // Custom cornice and roof fascia geometries also receive metre-scale mapping.
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    if (mesh.material === mats.glass || mesh.material === mats.showerGlass) {
      mesh.geometry.computeBoundingBox();
      const paneSize = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
      mesh.userData.opticalSurface = "glass";
      mesh.userData.paneThickness = mesh.material.thickness;
      mesh.userData.paneAxis = paneSize.x < paneSize.z ? "x" : "z";
    }
    if (
      [mesh.material].flat().some((material) => material.userData?.physicalUV)
    )
      woodUVs(mesh.geometry);
    applyFinishVariation(mesh);
    if (mesh.userData.doorRelief) {
      mesh.material = createDoorReliefMaterial(mesh.material, {
        ...mesh.userData.doorRelief,
        woodUVOffset: mesh.userData.finishVariation?.uvOffset || [0, 0],
      });
    }
  });
  // Room datum indicators are HTML labels placed by the renderer.
  return {
    root,
    floorGroups,
    roof,
    garageRoof,
    materials: mats,
    doors,
    doorKeys(key) {
      const door = doors.get(key);
      if (!door) return [];
      return door.pairedKey ? [key, door.pairedKey] : [key];
    },
    toggleDoor(key, now = performance.now()) {
      const door = doors.get(key);
      if (!door) return;
      const open = !door.open;
      setDoorOpen(door, open, now);
      if (door.pairedKey) setDoorOpen(doors.get(door.pairedKey), open, now);
      return open;
    },
    updateWater(now = performance.now()) {
      let moving = false;
      for (const update of poolUpdates) moving = update(now) || moving;
      return moving;
    },
    updateDoors(now = performance.now()) {
      let moving = false;
      for (const door of doors.values()) {
        if (advanceDoor(door, now)) moving = true;
      }
      return moving;
    },
    environmentControllers,
    pickables,
    labelAnchors,
  };
}
