const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const PASSWORD_MIN = 10;
const ITERATIONS = 210000;
const SESSION_DAYS = 30;
const DATA_KEYS = new Set([
  'gb27logs','gb27cfg','gb27plans','gb27rec','gb27prof','gb27well','gb27wellDays',
  'gb27races','gb27foods','gb27mealprefs','gb27custommeals','gb27mealvariants',
  'gb27deletedMeals','gb27sessions'
]);

function json(data, status=200, headers={}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', ...headers } });
}
function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.PERFMASTER_ORIGIN || '').split(',').map(x=>x.trim()).filter(Boolean);
  const h = { 'access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers':'Content-Type,Authorization', 'access-control-max-age':'86400', 'vary':'Origin' };
  if (allowed.includes(origin)) h['access-control-allow-origin'] = origin;
  return h;
}
function b64(bytes) { let s=''; for (const b of new Uint8Array(bytes)) s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function unb64(s) { const x=s.replace(/-/g,'+').replace(/_/g,'/'); const raw=atob(x+'='.repeat((4-x.length%4)%4)); return Uint8Array.from(raw,c=>c.charCodeAt(0)); }
async function digest(text) { return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
async function passwordHash(password, salt, iterations=ITERATIONS) {
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations,hash:'SHA-256'},material,256);
  return b64(bits);
}
function randomId(bytes=24) { const a=new Uint8Array(bytes); crypto.getRandomValues(a); return b64(a); }
async function body(request, max=1_500_000) { const text=await request.text(); if(text.length>max) throw new Error('Payload trop volumineux'); try{return JSON.parse(text)}catch{return null} }
function getDb(env) { const db=env.PERFMASTER_DB; if(!db) throw new Error('Binding D1 PERFMASTER_DB absent.'); return db; }
async function authUser(request, env) {
  const header=request.headers.get('Authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token) return null;
  const hash=await digest(token), db=getDb(env);
  const row=await db.prepare(`SELECT u.id,u.username,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND u.disabled=0`).bind(hash).first();
  if(!row || Date.parse(row.expires_at)<=Date.now()) return null;
  await db.prepare(`UPDATE sessions SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash=?`).bind(hash).run();
  return row;
}
async function issueSession(db,userId) {
  const token=randomId(32), hash=await digest(token), expires=new Date(Date.now()+SESSION_DAYS*86400000).toISOString();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(hash,userId,expires).run();
  return {token,expiresAt:expires};
}
async function loginThrottle(db,key) {
  const now=Math.floor(Date.now()/1000), row=await db.prepare('SELECT attempts,window_started_at,blocked_until FROM login_attempts WHERE attempt_key=?').bind(key).first();
  if(row && row.blocked_until>now) return true;
  if(!row || now-row.window_started_at>900) await db.prepare('INSERT INTO login_attempts(attempt_key,attempts,window_started_at,blocked_until) VALUES(?,0,?,0) ON CONFLICT(attempt_key) DO UPDATE SET attempts=0,window_started_at=excluded.window_started_at,blocked_until=0').bind(key,now).run();
  return false;
}
async function failedLogin(db,key) {
  const now=Math.floor(Date.now()/1000);
  await db.prepare('INSERT INTO login_attempts(attempt_key,attempts,window_started_at,blocked_until) VALUES(?,?,?,?) ON CONFLICT(attempt_key) DO UPDATE SET attempts=attempts+1,blocked_until=CASE WHEN attempts+1>=8 THEN ? ELSE blocked_until END')
    .bind(key,1,now,0,now+900).run();
}
async function authRoute(request, env, mode) {
  const data=await body(request,10000); if(!data) return json({error:'Corps JSON invalide'},400);
  const username=String(data.username||'').trim().toLowerCase(), password=String(data.password||'');
  if(!USERNAME_RE.test(username)) return json({error:'Nom d’utilisateur : 3 à 32 caractères (a-z, 0-9, point, tiret, souligné).'},400);
  if(password.length<PASSWORD_MIN || password.length>256) return json({error:`Mot de passe : ${PASSWORD_MIN} caractères minimum.`},400);
  const db=getDb(env), ip=request.headers.get('CF-Connecting-IP')||'unknown', throttleKey=await digest(ip+'|'+username);
  if(await loginThrottle(db,throttleKey)) return json({error:'Trop de tentatives. Réessayez dans 15 minutes.'},429);
  let user;
  if(mode==='register') {
    const salt=randomId(16), hash=await passwordHash(password,salt);
    const id=randomId(18);
    try {
      await db.prepare('INSERT INTO users(id,username,password_salt,password_hash,password_iterations) VALUES(?,?,?,?,?)').bind(id,username,salt,hash,ITERATIONS).run();
      user={id,username};
    } catch(e) { if(String(e).toLowerCase().includes('unique')) return json({error:'Ce nom d’utilisateur existe déjà.'},409); throw e; }
  } else {
    user=await db.prepare('SELECT id,username,password_salt,password_hash,password_iterations FROM users WHERE username=? COLLATE NOCASE AND disabled=0').bind(username).first();
    const valid=user && await passwordHash(password,user.password_salt,user.password_iterations)===user.password_hash;
    if(!valid) { await failedLogin(db,throttleKey); return json({error:'Identifiants incorrects.'},401); }
  }
  await db.prepare('DELETE FROM login_attempts WHERE attempt_key=?').bind(throttleKey).run();
  const session=await issueSession(db,user.id);
  return json({token:session.token,expiresAt:session.expiresAt,user:{id:user.id,username:user.username}});
}
async function dataGet(user,env) {
  const rows=await getDb(env).prepare('SELECT data_key,data_json,revision,updated_at FROM user_data WHERE user_id=?').bind(user.id).all();
  const data={}; for(const r of rows.results||[]) data[r.data_key]=JSON.parse(r.data_json);
  return json({data,updatedAt:rows.results?.reduce((m,r)=>r.updated_at>m?r.updated_at:m,'')||null});
}
async function dataPut(request,user,env) {
  const payload=await body(request); if(!payload || !payload.data || typeof payload.data!=='object' || Array.isArray(payload.data)) return json({error:'Objet data requis'},400);
  const entries=Object.entries(payload.data); if(entries.length>DATA_KEYS.size) return json({error:'Trop de clés'},400);
  const statements=[];
  for(const [key,value] of entries) {
    if(!DATA_KEYS.has(key)) return json({error:`Clé non autorisée: ${key}`},400);
    const serialized=JSON.stringify(value); if(serialized===undefined || serialized.length>800000) return json({error:`Donnée trop volumineuse: ${key}`},413);
    statements.push(getDb(env).prepare(`INSERT INTO user_data(user_id,data_key,data_json,revision,updated_at) VALUES(?,?,?,1,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(user_id,data_key) DO UPDATE SET data_json=excluded.data_json,revision=user_data.revision+1,updated_at=excluded.updated_at`).bind(user.id,key,serialized));
  }
  if(statements.length) await getDb(env).batch(statements);
  return json({ok:true,keys:entries.length,savedAt:new Date().toISOString()});
}
async function pushSubscribe(request,user,env) {
  const p=await body(request,30000); if(!p?.endpoint || !p?.keys?.p256dh || !p?.keys?.auth) return json({error:'Abonnement push invalide'},400);
  if(!/^https:\/\//.test(p.endpoint)) return json({error:'Endpoint invalide'},400);
  const db=getDb(env), id=randomId(18);
  await db.prepare(`INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth_secret,user_agent) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth_secret=excluded.auth_secret,user_agent=excluded.user_agent,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .bind(id,user.id,p.endpoint,p.keys.p256dh,p.keys.auth,(request.headers.get('User-Agent')||'').slice(0,300)).run();
  return json({ok:true});
}
export default {
 async fetch(request,env) {
  const headers=cors(request,env);
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  const url=new URL(request.url), path=url.pathname.replace(/\/+$/,'')||'/';
  try {
   if(path==='/health' && request.method==='GET') return json({ok:true,service:'PERFMASTER API',database:!!env.PERFMASTER_DB},200,headers);
   if(path==='/api/auth/register' && request.method==='POST') return authRoute(request,env,'register').then(r=>withHeaders(r,headers));
   if(path==='/api/auth/login' && request.method==='POST') return authRoute(request,env,'login').then(r=>withHeaders(r,headers));
   if(path==='/api/auth/logout' && request.method==='POST') { const u=await authUser(request,env); if(!u)return json({error:'Non authentifié'},401,headers); const token=request.headers.get('Authorization').slice(7); await getDb(env).prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(token)).run(); return json({ok:true},200,headers); }
   if(path.startsWith('/api/')) {
    const user=await authUser(request,env); if(!user)return json({error:'Session expirée ou invalide'},401,headers);
    if(path==='/api/me' && request.method==='GET') return json({user:{id:user.id,username:user.username}},200,headers);
    if(path==='/api/data' && request.method==='GET') return dataGet(user,env).then(r=>withHeaders(r,headers));
    if(path==='/api/data' && request.method==='PUT') return dataPut(request,user,env).then(r=>withHeaders(r,headers));
    if(path==='/api/push/subscribe' && request.method==='POST') return pushSubscribe(request,user,env).then(r=>withHeaders(r,headers));
    if(path==='/api/push/subscribe' && request.method==='DELETE') { const p=await body(request,30000); if(!p?.endpoint)return json({error:'Endpoint requis'},400,headers); await getDb(env).prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').bind(user.id,p.endpoint).run(); return json({ok:true},200,headers); }
   }
   return json({error:'Route introuvable'},404,headers);
  } catch(e) { console.error('PERFMASTER API error',e); return json({error:'Erreur serveur',detail:env.ENVIRONMENT==='development'?String(e.message):undefined},500,headers); }
 }
};
function withHeaders(response, headers) { const h=new Headers(response.headers); for(const [k,v] of Object.entries(headers))h.set(k,v); return new Response(response.body,{status:response.status,headers:h}); }
