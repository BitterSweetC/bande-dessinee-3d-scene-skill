import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export class CameraController{
 constructor(model,clips,canvas,onState){
  this.model=model;this.onState=onState;const original=model.getObjectByName('Web_Default_Camera');this.fpv=model.getObjectByName('FPV_Camera');this.clip=clips.find(c=>c.name==='FPV_Flight');
  if(!original?.isCamera||!this.fpv?.isCamera||!this.clip)throw new Error('场景缺少默认相机、飞行相机或 FPV_Flight 动画。');
  model.updateMatrixWorld(true);this.free=original.clone();this.free.position.set(8900,3605,2064);this.active=this.free;
  this.controls=new OrbitControls(this.free,canvas);this.controls.target.set(200,1750,-650);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.dampingFactor=.07;this.controls.minDistance=3300;this.controls.maxDistance=9300;this.controls.minPolarAngle=.22;this.controls.maxPolarAngle=1.42;this.controls.update();this.controls.saveState();
  this.mixer=new THREE.AnimationMixer(model);this.action=this.mixer.clipAction(this.clip);this.mode='free';this.paused=false;this.saved=null;
  this._buildSmoothSpline();
  this.mixer.addEventListener('finished',()=>{this._applySmoothPose(this.clip.duration,1);this.mode='ended';this.onState(this);});
 }
 _buildSmoothSpline(){
  const posTrack=this.clip.tracks.find(t=>t.name.endsWith('.position'));
  const vals=posTrack.values,M=(vals.length/3)-1,raw=[];
  for(let i=0;i<=M;i++) raw.push(new THREE.Vector3(vals[i*3],vals[i*3+1],vals[i*3+2]));
  // 1. Wide Gaussian-like multi-pass filter on the 1561 track samples to remove 12-frame altitude steps and meshopt jitter.
  let pre=raw.map(p=>p.clone());
  for(let pass=0;pass<32;pass++){
   const next=pre.map(p=>p.clone());
   for(let i=1;i<M;i++){
    next[i].x=0.25*pre[i-1].x+0.5*pre[i].x+0.25*pre[i+1].x;
    next[i].z=0.25*pre[i-1].z+0.5*pre[i].z+0.25*pre[i+1].z;
    const sy=0.25*pre[i-1].y+0.5*pre[i].y+0.25*pre[i+1].y;
    next[i].y=pass<16?Math.max(sy,raw[i].y):sy+0.35;
   }
   pre=next;
  }
  // 2. Resample along the exact same 3D curve by cumulative arc-length so drone cruising speed is 100% constant.
  const cum=[0];
  for(let i=1;i<=M;i++) cum.push(cum[i-1]+pre[i].distanceTo(pre[i-1]));
  const totalLen=cum[M];
  let pts=[];
  for(let k=0;k<=M;k++){
   const target=totalLen*(k/M);
   let lo=0,hi=M;
   while(lo<hi-1){const mid=(lo+hi)>>1;if(cum[mid]<=target)lo=mid;else hi=mid;}
   const span=Math.max(1e-6,cum[hi]-cum[lo]),f=(target-cum[lo])/span;
   pts.push(pre[lo].clone().lerp(pre[hi],f));
  }
  // 3. Final C2 smoothing pass on the arc-length-uniform points.
  for(let pass=0;pass<12;pass++){
   const next=pts.map(p=>p.clone());
   for(let i=1;i<M;i++){
    next[i].x=0.25*pts[i-1].x+0.5*pts[i].x+0.25*pts[i+1].x;
    next[i].y=0.25*pts[i-1].y+0.5*pts[i].y+0.25*pts[i+1].y+0.15;
    next[i].z=0.25*pts[i-1].z+0.5*pts[i].z+0.25*pts[i+1].z;
   }
   pts=next;
  }
  this.splinePts=pts;this.splineN=M;
  this._pos=new THREE.Vector3();this._look=new THREE.Vector3();this._tan=new THREE.Vector3();
  this._up=new THREE.Vector3();this._mat=new THREE.Matrix4();this._targetQ=new THREE.Quaternion();
  this._rollAxis=new THREE.Vector3(0,0,1);this._rollQ=new THREE.Quaternion();
  this._smoothPos=new THREE.Vector3();this._smoothQ=new THREE.Quaternion();
 }
 _sampleBSpline(u,out){
  const N=this.splineN,pts=this.splinePts;
  const s=Math.max(0,Math.min(1,u))*N,i=Math.floor(s),t=s-i;
  const p0=pts[Math.max(0,i-1)],p1=pts[Math.min(N,i)],p2=pts[Math.min(N,i+1)],p3=pts[Math.min(N,i+2)];
  const t2=t*t,t3=t2*t;
  const b0=(1-3*t+3*t2-t3)/6,b1=(4-6*t2+3*t3)/6,b2=(1+3*t+3*t2-3*t3)/6,b3=t3/6;
  out.set(
   b0*p0.x+b1*p1.x+b2*p2.x+b3*p3.x,
   b0*p0.y+b1*p1.y+b2*p2.y+b3*p3.y,
   b0*p0.z+b1*p1.z+b2*p2.z+b3*p3.z
  );
  return out;
 }
 _applySmoothPose(time,alpha=1){
  const dur=this.clip.duration,u=Math.max(0,Math.min(1,time/dur));
  this._sampleBSpline(u,this._pos);
  const du=0.07;
  if(u+du<=1){
   this._sampleBSpline(u+du,this._look);
  }else{
   this._sampleBSpline(1,this._look);
   this._sampleBSpline(1-du,this._tan);
   this._look.x+=((this._look.x-this._tan.x)*(u+du-1))/du;
   this._look.y+=((this._look.y-this._tan.y)*(u+du-1))/du;
   this._look.z+=((this._look.z-this._tan.z)*(u+du-1))/du;
  }
  const dx=this._look.x-this._pos.x,dz=this._look.z-this._pos.z;
  const horiz=Math.hypot(dx,dz);
  this._look.y=this._pos.y*0.84+this._look.y*0.16-horiz*0.15;
  // Smooth lateral curvature for natural FPV banking (zero allocation).
  const uPrev=Math.max(0,u-0.03),uNext=Math.min(1,u+0.03);
  this._sampleBSpline(uPrev,this._tan);
  const pPrevX=this._tan.x,pPrevZ=this._tan.z;
  this._sampleBSpline(uNext,this._tan);
  const pNextX=this._tan.x,pNextZ=this._tan.z;
  const v1x=this._pos.x-pPrevX,v1z=this._pos.z-pPrevZ;
  const v2x=pNextX-this._pos.x,v2z=pNextZ-this._pos.z;
  const crossY=(v1x*v2z-v1z*v2x)/Math.max(1,(v1x*v1x+v1z*v1z));
  const bankAngle=Math.max(-0.20,Math.min(0.20,-crossY*1.6))*Math.sin(u*Math.PI);
  this._up.set(0,1,0);
  this._mat.lookAt(this._pos,this._look,this._up);
  this._targetQ.setFromRotationMatrix(this._mat);
  if(Math.abs(bankAngle)>1e-4){
   this._rollQ.setFromAxisAngle(this._rollAxis,bankAngle);
   this._targetQ.multiply(this._rollQ);
  }
  if(alpha>=0.999){
   this._smoothPos.copy(this._pos);
   this._smoothQ.copy(this._targetQ);
  }else{
   this._smoothPos.lerp(this._pos,alpha);
   this._smoothQ.slerp(this._targetQ,alpha);
  }
  this.fpv.position.copy(this._smoothPos);
  this.fpv.quaternion.copy(this._smoothQ);
 }
 play(){if(this.mode==='free'){this.controls.enableDamping=false;this.controls.update();this.controls.enableDamping=true;this.saved={p:this.free.position.clone(),q:this.free.quaternion.clone(),t:this.controls.target.clone()};}this.controls.enabled=false;this.mode='flight';this.paused=false;this.active=this.fpv;this.action.reset().setLoop(THREE.LoopOnce,1);this.action.clampWhenFinished=true;this.action.play();this.mixer.update(0);this._applySmoothPose(0,1);this.onState(this);}
 pause(){if(this.mode!=='flight')return;this.paused=!this.paused;this.action.paused=this.paused;this.onState(this);}
 returnFree(){this.action.stop();this.active=this.free;this.mode='free';this.paused=false;if(this.saved){this.free.position.copy(this.saved.p);this.free.quaternion.copy(this.saved.q);this.controls.target.copy(this.saved.t);}this.controls.enabled=true;this.controls.update();this.onState(this);}
 reset(){this.returnFree();this.controls.reset();this.saved=null;}
 update(dt){if(this.mode==='flight'&&!this.paused){this.mixer.update(dt);const alpha=1-Math.exp(-dt*14);this._applySmoothPose(this.action.time,alpha);}if(this.mode==='free'){const r=this.free.position.distanceTo(this.controls.target);this.controls.maxPolarAngle=Math.min(1.42,Math.acos(Math.min(.99,1900/r)));this.controls.update();}}
 resize(width,height){for(const c of [this.free,this.fpv]){c.aspect=width/height;c.updateProjectionMatrix();}}
 seek(t){this.play();this.action.paused=false;const clamped=Math.min(t,this.clip.duration);this.mixer.setTime(clamped);this._applySmoothPose(clamped,1);this.action.paused=true;this.paused=true;this.onState(this);}
 dispose(){this.controls.dispose();this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}
