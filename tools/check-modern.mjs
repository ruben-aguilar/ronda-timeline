import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const url=process.argv[2]??'http://localhost:5317';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.addInitScript(()=>{localStorage.setItem('ronda-music','0');localStorage.setItem('eraCollapsed','1');});
  const errors=[], requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>requests.push(r.url()));
  page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(url))errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(`${url}/#year=1793`);
  await page.waitForFunction(()=>window.__ronda);
  await page.waitForTimeout(1800);
  assert.equal(requests.some(u=>u.endsWith('/data/modern.json')),false,'No modern data download in historical era');
  // Keep exact tree instance transforms to verify restoration after moving back in time.
  const old=await page.evaluate(()=>{
    const scene=window.__ronda.dbg.scene;
    window.__ronda.view(1793,'ciudad');
    const trees=scene.getObjectByName('Woodland tiles');
    window.__oldTrees=trees.children.map(m=>Array.from(m.instanceMatrix.array));
    return {wall:scene.getObjectByName('Schematic medieval enclosure').visible};
  });
  assert.equal(old.wall,true);
  await page.screenshot({path:'/tmp/ronda-modern-historical.png'});
  await page.evaluate(()=>{window.__ronda.view(2026,'deportes');window.__ronda.resume();});
  await page.waitForFunction(()=>window.__ronda.dbg.scene.getObjectByName('Present-day mapped detail')?.visible);
  await page.waitForTimeout(1800);
  const stats=await page.evaluate(()=>{
    const scene=window.__ronda.dbg.scene,modern=scene.getObjectByName('Present-day mapped detail');
    return {...modern.userData,wall:scene.getObjectByName('Schematic medieval enclosure').visible};
  });
  assert.equal(stats.wall,false);
  assert.equal(stats.features,410);
  assert.ok(stats.correctedTrees>0);
  for(const view of ['ciudad','mercadillo','estacion','fuerte','deportes','sanfrancisco','cijara','noreste']) {
    await page.evaluate(view=>{window.__ronda.view(2026,view);window.__ronda.resume();document.body.classList.add('ui-hidden');},view);
    await page.waitForTimeout(1100);
    await page.evaluate(view=>window.__ronda.view(2026,view),view);
    await page.screenshot({path:`/tmp/ronda-modern-${view}.png`});
  }
  await page.evaluate(()=>window.__ronda.view(1793,'ciudad'));
  const restored=await page.evaluate(()=>{
    const scene=window.__ronda.dbg.scene;
    return {visible:scene.getObjectByName('Present-day mapped detail').visible,
      wall:scene.getObjectByName('Schematic medieval enclosure').visible,
      sameTrees:scene.getObjectByName('Woodland tiles').children.every((m,j)=>m.instanceMatrix.array.every((v,i)=>v===window.__oldTrees[j][i]))};
  });
  assert.deepEqual(restored,{visible:false,wall:true,sameTrees:true});
  for(const year of [1999,2000,2021,2022,2026,1956]) {
    await page.evaluate(year=>window.__ronda.view(year,'deportes'),year);
    assert.equal(await page.evaluate(()=>window.__ronda.dbg.scene.getObjectByName('Present-day mapped detail').visible),year>=2022,`${year} layer gate`);
    assert.equal(await page.locator('[data-view="deportes"]').evaluate(e=>e.hidden),year<2022,`${year} preset gate`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{document.body.classList.remove('ui-hidden');window.__ronda.view(2026,'deportes');});
  await page.locator('.cam-views-title').click();
  await page.locator('[data-view="sanfrancisco"]').click();
  assert.equal(await page.locator('.cam-views-title').getAttribute('aria-expanded'),'false');
  await page.screenshot({path:'/tmp/ronda-modern-mobile.png'});
  assert.deepEqual(errors,[]);
  const result={stats,restored,errors,checks:'Eight sectors, lazy loading, historical tree restoration, period gates, mobile camera menu'};
  await fs.writeFile('/tmp/ronda-modern-check.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
