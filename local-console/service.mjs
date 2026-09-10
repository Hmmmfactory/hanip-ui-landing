import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const label='com.b01.editorial-console';
const domain=`gui/${process.getuid()}`;
const target=`${domain}/${label}`;
const plist=path.join(os.homedir(),'Library/LaunchAgents',label+'.plist');
const data=path.join(root,'.editorial-console');
const run=(...args)=>spawnSync('/bin/launchctl',args,{encoding:'utf8'});
const xml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
if(process.argv[2]==='stop'){
  const result=run('bootout',target);
  console.log(result.status===0?'편집실 상시 실행을 중지했습니다. 다시 열면 시작됩니다.':'편집실 서비스가 실행 중이지 않습니다.');
}else{
  fs.mkdirSync(path.dirname(plist),{recursive:true});
  fs.mkdirSync(data,{recursive:true,mode:0o700});
  const logDir=path.join(os.homedir(),'Library/Logs/B01');
  fs.mkdirSync(logDir,{recursive:true,mode:0o700});
  const log=path.join(logDir,'editorial-console.log');
  fs.closeSync(fs.openSync(log,'a',0o600));
  const content=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(path.join(root,'local-console/server.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(os.homedir())}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path.dirname(process.execPath))}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>StandardOutPath</key><string>${xml(log)}</string>
<key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>\n`;
  if(!fs.existsSync(plist)||fs.readFileSync(plist,'utf8')!==content)fs.writeFileSync(plist,content,{mode:0o600});
  if(run('print',target).status!==0){
    const result=run('bootstrap',domain,plist);
    if(result.status!==0){console.error('macOS 편집실 서비스 등록 실패:',result.stderr.trim());process.exit(1);}
  }
  console.log('macOS 편집실 서비스 등록 완료 · 로그인 시 자동 시작 · 종료 시 자동 복구');
}
