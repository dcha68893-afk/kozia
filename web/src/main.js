import * as THREE from 'three';
import './style.css';

const API = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
const WS = import.meta.env.VITE_WS_BASE || API.replace(/^http/, 'ws');
const state = { token: localStorage.getItem('necpra_token') || '', user: null, ws: null, zone: 'lobby', players: new Map(), keys: {}, selectedGame: null, match: null };

const app = document.querySelector('#app');
app.innerHTML = `
  <div id="boot"><div class="logo">N</div><h1>NECPRA WORLD</h1><p>Loading world…</p></div>
  <main id="shell" class="hidden">
    <canvas id="world"></canvas>
    <header class="topbar">
      <div class="brand"><b>NECPRA</b><span>WORLD</span></div>
      <div class="zone-tabs">
        <button data-zone="lobby">Lobby</button><button data-zone="restaurant">Restaurant</button><button data-zone="gamehall">Game Hall</button>
      </div>
      <div class="wallet"><span id="coins">0</span> coins · <span id="xp">0</span> XP</div>
    </header>
    <aside class="panel left">
      <h2>World</h2><div id="playerList"></div>
      <div class="hint">WASD / arrows to move · Shift to run · E to emote</div>
    </aside>
    <aside class="panel right">
      <h2>Game Hall</h2><div id="games"></div>
    </aside>
    <section class="chat panel">
      <div id="chatLog"></div>
      <form id="chatForm"><input id="chatInput" maxlength="180" placeholder="Say something…"><button>Send</button></form>
    </section>
    <section id="gameOverlay" class="overlay hidden"></section>
  </main>
  <section id="auth" class="auth">
    <div class="auth-card">
      <div class="logo">N</div><h1>NECPRA WORLD</h1><p>Enter the hotel. Meet players. Play together.</p>
      <div class="tabs"><button id="loginTab" class="active">Login</button><button id="registerTab">Create account</button></div>
      <form id="authForm">
        <input id="login" placeholder="Username or email" autocomplete="username">
        <input id="email" class="hidden" placeholder="Email" type="email" autocomplete="email">
        <input id="password" placeholder="Password" type="password" autocomplete="current-password">
        <input id="username" class="hidden" placeholder="Username (3–20 characters)" autocomplete="nickname">
        <button class="primary">Enter World</button><div id="authError" class="error"></div>
      </form>
      <small>Local test client · server-authoritative multiplayer</small>
    </div>
  </section>`;

