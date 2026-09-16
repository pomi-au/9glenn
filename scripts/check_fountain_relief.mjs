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
for (const kind of ['face','body','scales','hair']) {
  const maps = fountainReliefMaps(kind);
  assert.equal(fountainReliefMaps(kind), maps, 'Reuse generated region maps');
  const {normalMap, bumpMap, bumpScale} = maps;
  const width = 1 / normalMap.repeat.x, height = 1 / normalMap.repeat.y;
  assert.equal(width, kind === 'scales' ? .048 : .032);
  assert.equal(height, kind === 'scales' ? .056 : kind === 'hair' ? .064 : .032);
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
assert(amplitudes.hair>.00060 && amplitudes.hair<.00067,'Hair has half-millimetre combed grooves, not facial-scale grain');
assert(amplitudes.hair>amplitudes.body*7 && amplitudes.hair<amplitudes.scales,'Relief strengths distinguish cast grain, flowing hair and overlapping scales');
assert.throws(()=>fountainReliefMaps('unknown'),/Unknown/);

const sourceMap = new THREE.DataTexture(new Uint8Array([128,160,140,255]),1,1);
const base = new THREE.MeshStandardMaterial({map:sourceMap,roughnessMap:sourceMap});
const stone = new THREE.MeshStandardMaterial();
const route=fountainDetailMaterials(base);
const scene = new THREE.Scene();
createFountainSculpture((g,m,name)=>{
  const mesh=new THREE.Mesh(g,route(name,m));mesh.name=name;scene.add(mesh);return mesh;
},stone,base);
const expected = (name)=>name.includes('hair')?'hair':name.includes('scaled curled tail')?'scales':
  /face with|eyelids and eyes/.test(name)?'face':
  /sculpted torso|raised arm|arm across lap|hands and fingers/.test(name)?'body':null;
const counts={face:0,body:0,scales:0,hair:0};
for (const mesh of scene.children) {
  const region=expected(mesh.name);
  if (!region) {
    assert.equal(mesh.material,base,'Reference pedestal and all unassigned sculpture parts retain bronze');
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
assert(counts.face>=1 && counts.scales===1 && counts.hair>=1,'Anatomical face, scaled tail and carved hair receive explicit relief');
for(const mesh of scene.children.filter(mesh=>mesh.name.includes('hair')))
  assert.equal(mesh.material.userData.reliefRegion,'hair','Crown and flowing locks both use oriented groove maps');
const bodyMesh=scene.children.find(mesh=>mesh.name.includes('sculpted torso'));
assert.equal(bodyMesh.material.userData.reliefRegion,'face','Continuous anatomical body uses restrained facial cast grain');
const tail = scene.children.find(mesh=>mesh.name.includes('scaled curled tail'));
const tailUV=tail.geometry.attributes.uv;
const positions=tail.geometry.attributes.position;
const uvAtPosition=new Map();
let vMin=Infinity,vMax=-Infinity;
for(let i=0;i<tailUV.count;i++) {
  const u=tailUV.getX(i),v=tailUV.getY(i);
  assert(Number.isFinite(u+v));vMin=Math.min(vMin,v);vMax=Math.max(vMax,v);
  const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(x=>Math.round(x*1e7)).join(',');
  const previous=uvAtPosition.get(key);
  if(previous) {
    const periods=(u-previous[0])/.672;
    assert(Math.abs(periods-Math.round(periods))<1e-5,'Duplicate SDF vertices agree modulo the complete scale circumference');
    assert(Math.abs(v-previous[1])<1e-5,'No longitudinal mapping jump across shared triangles');
  } else uvAtPosition.set(key,[u,v]);
}
assert(vMax-vMin>.35 && vMax-vMin<.8,'Tail length coordinate remains physical metres');
const tailIndex=tail.geometry.index;
for(let i=0;i<(tailIndex?.count||tailUV.count);i+=3) {
  const u=[0,1,2].map(j=>tailUV.getX(tailIndex?tailIndex.getX(i+j):i+j));
  const v=[0,1,2].map(j=>tailUV.getY(tailIndex?tailIndex.getX(i+j):i+j));
  const pole=v.every(value=>Math.abs(value-vMin)<1e-6)||v.every(value=>Math.abs(value-vMax)<1e-6);
  assert(pole || Math.max(...u)-Math.min(...u)<.337,'Non-polar triangles take the short path around the UV seam');
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
console.log('PASS fountain relief: seamless tiles, physical heights, signed unit normals, restrained cast grain, continuous anatomical region assignments and Photo normal/UV preservation');
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
