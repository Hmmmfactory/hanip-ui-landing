import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createNotifications,notificationText} from './notifications.mjs';
const article=()=>({title:'글 제목',status:'published',publishedUrl:'https://example.com/story/post.html',publishedAt:'2026-09-07'});
async function setup(t,transport){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'editorial-notify-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const n=createNotifications(dir,{transport});n.configure({botToken:'12345:abcdefghijklmnopqrstuvw',chatId:'123'});await n.check();n.configure({enabled:true});return n;}
test('telegram delivery requires publication, persists receipt and deduplicates concurrent attempts',async t=>{
 let sends=0;const n=await setup(t,async(url)=>{if(url.endsWith('/sendMessage'))sends++;return {ok:true,status:200,json:async()=>({ok:true,result:url.endsWith('/sendMessage')?{message_id:9}:{first_name:'테스트'}})};});
 assert.ok(!JSON.stringify(n.status()).includes('abcdefghijkl'));assert.throws(()=>notificationText({...article(),status:'reviewed'},'요약'));
 const a=article(),text=notificationText(a,'실제 요약');await Promise.all([n.deliver(a,text,()=>{}),n.deliver(a,text,()=>{})]);assert.equal(sends,1);assert.equal(a.notification.status,'sent');assert.equal(a.notification.messageId,9);assert.ok(text.includes('실제 요약'));
});
test('timeout stays uncertain and needs explicit retry; API rejection is failed',async t=>{
 const n=await setup(t,async(url)=>{if(url.endsWith('/sendMessage'))throw Error('network with secret');return {ok:true,json:async()=>({ok:true,result:{}})};});
 const a=article();await n.deliver(a,'본문',()=>{});assert.equal(a.notification.status,'unknown');assert.ok(!a.notification.error.includes('secret'));await assert.rejects(n.deliver(a,'본문',()=>{}),/불확실/);
 const rejected=await setup(t,async(url)=>({ok:!url.endsWith('/sendMessage'),status:403,json:async()=>({ok:!url.endsWith('/sendMessage'),result:{}})}));const b=article();await rejected.deliver(b,'본문',()=>{});assert.equal(b.notification.status,'failed');
});

test('remote buttons accept only owner private-chat callbacks and do not replace an existing webhook',async t=>{
 let webhook='',handled=0,keyboard;
 const n=await setup(t,async(url,opts)=>{
  const payload=JSON.parse(opts.body);let result={};
  if(url.endsWith('/getWebhookInfo'))result={url:webhook};
  if(url.endsWith('/sendMessage')){keyboard=payload.reply_markup;result={message_id:7};}
  if(url.endsWith('/getUpdates'))result=[{update_id:1,callback_query:{id:'bad',from:{id:999},message:{chat:{id:123}},data:'b01:hold:x'}},{update_id:2,callback_query:{id:'good',from:{id:123},message:{chat:{id:123}},data:'b01:hold:x'}}];
  return {ok:true,json:async()=>({ok:true,result})};
 });
 n.configure({remoteApproval:true});
 await n.requestPublication({id:'abc',title:'제목',revision:1},'요약');
 assert.equal(keyboard.inline_keyboard[0][0].callback_data,'b01:publish:abc');
 assert.equal(await n.pollDecisions(()=>{handled++;return '보류';}),true);assert.equal(handled,1);
 webhook='https://existing.example/webhook';
 assert.equal(await n.pollDecisions(()=>{handled++;}),false);assert.equal(handled,1);
 await assert.rejects(n.requestPublication({id:'abc',title:'제목',revision:1},'요약'),/웹훅/);
});
