import * as THREE from 'three';
import './style.css';
import { createWorld, makePaperSprite } from './scene';
import { BUILDINGS, canStand, groundHeight, moveWithCollision, movementVector, pathCenter, seededRandom } from './world';

const $ = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const SPECIES: Record<number,{name:string;type:string}> = {
  16:{name:'Pidgey',type:'Normal / Flying'},19:{name:'Rattata',type:'Normal'},25:{name:'Pikachu',type:'Electric'},
  152:{name:'Chikorita',type:'Grass'},155:{name:'Cyndaquil',type:'Fire'},158:{name:'Totodile',type:'Water'},161:{name:'Sentret',type:'Normal'},163:{name:'Hoothoot',type:'Normal / Flying'},
};
const STORAGE_KEY = 'paper-johto-v1';
type Catch = {species:number;level:number};
type Save = {version:1;starter:number;position:{x:number;z:number};caught:Catch[];visitedRoute:boolean;balls:number;night:boolean};
type RouteData = { land:{mons:{level:number|{HEARTGOLD:number};species:Record<string,string|{HEARTGOLD:string}>}[]} };
type Manifest = Record<string,{width:number;height:number}>;
type Paper = ReturnType<typeof makePaperSprite>;
type Wild = {paper:Paper;species:number;level:number;home:{x:number;z:number};phase:number;active:boolean};
const random = seededRandom(129);
const keys = new Set<string>();
let started=false,modalOpen=false,visitedRoute=false,starter=155,balls=10,night=false;
let caught:Catch[]=[],playerPosition={x:9,z:4},yaw=0,pitch=.32,distance=17,wide=false,walkTime=0,saveTimer=0;
let nearest:{name:string;action:()=>void}|null=null;
let currentEncounter:Wild|null=null,encounterHP=100,encounterTurns=0,encounterBusy=false;
let toastTimer:ReturnType<typeof setTimeout>;
function toast(message:string) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200); }
function readSave():Save|null {
  try {
    const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(value?.version!==1||![152,155,158].includes(value.starter)||!Array.isArray(value.caught))return null;
    if(!Number.isFinite(value.position?.x)||!Number.isFinite(value.position?.z)||!canStand(value.position.x,value.position.z))return null;
    if(!value.caught.every((p:Catch)=>SPECIES[p.species]&&Number.isInteger(p.level)&&p.level>0&&p.level<101))return null;
    return {...value,balls:Number.isFinite(value.balls)?Math.max(0,Math.min(99,Math.floor(value.balls))):10,night:!!value.night};
  }catch{return null;}
}
function save() {if(!started)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,starter,position:playerPosition,caught,visitedRoute,balls,night} satisfies Save));}catch{ /* Exploration still works when browser storage is unavailable. */ }}
const existingSave=readSave();
if(existingSave){starter=existingSave.starter;playerPosition=existingSave.position;caught=existingSave.caught;visitedRoute=existingSave.visitedRoute;balls=existingSave.balls;night=existingSave.night;$('start').innerHTML='Continue exploring <span>↗</span>';}

