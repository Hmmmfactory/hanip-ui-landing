// Deliberately limited, escaped Markdown for editorial prose. Raw HTML never executes.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const defaultFormat = {lineBreaks:'paragraph',spacing:'comfortable',emphasis:'bold'};
export function normalizeFormat(value={}) {
  const allowed={lineBreaks:['paragraph','source'],spacing:['compact','comfortable','wide'],emphasis:['bold','highlight','none']};
  const result={...defaultFormat};
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('본문 표시 설정을 확인하세요.');
  for(const key of Object.keys(value)) {
    if(!allowed[key]?.includes(value[key]))throw new Error('지원하지 않는 본문 표시 설정입니다.');
    result[key]=value[key];
  }
  return result;
}
export function cleanDraft(raw) {
  return String(raw||'').replace(/^\uFEFF/,'').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'').replace(/<!--[\s\S]*?(?:-->|$)/g,'').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm,'')
    .replace(/^(?:#{1,6}\s*)?편집 메모[^\n]*(?:본문 외|공개 시 제외)[\s\S]*$/m,'')
    .replace(/^> 편집용 검토 초안[^\n]*$/gm,'')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,(_,url,label)=>`[${label.replace(/<[^>]*>/g,'')}](${url.replace(/&amp;/g,'&')})`)
    .replace(/<(strong|b)\b[^>]*>(.*?)<\/\1>/gi,'**$2**').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').trim();
}
function safeUrl(raw,origin) {
  try {const url=new URL(raw,`${origin || 'https://runday0829.vercel.app'}/story/drafts/`);return /^https?:$/.test(url.protocol)?url.href:null;}catch{return null;}
}
function inline(raw,origin) {
  // Tokenize links before escaping, then only emit trusted markup.
  return String(raw).split(/(!?\[[^\]\n]*\]\([^\s)]+\))/g).map(part=>{
    const link=part.match(/^(!?)\[([^\]\n]*)\]\(([^\s)]+)\)$/);
    if(link){const url=safeUrl(link[3],origin);return link[1]?`<span class="image-note">사진: ${escapeHtml(link[2]||'이미지 설명 없음')}</span>`:url?`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link[2])}</a>`:escapeHtml(link[2]);}
    return escapeHtml(part).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/__(.+?)__/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,'$1');
  }).join('');
}
export function readDraft(raw,origin) {
  const source=cleanDraft(raw);
  const privateNotes=[];
  // Remove entire unresolved paragraphs, never just the warning around an unverified claim.
  const clean=source.split(/\n\s*\n/).filter(part=>{
    if(/\[확인\s*필요|\[미확인|\bTODO\b/.test(part)){privateNotes.push(part);return false;}
    return true;
  }).join('\n\n');
  const lines=clean.split(/\r?\n/), blocks=[]; let paragraph=[],list=[],listType='',quote=[];
  const flush=()=>{if(paragraph.length){blocks.push(`<p>${inline(paragraph.join('\n'),origin)}</p>`);paragraph=[];}if(list.length){blocks.push(`<${listType}>${list.map(x=>`<li>${inline(x,origin)}</li>`).join('')}</${listType}>`);list=[];listType='';}if(quote.length){blocks.push(`<blockquote>${inline(quote.join('\n'),origin)}</blockquote>`);quote=[];}};
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    if(!line.trim()){flush();continue;}
    const heading=line.match(/^(#{1,6})\s+(.+)$/);
    if(heading){flush();const level=heading[1].length;blocks.push(`<h${level}>${inline(heading[2],origin)}</h${level}>`);continue;}
    if(/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)){flush();continue;}
    if(line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i+1]||'')) {
      flush();const cells=x=>x.trim().replace(/^\||\|$/g,'').split('|').map(v=>v.trim());const head=cells(line);i+=2;const rows=[];
      for(;i<lines.length&&lines[i].includes('|');i++)rows.push(cells(lines[i]));i--;
      blocks.push(`<div class="reading-table"><table><thead><tr>${head.map(c=>`<th>${inline(c,origin)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${inline(c,origin)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue;
    }
    const item=line.match(/^\s*(?:([-*+])|\d+\.)\s+(.+)$/);
    if(item){const type=item[1]?'ul':'ol';if(paragraph.length||quote.length||listType&&listType!==type)flush();listType=type;list.push(item[2]);continue;}
    if(/^>\s?/.test(line)){if(paragraph.length||list.length)flush();quote.push(line.replace(/^>\s?/,''));continue;}
    if(list.length||quote.length)flush();paragraph.push(line);
  }
  flush();
  const plain=clean.replace(/^#+\s+/gm,'').replace(/!?\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/<[^>]*>/g,'').replace(/[*_`]/g,'').replace(/^>\s?/gm,'');
  const paragraphs=plain.split(/\n\s*\n/).filter(p=>!p.includes('[확인 필요]'));
  return {html:blocks.join('\n'),plain,summary:(paragraphs.find(p=>p.length>60)||paragraphs[1]||paragraphs[0]||'요약할 본문이 없습니다.').slice(0,500),characters:plain.length,privateNotes,needsConfirmation:privateNotes.length>0};
}
export const readingCss=`.reading{max-width:720px;margin:24px auto;font-size:17px;line-height:1.9;overflow-wrap:anywhere;color:#292d37}.reading p{margin:0 0 1.3em;white-space:normal}.reading h1{font-size:1.9em;line-height:1.4;margin:1em 0}.reading h2{font-size:1.45em;line-height:1.5;margin:1.8em 0 .8em}.reading h3,.reading h4{line-height:1.5;margin:1.6em 0 .7em}.reading a{color:#65519b;text-decoration:underline}.reading blockquote{margin:1.3em 0;padding:12px 20px;border-left:3px solid #cba85c;background:#fff9e9}.reading li{margin:.45em 0}.reading .reading-table{overflow:auto}.reading table{border-collapse:collapse;width:100%}.reading th,.reading td{border:1px solid #dcdde5;padding:10px;text-align:left}.reading .image-note{display:block;border:1px dashed #aaa;padding:16px}.reading.break-source p,.reading.break-source blockquote{white-space:pre-line}.reading.spacing-compact{line-height:1.65}.reading.spacing-compact p{margin-bottom:.8em}.reading.spacing-wide{line-height:2.15}.reading.spacing-wide p{margin-bottom:1.8em}.reading.emphasis-highlight strong{background:#fff0b4;font-weight:650}.reading.emphasis-none strong{font-weight:inherit;background:none}`;
export function readingClass(format){const f=normalizeFormat(format);return `reading break-${f.lineBreaks} spacing-${f.spacing} emphasis-${f.emphasis}`;}
