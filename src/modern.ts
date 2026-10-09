import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Dem, elevation, Y_OFFSET } from "./data";
import { orientedBox } from "./buildings";
import { texturedMaterial } from "./textures";
import { SKY_SAMPLE_GLSL } from "./sky";
import { MODERN_PHOTO_GLSL } from "./modern-photo";
import { terrainSurface, masonryWall } from "./modern-geometry";

type Point = [number, number];
interface Feature {
  id: number;
  kind: "pool" | "pitch" | "fence" | "city_wall" | "fountain";
  points: Point[];
  sport?: string;
  height?: string;
  surfaceFrom?: number;
}
interface Bucket {
  x: number; n: number;
  group: THREE.Group;
  detail: THREE.Group;
  surfaces: THREE.BufferGeometry[];
  water: THREE.BufferGeometry[];
  rims: THREE.BufferGeometry[];
  walls: THREE.BufferGeometry[];
  fittings: THREE.Matrix4[];
  lines: number[];
}

/** Current map outlines. Fitting sizes and wall elevations are visual estimates. */
export async function createModern(dem: Dem, roofTextures: Record<string, THREE.IUniform>, trees: THREE.Group, skyUniforms: Record<string, THREE.IUniform>) {
  const response = await fetch("data/modern.json");
  if (!response.ok) throw new Error(`Modern map detail: HTTP ${response.status}`);
  const { features, clearTreeIndices }: { features: Feature[]; clearTreeIndices: number[] } = await response.json();
  const treeMask = new Set(clearTreeIndices);
  const treeEdits: { mesh: THREE.InstancedMesh; index: number; original: THREE.Matrix4 }[] = [];
  for (const object of trees.children) {
    const mesh = object as THREE.InstancedMesh;
    (mesh.userData.treeIndices as number[]).forEach((id,index) => {
      if (!treeMask.has(id)) return;
      const original = new THREE.Matrix4(); mesh.getMatrixAt(index,original);
      treeEdits.push({ mesh,index,original });
    });
  }
  const hiddenTree = new THREE.Matrix4().makeScale(0,0,0);
  const group = new THREE.Group();
  group.name = "Present-day mapped detail";
  group.visible = false;
  const buckets = new Map<string, Bucket>();
  const ground = (x: number, n: number) => elevation(dem, x, n) - Y_OFFSET;
  const getBucket = (points: Point[]) => {
    const cx = points.reduce((s,p) => s+p[0],0)/points.length;
    const cn = points.reduce((s,p) => s+p[1],0)/points.length;
    const x = Math.floor(cx/500)*500+250, n = Math.floor(cn/500)*500+250;
    const key = `${x},${n}`;
    let b = buckets.get(key);
    if (!b) {
      b = { x,n, group:new THREE.Group(), detail:new THREE.Group(), surfaces:[], water:[], rims:[], walls:[], fittings:[], lines:[] };
      b.group.name = `Modern sector ${key}`;
      b.group.add(b.detail);
      buckets.set(key,b); group.add(b.group);
    }
    return b;
  };
  const beam = (out: THREE.Matrix4[], a: THREE.Vector3, b: THREE.Vector3, width: number, depth=width) => {
    const d = b.clone().sub(a);
    if (d.lengthSq()<0.0001) return;
    out.push(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize()),
      new THREE.Vector3(width,d.length(),depth)));
  };
  const vector = ([x,n]: Point, lift=0) => new THREE.Vector3(x,ground(x,n)+lift,-n);
  const line = (out: number[], a: THREE.Vector3, b: THREE.Vector3) => out.push(...a.toArray(),...b.toArray());
  const ringGeometry = (points: Point[], level?: number) => {
    const contour = points.map(([x,n])=>new THREE.Vector2(x,n));
    const positions: number[] = [];
    for (const tri of THREE.ShapeUtils.triangulateShape(contour,[])) {
      for (const i of tri) {
        const [x,n]=points[i]; positions.push(x,level ?? ground(x,n)+0.18,-n);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
    g.computeVertexNormals();
    return g;
  };
  const edgeStrip = (a: Point,b: Point,width: number,height: number, level?: number) => {
    const va = vector(a), vb = vector(b);
    if (level !== undefined) { va.y=level;vb.y=level; }
    const d=vb.clone().sub(va), g = new THREE.BoxGeometry(width,height,d.length());
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),d.clone().normalize()));
    g.translate((va.x+vb.x)/2,(va.y+vb.y)/2+height/2,(va.z+vb.z)/2);
    return g;
  };
  const presentUniforms = { uPresentYear: { value: 2022 }, uPitchBox: { value: new THREE.Vector4() }, uPitchSize: { value: new THREE.Vector2() } };
  let wallCount=0;
  for (const f of features) {
    const b=getBucket(f.points);
    const points = f.points.slice();
    const closed = points[0][0]===points.at(-1)![0] && points[0][1]===points.at(-1)![1];
    if (closed) points.pop();
    if (f.kind === "pool" || f.kind === "fountain") {
      const levels = points.map(p=>ground(...p));
      // The DEM cannot place a level basin confidently on a steep or roof-like outline.
      if (Math.max(...levels)-Math.min(...levels)>2.0) continue;
      const level=Math.max(...levels)+0.12;
      b.water.push(ringGeometry(points,level));
      for (let i=0;i<points.length;i++) {
        const a=points[i],c=points[(i+1)%points.length];
        b.rims.push(edgeStrip(a,c,0.25,0.18,level-0.06));
        // Close the space below a level pool rim where the DEM slopes across the basin.
        const low=Math.min(ground(...a),ground(...c))-0.25;
        b.rims.push(edgeStrip(a,c,0.18,level-low,low));
      }
    } else if (f.kind === "pitch") {
      const surfaceGeometry = terrainSurface(points,ground,dem.cell,dem.size);
      surfaceGeometry.setAttribute("modernTurf", new THREE.Float32BufferAttribute(new Float32Array(surfaceGeometry.getAttribute("position").count).fill(f.surfaceFrom ? 1 : 0), 1));
      b.surfaces.push(surfaceGeometry);
      const o=orientedBox(points), length=2*o.a, width=2*o.b;
      if (f.surfaceFrom) {
        presentUniforms.uPitchBox.value.set(o.cx,o.cn,o.ux,o.un);
        presentUniforms.uPitchSize.value.set(o.a,o.b);
      }
      const area=Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
      // Only put court fittings on near-rectangular mapped playing surfaces.
      if (area/(length*width)<0.92) continue;
      const point=(u:number,v:number,lift=0.24): THREE.Vector3 => {
        const x=o.cx+u*o.ux-v*o.un,n=o.cn+u*o.un+v*o.ux;
        return new THREE.Vector3(x,ground(x,n)+lift,-n);
      };
      if (f.sport === "soccer" && length>25 && width>14) {
        const goalWidth=length>75?7.32:3, h=length>75?2.44:2;
        for (const side of [-1,1]) {
          const u=side*(o.a-0.35), back=u+side*1.6;
          for (const v of [-goalWidth/2,goalWidth/2]) {
            beam(b.fittings,point(u,v),point(u,v,h+0.24),0.1);
            beam(b.fittings,point(u,v,h+0.24),point(back,v,0.24),0.06);
          }
          beam(b.fittings,point(u,-goalWidth/2,h+0.24),point(u,goalWidth/2,h+0.24),0.1);
          for (let v=-goalWidth/2;v<=goalWidth/2;v+=0.3) line(b.lines,point(u,v,h+0.24),point(back,v,0.24));
          for (let t=0;t<=1;t+=0.15) line(b.lines,point(u+(back-u)*t,-goalWidth/2,h*(1-t)+0.24),point(u+(back-u)*t,goalWidth/2,h*(1-t)+0.24));
        }
      } else if (f.sport === "tennis" || f.sport === "padel") {
        const w=Math.min(width/2-0.25,f.sport==="padel"?5:6.4);
        for (const v of [-w,w]) beam(b.fittings,point(0,v),point(0,v,1.3),0.07);
        for (let z=0.3;z<1.2;z+=0.16) line(b.lines,point(0,-w,z),point(0,w,z));
        for (let v=-w;v<=w;v+=0.25) line(b.lines,point(0,v,0.3),point(0,v,1.2));
      }
    } else if (f.kind === "fence" || f.kind === "city_wall") {
      const wall=f.kind==="city_wall";
      const mappedHeight=Number.parseFloat(f.height ?? "");
      const h=Number.isFinite(mappedHeight)?THREE.MathUtils.clamp(mappedHeight,0.5,10):wall?5.5:1.8;
      if(wall) {
        // Split only at the separately modelled gate; all other segments share corners.
        let path:Point[]=[];
        const flush=()=>{if(path.length>1){b.walls.push(masonryWall(path,ground,h));wallCount+=path.length-1;}path=[];};
        for(let i=1;i<f.points.length;i++) {
          const a=f.points[i-1],c=f.points[i],count=Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/3);
          for(let j=0;j<count;j++) {
            const p:Point=[a[0]+(c[0]-a[0])*j/count,a[1]+(c[1]-a[1])*j/count];
            const q:Point=[a[0]+(c[0]-a[0])*(j+1)/count,a[1]+(c[1]-a[1])*(j+1)/count];
            if(Math.hypot((p[0]+q[0])/2-114,(p[1]+q[1])/2+712)<19){flush();continue;}
            if(!path.length)path.push(p);path.push(q);
          }
        }
        flush();continue;
      }
      for (let i=1;i<f.points.length;i++) {
        const a=f.points[i-1], c=f.points[i];
        const length=Math.hypot(c[0]-a[0],c[1]-a[1]);
        const count=Math.ceil(length/2.5);
        for (let j=0;j<count;j++) {
          const p:Point=[a[0]+(c[0]-a[0])*j/count,a[1]+(c[1]-a[1])*j/count];
          const q:Point=[a[0]+(c[0]-a[0])*(j+1)/count,a[1]+(c[1]-a[1])*(j+1)/count];
          beam(b.fittings,vector(p),vector(p,h),0.065);
          line(b.lines,vector(p,h),vector(q,h));
          line(b.lines,vector(p,h*0.45),vector(q,h*0.45));
          // Open wire mesh with visible gaps, no opaque fence panels.
          for(let k=1;k<=6;k++) {
            const t=k/7,r:Point=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
            line(b.lines,vector(r,0.1),vector(r,h));
          }
        }
      }
    }
  }
  const surface = new THREE.MeshStandardMaterial({roughness:0.92,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  surface.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,roofTextures,presentUniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vMapUV;\nattribute float modernTurf;\nvarying float vTurf;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvMapUV=vec2(position.x+2000.0,2000.0-position.z)/4000.0;vTurf=modernTurf;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 vMapUV;
      varying float vTurf;
      uniform float uPresentYear;
      uniform vec4 uPitchBox;
      uniform vec2 uPitchSize;
      ${MODERN_PHOTO_GLSL}`)
      .replace('#include <map_fragment>',`#include <map_fragment>
      vec3 photo=modernPhoto(vMapUV);
      if (vTurf > 0.5 && uPresentYear >= 2023.0) {
        vec2 delta=vMapUV*4000.0-2000.0-uPitchBox.xy;
        vec2 p=vec2(dot(delta,uPitchBox.zw),dot(delta,vec2(-uPitchBox.w,uPitchBox.z)));
        vec2 halfSize=uPitchSize-vec2(0.7);
        float stripe=step(0.5,fract((p.x+halfSize.x)/12.0));
        photo=mix(vec3(0.045,0.15,0.07),vec3(0.055,0.18,0.08),stripe);
        float lineDistance=min(abs(p.x),abs(length(p)-9.15));
        lineDistance=min(lineDistance,min(abs(abs(p.x)-halfSize.x),abs(abs(p.y)-halfSize.y)));
        vec2 q=vec2(halfSize.x-abs(p.x),abs(p.y));
        if(q.x<16.5 && q.y<20.16)lineDistance=min(lineDistance,min(abs(q.x-16.5),abs(q.y-20.16)));
        if(q.x<5.5 && q.y<9.16)lineDistance=min(lineDistance,min(abs(q.x-5.5),abs(q.y-9.16)));
        float aa=max(fwidth(lineDistance),0.025);
        float paint=1.0-smoothstep(0.055-aa,0.055+aa,lineDistance);
        photo=mix(photo,vec3(0.8),paint);
      }
      diffuseColor.rgb*=photo;`);
  };
  const water = new THREE.MeshStandardMaterial({color:0x448e9e,roughness:0.24,metalness:0.15,side:THREE.DoubleSide});
  water.onBeforeCompile = shader => {
    Object.assign(shader.uniforms,skyUniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterPosition;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvWaterPosition=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vWaterPosition;
      float waterReflection;
      vec3 reflectedSky;
      ${SKY_SAMPLE_GLSL}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
      // Ripples stay fixed in map space when the camera moves. Reflect the existing
      // sky photograph; no second image, reflection render pass or animated simulation.
      vec2 p=vWaterPosition.xz;
      float ripple=sin(p.x*1.7+p.y)*sin(p.y*2.4);
      vec3 waterNormal=normalize(vec3(cos(p.x*1.7+p.y)*0.018,1.0,sin(p.y*2.4)*0.018));
      vec3 incident=normalize(vWaterPosition-cameraPosition);
      waterReflection=0.02+0.68*pow(1.0-abs(dot(waterNormal,incident)),5.0);
      reflectedSky=sampleSky(reflect(incident,waterNormal));
      diffuseColor.rgb*= (1.0+ripple*0.035)*(1.0-waterReflection);`)
      .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      totalEmissiveRadiance+=reflectedSky*waterReflection;`);
  };
  const rim = new THREE.MeshStandardMaterial({color:0xc7c1ae,roughness:0.85});
  const wallMaterial=texturedMaterial('masonry',{albedo:[0.48,0.4,0.29],scale:0.7});
  const fittingMaterial=new THREE.MeshStandardMaterial({color:0xb9b9a9,roughness:0.62,metalness:0.35});
  const wireMaterial=new THREE.LineBasicMaterial({color:0x73796b,transparent:true,opacity:0.65});
  const fittingGeometry=new THREE.BoxGeometry(1,1,1);
  const merge = (parts:THREE.BufferGeometry[],material:THREE.Material,parent:THREE.Group,shadow=false) => {
    if(!parts.length)return;
    const geometries=parts.map(g=>g.index?g.toNonIndexed():g);
    // Keep metric wall UVs, including the horizontal cap projection.
    for(const g of geometries) {
      for(const key of Object.keys(g.attributes))if(!['position','normal','modernTurf',...(material===wallMaterial?['uv']:[])].includes(key))g.deleteAttribute(key);
    }
    const geometry=mergeGeometries(geometries,false)!;
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=material===surface?'Mapped court surfaces':material===water?'Pool water':material===wallMaterial?'Joined masonry walls':'Pool coping and basin walls';
    mesh.receiveShadow=true;mesh.castShadow=shadow;
    parent.add(mesh);
    new Set([...parts,...geometries]).forEach(g=>g.dispose());
  };
  for(const b of buckets.values()) {
    merge(b.surfaces,surface,b.group);merge(b.water,water,b.group);merge(b.rims,rim,b.group);
    merge(b.walls,wallMaterial,b.group,true);
    if(b.fittings.length) {
      const mesh=new THREE.InstancedMesh(fittingGeometry,fittingMaterial,b.fittings.length);
      b.fittings.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();b.detail.add(mesh);
    }
    if(b.lines.length) {
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.lines,3));
      b.detail.add(new THREE.LineSegments(g,wireMaterial));
    }
  }
  group.userData = { source:'OpenStreetMap', features:features.length, sectors:buckets.size, mappedWallSegments:wallCount, correctedTrees:treeEdits.length/2 };
  return {
    group,
    update(year:number,camera:THREE.Camera):boolean {
      presentUniforms.uPresentYear.value=year;
      const visible=year>=2022;let changed=group.visible!==visible;
      if (changed) for (const edit of treeEdits) {
        edit.mesh.setMatrixAt(edit.index,visible?hiddenTree:edit.original);
        edit.mesh.instanceMatrix.needsUpdate=true;
      }
      group.visible=visible;
      if(!visible)return changed;
      for(const b of buckets.values()) {
        const distance=Math.hypot(camera.position.x-b.x,camera.position.z+b.n,camera.position.y-ground(b.x,b.n));
        const show=distance<(b.group.visible?2250:2100), detail=distance<(b.detail.visible?850:750);
        changed ||= b.group.visible!==show || b.detail.visible!==detail;
        b.group.visible=show;b.detail.visible=detail;
      }
      return changed;
    }
  };
}
