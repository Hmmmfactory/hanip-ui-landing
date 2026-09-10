import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('cloud status distinguishes credentials from implemented scheduler',()=>{
 const handler=require('../api/automation-status.js');let result;handler({}, {status:()=>({json:data=>result=data})});assert.equal(result.ready,false);assert.equal(result.schedule.enabled,false);assert.equal(result.capabilities.localDraftSync,false);
});
test('cloud draft command does not send published content as a draft',async()=>{
 const lib=require('../api/lib/automation.js'),messages=[];const oldReply=lib.reply,oldAuth=lib.isTelegramRequest,oldAdmin=process.env.TELEGRAM_ADMIN_CHAT_ID;
 lib.reply=async(id,text)=>messages.push(text);lib.isTelegramRequest=()=>true;process.env.TELEGRAM_ADMIN_CHAT_ID='123';delete require.cache[require.resolve('../api/telegram.js')];
 try{const handler=require('../api/telegram.js');const res={status:()=>({json:()=>{},end:()=>{}})};await handler({method:'POST',body:{message:{chat:{id:123},text:'/draft'}}},res);assert.match(messages[0],/동기화되지/);assert.ok(!messages[0].includes('[검토용 초안]'));await handler({method:'POST',body:{message:{chat:{id:123},text:'/latest'}}},res);assert.match(messages[1],/최근 등록 글/);assert.match(messages[1],/글 요약/);}
 finally{lib.reply=oldReply;lib.isTelegramRequest=oldAuth;if(oldAdmin===undefined)delete process.env.TELEGRAM_ADMIN_CHAT_ID;else process.env.TELEGRAM_ADMIN_CHAT_ID=oldAdmin;delete require.cache[require.resolve('../api/telegram.js')];}
});
