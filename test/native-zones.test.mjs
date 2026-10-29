import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Zcl} from 'zigbee-herdsman';
import {prepareDefinition} from 'zigbee-herdsman-converters';
import definition, {readNativeZoneMap, nativeZoneState, fp400UnreportedPoll, fp400ReportingSlots, parseNativeZone} from '../z2m/aqara-fp400.mjs';

const model = prepareDefinition({...definition});
const control = model.toZigbee.find(c => c.key.includes('native_zone_1_config'));
const mask = '00000000000001000100010000000000000000000000000000000000000000000000000000000000';
const config = {name: 'Desk', mask_hex: mask, absence_timeout: 0};
let sequence = 0;
function sensor(entries = []) {
    const zones = new Map(entries), endpoints = new Map(), published = [], commands = [], writes = [], reads = [];
    const device = {
        ieeeAddr: `native-test-${++sequence}`, meta: {}, customClusters: {}, zones, commands, writes, reads, published,
        response: {errorCode: 0}, capacity: 8, persisted: {}, saves: 0,
        addCustomCluster(name, cluster) {this.customClusters[name] = cluster;},
        save() {this.saves++; if (this.failSave?.(this.saves)) throw new Error('disk failed'); this.persisted = structuredClone(this.meta);},
        getEndpoint(ID) {
            if (!endpoints.has(ID)) endpoints.set(ID, {
                ID, binds: [{cluster: {ID: 0x0406}, target: {ID: 1}}], timeout: 10,
                bind: async () => {}, configureReporting: async () => {},
                read: async (cluster, [attr]) => {
                    reads.push([ID, cluster, attr]);
                    if (device.failRead?.(ID, cluster, attr)) throw new Error('read failed');
                    if (cluster === 'aqaraFp400Radar' && attr === 0) return {0: [...zones.values()]};
                    if (cluster === 'aqaraFp400Radar' && attr === 1) return {1: [...zones].find(([, ep]) => ep === ID)?.[0]};
                    if (cluster === 'aqaraFp400Config' && attr === 17) return {17: device.capacity};
                    if (cluster === 'msOccupancySensing' && attr === 3) return {3: endpoints.get(ID).timeout};
                    return {[attr]: 0};
                },
                write: async (cluster, data, options) => {
                    writes.push([ID, cluster, data, options]);
                    if (device.failWrite) throw new Error('write failed');
                    if (cluster === 'msOccupancySensing') endpoints.get(ID).timeout = data[3].value;
                },
                command: async (cluster, name, args, options) => {
                    commands.push({cluster, name, args, options, persisted: structuredClone(device.persisted)});
                    if (device.commandGate) await device.commandGate;
                    if (device.response instanceof Error) throw device.response;
                    // The command may have reached the sensor even if the native ACK is missing.
                    const id = args.zone?.[0].elmVal ?? args.zoneId;
                    if (name === 'removeZone') zones.delete(id);
                    else if (!zones.has(id)) zones.set(id, 7);
                    return device.response;
                },
            });
            return endpoints.get(ID);
        },
    };
    return device;
}
const meta = device => ({device, publish: state => device.published.push(state)});
const set = (device, value, id = 1) => control.convertSet(null, `native_zone_${id}_config`, value, meta(device));
const start = device => model.onEvent({type: 'start', data: {device, options: {disabled: true}}});
const stop = device => model.onEvent({type: 'stop', data: {ieeeAddr: device.ieeeAddr}});

