import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class World3D {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas; this.hooks = hooks; this.keys = {};
    this.remotes = new Map(); this.npcs = []; this.clock = new THREE.Clock();
    this.yaw = 0.25; this.pitch = 0.42; this.distance = 8; this.drag = false; this.lastSend = 0;
    this.dt=0.016; this.loadAvatars(); this.build(); this.bindInput(); this.animate();
  }
  mat(color, roughness=0.65, metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
  box(w,h,d,mat,x,y,z,parent=this.world){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  cyl(r1,r2,h,mat,x,y,z,parent=this.world,seg=24){const m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,seg),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  build(){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x08111d);this.scene.fog=new THREE.Fog(0x08111d,75,230);
    this.camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,500);
    {const t=document.createElement('canvas');if(!(t.getContext('webgl2')||t.getContext('webgl')))throw new Error('Your browser cannot run 3D (WebGL is off). Enable hardware acceleration or try Chrome/Edge/Firefox.');}
    const lowEnd=(navigator.hardwareConcurrency||4)<=4||/Android|iPhone|iPad/i.test(navigator.userAgent);
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:!lowEnd,powerPreference:'default'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.scene.add(new THREE.HemisphereLight(0xb9dcff,0x1c2430,2.2));
    const sun=new THREE.DirectionalLight(0xffe7c4,3.4);sun.position.set(35,60,25);sun.castShadow=true;sun.shadow.mapSize.set(lowEnd?1024:2048,lowEnd?1024:2048);sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=60;sun.shadow.camera.bottom=-60;this.scene.add(sun);
    this.world=new THREE.Group();this.remoteGroup=new THREE.Group();this.npcGroup=new THREE.Group();this.world.add(this.remoteGroup,this.npcGroup);this.scene.add(this.world);
    this.buildGround();this.buildHotel();this.local=this.makeHuman(0x39c8f4,true,this.kindFor(typeof this.hooks.localId==='function'?this.hooks.localId():this.hooks.localId));this.world.add(this.local.root);this.local.root.position.set(0,0,5);
  }
  buildGround(){
    this.box(320,.35,120,this.mat(0x111b2a,.9),60,-.2,0);
    for(let x=-20;x<=160;x+=10)for(let z=-45;z<=45;z+=10)this.box(9.8,.03,9.8,this.mat(((x/10+z/10)%2)?0x202b3d:0x1b2637,.82),x,0,z).castShadow=false;
    for(let x=-15;x<=155;x+=30){const a=this.makeTree();a.position.set(x,0,-34);this.world.add(a);const b=this.makeTree();b.position.set(x+10,0,34);this.world.add(b);}
  }
  makeTree(){const g=new THREE.Group();this.cyl(.35,.5,3.2,this.mat(0x543827),0,1.6,0,g,12);const c=new THREE.Mesh(new THREE.IcosahedronGeometry(2.1,1),this.mat(0x2d7650,.92));c.position.y=3.7;c.castShadow=true;g.add(c);return g;}
  buildHotel(){
    const zones=[{name:'GRAND LOBBY',x:0,color:0x183b5b},{name:'SIGNATURE RESTAURANT',x:60,color:0x5a3324},{name:'GAME HALL',x:120,color:0x3b235b}];
    zones.forEach((z,i)=>{this.shell(z);if(i===0)this.lobby(z.x);if(i===1)this.restaurant(z.x);if(i===2)this.gamehall(z.x);});this.connector();this.npcSet();
  }
  shell(z){
    this.box(48,.45,42,this.mat(z.color,.58),z.x,.18,0);const wall=this.mat(0x26384e,.58);
    this.box(48,9,.7,wall,z.x,4.5,-21);this.box(.7,9,42,wall,z.x-24,4.5,0);this.box(.7,9,42,wall,z.x+24,4.5,0);this.box(48,9,.7,this.mat(0x1b2a3b,.6),z.x,4.5,21);
    for(let i=-18;i<=18;i+=9)this.box(6.5,4.3,.12,new THREE.MeshPhysicalMaterial({color:0x6db6d5,roughness:.1,metalness:.15,transparent:true,opacity:.38}),z.x+i,5.1,-20.55).castShadow=false;
    this.label(z.name,z.x,10.2,-20.5,10);{const zl=new THREE.PointLight(0xffe2b0,60,60,1.6);zl.position.set(z.x,8,0);this.world.add(zl);}const e=this.box(11,5.5,.5,this.mat(0x0d1724,.48,.1),z.x,2.75,-21.2);e.material.transparent=true;e.material.opacity=.2;
    for(const sx of[-5.3,5.3])this.box(.2,4.8,.2,this.mat(0x59d9ff,.25,.8),z.x+sx,2.6,-21.55);
    for(let x=-18;x<=18;x+=6){{const lm=this.mat(0xffe7a6,.35,.2);lm.emissive=new THREE.Color(0xffd98a);lm.emissiveIntensity=1.6;this.cyl(.24,.24,.08,lm,z.x+x,8.75,0);}}
  }
  lobby(x){this.box(17,1.6,3.8,this.mat(0xb9c1ca,.3,.05),x,1.25,-11);this.box(16.5,.25,.8,this.mat(0x3a7c91,.25,.45),x,2.15,-11);this.label('RECEPTION',x,4.4,-11,5.5);for(const dx of[-7,0,7])this.sofa(x+dx,0,7,dx===0?0x31506b:0x263d55);this.chandelier(x,6.7,0);this.elevator(x-17,0,10);this.stairs(x+17,0,10);this.plant(x-19,0,-15);this.plant(x+19,0,-15);}
  sofa(x,y,z,color){const g=new THREE.Group();g.position.set(x,y,z);this.world.add(g);this.box(4.8,1,1.8,this.mat(color,.82),0,1.1,0,g);this.box(4.8,1.8,.55,this.mat(color,.82),0,1.9,.65,g);this.box(.55,1.2,1.9,this.mat(color,.82),-2.15,1.35,0,g);this.box(.55,1.2,1.9,this.mat(color,.82),2.15,1.35,0,g);}
  chandelier(x,y,z){this.cyl(.08,.08,2.8,this.mat(0x6e7d8d,.35,.8),x,y+1.4,z);for(let i=0;i<6;i++){const a=i*Math.PI/3,px=x+Math.cos(a)*2.4,pz=z+Math.sin(a)*2.4;this.cyl(.12,.12,1.5,this.mat(0xd8b06b,.3,.7),px,y,pz);}}
  elevator(x,y,z){this.box(5.5,7,1.2,this.mat(0x5a6b7d,.28,.45),x,3.5,z);this.box(4.2,5.7,.12,new THREE.MeshPhysicalMaterial({color:0x17222e,metalness:.55,roughness:.18}),x,3.2,z-.65);this.label('ELEVATORS',x,7.8,z-.8,4.5);}
  stairs(x,y,z){for(let i=0;i<8;i++)this.box(1.4,.35,2.2,this.mat(0x6d7b88,.6),x,.18+i*.38,z-i*.9);this.label('STAIRS',x,4.2,z-4,4);}
  restaurant(x){this.label('KITCHEN',x,3.4,15,4);this.box(20,2,3,this.mat(0x6b4734,.5,.1),x,1,17);for(const dx of[-15,0,15])for(const dz of[-8,4])this.dining(x+dx,dz);this.bar(x+15,-15);this.plant(x-19,0,-15);this.plant(x+19,0,-15);}
  dining(x,z){this.cyl(2,2,.45,this.mat(0x7d5238,.5),x,1.1,z);for(const a of[0,Math.PI/2,Math.PI,Math.PI*1.5]){const sx=x+Math.cos(a)*2.8,sz=z+Math.sin(a)*2.8;this.box(1.2,1.3,1.2,this.mat(0x334556,.78),sx,.72,sz);}this.cyl(.55,.55,.06,this.mat(0xe6e6df,.35),x-.65,1.36,z);this.cyl(.18,.18,.28,this.mat(0x79b8d2,.22),x+.65,1.5,z);}
  bar(x,z){this.box(5.5,1.5,2.3,this.mat(0x4a3028,.45,.1),x,1.1,z);for(let i=-1;i<=1;i++)this.box(.9,1.1,.9,this.mat(0x6d8190,.7),x+i*1.8,.55,z-2);this.label('BAR',x,3.2,z,4);}
  gamehall(x){for(const dx of[-15,0,15]){this.gameTable(x+dx,-7,'TUBE');this.gameTable(x+dx,7,dx===0?'CHESS':'PUZZLE');}this.box(30,.8,6,this.mat(0x4b2c75,.55,.15),x,.4,17);this.label('TOURNAMENT STAGE',x,2.5,17,4.5);for(let dx=-10;dx<=10;dx+=5){}}
  gameTable(x,z,label){const g=new THREE.Group();g.position.set(x,0,z);this.world.add(g);this.box(6,1,3.8,this.mat(0x51392f,.52),0,1.1,0,g);this.box(5.2,.12,3.1,this.mat(label==='TUBE'?0x16485d:0x24253d,.45),0,1.66,0,g);for(const sx of[-2.2,2.2])this.box(.35,1.8,.35,this.mat(0x6b513e,.45),sx,.55,0,g);this.label(label,x,3.4,z,4);}
  connector(){for(let x=24;x<=96;x+=12){this.box(8,.35,8,this.mat(0x263448,.8),x,0,0);this.box(.5,3.5,.5,this.mat(0x596a7a,.45),x-3.5,1.75,-3.5);this.box(.5,3.5,.5,this.mat(0x596a7a,.45),x+3.5,1.75,3.5);}}
  plant(x,y,z){const g=new THREE.Group();g.position.set(x,y,z);this.world.add(g);this.cyl(.8,1,.9,this.mat(0x6a4732,.8),0,.45,0,g);for(let i=0;i<6;i++){const l=new THREE.Mesh(new THREE.SphereGeometry(.75,12,8),this.mat(0x3d8b62,.9));l.scale.set(1.2,.55,.7);const a=i*Math.PI/3;l.position.set(Math.cos(a)*.65,1.35+(i%2)*.25,Math.sin(a)*.65);l.castShadow=true;g.add(l);}}
  label(text,x,y,z,scale=6){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.font='800 42px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e9f7ff';ctx.shadowColor='#000';ctx.shadowBlur=8;ctx.fillText(text,256,64);const tex=new THREE.CanvasTexture(c);const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));s.position.set(x,y,z);s.scale.set(scale,scale*.25,1);this.world.add(s);return s;}
  buildProcedural(clothing,local=false){
    const root=new THREE.Group(),skin=this.mat(0xc98f6d,.78),skin2=this.mat(0xe0a47f,.8),hair=this.mat(0x211a18,.95),shirt=this.mat(clothing,.72),pants=this.mat(0x182536,.84),shoe=this.mat(0x11151b,.75,.05),white=this.mat(0xf0f3f4,.4),p={};
    p.hip=this.box(.75,.45,.42,pants,0,1.05,0,root);p.torso=this.box(.95,1.35,.52,shirt,0,1.78,0,root);p.neck=this.cyl(.16,.16,.24,skin2,0,2.55,0,root,16);
    p.head=new THREE.Mesh(new THREE.SphereGeometry(.48,24,18),skin2);p.head.position.y=3.05;p.head.castShadow=true;root.add(p.head);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.5,24,12,0,Math.PI*2,0,Math.PI*.48),hair);cap.position.y=3.22;cap.castShadow=true;root.add(cap);
    p.eyeL=this.eye(-.17,3.09,.43,root,white);p.eyeR=this.eye(.17,3.09,.43,root,white);this.box(.14,.035,.02,this.mat(0x6b3030,.8),0,2.87,.46,root);
    p.armL=this.limb(.16,.9,skin,-.67,1.92,0,root);p.armR=this.limb(.16,.9,skin,.67,1.92,0,root);p.handL=this.cyl(.15,.13,.28,skin2,-.67,1.36,0,root,16);p.handR=this.cyl(.15,.13,.28,skin2,.67,1.36,0,root,16);
    p.legL=this.limb(.19,1,pants,-.27,.55,0,root);p.legR=this.limb(.19,1,pants,.27,.55,0,root);p.footL=this.box(.34,.18,.65,shoe,-.27,.08,.16,root);p.footR=this.box(.34,.18,.65,shoe,.27,.08,.16,root);
    if(local){const ring=new THREE.Mesh(new THREE.TorusGeometry(.82,.035,8,36),new THREE.MeshBasicMaterial({color:0x53e4ff}));ring.rotation.x=Math.PI/2;ring.position.y=.04;root.add(ring);p.ring=ring;}
    return {root,parts:p,speed:0,phase:Math.random()*6.28};
  }
  /* ---- Real rigged human avatars (GLB, Mixamo rig) ---- */
  loadAvatars(){
    const loader=new GLTFLoader(),base=(import.meta.env&&import.meta.env.BASE_URL)||'/';
    const load=f=>new Promise((res,rej)=>loader.load(base+'models/'+f,res,undefined,rej));
    this.avatars=Promise.all([load('Michelle.glb'),load('Soldier.glb')]).then(([m,s])=>{
      // Same Mixamo skeleton: share one set of body animations; keep rotations only so scale differences can't distort the body.
      const prep=(g,n)=>{const c=g.animations.find(a=>a.name===n).clone();c.tracks=c.tracks.filter(t=>!/\.(position|scale)$/.test(t.name));c.resetDuration();return c;};
      const clips={idle:prep(s,'Idle'),walk:prep(s,'Walk'),run:prep(s,'Run'),dance:prep(m,'SambaDance')};
      const kinds={};
      for(const [k,g] of [['michelle',m],['vanguard',s]]){
        g.scene.updateMatrixWorld(true);
        let lo=Infinity,hi=-Infinity;const v=new THREE.Vector3();
        g.scene.traverse(o=>{if(o.isBone){o.getWorldPosition(v);lo=Math.min(lo,v.y);hi=Math.max(hi,v.y);}});
        if(!(hi-lo>0.01)){const b=new THREE.Box3().setFromObject(g.scene);lo=b.min.y;hi=b.max.y;}
        kinds[k]={scene:g.scene,minY:lo,height:Math.max(0.01,(hi-lo)*1.02)};
      }
      return {clips,kinds};
    });
    this.avatars.catch(e=>console.error('[avatars] falling back to simple figures:',e));
  }
  kindFor(id){let n=0;for(const ch of String(id||'')){n=(n*31+ch.charCodeAt(0))>>>0;}return (n%10<7)?'michelle':'vanguard';}
  makeHuman(clothing,local=false,kind='michelle'){
    const root=new THREE.Group(),h={root,parts:{},speed:0,phase:Math.random()*6.28,mixer:null,actions:null,state:null,dancing:0,kind};
    if(local){const ring=new THREE.Mesh(new THREE.TorusGeometry(.82,.035,8,36),new THREE.MeshBasicMaterial({color:0x53e4ff}));ring.rotation.x=Math.PI/2;ring.position.y=.04;root.add(ring);h.parts.ring=ring;}
    this.avatars.then(a=>this.dress(h,a,kind)).catch(()=>{if(h.mixer||h.parts.armL)return;const f=this.buildProcedural(clothing,false);while(f.root.children.length)root.add(f.root.children[0]);Object.assign(h.parts,f.parts);});
    return h;
  }
  dress(h,a,kind){
    const k=a.kinds[kind]||a.kinds.michelle,model=cloneSkinned(k.scene);
    const target=3.3*(0.95+Math.random()*0.1),s=target/k.height;
    model.scale.setScalar(s);model.position.y=-k.minY*s;
    const shade=kind==='michelle'?0.82+Math.random()*0.18:1;
    model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;if(o.material){o.material=o.material.clone();if(o.material.color&&kind==='michelle')o.material.color.setScalar(shade);}}});
    h.root.add(model);h.model=model;h.height=target;
    h.mixer=new THREE.AnimationMixer(model);
    h.actions={};for(const n of Object.keys(a.clips))h.actions[n]=h.mixer.clipAction(a.clips[n]);
    h.actions.idle.time=h.phase;h.actions.idle.play();h.state='idle';h.mixer.update(0);
  }
  eye(x,y,z,parent,mat){const e=new THREE.Mesh(new THREE.SphereGeometry(.075,12,8),mat);e.position.set(x,y,z);parent.add(e);const q=new THREE.Mesh(new THREE.SphereGeometry(.032,10,8),this.mat(0x17202a,.7));q.position.set(x,y,z+.065);parent.add(q);return e;}
  limb(r,l,mat,x,y,z,parent){const m=new THREE.Mesh(new THREE.CapsuleGeometry(r,l,6,12),mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;}
  npcSet(){
    const data=[[-7,-7,'Receptionist',0x2f77b2],[7,-7,'Receptionist',0x7a3f9e],[-10,8,'Guest',0xd18a3a],[10,8,'Security',0x40536a],[48,-7,'Waiter',0x9b3f3f],[72,-7,'Waiter',0x2f6d9b],[51,7,'Guest',0xd18a3a],[69,7,'Chef',0xeeeeee],[108,-7,'Host',0x7040a8],[132,-7,'Host',0x2d6b9b],[112,7,'Guest',0xc45a67],[128,7,'Guest',0x3e9c78]];
    data.forEach(d=>{const h=this.makeHuman(d[3],false,d[2]==='Security'?'vanguard':'michelle');h.role=d[2];h.root.position.set(d[0],0,d[1]);h.target=h.root.position.clone();h.zone=d[0]<24?'lobby':d[0]<96?'restaurant':'gamehall';h.wait=Math.random()*2;this.npcGroup.add(h.root);this.npcs.push(h);this.label(d[2],d[0],4,d[1],3.6);});
  }
  addRemote(p){const id=typeof this.hooks.localId==='function'?this.hooks.localId():this.hooks.localId;if(!p?.id||p.id===id||this.remotes.has(p.id))return;const h=this.makeHuman(0xc7834b,false,this.kindFor(p.id));h.root.position.set(Number(p.x)||0,0,Number(p.z)||0);h.target=h.root.position.clone();h.name=p.u||'Player';this.remoteGroup.add(h.root);this.remotes.set(p.id,h);this.hooks.onPlayersChanged?.(this.remotes);}
  updateRemote(p){const h=this.remotes.get(p.id);if(!h)return;h.target.set(Number(p.x)||0,Number(p.y)||0,Number(p.z)||0);h.root.userData.ry=Number(p.ry)||0;h.speed=p.a==='walk'?1:0;}
  removeRemote(id){const h=this.remotes.get(id);if(!h)return;h.root.parent?.remove(h.root);this.remotes.delete(id);this.hooks.onPlayersChanged?.(this.remotes);}
  setRemotePlayers(list){const ids=new Set((list||[]).map(p=>p.id));[...this.remotes.keys()].forEach(id=>{if(!ids.has(id))this.removeRemote(id);});(list||[]).forEach(p=>{if(!this.remotes.has(p.id))this.addRemote(p);this.updateRemote(p);});}
  setZone(zone,x,y,z){this.zone=zone;if(Number.isFinite(x))this.local.root.position.set(x,y||0,z||0);}
  bindInput(){
    addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;this.keys[e.key.toLowerCase()]=true;if(e.key.toLowerCase()==='e')this.hooks.onEmote?.('wave');});
    addEventListener('keyup',e=>{this.keys[e.key.toLowerCase()]=false;});addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);});
    this.canvas.addEventListener('pointerdown',e=>{if(e.button===0){this.drag=true;this.px=e.clientX;this.py=e.clientY;}});addEventListener('pointerup',()=>this.drag=false);
    addEventListener('pointermove',e=>{if(!this.drag)return;this.yaw-=(e.clientX-this.px)*.006;this.pitch=clamp(this.pitch-(e.clientY-this.py)*.004,.15,1);this.px=e.clientX;this.py=e.clientY;});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.distance=clamp(this.distance+e.deltaY*.008,4.5,13);},{passive:false});
  }
  move(dt){const dx=(this.keys.d||this.keys.arrowright?1:0)-(this.keys.a||this.keys.arrowleft?1:0),dz=(this.keys.s||this.keys.arrowdown?1:0)-(this.keys.w||this.keys.arrowup?1:0),v=new THREE.Vector3(dx,0,dz);if(!v.lengthSq()){this.local.speed=0;return;}v.normalize();const speed=this.keys.shift?8:4.5,next=this.local.root.position.clone().addScaledVector(v,speed*dt);next.x=clamp(next.x,-21,141);next.z=clamp(next.z,-18.5,18.5);this.local.root.position.copy(next);this.local.root.rotation.y=Math.atan2(v.x,v.z);this.local.speed=speed;const now=performance.now();if(now-this.lastSend>80){this.lastSend=now;this.hooks.onMove?.({x:next.x,y:0,z:next.z,ry:this.local.root.rotation.y,a:'walk'});}}
  animateHuman(h){
    if(h.mixer){
      let st='idle',ts=1;const H=h.height||3.3;
      if(h.dancing&&performance.now()<h.dancing)st='dance';else h.dancing=0;
      if(st==='idle'&&h.speed>.25){
        if(h.speed>6){st='run';ts=clamp(h.speed/(H*1.7),.6,2);}
        else{st='walk';const units=h.role?1.25:(h===this.local?h.speed:4.5);ts=clamp(units/(H*.78),.4,2);}
      }
      if(st!==h.state){const n=h.actions[st],o=h.actions[h.state];n.reset().fadeIn(.25).play();if(o)o.fadeOut(.25);h.state=st;}
      h.actions[st].timeScale=ts;
      h.mixer.update(this.dt||.016);
    }else if(h.parts.armL){
      const t=this.clock.elapsedTime*8+h.phase,m=h.speed>.25,s=m?Math.sin(t)*.48:Math.sin(this.clock.elapsedTime*1.6+h.phase)*.025;h.parts.armL.rotation.z=-s;h.parts.armR.rotation.z=s;h.parts.legL.rotation.x=s*.55;h.parts.legR.rotation.x=-s*.55;h.parts.head.rotation.y=m?Math.sin(this.clock.elapsedTime*1.1+h.phase)*.05:Math.sin(this.clock.elapsedTime*.7+h.phase)*.12;
    }
    if(h.parts.ring)h.parts.ring.rotation.z+=.015;
  }
  animateNpcs(dt){for(const n of this.npcs){n.wait-=dt;const dx=n.target.x-n.root.position.x,dz=n.target.z-n.root.position.z;if(Math.hypot(dx,dz)<.7||n.wait<=0){const cx=n.zone==='lobby'?0:n.zone==='restaurant'?60:120;n.target.set(cx+(Math.random()-.5)*32,0,(Math.random()-.5)*26);n.wait=2+Math.random()*4;}else{const v=new THREE.Vector3(dx,0,dz).normalize();n.root.position.addScaledVector(v,dt*1.25);n.root.rotation.y=Math.atan2(v.x,v.z);n.speed=1;}if(n.role==='Receptionist'||n.role==='Chef')n.speed=0;this.animateHuman(n);}}
  cameraFollow(dt){const p=this.local.root.position,h=Math.cos(this.pitch)*this.distance,d=new THREE.Vector3(p.x-Math.sin(this.yaw)*h,p.y+2.3+Math.sin(this.pitch)*this.distance,p.z-Math.cos(this.yaw)*h);this.camera.position.lerp(d,1-Math.pow(.001,dt));this.camera.lookAt(p.x,p.y+1.5,p.z);}
  animate(){requestAnimationFrame(()=>this.animate());try{this.frame();}catch(e){if(!this.failed){this.failed=true;this.hooks.onFatal?.(e);}}}
  frame(){const dt=Math.min(this.clock.getDelta(),.05);this.dt=dt;this.move(dt);this.animateHuman(this.local);this.remotes.forEach(h=>{const b=h.root.position.clone();h.root.position.lerp(h.target,Math.min(1,dt*10));h.speed=h.root.position.distanceTo(b)>.001?1:0;if(Number.isFinite(h.root.userData.ry))h.root.rotation.y=h.root.userData.ry;this.animateHuman(h);});this.animateNpcs(dt);this.cameraFollow(dt);this.renderer.render(this.scene,this.camera);}
  correct(p){if(p)this.local.root.position.set(Number(p.x)||0,Number(p.y)||0,Number(p.z)||0);}
  emote(name){if(name!=='wave')return;this.local.dancing=performance.now()+3500;}
}
