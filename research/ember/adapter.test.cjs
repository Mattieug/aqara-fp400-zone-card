const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const base=path.join(__dirname,'node_modules/zigbee-herdsman/dist');
const {EmberAdapter:Original}=require(base+'/adapter/ember/adapter/emberAdapter.js');
const {EmberAdapter:Patched}=require(base+'/adapter/ember/adapter/emberAdapter.experimental.js');
const enums=require(base+'/adapter/ember/enums.js');
const {EmberIncomingMessageType:T,SLStatus}=enums;
const warnings=[];
require(base+'/utils/logger.js').setLogger({debug(){},info(){},error(){},warning:x=>warnings.push(x)});
let now=1000;
const previousNow=Object.getOwnPropertyDescriptor(performance,'now');
Object.defineProperty(performance,'now',{value:()=>now,configurable:true});
after(()=>{if(previousNow)Object.defineProperty(performance,'now',previousNow);else delete performance.now;});
// Block 0 is the published real capture; block 1 is the candidate completion used in Homey PR #10.
// No claim that the missing block was received on hardware.
const b0=Buffer.from('1c5f110a8b00004c030009002001297500292c0029000029000021f00a300030fe20000900200029e2ff29020029090029170021a00f300030fe20000900200429e8ff29020029000029170021d00730','hex');
const b1=Buffer.from('0030fe2000','hex');
const full=Buffer.concat([b0,b1]);
const frame=(groupId=0x0200,sequence=29,extra={})=>({profileId:260,clusterId:0xfc0c,sourceEndpoint:1,destinationEndpoint:1,options:0x8140,groupId,sequence,...extra});
function harness(Class=Patched){
 const a=Object.create(Class.prototype);a.apsFragments=new Map();a.apsCompletedFragments=new Map();
 a.delivered=[];a.acks=[];a.resolved=[];a.oneWaitress={resolveZCL:p=>a.resolved.push(p)};
 a.ezsp={async ezspSendReply(sender,aps,contents){a.acks.push({sender,aps,contents});return SLStatus.OK},async stop(){},removeAllListeners(){}};
 a.on('zclPayload',p=>a.delivered.push(p));
 a.receive=(group,data,sequence=29,extra={},sender=0x8522,type=T.UNICAST)=>a.onIncomingMessage(type,frame(group,sequence,extra),200,sender,data);
 return a;
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function complete(a,sequence=29,extra={},sender=0x8522){a.receive(0x0200,b0,sequence,extra,sender);a.receive(1,b1,sequence,extra,sender);}
function homeyHarness(){
 // Run the exact upstream Homey method, with the real herdsman superclass and mocked transport.
 const source=fs.readFileSync(path.join(__dirname,'reference/homey-ember.cjs'),'utf8');
 const start=source.indexOf('  onIncomingMessage(type, apsFrame, lastHopLqi, sender, messageContents) {');
 const end=source.indexOf('\n  async onMessageSent(',start);
 const ctx={Buffer,Map,Date,enums,Base:Original,herdsmanLogger:{logger:{warning(){}}},SLStatus,statusName:x=>String(x),EmberApsOption:enums.EmberApsOption,FRAGMENT_TTL_MS:10000,MAX_FRAGMENTED_MESSAGES:16};
 vm.createContext(ctx);vm.runInContext('globalThis.Homey=class extends Base {\n'+source.slice(start,end)+'\n}',ctx);
 return harness(ctx.Homey);
}
test('unpatched 10.10.0 publishes the truncated 80-byte block without ACK',()=>{
 const a=harness(Original);a.receive(0x0200,b0);
 assert.equal(a.delivered.length,1);assert.equal(a.delivered[0].data.length,80);assert.equal(a.acks.length,0);
 assert.equal(a.delivered[0].groupID,0x0200);
});
test('complete 85-byte frame is delivered once and exact duplicates are acknowledged again',async()=>{
 const a=harness();const original=frame();a.receive(0x0200,b0);a.receive(0x0200,b0);a.receive(3,b1);
 assert.equal(a.delivered.length,0);a.receive(1,b1);a.receive(1,b1);await flush();
 assert.deepEqual(a.acks.map(x=>x.aps.groupId),[0xff00,0xff00,0xff01,0xff01]);
 assert.equal(a.delivered.length,1);assert.deepEqual(a.delivered[0].data,full);
 assert.equal(a.delivered[0].groupID,0);assert.equal(a.resolved.length,1);
 assert.equal(a.acks[0].aps.options,0x8140);assert.equal(original.groupId,0x0200);
 assert.equal(a.apsFragments.size,0);
});
test('normal one/two-target and ordinary group/broadcast messages are unchanged and unacknowledged',()=>{
 const a=harness();for(const targets of [1,2]){
  const data=Buffer.from(full.subarray(0,10+25*targets));data.writeUInt16LE(targets,8);
  a.receive(0,data,targets,{options:0x0140});assert.strictEqual(a.delivered.at(-1).data,data);
 }
 a.receive(123,b0,7,{options:0x0140},42,T.MULTICAST);
 a.receive(0,b0,8,{options:0x0140},42,T.BROADCAST);
 assert.equal(a.delivered.length,4);assert.equal(a.delivered[2].groupID,123);
 assert.equal(a.delivered[3].wasBroadcast,true);assert.equal(a.acks.length,0);
});
test('missing first/second blocks, out-of-order blocks and fragmented broadcast/group do not emit partial data',()=>{
 const a=harness();a.receive(1,b1);a.receive(0x0200,b0);a.receive(3,b1);
 a.receive(0x0200,b0,30,{},42,T.MULTICAST);a.receive(0x0200,b0,31,{},42,T.BROADCAST);
 assert.equal(a.delivered.length,0);assert.equal(a.acks.length,1);
});
test('scope includes sender, profile, cluster, endpoints, sequence and message type',()=>{
 const a=harness();const scopes=[{}, {clusterId:6},{profileId:261},{sourceEndpoint:2},{destinationEndpoint:2}];
 for(const extra of scopes)a.receive(0x0200,b0,29,extra);
 for(const extra of scopes)a.receive(1,b1,29,extra);
 complete(a,29,{},0x8523);complete(a,30);a.receive(0x0200,b0,31,{},0x8522,T.UNICAST_REPLY);a.receive(1,b1,31,{},0x8522,T.UNICAST_REPLY);
 assert.equal(a.delivered.length,8);assert.equal(a.apsFragments.size,0);
});
test('conflicting duplicate block is not ACKed and cannot be mixed with a later block',()=>{
 const a=harness();a.receive(0x0200,b0);const changed=Buffer.from(b0);changed[13]^=1;a.receive(0x0200,changed);
 a.receive(1,b1);assert.equal(a.acks.length,1);assert.equal(a.delivered.length,0);
 complete(a,30);assert.equal(a.delivered.length,1);
});
test('inconsistent block-count and option metadata abort incomplete reassembly',()=>{
 for(const extra of [{options:0x8100},{group:0x0300}]){
  const a=harness();a.receive(0x0200,b0);a.receive(extra.group??0x0200,b0,29,extra.group?{}:extra);a.receive(1,b1);
  assert.equal(a.delivered.length,0);assert.equal(a.acks.length,1);
 }
});
test('bad total, empty blocks, oversized last or inconsistent intermediate blocks are refused',()=>{
 const a=harness();a.receive(0,b0);a.receive(0x0200,Buffer.alloc(0));a.receive(0xff00,b0);
 assert.equal(a.acks.length,0);a.receive(0x0200,b0);a.receive(1,Buffer.alloc(81));assert.equal(a.delivered.length,0);
 const b=harness();b.receive(0x0300,b0);b.receive(1,b1);assert.equal(b.delivered.length,0);assert.equal(b.acks.length,1);
});
test('three or more fragments and a one-fragment message assemble correctly',()=>{
 const a=harness();a.receive(0x0300,full.subarray(0,30));a.receive(1,full.subarray(30,60));a.receive(2,full.subarray(60));
 assert.deepEqual(a.delivered[0].data,full);a.receive(0x0100,full,30);
 assert.equal(a.delivered.length,2);assert.equal(a.apsFragments.size,0);
});
test('expiry is fixed at 10s, including repeated incomplete blocks and completed retransmissions',()=>{
 const a=harness();now=1000;a.receive(0x0200,b0);now=10999;a.receive(0x0200,b0);
 now=11000;a.receive(1,b1);assert.equal(a.delivered.length,0);assert.equal(a.apsFragments.size,0);
 now=12000;complete(a,30);now=21999;a.receive(1,b1,30);const before=a.acks.length;
 now=22000;a.receive(1,b1,30);assert.equal(a.acks.length,before);now=1000;
});
test('active and completed caches are bounded independently',()=>{
 const a=harness();for(let s=0;s<17;s++)a.receive(0x0200,b0,s);
 assert.equal(a.apsFragments.size,16);assert.equal(a.acks.length,16);
 a.receive(1,b1,0);a.receive(0x0200,b0,17);assert.equal(a.apsFragments.size,16);
 const b=harness();for(let s=0;s<150;s++)complete(b,s);
 assert.equal(b.delivered.length,150);assert.equal(b.apsCompletedFragments.size,128);assert.equal(b.apsFragments.size,0);
});
test('Homey reference stalls at 16 completions; candidate accepts the same 40-message burst',()=>{
 const reference=homeyHarness();const candidate=harness();for(let s=0;s<40;s++){complete(reference,s);complete(candidate,s);}
 assert.equal(reference.delivered.length,16);assert.equal(candidate.delivered.length,40);
});
test('changed block 0 after completed APS sequence reuse starts a fresh message',()=>{
 const a=harness();complete(a);const changed=Buffer.from(b0);changed[13]=8;
 a.receive(0x0200,changed);a.receive(1,b1);assert.equal(a.delivered.length,2);
 assert.equal(a.delivered[1].data[13],8);
});
test('ACK errors are logged without adapter-queue retries or unhandled rejection',async()=>{
 for(const mode of ['status','reject']){
  const a=harness();let calls=0;a.ezsp.ezspSendReply=async()=>{calls++;if(mode==='reject')throw Error('test failure');return SLStatus.FAIL};
  complete(a);await flush();assert.equal(calls,2);assert.equal(a.delivered.length,1);
 }
 assert.equal(warnings.length,4);
});
test('stop and NCP-disconnect clear both caches',async()=>{
 const a=harness();complete(a);a.receive(0x0200,b0,30);await a.stop();
 assert.equal(a.apsFragments.size,0);assert.equal(a.apsCompletedFragments.size,0);
 const b=harness();complete(b);b.receive(0x0200,b0,30);b.onNcpNeedsResetAndInit(0);
 assert.equal(b.apsFragments.size,0);assert.equal(b.apsCompletedFragments.size,0);
});
test('adapter re-initialization clears caches before accessing transport',async()=>{
 const a=harness();complete(a);a.receive(0x0200,b0,30);
 a.ezsp.start=async()=>{throw Error('offline init stop');};
 await assert.rejects(()=>a.initEzsp(),/offline init stop/);
 assert.equal(a.apsFragments.size,0);assert.equal(a.apsCompletedFragments.size,0);
});

// Added here: exercise the boundary into the actual external converter.
test('synthetic four- and ten-target frames traverse the patched adapter and the FP400 decoder',async()=>{
 const {decodeTrackingFrame}=await import('../../z2m/aqara-fp400.mjs');
 for(const count of [4,10]){
  const records=Array.from({length:count},(_,i)=>{const record=Buffer.from(full.subarray(10,35));record[3]=i;record.writeInt16LE(i*10,5);return record;});
  const header=Buffer.from(full.subarray(0,10));header.writeUInt16LE(count,8);
  const payload=Buffer.concat([header,...records]),a=harness(),blocks=Math.ceil(payload.length/80);
  for(let i=0;i<blocks;i++)a.receive(i===0?blocks<<8:i,payload.subarray(i*80,(i+1)*80));
  assert.equal(a.delivered.length,1);assert.equal(a.acks.length,blocks);
  const decoded=decodeTrackingFrame(a.delivered[0].data);
  assert.equal(decoded.reported,count);assert.deepEqual(decoded.targets.map(t=>t.x),Array.from({length:count},(_,i)=>i*10));
 }
});
test('the 4096-byte bound accepts its exact limit and refuses one extra byte',()=>{
 for(const length of [4096,4097]){
  const a=harness();a.receive(0x0200,Buffer.alloc(2049));a.receive(1,Buffer.alloc(length-2049));
  assert.equal(a.delivered.length,length===4096?1:0);assert.equal(a.apsFragments.size,0);
  if(length===4096)assert.equal(a.delivered[0].data.length,4096);
 }
});
