import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Vector3} from 'three';
import {buildCorniceAssembly} from '../model/cornice-assembly.js';
import {geometryFor} from '../model/roof-assembly-mesh.js';
const assembly=buildCorniceAssembly(JSON.parse(fs.readFileSync('assets/building-spec.json')).frontPhoto);
assert.deepEqual(assembly,JSON.parse(fs.readFileSync('assets/building-spec.json')).corniceAssembly,'Rebuild shared spec');
assert.equal(assembly.bands.filter(b=>b.component==='paired-sill').length,4);
let triangles=0;
for(const face of assembly.faces){
 const geometry=geometryFor(face.rings),pos=geometry.attributes.position;
 assert.ok(pos.count>=3,`Empty moulding ${face.id}`);
 for(let i=0;i<pos.count;i+=3){
  const a=new Vector3().fromBufferAttribute(pos,i),b=new Vector3().fromBufferAttribute(pos,i+1),c=new Vector3().fromBufferAttribute(pos,i+2);
  assert.ok([...a,...b,...c].every(Number.isFinite));
  assert.ok(b.sub(a).cross(c.sub(a)).length()>1e-10,`Degenerate face ${face.id}`);triangles++;
 }
 geometry.dispose();
}
for(const band of assembly.bands.filter(b=>b.component==='paired-sill')){
 // The front polygon stays below each of the paired panes, leaving both unobstructed.
 const sill=band.id.endsWith('2183')?2183:5441;
 for(const p of band.ring) assert.ok(p[1]>=sill-85&&p[1]<=sill+170);
}
for(const name of ['upper-head','ground-head']){
 const expected=name==='upper-head'?640:3898;
 for(const b of assembly.bands.filter(b=>b.component===name))assert.equal(b.contour.at(-1)[0],expected,'Band must terminate at PDF window-head course');
}
for(let i=1;i<=4;i++)assert.ok(fs.readFileSync(`drawings/elevation-${i}.svg`,'utf8').includes('data-cornice-face='),'Missing solid projection');
console.log(`PASS ${assembly.bands.length} band runs, ${assembly.faces.length} solid faces, ${triangles} nondegenerate triangles; PDF head-course levels and four SVG projections`);

assert.equal(assembly.pilasters.length,2,'Both upper front piers must be solid');
assert.deepEqual(assembly.pilasters.map(p=>p.x),[14280,17280]);
for(const p of assembly.pilasters){
 assert.equal(p.bottom,3858,'Pier stands on the portico entablature');
 assert.equal(p.top,5869,'Pier meets the underside of the eave cap');
 assert.equal(p.projection,230,'Side detail shows substantial shaft projection');
 assert.equal(assembly.bands.filter(b=>b.component===p.id+'-cap').length,3);
 assert.equal(assembly.bands.filter(b=>b.component===p.id+'-head-band').length,3);
 assert.ok(p.x+p.width<=15290||p.x>=16860,'Keep the upper arched window clear');
 assert.equal(assembly.faces.filter(f=>f.pilasterId===p.id).length,6);
}
console.log('PASS both upper front pilasters: solid faces, datum heights, positive relief and clear arched window');

assert.equal(assembly.photoOpenings.length,4);
assert.ok(assembly.bands.some(b=>b.component==='photo-front-storey'));
assert.equal(assembly.bands.filter(b=>b.component==='photo-garage-fascia').length,1);
console.log('PASS photo front: four combined segmental openings, retained upper sills and front-only garage fascia');