const $ = id => document.getElementById(id);
let registerMode = false;
$('loginTab').onclick = () => { registerMode=false; toggleAuth(); };
$('registerTab').onclick = () => { registerMode=true; toggleAuth(); };
function toggleAuth(){ $('loginTab').classList.toggle('active',!registerMode); $('registerTab').classList.toggle('active',registerMode); $('login').classList.toggle('hidden',registerMode); $('email').classList.toggle('hidden',!registerMode); $('username').classList.toggle('hidden',!registerMode); $('authForm .primary').textContent=registerMode?'Create & Enter':'Enter World'; }
$('authForm').onsubmit = async e => { e.preventDefault(); $('authError').textContent=''; try {
  const body = registerMode ? {username:$('username').value.trim(),email:$('email').value.trim(),password:$('password').value} : {login:$('login').value.trim(),password:$('password').value};
  const r=await fetch(API+'/api/auth/'+(registerMode?'register':'login'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json(); if(!r.ok) throw new Error(j.error||'Authentication failed');
  state.token=j.token; state.user=j.user; localStorage.setItem('necpra_token',state.token); startWorld();
} catch(e){ $('authError').textContent=e.message; } };

function startWorld(){
  $('auth').classList.add('hidden'); $('shell').classList.remove('hidden'); $('boot').classList.add('hidden');
  $('coins').textContent=state.user?.coins??0; $('xp').textContent=state.user?.xp??0;
  buildWorld(); connectWS(); loadGames();
}
async function loadGames(){
  try { const r=await fetch(API+'/api/games/catalog'); const j=await r.json(); $('games').innerHTML=j.games.map(g=>`<button class="game" data-game="${g.id}"><b>${g.name}</b><small>${g.players} players</small></button>`).join(''); document.querySelectorAll('.game').forEach(b=>b.onclick=()=>gameMenu(b.dataset.game)); } catch {}
}
function send(t,d={}){ if(state.ws?.readyState===WebSocket.OPEN) state.ws.send(JSON.stringify({t,d})); }
function connectWS(){
  if(!state.token) return;
  state.ws=new WebSocket(WS+'/ws?token='+encodeURIComponent(state.token));
  state.ws.onopen=()=>send('world.join',{zone:state.zone});
  state.ws.onclose=()=>setTimeout(connectWS,2000);
  state.ws.onmessage=e=>{ try{ const m=JSON.parse(e.data); handleWS(m.t,m.d); }catch{} };
}
function handleWS(t,d){
  if(t==='hello'&&d?.user){ state.user=d.user; updateStats(); }
  if(t==='world.joined'){ state.zone=d.zone; state.players.clear(); (d.players||[]).forEach(addRemote); }
  if(t==='world.enter') addRemote(d);
  if(t==='world.leave'){ state.players.delete(d.id); refreshPlayers(); }
  if(t==='world.state'){ (d.p||[]).forEach(p=>{ if(p.id===state.user?.id)return; const q=state.players.get(p.id); if(q){q.target.set(p.x,p.y,p.z);q.mesh.rotation.y=p.ry||0;} }); }
  if(t==='world.correct') player.position.set(d.x,d.y,d.z);
  if(t==='chat.zone') addChat(d.from,d.text);
  if(t==='world.emote') addChat('★ '+(d.id===state.user?.id?'You':'Player'), 'performed '+d.e);
  if(t==='room.invited') addChat('INVITE','Room '+d.code+' from '+d.from);
  if(t==='game.match.joined'){ state.match=d; renderMatch(); }
  if(t==='game.match.state'||t==='game.match.action'||t==='game.match.finished'){ state.match=d; renderMatch(); }
  if(t==='game.match.left'){ state.match=null; $('gameOverlay').classList.add('hidden'); }
  if(t==='error') addChat('SERVER',d?.message||'Error');
}
function updateStats(){ $('coins').textContent=state.user?.coins??0; $('xp').textContent=state.user?.xp??0; }

function addChat(from,text){ const row=document.createElement('div'); row.innerHTML='<b>'+escapeHtml(from)+'</b> '+escapeHtml(text); $('chatLog').appendChild(row); $('chatLog').scrollTop=$('chatLog').scrollHeight; }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
$('chatForm').onsubmit=e=>{e.preventDefault();const text=$('chatInput').value.trim();if(text){send('chat.zone',{text});$('chatInput').value='';}};

document.querySelectorAll('[data-zone]').forEach(b=>b.onclick=()=>{ state.zone=b.dataset.zone; send('world.join',{zone:state.zone}); });
window.addEventListener('keydown',e=>{ state.keys[e.key.toLowerCase()]=true; if(e.key.toLowerCase()==='e') send('world.emote',{e:'wave'}); });
window.addEventListener('keyup',e=>state.keys[e.key.toLowerCase()]=false);

let scene,camera,renderer,player,clock,remoteGroup;
function buildWorld(){
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x07111e); scene.fog=new THREE.Fog(0x07111e,70,220);
  camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,500); renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true;
  scene.add(new THREE.HemisphereLight(0xaad7ff,0x162033,2)); const sun=new THREE.DirectionalLight(0xffe4bd,3);sun.position.set(30,50,20);sun.castShadow=true;scene.add(sun);
  remoteGroup=new THREE.Group();scene.add(remoteGroup);
  makeHotel(); player=makeAvatar(0x4ce1ff,true); scene.add(player); player.position.set(0,0,0); clock=new THREE.Clock(); animate();
}
function makeHotel(){
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(300,180),new THREE.MeshStandardMaterial({color:0x17253a,roughness:.78}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  const zones=[['LOBBY',0,0,0x19395a],['RESTAURANT',60,0,0x4a2d22],['GAME HALL',120,0,0x3c2459]];
  zones.forEach(([name,x,z,color])=>{const room=new THREE.Mesh(new THREE.BoxGeometry(46,8,38),new THREE.MeshStandardMaterial({color,roughness:.7,metalness:.1,transparent:true,opacity:.82}));room.position.set(x,4,z);room.castShadow=true;room.receiveShadow=true;scene.add(room); addLabel(name,x,9,z);});
  for(let x=-30;x<=150;x+=10){const p=new THREE.Mesh(new THREE.BoxGeometry(.3,.04,150),new THREE.MeshStandardMaterial({color:0x2e415b}));p.position.set(x,.02,0);scene.add(p);}
  const fountain=new THREE.Mesh(new THREE.CylinderGeometry(5,6,.7,32),new THREE.MeshStandardMaterial({color:0x66d9ff,metalness:.3,roughness:.2}));fountain.position.y=.35;scene.add(fountain);
}
function addLabel(text,x,y,z){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#dff6ff';ctx.font='bold 46px Arial';ctx.textAlign='center';ctx.fillText(text,256,72);const tex=new THREE.CanvasTexture(c);const m=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true}));m.position.set(x,y,z);m.scale.set(16,4,1);scene.add(m);}
function makeAvatar(color,local=false){
  const g=new THREE.Group(); const mat=new THREE.MeshStandardMaterial({color,roughness:.7});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.55,1.15,6,12),mat);body.position.y=1.25;body.castShadow=true;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.48,16,12),new THREE.MeshStandardMaterial({color:0xf0b58c,roughness:.8}));head.position.y=2.3;head.castShadow=true;g.add(head);
  const legMat=new THREE.MeshStandardMaterial({color:0x182238}); for(const x of[-.23,.23]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.17,.85,5,8),legMat);leg.position.set(x,.48,0);leg.castShadow=true;g.add(leg);}
  if(local){const ring=new THREE.Mesh(new THREE.TorusGeometry(.72,.035,8,32),new THREE.MeshBasicMaterial({color:0x5be7ff}));ring.rotation.x=Math.PI/2;ring.position.y=.05;g.add(ring);}
  return g;
}
function addRemote(p){ if(!p?.id||p.id===state.user?.id)return; if(state.players.has(p.id))return; const mesh=makeAvatar(0xffb454);mesh.position.set(p.x,p.y,p.z);scene?.add(mesh);state.players.set(p.id,{mesh,target:new THREE.Vector3(p.x,p.y,p.z),name:p.u});refreshPlayers(); }
function refreshPlayers(){ $('playerList').innerHTML=[...state.players.values()].map(p=>'<div class="player">● '+escapeHtml(p.name||'Player')+'</div>').join('')||'<div class="muted">No other players in this zone</div>'; }

