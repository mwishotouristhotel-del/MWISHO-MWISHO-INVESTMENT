import {printHotelInvoice} from './hotelInvoicePrintLayout.js';

export function downloadOtherIncomeInvoice({invoice,items,terms='',accounts=[],issuerPin='',companyDetails={}}){
 return printHotelInvoice({companyDetails,
  reference:invoice.invoice_number,
  invoiceDate:invoice.invoice_date,
  client:invoice.bill_to,
  clientAddress:invoice.address,
  clientPin:invoice.kra_pin,
  issuerPin,
  deliveryDates:invoice.description||invoice.category,
  category:invoice.category,
  rows:items.map(item=>({quantity:item.quantity,description:item.description,unitPrice:item.unit_price_kes,days:'',amount:item.amount_kes})),
  subtotal:invoice.total_kes,
  vatAmount:0,
  terms,
  paymentDetails:accounts.map(a=>a.label+'\n'+a.details).join('\n\n'),
  filename:'MWISHO-Other-Income-Invoice-'+String(invoice.invoice_number).replace(/[^a-z0-9-]/gi,'-')+'.pdf'
 });
}
