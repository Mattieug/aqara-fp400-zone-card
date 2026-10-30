import {test} from 'node:test';
import assert from 'node:assert/strict';
import definition from '../z2m/aqara-fp400.mjs';
import {FP400ZoneCard} from '../dist/fp400-zone-card.js';

test('area read marker requires three complete masks and is never published for a truncated reply', async()=>{
    const control=definition.toZigbee.find(c=>c.key.includes('refresh_configuration'));
    let truncated=false;const published=[];
    const device={getEndpoint:()=>({read:async(cluster,attrs)=>Object.fromEntries(attrs.map(a=>[a,a>=18&&a<=20?Buffer.alloc(truncated&&a===19?12:40):0]))})};
    const result=await control.convertSet(null,'refresh_configuration','refresh',{device,publish:s=>published.push(s)});
    assert.equal(result.state.interference_mask_hex.length,80);assert.ok(Date.parse(result.state.areas_read_time));
    assert.equal(published.length,1);truncated=true;
    await assert.rejects(()=>control.convertSet(null,'refresh_configuration','refresh',{device,publish:s=>published.push(s)}),/mask length/);
    assert.equal(published.length,1,'no completion marker after a partial refresh');
});

test('learning readback shows changed cells only after a fresh marker, without interpreting the result code',async()=>{
    const c=Object.create(FP400ZoneCard.prototype),before={interference:'0'.repeat(80),entry_exit:'0'.repeat(80),edge:'0'.repeat(80)};
    const masks={...before},state={areas_read_time:'2026-10-30T10:00:00.000Z'};c.config={device:'fp'};
    c.trackingValue=k=>state[k];c.areaMask=k=>masks[k];c.entity=()=> 'button.fp_refresh_configuration';
    c.notice=(message,type)=>{c.message=message;c.messageType=type;};
    c.waitUntil=async(predicate,message)=>{if(!predicate())throw Error(message);};
    c._hass={callService:async()=>{masks.interference='8'+'0'.repeat(79);state.areas_read_time='2026-10-30T10:01:00.000Z';}};
    await c.readLearningAreas(7,before);assert.match(c.message,/interference: \+1\/−0 cells/);assert.match(c.message,/unverified/);assert.notEqual(c.messageType,'success');
    c._hass.callService=async()=>{};await c.readLearningAreas(7,before);assert.match(c.message,/readback was not confirmed/);assert.equal(c.messageType,'error');
});
