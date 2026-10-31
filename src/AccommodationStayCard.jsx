import React from 'react';
import {accommodationCheckoutStatus} from './accommodationCheckoutStatus.js';

const money=n=>'KSh '+Number(n||0).toLocaleString('en-KE',{minimumFractionDigits:2});

export default function AccommodationStayCard({
 stay,roomNumber,listingName,packageLabel,totals,paymentDraft={},checkoutDraft={},
 clockNow,busy,onPaymentChange,onCheckoutChange,onRecordPayment,onCheckout,onDownload
}){
 const status=accommodationCheckoutStatus(stay,clockNow);
 const active=status!=='checked_out';
 const setPayment=patch=>onPaymentChange({...paymentDraft,...patch});
 const setCheckout=patch=>onCheckoutChange({...checkoutDraft,...patch});
 const mode=checkoutDraft.mode||'standard';
 return <article className={'mw-accommodation-guest-card '+(status==='due'||status==='overdue'?'checkout-due':'')}>
  <div className="mw-guest-card-top">
   <div className="mw-guest-avatar" aria-hidden="true">🛏️</div>
   <div className="mw-guest-identity">
    <strong>{stay.guest_name}</strong>
    <span>Room {roomNumber} · {listingName} · {packageLabel} · {stay.guest_count||1} guest(s)</span>
   </div>
   <span className={'mw-guest-status status-'+status}>{status==='overdue'?'Overdue for checkout':status==='due'?'Due for checkout · 10 AM':status==='checked_out'?'Checked out':'In house'}</span>
  </div>
  <div className="mw-guest-card-details">
   <div><span>Check-in</span><strong>{stay.check_in_date}</strong></div>
   <div><span>Expected checkout · 10 AM</span><strong>{stay.expected_check_out_date}</strong></div>
   <div><span>Total bill</span><strong>{money(totals.total)}</strong></div>
   <div><span>Paid / cleared</span><strong>{money(totals.paid)}</strong></div>
   <div><span>Outstanding</span><strong>{money(totals.balance)}</strong></div>
  </div>
  {stay.invoice_organization_name&&<div className="mw-guest-finance-notice">🧾 Invoice pending for <strong>{stay.invoice_organization_name}</strong></div>}
  <div className="mw-guest-footer">
   <button type="button" onClick={onDownload}>Download Registration PDF</button>
   {active&&<div className="mw-guest-payment-panel">
    <h4>💳 Record a payment</h4>
    <div className="mw-accommodation-actions">
     <input aria-label="Payment amount" type="number" min="0.01" max={totals.balance} step="0.01" placeholder="Amount KSh" value={paymentDraft.amount||''} onChange={e=>setPayment({amount:e.target.value})}/>
     <select aria-label="Payment method" value={paymentDraft.method||'cash'} onChange={e=>setPayment({method:e.target.value})}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="card">Credit Card / PDQ</option></select>
     <input aria-label="Payment reference" placeholder="Payment reference" value={paymentDraft.reference||''} onChange={e=>setPayment({reference:e.target.value})}/>
     <button type="button" disabled={busy||totals.balance<=0} onClick={onRecordPayment}>Record Payment</button>
    </div>
   </div>}
   {active&&<div className="mw-guest-checkout-panel">
    <h4>🚪 Checkout & bill clearance</h4>
    <div className="mw-checkout-options">
     {[['standard','Cash / M-Pesa / Card'],['complimentary','Complimentary approval'],['invoice','Organization invoice']].map(([key,label])=><label key={key} className={mode===key?'selected':''}><input type="radio" name={'checkout-'+stay.id} checked={mode===key} onChange={()=>setCheckout({mode:key})}/>{label}</label>)}
    </div>
    {mode==='complimentary'&&<div className="mw-accommodation-grid">
     <label>Stated approving person's name<input value={checkoutDraft.approverName||''} onChange={e=>setCheckout({approverName:e.target.value})} placeholder="Full name"/></label>
     <label>Designation<input value={checkoutDraft.designation||''} onChange={e=>setCheckout({designation:e.target.value})} placeholder="e.g. General Manager"/></label>
     <label>Reason for complimentary<input value={checkoutDraft.reason||''} onChange={e=>setCheckout({reason:e.target.value})} placeholder="Why is this complimentary?"/></label>
     <p className="mw-guest-caution">This is an approval request only. The named person must still approve through their authorized account; the bill is not cleared automatically.</p>
    </div>}
    {mode==='invoice'&&<div className="mw-accommodation-grid"><label>Organization to invoice<input value={checkoutDraft.organization||''} onChange={e=>setCheckout({organization:e.target.value})} placeholder="Organization / Company name"/></label><p className="mw-guest-caution">The room will be checked out with an outstanding receivable. The invoice can be generated later under Billing & Approvals, including other rooms for the same organization.</p></div>}
    <button type="button" className="primary" disabled={busy} onClick={onCheckout}>{mode==='complimentary'?'Check Out & Request Approval':mode==='invoice'?'Check Out for Invoice':'Complete Checkout'}</button>
   </div>}
  </div>
 </article>;
}
