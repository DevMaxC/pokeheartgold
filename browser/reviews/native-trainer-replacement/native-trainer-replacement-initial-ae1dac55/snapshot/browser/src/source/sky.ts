import * as THREE from 'three';
import {hasOutdoorSky,skyKeyframes,skyNoise,weatherKind} from './atmosphere.ts';
import type {SourceMap} from './types.ts';

function pixelDisc(moon=false){
  const size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=x-15.5,dy=y-15.5,r=Math.hypot(dx,dy),i=(y*size+x)*4;
    const crater=moon&&((x-10)**2+(y-11)**2<10||(x-20)**2+(y-20)**2<6||(x-9)**2+(y-23)**2<4);
    const rgb=moon?(crater?[192,212,227]:[239,245,231]):[255,241,170];
    data.set([...rgb,r<14.5?255:0],i);
  }
  const t=new THREE.DataTexture(data,size,size);t.colorSpace=THREE.SRGBColorSpace;t.magFilter=t.minFilter=THREE.NearestFilter;t.needsUpdate=true;return t;
}

/** The sky and precipitation share the field scene, including during battles. */
export class WorldSky{
  readonly group=new THREE.Group();
  readonly fieldTint={value:new THREE.Color(1,1,1)};
  private patched=new WeakSet<THREE.Material>();
  private fog=new THREE.Fog('#c2e9ed',55,115);
  private dome:THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;
  private clouds:THREE.InstancedMesh<THREE.BoxGeometry,THREE.MeshBasicMaterial>;
  private stars:THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>;
  private sun:THREE.Sprite;private moon:THREE.Sprite;
  private precipitation=new THREE.Group();
  private rain:THREE.InstancedMesh;private snow:THREE.InstancedMesh;
  private clock={value:0};private origin={value:new THREE.Vector3()};
  private rainMotion={fall:{value:0},drift:{value:0}};private snowMotion={fall:{value:0},drift:{value:0}};private sway={value:0};
  private cloudColour=new THREE.Color();private cloudShade=new THREE.Color();
  private weather=0;private outdoors=false;private time=0;private nextPalette=-1;
  private hour=12;private period='day';
  private scene:THREE.Scene;private camera:THREE.Camera;private now:()=>Date;
  constructor(scene:THREE.Scene,camera:THREE.Camera,now:()=>Date=()=>new Date()){
    this.scene=scene;this.camera=camera;this.now=now;
    this.group.name='johto-sky';this.precipitation.name='original-weather';
    this.dome=new THREE.Mesh(new THREE.SphereGeometry(128,32,16),new THREE.ShaderMaterial({
      uniforms:{zenith:{value:new THREE.Color()},horizon:{value:new THREE.Color()}},side:THREE.BackSide,depthWrite:false,depthTest:false,
      vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform vec3 zenith;uniform vec3 horizon;varying vec3 direction;
        void main(){float height=max(0.,normalize(direction).y);vec3 colour=mix(horizon,zenith,pow(height,.55));
          gl_FragColor=vec4(colour,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));this.dome.renderOrder=-1000;this.group.add(this.dome);
    // Short, separately rooted columns give cumulus clouds stepped pixel-art
    // silhouettes, a shaded underside and actual thickness from every angle.
    const cloudMatrices:THREE.Matrix4[]=[],dummy=new THREE.Object3D(),geometry=new THREE.BoxGeometry(1,1,1),colours:number[]=[];
    const normals=geometry.getAttribute('normal');for(let i=0;i<normals.count;i++){const light=normals.getY(i)>.5?1:normals.getY(i)<-.5?0:.6;colours.push(light,light,light);}geometry.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
    for(let cloud=0;cloud<24;cloud++){
      const angle=cloud*Math.PI*2/24+skyNoise(cloud+2)*.16,radius=76+skyNoise(cloud+31)*25,height=cloud%4===1?19+skyNoise(cloud+79)*18:2+skyNoise(cloud+79)*4,scale=1+skyNoise(cloud+147)*.7;
      const root=new THREE.Object3D();root.position.set(Math.sin(angle)*radius,height,Math.cos(angle)*radius);root.rotation.y=angle;root.scale.setScalar(scale);root.updateMatrix();
      for(let x=-9;x<=9;x++)for(let z=-2;z<=2;z++){
        const profile=Math.max(0,1-(x/9.5)**2),bulge=Math.max(profile*.75,1-((x+3)/4)**2,1-((x-2)/5)**2);
        if(profile<.12||Math.abs(z)>1&&skyNoise(cloud*87+x*4+z)<.5)continue;
        const top=Math.max(1,Math.round((1+bulge*3)*(1-Math.abs(z)*.11))),bottom=-.15-Math.abs(z)*.06;
        dummy.position.set(x*.68,(top+bottom)*.5,z*.8);dummy.scale.set(.7,top-bottom,.84);dummy.rotation.set(0,0,0);dummy.updateMatrix();cloudMatrices.push(new THREE.Matrix4().multiplyMatrices(root.matrix,dummy.matrix));
      }
    }
    const cloudMaterial=new THREE.MeshBasicMaterial({vertexColors:true,fog:false,depthTest:true,depthWrite:true});
    cloudMaterial.onBeforeCompile=shader=>{shader.uniforms.cloudColour={value:this.cloudColour};shader.uniforms.cloudShade={value:this.cloudShade};shader.fragmentShader='uniform vec3 cloudColour;uniform vec3 cloudShade;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','diffuseColor.rgb *= mix(cloudShade,cloudColour,vColor.r);');};
    cloudMaterial.customProgramCacheKey=()=> 'johto-clouds-v1';
    this.clouds=new THREE.InstancedMesh(geometry,cloudMaterial,cloudMatrices.length);cloudMatrices.forEach((m,i)=>this.clouds.setMatrixAt(i,m));this.clouds.frustumCulled=false;this.clouds.renderOrder=-970;this.group.add(this.clouds);
    const starPositions:number[]=[],phases:number[]=[];for(let i=0;i<240;i++){const y=.01+Math.pow(skyNoise(i+581),1.7)*.95,angle=skyNoise(i+937)*Math.PI*2,r=Math.sqrt(1-y*y);starPositions.push(Math.sin(angle)*r*118,y*118,Math.cos(angle)*r*118);phases.push(skyNoise(i+254)*Math.PI*2);}
    const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(starPositions,3));starGeometry.setAttribute('phase',new THREE.Float32BufferAttribute(phases,1));
    this.stars=new THREE.Points(starGeometry,new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,uniforms:{clock:this.clock,opacity:{value:0}},
      vertexShader:'attribute float phase;varying float twinkle;uniform float clock;void main(){twinkle=.7+.3*sin(clock+phase);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=2.+step(.92,sin(phase))*2.;}',
      fragmentShader:'uniform float opacity;varying float twinkle;void main(){vec2 p=abs(gl_PointCoord-.5);if(min(p.x,p.y)>.17)discard;gl_FragColor=vec4(.95,.96,1.,opacity*twinkle);}',
    }));this.stars.renderOrder=-990;this.stars.frustumCulled=false;this.group.add(this.stars);
    this.sun=new THREE.Sprite(new THREE.SpriteMaterial({map:pixelDisc(),transparent:true,depthTest:true,depthWrite:false,fog:false}));this.sun.scale.setScalar(7);this.sun.renderOrder=-980;this.group.add(this.sun);
    this.moon=new THREE.Sprite(new THREE.SpriteMaterial({map:pixelDisc(true),transparent:true,depthTest:true,depthWrite:false,fog:false}));this.moon.scale.setScalar(5);this.moon.renderOrder=-980;this.group.add(this.moon);
    this.rain=this.particles(false);this.snow=this.particles(true);this.precipitation.add(this.rain,this.snow);this.scene.add(this.group,this.precipitation);
  }
  private particles(snow:boolean){
    const material=new THREE.MeshBasicMaterial({color:snow?'#edf7ff':'#c8e7f2',transparent:true,opacity:snow?.85:.55,depthWrite:false,fog:true});
    material.onBeforeCompile=shader=>{const motion=snow?this.snowMotion:this.rainMotion;shader.uniforms.weatherFall=motion.fall;shader.uniforms.weatherDrift=motion.drift;shader.uniforms.weatherSway=this.sway;shader.uniforms.weatherOrigin=this.origin;shader.vertexShader='uniform float weatherFall;uniform float weatherDrift;uniform float weatherSway;uniform vec3 weatherOrigin;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`vec3 dropRoot=instanceMatrix[3].xyz;
        float phase=dropRoot.x*3.7+dropRoot.z;
        dropRoot.y=mod(dropRoot.y-weatherFall,18.);
        dropRoot.x=mod(dropRoot.x+weatherDrift+${snow?'sin(weatherSway+phase)*.6':'0.'}+16.,32.)-16.;
        dropRoot.z=mod(dropRoot.z+16.,32.)-16.;
        vec4 worldDrop=vec4((instanceMatrix*vec4(transformed,0.)).xyz+dropRoot+weatherOrigin,1.);
        vec4 mvPosition=modelViewMatrix*worldDrop;gl_Position=projectionMatrix*mvPosition;`);
    };material.customProgramCacheKey=()=>snow?'johto-snow-v1':'johto-rain-v1';
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(snow?.09:.025,snow?.09:.65,snow?.06:.025),material,420),dummy=new THREE.Object3D();
    for(let i=0;i<420;i++){dummy.position.set((skyNoise(i+72)-.5)*32,skyNoise(i+85)*18,(skyNoise(i+49)-.5)*32);dummy.rotation.set(0,0,snow?skyNoise(i+13)*Math.PI:.08);dummy.scale.setScalar(.7+skyNoise(i+167)*.6);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
    mesh.frustumCulled=false;mesh.visible=false;return mesh;
  }
  enter(map:SourceMap,weather:number){this.outdoors=hasOutdoorSky(map);this.setWeather(weather);}
  setWeather(weather:number){this.weather=weather;this.nextPalette=-1;this.rain.visible=this.outdoors&&weatherKind(weather)==='rain';this.snow.visible=this.outdoors&&['snow','blizzard','diamond-dust'].includes(weatherKind(weather));this.rain.count=weather===1?180:weather===2?290:420;this.snow.count=weather===6?360:weather===8?85:190;}
  get currentWeather(){return this.weather;}
  get status(){return {id:this.weather,kind:weatherKind(this.weather),outdoors:this.outdoors,hour:this.hour,period:this.period,clouds:this.group.visible?24:0,particles:this.rain.visible?this.rain.count:this.snow.visible?this.snow.count:0};}
  private palette(){
    const date=this.now();this.hour=date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;
    const {a,b,t}=skyKeyframes(this.hour),mix=(key:'zenith'|'horizon'|'cloud'|'cloudShade'|'field')=>new THREE.Color(a[key]).lerp(new THREE.Color(b[key]),t);
    this.period=a.period;let zenith=mix('zenith'),horizon=mix('horizon');this.cloudColour.copy(mix('cloud'));this.cloudShade.copy(mix('cloudShade'));this.fieldTint.value.copy(mix('field'));
    const kind=weatherKind(this.weather),overcast=kind==='rain'?(this.weather===3?.85:.65):kind==='snow'||kind==='blizzard'?.5:kind==='mist'?.7:0;
    const night=(a.stars*(1-t)+b.stars*t);if(overcast){zenith.lerp(new THREE.Color('#829ba8').multiplyScalar(1-night*.6),overcast);horizon.lerp(new THREE.Color('#c2d2d5').multiplyScalar(1-night*.5),overcast);this.cloudColour.lerp(new THREE.Color('#c2d0d5').multiplyScalar(1-night*.5),overcast);this.cloudShade.lerp(new THREE.Color('#91a7b6').multiplyScalar(1-night*.5),overcast);this.fieldTint.value.lerp(new THREE.Color('#b9cbd5').multiplyScalar(1-night*.18),overcast*.6);}
    (this.rain.material as THREE.MeshBasicMaterial).color.set('#c8e7f2').multiplyScalar(1-night*.5);
    this.dome.material.uniforms.zenith.value.copy(zenith);this.dome.material.uniforms.horizon.value.copy(horizon);
    this.fog.color.copy(horizon);this.fog.near=kind==='mist'?8:overcast?32:55;this.fog.far=kind==='mist'?52:overcast?95:115;
    this.stars.material.uniforms.opacity.value=night*(1-overcast);this.stars.visible=night>.01;
    // A compressed illustrated arc keeps the sun/moon in reach of the field camera.
    const angle=(this.hour-6)/12*Math.PI;this.sun.position.set(Math.cos(angle)*95,Math.sin(angle)*18,-99);this.moon.position.copy(this.sun.position).multiplyScalar(-1);
    (this.sun.material as THREE.SpriteMaterial).opacity=(a.sun*(1-t)+b.sun*t)*(1-overcast);this.sun.visible=this.sun.position.y>0;
    (this.moon.material as THREE.SpriteMaterial).opacity=(a.moon*(1-t)+b.moon*t)*(1-overcast);this.moon.visible=this.moon.position.y>0;
    this.group.visible=this.outdoors;this.precipitation.visible=this.outdoors;
    this.scene.background=this.outdoors?horizon:new THREE.Color('#242e39');this.scene.fog=this.outdoors?this.fog:null;
    if(!this.outdoors)this.fieldTint.value.setRGB(1,1,1);
  }
  private tintField(){
    this.scene.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object===this.dome||object===this.clouds||object===this.rain||object===this.snow)return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(material instanceof THREE.ShaderMaterial&&object.name==='camera-facing-original-trees'&&!this.patched.has(material)){
          this.patched.add(material);material.uniforms.fieldSkyTint=this.fieldTint;material.fragmentShader='uniform vec3 fieldSkyTint;\n'+material.fragmentShader;material.fragmentShader=material.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb *= fieldSkyTint;\n#include <tonemapping_fragment>');material.needsUpdate=true;continue;
        }
        if(!(material instanceof THREE.MeshBasicMaterial)||this.patched.has(material))continue;this.patched.add(material);
        const compile=material.onBeforeCompile.bind(material),baseKey=material.customProgramCacheKey();
        material.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.uniforms.fieldSkyTint=this.fieldTint;shader.fragmentShader='uniform vec3 fieldSkyTint;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>','gl_FragColor.rgb *= fieldSkyTint;\n#include <tonemapping_fragment>');};
        material.customProgramCacheKey=()=>baseKey+'|johto-field-tint-v1';material.needsUpdate=true;
      }
    });
  }
  update(dt:number,x:number,y:number,z:number){
    this.time+=dt;this.clock.value=(this.time*.6)%(Math.PI*2);this.sway.value=(this.time*.7)%(Math.PI*2);this.rainMotion.fall.value=(this.time*17)%18;this.rainMotion.drift.value=(this.time*1.4)%32;this.snowMotion.fall.value=(this.time*1.05)%18;this.snowMotion.drift.value=(this.time*.35)%32;this.group.position.copy(this.camera.position);this.clouds.rotation.y=this.time*.0015;
    this.origin.value.set(x,y,z);const wallTime=this.now().getTime();if(wallTime>=this.nextPalette){this.palette();this.nextPalette=wallTime+1000;}this.tintField();
  }
}
