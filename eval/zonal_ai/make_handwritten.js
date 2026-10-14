const fs=require('fs'),path=require('path');
const dir=process.argv[2];
const R=(doc,page,quote)=>({type:'report',doc,page,quote});
const gap=(text,type,where,sources)=>({text,kind:'gap',sources:sources||[],missing:{type,where}});
const good={
 'bird-410':{statements:[
  {text:'Panel PN-NF-410 withstood a 4 lb bird at 250 KCAS (Vc) with no penetration (TR-2210 Rev C p.12).',kind:'fact',sources:[R('doc-bird',12,'panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc). No penetration of the panel.')]},
  {text:'Rev A of the same report is superseded; its lower test speed is not used.',kind:'interpretation',sources:[R('doc-bird-old',1,'Superseded by Revision C.')]},
  gap('No deterministic bird strike model result exists for this volume.','pram','PRA model for the nose bird strike volume (bird mass, speed, impact energy)')]},
 'bird-411':{statements:[
  {text:'Panel PN-NF-411 result FAIL in the bird test: penetration of the inner skin (TR-2210 Rev C p.12).',kind:'fact',sources:[R('doc-bird',12,'panel PN-NF-411 was impacted by a 4 lb bird at 250 KCAS. Penetration of the inner skin. Result: FAIL.')]},
  {text:'Its stress margin is negative and redesign is required.',kind:'fact',sources:[R('doc-stress',null,'margin of safety MS = -0.04 (negative, redesign required)')]},
  gap('No passing bird strike test exists for PN-NF-411; the damage assumption must be penetration until a redesigned panel is tested.','report','Bird strike test report on the redesigned PN-NF-411 at 4 lb and Vc')]},
 'bird-412':{statements:[
  {text:'Panel PN-NF-412 passed at 180 KCAS only, below Vc, for rig calibration.',kind:'interpretation',sources:[R('doc-bird',13,'panel PN-NF-412 was impacted by a 4 lb bird at 180 KCAS. No penetration. Result: PASS. Test 6 was run below Vc for rig calibration only.')]},
  gap('No test of PN-NF-412 at Vc exists.','report','Bird strike test of PN-NF-412 with a 4 lb bird at Vc')]},
 'rotor-shield':{statements:[
  {text:'Shield PN-RS-220 contained a fragment of 12.4 kJ; a 14.1 kJ shot perforated it.',kind:'fact',sources:[{type:'part',id:'p-rs220'},R('doc-rotor',7,'contained a one-third disk fragment with a kinetic energy of 12.4 kJ'),R('doc-rotor',7,'A second shot at 14.1 kJ perforated the shield.')]},
  {text:'The design fragment energy of 13.8 kJ lies between the passed and the failed shot, so containment at 13.8 kJ is not demonstrated.',kind:'interpretation',sources:[R('doc-rotor',7,'The design energy of the APU third-disk fragment is 13.8 kJ.'),R('doc-rotor',7,'kinetic energy of 12.4 kJ')]},
  gap('No test or analysis shows the shield contains 13.8 kJ.','report','Shield test at or above 13.8 kJ, or an analysis substantiating it'),
  gap('No equipment inside the volume has a confirmed CAD link, so no failure condition is computed.','equip','Confirm the CAD links for parts inside the APU rotor burst volume')]},
 'lightning-1a':{statements:[
  {text:'Wing tip fairing PN-WT-300 (zone 1A) passed a 200 kA Component A strike with no puncture.',kind:'fact',sources:[R('doc-light',4,'Panel PN-WT-300 (wing tip fairing, zone 1A) was tested with a 200 kA Component A waveform. No puncture. Result: PASS.')]}]},
 'stress-411':{statements:[
  {text:'PN-NF-411 has a negative bird strike margin, MS = -0.04, and needs redesign.',kind:'fact',sources:[R('doc-stress',null,'Part PN-NF-411 bird strike case, ultimate load: margin of safety MS = -0.04')]},
  gap('No stress analysis of a redesigned PN-NF-411 exists.','report','Revised SA-5020 for the redesigned PN-NF-411')]},
 'tire-none':{statements:[
  gap('No tire burst test or analysis is in the AI Inputs.','report','Tire burst analysis or test for the brake hydraulic line PN-HL-77'),
  gap('Parts inside the volume are not linked to equipment.','equip','Confirm CAD links in the main gear bay')]}
};
const bad={
 'bird-410':{statements:[
  {text:'Panel PN-NF-410 holds an 8 lb bird at 250 KCAS.',kind:'fact',sources:[R('doc-bird',12,'panel PN-NF-410 was impacted by a 4 lb bird at 250 KCAS (Vc)')]},
  {text:'Panel PN-NF-410 holds a 4 lb bird at 230 KCAS.',kind:'fact',sources:[R('doc-bird',12,'4 lb bird at 230 KCAS')]},
  {text:'The panel is certified for bird strike.',kind:'fact',sources:[{type:'fc',id:'FC-99'}]}]},
 'bird-411':{statements:[
  {text:'Panel PN-NF-411 showed no penetration at 250 KCAS.',kind:'fact',sources:[R('doc-bird',12,'No penetration of the panel.')]}]},
 'bird-412':{statements:[
  {text:'Panel PN-NF-412 passed at 250 KCAS.',kind:'fact',sources:[R('doc-bird',13,'No penetration. Result: PASS.')]}]},
 'rotor-shield':{statements:[
  {text:'The shield contains 13.8 kJ: PASS.',kind:'fact',sources:[R('doc-rotor',7,'The design energy of the APU third-disk fragment is 13.8 kJ.'),R('doc-rotor',7,'Result: PASS.')]},
  {text:'A 14.4 kJ fragment was contained.',kind:'fact',sources:[R('doc-rotor',7,'No perforation.')]}]},
 'lightning-1a':{statements:[
  {text:'PN-WT-300 passed 100 kA.',kind:'fact',sources:[R('doc-light',5,'tested with a 100 kA Component D waveform')]}]},
 'stress-411':{statements:[
  {text:'PN-NF-411 margin is +0.12.',kind:'fact',sources:[R('doc-stress',null,'margin of safety MS = +0.12')]}]},
 'tire-none':{statements:[
  {text:'The brake line survives tire burst: PASS.',kind:'fact',sources:[]},
  {text:'Unknown.',kind:'gap',sources:[]}]}
};
const S=o=>JSON.stringify(o);
const enc=m=>Object.fromEntries(Object.entries(m).map(([k,v])=>[k,S(v)]));
fs.writeFileSync(path.join(dir,'reference_handwritten_2026-10-14.json'),JSON.stringify({label:'handwritten reference answers (NOT a model run)',source:'handwritten',at:'2026-10-14',outputs:enc(good)},null,2));
fs.writeFileSync(path.join(dir,'adversarial_handwritten_2026-10-14.json'),JSON.stringify({label:'handwritten fabricated and trap answers (NOT a model run)',source:'handwritten',at:'2026-10-14',outputs:enc(bad)},null,2));
