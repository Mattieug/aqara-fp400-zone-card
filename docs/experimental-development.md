# FP400 development build 0.6.0-dev.1

This branch combines upstream PR #7 (MQTT streaming) followed by PR #9 (native zones), then the independent fixes and extensions described here. It is a development build, not a hardware-validated release. The card and converter must come from the same commit. The existing installation remains a single converter file and a HACS-compatible card; the Ember laboratory is not part of either runtime.

## Options

Set these in the FP400 device options in Zigbee2MQTT:

| Option | Default | Effect |
| --- | --- | --- |
| native_zones | false | Eight native editors and occupancy/count entities, separate from software zones. |
| native_zone_poll_interval | 60 seconds | 10–300 seconds; poll occupancy of native zones without a reporting slot. |
| tracking_mode | auto | auto renews tracking for software zones or still-target forgetting; always also maintains a native-only live map. |
| experimental_features | false | Complete native catalogue reads and raw mapped child-event diagnostics. |
| restore_native_zones | false | Requires native_zones and experimental_features; opt in to conservative recreation of confirmed missing zones. |

The sensor has five reporting slots. Allocation is deterministic: room presence, native zones ordered by ID, then light if there is space. Old lower-priority assignments are released first. Zones without a slot are polled at the selected interval; count and light retain the separate 60-second poll. A failed read preserves the last state; it never publishes absence. The inspector explains periodic versus spontaneous presence reporting when that diagnostic is available.

Tracking renewal is acknowledged and renewed before the 120-second lease expires. It does not solve missing APS fragments on Ember. Track IDs are temporary, not identities. Raw fall, posture and native event codes have no validated interpretation.

## Native catalogue and recovery

A complete catalogue read validates every typed record, mask and ID, and checks the endpoint map both before and after. A truncated reply or disagreement leaves the last geometry visible as cached and sets native_catalogue_status to uncertain. Source diagnostics distinguish observed, cached, acknowledged and unknown geometries.

A zone created outside this converter is displayed without being adopted. Its geometry and scalar settings remain protected. Select the zone, confirm the takeover and choose “Use this existing geometry” before changing its settings. Reading a zone is not authorization to overwrite it.

Recovery requires two identical complete catalogues at least 10 seconds apart, a completed scalar restoration and a locally confirmed zone that is absent in both the catalogue and endpoint map. Catalogue reads normally occur every 60 seconds. Only one missing zone is recreated per maintenance pass, followed by the existing endpoint-settling process. Pending/error operations, intentional deletions and existing zones are not automatically replaced. An unreadable catalogue, including a fragmentation failure, prevents recovery.

A new zone stays pending for at least 20 seconds, then its saved timeout and sensitivity are restored and read back. The delay follows PR #9's latest correction and still needs a physical retest.

## Backup and import

Open Settings and use Download backup. JSON format aqara-fp400, schema version 1, records settings, masks, software zones, native geometry, creation time, card/converter versions and HA's firmware version when available. Unknown values are listed as unavailable and omitted. This is a snapshot of the last confirmed/read state, not a substitute for a full Zigbee2MQTT data backup.

Choose a JSON file to preview changes. Preview sends no commands. Apply processes the reviewed differences sequentially and waits for confirmation. A failed operation stops the import and retains the remaining work; a later retry skips changes already confirmed. New native zones are confirmed before applying their scalar settings. Conflicting external changes, unknown fields, invalid ranges, incompatible schema versions and a different known device IEEE address block the affected operation. Foreign native zones require a separate explicit takeover.

Omitted fields never imply deletion. Masks are changed through the existing validated add/remove commands. Native clears remain explicit. Import is not a cross-device cloning facility or an atomic transaction.

## Learning and restoration

Learning acknowledgement, result reception and interpretation are distinct. An unknown/cleared timestamp cannot end learning. A new result must have a newer valid timestamp, result_received state and an integer byte code. No result code is advertised as a verified success.

After a result, the card requests configuration readback and waits for areas_read_time, emitted only after all three masks were validated. It reports added/removed cells. A readback error preserves the previous view and reports uncertainty.

Scalar/area restoration distinguishes explicit unsupported-attribute status from transient failures. Failed steps retry after 10, 30, 60 and then 300 seconds using the existing maintenance loop. A sensor announcement starts a new check. User scalar writes share the device queue with restoration. restore_status and restore_error show progress; failed local persistence is an error even if the physical write succeeded.

## Home Assistant and retained history

The card uses MQTT streaming for frequent coordinates when the HA user is an administrator. Ordinary users can use the entity fallback: enable targets_xy, tracking_last_update and tracking_status. Also enable learning_result_time, learning_state, learning_result_code and areas_read_time for the full learning workflow without an administrator session. Enable per-zone source/reporting diagnostics if needed in that fallback.

New frequent or diagnostic data is disabled in HA discovery by default. Native ownership is enabled because it protects editing. Existing useful occupancy and count histories remain available. Disabled HA entities do not suppress the underlying Zigbee2MQTT JSON.

For an automation, use native_zone_N_occupancy or software_zone_N_occupancy where presence is the decision. For raw observation, an MQTT trigger can inspect tracking_targets:

```yaml
triggers:
  - trigger: mqtt
    topic: zigbee2mqtt/living_room_fp400
conditions:
  - condition: template
    value_template: >-
      {{ trigger.payload_json.tracking_targets is defined
         and trigger.payload_json.tracking_status == 'valid' }}
actions:
  - action: logbook.log
    data:
      name: FP400 observation
      message: >-
        {{ trigger.payload_json.tracking_targets | count }} tracks received
```

Replace the friendly name. Coordinates use the existing raw device coordinate convention (the card's calibrated cm/grid mapping). Validate orientation on the physical sensor. A target's raw zone/in_zone fields are retained, but only a verified endpoint/catalogue association should be used as native membership. Do not infer a human identity, fall or posture classification from these records.

## Install, update and roll back

1. Record the commit and save Zigbee2MQTT's data directory, device database, current converter and current card file. Export JSON from the card if available.
2. For development testing, copy both z2m/aqara-fp400.mjs and dist/fp400-zone-card.js from the same commit. Keep only one active FP400 converter. Use a separate card resource or a matching HACS development download and refresh the browser cache.
3. Start with the new experimental options off. Check versions, existing entity IDs, settings and masks before enabling native catalogue research or recovery.
4. To roll back, restore the previous converter and card together, restart Zigbee2MQTT and reload the dashboard. A software rollback does not undo physical writes. Restore configuration explicitly from a reviewed backup; restoring the Zigbee2MQTT database should be done only with Zigbee2MQTT stopped.

No installation, coordinator, HA account or physical sensor was changed during this software contribution. See [validation and remaining hardware work](validation-and-hardware.md) and the [Ember laboratory](../research/ember/README.md).
