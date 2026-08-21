import {chromium} from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1500,height:950}});
await p.goto('http://localhost:3000/',{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
await p.getByPlaceholder('Filter graphics').fill('turn'); await p.waitForTimeout(400);
await p.getByText('turn',{exact:true}).first().click();
await p.locator('button').filter({hasText:/Add Graphic|Drawing…/}).first().click();
const box = await p.locator('.map-container').boundingBox();
await p.mouse.click(box.x+620, box.y+430);
await p.mouse.dblclick(box.x+820, box.y+430);
await p.waitForTimeout(1600);
await p.locator('button').filter({hasText:/^Edit$|^Editing/}).first().click();
await p.waitForTimeout(400);
const ink = await p.evaluate(()=>{const m=window.__tacticalGraphics.manager,o=[];m.renderingVectorSource.getFeatures().forEach(f=>{if(f.get('handle')||f.get('base')||f.get('measure'))return;const c=f.getGeometry()?.getCoordinates?.();if(!c)return;const w=a=>{if(typeof a[0]==='number'){const q=m.map.getPixelFromCoordinate(a);if(q)o.push(q);return;}a.forEach(w);};w(c);});return o.slice(0,12);});
for (const [x,y] of ink) { await p.mouse.click(box.x+x, box.y+y); await p.waitForTimeout(420); if (await p.evaluate(()=>window.__tacticalEngine.getSelection())) break; }
console.log('selected:', !!(await p.evaluate(()=>window.__tacticalEngine.getSelection())));
const allHandles = () => p.evaluate(()=>{
  const m=window.__tacticalGraphics.manager, o=[];
  m.renderingVectorSource.getFeatures().forEach(f=>{
    if(!f.get('handle')||f.get('measure'))return;
    const c=f.getGeometry()?.getCoordinates?.(); if(!c)return;
    const pts=Array.isArray(c[0])?c:[c];
    pts.forEach((q,i)=>{const px=m.map.getPixelFromCoordinate(q); if(px)o.push({i, inert:!!f.get('inert'), hidden:!!f.get('hidden'), px:px.map(Math.round)});});
  });
  return o;
});
const bendPx = () => p.evaluate(()=>{
  const m=window.__tacticalGraphics.manager;
  for (const f of m.renderingVectorSource.getFeatures()) {
    if(!f.get('handle')||f.get('hidden')||f.get('measure')||f.get('inert'))continue;
    const c=f.getGeometry()?.getCoordinates?.(); if(!c)continue;
    const pts=Array.isArray(c[0])?c:[c];
    return m.map.getPixelFromCoordinate(pts[0]);
  }
  return null;
});
const bend = () => p.evaluate(()=>window.__tacticalEngine.snapshot().features[0].properties.tacticalGraphic.bend);
await p.screenshot({path:'.playwright-out/bend-0-before.png', clip:{x:box.x+540,y:box.y+330,width:420,height:280}});
console.log('bend before:', await bend(), JSON.stringify(await allHandles()));
// Drag the bend handle toward the middle, in steps, screenshotting.
for (const step of [1,2]) {
  const h = await bendPx();
  await p.mouse.move(box.x+h[0], box.y+h[1]);
  await p.mouse.down();
  await p.mouse.move(box.x+h[0], box.y+h[1]-45, {steps:12});
  await p.mouse.up();
  await p.waitForTimeout(500);
  console.log(`after drag ${step}: bend=`, await bend(), JSON.stringify(await allHandles()));
  await p.screenshot({path:`.playwright-out/bend-${step}-after.png`, clip:{x:box.x+540,y:box.y+330,width:420,height:280}});
}
await b.close();
