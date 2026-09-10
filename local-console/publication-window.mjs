export const PUBLICATION_DELAY_MS=60*60*1000;
export function createPublicationWindow(hash,now=Date.now()) {
 return {status:'requesting',draftHash:hash,createdAt:new Date(now).toISOString(),notifiedAt:null,deadline:null};
}
export function acceptPublicationNotice(window,messageId,now=Date.now()) {
 if(!Number.isInteger(messageId))throw new Error('발행 확인 알림의 접수를 확인하지 못했습니다.');
 return {...window,status:'waiting',messageId,notifiedAt:new Date(now).toISOString(),deadline:new Date(now+PUBLICATION_DELAY_MS).toISOString()};
}
export function publicationDue(window,hash,now=Date.now()) {
 return window?.status==='waiting' && window.draftHash===hash && Number.isFinite(Date.parse(window.deadline)) && Date.parse(window.deadline)<=now;
}
