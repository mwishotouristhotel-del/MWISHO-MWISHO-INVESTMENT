import React,{useState} from 'react';
import OtherInvestmentInvoices from './OtherInvestmentInvoices.jsx';
import WalkInQuotations from './WalkInQuotations.jsx';
import WebsiteConferenceQuotes from './WebsiteConferenceQuotes.jsx';
import HotelDocumentSettings from './HotelDocumentSettings.jsx';

const tabs=[
 ['walkin','✍️','Prepare Quotation','Walk-in, telephone and email enquiries'],
 ['website','📨','Website Quotations','Review, prepare, approve and book requests'],
 ['invoices','🧾','Create / Pay Invoice','Other MWISHO Investment Income and payments'],
 ['terms','⚙️','Document Terms & Accounts','Separate invoice, quotation and receipt wording']
];
export default function InvoicesQuotationsWorkspace({supabase}){
 const [tab,setTab]=useState('walkin');
 return <section style={{display:'grid',gap:16}}>
  <header style={{background:'linear-gradient(115deg,#4a226f,#8736a1)',color:'white',borderRadius:16,padding:22}}>
   <small>MWISHO TOURIST HOTEL · TASTE OF CLASS</small><h2>Invoices & Quotations</h2>
   <p>Prepare documents, manage customer quotations, track received payments, and maintain official terms from one control center.</p>
  </header>
  <nav aria-label="Invoices and quotations workflow" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
   {tabs.map(([id,icon,title,description])=><button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id)} style={{textAlign:'left',padding:14,borderRadius:12,border:tab===id?'2px solid #602a83':'1px solid #ded1e7',background:tab===id?'#f5eafa':'#fff',color:'#412254'}}>
    <span style={{fontSize:24}}>{icon}</span><strong style={{display:'block',margin:'6px 0'}}>{title}</strong><small>{description}</small>
   </button>)}
  </nav>
  {tab==='walkin'&&<WalkInQuotations supabase={supabase}/>}
  {tab==='website'&&<WebsiteConferenceQuotes supabase={supabase}/>}
  {tab==='invoices'&&<OtherInvestmentInvoices supabase={supabase}/>}
  {tab==='terms'&&<HotelDocumentSettings supabase={supabase}/>}
  <div style={{padding:12,borderRadius:10,background:'#f6f0fa'}}><strong>Existing Hotel POS Invoices</strong><p>Cashier-requested invoices and their original approval checks are still handled by the existing workflow.</p><a href="?section=invoice-approvals">Open POS Invoice Approvals</a></div>
  <p style={{fontSize:13,color:'#675d72'}}>Accommodation group invoices remain in the Accommodation workspace. Existing POS and accommodation payment and approval rules have not been changed.</p>
 </section>;
}
