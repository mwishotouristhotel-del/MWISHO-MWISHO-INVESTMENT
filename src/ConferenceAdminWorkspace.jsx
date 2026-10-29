import React,{useState} from 'react';
import WebsiteConferenceQuotes from './WebsiteConferenceQuotes.jsx';
import WebsiteConferencePackages from './WebsiteConferencePackages.jsx';
import './ConferenceAdminWorkspace.css';

const TABS=[
 {id:'requests',icon:'📋',label:'Quotation Requests',description:'Review requests, assign staff and track preparation'},
 {id:'packages',icon:'🏢',label:'Packages & Rates',description:'Maintain conference services, inclusions and prices'}
];
export default function ConferenceAdminWorkspace({supabase}){
 const [tab,setTab]=useState(()=>{
  try{return sessionStorage.getItem('mwisho-conference-admin-tab')==='packages'?'packages':'requests';}
  catch{return 'requests';}
 });
 const choose=id=>{setTab(id);try{sessionStorage.setItem('mwisho-conference-admin-tab',id);}catch{}};
 return <section className="mw-conf-workspace">
  <header className="mw-conf-header">
   <span className="mw-conf-eyebrow">MWISHO TOURIST HOTEL · TASTE OF CLASS</span>
   <h2>Conference Management</h2>
   <p>Manage customer quotation requests, staff assignments and conference packages from one workspace.</p>
  </header>
  <nav className="mw-conf-nav" aria-label="Conference management sections">
   {TABS.map(item=><button type="button" key={item.id} className={'mw-conf-nav-card'+(tab===item.id?' active':'')}
    aria-pressed={tab===item.id} onClick={()=>choose(item.id)}>
    <span className="mw-conf-nav-icon" aria-hidden="true">{item.icon}</span>
    <span className="mw-conf-nav-text"><strong>{item.label}</strong><small>{item.description}</small></span>
   </button>)}
  </nav>
  <div className="mw-conf-panel">
   <div className="mw-conf-panel-heading">
    <div><span className="mw-conf-section-label">CONFERENCE CONTROL CENTER</span>
    <h3>{tab==='requests'?'Quotation Requests & Staff Assignments':'Conference Packages & Pricing'}</h3></div>
   </div>
   {tab==='requests'?<WebsiteConferenceQuotes supabase={supabase}/>:<WebsiteConferencePackages supabase={supabase}/>}
  </div>
 </section>;
}