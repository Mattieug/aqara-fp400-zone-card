import {test} from 'node:test';
import assert from 'node:assert/strict';
import converter from '../z2m/aqara-fp400.mjs';

test('dashboard-only telemetry remains on MQTT but is disabled in HA discovery by default',()=>{
    for(const name of ['targets_xy','tracking_last_update','tracking_last_frame','motion_last_frame',
        'tracking_status','learning_result_time','interference_mask_hex','entry_exit_mask_hex','edge_mask_hex']){
        const expose=converter.exposes.find(x=>x.property===name);
        assert.ok(expose, `missing expose: ${name}`);
        assert.equal(expose.homeassistant?.enabledByDefault,false,`${name} should not create an enabled HA entity`);
    }
});

test('automation entities and all configuration write controls remain enabled',()=>{
    for(const name of ['software_zone_1_occupancy','software_zone_1_count','software_zone_1_activity',
        'software_zone_1_config','interference_zone_add','interference_zone_remove',
        'interference_clear','map_rotation','remove_target','forget_still_targets']){
        const expose=converter.exposes.find(x=>x.property===name);
        assert.ok(expose,`missing expose: ${name}`);
        assert.notEqual(expose.homeassistant?.enabledByDefault,false,`${name} must stay enabled`);
    }
});
