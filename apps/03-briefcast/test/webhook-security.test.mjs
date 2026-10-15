import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { readRawWebhookBody, verifyProviderWebhook } from '../src/lib/provider-webhook.ts';

const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;
const raw = Buffer.from('{"type":"email.bounced","data":{"email_id":"email_1"}}');
function signed(body = raw, prefix = 'svix', id = 'msg_1', timestamp = Math.floor(Date.now()/1000)) {
  const signature = createHmac('sha256', Buffer.alloc(32, 7)).update(`${id}.${timestamp}.`).update(body).digest('base64');
  return new Headers({ [`${prefix}-id`]: id, [`${prefix}-timestamp`]: String(timestamp), [`${prefix}-signature`]: `v1,${signature}` });
}
test('valid raw body and both documented header families verify', () => {
  for (const prefix of ['svix','webhook']) assert.equal(verifyProviderWebhook(raw, signed(raw, prefix), secret, prefix).id, 'msg_1');
});
test('tampering, stale/future timestamps, missing secret and unsigned requests fail', () => {
  assert.throws(() => verifyProviderWebhook(Buffer.from('{}'), signed(), secret, 'svix'));
  assert.throws(() => verifyProviderWebhook(raw, signed(), undefined, 'svix'));
  assert.throws(() => verifyProviderWebhook(raw, new Headers(), secret, 'svix'));
  for (const offset of [-301,301]) assert.throws(() => verifyProviderWebhook(raw, signed(raw,'svix','msg_1',Math.floor(Date.now()/1000)+offset), secret,'svix'));
});
test('rotation accepts a valid v1 signature among multiple signatures', () => {
  const headers = signed(); headers.set('svix-signature', `v1,aW52YWxpZA== ${headers.get('svix-signature')}`);
  assert.equal(verifyProviderWebhook(raw, headers, secret, 'svix').id, 'msg_1');
});
test('mixed header families cannot form one verified request', () => {
  const headers = signed(); headers.set('webhook-id','msg_1');
  assert.throws(() => verifyProviderWebhook(raw, headers, secret, 'webhook'));
});
test('raw body reader rejects oversized input before parsing', async () => {
  await assert.rejects(readRawWebhookBody(new Request('https://example.test', {method:'POST',body:'123456'}), 5), /too large/);
});

// Execute the actual route body with only Next/DB/queue boundaries replaced.
// node:module strips types; no application imports or outbound calls execute.
async function routeHarness(provider) {
  const source = await readFile(new URL(`../src/app/api/webhooks/${provider}/route.ts`, import.meta.url), 'utf8');
  const executable = stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\n/gm, '').replace('export async function POST','async function POST');
  const state = { receipts: new Set(), writes: 0, jobs: new Map(), fail: false };
  const schema = {providerWebhookReceipts:'receipts',messages:{providerMessageId:'email',id:'id'},customers:{id:'customer'},bots:{recallBotId:'bot',id:'id'},meetings:{id:'meeting'}};
  const tx = {
    insert: () => ({ values: ({id}) => ({ onConflictDoNothing: () => ({ returning: async () => {
      if(state.receipts.has(id)) return []; state.receipts.add(id); return [{id}];
    } }) }) }),
    query: { messages: {findFirst: async () => ({id:'email_1',customerId:'customer_1'})},bots:{findFirst:async()=>({id:'bot_1',meetingId:'meeting_1'})}},
    update: () => ({ set: () => ({ where: async () => { if(state.fail) throw new Error('DB unavailable');state.writes++; } }) }),
  };
  const db = { transaction: async work => {
    const receipts = new Set(state.receipts);const writes = state.writes;
    try{return await work(tx);}catch(error){state.receipts=receipts;state.writes=writes;throw error;}
  }};
  const deps={NextResponse:{json:(body,init)=>Response.json(body,init)},eq:()=>true,db,schema,readRawWebhookBody,verifyProviderWebhook,createHash,
    mapBotStatus:code=>code==='done'?'done':'in_call',queue:()=>({add:async(_name,_body,options)=>{state.jobs.set(options.jobId,options);}})};
  const POST = new Function('deps', `const {${Object.keys(deps).join(',')}}=deps;${executable};return POST;`)(deps);
  return {POST,state};
}

test('Recall handler rejects unsigned events, verifies both account header families and deduplicates jobs', async () => {
  process.env.RECALL_WORKSPACE_VERIFICATION_SECRET=secret;
  process.env.RECALL_SVIX_WEBHOOK_SECRET=secret;
  const {POST,state}=await routeHarness('recall');
  const body=Buffer.from(JSON.stringify({event:'bot.done',data:{bot:{id:'bot_1'},data:{code:'done'}}}));
  assert.equal((await POST(new Request('https://example.test',{method:'POST',body}))).status,400);
  assert.equal(state.writes,0);assert.equal(state.jobs.size,0);
  for(const prefix of ['webhook','svix']) {
    const request=()=>new Request('https://example.test',{method:'POST',body,headers:signed(body,prefix,'msg_1')});
    assert.equal((await POST(request())).status,200);
  }
  assert.equal(state.writes,1);assert.equal(state.jobs.size,1);assert.equal(state.receipts.size,1);
  const options=[...state.jobs.values()][0];assert.equal(options.removeOnComplete,false);assert.equal(options.removeOnFail,false);
});
test('Recall transaction failures allow retry without accepting unsigned events', async () => {
  process.env.RECALL_WORKSPACE_VERIFICATION_SECRET=secret;
  const {POST,state}=await routeHarness('recall');state.fail=true;
  const body=Buffer.from(JSON.stringify({data:{bot_id:'bot_1',status:{code:'done'}}}));
  const request=()=>new Request('https://example.test',{method:'POST',body,headers:signed(body,'webhook')});
  await assert.rejects(POST(request()),/DB unavailable/);assert.equal(state.receipts.size,0);
  state.fail=false;assert.equal((await POST(request())).status,200);assert.equal(state.jobs.size,1);
});
