# Validation and hardware follow-up

## Software validation — 30 October 2026

Runtime: Node 22.20.0; pinned root dependencies zigbee-herdsman 10.10.0, zigbee-herdsman-converters 26.115.1, playwright-core 1.49.0. The system Node 26.8.2 is outside herdsman's supported range; verification used Node 22.

Latest converter/unit-test commit: 5a087bd. The unchanged card/browser suite was tested at d8bdbf5. Subsequent documentation-only commits do not change those runtime files.

| Check | Result | Scope |
| --- | --- | --- |
| Root unit suite | 167 passed, 0 failed | Converter, card logic, replay fixtures, concurrency, persistence and simulated devices |
| Chromium browser suite | 166 passed, 0 failed | Full final suite; desktop/mobile, renamed settings, ordinary/admin users, MQTT reconnect/multiple cards, state ordering, native editor and import |
| Ember laboratory | 18 passed, 0 failed | Published port's 16 tests plus converter boundary and exact size limit |
| Ember strict type check | Passed | Patched full adapter against published package declarations; skipLibCheck |
| Physical FP400 / HA / Ember validation | Not run | No sensor or coordinator was connected for this contribution |

The browser suite found an additional interaction between PR #7 and the offline preview: a disabled timestamp entity could mask the offline diagnosis with a permissions warning. The final full rerun includes its fix. Earlier failed runs are not counted as a successful validation.

Each contribution branch was separately extracted and tested, without integration changes:

| Branch | Commit | Unit tests |
| --- | --- | ---: |
| fix/renamed-settings | 2a09297 | 86 |
| fix/learning-result | 76f8622 | 87 |
| fix/partial-presence | 51108d4 | 87 |
| fix/room-endpoints | ee7c177 | 90 |
| fix/restore-retries | 90597b2 | 89 |
| fix/native-reporting | 43e3a66 | 118 |
| ci/browser-tests | 5337280 | 84 |

All these unit runs passed. Targeted browser checks before integration also passed: RENAMED 4 assertions and X learning/settings 12 assertions. The complete integrated suite above is the broader UI evidence.

## Capture provenance

- test/fixtures/fp400-attribute-sync.json contains 20 existing frames: 17 from fp400-m3-installation-20261022-174731Z and 3 from fp400-m3-coordinates-20261022-192810Z. Session, capture filename, SHA256 and frame numbers are retained. They came from [upstream PR #9](https://github.com/bobtekkk/aqara-fp400-zone-card/pull/9). The extracted fixtures do not record firmware, so firmware is explicitly null rather than inferred.
- Existing tracking tests contain published truncated reports from [Zigbee2MQTT issue #33146](https://github.com/Koenkk/zigbee2mqtt/issues/33146).
- The Ember block-0 capture and synthetic continuation are labelled separately in [the laboratory](../research/ember/README.md).
- Test helpers, failure injection, multi-target extensions, catalogue mutations, power-cut simulation and browser preview data are synthetic. They are not physical captures.

## Firmware evidence matrix

Keep three separate claims: a readable attribute, a write confirmed by readback, and an observed physical effect. A software test never establishes the third.

| Firmware / source | Capability | Read evidence | Write evidence | Physical effect / remaining proof |
| --- | --- | --- | --- | --- |
| 20260724, maintainer's 30 Oct report | Native zone append/update/remove, masks, endpoint map | Reported by maintainer | Native response and readback reported | Creation resets timeout to 10 s; revised >=20 s settling still needs retest |
| 20260724, same report | Native reporting allocation | Reported by maintainer | Allocation accepted | This contribution's deterministic reallocation has simulated coverage only |
| Unknown in extracted M3 fixtures | Room/child occupancy, count, room activity, light | Captured frames replayed | Not established by those frames | No claim about new physical scenarios |
| To record on user's sensor | Mounting, AI flags, zone sensitivity, approach thresholds | Pending hardware run | Pending hardware run | Pending one-parameter-at-a-time scenarios |
| To record on user's sensor | Learning codes and changes to masks | Raw decoder/readback tested offline | Command ACK is distinct from result | No success-code interpretation validated here |
| To record on user's sensor | Zone boolean, child activity, fall/posture/recognition codes | Raw diagnostics only | No new interpreted control | Meaning not established; do not expose as proven functions |

Maintainer source: [PR #9 comment](https://github.com/bobtekkk/aqara-fp400-zone-card/pull/9#issuecomment-6518505017). This is attributed historical evidence, not a hardware test performed by this contribution.

## Hardware acceptance record

Create a result record for every run with date, tested commit, sensor model/hardware/firmware, coordinator model/firmware/adapter type, Zigbee2MQTT, herdsman, HA and card versions, logs and capture hashes.

1. Pair directly with Zigbee2MQTT. Start with experimental features and native recovery off. Verify room presence, light, settings, rename behavior and the existing automations.
2. Exercise 0→1→4→8→2 native zones, shuffled IDs, deletion/recreation and foreign zones. Observe spontaneous versus polled occupancy, exact geometry readback, timeout and sensitivity after at least 20 seconds, and the five-slot allocation.
3. Record entries, exits and stillness with 1, 2, 3 and 4 actual people. Ten targets remain a software-only test until separate hardware evidence exists. Verify room/zone timer interaction: [existing observation](https://github.com/Koenkk/zigbee2mqtt/issues/33146#issuecomment-6324569412).
4. Measure sensor latency separately from transport latency. For a polled zone, additional delay must stay within the configured poll interval plus measured communication time under the tested load. Include lost replies and reconnects.
5. With complete catalogue reads verified, test opt-in recovery: two consistent absence reads, intentional deletion not recreated, foreign zone not replaced, interrupted creation not silently accepted. Perform five power cycles, including interruption during creation, followed by 24 hours of observation.
6. For AI/mounting/threshold/learning experiments: capture baseline, change one parameter, execute the same physical scenario, capture again and return to baseline. Record unsupported and indeterminate outcomes.
7. Ember: use an actual Ember coordinator and capture both/all fragments at 3 and 4 people; test lost ACKs, duplicates, expiry and reconnect. Resolve protocol capability/window questions before installing a candidate adapter.

## Upstream path

Independent fixes target main. The reporting-slot fix is based only on PR #9's f3b25bd head. The integration base is upstream PR #7 followed by PR #9; this order is preserved. Advanced features remain in the development branch while the upstream dependencies and hardware checks are pending.

The official basic-support [converters PR #13385](https://github.com/Koenkk/zigbee-herdsman-converters/pull/13385) is a separate effort. This contribution does not claim to merge it or make this external converter official. The fixture provenance, physical acceptance record and tested attribute matrix can support that work; advanced protocol features should be proposed in separate groups after basic compatibility is confirmed.