async function boot() {
  const [manifest,routeData] = await Promise.all([
    fetch('/assets/manifest.json').then(r=>{if(!r.ok)throw Error('Sprite manifest is missing');return r.json() as Promise<Manifest>;}),
    fetch('/assets/route29.json').then(r=>{if(!r.ok)throw Error('Route 29 data is missing');return r.json() as Promise<RouteData>;}),
  ]);
  const canvas=$<HTMLCanvasElement>('world');
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.17;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#d5e1cb');scene.fog=new THREE.Fog('#d5e1cb',42,115);
  const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,200);
  const hemi=new THREE.HemisphereLight('#fffae0','#7a8b68',2.45);scene.add(hemi);
  const sun=new THREE.DirectionalLight('#fff0ce',3.2);sun.position.set(-22,38,18);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-40;sun.shadow.camera.right=40;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-40;sun.shadow.camera.near=.5;sun.shadow.camera.far=100;sun.shadow.normalBias=.05;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
  const world=createWorld(scene);
  if(!canStand(playerPosition.x,playerPosition.z,world.obstacles))playerPosition={x:9,z:4};
  function pokemon(species:number,height:number) {const info=manifest[species];return makePaperSprite(scene,`/assets/${species}.png`,height,info.width/info.height);}
  const player=makePaperSprite(scene,'/assets/ethan.png',1.85,1);
  player.texture.repeat.set(.25,.125);player.texture.offset.set(0,.875);
  let partner=pokemon(starter,1.1);partner.group.position.set(playerPosition.x+1,groundHeight(playerPosition.x+1,playerPosition.z+1),playerPosition.z+1);
  const wild:Wild[]=[];
  const spawnHomes=[{x:-29,z:-2},{x:-37,z:10},{x:-44,z:-5},{x:-52,z:8},{x:-61,z:-2},{x:-70,z:8},{x:-79,z:1},{x:-45,z:13}];
  function spawnWild() {
    for(const w of wild){scene.remove(w.paper.group);w.paper.sprite.geometry.dispose();w.paper.material.dispose();w.paper.texture.dispose();w.paper.shadow.geometry.dispose();(w.paper.shadow.material as THREE.Material).dispose();}wild.length=0;
    const speciesIds:Record<string,number>={SPECIES_PIDGEY:16,SPECIES_RATTATA:19,SPECIES_SENTRET:161,SPECIES_HOOTHOOT:163};
    const slots=routeData.land.mons;
    spawnHomes.forEach((home,i)=>{
      const slot=slots[[0,1,8,3,9,10,7,11][i]],entry=slot.species[night?'nite':'day'];
      const species=speciesIds[typeof entry==='string'?entry:entry.HEARTGOLD];
      if(!species)return;
      const level=typeof slot.level==='number'?slot.level:slot.level.HEARTGOLD;
      const paper=pokemon(species,species===161?1.25:.95);paper.group.position.set(home.x,groundHeight(home.x,home.z),home.z);
      wild.push({paper,species,level,home,phase:random()*Math.PI*2,active:true});
    });
  }
  spawnWild();
  function changeStarter(id:number) {
    starter=id;scene.remove(partner.group);partner.sprite.geometry.dispose();partner.texture.dispose();partner.material.dispose();partner.shadow.geometry.dispose();(partner.shadow.material as THREE.Material).dispose();
    partner=pokemon(starter,1.1);partner.group.position.set(playerPosition.x+1,groundHeight(playerPosition.x+1,playerPosition.z+1),playerPosition.z+1);
    $('partner-name').innerHTML=`${SPECIES[starter].name} <span>Lv. 5</span>`;
    $<HTMLImageElement>('partner-image').src=`/assets/${starter}.png`;$<HTMLImageElement>('partner-image').alt=SPECIES[starter].name;
    document.querySelectorAll<HTMLButtonElement>('[data-starter]').forEach(b=>{const selected=Number(b.dataset.starter)===starter;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  }
  changeStarter(starter);
  document.querySelectorAll<HTMLButtonElement>('[data-starter]').forEach(button=>button.addEventListener('click',()=>changeStarter(Number(button.dataset.starter))));
  $('start').addEventListener('click',()=>{started=true;$('welcome').hidden=true;canvas.focus();updateQuest();save();toast(existingSave?'Welcome back. Your partner missed you.':'Head west along the path to discover Route 29.');});
  function showModal(content:string) {modalOpen=true;keys.clear();$('hud').inert=true;$('touch-controls').inert=true;canvas.inert=true;$('modal-content').innerHTML=content;$('modal').hidden=false;$('modal-close').focus();}
  function closeModal(){if(encounterBusy)return;modalOpen=false;currentEncounter=null;$('modal').hidden=true;$('hud').inert=false;$('touch-controls').inert=false;canvas.inert=false;canvas.focus();keys.clear();save();}
  $('modal-close').onclick=closeModal;
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});
  function updateQuest(){
    $('quest-route').textContent=`${visitedRoute?'✓':'○'} Visit Route 29`;$('quest-route').classList.toggle('done',visitedRoute);
    $('quest-catch').textContent=`${caught.length?'✓':'○'} Catch a wild Pokémon`;$('quest-catch').classList.toggle('done',caught.length>0);
    $('caught-count').textContent=String(caught.length);
    if(visitedRoute&&caught.length)$('quest-copy').textContent='A new friend. A path less traveled. Your Johto adventure has begun.';
    else if(visitedRoute)$('quest-copy').textContent='Walk up to a wild Pokémon and press F to meet your next companion.';
  }
  $('partner-button').onclick=()=>showModal(`<span class="eyebrow">YOUR TRAVEL COMPANION</span><img class="encounter-image" src="/assets/${starter}.png" alt="${SPECIES[starter].name}"><h2>${SPECIES[starter].name}</h2><p>Level 5 · ${SPECIES[starter].type}<br>Your partner looks happy to be traveling with you.</p><p>Walk a little slower and they’ll catch up. There’s no hurry.</p>`);
  $('journal-button').onclick=()=>{
    showModal(`<span class="eyebrow">YOUR JOHTO FIELD NOTES</span><h2>Little discoveries</h2><p>${visitedRoute?'New Bark Town and Route 29 explored.':'New Bark Town explored. Route 29 awaits to the west.'}<br>${balls} Poké Balls in your bag.</p><h3>Traveling with you</h3><div class="catch-row"><img src="/assets/${starter}.png" alt=""><b>${SPECIES[starter].name}</b><small>Lv. 5 · Partner</small></div><h3>Pokémon caught · ${caught.length}</h3>${caught.length?caught.map(p=>`<div class="catch-row"><img src="/assets/${p.species}.png" alt=""><b>${SPECIES[p.species].name}</b><small>Lv. ${p.level}</small></div>`).join(''):'<p>No catches yet. Try the tall grass along Route 29.</p>'}<p style="font-size:10px">Progress saves automatically in this browser. This exploration build has its own save; Nintendo DS saves are not imported.</p>`);
  };
  function help(){showModal(`<span class="eyebrow">TAKE YOUR TIME</span><h2>A guide to wandering</h2><div class="settings-row"><span>Move relative to your camera</span><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></div><div class="settings-row"><span>Run</span><kbd>Shift</kbd></div><div class="settings-row"><span>Rotate camera</span><span>Drag · <kbd>Q</kbd><kbd>E</kbd></span></div><div class="settings-row"><span>Zoom</span><span>Scroll wheel</span></div><div class="settings-row"><span>Talk, read, meet Pokémon</span><kbd>F</kbd></div><div class="settings-row"><span>Close a panel</span><kbd>Esc</kbd></div><p>Walk west from town into Route 29. Approach a visible Pokémon to start an encounter. Visit Elm’s lab to replenish your Poké Balls.</p><div class="modal-actions"><button id="toggle-time" class="secondary">${night?'☀ Switch to afternoon':'☾ Explore at night'}</button><button id="return-home" class="secondary">Return to town</button></div><p style="font-size:10px">A first playable interpretation of Johto. Buildings have doorstep interactions; indoor maps, the full story, and the complete battle system are future work.</p>`);
    $('toggle-time').onclick=()=>{night=!night;applyTime();spawnWild();closeModal();toast(night?'Night falls. Hoothoot are waking up on Route 29.':'The afternoon sun warms Johto.');};
    $('return-home').onclick=()=>{playerPosition={x:9,z:4};partner.group.position.set(10,0,5);closeModal();toast('Back in New Bark Town.');};
  }
  $('help').onclick=help;
  $('camera-button').onclick=()=>{wide=!wide;distance=wide?25:17;pitch=wide?.7:.32;toast(wide?'Panoramic camera · Drag or Q / E to look around.':'Adventure camera · Scroll to adjust your view.');};
  $('map-toggle').onclick=()=>{const expanded=document.querySelector('.map-card')!.classList.toggle('expanded');$('map-toggle').setAttribute('aria-label',expanded?'Collapse map':'Expand map');};
  function applyTime(){
    const sky=night?'#3f5865':'#d5e1cb';scene.background=new THREE.Color(sky);(scene.fog as THREE.Fog).color.set(sky);hemi.color.set(night?'#a6c4d8':'#fffae0');hemi.intensity=night?1.3:2.45;sun.color.set(night?'#b5c5e5':'#fff0ce');sun.intensity=night?.65:3.2;renderer.toneMappingExposure=night?.95:1.17;
    $('time-label').textContent=night?'☾   A peaceful evening':'☀   A quiet afternoon';
    $('hud').classList.toggle('night',night);
  }applyTime();

  function encounter(w:Wild){currentEncounter=w;encounterHP=100;encounterTurns=0;encounterBusy=false;showEncounter();}
  function showEncounter(message?:string){
    const w=currentEncounter;if(!w)return;
    showModal(`<span class="eyebrow">A MEETING ON ROUTE 29</span><img class="encounter-image" src="/assets/${w.species}.png" alt="${SPECIES[w.species].name}"><h2>A wild ${SPECIES[w.species].name}!</h2><p>Lv. ${w.level} · ${SPECIES[w.species].type}</p><span class="health" style="width:100%;height:6px"><i style="width:${encounterHP}%"></i></span><p role="status">${message||`${SPECIES[w.species].name} is watching you curiously. What will you do?`}</p><div class="modal-actions"><button class="primary" id="throw-ball" ${balls<=0?'disabled':''}>Throw a Poké Ball · ${balls}</button><button class="secondary" id="battle">Tackle</button><button class="secondary" id="leave">Leave</button></div>${balls<=0?'<p style="font-size:11px">Out of Poké Balls. Professor Elm can replenish your bag back in town.</p>':''}`);
    $('throw-ball').onclick=()=>{
      if(encounterBusy||balls<=0)return;encounterBusy=true;balls--;encounterTurns++;save();
      const success=random()<.38+(100-encounterHP)*.006+encounterTurns*.09;
      $('throw-ball').textContent='Shake… shake…';$<HTMLButtonElement>('throw-ball').disabled=true;$<HTMLButtonElement>('battle').disabled=true;$<HTMLButtonElement>('leave').disabled=true;
      setTimeout(()=>{encounterBusy=false;if(success){w.active=false;w.paper.group.visible=false;caught.push({species:w.species,level:w.level});updateQuest();save();showModal(`<span class="eyebrow">A NEW FRIEND</span><img class="encounter-image" src="/assets/${w.species}.png" alt="${SPECIES[w.species].name}"><h2>Gotcha, ${SPECIES[w.species].name}!</h2><p>Your field notes have a new entry.<br>There are more little discoveries down the path.</p><button class="primary" id="keep-exploring">Keep exploring ↗</button>`);$('keep-exploring').onclick=closeModal;playChime();}else showEncounter(`${SPECIES[w.species].name} broke free! Try weakening it with Tackle.`);},1100);
    };
    $('battle').onclick=()=>{encounterTurns++;encounterHP=Math.max(8,encounterHP-27);showEncounter(`${SPECIES[starter].name} used Tackle! ${encounterHP<=8?'It’s weakened. Now is a good time to throw a Poké Ball.':'It looks a little easier to catch now.'}`);};
    $('leave').onclick=closeModal;
  }

  let audioContext:AudioContext|null=null,audioGain:GainNode|null=null,soundEnabled=false;
  function playChime(){if(!soundEnabled||!audioContext)return;for(const [i,f] of [523.25,659.25,783.99].entries()){const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=f;gain.gain.setValueAtTime(0,audioContext.currentTime+i*.13);gain.gain.linearRampToValueAtTime(.06,audioContext.currentTime+i*.13+.02);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+i*.13+.5);osc.connect(gain);gain.connect(audioContext.destination);osc.start(audioContext.currentTime+i*.13);osc.stop(audioContext.currentTime+i*.13+.55);}}
  $('sound').onclick=async()=>{
    soundEnabled=!soundEnabled;
    if(!audioContext){audioContext=new AudioContext();audioGain=audioContext.createGain();audioGain.gain.value=0;audioGain.connect(audioContext.destination);
      for(const frequency of [130.81,196,261.63]){const osc=audioContext.createOscillator();osc.frequency.value=frequency;osc.type='sine';const gain=audioContext.createGain();gain.gain.value=.035;osc.connect(gain);gain.connect(audioGain);osc.start();}
      const noise=audioContext.createBuffer(1,audioContext.sampleRate*3,audioContext.sampleRate);const data=noise.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.02)/1.02;data[i]=last*2;}const source=audioContext.createBufferSource();source.buffer=noise;source.loop=true;const noiseGain=audioContext.createGain();noiseGain.gain.value=.12;source.connect(noiseGain);noiseGain.connect(audioGain);source.start();
    }await audioContext.resume();audioGain!.gain.setTargetAtTime(soundEnabled?1:0,audioContext.currentTime,.3);$('sound').innerHTML=`♪ <span>Sound ${soundEnabled?'on':'off'}</span>`;$('sound').setAttribute('aria-label',`Turn ambient sound ${soundEnabled?'off':'on'}`);
  };
  addEventListener('keydown',e=>{
    if(e.code==='Tab'&&modalOpen){const focusable=Array.from($('modal').querySelectorAll<HTMLButtonElement>('button:not([disabled])'));const index=focusable.indexOf(document.activeElement as HTMLButtonElement);if(e.shiftKey&&index<=0){e.preventDefault();focusable.at(-1)?.focus();}else if(!e.shiftKey&&index===focusable.length-1){e.preventDefault();focusable[0]?.focus();}return;}
    if(e.code==='Escape'){if(modalOpen)closeModal();return;}
    if(!started||modalOpen)return;
    if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyF','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    keys.add(e.code);if(e.code==='KeyF'&&!e.repeat)nearest?.action();
  });
  addEventListener('keyup',e=>keys.delete(e.code));
  addEventListener('blur',()=>keys.clear());
  document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden){save();audioContext?.suspend();}else if(soundEnabled)audioContext?.resume();});
  addEventListener('pagehide',save);
  let dragging=false,lastPointer={x:0,y:0};
  canvas.addEventListener('pointerdown',e=>{if(!started||modalOpen)return;dragging=true;lastPointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.focus();});
  canvas.addEventListener('pointermove',e=>{if(!dragging)return;yaw-=(e.clientX-lastPointer.x)*.006;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-lastPointer.y)*.003,.17,.95);lastPointer={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  canvas.addEventListener('wheel',e=>{e.preventDefault();if(started&&!modalOpen)distance=THREE.MathUtils.clamp(distance+e.deltaY*.012,7,31);},{passive:false});
  document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach(button=>{
    button.addEventListener('pointerdown',e=>{e.preventDefault();if(!started||modalOpen)return;button.setPointerCapture(e.pointerId);const code=button.dataset.key!;if(code==='KeyF')nearest?.action();else keys.add(code);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(button.dataset.key!));
  });
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,2));});

  const map=$<HTMLCanvasElement>('minimap'),mapContext=map.getContext('2d')!;
  let mapFrame=0;
  function drawMap(){
    const ctx=mapContext,w=map.width,h=map.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#c9d6b1';ctx.fillRect(0,0,w,h);
    const px=(x:number)=>(x+93)/133*w,pz=(z:number)=>(z+38)/77*h;
    ctx.fillStyle='#a5bc8e';for(let i=0;i<75;i++){const x=(i*47)%w,z=(i*67)%h;if(z<55||z>170){ctx.beginPath();ctx.arc(x,z,8+(i%5),0,Math.PI*2);ctx.fill();}}
    ctx.fillStyle='#92bebb';ctx.fillRect(px(31),0,w,h);ctx.beginPath();ctx.ellipse(px(-66),pz(-22),22,12,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#e8dbb7';ctx.lineWidth=9;ctx.lineCap='round';ctx.beginPath();for(let x=-90;x<=28;x+=2){if(x===-90)ctx.moveTo(px(x),pz(pathCenter(x)));else ctx.lineTo(px(x),pz(pathCenter(x)));}ctx.stroke();ctx.beginPath();ctx.moveTo(px(5),pz(-15));ctx.lineTo(px(5),pz(20));ctx.moveTo(px(-9),pz(12));ctx.lineTo(px(20),pz(12));ctx.stroke();
    for(const b of BUILDINGS){ctx.fillStyle=b.roof;ctx.fillRect(px(b.x-b.width/2),pz(b.z-b.depth/2),b.width/133*w,b.depth/77*h);}
    ctx.fillStyle='#5c7352';ctx.font='8px sans-serif';ctx.fillText('ROUTE 29',px(-71),pz(22));
    for(const p of wild)if(p.active){ctx.fillStyle='#9b8b53';ctx.beginPath();ctx.arc(px(p.paper.group.position.x),pz(p.paper.group.position.z),2,0,Math.PI*2);ctx.fill();}
    const x=px(playerPosition.x),z=pz(playerPosition.z);ctx.fillStyle='#fff9e4';ctx.beginPath();ctx.arc(x,z,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b36842';ctx.beginPath();ctx.arc(x,z,4,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(x,z);ctx.rotate(-yaw);ctx.fillStyle='#b36842';ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(-3,-7);ctx.lineTo(3,-7);ctx.closePath();ctx.fill();ctx.restore();
  }
  function updateInteractions(){
    nearest=null;let closest=3.5;
    for(const w of wild){if(!w.active)continue;const d=Math.hypot(playerPosition.x-w.paper.group.position.x,playerPosition.z-w.paper.group.position.z);if(d<closest){closest=d;nearest={name:`Meet ${SPECIES[w.species].name}`,action:()=>encounter(w)};}}
    for(const b of BUILDINGS){const d=Math.hypot(playerPosition.x-b.x,playerPosition.z-(b.z+b.depth/2+1.1));if(d<2.9&&d<closest){closest=d;nearest={name:b.kind==='lab'?'Visit Professor Elm':b.kind==='home'?'Stop by home':'Say hello',action:()=>{
      if(b.kind==='lab'){balls=Math.max(balls,10);save();showModal(`<span class="eyebrow">PROFESSOR ELM’S LAB</span><h2>“Keep your eyes open!”</h2><p>There’s so much we can learn just by walking alongside Pokémon. Head west to Route 29 and see who you meet.</p><p>I’ve topped your bag up to ${balls} Poké Balls. Make some new friends!</p><button class="primary" id="leave-building">Back to the adventure ↗</button>`);}
      else if(b.kind==='home')showModal('<span class="eyebrow">HOME, SWEET HOME</span><h2>“Already an adventure?”</h2><p>Mom smiles as you tell her about the world outside. You and your partner take a little rest.</p><p>“Don’t forget to look around once in a while. Johto is a lovely place.”</p><button class="primary" id="leave-building">Head back outside ↗</button>');
      else showModal('<span class="eyebrow">A FRIENDLY NEIGHBOR</span><h2>“A nice day for a walk.”</h2><p>New Bark Town is small, but the world beyond it is full of surprises. The path to the west leads to Route 29.</p><p>At night, you might hear a Hoothoot calling from the grass.</p><button class="primary" id="leave-building">Keep wandering ↗</button>');
      $('leave-building').onclick=closeModal;
    }};}}
    const signs=[{x:-17,z:7,text:'Route 29 — Cherrygrove City lies to the west. Wild Pokémon make their home in the tall grass.'},{x:5,z:-5.5,text:'New Bark Town — Where winds of a new beginning blow.'},{x:21,z:12,text:'Your home — Every adventure starts somewhere.'},{x:-76,z:8,text:'The road continues — This first exploration build ends here. Take a moment to enjoy the view.'}];
    for(const sign of signs){const d=Math.hypot(playerPosition.x-sign.x,playerPosition.z-sign.z);if(d<2.5&&d<closest){closest=d;nearest={name:'Read sign',action:()=>showModal(`<span class="eyebrow">ALONG THE WAY</span><h2>A little direction</h2><p>${sign.text}</p>`)};}}
    $('prompt').hidden=!nearest||!started||modalOpen;if(nearest)$('prompt').querySelector('span')!.textContent=nearest.name;
  }
  const clock=new THREE.Clock();
  const cameraTarget=new THREE.Vector3(playerPosition.x,1.1,playerPosition.z),desiredCamera=new THREE.Vector3();
  const boxes=BUILDINGS.map(b=>new THREE.Box3(new THREE.Vector3(b.x-b.width/2-.8,0,b.z-b.depth/2-.8),new THREE.Vector3(b.x+b.width/2+.8,b.height+2.8,b.z+b.depth/2+.8)));
  const ray=new THREE.Ray(),hit=new THREE.Vector3();
  let elapsed=0,frameCount=0,lastMetrics=0,fps=0;
  function frame(){
    requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.05);elapsed+=dt;frameCount++;
    if(elapsed-lastMetrics>1){fps=frameCount/(elapsed-lastMetrics);frameCount=0;lastMetrics=elapsed;}
    let moving=false;
    if(started&&!modalOpen){
      if(keys.has('KeyQ'))yaw+=dt*1.6;if(keys.has('KeyE'))yaw-=dt*1.6;
      const horizontal=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
      moving=horizontal!==0||forward!==0;
      if(moving){const direction=movementVector(horizontal,forward,yaw);const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?7.8:4.3;playerPosition=moveWithCollision(playerPosition,direction.x*speed*dt,direction.z*speed*dt,world.obstacles);walkTime+=dt*(speed>5?12:8);
        const angle=Math.atan2(horizontal,forward);const row=Math.abs(angle)<.7?0:Math.abs(angle)>2.4?1:angle>0?3:2;const anim=(Math.floor(walkTime)%4)+row*4+(speed>5?16:0);player.texture.offset.set((anim%4)*.25,1-(Math.floor(anim/4)+1)*.125);
      }
      if(playerPosition.x<-22&&!visitedRoute){visitedRoute=true;updateQuest();toast('Route 29 discovered. A little farther from home.');save();playChime();}
      saveTimer+=dt;if(saveTimer>3){save();saveTimer=0;}
    }
    player.group.position.set(playerPosition.x,groundHeight(playerPosition.x,playerPosition.z),playerPosition.z);player.sprite.rotation.y=yaw;
    player.sprite.position.y=moving?Math.sin(walkTime*2)*.025:0;
    const delta=new THREE.Vector3().subVectors(player.group.position,partner.group.position);delta.y=0;const separation=delta.length();
    if(separation>1.7&&!modalOpen){const followSpeed=Math.min(8,separation*2.7);const step=delta.normalize().multiplyScalar(Math.min(separation-1.6,followSpeed*dt));const next=moveWithCollision({x:partner.group.position.x,z:partner.group.position.z},step.x,step.z,world.obstacles);partner.group.position.x=next.x;partner.group.position.z=next.z;}
    // Recover if a corner or a return-to-town leaves the follower far behind.
    if(separation>12){const offsets=[[1,1],[-1,1],[0,2],[2,0],[-2,0]];for(const [x,z] of offsets)if(canStand(playerPosition.x+x,playerPosition.z+z,world.obstacles)){partner.group.position.set(playerPosition.x+x,0,playerPosition.z+z);break;}}
    partner.group.position.y=groundHeight(partner.group.position.x,partner.group.position.z);partner.sprite.rotation.y=yaw;partner.sprite.position.y=separation>1.8&&!modalOpen?Math.abs(Math.sin(elapsed*10))*.11:Math.sin(elapsed*2)*.025;
    for(const w of wild){if(!w.active)continue;if(!modalOpen){const tx=w.home.x+Math.sin(elapsed*.22+w.phase)*1.25,tz=w.home.z+Math.cos(elapsed*.28+w.phase)*.8;if(canStand(tx,tz,world.obstacles))w.paper.group.position.set(tx,groundHeight(tx,tz),tz);}w.paper.sprite.rotation.y=yaw;w.paper.sprite.position.y=Math.sin(elapsed*2.5+w.phase)*.05;}
    const region=playerPosition.x<-22?'Route 29':'New Bark Town';
    if($('location-name').textContent!==region){$('location-name').textContent=region;$('map-place').textContent=region.toUpperCase();$('location-description').textContent=region==='Route 29'?'A winding path. A world of little discoveries.':'Where winds of a new beginning blow.';}
    const target=new THREE.Vector3(playerPosition.x,groundHeight(playerPosition.x,playerPosition.z)+1.1,playerPosition.z);
    cameraTarget.lerp(target,1-Math.exp(-dt*7));
    const orbit=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    let safeDistance=distance;ray.set(cameraTarget,orbit);
    for(const box of boxes){const result=ray.intersectBox(box,hit);if(result){const d=hit.distanceTo(cameraTarget);if(d>1)safeDistance=Math.min(safeDistance,Math.max(2,d-.5));}}
    for(const sphere of world.cameraBlockers){const result=ray.intersectSphere(sphere,hit);if(result){const d=hit.distanceTo(cameraTarget);if(d>1)safeDistance=Math.min(safeDistance,Math.max(2,d-.7));}}
    desiredCamera.copy(cameraTarget).addScaledVector(orbit,safeDistance);camera.position.lerp(desiredCamera,1-Math.exp(-dt*9));camera.lookAt(cameraTarget);
    sun.position.set(playerPosition.x-22,38,playerPosition.z+18);sun.target.position.set(playerPosition.x,0,playerPosition.z);
    world.clouds.position.x=Math.sin(elapsed*.008)*5;world.motes.position.y=Math.sin(elapsed*.15)*.5;world.waterMeshes.forEach(w=>w.position.y+=Math.sin(elapsed*1.2)*.0002);
    if(mapFrame++%8===0){drawMap();updateInteractions();}
    renderer.render(scene,camera);
    // Read-only diagnostics for browser verification and future engine integration.
    (window as unknown as {__JOHTO__:unknown}).__JOHTO__={ready:true,started,position:{...playerPosition},partner:{x:partner.group.position.x,z:partner.group.position.z},yaw,pitch,region,visitedRoute,caught:caught.length,balls,night,modalOpen,nearby:nearest?.name??null,fps:Math.round(fps),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,wild:wild.filter(w=>w.active).map(w=>({species:w.species,level:w.level,x:w.paper.group.position.x,z:w.paper.group.position.z}))};
  }
  camera.position.copy(cameraTarget).add(new THREE.Vector3(0,Math.sin(pitch)*distance,Math.cos(pitch)*distance));camera.lookAt(cameraTarget);updateQuest();drawMap();frame();
}

boot().catch(error=>{console.error(error);$('welcome').hidden=true;modalOpen=true;$('modal').hidden=false;$('modal-content').innerHTML='<span class="eyebrow">A MOMENT BEFORE THE ADVENTURE</span><h2>The world couldn’t load.</h2><p>This game needs a browser with WebGL 2 and hardware acceleration enabled. Reload to try again.</p><button id="retry" class="primary">Try again</button>';$('retry').onclick=()=>location.reload();$('modal-close').hidden=true;});
