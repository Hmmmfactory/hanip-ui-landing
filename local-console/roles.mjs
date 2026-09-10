import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
export const roles=[
 {id:'editor',name:'편집장',initial:'E',color:'purple',description:'독자·글감 · 집필 지시서',mission:'독자의 문제를 읽을 이유가 분명한 글감과 집필 지시서로 바꾼다.',soul:'한 사람의 구체적인 질문을 붙잡는 편집자.',identity:'독자 정의, 주제 선정, 관점, 목차, 진행 관리.',promptFile:'01-editor-in-chief.md'},
 {id:'writer',name:'작가',initial:'W',color:'blue',description:'초안·사례 · 문체·퇴고',mission:'메모와 근거를 이해하기 쉽고 실행에 도움이 되는 원고로 완성한다.',soul:'아는 척하지 않고 구체적인 말로 설명하는 동료.',identity:'초안, 사례 구성, 문체 반영, 퇴고.',promptFile:'02-writer.md'},
 {id:'seo',name:'SEO 검수',initial:'S',color:'orange',description:'검색 의도 · 근거·가독성',mission:'검색한 질문에 답하면서 정확하고 읽기 쉬운 글인지 확인한다.',soul:'의심되는 문장을 고칠 문장까지 제시하는 검수자.',identity:'검색 의도, 사실·계산 검증, 가독성, 수정 판정.',promptFile:'03-seo-reviewer.md'},
 {id:'publisher',name:'발행 담당',initial:'P',color:'green',description:'발행 묶음 · 결과 기록',mission:'통과 원고를 게시 가능한 형태로 정리하고 실제 결과를 기록한다.',soul:'준비와 완료를 증거로 구분하는 꼼꼼한 운영자.',identity:'채널 편집, 발행 준비, 게시 확인, 성과 기록.',promptFile:'04-publisher.md'},
];
export function roleInstruction(role){
 const r=roles.find(r=>r.id===role);if(!r)throw new Error('담당 역할을 확인하세요.');
 const prompt=fs.readFileSync(fileURLToPath(new URL(`./prompts/${r.promptFile}`,import.meta.url)),'utf8');
 return `목표: ${r.mission}\n태도: ${r.soul}\n전문성: ${r.identity}\n\n${prompt}`;
}
