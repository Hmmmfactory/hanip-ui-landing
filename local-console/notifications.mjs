import fs from 'node:fs';
import path from 'node:path';
export function notificationText(article,summary) {
  if(article.status!=='published'||!article.publishedUrl)throw new Error('공개 발행을 확인한 글만 전달할 수 있습니다.');
  const url=new URL(article.publishedUrl);if(url.protocol!=='https:')throw new Error('공개 주소를 확인하세요.');
  return `[블로그 발행 완료]\n${article.title.slice(0,100)}\n\n[글 요약]\n${String(summary||'요약이 없습니다.').slice(0,1000)}\n\n[공개된 글]\n${url.href}\n\n발행 확인: ${article.publishedAt || '확인됨'}`;
}
export function createNotifications(dataDir,{transport=fetch}={}) {
  const file=path.join(dataDir,'telegram.json');
  let config=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{enabled:false};
  const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(config),{mode:0o600});fs.renameSync(file+'.tmp',file);};
  let polling=false;
  const status=()=>({remoteApproval:!!config.remoteApproval,remoteError:config.remoteError||null,botUsername:config.botUsername||null,hasWebhook:!!config.hasWebhook,configured:!!(config.botToken&&config.chatId),enabled:!!config.enabled,verifiedAt:config.verifiedAt||null,recipient:config.recipient||null,lastCheck:config.lastCheck||null});
  function configure(input){
    if(input.botToken!==undefined && (typeof input.botToken!=='string'||!/^\d+:[\w-]{20,}$/.test(input.botToken)))throw new Error('봇 연결 키 형식을 확인하세요.');
    if(input.chatId!==undefined && (typeof input.chatId!=='string'||! /^-?\d+$/.test(input.chatId)))throw new Error('받는 대화 ID는 숫자로 입력하세요.');
    if(input.enabled!==undefined&&typeof input.enabled!=='boolean')throw new Error('알림 설정을 확인하세요.');
    if(input.remoteApproval!==undefined&&typeof input.remoteApproval!=='boolean')throw new Error('원격 승인 설정을 확인하세요.');
    const changed=(input.botToken&&input.botToken!==config.botToken)||(input.chatId&&input.chatId!==config.chatId);
    const next={...config,...(input.botToken?{botToken:input.botToken}:{}),...(input.chatId?{chatId:input.chatId}:{})};
    if(changed){next.verifiedAt=null;next.recipient=null;next.enabled=false;}
    if(input.enabled===true&&!next.verifiedAt)throw new Error('먼저 연결을 확인한 뒤 자동 전달을 켜세요.');
    if(input.enabled!==undefined)next.enabled=input.enabled;
    if(input.remoteApproval===true&&next.hasWebhook)throw new Error('기존 웹훅 연결이 있습니다. 기존 시스템과 연결을 정리한 뒤 원격 승인을 켜세요.');
    if(input.remoteApproval!==undefined)next.remoteApproval=input.remoteApproval;
    if(changed){next.remoteApproval=false;next.updateOffset=0;}
    config=next;save();return status();
  }
  async function call(method,payload){
    if(!status().configured)throw new Error('텔레그램 연결 정보를 먼저 저장하세요.');
    let response,data;
    try{response=await transport(`https://api.telegram.org/bot${config.botToken}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});data=await response.json();}
    catch{const error=new Error('텔레그램 응답을 확인하지 못했습니다.');error.uncertain=true;throw error;}
    if(!response.ok||!data.ok){const error=new Error(`텔레그램 요청이 거절되었습니다 (${response.status}). 봇 연결·대화 권한을 확인하세요.`);throw error;}
    return data.result;
  }
  return {status,configure,async pollDecisions(handle){
    if(polling||!config.enabled||!config.verifiedAt||!config.remoteApproval)return false;
    polling=true;
    try{
      const hook=await call('getWebhookInfo',{});
      if(hook.url)throw new Error('기존 봇의 웹훅이 연결되어 있습니다. 편집실 전용 봇을 연결해주세요.');
      const updates=await call('getUpdates',{offset:config.updateOffset||0,timeout:0,allowed_updates:['callback_query']});
      for(const update of updates){
        const q=update.callback_query;
        if(q&&String(q.message?.chat?.id)===config.chatId&&String(q.from?.id)===config.chatId){
          let result='이 요청은 처리할 수 없습니다.';
          try{result=await handle(q);}catch(e){result=e.message;}
          await call('answerCallbackQuery',{callback_query_id:q.id,text:result.slice(0,180)}).catch(()=>{});
        }
        config.updateOffset=update.update_id+1;save();
      }
      config.remoteError=null;save();return true;
    }catch(e){config.remoteError=e.message;save();return false;}finally{polling=false;}
  },async requestPublication(a,summary,{requireApproval=false}={}){
    if(!config.enabled||!config.verifiedAt)throw new Error('텔레그램 연결 확인과 알림 켜기가 필요합니다.');
    if(requireApproval&&!config.remoteApproval)throw new Error('텔레그램 원격 승인을 먼저 연결하세요.');
    if(config.remoteApproval){const hook=await call('getWebhookInfo',{});if(hook.url)throw new Error('기존 웹훅과 충돌합니다. 편집실 전용 봇이 필요합니다.');if(!/^[1-9]\d*$/.test(config.chatId))throw new Error('원격 승인은 본인과 봇의 개인 대화만 지원합니다.');}
    const text=`오늘의 글을 발행할까요?\n${a.title}\n\n${String(summary).slice(0,700)}\n\n발행 위치: https://runday0829.vercel.app/story/\n\n${requireApproval?'승인하기 전에는 발행하지 않습니다. 응답하지 않으면 대기 상태를 유지합니다.':'이 알림이 접수된 뒤 1시간 내 응답이 없으면 검수된 이 원고를 자동 발행합니다.'} ${config.remoteApproval?'아래 발행·보류 버튼으로 결정해주세요. Mac과 편집실이 켜져 있어야 선택이 처리됩니다.':'지금 발행하거나 멈추려면 Mac의 편집실에서 ‘지금 발행’ 또는 ‘보류’를 누르세요.'} 원고 수정도 자동 발행을 취소합니다.\n\n글 ID: ${a.id} · 자료 버전: ${a.revision}\n편집실: http://127.0.0.1:4317/ (편집실이 실행 중인 Mac에서 접속)`;
    const result=await call('sendMessage',{chat_id:config.chatId,text,...(config.remoteApproval?{reply_markup:{inline_keyboard:[[{text:'발행하기',callback_data:`b01:publish:${a.id}`},{text:'보류하기',callback_data:`b01:hold:${a.id}`}]]}}:{}),link_preview_options:{is_disabled:true}});
    if(!Number.isInteger(result?.message_id))throw Object.assign(new Error('발행 확인 메시지의 전달 여부가 불확실합니다.'),{uncertain:true});
    return result.message_id;
  },async reportFailure(a){
    if(!config.enabled||!config.verifiedAt)return false;
    await call('sendMessage',{chat_id:config.chatId,text:`[블로그 발행 실패]\n${a.title}\n\n${String(a.error||'작업 기록을 확인해주세요.').slice(0,900)}\n\n자동 재발행하지 않습니다. 편집실에서 원인을 확인한 후 다시 요청하세요.`,link_preview_options:{is_disabled:true}});return true;
  },async check(){
    try{const bot=await call('getMe',{});const hook=await call('getWebhookInfo',{});config.botUsername=bot.username||null;config.hasWebhook=!!hook.url;const chat=await call('getChat',{chat_id:config.chatId});config.verifiedAt=new Date().toISOString();config.recipient=chat.title||chat.first_name||'등록된 대화';config.lastCheck=config.hasWebhook?'기존 웹훅 연결 발견 · 원격 승인을 켜기 전에 기존 연결을 정리해야 합니다.':'연결 확인 · 메시지 발송 권한과 실제 수신은 발송 후 확인됩니다.';save();return status();}
    catch(e){config.verifiedAt=null;config.enabled=false;config.lastCheck=e.message;save();throw e;}
  },async deliver(a,text,persist,{retryUnknown=false}={}){
    if(a.notification?.status==='sent'||a.notification?.status==='sending')return a.notification;
    if(a.notification?.status==='unknown'&&!retryUnknown)throw new Error('전달 여부가 불확실합니다. 텔레그램에서 중복 여부를 확인한 뒤 다시 보내세요.');
    if(!config.enabled||!config.verifiedAt){a.notification={status:'blocked',error:'연결 확인 후 발행 완료 자동 전달을 켜세요.'};persist();return a.notification;}
    a.notification={status:'sending',startedAt:new Date().toISOString(),text};persist();
    try{const result=await call('sendMessage',{chat_id:config.chatId,text,link_preview_options:{is_disabled:true}});if(!result?.message_id)throw Object.assign(new Error('메시지 번호가 없어 전달 여부를 확인하지 못했습니다.'),{uncertain:true});a.notification={...a.notification,status:'sent',messageId:result.message_id,sentAt:new Date().toISOString(),error:null};}
    catch(e){a.notification={...a.notification,status:e.uncertain?'unknown':'failed',error:e.message};}
    persist();return a.notification;
  }};
}
