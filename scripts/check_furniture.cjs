const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const clip=require('polygon-clipping');
const {chromium}=require('/Users/yinsee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{
const page=await browser.newPage({viewport:{width:1100,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('file://'+path.resolve('9-glenn-viewer.html')+'#3d');await page.waitForFunction(()=>window.Building3D?.instance);
const data=await page.evaluate(()=>{const i=Building3D.instance,g=i.data.floors.find(f=>f.id==='ground');return{items:g.source.geometry.filter(g=>g.type==='furniture'),pool:g.source.geometry.find(g=>g.type==='pool'),meshes:i.model.pickables.filter(m=>m.userData.kind==='furniture').map(m=>({id:m.userData.furnitureId,finite:Array.from(m.geometry.attributes.position.array).every(Number.isFinite)}))};});
assert.equal(data.items.length,11);assert.equal(data.items.filter(i=>i.form==='chair').length,6);assert.equal(data.items.filter(i=>i.form==='lounger').length,2);
for(const [n,item] of data.items.entries()){
assert.equal(clip.difference([item.points],[data.pool.parts.paving]).length,0,'Furniture remains on the patio paving');
assert.equal(clip.intersection([item.points],[data.pool.parts.coping]).length,0,'Pool and entry coping stay clear');
for(const other of data.items.slice(n+1).filter(other=>item.form!=='canopy'&&other.form!=='canopy'))assert.equal(clip.intersection([item.points],[other.points]).length,0,'Furniture footprints remain separate');
assert(data.meshes.some(m=>m.id===item.id),'Furniture is built from each plan entity');
}
assert(data.meshes.every(m=>m.finite));
const canopy=data.items.find(i=>i.form==='canopy');
for(const item of data.items.filter(i=>i.id.startsWith('patio-')&&i.form!=='canopy'))
assert.equal(clip.difference([item.points],[canopy.points]).length,0,'Canvas covers the dining set');
for(const item of data.items.filter(i=>i.id.startsWith('pool-'))){
assert(item.points.every(([x,z])=>x>31630&&z>6600&&z<12300),'Loungers and small table sit alongside the pool body');
}

const shared=await page.evaluate(()=>{const clone=structuredClone(DRAWINGS);const g=clone.find(d=>d.id==='ground');const nodes=n=>[n,...(n.children||[]).flatMap(nodes)];const group=nodes(g.vector).find(n=>n.attributes?.['data-furniture']==='patio-dining-table');const p=group.children.find(n=>n.attributes?.['data-furniture-outline']);p.attributes.points=p.attributes.points.split(' ').map(s=>{const[x,z]=s.split(',').map(Number);return`${x+100},${z}`;}).join(' ');return Building3D.parseBuilding(clone).floors.find(f=>f.id==='ground').source.geometry.find(g=>g.id==='patio-dining-table').points[0][0];});
assert.equal(shared,data.items[0].points[0][0]+100);
fs.mkdirSync('audit/furniture',{recursive:true});
for(const view of ['oblique','top']){
const png=await page.evaluate(view=>{const i=Building3D.instance;Object.assign(i.settings,{floor:'ground',roof:false,cut:false,plans:false,labels:false,landscape:false});i.update();i.model.root.position.set(0,0,0);i.pivot.position.set(0,0,0);i.pivot.quaternion.identity();i.model.root.updateMatrixWorld(true);const c=i.tour.camera;c.position.set(...(view==='top'?[29.9,15,7.5]:[37,7.4,13.9]));c.lookAt(29.9,.6,7.5);c.updateProjectionMatrix();i.renderer.shadowMap.needsUpdate=true;i.renderer.render(i.scene,c);return i.renderer.domElement.toDataURL('image/png');},view);
fs.writeFileSync(`audit/furniture/patio-${view}.png`,Buffer.from(png.split(',')[1],'base64'));
}
assert.deepEqual(errors,[]);fs.writeFileSync('audit/furniture/checks.json',JSON.stringify({furnitureCount:data.items.length,meshCount:data.meshes.length,clearOfPool:true,sharedPlan:true},null,2));console.log('PASS patio furniture: 11 shared plan items including canvas canopy; separate footprints; pool and entries clear; finite model meshes; SVG edit propagation.');
}finally{await browser.close();}})();
