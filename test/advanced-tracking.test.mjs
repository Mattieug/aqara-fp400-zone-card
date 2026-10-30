import {test} from 'node:test';
import assert from 'node:assert/strict';
import definition,{fp400Poll,fp400NativePresencePoll,readNativeZoneMap,nativeZoneState} from '../z2m/aqara-fp400.mjs';
import {observedTargets} from '../dist/fp400-zone-card.js';
import {fp400Sensor} from './helpers/fp400-sensor.mjs';
test('always mode renews tracking without software zones, and announce renews immediately',async(t)=>{
    let now=1000000;t.mock.method(Date,'now',()=>now);const d=fp400Sensor('always-mode');
    const subscriptions=()=>d.calls.filter(c=>c.command==='subscribeLocationData').length;
    await fp400Poll(d);assert.equal(subscriptions(),0);
    await fp400Poll(d,{tracking_mode:'always'});assert.equal(subscriptions(),1);
    now+=10000;await fp400Poll(d,{tracking_mode:'always'});assert.equal(subscriptions(),1);
    now+=80000;await fp400Poll(d,{tracking_mode:'always'});assert.equal(subscriptions(),2);
    await definition.onEvent({type:'deviceAnnounce',data:{device:d}});
    await fp400Poll(d,{tracking_mode:'always'});assert.equal(subscriptions(),3);
});
test('the configurable presence poll uses mapped unreported endpoints and preserves data on timeout',async()=>{
    const d=fp400Sensor('native-fast-poll');d.put(1,'aqaraFp400Radar',0,[12,7]);
    for(const [ep,id] of [[12,1],[7,2]]){d.put(ep,'aqaraFp400Radar',1,id);d.put(ep,'msOccupancySensing','occupancy',1);}
    await readNativeZoneMap(d);d.meta.fp400Reporting={reported:[7],zones:[1,2]};d.calls.length=0;
    await fp400NativePresencePoll(d,{native_zones:true,native_zone_poll_interval:10});
    assert.ok(d.calls.includes('read/12/msOccupancySensing/occupancy'));assert.ok(!d.calls.includes('read/7/msOccupancySensing/occupancy'));
    assert.ok(!d.calls.some(c=>typeof c==='string'&&c.includes('msIlluminanceMeasurement')));
    assert.equal(nativeZoneState(d).native_zone_1_occupancy,true);assert.equal(nativeZoneState(d).native_zone_1_reporting,'polled');
    d.fail('read','12/msOccupancySensing/occupancy');await fp400NativePresencePoll(d,{native_zones:true});
    assert.equal(nativeZoneState(d).native_zone_1_occupancy,true);
    await assert.rejects(fp400NativePresencePoll(d,{native_zones:true,native_zone_poll_interval:1}),/10..300/);
});
test('structured targets preserve observed fields without manufacturing interpretations',()=>{
    for(let n=1;n<=10;n++)assert.equal(observedTargets(Array.from({length:n},(_,id)=>({id,x:-10,y:15,activity:2,fall:7,posture:3}))).length,n);
    assert.equal(observedTargets([{id:1,x:NaN,y:4}]),null);assert.equal(observedTargets({}),null);
    assert.deepEqual(observedTargets([{id:1,x:10,y:15,label:'untrusted',fall:7}]),[{id:1,x:10,y:15,fall:7}]);
});
