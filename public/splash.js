// Sparkles, the light burst and the status lines for the KCCP start screen (splash.css).
// Signals the end (or a click to skip) with a `fc-splash-done` event on window and by setting
// the document title to "fc-done" — the desktop app watches the title of its splash window.
(function () {
  var root = document.querySelector('.fc-splash');
  if (!root) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TOTAL = reduce ? 900 : 6500;
  var start = performance.now();
  var finished = false;

  function done() {
    if (finished) return;
    finished = true;
    root.dataset.done = '1';
    var title = document.title;
    document.title = 'fc-done';
    setTimeout(function () { document.title = title; }, 60);
    window.dispatchEvent(new Event('fc-splash-done'));
  }
  root.addEventListener('click', done);
  setTimeout(done, TOTAL);

  // Status lines under the loading bar.
  var status = root.querySelector('.fc-status');
  var lines = ['찬양 라이브러리 연결 중…', '교회 템플릿 불러오는 중…', '성경 말씀 준비 중…', '예배를 시작합니다 ✦'];
  lines.forEach(function (text, i) {
    setTimeout(function () {
      if (!status) return;
      status.style.opacity = '0';
      setTimeout(function () { status.textContent = text; status.style.opacity = '1'; }, 220);
    }, (reduce ? 0 : 4000) + i * 560);
  });

  if (reduce) return;
  var canvas = root.querySelector('canvas.fc-sparks');
  var ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0;
  function size() {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  window.addEventListener('resize', size);

  var COLORS = ['#ffffff', '#fde718', '#4bc789', '#c9a46a', '#9ee7ff'];
  var pick = function (a) { return a[(Math.random() * a.length) | 0]; };
  var parts = [];
  // Ambient: slow rising, twinkling motes.
  for (var i = 0; i < 160; i++) {
    parts.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.15, vy: -0.15 - Math.random() * 0.45,
      r: 0.6 + Math.random() * 1.8, c: pick(COLORS), tw: Math.random() * 6.28, life: Infinity, ambient: true });
  }
  function burst(x, y, n, speed) {
    for (var k = 0; k < n; k++) {
      var a = Math.random() * 6.283, v = speed * (0.35 + Math.random());
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1 + Math.random() * 2.6, c: pick(COLORS), tw: 0, life: 1, decay: 0.006 + Math.random() * 0.012, star: Math.random() < 0.35 });
    }
  }
  function at(sel) {
    var el = root.querySelector(sel), rc = canvas.getBoundingClientRect();
    if (!el) return { x: W / 2, y: H / 2 };
    var b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2 - rc.left, y: b.top + b.height / 2 - rc.top };
  }
  // The big burst when the cross is complete, smaller ones as the pieces land and at the finale.
  setTimeout(function () { var p = at('.fc-emblem .g'); burst(p.x, p.y, 40, 3); }, 1050);
  setTimeout(function () { var p = at('.fc-emblem .y'); burst(p.x, p.y, 40, 3); }, 1500);
  setTimeout(function () { var p = at('.fc-flare'); burst(p.x, p.y, 260, 7); }, 2150);
  setTimeout(function () { var p = at('.fc-word'); burst(p.x + W * 0.12, p.y, 90, 4); }, 3350);
  setTimeout(function () { var p = at('.fc-team img'); burst(p.x, p.y, 70, 3.5); }, 4300);
  setTimeout(function () { var p = at('.fc-stage'); burst(p.x, p.y, 220, 8); }, 5750);

  function star(x, y, r) {
    ctx.beginPath();
    for (var k = 0; k < 8; k++) {
      var rr = k % 2 ? r * 0.35 : r * 2.2, a = (k * Math.PI) / 4;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  function frame(now) {
    if (!root.isConnected) return;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    var t = (now - start) / 1000;
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy;
      var alpha;
      if (p.ambient) {
        p.tw += 0.05;
        alpha = Math.min(1, t / 1.2) * (0.35 + 0.35 * Math.sin(p.tw));
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      } else {
        p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.03;
        p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        alpha = p.life;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c;
      ctx.shadowBlur = 8;
      if (p.star) star(p.x, p.y, p.r);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
