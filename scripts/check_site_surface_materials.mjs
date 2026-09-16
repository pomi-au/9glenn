import { build } from "esbuild";

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import {siteSlabHeight,siteSlabMaps,siteSurfaceMaterial,awaitSiteSurfaceMaterials} from './model/site-surface-material.js';
import {buildSite,siteGrade} from './model/site-mesh.js';
import {createPhotoScene} from './model/photo-scene.js';

assert.equal(siteSlabHeight(0,.3),-.0025);
assert(Math.abs(siteSlabHeight(.3,.3))<.00004);
assert(siteSlabHeight(.004,.3)>siteSlabHeight(.001,.3));
assert(siteSlabHeight(.007,.3)>siteSlabHeight(.004,.3));
for(let i=0;i<300;i++) {
  const x=i*.037-3,z=i*.071-2,h=siteSlabHeight(x,z);
  assert(Number.isFinite(h) && h>=-.002501 && h<=.000036);
  assert(Math.abs(siteSlabHeight(x+1.2,z)-h)<1e-13);
  assert(Math.abs(siteSlabHeight(x,z-1.2)-h)<1e-13);
}
const maps=siteSlabMaps();
assert.equal(siteSlabMaps(),maps);
const n=maps.normalMap.image.data,b=maps.bumpMap.image.data,size=maps.normalMap.image.width;
assert.equal(size,1024);
for(const map of [maps.normalMap,maps.bumpMap]) {
  assert.equal(map.colorSpace,THREE.NoColorSpace);
  assert.equal(map.wrapS,THREE.RepeatWrapping);assert.equal(map.wrapT,THREE.RepeatWrapping);
  assert.deepEqual(map.repeat.toArray(),[1/1.2,1/1.2]);
  assert.equal(map.flipY,false);assert.equal(map.generateMipmaps,true);
}
for(let y=0;y<size;y+=7) for(let x=0;x<size;x+=7) {
  const i=(y*size+x)*4,nx=n[i]/127.5-1,ny=n[i+1]/127.5-1,nz=n[i+2]/127.5-1;
  assert(Math.abs(Math.hypot(nx,ny,nz)-1)<.008 && nz>0);
  const h=siteSlabHeight(x/size*1.2,y/size*1.2);
  assert(Math.abs(b[i]/255*maps.bumpScale-.0025-h)<maps.bumpScale/510+1e-9);
  const dx=(siteSlabHeight((x+1)/size*1.2,y/size*1.2)-siteSlabHeight((x-1)/size*1.2,y/size*1.2))*size/2/1.2;
  const dy=(siteSlabHeight(x/size*1.2,(y+1)/size*1.2)-siteSlabHeight(x/size*1.2,(y-1)/size*1.2))*size/2/1.2;
  const len=Math.hypot(dx,dy,1);
  assert(Math.abs(nx+dx/len)<.0041 && Math.abs(ny+dy/len)<.0041,'Signed normals follow physical height gradients');
}
const materials=Object.fromEntries(['soil','asphalt','paving','concrete'].map(kind=>[kind,siteSurfaceMaterial(kind)]));
for(const [kind,m] of Object.entries(materials)) {
  assert.equal(m.userData.siteSurface,kind);assert.equal(m.userData.physicalUV,true);
  assert.equal(m.userData.generatedTexture,kind==='paving'?'sitePaving':kind);
}
assert.equal(materials.paving.normalMap,maps.normalMap);
assert.equal(materials.concrete.bumpMap,maps.bumpMap);
assert.equal(materials.paving.userData.slabSize,.6);
assert.equal(materials.paving.userData.jointDepth,.0025);
assert.throws(()=>siteSurfaceMaterial('unknown'),/Unknown/);
await awaitSiteSurfaceMaterials();

const rect=(x,z,w,d)=>[[x,z],[x+w,z],[x+w,z+d],[x,z+d]];
const areas=[
  {id:'soil',type:'site-area',material:'soil',points:rect(0,0,4000,4000)},
  {id:'drive',type:'site-area',material:'asphalt',grade:'drive',points:rect(1000,1000,2000,2000)},
  {id:'path',type:'site-area',material:'paving',points:rect(2500,1000,1000,2000)},
];
const original=JSON.stringify(areas),captured=[];
const group=new THREE.Group();
buildSite(group,{outline:rect(10000,10000,1000,1000),source:{geometry:areas}},
  (parent,polygons,bottom,height,material,info)=>{
    captured.push({polygons,bottom,height,material,info});
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(.1,.06,.1),material);
    mesh.name=info.siteId;parent.add(mesh);
  },()=>{});
assert.equal(JSON.stringify(areas),original,'Site footprint records remain unchanged');
const signed=ring=>ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1]},0)/2;
const area=polygons=>polygons.reduce((sum,p)=>sum+Math.abs(signed(p[0]))-p.slice(1).reduce((h,r)=>h+Math.abs(signed(r)),0),0)/1e6;
assert.equal(area(captured.find(x=>x.info.siteId==='drive').polygons),4);
assert.equal(area(captured.find(x=>x.info.siteId==='path').polygons),1);
assert.equal(area(captured.find(x=>x.info.siteId==='soil').polygons),11,
  'Asphalt clips soil and later paving like other hard surfaces');
for(const item of captured) {
  assert.equal(item.info.walkable,true);assert.equal(item.bottom,-60);assert.equal(item.height,60);
}
assert.equal(siteGrade(1000,1000,'drive'),-.514);
const scene=new THREE.Scene();scene.add(group);
const snapshot=createPhotoScene(scene,new THREE.PerspectiveCamera());
const live=group.getObjectByName('path'),photo=snapshot.scene.children.find(m=>m.name==='path');
assert.equal(photo.material.normalMap,live.material.normalMap,'Photo retains the explicit joint normals');
assert.equal(photo.material.bumpMap,live.material.bumpMap);
snapshot.dispose();
console.log('PASS site surfaces: physical slab joints, periodic signed normals, generated finish routing, asphalt clipping, unchanged footprint/grade/walkability and Photo maps');
`,
  },
  plugins: [
    {
      name: "geometry-only-image-stubs",
      setup(build) {
        build.onResolve({ filter: /\.(png|jpg)$/ }, (args) => ({
          path: args.path,
          namespace: "test-image",
        }));
        build.onLoad({ filter: /.*/, namespace: "test-image" }, () => ({
          contents: 'export default "";',
          loader: "js",
        }));
      },
    },
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  loader: { ".png": "empty", ".jpg": "empty" },
  logLevel: "silent",
});
await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
