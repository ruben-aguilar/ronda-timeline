// Run against the Vite dev server: checks geometric invariants, not screenshot pixels.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
try {
  const page=await browser.newPage();
  await page.goto(`${process.argv[2]??'http://localhost:5317'}/#year=1793`);
  await page.waitForFunction(()=>window.__ronda);
  const result=await page.evaluate(async()=>{
    const {terrainSurface,masonryWall}=await import('/src/modern-geometry.ts');
    const {createBuildings}=await import('/src/buildings.ts');
    const fail=message=>{throw new Error(message);};
    const near=(a,b,tolerance=0.0001)=>{if(Math.abs(a-b)>tolerance)fail(`${a} != ${b}`);};
    const finite=g=>{for(const [name,attribute] of Object.entries(g.attributes))if(!attribute.array.every(Number.isFinite))fail(`Non-finite ${name}`);};
    // Saddle-shaped grid: a large unsplit polygon would intersect this terrain.
    const height=(x,n)=>Math.sin(x/5)*2+Math.cos(n/5)*3;
    const outline=[[-7,-8],[13,-8],[13,2],[3,2],[3,12],[-7,12]];
    let triangles=0;
    for(const points of [outline,[...outline].reverse()]) {
      const g=terrainSurface(points,height,5,100);finite(g);
      const p=g.attributes.position;let area=0;
      const sample=(x,n)=>{
        const x0=Math.floor((x+47.5)/5)*5-47.5,n0=Math.floor((n+47.5)/5)*5-47.5;
        const u=(x-x0)/5,v=(n-n0)/5;
        const sw=height(x0,n0),ne=height(x0+5,n0+5);
        return v>=u?sw+(height(x0,n0+5)-sw)*v+(ne-height(x0,n0+5))*u
          :sw+(height(x0+5,n0)-sw)*u+(ne-height(x0+5,n0))*v;
      };
      for(let i=0;i<p.count;i+=3) {
        let x=0,n=0,y=0;
        for(let j=0;j<3;j++){x+=p.getX(i+j)/3;n-=p.getZ(i+j)/3;y+=p.getY(i+j)/3;}
        near(y,sample(x,n)+0.045);
        area+=((p.getX(i+1)-p.getX(i))*(-p.getZ(i+2)+p.getZ(i))+(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)))/2;
      }
      near(area,300);triangles+=p.count/3;g.dispose();
    }
    const wall=masonryWall([[0,0],[10,0],[10,10]],()=>0,5,1.5);finite(wall);
    const wp=wall.attributes.position,wn=wall.attributes.normal;
    for(let i=0;i<wp.count;i+=3) {
      if([0,1,2].every(j=>Math.abs(wp.getY(i+j)-5)<0.001) && wn.getY(i)<0.99)fail('Wall cap faces down');
      // Straight north face must face north, not into the wall.
      if([0,1,2].every(j=>Math.abs(wp.getZ(i+j)+0.75)<0.001) && wn.getZ(i)>-0.99)fail('Wall side faces inward');
    }
    wall.dispose();
    const records=[
      [1800,2,7200,[[0,0,200,0,200,100,100,100,100,200,0,200]],'1','C',1900],
      [1800,2,7200,[[400,0,640,0,640,200,400,200],[440,40,440,160,600,160,600,40]],'1','C',1900],
      [1800,2,7200,[[800,0,900,0,900,100,800,100]],'1','C',1900],
      [1800,2,7200,[[1000,0,1100,0,1100,100,1000,100]],'3','-',1900],
    ];
    const buildings=createBuildings({origin:{x:0,y:0,size:4000},parts:records},()=>false,{});
    const g=buildings.mesh.geometry;finite(g);
    buildings.setYear(2026,1);
    const p=g.attributes.position,info=g.attributes.aInfo,idx=g.index;
    let roofArea=0,closures=0;
    for(let i=0;i<g.drawRange.count;i+=3) {
      const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2),kind=info.getZ(a);
      if(kind===3)fail('Historical roof in modern index');
      if(kind===5)closures++;
      if(kind===4)roofArea+=Math.abs((p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))-(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a)))/2;
    }
    near(roofArea,300+288+100,0.002);
    if(closures===0)fail('Missing roof closures');
    buildings.setYear(1990,1);
    for(let i=0;i<g.drawRange.count;i++)if(info.getZ(g.index.getX(i))>3)fail('Modern roof geometry in historical index');
    g.dispose();buildings.mesh.material.dispose();
    // Verify the real city's complete attribute buffers, including square roofs.
    let actualVertices=0;
    window.__ronda.dbg.scene.traverse(o=>{if(o.geometry?.attributes.aInfo){finite(o.geometry);actualVertices+=o.geometry.attributes.position.count;}});
    return {terrainTriangles:triangles,roofArea,roofClosureTriangles:closures,actualVertices};
  });
  assert.ok(result.actualVertices>0);
  console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
