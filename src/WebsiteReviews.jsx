import React,{useEffect,useState} from 'react';

export default function WebsiteReviews({supabase}){
 const [reviews,setReviews]=useState([]),[filter,setFilter]=useState('pending'),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function refresh(){
  const {data,error:e}=await supabase.from('hotel_website_reviews').select('*').order('created_at',{ascending:false}).limit(300);
  if(e)setError(e.message);else{setReviews(data||[]);setError('');}
 }
 useEffect(()=>{refresh()},[supabase]);
 async function moderate(review,status){
  if(status==='rejected'&&!window.confirm('Reject this review? It will not be published.'))return;
  setBusy(review.id);setError('');setNotice('');
  const {data:{user}}=await supabase.auth.getUser();
  const {data,error:e}=await supabase.from('hotel_website_reviews').update({status,reviewed_at:new Date().toISOString(),reviewed_by:user?.id||null}).eq('id',review.id).select('id').single();
  if(e||!data)setError(e?.message||'Could not update review.');else{setNotice(status==='approved'?'Review approved and published.':'Review removed from public display.');await refresh();}
  setBusy('');
 }
 const visible=reviews.filter(x=>filter==='all'||x.status===filter);
 return <section className="mw-web-reviews" style={{display:'grid',gap:15}}>
  <header><h3>Customer Reviews & Testimonials</h3><p>Customer reviews remain private until an administrator approves them. You can also withdraw approval later.</p><strong>{reviews.filter(x=>x.status==='pending').length} awaiting approval · {reviews.filter(x=>x.status==='approved').length} published</strong></header>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><label>Show <select value={filter} onChange={e=>setFilter(e.target.value)}><option value="pending">Pending</option><option value="approved">Published</option><option value="rejected">Rejected</option><option value="all">All</option></select></label><button type="button" onClick={refresh}>Refresh Reviews</button></div>
  {error&&<p role="alert" style={{color:'#a32946'}}>{error}</p>}{notice&&<p role="status" style={{color:'#19683d'}}>{notice}</p>}
  {!visible.length?<p>No reviews in this category.</p>:visible.map(review=><article key={review.id} style={{background:'#fff',border:'1px solid #e2d7ef',borderRadius:12,padding:16,display:'grid',gap:8}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{review.customer_name} · {'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</strong><small>{new Date(review.created_at).toLocaleString('en-KE',{timeZone:'Africa/Nairobi'})}</small></div>
   <small>{review.visit_type} · {review.status}</small><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',margin:0}}>{review.review_text}</p>
   <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{review.status!=='approved'&&<button type="button" disabled={!!busy} onClick={()=>moderate(review,'approved')}>Approve & Publish</button>}{review.status!=='rejected'&&<button type="button" disabled={!!busy} onClick={()=>moderate(review,'rejected')}>{review.status==='approved'?'Unpublish':'Reject'}</button>}</div>
  </article>)}
 </section>;
}