test('native append/update/remove encode captured M3 commands, keep holes, and persist pending before I/O', async () => {
    const device = sensor([[99, 4]]);
    device.meta.fp400Saved = {old: {name: 'zone_1_absence_timeout'}, keep: {name: 'installation_height'}};
    await start(device);
    const first = await set(device, config);
    assert.deepEqual(JSON.parse(first.state.native_zone_1_config), config);
    assert.equal(device.commands[0].persisted.fp400NativeZones[1].status, 'pending');
    assert.deepEqual(device.meta.fp400Saved, {keep: {name: 'installation_height'}});
    assert.equal(device.published[0].native_zone_1_config, 'unmanaged');
    assert.equal(device.published[0].native_zone_1_status, 'pending');
    assert.equal(device.writes[0][0], 7, 'uses assigned endpoint, not id+2');
    const frame = (sent, tsn) => Zcl.Frame.create(1, 0, sent.options.disableDefaultResponse, sent.options.manufacturerCode, tsn,
        sent.name, sent.cluster, sent.args, device.customClusters).toBuffer().toString('hex');
    // fp400-m3-20261022-144639Z, SHA256 7682505476d39f460bf6c66bf6bec9f1b87e8e2977de446043ac5e504bb4fc5e, frames 3262 / 4024 / 4932.
    assert.equal(frame(device.commands[0], 0x5c), '055f115c040400200130004128000000000000010001000100000000000000000000000000000000000000000000000000000000001001');
    const changed = {...config, mask_hex: '00000000000001800100010000000000000000000000000000000000000000000000000000000000'};
    await set(device, changed);
    assert.equal(frame(device.commands[1], 0x66), '055f1166060400200130004128000000000000018001000100000000000000000000000000000000000000000000000000000000001001');
    const cleared = await set(device, 'clear');
    assert.equal(frame(device.commands[2], 0), '055f11000801');
    assert.equal(cleared.state.native_zone_1_config, 'clear');
    assert.deepEqual([...device.zones], [[99, 4]], 'other IDs survive all three operations');
    const cluster = Zcl.Utils.getCluster('aqaraFp400Config', 0x115f, device.customClusters);
    assert.equal(cluster.commands.appendZone.response, 5);
    assert.equal(cluster.commands.updateZone.response, 7);
    assert.equal(cluster.commands.removeZone.response, 9);
    for (const hex of ['1d5f115c0500', '1d5f11660700', '1d5f11000900']) {
        const bytes = Buffer.from(hex, 'hex');
        assert.deepEqual(Zcl.Frame.fromBuffer(0xfc0a, Zcl.Header.fromBuffer(bytes), bytes, device.customClusters).payload, {errorCode: 0});
    }
    await stop(device);
});

test('foreign IDs, including an ID reused after clear, require explicit overwrite', async () => {
    const device = sensor([[1, 8]]);
    await assert.rejects(set(device, config), /confirm overwrite/);
    await assert.rejects(set(device, 'clear'), /confirm overwrite/);
    assert.equal(device.commands.length, 0);
    await set(device, {clear: true, overwrite: true});
    device.zones.set(1, 4);
    await assert.rejects(set(device, config), /confirm overwrite/);
    await assert.rejects(set(device, 'clear'), /confirm overwrite/);
    await set(device, {...config, overwrite: true});
    assert.equal(device.commands.at(-1).name, 'updateZone');
    await stop(device);
});

test('missing native ACK, rejection, and a failed timeout write leave uncertain geometry after restart', async () => {
    for (const response of [{cmdId: 4, statusCode: 0}, {errorCode: 1}, new Error('Timeout')]) {
        const device = sensor(); device.response = response;
        await assert.rejects(set(device, config));
        assert.equal(device.persisted.fp400NativeZones[1].status, 'error');
        assert.equal(nativeZoneState(device).native_zone_1_config, 'unmanaged');
        device.meta = structuredClone(device.persisted); await stop(device); await start(device);
        await readNativeZoneMap(device);
        assert.equal(nativeZoneState(device).native_zone_1_config, 'unmanaged');
        device.response = {errorCode: 0};
        assert.equal((await set(device, config)).state.native_zone_1_status, 'ready');
        await stop(device);
    }
    const device = sensor(); device.failWrite = true;
    await assert.rejects(set(device, config), /write failed/);
    assert.equal(nativeZoneState(device).native_zone_1_config, 'unmanaged');
    assert.equal(device.persisted.fp400NativeZones[1].status, 'error');
    await stop(device);
});

test('failed metadata save prevents sending, and failed final save never publishes confirmed geometry', async () => {
    const device = sensor(); device.failSave = n => n === 1;
    await assert.rejects(set(device, config), /disk failed/);
    assert.equal(device.commands.length, 0);
    const second = sensor(); second.failSave = n => n === 3; // pending, reporting allocation, final confirmation
    await assert.rejects(set(second, config), /disk failed/);
    assert.equal(nativeZoneState(second).native_zone_1_config, 'unmanaged');
    assert.equal(second.persisted.fp400NativeZones[1].status, 'error');
    assert.ok(second.published.every(s => s.native_zone_1_config === 'unmanaged'));
    await stop(device); await stop(second);
});

