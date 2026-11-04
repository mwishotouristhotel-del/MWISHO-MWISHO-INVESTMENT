-- Preserve existing shared wording on invoices and quotations until Admin edits each.
alter table public.hotel_document_settings
 add column if not exists invoice_terms text not null default '' check(length(invoice_terms)<=5000),
 add column if not exists quotation_terms text not null default '' check(length(quotation_terms)<=5000),
 add column if not exists receipt_terms text not null default '' check(length(receipt_terms)<=5000);
update public.hotel_document_settings
 set invoice_terms=terms_text,quotation_terms=terms_text
 where invoice_terms='' and quotation_terms='' and terms_text<>'';
