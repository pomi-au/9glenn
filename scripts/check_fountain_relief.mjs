import { build } from "esbuild";

// Bundle the image imports away: synthetic bronze verifies routing and snapshots
// without a browser, network or generated-image decoder.
const result = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {fountainReliefHeight, fountainReliefMaps} from './model/fountain-relief.js';
import {fountainDetailMaterials} from './model/fountain-material.js';
import {createFountainSculpture} from './model/fountain-sculpture.js';
import {createPhotoScene} from './model/photo-scene.js';

const amplitudes = {};
for (const kind of ['face','body','scales']) {
  const maps = fountainReliefMaps(kind);
  assert.equal(fountainReliefMaps(kind), maps, 'Reuse generated region maps');
  const {normalMap, bumpMap, bumpScale} = maps;
  const width = 1 / normalMap.repeat.x, height = 1 / normalMap.repeat.y;
  assert.equal(width, kind === 'scales' ? .048 : .032);
  assert.equal(height, kind === 'scales' ? .056 : .032);
  for (const map of [normalMap,bumpMap]) {
    assert.equal(map.wrapS, THREE.RepeatWrapping);
    assert.equal(map.wrapT, THREE.RepeatWrapping);
    assert.equal(map.colorSpace, THREE.NoColorSpace);
    assert.equal(map.flipY, false, 'Height rows follow increasing texture v');
    assert.equal(map.channel, 0, 'Physical metre UVs remain the shared coordinate source');
    assert.equal(map.generateMipmaps, true);
  }
  const n = normalMap.image.data, b = bumpMap.image.data;
  const size = normalMap.image.width;
  let min = Infinity, max = -Infinity;
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const u=x/size, v=y/size, index=(y*size+x)*4;
    const h=fountainReliefHeight(kind,u,v);
    min=Math.min(min,h); max=Math.max(max,h);
    assert(Number.isFinite(h));
    assert(Math.abs(fountainReliefHeight(kind,u+1,v)-h)<1e-12, 'U tile periodicity');
    assert(Math.abs(fountainReliefHeight(kind,u,v-1)-h)<1e-12, 'V tile periodicity');
    assert(Math.abs((b[index]/255-.5)*bumpScale-h)<=bumpScale/510+1e-10,
      'Height encoding preserves physical metres without clipping');
    const nx=n[index]/127.5-1, ny=n[index+1]/127.5-1, nz=n[index+2]/127.5-1;
    assert(Math.abs(Math.hypot(nx,ny,nz)-1)<.008, 'Quantized finite unit normal');
    assert(nz>0 && Number.isFinite(nx+ny+nz), 'No inverted or invalid normals');
    assert.equal(n[index+3],255); assert.equal(b[index+3],255);
    // Validate tangent handedness, wrapped edge sampling and physical scale.
    const dx=(fountainReliefHeight(kind,u+1/size,v)-fountainReliefHeight(kind,u-1/size,v))*size/(2*width);
    const dy=(fountainReliefHeight(kind,u,v+1/size)-fountainReliefHeight(kind,u,v-1/size))*size/(2*height);
    const length=Math.hypot(dx,dy,1);
    assert(Math.abs(nx+dx/length)<.0041 && Math.abs(ny+dy/length)<.0041,
      'Normal gradients match the height field, including both tile seams');
  }
  amplitudes[kind]=max-min;
}
assert(amplitudes.face<.000037 && amplitudes.body<.000071,
  'Facial and body cast grain cannot overpower anatomical sculpting');
assert(amplitudes.body>amplitudes.face*1.8);
assert(amplitudes.scales>.0013 && amplitudes.scales<.003);
assert(amplitudes.scales>amplitudes.body*10, 'Overlapping scales have stronger relief than cast grain');
assert.throws(()=>fountainReliefMaps('unknown'),/Unknown/);

const sourceMap = new THREE.DataTexture(new Uint8Array([128,160,140,255]),1,1);
const base = new THREE.MeshStandardMaterial({map:sourceMap,roughnessMap:sourceMap});
const stone = new THREE.MeshStandardMaterial();
const route=fountainDetailMaterials(base);
const scene = new THREE.Scene();
createFountainSculpture((g,m,name)=>{
  const mesh=new THREE.Mesh(g,route(name,m));mesh.name=name;scene.add(mesh);return mesh;
},stone,base);
const expected = (name)=>name.includes('scaled curled tail')?'scales':
  /face with|eyelids and eyes/.test(name)?'face':
  /sculpted torso|raised arm|arm across lap|hands and fingers/.test(name)?'body':null;
const counts={face:0,body:0,scales:0};
for (const mesh of scene.children) {
  const region=expected(mesh.name);
  if (!region) {
    assert.equal(mesh.material,mesh.name==='fountain pedestal'?stone:base);
    continue;
  }
  counts[region]++;
  const m=mesh.material, maps=fountainReliefMaps(region);
  assert.equal(m.userData.reliefRegion,region);
  assert.equal(m.normalMap,maps.normalMap);assert.equal(m.bumpMap,maps.bumpMap);
  assert.equal(m.bumpScale,maps.bumpScale);
  assert.deepEqual(m.normalScale.toArray(),[1,1]);
  assert.equal(m.map,sourceMap);assert.equal(m.roughnessMap,sourceMap);
}
assert.deepEqual(counts,{face:2,body:4,scales:1});
const tail = scene.children.find(mesh=>mesh.name.includes('scaled curled tail'));
const tailUV=tail.geometry.attributes.uv;
for (let row=0;row<=168;row++) {
  const start=row*65,end=start+64;
  const u0=tailUV.getX(start),u1=tailUV.getX(end),v=tailUV.getY(start);
  assert(Math.abs((u1-u0)/.048-14)<1e-6, 'Every tail ring closes with fourteen whole tiles');
  assert.equal(tailUV.getY(end),v,'No longitudinal seam discontinuity');
  const h0=fountainReliefHeight('scales',u0/.048,v/.056);
  const h1=fountainReliefHeight('scales',u1/.048,v/.056);
  assert(Math.abs(h1-h0)<1e-8,'Scaled relief has no height jump at the closed tail seam');
}
assert.equal(base.normalMap,null,'Detail routing does not mutate original bronze');
const photo=createPhotoScene(scene,new THREE.PerspectiveCamera());
for (const mesh of photo.scene.children) {
  const live=scene.getObjectByName(mesh.name);
  assert.equal(mesh.material,live.material);
  assert.equal(mesh.material.normalMap,live.material.normalMap,
    'Photo retains explicit tangent normals, rather than relying on unsupported bump-only shading');
  assert.deepEqual(mesh.geometry.attributes.normal.array,live.geometry.attributes.normal.array);
  assert.deepEqual(mesh.geometry.attributes.uv.array,live.geometry.attributes.uv.array);
}
photo.dispose();
console.log('PASS fountain relief: seamless tiles, physical heights, signed unit normals, restrained cast grain, seven region assignments and Photo normal/UV preservation');
`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  loader: { ".png": "empty", ".jpg": "empty" },
  logLevel: "silent",
});
try {
  await import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
