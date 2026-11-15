// Vanilla port of React Bits <TextPressure /> (variable-font letters that swell under the cursor).
// Classic script so it also runs from file://. Auto-inits every [data-text-pressure="Your text"].
// Not ported (unused here): the `stroke` outline and vertical `scale` options.
(function () {
  'use strict';

  const RIPPLE_LIFE = 1.3;
  const MAX_RIPPLES = 6;
  const WAVE_PERIOD = 3.2;
  const PULSE_PERIOD = 2.8;
  const PULSE_DEPTH = 0.42;

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const clamp01 = value => Math.min(1, Math.max(0, value));

  function getIdlePressure(mode, position, clock, spread) {
    if (mode === 'wave') {
      const crest = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (position / spread - clock / WAVE_PERIOD));
      return crest * crest;
    }
    if (mode === 'pulse') {
      const lag = Math.abs(position - 0.5) * 0.4;
      const breath = 0.5 - 0.5 * Math.cos(Math.PI * 2 * (clock / PULSE_PERIOD - lag));
      return PULSE_DEPTH * breath * breath * (3 - 2 * breath);
    }
    return 0;
  }

  function getRipplePressure(ripples, point, now, span) {
    const band = Math.max(span * 0.14, 32);
    let total = 0;
    for (const ripple of ripples) {
      const age = (now - ripple.start) / 1000;
      if (age <= 0 || age >= RIPPLE_LIFE) continue;
      const offset = (dist(ripple, point) - age * span * 1.25) / band;
      if (offset <= -1 || offset >= 1) continue;
      const fade = 1 - age / RIPPLE_LIFE;
      const swell = Math.pow(1 - offset * offset, 2) * fade * fade * Math.min(1, age / 0.06);
      total = 1 - (1 - total) * (1 - swell);
    }
    return total;
  }

  window.initTextPressure = function (container, userOptions) {
    const options = Object.assign({
      text: 'Compressa',
      fontFamily: 'Roboto Flex',
      fontUrl: 'https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wdth,wght@8..144,25..151,100..1000&display=swap',
      width: true,
      weight: true,
      italic: true,
      alpha: false,
      flex: true,
      radius: 0.5,
      smoothing: 0.5,
      idle: 'none',
      idleSpeed: 1,
      clickRipple: true,
      textColor: 'currentColor',
      pressureColor: '',
      minFontSize: 24
    }, userOptions);

    if (!document.querySelector('link[href="' + options.fontUrl + '"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = options.fontUrl;
      document.head.appendChild(link);
    }

    const chars = Array.from(options.text);
    container.style.position = 'relative';
    container.style.width = '100%';

    // The page already has its own <h1>, so this is a labelled graphic, not a heading.
    const title = document.createElement('div');
    title.className = 'text-pressure-title';
    title.setAttribute('role', 'img');
    title.setAttribute('aria-label', options.text);
    Object.assign(title.style, {
      fontFamily: options.fontFamily,
      textTransform: 'uppercase',
      lineHeight: '1',
      margin: '0',
      textAlign: 'center',
      userSelect: 'none',
      whiteSpace: 'nowrap',
      fontWeight: '100',
      width: '100%',
      color: options.textColor
    });
    if (options.flex) {
      title.style.display = 'flex';
      title.style.justifyContent = 'space-between';
    }
    const spans = chars.map(char => {
      const span = document.createElement('span');
      span.setAttribute('aria-hidden', 'true');
      span.style.display = 'inline-block';
      span.textContent = char === ' ' ? ' ' : char;  // a plain space collapses to zero width
      title.appendChild(span);
      return span;
    });
    container.appendChild(title);

    const mouse = { x: 0, y: 0 };
    const cursor = { x: 0, y: 0, seen: false };
    const ripples = [];
    const applied = [];
    const motionQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let rafId = 0;
    let last = 0;
    let idleFrames = 0;
    let clock = 0;
    let engage = options.idle === 'wave' || options.idle === 'pulse' ? 0 : 1;

    function tick(now) {
      rafId = 0;
      const elapsed = last ? Math.min(now - last, 64) : 1000 / 60;
      last = now;

      const idleMode =
        (options.idle === 'wave' || options.idle === 'pulse') && !(motionQuery && motionQuery.matches) ? options.idle : 'none';
      const lag = 1000 * options.smoothing * options.smoothing;
      const follow = lag > 1 ? 1 - Math.exp(-elapsed / lag) : 1;
      mouse.x += (cursor.x - mouse.x) * follow;
      mouse.y += (cursor.y - mouse.y) * follow;

      let present = 1;
      if (idleMode !== 'none') {
        const box = container.getBoundingClientRect();
        const inside = cursor.x >= box.left && cursor.x <= box.right && cursor.y >= box.top && cursor.y <= box.bottom;
        present = cursor.seen && inside ? 1 : 0;
      }
      engage += (present - engage) * (1 - Math.exp(-elapsed / 320));
      if (Math.abs(present - engage) < 0.002) engage = present;
      const idling = idleMode !== 'none' && engage < 1;
      if (idling) clock += (elapsed / 1000) * options.idleSpeed;

      while (ripples.length && now - ripples[0].start > RIPPLE_LIFE * 1000) ripples.shift();

      const titleRect = title.getBoundingClientRect();
      const maxDist = Math.max(titleRect.width * options.radius, 1);
      const spread = Math.max(options.radius * 2, 0.2);
      const centers = spans.map(span => {
        const rect = span.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      });

      let changed = false;
      spans.forEach((span, i) => {
        const center = centers[i];
        let pressure = clamp01(1 - dist(mouse, center) / maxDist);
        if (idling) {
          const position = (center.x - titleRect.left) / Math.max(titleRect.width, 1);
          const resting = getIdlePressure(idleMode, position, clock, spread);
          pressure = resting + (pressure - resting) * engage;
        }
        if (ripples.length) {
          const swell = getRipplePressure(ripples, center, now, titleRect.width);
          pressure = 1 - (1 - pressure) * (1 - swell);
        }

        const wdth = options.width ? Math.floor(5 + 200 * pressure) : 100;
        const wght = options.weight ? Math.floor(100 + 900 * pressure) : 400;
        const italVal = options.italic ? pressure.toFixed(2) : '0';
        const alphaVal = options.alpha ? pressure.toFixed(2) : '';
        const tint = Math.round((1 - (1 - pressure) * (1 - pressure)) * 100);
        const color = options.pressureColor
          ? 'color-mix(in oklab, ' + options.pressureColor + ' ' + tint + '%, ' + options.textColor + ')'
          : '';
        const settings = "'wght' " + wght + ", 'wdth' " + wdth + ", 'ital' " + italVal;
        const previous = applied[i];

        if (!previous || previous.settings !== settings || previous.alphaVal !== alphaVal || previous.color !== color) {
          span.style.fontVariationSettings = settings;
          span.style.opacity = alphaVal;
          span.style.color = color;
          applied[i] = { settings: settings, alphaVal: alphaVal, color: color };
          changed = true;
        }
      });

      const moving = Math.abs(cursor.x - mouse.x) > 0.1 || Math.abs(cursor.y - mouse.y) > 0.1;
      const animating = moving || idling || engage !== present || ripples.length > 0;
      idleFrames = animating ? 0 : idleFrames + 1;

      if (animating || (changed && idleFrames < 60)) rafId = requestAnimationFrame(tick);
      else last = 0;
    }

    function wake() {
      if (!rafId && visible) rafId = requestAnimationFrame(tick);
    }

    function track(x, y) {
      cursor.x = x;
      cursor.y = y;
      cursor.seen = true;
      wake();
    }
    function handleLeave() {
      cursor.seen = false;
      wake();
    }
    function handleTouch(e) {
      const t = e.touches[0];
      if (t) track(t.clientX, t.clientY);
    }

    window.addEventListener('mousemove', e => track(e.clientX, e.clientY));
    window.addEventListener('touchstart', handleTouch, { passive: true });
    window.addEventListener('touchmove', handleTouch, { passive: true });
    window.addEventListener('touchend', handleLeave);
    window.addEventListener('touchcancel', handleLeave);
    window.addEventListener('scroll', wake, { passive: true, capture: true });
    document.documentElement.addEventListener('mouseleave', handleLeave);
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', wake);
    container.addEventListener('pointerdown', e => {
      if (!options.clickRipple) return;
      ripples.push({ x: e.clientX, y: e.clientY, start: performance.now() });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
      wake();
    });

    const box = container.getBoundingClientRect();
    mouse.x = cursor.x = box.left + box.width / 2;
    mouse.y = cursor.y = box.top + box.height / 2;

    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) wake();
    }).observe(container);

    new ResizeObserver(() => {
      const w = container.getBoundingClientRect().width;
      title.style.fontSize = Math.max(chars.length ? w / (chars.length / 2) : options.minFontSize, options.minFontSize) + 'px';
      wake();
    }).observe(container);

    wake();
  };

  document.querySelectorAll('[data-text-pressure]').forEach(el => {
    window.initTextPressure(el, {
      text: el.getAttribute('data-text-pressure'),
      idle: 'wave',
      minFontSize: 36
    });
  });
})();
