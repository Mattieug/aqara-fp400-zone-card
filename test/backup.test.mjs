import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FP400ZoneCard,normalizeBackup,planBackupImport,maskBits,maskHex,rectBits} from '../dist/fp400-zone-card.js';
const zone={name:'Desk',x_min:-100,x_max:100,y_min:0,y_max:150,absence_timeout:3};
const backup=configuration=>({format:'aqara-fp400',version:1,configuration});
function editor(){
    const c=Object.create(FP400ZoneCard.prototype);Object.assign(c,{config:{device:'fp'},dirty:new Set(),pendingAreas:[],pendingClears:new Set(),saving:false,render(){},renderSettings(){},notice(text){this.message=text;}});
    const states={'number.fp_absence_timeout':{state:'10'},'text.fp_software_zone_1_config':{state:JSON.stringify(zone)},'sensor.fp_interference_mask_hex':{state:'00'.repeat(40)}};
    c.calls=[];c._hass={states,callService:async(domain,service,data)=>{
        c.calls.push(data);if(c.fail?.(data))throw new Error('Offline');
        if(/_interference_zone_(add|remove)$/.test(data.entity_id)){
            const bits=maskBits(states['sensor.fp_interference_mask_hex'].state);
            for(const bit of rectBits(JSON.parse(data.value)))data.entity_id.endsWith('add')?bits.add(bit):bits.delete(bit);
            states['sensor.fp_interference_mask_hex']={state:maskHex(bits)};
        }else states[data.entity_id]={state:String(data.value??data.option??(service==='turn_on'?'on':'off'))};
    }};
    c.preview=async data=>{const text=JSON.stringify(data);await c.previewBackupFile({size:text.length,text:async()=>text});};return c;
}
test('versioned backup rejects unknown settings, invalid geometry, and invalid versions before writes',()=>{
    for(const value of [{...backup({}),version:2},backup({settings:{shell:'x'}}),backup({settings:{absence_timeout:-1}}),backup({native_zones:{1:'unmanaged'}}),backup({areas:{edge:'00'}}),backup({software_zones:{9:zone}})])assert.throws(()=>normalizeBackup(value));
    const c=editor(),saved=c.configurationBackup();assert.equal(saved.configuration.software_zones[1].name,'Desk');
    assert.equal(saved.configuration.native_zones[1],undefined);assert.ok(saved.unavailable.includes('native_zone_1'));
    assert.doesNotThrow(()=>normalizeBackup(saved));
});
test('preview is read-only; confirmed steps survive a partial import and are not resent',async()=>{
    const c=editor();await c.preview(backup({settings:{absence_timeout:5},software_zones:{1:{...zone,name:'Office'}}}));
    assert.equal(c.calls.length,0);assert.equal(c.importPlan.operations.length,2);
    c.fail=data=>data.entity_id.startsWith('text.');await c.applyBackup();
    assert.equal(c.importPlan.completed,1);assert.equal(c.importPlan.operations.length,1);assert.match(c.message,/Offline/);
    c.fail=null;await c.applyBackup();assert.equal(c.importPlan.completed,2);assert.equal(c.calls.filter(x=>x.entity_id==='number.fp_absence_timeout').length,1);
    assert.match(c.message,/Import confirmed/);
});
test('an edit after preview blocks import and exact area masks survive row-wise round trips',async()=>{
    const c=editor();await c.preview(backup({settings:{absence_timeout:5}}));c._hass.states['number.fp_absence_timeout']={state:'20'};
    await c.applyBackup();assert.equal(c.calls.length,0);assert.match(c.message,/changed since preview/);
    const wanted=maskHex(new Set([0,1,4,17,18,31,319]));await c.preview(backup({areas:{interference:wanted}}));await c.applyBackup();
    assert.equal(c.areaMask('interference'),wanted);
    await c.preview(backup({areas:{interference:'00'.repeat(40)}}));await c.applyBackup();assert.equal(c.areaMask('interference'),'00'.repeat(40));
});
test('native geometry precedes settings for a newly created zone, and foreign slots require takeover',async()=>{
    const config={name:'Native',mask_hex:'80'+'00'.repeat(39)},current={settings:{},native_zones:{1:null}};
    const plan=planBackupImport(backup({native_zones:{1:config},settings:{zone_1_absence_timeout:0}}),current);
    assert.deepEqual(plan.map(o=>o.section),['native_zones','settings']);assert.equal(plan[1].created,true);
    const c=editor();c._hass.states['text.fp_native_zone_1_config']={state:JSON.stringify(config)};c._hass.states['sensor.fp_native_zone_1_status']={state:'ready'};c._hass.states['binary_sensor.fp_native_zone_1_owned']={state:'off'};
    await c.preview(backup({native_zones:{1:null}}));assert.equal(c.importPlan,null);assert.match(c.message,/Adopt sensor zone 1/);assert.equal(c.calls.length,0);
});
