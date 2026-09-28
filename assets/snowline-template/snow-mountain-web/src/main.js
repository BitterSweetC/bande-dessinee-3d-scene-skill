import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {createWorld} from './scene.js';
import {CameraController} from './camera-controller.js';
import {AlpineAudio} from './audio.js';
import './style.css';
const $=s=>document.querySelector(s);const start=performance.now();const holder=$('#viewport');const world=createWorld($('#scene'));const {scene,renderer,sky}=world;
const audio=new AlpineAudio();
let controller,model,firstFrame=null,last=performance.now(),samples=[],hudTimer=0;
let active=new THREE.PerspectiveCamera(50,1,2,50000);active.position.set(5000,4000,6000);active.lookAt(0,1200,0);
const chapters=[
 ['01 / THE APPROACH','Against the Silent Face','01 / NORTH RIDGE <i>·</i> THE MOUNTAIN SPEAKS ONLY IN WIND AND GEOLOGIC TIME'],
 ['02 / SNOW SADDLE','Along the Knife-Edge','02 / SNOW SADDLE <i>·</i> MEASURING SOLITUDE BETWEEN THE ABYSS AND THE SKY'],
 ['03 / ALONG THE RIDGE','Cresting the Solitary Peak','03 / THE SUMMIT CREST <i>·</i> ABOVE THE SNOWLINE, THE WORLD IS REDUCED TO BONE AND LIGHT'],
 ['04 / INTO THE VALLEY','Into the Indigo Couloir','04 / INDIGO COULOIR <i>·</i> COLD SHADOWED SNOW HOLDS THE STILLNESS OF THE RANGE'],
 ['05 / A WIDER WORLD','A Choir of Silent Peaks','05 / BEYOND THE HORIZON <i>·</i> DISTANT RIDGES DRIFT IN MIST LIKE AN UNBROKEN DREAM']
];
function syncAudioUI(){const on=audio.enabled;$('#audio-toggle')?.setAttribute('aria-pressed',String(on));if($('#audio-label'))$('#audio-label').textContent=on?'山间回响 · 开':'山间回响 · 寂';const vol=$('#audio-volume');if(vol){const pct=on?Math.round(audio.volume*100):0;vol.value=String(pct);vol.title=`音量 ${pct}%`;}}
function unlockAudio(){if(audio.enabled&&!audio.started)audio.start();}
addEventListener('pointerdown',unlockAudio,{passive:true});
function resize(){const w=holder.clientWidth,h=holder.clientHeight;renderer.setSize(w,h,false);controller?.resize(w,h);active.aspect=w/h;active.updateProjectionMatrix();}
new ResizeObserver(resize).observe(holder);
const defaultCaption='01 / NORTH RIDGE <i>·</i> ABOVE THE SNOWLINE, EVERY PEAK IS A POEM IN STONE';
function state(c){const flying=c.mode!=='free';document.body.classList.toggle('flying',flying);$('.flight-data').hidden=!flying;$('.flight-progress').hidden=!flying;$('#return').hidden=!flying;$('#pause').hidden=!flying||c.mode==='ended';$('#reset').hidden=flying;$('#play-text').textContent=flying?'FLY THE RIDGE AGAIN':'BEGIN · RIDGE FLIGHT';$('#pause').textContent=c.paused?'▶':'Ⅱ';$('#pause').setAttribute('aria-label',c.paused?'Resume flight':'Pause flight');$('#mode-label').textContent=c.mode==='ended'?'AT THE SUMMIT':flying?(c.paused?'STILLNESS':'RIDGE FLIGHT'):'FREE ROAM';if(!flying&&$('#scene-caption')){$('#scene-caption').innerHTML=defaultCaption;lastPhase=-1;}audio.setFlightState(flying&&c.mode!=='ended',c.paused);active=c.active;resize();}
$('#play').onclick=()=>{unlockAudio();controller?.play();};$('#return').onclick=()=>controller?.returnFree();$('#pause').onclick=()=>controller?.pause();$('#reset').onclick=()=>controller?.reset();
$('#audio-toggle').onclick=e=>{e.stopPropagation();audio.toggle();syncAudioUI();};
$('#audio-volume')?.addEventListener('input',e=>{e.stopPropagation();audio.setVolume(Number(e.target.value)/100);syncAudioUI();});
$('#about-button').onclick=()=>{$('#about').hidden=!$('#about').hidden;};$('#close-about').onclick=()=>{$('#about').hidden=true;};
function setRouteCollapsed(collapsed){const map=$('#route-map'),card=$('.route-card'),btn=$('#route-toggle');if(!map||!btn)return;map.hidden=collapsed;card?.classList.toggle('is-collapsed',collapsed);btn.textContent=collapsed?'+':'−';btn.setAttribute('aria-expanded',String(!collapsed));}
$('#route-toggle').onclick=()=>{const map=$('#route-map');setRouteCollapsed(!map.hidden);};
const narrowMq=matchMedia('(max-width: 900px)');setRouteCollapsed(narrowMq.matches);narrowMq.addEventListener('change',e=>setRouteCollapsed(e.matches));
$('#quality').onchange=e=>{world.quality(e.target.value);resize();};$('#retry').onclick=()=>location.reload();
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#fullscreen').title='Fullscreen not supported';}};
addEventListener('keydown',e=>{unlockAudio();if(/INPUT|SELECT|BUTTON/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();controller?.mode==='free'?controller?.play():controller?.pause();}if(e.code==='KeyM'){audio.toggle();syncAudioUI();}if(e.code==='Escape'){controller?.returnFree();$('#about').hidden=true;}});
document.addEventListener('visibilitychange',()=>{last=performance.now();});
try{
 const url=new URLSearchParams(location.search).get('model')||`${import.meta.env.BASE_URL}models/snow_mountain_world.glb`;
 const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);model=gltf.scene;scene.add(model);world.prepare(model);controller=new CameraController(model,gltf.animations,renderer.domElement,state);active=controller.active;resize();await world.skyReady;
 if(controller.splinePts?.length){
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const p of controller.splinePts){if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;if(p.z<minZ)minZ=p.z;if(p.z>maxZ)maxZ=p.z;}
  const cx=(minX+maxX)*.5,cz=(minZ+maxZ)*.5,sx=78/Math.max(400,maxX-minX),sz=88/Math.max(400,maxZ-minZ);
  controller._toMap=(x,z)=>({x:Math.max(10,Math.min(170,90+(x-cx)*sx)),y:Math.max(10,Math.min(110,58+(z-cz)*sz))});
  const elRouteInit=$('.route-line');
  if(elRouteInit){
   const d=controller.splinePts.filter((_,i)=>i%20===0||i===controller.splineN).map((p,i)=>{const m=controller._toMap(p.x,p.z);return `${i?'L':'M'}${m.x.toFixed(1)} ${m.y.toFixed(1)}`;}).join(' ');
   elRouteInit.setAttribute('d',d);
  }
 }
 $('#loading').hidden=true;$('#play').disabled=false;
 window.__snowline={THREE,world,controller,audio,model,get metrics(){const s=[...samples].sort((a,b)=>a-b);const g=renderer.getContext();return {interactiveMs:firstFrame-start,frames:s.length,medianMs:s[Math.floor(s.length*.5)],p95Ms:s[Math.floor(s.length*.95)],calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:renderer.info.memory,viewport:[holder.clientWidth,holder.clientHeight],dpr:renderer.getPixelRatio(),gpu:g.getParameter(g.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)};},resetMetrics(){samples=[];},render(){model.updateMatrixWorld(true);sky.position.copy(controller.active.getWorldPosition(new THREE.Vector3()));world.render(controller.active);}};
}catch(e){console.error(e);$('#load-status').textContent='The mountain pass is snowed in. Please check the model assets and try again.';$('.loading-mark').hidden=true;$('#loading small').textContent=e.message.includes('Unexpected token')?'Model file missing or invalid format':e.message;$('#retry').hidden=false;}
resize();const pos=new THREE.Vector3();
const elChapter=$('#flight-chapter'),elTitle=$('#flight-title'),elCaption=$('#scene-caption'),elHeight=$('#flight-height'),elProgress=$('#progress'),elTime=$('#timecode'),elDot=$('#map-dot'),elFps=$('#fps');
let smoothDt=1/60,lastPhase=-1,lastSec=-1;
renderer.setAnimationLoop(()=>{
 const now=performance.now();const ms=now-last;last=now;if(document.hidden)return;
 const rawDt=Math.min(ms/1000,.05);
 smoothDt+=(rawDt-smoothDt)*.22;
 controller?.update(smoothDt);
 if(controller)active=controller.active;
 sky.position.copy(active.getWorldPosition(pos));
 if(elDot&&controller?._toMap){
  const m=controller._toMap(pos.x,pos.z);
  elDot.setAttribute('cx',m.x.toFixed(1));elDot.setAttribute('cy',m.y.toFixed(1));
 }
 const flying=controller&&controller.mode!=='free';
 const t=flying?controller.action.time:0,ratio=flying?Math.min(1,t/controller.clip.duration):0;
 audio.update(smoothDt,pos.y,ratio);
 world.render(active);
 if(controller&&firstFrame===null)firstFrame=performance.now();
 if(firstFrame&&ms<250){samples.push(ms);if(samples.length>8000)samples.shift();}
 if(flying){
  elProgress.style.width=`${(ratio*100).toFixed(2)}%`;
  const pIdx=Math.min(4,Math.floor(ratio*5));
  if(pIdx!==lastPhase){lastPhase=pIdx;elChapter.textContent=chapters[pIdx][0];elTitle.textContent=chapters[pIdx][1];if(elCaption)elCaption.innerHTML=chapters[pIdx][2];}
  const sec=Math.floor(t);
  if(sec!==lastSec){lastSec=sec;elTime.textContent=`00:${String(sec).padStart(2,'0')} / 00:52`;}
 }
 hudTimer+=rawDt;
 if(hudTimer>.25&&controller){
  if(controller.mode!=='free')elHeight.textContent=Math.round(pos.y).toLocaleString();
  elFps.textContent=`${Math.round(1/smoothDt)} FPS · LIVE`;
  hudTimer=0;
 }
});
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);audio.dispose();controller?.dispose();const textures=new Set();scene.traverse(o=>{o.geometry?.dispose();for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean)){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}});textures.add(sky.material.uniforms.paint.value);textures.forEach(t=>t?.dispose());renderer.dispose();},{once:true});
