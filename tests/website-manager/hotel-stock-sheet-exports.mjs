import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {stockSheetRows,stockSheetColumns,stockSheetHeading,downloadHotelStockSheet} from '../../src/stockSheetExports.js';

const example={location:'VVIP Kitchen',lines:[
 {name:'Beef',unit:'kg',opening:7,added:3,total:10,system:8,purchase_price:500,selling_price:700,physical:7.5},
 {name:'Chicken',unit:'whole',opening:2,added:0,total:2,system:1.75,purchase_price:850,selling_price:1250,physical:null}
]};
test('stock sheet names and columns match each physical/variance stage',()=>{
 assert.equal(stockSheetHeading(example),'VVIP KITCHEN STOCK SHEET');
 assert.equal(stockSheetColumns(false).at(-1)[0],'Physical Count');
 assert.equal(stockSheetColumns(true).at(-1)[0],'Variance');
 const blank=stockSheetRows(example,false);
 assert.equal(blank[0].physical,'');assert.equal(blank[1].physical,'');
 const counted=stockSheetRows(example,true);
 assert.equal(counted[0].variance,-.5);assert.equal(counted[1].variance,'');
 assert.equal(counted[0].moved,2);assert.equal(counted[0].amount,1400);
});
test('Excel export contains a true landscape workbook with dated title and structured rows',async()=>{
 const oldDocument=globalThis.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 let output;
 globalThis.document={createElement:()=>({click(){},remove(){}}),body:{append(){}}};
 URL.createObjectURL=blob=>{output=blob;return 'blob:test'};
 URL.revokeObjectURL=()=>{};
 try{
  await downloadHotelStockSheet(example,{format:'excel',includeVariance:true});
  assert.ok(output);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await output.arrayBuffer());
  const sheet=workbook.worksheets[0];
  assert.equal(sheet.getCell('A1').value,'VVIP KITCHEN STOCK SHEET');
  assert.match(sheet.getCell('A2').value,/DATE GENERATED:/);
  assert.equal(sheet.getCell('A5').value,'No.');
  assert.equal(sheet.getCell('L5').value,'Variance');
  assert.equal(sheet.getCell('L6').value,-.5);
  assert.equal(sheet.pageSetup.orientation,'landscape');
 }finally{globalThis.document=oldDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;}
});
