import {chromium} from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:1500,height:950}});
await p.goto('http://localhost:3000/',{waitUntil:'networkidle'});
await p.waitForTimeout(1500);
await p.getByPlaceholder('Filter graphics').fill('envelopment'); await p.waitForTimeout(400);
await p.getByText('envelopment',{exact:true}).first().click();
await p.locator('button').filter({hasText:/Add Graphic|Drawing…/}).first().click();
const box = await p.locator('.map-container').boundingBox();
await p.mouse.click(box.x+600, box.y+450);
await p.mouse.dblclick(box.x+800, box.y+450);
await p.waitForTimeout(1600);
await p.locator('button').filter({hasText:/^Edit$|^Editing/}).first().click();
await p.waitForTimeout(400);
const ink = await p.evaluate(()=>{const m=window.__tacticalGraphics.manager,o=[];m.renderingVectorSource.getFeatures().forEach(f=>{if(f.get('handle')||f.get('base')||f.get('measure'))return;const c=f.getGeometry()?.getCoordinates?.();if(!c)return;const w=a=>{if(typeof a[0]==='number'){const q=m.map.getPixelFromCoordinate(a);if(q)o.push(q);return;}a.forEach(w);};w(c);});return o.slice(0,16);});
for (const [x,y] of ink) { await p.mouse.click(box.x+x, box.y+y); await p.waitForTimeout(400); if (await p.evaluate(()=>window.__tacticalEngine.getSelection())) break; }
console.log('selected:', !!(await p.evaluate(()=>window.__tacticalEngine.getSelection())));
const st = () => p.evaluate(()=>{
  const t = window.__tacticalEngine.snapshot().features[0].properties.tacticalGraphic;
  const m = window.__tacticalGraphics.manager;
  const hs=[]; m.renderingVectorSource.getFeatures().forEach(f=>{
    if(!f.get('handle')||f.get('hidden')||f.get('measure'))return;
    const c=f.getGeometry()?.getCoordinates?.(); if(!c)return;
    (Array.isArray(c[0])?c:[c]).forEach(q=>{const px=m.map.getPixelFromCoordinate(q); if(px)hs.push({inert:!!f.get('inert'), px:px.map(Math.round)});});
  });
  const g = m.renderingVectorSource.getFeatures().find(f=>f.get('graphicName')&&!f.get('handle')&&!f.get('base')&&!f.get('measure'));
  const e = g?.getGeometry()?.getExtent?.();
  const res = m.map.getView().getResolution();
  return {bend:t.bend, radius:Math.round(t.radius??0), decorationSize:Math.round(t.decorationSize??0), mirrored:t.mirrored,
          handles:hs, shapePx: e? [Math.round((e[2]-e[0])/res), Math.round((e[3]-e[1])/res)] : null};
});
const before = await st();
console.log('before:', JSON.stringify(before));
await p.screenshot({path:'.playwright-out/env-0.png', clip:{x:box.x+500,y:box.y+320,width:460,height:320}});

// Drag the first live handle across the run (from above to well below).
const live = before.handles.filter(h=>!h.inert);
if (live.length) {
  const h = live[0].px;
  await p.mouse.move(box.x+h[0], box.y+h[1]);
  await p.mouse.down();
  await p.mouse.move(box.x+h[0], box.y+h[1]+220, {steps:18});
  await p.mouse.up();
  await p.waitForTimeout(600);
  console.log('after cross-drag:', JSON.stringify(await st()));
  await p.screenshot({path:'.playwright-out/env-1-mirror.png', clip:{x:box.x+500,y:box.y+320,width:460,height:320}});
}
// Resize down via the icon, then look at the arrowhead.
await p.evaluate(() => {
  const e=window.__tacticalEngine, m=window.__tacticalGraphics.manager;
  const c=m.graphicControllers[0];
  const anchor=m.map.getPixelFromCoordinate(c.getCenter());
  const host=document.querySelector('.map-container').getBoundingClientRect();
  const r=document.querySelector('[aria-label="Resize"]').getBoundingClientRect();
  const sx=r.x+r.width/2-host.left, sy=r.y+r.height/2-host.top;
  const vx=sx-anchor[0], vy=sy-anchor[1];
  e.beginGesture('resize', new PointerEvent('pointerdown',{clientX:host.left+sx,clientY:host.top+sy,bubbles:true}));
  for (const t of [1,0.45]) window.dispatchEvent(new PointerEvent('pointermove',{clientX:host.left+anchor[0]+vx*t, clientY:host.top+anchor[1]+vy*t, bubbles:true}));
  window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
});
await p.waitForTimeout(600);
console.log('after resize 0.45:', JSON.stringify(await st()));
await p.screenshot({path:'.playwright-out/env-2-resized.png', clip:{x:box.x+500,y:box.y+320,width:460,height:320}});
await b.close();
