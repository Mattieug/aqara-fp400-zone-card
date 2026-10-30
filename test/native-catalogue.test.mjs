import {test} from 'node:test';
import assert from 'node:assert/strict';
import definition,{parseNativeCatalogue,readNativeCatalogue,fp400Poll,nativeZoneState} from '../z2m/aqara-fp400.mjs';
import {nativeCatalogueSensor} from './helpers/fp400-sensor.mjs';
const mask='81'+'00'.repeat(39),other='42'+'00'.repeat(39),config={name:'Desk',mask_hex:mask};
const options={native_zones:true,experimental_features:true,restore_native_zones:true};
test('complete plain and typed catalogues preserve masks; truncation, duplicate IDs and unexpected types are rejected',()=>{
    const raw=[1,0,Buffer.from(mask,'hex'),1];
    assert.equal(parseNativeCatalogue([raw]).get(1).mask_hex,mask);
    assert.equal(parseNativeCatalogue([raw.map((elmVal,i)=>({elmType:[0x20,0x30,0x41,0x10][i],elmVal}))]).get(1).mask_hex,mask);
    for(const value of [null,[raw.slice(0,3)],[raw,raw],[[1,0,Buffer.alloc(39),1]],[[1,4,Buffer.from(mask,'hex'),1]],[[1,0,Buffer.from(mask,'hex'),4]]])assert.throws(()=>parseNativeCatalogue(value));
    assert.equal(parseNativeCatalogue([]).size,0);
});
test('external geometry is observed without being adopted; a truncated read retains the cache and ownership guard',async()=>{
    const d=nativeCatalogueSensor('catalogue-external',[[1,{endpoint:17,mask_hex:mask}]]);
    await fp400Poll(d,{...options,restore_native_zones:false});
    let s=nativeZoneState(d);assert.equal(JSON.parse(s.native_zone_1_config).mask_hex,mask);assert.equal(s.native_zone_1_owned,false);assert.equal(s.native_zone_1_source,'observed');
    const control=definition.toZigbee.find(c=>c.key.includes('native_zone_1_config'));
    await assert.rejects(control.convertSet(null,'native_zone_1_config',config,{device:d,options,publish:()=>{}}),/confirm overwrite/);
    d.put(1,'aqaraFp400Config',16,[]);
    await assert.rejects(readNativeCatalogue(d),/disagree/);
    s=nativeZoneState(d);assert.equal(JSON.parse(s.native_zone_1_config).mask_hex,mask);assert.equal(s.native_zone_1_source,'cached');assert.equal(s.native_catalogue_status,'uncertain');
    assert.equal(d.nativeCommands.length,0);
});
test('external modification of an owned ID requires explicit takeover',async()=>{
    const d=nativeCatalogueSensor('catalogue-changed',[[1,{endpoint:17,mask_hex:other}]]);
    d.meta.fp400NativeZones={1:{config,status:'ready'}};
    await fp400Poll(d,{...options,restore_native_zones:false});
    assert.equal(nativeZoneState(d).native_zone_1_owned,false);
    const control=definition.toZigbee.find(c=>c.key.includes('native_zone_1_config'));
    await assert.rejects(control.convertSet(null,'native_zone_1_config',config,{device:d,options,publish:()=>{}}),/confirm overwrite/);
    await control.convertSet(null,'native_zone_1_config',{...config,overwrite:true},{device:d,options,publish:()=>{}});
    assert.equal(d.nativeCommands.length,1);assert.equal(nativeZoneState(d).native_zone_1_source,'acknowledged');
});
test('adopting and editing geometry preserve an observed opaque boolean without inventing an enable control',async()=>{
    const d=nativeCatalogueSensor('catalogue-opaque-flag',[[1,{endpoint:17,mask_hex:mask,flag:0}]]);
    await fp400Poll(d,{...options,restore_native_zones:false});
    const control=definition.toZigbee.find(c=>c.key.includes('native_zone_1_config'));
    await control.convertSet(null,'native_zone_1_config',{...config,overwrite:true},{device:d,options,publish:()=>{}});
    assert.equal(d.nativeCommands.at(-1).args.zone[3].elmVal,0);
    assert.equal(d.meta.fp400NativeZones[1].wireFlag,0);
    await control.convertSet(null,'native_zone_1_config',{...config,mask_hex:other},{device:d,options,publish:()=>{}});
    assert.equal(d.nativeCommands.at(-1).args.zone[3].elmVal,0,'local confirmation preserves the value after the observation is invalidated');
});
test('opt-in recovery requires two complete matching reads and ignores deleted or uncertain zones',async(t)=>{
    let now=1e12;t.mock.method(Date,'now',()=>now);
    const d=nativeCatalogueSensor('catalogue-restore');
    d.meta.fp400NativeZones={1:{config,status:'ready'},2:{config:null,status:'ready'},3:{config,status:'error'}};
    await fp400Poll(d,options);assert.equal(d.nativeCommands.length,0);
    now+=60000;await fp400Poll(d,options);assert.equal(d.nativeCommands.length,1);assert.equal(d.nativeCommands[0].args.zone[0].elmVal,1);
    assert.equal(nativeZoneState(d).native_zone_1_status,'pending');
    now+=20000;await fp400Poll(d,options);assert.equal(nativeZoneState(d).native_zone_1_status,'ready');
    assert.equal(d.nativeCommands.length,1);
});
test('a failed catalogue breaks the missing-zone evidence and disabled recovery writes nothing',async(t)=>{
    let now=1e12;t.mock.method(Date,'now',()=>now);
    const d=nativeCatalogueSensor('catalogue-no-recovery');d.meta.fp400NativeZones={1:{config,status:'ready'}};
    await fp400Poll(d,options);d.fail('read','1/aqaraFp400Config/16');now+=60000;await fp400Poll(d,options);
    now+=60000;await fp400Poll(d,options);assert.equal(d.nativeCommands.length,0);
    now+=60000;await fp400Poll(d,{...options,restore_native_zones:false});assert.equal(d.nativeCommands.length,0);
});
