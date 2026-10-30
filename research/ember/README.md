# Ember receive-fragment laboratory

This is an isolated reproduction of the experimental port posted by vize69 in [zigbee-herdsman issue #1886](https://github.com/Koenkk/zigbee-herdsman/issues/1886#issuecomment-5945356547). The port builds on [0SkillAllLuck/Homey PR #10](https://github.com/0SkillAllLuck/homey-shs-enhanced/pull/10). Their patch and original 16 tests are credited here; this contribution adds reproducible setup, pinned dependencies, exact source hashes, a converter-boundary test for synthetic 4/10 targets and an exact memory-limit test.

The patch is deliberately unchanged from the published experiment. It is not installed into a running Zigbee2MQTT instance and is not an official herdsman change.

## Reproduce

Use Node 22. From the repository root:

```sh
npm ci --ignore-scripts
cd research/ember
npm ci --ignore-scripts
npm run prepare:experiment
npm test
npm run typecheck
```

Preparation applies the local patch to a disposable build copy and writes an experimental adapter beside the pinned package's adapter. It checks herdsman 10.10.0 and source SHA256:

- upstream commit: 3cb89ad906bd9b2de8b3dfed20d5a21070a467d2
- source: 78643e51d94c4ef41ea95da0d03895d664eb628ae94686c6a3951154c9284a94
- patched source: 5eb721b3a4b16435dfca7f0b7791690f575a835d22dc48f8f72b6ba4ee68402c
- Homey reference: 99c73f6a5fa58c0d7cd453f67cd08a03892ec05c

Licences accompany the two source snapshots. The patched runtime and build directory are ignored by Git. No serial connection is opened. This is not the full herdsman build/test suite; strict type checking uses the published package declarations with skipLibCheck.

## Evidence and limits

The first 80-byte block in adapter.test.cjs is an existing public capture. The five-byte continuation is the candidate completion used by Homey's test, not a newly received block. The 4/10-target reports and 4096-byte boundary payloads are synthetic.

18 offline tests pass. They cover fragment ACKs, reassembly, message scoping, identical/conflicting duplicates, out-of-order blocks, fixed expiry, malformed lengths/counts, independent bounded active/completed caches, ACK failures and shutdown/reset cleanup. The unchanged Homey reference accepts 16 out of a burst of 40 completed distinct messages because completed entries occupy its active map; the candidate accepts all 40. This reproduces a software limitation, not an observed hardware failure.

The candidate ACKs through ezspSendReply, uses a one-block receive window assumption, keeps at most 16 active and 128 completed records for a fixed 10 seconds, and limits assembled messages to 4096 bytes. Completed replay suppression is bounded; this is not a general proven APS fragmentation implementation.

Before an upstream adapter PR, resolve capability advertisement, Node Descriptor/R23 negotiation, receive-window configuration and ACK scheduling with herdsman maintainers. Compare the [Silicon Labs host reference](https://github.com/SiliconLabs/gecko_sdk/blob/gsdk_4.4/protocol/zigbee/app/framework/plugin/fragmentation/fragmentation-host.c). Then capture actual block 1 and subsequent blocks with 3 and 4 people on an Ember coordinator, including retries and lost ACKs. None of those hardware checks has been performed here. An adapter patch must remain separate from the FP400 converter release.
