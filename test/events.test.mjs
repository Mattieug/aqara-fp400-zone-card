import {test} from 'node:test';
import assert from 'node:assert/strict';
import definition, {decodeMotionEvent, parseSoftwareZone, readNativeZoneMap} from '../z2m/aqara-fp400.mjs';

const hex = h => Buffer.from(h, 'hex');
const desk = parseSoftwareZone({name: 'Desk', x_min: -140, x_max: 60, y_min: 8, y_max: 158, absence_timeout: 3});
function record({id, x, y, activity = 2}) {
    const r = Buffer.from('0900200029000029000029000029000021000030003000200000'.slice(0, 50), 'hex');
    r[3] = id; r.writeInt16LE(x, 5); r.writeInt16LE(y, 8); r.writeInt16LE(activity, 14); r[22] = 255;
    return r;
}
const frame = targets => Buffer.concat([Buffer.from([0x1c, 0x5f, 0x11, 0x01, 0x8b, 0x00, 0x00, 0x4c, targets.length, 0]), ...targets.map(record)]);

test('movement events decode with or without a type tag', () => {
    assert.equal(decodeMotionEvent(hex('1c5f11078b000006')), 'approach');
    assert.equal(decodeMotionEvent(hex('1c5f11078b00003007')), 'away');
    assert.equal(decodeMotionEvent(hex('1c5f11078b000000')), 'enter');
    assert.equal(decodeMotionEvent(hex('1c5f11078b030000')), undefined, 'event 3 is the learning result');
    assert.equal(decodeMotionEvent(hex('1c5f11078b000009')), undefined, 'unknown value');
});
test('only the main endpoint fires actions; movement frames are kept for diagnosis', () => {
    const motion = definition.fromZigbee.find(c => c.cluster === 'aqaraFp400Radar' && c.type.includes('raw'));
    assert.deepEqual(motion.convert({}, {endpoint: {ID: 1}, data: hex('1c5f11078b000001')}), {motion_last_frame: '1c5f11078b000001', action: 'leave'});
    assert.deepEqual(motion.convert({}, {endpoint: {ID: 3}, data: hex('1c5f11078b000001')}), {motion_last_frame: '1c5f11078b000001'});
    assert.equal(motion.convert({}, {endpoint: {ID: 1}, data: hex('1c5f11070a000000')}), undefined);
});
test('experimental raw child events use the confirmed mapping, never endpoint arithmetic or room actions',async()=>{
    const motion=definition.fromZigbee.find(c=>c.cluster==='aqaraFp400Radar'&&c.type.includes('raw'));
    const device={ieeeAddr:'raw-zone-events',meta:{},getEndpoint:ID=>({ID,read:async(cluster,[attr])=>attr===0?{0:[9]}:{1:3}})};
    const msg={device,endpoint:{ID:9},data:hex('1c5f11078b000001')},opts={native_zones:true,experimental_features:true};
    assert.equal(motion.convert({},msg,undefined,opts).native_zone_3_event_raw,undefined);
    await readNativeZoneMap(device);
    const state=motion.convert({},msg,undefined,opts);
    assert.deepEqual(JSON.parse(state.native_zone_3_event_raw),{endpoint:9,event_id:0,hex:msg.data.toString('hex')});
    assert.equal(state.action,undefined);assert.equal(state.native_zone_7_event_raw,undefined);
    assert.equal(motion.convert({},msg,undefined,{native_zones:true}).native_zone_3_event_raw,undefined);
    await definition.onEvent({type:'stop',data:{ieeeAddr:device.ieeeAddr}});
});
test('remove_target sends the command once per request and reports a refusal', async () => {
    const control = definition.toZigbee.find(c => c.key.includes('remove_target'));
    const sent = [];
    const meta = status => ({device: {getEndpoint: () => ({command: async (...args) => {sent.push(args); return {statusCode: status};}})}});
    await control.convertSet(null, 'remove_target', '3', meta(0));
    assert.deepEqual(sent[0].slice(0, 3), ['aqaraFp400Location', 'removeDetectionTarget', {targetId: 3}]);
    await assert.rejects(() => control.convertSet(null, 'remove_target', 4, meta(0x8b)), /did not accept/);
    for (const bad of ['', 'x', -1, 256, 1.5]) await assert.rejects(() => control.convertSet(null, 'remove_target', bad, meta(0)), /needs a target id/);
    assert.equal(sent.length, 2);
});
test('position frames publish zone enter events after the new state', async () => {
    const frames = definition.fromZigbee.find(c => c.cluster === 'aqaraFp400Location' && c.type.includes('raw'));
    const device = {ieeeAddr: 'events-test', meta: {fp400SoftwareZones: {1: desk}}}, published = [];
    frames.convert({}, {endpoint: {ID: 1}, data: frame([]), device}, p => published.push(p));
    const out = frames.convert({}, {endpoint: {ID: 1}, data: frame([{id: 3, x: 0, y: 80, activity: 1}]), device}, p => published.push(p));
    assert.equal(out.software_zone_1_count, 1);
    assert.equal(out.software_zone_1_activity, 'moving');
    assert.equal(published.length, 0, 'events wait until the state is out');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(published, [{action: 'software_zone_1_enter'}]);
    await definition.onEvent({type: 'stop', data: {ieeeAddr: device.ieeeAddr}});
});
test('a position report cut at 80 bytes (Ember) still updates the zones', () => {
    const frames = definition.fromZigbee.find(c => c.cluster === 'aqaraFp400Location' && c.type.includes('raw'));
    const device = {ieeeAddr: 'cut-test', meta: {fp400SoftwareZones: {1: desk}}};
    const cut = frame([{id: 0, x: -119, y: 217}, {id: 6, x: 58, y: 514}, {id: 2, x: 0, y: 80}, {id: 4, x: -30, y: 98}]).subarray(0, 80);
    const out = frames.convert({}, {endpoint: {ID: 1}, data: cut, device}, () => {});
    assert.deepEqual([out.tracking_status, out.software_zone_1_occupancy, out.target_count, out.targets_xy], ['partial', true, 4, '0:-119:217;6:58:514;2:0:80']);
    definition.onEvent({type: 'stop', data: {ieeeAddr: device.ieeeAddr}});
});
test('when the room empties, the zones empty too and fire leave events, even with no new positions', async () => {
    const presence = definition.fromZigbee.find(c => c.cluster === 'msOccupancySensing' && c.type.includes('attributeReport') && c.convert.toString().includes('setPresence'));
    const frames = definition.fromZigbee.find(c => c.cluster === 'aqaraFp400Location' && c.type.includes('raw'));
    const device = {ieeeAddr: 'presence-test', meta: {fp400SoftwareZones: {1: desk}}}, published = [];
    frames.convert({}, {endpoint: {ID: 1}, data: frame([{id: 3, x: 0, y: 80}]), device}, p => published.push(p));
    const out = presence.convert({}, {endpoint: {ID: 1}, data: {occupancy: 0}, device}, p => published.push(p));
    assert.deepEqual([out.software_zone_1_occupancy, out.software_zone_1_count], [false, 0]);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(published.filter(p => p.action), [{action: 'software_zone_1_leave'}]);
    assert.equal(presence.convert({}, {endpoint: {ID: 3}, data: {occupancy: 0}, device}, () => {}), undefined, 'only endpoint 1 is the room');
    await definition.onEvent({type: 'stop', data: {ieeeAddr: device.ieeeAddr}});
});
test('the sensor\'s own absence timeout goes down to 0 seconds and is confirmed by reading it back', async () => {
    const control = definition.toZigbee.find(c => c.key.includes('absence_timeout'));
    let stored = 10;
    const endpoint = {write: async (cluster, payload) => {stored = payload[3].value;}, read: async () => ({3: stored})};
    const meta = {device: {getEndpoint: () => endpoint}};
    assert.deepEqual(await control.convertSet(null, 'absence_timeout', 0, meta), {state: {absence_timeout: 0}});
    for (const bad of [-1, 301, 2.5]) await assert.rejects(() => control.convertSet(null, 'absence_timeout', bad, meta), /0..300/);
    endpoint.write = async () => {}; // a sensor that ignores the write
    await assert.rejects(() => control.convertSet(null, 'absence_timeout', 30, meta), /not confirmed/);
});
