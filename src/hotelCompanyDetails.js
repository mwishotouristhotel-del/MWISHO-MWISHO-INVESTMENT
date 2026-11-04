export const defaultCompanyDetails={
 company_name:'MWISHO TOURIST HOTEL',registration_number:'',kra_pin:'',phone:'0745396385',alternate_phone:'',
 email:'mwishotouristhotel@gmail.com',alternate_email:'',postal_address:'P.O.BOX 35-40600',
 location:'Siaya Town, Along Kisumu-Luanda-Siaya Road',landmark:'Opposite Shell Petrol Station'
};
export const defaultInvestmentDetails={...defaultCompanyDetails,company_name:'MWISHO MWISHO INVESTMENT LIMITED',kra_pin:'',registration_number:''};
export const companyDetailsWithDefaults=details=>({...defaultCompanyDetails,...(details&&typeof details==='object'&&!Array.isArray(details)?details:{})});
export const investmentDetailsWithDefaults=details=>({...defaultInvestmentDetails,...(details&&typeof details==='object'&&!Array.isArray(details)?details:{})});
export const companyContactLines=details=>{
 const d=companyDetailsWithDefaults(details);
 return [
  [d.email,d.alternate_email].filter(Boolean).join(' / ')+'  |  '+[d.phone,d.alternate_phone].filter(Boolean).join(' / '),
  [d.postal_address,d.location].filter(Boolean).join(' | '),
  [d.landmark,d.registration_number?'Registration: '+d.registration_number:''].filter(Boolean).join(' | ')
 ].filter(Boolean);
};
