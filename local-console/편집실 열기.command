#!/bin/zsh
# Finder에서 실행하면 서버를 준비하고 Mac의 기본 브라우저를 엽니다.
cd "${0:A:h}/.." || exit 1
editorial_url='http://127.0.0.1:4317/'
editorial_node=''
for candidate in "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node" "${commands[node]}" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [[ -x "$candidate" ]] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' 2>/dev/null; then
    editorial_node="$candidate"
    break
  fi
done
if [[ -z "$editorial_node" ]]; then
  print '편집실 실행에 필요한 Node.js 20 이상을 찾지 못했습니다. Codex에서 편집실 실행을 요청해주세요.'
  read '?Enter 키를 누르면 닫습니다.'
  exit 1
fi
mkdir -p .editorial-console
chmod 700 .editorial-console
"$editorial_node" local-console/service.mjs || exit 1
for attempt in {1..240}; do
  if curl --silent --fail --max-time 2 "${editorial_url}api/state" >/dev/null; then
    open "$editorial_url"
    print '기본 브라우저에서 편집실을 열었습니다. 이 창은 닫아도 됩니다.'
    exit 0
  fi
  sleep 0.25
done
print '편집실이 아직 응답하지 않습니다. Codex에 실행 확인을 요청해주세요.'
print '실행 기록: ~/Library/Logs/B01/editorial-console.log'
read '?Enter 키를 누르면 닫습니다.'
exit 1
