import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import WebsiteStaffTasks from './WebsiteStaffTasks.jsx';
import './style.css';
const supabase=createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
function StaffWebsitePortal(){
 const [session,setSession]=useState(null),[loading,setLoading]=useState(true);
 const [access,setAccess]=useState(null),[username,setUsername]=useState(''),[pin,setPin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s);setAccess(null)});
  return()=>subscription.unsubscribe();},[]);
 useEffect(()=>{if(!session)return;let cancelled=false;
  supabase.rpc('my_pos_access').then(({data,error:e})=>{if(cancelled)return;setAccess(e?{active:false}:data);if(e)setError(e.message)});
  return()=>{cancelled=true};},[session]);
 async function login(e){e.preventDefault();setBusy(true);setError('');
  if(!/^[a-z][a-z0-9._-]{2,31}$/.test(username.trim().toLowerCase())||!/^[0-9]{5}$/.test(pin)){setError('Use your staff username and five-digit PIN.');setBusy(false);return;}
  const {data,error:loginError}=await supabase.functions.invoke('mwisho-username-login',{body:{username:username.trim().toLowerCase(),password:pin}});
  if(loginError||data?.error){setError(data?.error||loginError?.message||'Staff login failed');}
  else{const {error:s}=await supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});if(s)setError(s.message);}
  setBusy(false);
 }
 return <main style={{maxWidth:1100,margin:'0 auto',padding:'20px'}}><header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
  <div><h1>MWISHO Tourist Hotel</h1><p>Website Staff Tasks · Taste Of Class</p></div><a href="../">Return to POS / Admin</a></header>
  {loading?<p>Loading secure staff session…</p>:!session?<form className="mw-task-card" onSubmit={login} style={{maxWidth:430}}><h2>Staff Login</h2>
   {error&&<p role="alert">{error}</p>}<label>Username<input autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label>
   <label>Five-digit PIN<input type="password" inputMode="numeric" autoComplete="current-password" minLength={5} maxLength={5} required value={pin} onChange={e=>setPin(e.target.value)}/></label>
   <button disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form>:!access?<p>Checking staff permissions…</p>:!access.active?<p role="alert">This staff account is not active. Ask management to review your account.</p>:
   <><p>Welcome, {access.name}</p><button type="button" onClick={()=>supabase.auth.signOut()}>Sign out</button><WebsiteStaffTasks supabase={supabase} userId={session.user.id} isAdmin={access.roles?.some(r=>['director_admin','central_manager'].includes(r.role))}/></>}
 </main>;
}
createRoot(document.getElementById('root')).render(<StaffWebsitePortal/>);
