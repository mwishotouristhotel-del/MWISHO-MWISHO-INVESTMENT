// Reuse only durable guest details; a new visit must keep its own booking and payment.
export const prefillReturningGuest=(current,previous)=>({
 ...current,
 ...Object.fromEntries([
  'guest_name','guest_id_number','guest_phone','address','nationality',
  'country_of_residence','county_of_residence','email','vehicle_registration',
  'accessibility_request'
 ].map(key=>[key,previous[key]??'']))
});
