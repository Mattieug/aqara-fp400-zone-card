import {test} from 'node:test';
import assert from 'node:assert/strict';
import definition, {fp400Poll, parseSoftwareZone, SoftwareZoneTracker} from '../z2m/aqara-fp400.mjs';

const desk = parseSoftwareZone({name: 'Desk', x_min: -140, x_max: 60, y_min: 8, y_max: 158, absence_timeout: 3});
const minute = 60000;
function record({id, x, y, activity = 2}) {
    const r = Buffer.from('0900200029000029000029000029000021000030003000200000'.slice(0, 50), 'hex');
    r[3] = id; r.writeInt16LE(x, 5); r.writeInt16LE(y, 8); r.writeInt16LE(activity, 14); r[22] = 255;
    return r;
}
const frame = targets => Buffer.concat([Buffer.from([0x1c, 0x5f, 0x11, 0x01, 0x8b, 0x00, 0x00, 0x4c, targets.length, 0]), ...targets.map(record)]);
const frames = definition.fromZigbee.find(c => c.cluster === 'aqaraFp400Location' && c.type.includes('raw'));
const presence = definition.fromZigbee.find(c => c.cluster === 'msOccupancySensing');
const control = definition.toZigbee.find(c => c.key.includes('forget_still_targets'));

// A sensor with nothing else to restore, that records which targets it was told to forget.
function fakeSensor(ieeeAddr, meta) {
    const forgotten = [], published = [];
    const device = {ieeeAddr, meta, forgotten, published, refuse: false, save: async () => {},
        getEndpoint: () => ({
            read: async (cluster, [id]) => ({[id]: [18, 19, 20].includes(id) ? Buffer.alloc(40) : 0}),
            command: async (cluster, command, payload) => {
                if (command !== 'removeDetectionTarget') return {statusCode: 0};
                if (device.refuse) return {statusCode: 0x8b};
                forgotten.push(payload.targetId);
                return {statusCode: 0};
            },
        })};
    device.report = targets => frames.convert({}, {endpoint: {ID: 1}, data: frame(targets), device}, p => published.push(p));
    device.presence = occupancy => presence.convert({}, {endpoint: {ID: 1}, data: {occupancy}, device}, p => published.push(p));
    return device;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const stop = device => definition.onEvent({type: 'stop', data: {ieeeAddr: device.ieeeAddr}});

test('a dot that wobbles less than 10 cm counts as still; a bigger move starts the time again', () => {
    const t = new SoftwareZoneTracker({});
    t.accept([{id: 4, x: 100, y: 160}], 0);
    t.accept([{id: 4, x: 106, y: 163}], 4 * minute);
    assert.deepEqual(t.stillFor(5 * minute, 5 * minute), [4]);
    t.accept([{id: 4, x: 120, y: 160}], 6 * minute);
    assert.deepEqual(t.stillFor(5 * minute, 10 * minute), []);
    assert.deepEqual(t.stillFor(5 * minute, 11 * minute), [4]);
});
test('a target that left is not still; a cut report keeps the ones it lost; an empty room clears all', () => {
    const t = new SoftwareZoneTracker({});
    t.accept([{id: 1, x: 0, y: 100}, {id: 2, x: 50, y: 200}], 0);
    t.accept([{id: 1, x: 0, y: 100}], minute, 2);
    assert.deepEqual(t.stillFor(minute, minute), [1, 2]);
    t.accept([{id: 1, x: 0, y: 100}], 2 * minute);
    assert.deepEqual(t.stillFor(minute, 2 * minute), [1]);
    t.setPresence(false, 3 * minute);
    assert.deepEqual(t.stillFor(0, 3 * minute), []);
});

test('off unless chosen; then a ghost that has not moved is forgotten once, after the chosen minutes', async (t) => {
    let now = 1e12;
    t.mock.method(Date, 'now', () => now);
    const device = fakeSensor('forget-ghost', {fp400SoftwareZones: {1: desk}});
    device.report([{id: 3, x: 0, y: 100}]);
    now += 30 * minute; device.report([{id: 3, x: 0, y: 100}]);
    await fp400Poll(device);
    assert.deepEqual(device.forgotten, [], 'off by default');

    await control.convertSet(null, 'forget_still_targets', 10, {device});
    assert.equal(device.meta.fp400ForgetStill, 10);
    await fp400Poll(device);
    assert.deepEqual(device.forgotten, [3]);
    await fp400Poll(device);
    assert.deepEqual(device.forgotten, [3], 'not again on the next poll');

    // The sensor still reports it: its time starts again from that report.
    now += minute; device.report([{id: 3, x: 0, y: 100}]);
    now += 9 * minute; device.report([{id: 3, x: 0, y: 100}]);
    await fp400Poll(device);
    assert.deepEqual(device.forgotten, [3]);
    now += minute; await fp400Poll(device);
    assert.deepEqual(device.forgotten, [3, 3]);
    await stop(device);
});

test('a person who moves is never forgotten', async (t) => {
    let now = 1e12;
    t.mock.method(Date, 'now', () => now);
    const device = fakeSensor('forget-person', {fp400SoftwareZones: {1: desk}, fp400ForgetStill: 5});
    for (let i = 0; i < 20; i++) {device.report([{id: 1, x: (i % 2) * 15, y: 100}]); now += minute; await fp400Poll(device);}
    assert.deepEqual(device.forgotten, []);
    await stop(device);
});

test('while positions are paused, a forgotten target leaves its zone', async (t) => {
    let now = 1e12;
    t.mock.method(Date, 'now', () => now);
    const device = fakeSensor('forget-held', {fp400SoftwareZones: {1: desk}, fp400ForgetStill: 15});
    device.report([{id: 7, x: 0, y: 100}]);
    device.presence(1);
    now += 14 * minute; await fp400Poll(device);
    const held = definition.toZigbee.find(c => c.key.includes('software_zone_1_config'));
    const state = async () => {let s; await held.convertGet(null, 'software_zone_1_config', {device, publish: p => {s = p; device.published.push(p);}}); return s;};
    assert.deepEqual([(await state()).tracking_status, (await state()).software_zone_1_occupancy], ['held', true]);

    now += minute; device.published.length = 0;
    await fp400Poll(device);
    assert.deepEqual(device.forgotten, [7]);
    assert.ok(device.published.some(p => p.action === 'software_zone_1_leave'), 'leave event');
    now += 3000;
    const s = await state();
    assert.deepEqual([s.software_zone_1_occupancy, s.software_zone_1_count], [false, 0]);

    // The sensor still sees someone there: they come back with the next report.
    device.report([{id: 8, x: 0, y: 100}]);
    assert.equal((await state()).software_zone_1_occupancy, true);
    await stop(device);
});

test('while positions flow, the next report decides', async (t) => {
    let now = 1e12;
    t.mock.method(Date, 'now', () => now);
    const device = fakeSensor('forget-fresh', {fp400SoftwareZones: {1: desk}, fp400ForgetStill: 1});
    device.report([{id: 2, x: 0, y: 100}]);
    now += minute; device.report([{id: 2, x: 0, y: 100}]);
    device.published.length = 0;
    await fp400Poll(device); await tick();
    assert.deepEqual(device.forgotten, [2]);
    assert.ok(!device.published.some(p => p.action), 'no leave until a report shows it gone');
    device.report([]); await tick();
    assert.ok(device.published.some(p => p.action === 'software_zone_1_leave'));
    await stop(device);
});

test('a refusal is logged and tried again only after the chosen minutes', async (t) => {
    let now = 1e12;
    t.mock.method(Date, 'now', () => now);
    const device = fakeSensor('forget-refused', {fp400SoftwareZones: {1: desk}, fp400ForgetStill: 5});
    device.refuse = true;
    device.report([{id: 5, x: 0, y: 100}]);
    now += 5 * minute; device.report([{id: 5, x: 0, y: 100}]);
    await fp400Poll(device);
    device.refuse = false;
    now += 4 * minute; await fp400Poll(device);
    assert.deepEqual(device.forgotten, []);
    now += minute; await fp400Poll(device);
    assert.deepEqual(device.forgotten, [5]);
    await stop(device);
});

test('the minutes are checked, kept with the sensor and published back; turning it on starts positions without zones', async () => {
    const device = fakeSensor('forget-setting', {});
    for (const bad of ['', 'x', -1, 241, 2.5]) await assert.rejects(() => control.convertSet(null, 'forget_still_targets', bad, {device}), /0\.\.240 minutes/);
    assert.deepEqual((await control.convertSet(null, 'forget_still_targets', '20', {device})).state, {forget_still_targets: 20});
    let published;
    await control.convertGet(null, 'forget_still_targets', {device, publish: p => {published = p;}});
    assert.deepEqual(published, {forget_still_targets: 20});
    const commands = [];
    device.getEndpoint = () => ({read: async (c, [id]) => ({[id]: [18, 19, 20].includes(id) ? Buffer.alloc(40) : 0}), command: async (c, command) => {commands.push(command); return {statusCode: 0};}});
    await fp400Poll(device);
    assert.deepEqual(commands, ['subscribeLocationData']);
    await stop(device);
});
