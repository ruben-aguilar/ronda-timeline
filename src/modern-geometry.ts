import * as THREE from "three";

export type MapPoint = [number, number];
type Ground = (x: number, n: number) => number;

function clipPolygon(subject: MapPoint[], boundary: MapPoint[]): MapPoint[] {
  for (let i=0;i<boundary.length && subject.length;i++) {
    const a=boundary[i],b=boundary[(i+1)%boundary.length];
    const distance=([x,n]:MapPoint)=>(b[0]-a[0])*(n-a[1])-(b[1]-a[1])*(x-a[0]);
    const out:MapPoint[]=[];
    for(let k=0;k<subject.length;k++) {
      const p=subject[k],q=subject[(k+1)%subject.length],dp=distance(p),dq=distance(q);
      if(dp>=0)out.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
    }
    subject=out;
  }
  return subject;
}

/** Clip each mapped surface to the same triangles as the finest terrain mesh. */
export function terrainSurface(points: MapPoint[], ground: Ground, cell: number, size: number, lift=0.045): THREE.BufferGeometry {
  const positions:number[]=[];
  const contour=points.map(([x,n])=>new THREE.Vector2(x,n));
  const triangles=THREE.ShapeUtils.triangulateShape(contour,[]);
  const start=-size/2+cell/2;
  for(const indices of triangles) {
    const poly=indices.map(i=>points[i]);
    const minX=Math.min(...poly.map(p=>p[0])), maxX=Math.max(...poly.map(p=>p[0]));
    const minN=Math.min(...poly.map(p=>p[1])), maxN=Math.max(...poly.map(p=>p[1]));
    for(let c=Math.floor((minX-start)/cell);c<=Math.floor((maxX-start)/cell);c++) {
      for(let r=Math.floor((minN-start)/cell);r<=Math.floor((maxN-start)/cell);r++) {
        const x=start+c*cell,n=start+r*cell;
        const sw:MapPoint=[x,n],se:MapPoint=[x+cell,n],nw:MapPoint=[x,n+cell],ne:MapPoint=[x+cell,n+cell];
        for(const grid of [[nw,sw,ne],[ne,sw,se]]) {
          const clipped=clipPolygon(poly,grid);
          if(clipped.length<3)continue;
          const a=grid[0],b=grid[1],d=grid[2];
          const ha=ground(...a),hb=ground(...b),hd=ground(...d);
          const det=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
          const vertex=([px,pn]:MapPoint)=>{
            const u=((px-a[0])*(d[1]-a[1])-(pn-a[1])*(d[0]-a[0]))/det;
            const v=((b[0]-a[0])*(pn-a[1])-(b[1]-a[1])*(px-a[0]))/det;
            positions.push(px,ha+u*(hb-ha)+v*(hd-ha)+lift,-pn);
          };
          for(let i=1;i<clipped.length-1;i++) {
            const [p,q,t]=[clipped[0],clipped[i],clipped[i+1]];
            const area=(q[0]-p[0])*(t[1]-p[1])-(q[1]-p[1])*(t[0]-p[0]);
            if(Math.abs(area)<1e-8)continue;
            vertex(p);vertex(area>0?q:t);vertex(area>0?t:q);
          }
        }
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.computeVertexNormals();
  return g;
}

/** Joined wall ribbon: shared corners, upright faces, buried foundations and metric UVs. */
export function masonryWall(path: MapPoint[], ground: Ground, height: number, width=1.5): THREE.BufferGeometry {
  const points:MapPoint[]=[];
  for(let i=1;i<path.length;i++) {
    const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3);
    for(let j=0;j<steps;j++)points.push([a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps]);
  }
  points.push(path.at(-1)!);
  const closed=Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1])<0.001;
  if(closed)points.pop();
  const pos:number[]=[],uv:number[]=[];
  let distance=0;
  const sections=points.map((p,i)=>{
    const before=points[i-1]??(closed?points.at(-1)!:p),after=points[i+1]??(closed?points[0]:p);
    const direction=(a:MapPoint,b:MapPoint)=>new THREE.Vector2(b[0]-a[0],b[1]-a[1]).normalize();
    let prev=direction(before,p),next=direction(p,after);
    if(prev.lengthSq()===0)prev=next.clone();if(next.lengthSq()===0)next=prev.clone();
    const normal=new THREE.Vector2(-prev.y,prev.x).add(new THREE.Vector2(-next.y,next.x)).normalize();
    const scale=Math.min(width/2/Math.max(0.25,normal.dot(new THREE.Vector2(-next.y,next.x))),width*2);
    if(i)distance+=Math.hypot(p[0]-before[0],p[1]-before[1]);
    const top=ground(...p)+height;
    return {u:distance,p,left:[p[0]+normal.x*scale,p[1]+normal.y*scale] as MapPoint,
      right:[p[0]-normal.x*scale,p[1]-normal.y*scale] as MapPoint,top};
  });
  type Vertex=[number,number,number,number,number];
  const vertex=(p:MapPoint,y:number,u:number):Vertex=>[p[0],y,-p[1],u,y];
  const quad=(a:Vertex,b:Vertex,c:Vertex,d:Vertex,top=false)=>{
    for(const v of [a,c,b,a,d,c]) {pos.push(v[0],v[1],v[2]);uv.push(top?v[0]:v[3],top?-v[2]:v[4]);}
  };
  const count=closed?sections.length:sections.length-1;
  for(let i=0;i<count;i++) {
    const a=sections[i],b=sections[(i+1)%sections.length];
    const u=b.u>a.u?b.u:a.u+Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1]);
    const al=vertex(a.left,ground(...a.left)-0.6,a.u),ar=vertex(a.right,ground(...a.right)-0.6,a.u);
    const bl=vertex(b.left,ground(...b.left)-0.6,u),br=vertex(b.right,ground(...b.right)-0.6,u);
    const alt=vertex(a.left,a.top,a.u),art=vertex(a.right,a.top,a.u),blt=vertex(b.left,b.top,u),brt=vertex(b.right,b.top,u);
    quad(al,bl,blt,alt);quad(br,ar,art,brt);quad(alt,blt,brt,art,true);
    if(!closed && i===0)quad(ar,al,alt,art);
    if(!closed && i===count-1)quad(bl,br,brt,blt);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
