import * as THREE from 'three';
import { BUILDINGS, groundHeight, isWater, onPath, pathCenter, seededRandom, type Obstacle } from './world';

export function createWorld(scene: THREE.Scene) {
  const random = seededRandom(1729);
  const obstacles: Obstacle[] = [];
  const cameraBlockers: THREE.Sphere[] = [];
  const waterMeshes: THREE.Mesh[] = [];
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  function mat(color: string) { if (!materials.has(color)) materials.set(color, material(color)); return materials.get(color)!; }
  function mesh(geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, parent: THREE.Object3D = scene) {
    const object = new THREE.Mesh(geometry, mat(color)); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent?: THREE.Object3D) { return mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent); }

  // Vertex-painted rolling ground: paths stay continuous between town and route.
  const groundGeo = new THREE.PlaneGeometry(230, 170, 230, 170); groundGeo.rotateX(-Math.PI / 2); groundGeo.translate(-25, 0, 0);
  const pos = groundGeo.attributes.position;
  const colors: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z) - (isWater(x, z) ? 0.75 : 0));
    const color = new THREE.Color(onPath(x, z) && x > -95 && x < 29 ? '#d6c393' : '#99b776');
    color.multiplyScalar(0.96 + random() * 0.08); colors.push(color.r, color.g, color.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); ground.receiveShadow = true; scene.add(ground);
  box(230, 4, 170, '#7a8e63', -25, -2.8, 0);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(100, 180), new THREE.MeshStandardMaterial({ color: '#82bfbd', roughness: .32, metalness: .08, transparent: true, opacity: .92 })); ocean.rotation.x = -Math.PI / 2; ocean.position.set(81, -.35, 0); scene.add(ocean); waterMeshes.push(ocean);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 48), ocean.material); pond.rotation.x = -Math.PI / 2; pond.scale.set(10.5, 5.5, 1); pond.position.set(-66, groundHeight(-66, -22) - .35, -22); scene.add(pond); waterMeshes.push(pond);
  const rippleGeo = new THREE.PlaneGeometry(1, .045);
  const rippleMat = new THREE.MeshBasicMaterial({ color: '#d5eee0', transparent: true, opacity: .36 });
  const ripples = new THREE.InstancedMesh(rippleGeo, rippleMat, 180);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 180; i++) { dummy.position.set(33 + random() * 55, -.32, -65 + random() * 130); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1 + random() * 3, 1, 1); dummy.updateMatrix(); ripples.setMatrixAt(i, dummy.matrix); } scene.add(ripples);

  for (const building of BUILDINGS) {
    const {x, z, width:w, depth:d, height:h} = building;
    const group = new THREE.Group(); group.position.set(x, groundHeight(x,z), z); scene.add(group);
    box(w+.5,.32,d+.5,'#9a9d80',0,.16,0,group);
    box(w,h,d,'#e7e0bb',0,h/2+.3,0,group);
    box(w+.18,.35,d+.16,'#c4b795',0,.68,0,group);
    // A true pitched roof, with paper-like warm edges and standing seams.
    const roofH = 2.35, roofW=w/2+.75, roofD=d/2+.65;
    const roofShape = new THREE.Shape(); roofShape.moveTo(-roofW,0); roofShape.lineTo(0,roofH); roofShape.lineTo(roofW,0); roofShape.closePath();
    const roof = new THREE.ExtrudeGeometry(roofShape,{depth:roofD*2,bevelEnabled:false}); roof.translate(0,h+.3,-roofD); mesh(roof,building.roof,0,0,0,group);
    box(.15,.18,roofD*2+.1,'#d4d0ad',0,h+roofH+.32,0,group);
    const slopeLength=Math.hypot(roofW,roofH), slopeAngle=Math.atan2(roofH,roofW);
    for(let zz=-roofD+.1;zz<roofD;zz+=.65) for(const side of [-1,1]) {
      const seam=box(slopeLength,.035,.035,building.roof,side*roofW/2,h+.35+roofH/2,zz,group);seam.rotation.z=-side*slopeAngle;
    }
    box(1.35,2.35,.15,'#626f5c',0,1.48,d/2+.09,group);box(1.02,2.05,.1,'#9a7557',0,1.36,d/2+.2,group);mesh(new THREE.SphereGeometry(.065,6,4),'#e1c886',.35,1.4,d/2+.3,group);
    box(2,.2,1,'#d5ccaa',0,.29,d/2+.5,group);
    for (const side of [-1,1]) {
      const wx=side*(w/2-1.65);
      box(1.65,1.7,.17,'#f5eed6',wx,h*.58,d/2+.11,group);box(1.35,1.4,.19,'#7dada8',wx,h*.58,d/2+.15,group);
      box(.09,1.42,.08,'#f5eed6',wx,h*.58,d/2+.27,group);box(1.4,.09,.08,'#f5eed6',wx,h*.58,d/2+.27,group);
      box(1.85,.18,.4,'#a58b65',wx,h*.58-.95,d/2+.2,group);
      for(let i=0;i<4;i++) mesh(new THREE.DodecahedronGeometry(.18),'#728e54',wx-.6+i*.4,h*.58-.77,d/2+.3,group);
    }
    if(building.kind==='lab') {box(2.6,.55,.18,'#eee9d4',0,h-.55,d/2+.12,group);label('ELM LAB',x, h-.15,z+d/2+.25,1.95,.4);box(1,1.6,1,'#bba68b',-w/2+1,h+1,-1,group);}
    else {box(.8,1.8,.8,'#ad927b',-w/2+1,h+1,-1,group);}
  }
  function label(text:string,x:number,y:number,z:number,w=2.5,h=.65) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#384a38';ctx.font='600 43px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,64);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));plane.position.set(x,y,z);scene.add(plane);
  }
  function sign(x:number,z:number,text:string) {const y=groundHeight(x,z);box(.18,1.4,.18,'#8f7957',x,y+.7,z);box(2.4,.85,.18,'#d8c598',x,y+1.55,z);label(text,x,y+1.55,z+.1,2.1,.53);obstacles.push({x,z,radius:.35});}
  sign(-17,7,'ROUTE 29  ←'); sign(5,-5.5,'NEW BARK TOWN'); sign(21,12,'HOME');sign(-76,8,'JOHTO, AHEAD');
  // Fences, a waterfront boardwalk, and a small rest stop.
  function fence(x:number,z:number,length:number,axis:'x'|'z') {for(let i=0;i<=length;i+=1.9){const xx=x+(axis==='x'?i:0),zz=z+(axis==='z'?i:0),y=groundHeight(xx,zz);box(.16,1.1,.16,'#ede1bb',xx,y+.55,zz);}
    for(const y of [.42,.83])box(axis==='x'?length:.12,.14,axis==='z'?length:.12,'#e1d5b0',x+(axis==='x'?length/2:0),y,z+(axis==='z'?length/2:0));}
  fence(-13,23,12,'x');fence(11,23,12,'x');fence(25,-19,17,'z');
  for(let i=0;i<13;i++)box(.65,.14,3.6,i%2?'#bd9e76':'#c6aa81',26+i*.7,-.02,6);
  for(const z of [4.4,7.6]){box(.2,1.4,.2,'#a38662',27,.4,z);box(.2,1.4,.2,'#a38662',34,.4,z);}
  box(3,.18,.8,'#a58963',-26, .85,-5);for(const x of [-27,-25])box(.15,.8,.7,'#6d775c',x,.4,-5);box(3,.8,.12,'#b4986e',-26,1.35,-5.4);

  const treePositions: {x:number;z:number;s:number}[]=[];
  // Dense perimeter with gaps where the path leaves the clearing.
  for(let i=0;i<520;i++) {
    const x=-102+random()*143,z=-49+random()*100;
    const nearTown=x>-18&&x<28&&z>-27&&z<29;
    const nearRoute=x<-18&&Math.abs(z-pathCenter(x))<10;
    if(nearTown||nearRoute||isWater(x,z))continue;
    treePositions.push({x,z,s:.85+random()*.7});
  }
  for(const [x,z,s] of [[-17,-3,1.15],[-17,19,1.2],[26,-4,1.2],[25,19,1.1],[-2,-24,1.35],[20,-25,1.4],[-20,-17,1.1],[-32,-9,1],[-48,14,1.2],[-80,-7,1.1],[-59,-8,.9]])treePositions.push({x,z,s});
  const trunkGeo=new THREE.CylinderGeometry(.17,.28,2.4,6), crownGeo=new THREE.IcosahedronGeometry(1,1);
  const trunks=new THREE.InstancedMesh(trunkGeo,mat('#8c8360'),treePositions.length),crowns=new THREE.InstancedMesh(crownGeo,mat('#ffffff'),treePositions.length*3);
  const leafColors=['#6e975c','#7fa269','#86a76c','#71945b','#94ad74'];
  treePositions.forEach(({x,z,s},i)=>{
    const y=groundHeight(x,z);dummy.position.set(x,y+1.2*s,z);dummy.rotation.set(0,random()*6,0);dummy.scale.set(s,s,s);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    cameraBlockers.push(new THREE.Sphere(new THREE.Vector3(x,y+3.4*s,z),2.65*s));
    for(let j=0;j<3;j++){dummy.position.set(x+(j===1?-.6:j===2?.65:0)*s,y+(j===0?3.8:3)*s,z+(j===0?0:.2)*s);dummy.scale.set((j===0?1.9:1.65)*s,(j===0?2.1:1.65)*s,1.7*s);dummy.updateMatrix();crowns.setMatrixAt(i*3+j,dummy.matrix);crowns.setColorAt(i*3+j,new THREE.Color(leafColors[Math.floor(random()*leafColors.length)]));}
    if(x>-89&&x<31&&z>-36&&z<34)obstacles.push({x,z,radius:.43*s});
  });trunks.castShadow=true;crowns.castShadow=true;crowns.receiveShadow=true;scene.add(trunks,crowns);

  // Instanced grass and little flower heads keep the world inexpensive to draw.
  const grassGeo=new THREE.ConeGeometry(.075,.38,3);const grassCount=7000;
  const grass=new THREE.InstancedMesh(grassGeo,mat('#799a59'),grassCount);
  for(let i=0;i<grassCount;i++){
    let x=-88+random()*117,z=-33+random()*65;
    const blocked=onPath(x,z)||isWater(x,z)||BUILDINGS.some(b=>Math.abs(x-b.x)<b.width/2+1&&Math.abs(z-b.z)<b.depth/2+1);
    const tall=x<-27&&x>-77&&Math.abs(z-pathCenter(x))>3&&Math.abs(z-pathCenter(x))<10;
    const s=blocked?0:tall?1.3+random():.35+random()*.4;
    dummy.position.set(x,groundHeight(x,z)+s*.15,z);dummy.rotation.set(0,random()*6,.12);dummy.scale.set(s,s,s);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
    if(tall)grass.setColorAt(i,new THREE.Color('#769651'));
  }scene.add(grass);
  const flowerGeo=new THREE.IcosahedronGeometry(.09,0),flowerCount=270;
  const flowers=new THREE.InstancedMesh(flowerGeo,mat('#ffffff'),flowerCount);
  for(let i=0;i<flowerCount;i++) {let x=-19+random()*47,z=-27+random()*53;if(onPath(x,z)||BUILDINGS.some(b=>Math.abs(x-b.x)<b.width/2+1&&Math.abs(z-b.z)<b.depth/2+1)){x=23+random()*3;z=-10+random()*10;}dummy.position.set(x,groundHeight(x,z)+.22,z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();flowers.setMatrixAt(i,dummy.matrix);flowers.setColorAt(i,new THREE.Color(i%3===0?'#f5df9e':i%3===1?'#e9b4a5':'#efe9cd'));}scene.add(flowers);
  for(let i=0;i<36;i++){const x=-95+random()*120,z=random()>.5?-31-random()*8:29+random()*9;const rock=mesh(new THREE.DodecahedronGeometry(1,0),'#a0aa8b',x,groundHeight(x,z)+.3,z);rock.scale.set(1+random()*1.3,.6+random(),1+random());}

  // Hills and soft paper clouds build a horizon beyond the playable forest.
  for(let i=0;i<18;i++){const x=-140+i*15,z=-65-random()*30;const hill=mesh(new THREE.IcosahedronGeometry(1,2),i%2?'#a3b9a1':'#b2c3ac',x,0,z);hill.scale.set(16+random()*20,14+random()*13,14+random()*12);hill.castShadow=false;}
  const cloudMat=new THREE.MeshBasicMaterial({color:'#f2f2df',transparent:true,opacity:.8});const cloudGeo=new THREE.SphereGeometry(1,8,6);
  const clouds=new THREE.Group();scene.add(clouds);
  for(let i=0;i<17;i++){const group=new THREE.Group();group.position.set(-130+random()*250,24+random()*15,-65+random()*85);for(let j=0;j<4;j++){const part=new THREE.Mesh(cloudGeo,cloudMat);part.position.set(j*2,Math.sin(j)*.5,0);part.scale.set(2.8,1.1,1.6);group.add(part);}clouds.add(group);}
  const motesGeo=new THREE.BufferGeometry();const motePositions=new Float32Array(80*3);for(let i=0;i<80;i++){motePositions[i*3]=-60+random()*90;motePositions[i*3+1]=1+random()*7;motePositions[i*3+2]=-20+random()*40;}motesGeo.setAttribute('position',new THREE.BufferAttribute(motePositions,3));const motes=new THREE.Points(motesGeo,new THREE.PointsMaterial({color:'#fff8d0',size:.06,transparent:true,opacity:.65}));scene.add(motes);
  return {obstacles,cameraBlockers,waterMeshes,clouds,motes};
}

export function makePaperSprite(scene:THREE.Scene,url:string,height:number,widthRatio=1) {
  const texture=new THREE.TextureLoader().load(url);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.1,side:THREE.DoubleSide});
  const sprite=new THREE.Mesh(new THREE.PlaneGeometry(height*widthRatio,height),material);sprite.geometry.translate(0,height/2,0);
  const group=new THREE.Group();group.add(sprite);scene.add(group);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(height*.24,20),new THREE.MeshBasicMaterial({color:'#344936',transparent:true,opacity:.19,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;shadow.scale.y=.65;group.add(shadow);
  return {group,sprite,texture,material,shadow,height};
}
