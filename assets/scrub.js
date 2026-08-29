/* ==========================================================================
   영상 스크럽판 부품 키트 — scrub.js
   실행DAY 2026-08-29 · https://runday.irumai.kr/260829/kit/scrub/

   ● 무엇을 하나
     첫 화면(히어로)의 영상을 "재생"하지 않고, 스크롤 위치에 맞춰 영상의
     시간(currentTime)을 돌립니다. 스크롤을 내리면 영상이 감기고, 올리면
     되감깁니다. 조그휠을 돌리는 느낌입니다.

   ● 붙이는 법
     1) </head> 앞:  <link rel="stylesheet" href="assets/scrub.css">
     2) </body> 앞:  <script src="assets/scrub.js" defer></script>
     3) 첫 화면을 이 덩어리로 교체:

        <section class="rd-scrub"
                 data-clip="assets/hero-scrub.mp4"
                 data-clip-m="assets/hero-scrub-m.mp4"
                 data-poster="assets/hero-poster.jpg"
                 data-poster-m="assets/hero-poster-m.jpg"
                 data-scroll="3">
          <div class="rd-scrub__band" data-a="0" data-b="0.45">
            <span class="rd-scrub__kicker">BRAND</span>
            <h1>브랜드 한 문장</h1>
            <p>짧은 보조 문장</p>
          </div>
          <div class="rd-scrub__band" data-a="0.5" data-b="1">
            <h2>두 번째 문장</h2>
            <a class="rd-scrub__btn" href="products/">제품 보기</a>
          </div>
        </section>

        data-scroll  : 영상 한 편을 몇 화면 높이에 걸쳐 감을지 (기본 3)
        data-a/b     : 이 문구 덩어리가 보이는 구간 (0~1, 영상 진행도 기준)
        data-clip-m  : 세로 화면(폰)용 클립. 없으면 data-clip 을 그대로 씁니다.

   ● 영상 파일 조건 (이게 안 맞으면 뚝뚝 끊깁니다 — README 2번 참고)
     - 키프레임 8프레임 간격으로 재인코딩한 mp4 (일반 mp4는 안 됩니다)
     - 소리 없음, 4~8초, 1280×720 (폰용은 480×854)

   ● 동작 원칙
     - 영상은 blob 으로 통째 받아 메모리에 올립니다 (Range 요청 방지)
     - 스크롤 값을 바로 꽂지 않고 감쇠 보간으로 따라붙습니다 (관성)
     - prefers-reduced-motion 이면 영상 없이 포스터 + 문구만 보입니다
     - 영상 로드 실패 시에도 포스터가 남습니다
   ========================================================================== */
(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isPortrait = matchMedia('(max-width: 880px)').matches;
  var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  function build(sc) {
    var clip = isPortrait && sc.dataset.clipM ? sc.dataset.clipM : sc.dataset.clip;
    var poster = isPortrait && sc.dataset.posterM ? sc.dataset.posterM : sc.dataset.poster;
    var screens = Math.max(1, parseFloat(sc.dataset.scroll) || 3);

    /* 문구 덩어리를 잠시 떼어 두고 무대를 만든 뒤 다시 넣습니다 */
    var bands = Array.prototype.slice.call(sc.querySelectorAll('.rd-scrub__band'));
    var stage = document.createElement('div');
    stage.className = 'rd-scrub__stage';

    var media = document.createElement('div');
    media.className = 'rd-scrub__media';
    media.setAttribute('aria-hidden', 'true');
    if (poster) {
      var img = document.createElement('img');
      img.className = 'rd-scrub__poster';
      img.src = poster;
      img.alt = '';
      img.setAttribute('fetchpriority', 'high');
      media.appendChild(img);
    }
    stage.appendChild(media);

    var scrim = document.createElement('div');
    scrim.className = 'rd-scrub__scrim';
    stage.appendChild(scrim);

    var copy = document.createElement('div');
    copy.className = 'rd-scrub__copy';
    bands.forEach(function (b) { copy.appendChild(b); });
    stage.appendChild(copy);

    var cue = document.createElement('div');
    cue.className = 'rd-scrub__cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.innerHTML = '<span>' + (sc.dataset.cue || 'SCROLL') + '</span><i></i>';
    stage.appendChild(cue);

    var bar = document.createElement('div');
    bar.className = 'rd-scrub__progress';
    bar.innerHTML = '<i></i>';
    stage.appendChild(bar);

    sc.innerHTML = '';
    sc.appendChild(stage);

    /* 모션 축소 설정 · 클립 없음 → 정적 히어로로 끝 */
    if (reduced || !clip) {
      sc.classList.add('rd-scrub--static');
      return;
    }
    sc.classList.add('rd-scrub--live');
    sc.style.height = ((screens + 1) * 100) + 'svh';

    var S = { video: null, ready: false, loading: false, target: 0, current: 0 };

    /* ── ① 영상을 blob 으로 통째 받아 <video> 에 물립니다 ── */
    function load() {
      if (S.loading || S.ready) return;
      S.loading = true;
      var v = document.createElement('video');
      v.className = 'rd-scrub__video';
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.addEventListener('loadeddata', function () {
        S.ready = true;
        sc.classList.add('rd-scrub--has-video');
      }, { once: true });
      v.addEventListener('error', function () { sc.classList.add('rd-scrub--video-failed'); });
      S.video = v;
      media.appendChild(v);

      fetch(clip).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.blob();
      }).then(function (b) {
        v.src = URL.createObjectURL(b);
      }).catch(function () {
        /* fetch 가 막힌 환경(file:// 등)에서는 URL 을 직접 물립니다 — 덜 부드럽지만 동작합니다 */
        v.src = clip;
      });
    }

    /* ── ② 매 프레임 감쇠 보간 후 currentTime 을 맞춥니다 ── */
    var tol = (isPortrait || isSafari) ? 0.02 : 0.008;
    var driving = false;
    function drive() {
      var v = S.video;
      if (v && S.ready && !v.seeking) {
        S.current += (S.target - S.current) * 0.18;
        var t = clamp(S.current, 0, 0.999) * (v.duration || 1);
        if (Math.abs(v.currentTime - t) > tol) {
          try { v.currentTime = t; } catch (e) {}
        }
      }
      requestAnimationFrame(drive);
    }

    /* ── ③ 스크롤 → 진행도(0~1) → 문구 덩어리 on/off ── */
    var tick = false;
    function progress() {
      var r = sc.getBoundingClientRect();
      var range = sc.offsetHeight - innerHeight;
      if (range <= 0) return 0;
      return clamp(-r.top / range, 0, 1);
    }
    function render() {
      tick = false;
      var p = progress();
      S.target = p;
      bar.style.setProperty('--p', p.toFixed(4));
      sc.style.setProperty('--cue', p > 0.02 ? 0 : 1);
      bands.forEach(function (b) {
        var a = parseFloat(b.dataset.a), z = parseFloat(b.dataset.b);
        if (isNaN(a) || isNaN(z)) { b.classList.add('on'); return; }
        b.classList.toggle('on', p >= a && p <= z);
      });
      if (!driving) { driving = true; requestAnimationFrame(drive); }
    }

    /* 화면 가까이 오면 그때 받습니다 (첫 화면이면 즉시) */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (e) { return e.isIntersecting; })) { load(); io.disconnect(); }
      }, { rootMargin: '60% 0px' });
      io.observe(sc);
    } else { load(); }

    addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(render); } }, { passive: true });
    addEventListener('resize', render);
    render();
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.rd-scrub'), build);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