test('an interrupted save becomes retryable error at start; normal start and announce never write A0', async () => {
    const device = sensor([[1, 7]]);
    device.meta.fp400NativeZones = {1: {config, status: 'pending', error: ''}};
    await start(device);
    assert.equal(device.persisted.fp400NativeZones[1].status, 'error');
    await readNativeZoneMap(device);
    assert.equal(nativeZoneState(device).native_zone_1_config, 'unmanaged');
    await definition.onEvent({type: 'deviceAnnounce', data: {device}});
    await definition.onEvent({type: 'deviceInterview', data: {device, status: 'started'}});
    assert.equal(device.writes.length, 0);
    await definition.onEvent({type: 'deviceInterview', data: {device, status: 'successful'}});
    assert.deepEqual(device.writes, [[1, 0xfcc0, {160: {value: 1, type: 0x20}}, {manufacturerCode: 0x115f, disableDefaultResponse: false}]]);
    await stop(device);
});

test('unreadable endpoint list or ZoneID blocks mutation and never means absent', async () => {
    for (const attribute of [0, 1]) {
        const device = sensor([[1, 7]]);
        device.failRead = (ep, cluster, attr) => cluster === 'aqaraFp400Radar' && attr === attribute;
        await assert.rejects(set(device, {...config, overwrite: true}), /read failed/);
        assert.equal(device.commands.length, 0);
        assert.equal(nativeZoneState(device).native_zone_1_config, 'unmanaged');
        assert.equal(nativeZoneState(device).native_zone_1_occupancy, null);
        await stop(device);
    }
});

test('reports follow actual ZoneID after endpoint reorder and zone count cannot overwrite room count', async () => {
    const device = sensor([[1, 7], [2, 3]]); await readNativeZoneMap(device);
    const report = async (cluster, ep, data) => {
        const result = {};
        for (const converter of model.fromZigbee.filter(c => c.cluster === cluster && c.type.includes('attributeReport'))) {
            Object.assign(result, await converter.convert(model, {cluster, type: 'attributeReport', endpoint: device.getEndpoint(ep), device, data}, meta(device).publish, {}, meta(device)));
        }
        return result;
    };
    assert.equal((await report('aqaraFp400Radar', 1, {humanCount: 4})).human_count, 4);
    let state = await report('aqaraFp400Radar', 7, {humanCount: 2});
    assert.equal(state.native_zone_1_count, 2); assert.equal(state.human_count, undefined);
    assert.equal((await report('msOccupancySensing', 7, {occupancy: 1})).native_zone_1_occupancy, true);
    device.zones.set(1, 3); device.zones.set(2, 7); await readNativeZoneMap(device);
    assert.equal(nativeZoneState(device).native_zone_1_count, null);
    state = await report('aqaraFp400Radar', 7, {humanCount: 1});
    assert.equal(state.native_zone_2_count, 1); assert.equal(state.native_zone_1_count, null);
    await stop(device);
});

test('native polling and reconfigure wait for CRUD rather than replacing its endpoint map halfway through', async () => {
    const device = sensor(); let release, entered;
    const inCommand = new Promise(resolve => {entered = resolve;});
    device.commandGate = new Promise(resolve => {release = resolve;});
    const endpoint = device.getEndpoint(1), command = endpoint.command;
    endpoint.command = async (...args) => {entered(); return command(...args);};
    const save = set(device, config); await inCommand;
    device.reads.length = 0;
    const poll = fp400UnreportedPoll(device);
    const reconfigure = fp400ReportingSlots.configure[0](device, {ID: 1});
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(device.reads, [[2, 'msIlluminanceMeasurement', 'measuredValue']]);
    release(); await save; await poll; await reconfigure; await stop(device);
});

test('capacity and Home Assistant text length are enforced before sending geometry', async () => {
    const device = sensor([[2, 3]]); device.capacity = 1;
    await assert.rejects(set(device, config), /capacity/);
    assert.equal(device.commands.length, 0);
    assert.throws(() => parseNativeZone({...config, name: '\\'.repeat(32), overwrite: true, mask_hex: '0'.repeat(80)}), /mask/);
    assert.throws(() => parseNativeZone({...config, name: '\u0001'.repeat(32), overwrite: true}), /255/);
    assert.throws(() => parseNativeZone({clear: true, mask_hex: mask}), /Clear/);
    await stop(device);
});