function movePlayer(dt){
  if(!player)return; const v=new THREE.Vector3((state.keys.d||state.keys.arrowright?1:0)-(state.keys.a||state.keys.arrowleft?1:0),0,(state.keys.s||state.keys.arrowdown?1:0)-(state.keys.w||state.keys.arrowup?1:0)); if(v.lengthSq()){v.normalize();const speed=state.keys.shift?8:4;player.position.addScaledVector(v,speed*dt);player.position.x=THREE.MathUtils.clamp(player.position.x,-22,144);player.position.z=THREE.MathUtils.clamp(player.position.z,-22,22);player.rotation.y=Math.atan2(v.x,v.z);send('world.move',{x:player.position.x,y:0,z:player.position.z,ry:player.rotation.y,a:'walk'});} }
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05);movePlayer(dt);for(const p of state.players.values())p.mesh.position.lerp(p.target,Math.min(1,dt*10));if(player){const desired=new THREE.Vector3(player.position.x,player.position.y+6,player.position.z+9);camera.position.lerp(desired,.09);camera.lookAt(player.position.x,1,player.position.z);}renderer.render(scene,camera);}
window.onresize=()=>{if(camera&&renderer){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}};

function gameMenu(gameId){
  state.selectedGame=gameId;
  $('gameOverlay').classList.remove('hidden');
  $('gameOverlay').innerHTML=`<div class="game-card"><button class="close" id="closeGame">×</button><h2>${gameId.replaceAll('-',' ').toUpperCase()}</h2><p>Server-authoritative multiplayer match</p><div class="game-actions"><button id="createMatch" class="primary">Create match</button><button id="joinMatch">Join by code</button></div><div id="gameStatus"></div></div>`;
  $('closeGame').onclick=()=>$('gameOverlay').classList.add('hidden');
  $('createMatch').onclick=()=>send('game.match.create',{gameId});
  $('joinMatch').onclick=()=>{const code=prompt('Enter match code');if(code)send('game.match.join',{code});};
}
function renderMatch(){
  const o=$('gameOverlay');o.classList.remove('hidden');const m=state.match||{};const players=m.players||m.game?.players||[];
  o.innerHTML=`<div class="game-card"><button class="close" id="leaveMatch">×</button><h2>${(m.gameId||state.selectedGame||'MATCH').replaceAll('-',' ').toUpperCase()}</h2><div class="code">CODE: <b>${m.code||'—'}</b></div><p>Status: ${m.status||'waiting'}</p><div class="scoreboard">${players.map(p=>`<div><b>${escapeHtml(p.username||p.u||'Player')}</b><span>${p.score??0} pts</span></div>`).join('')}</div><div class="match-actions"><button id="ready">READY</button><button id="start">START</button></div><div class="hint">For the first browser slice, the authoritative match connection, lobby, scoreboard and server events are live. Game-specific controls are being expanded on top of this protocol.</div></div>`;
  $('leaveMatch').onclick=()=>send('game.match.leave'); $('ready').onclick=()=>send('game.match.ready'); $('start').onclick=()=>send('game.match.start');
}
if(state.token) { fetch(API+'/api/auth/me',{headers:{authorization:'Bearer '+state.token}}).then(r=>r.ok?r.json():Promise.reject()).then(j=>{state.user=j.user;startWorld();}).catch(()=>{localStorage.removeItem('necpra_token');state.token='';$('boot').classList.add('hidden');}); } else $('boot').classList.add('hidden');
