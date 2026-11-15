// Vanilla port of React Bits <TechText /> (canvas wordmark: the letter under the pointer turns into
// a dashed outline with a selection frame; letters can be dragged and kicked).
// Classic script, no dependencies. Must load BEFORE app.js so SplitType never touches these headings.
//
// It upgrades the page's section headings in place: the real heading text stays in the DOM
// (visually hidden, for search engines and screen readers) and each wrapped line gets its own canvas.
// Not ported (unused here): reveal="area", the intros (type / assemble / metrics) and the metric guides.
(function () {
  'use strict';

  const HEADINGS = '.headline__title, .block__descr > h1, .block__descr > h2';
  const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const SPRING = 320;
  const INHERIT = /^(currentcolor|inherit)$/i;
  const KICK_DECAY = 0.62;
  const PAD_X = 16;  // canvas bleeds this far past the text so frames/specks aren't clipped (< 20px mobile gutter)

  const approach = (current, target, dt, seconds) => current + (target - current) * (1 - Math.exp(-dt / seconds));
  const clamp01 = value => Math.min(1, Math.max(0, Number(value) || 0));
  const signed = value => (value > 0 ? '+' + value : value < 0 ? '−' + -value : '0');
  const noise = (...values) => {
    let h = 2166136261;
    for (const value of values) {
      h = Math.imul(h ^ (value | 0), 16777619);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  };

  function setFont(target, s, size) {
    target.font = s.fontWeight + ' ' + size + 'px ' + s.fontFamily;
    if ('letterSpacing' in target) target.letterSpacing = s.letterSpacing * size + 'px';
    target.textAlign = 'left';
    target.textBaseline = 'alphabetic';
  }

  // One canvas wordmark filling `container`. Returns a destroy function.
  function createTechText(container, userSettings) {
    const s = Object.assign({
      text: '',
      fontFamily: 'sans-serif',
      fontWeight: 600,
      fontSize: 150,
      letterSpacing: 0,
      color: 'currentColor',
      accentColor: 'currentColor',
      dashLength: 4,
      dashGap: 2,
      strokeWidth: 1.5,
      lineStyle: 'dashed',
      reveal: 'letter',
      specks: 15,
      selection: true,
      labels: true,
      draggable: true,
      bounce: 0.4,
      sweep: true,
      speed: 1,
      clickKick: true
    }, userSettings);

    const canvas = document.createElement('canvas');
    canvas.className = 'tech-text-canvas';
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const probe = document.createElement('canvas').getContext('2d');
    if (!ctx || !probe) return function () {};

    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let raf = 0;
    let last = performance.now();
    let visible = false;
    let alive = true;
    let layoutKey = '';
    let sizeDirty = true;
    let word = null;
    let glyphs = [];
    let clock = 0;
    let pulse = 0;
    let placed = false;
    let dragging = -1;
    let cursor = '';
    const kicks = [];
    const press = { x: 0, y: 0, time: 0, index: -1 };
    const pointer = { x: 0, y: 0, inside: false };
    const grab = { x: 0, y: 0 };
    const lens = { x: 0, y: 0 };
    const frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

    function palette() {
      const current = getComputedStyle(container).color || '#000000';
      const pick = value => (!value || INHERIT.test(String(value).trim()) ? current : value);
      return { ink: pick(s.color), accent: pick(s.accentColor) };
    }

    function sprite(view, glyph, stroke, ink) {
      const pad = Math.ceil(s.strokeWidth * 2 + 4);
      const left = glyph.box.x1 - pad;
      const top = glyph.box.y1 - pad;
      const w = glyph.box.x2 - glyph.box.x1 + pad * 2;
      const h = glyph.box.y2 - glyph.box.y1 + pad * 2;
      const image = document.createElement('canvas');
      image.width = Math.max(1, Math.ceil(w * dpr));
      image.height = Math.max(1, Math.ceil(h * dpr));
      const c = image.getContext('2d');
      if (!c) return { image: image, left: left, top: top };
      c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
      setFont(c, s, view.size);
      if (stroke) {
        c.lineJoin = 'round';
        c.lineWidth = s.strokeWidth * 2;
        c.lineCap = 'butt';
        c.strokeStyle = ink;
        if (s.lineStyle !== 'solid') c.setLineDash([Math.max(1, s.dashLength), Math.max(1, s.dashGap)]);
        c.strokeText(glyph.char, glyph.x, view.baseline);
        c.setLineDash([]);
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000000';
        c.fillText(glyph.char, glyph.x, view.baseline);
        c.globalCompositeOperation = 'source-over';
      } else {
        c.fillStyle = ink;
        c.fillText(glyph.char, glyph.x, view.baseline);
      }
      return { image: image, left: left, top: top };
    }

    function ensureLayout(ink) {
      const key = [ink, width, height, dpr].join('|');
      if (key === layoutKey && word) return word;
      layoutKey = key;

      setFont(probe, s, s.fontSize);
      let m = probe.measureText(s.text);
      // Shrink only if this single line is wider than the heading column (one very long word).
      const fit = Math.min(1, (width - PAD_X * 2) / Math.max(m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1));
      const size = s.fontSize * fit;
      setFont(probe, s, size);
      m = probe.measureText(s.text);
      const x = PAD_X + m.actualBoundingBoxLeft;
      // Centre on the font's own line box (not this line's ink) so every line keeps the same rhythm.
      const fa = m.fontBoundingBoxAscent || m.actualBoundingBoxAscent;
      const fd = m.fontBoundingBoxDescent || m.actualBoundingBoxDescent;
      const baseline = (height - (fa + fd)) / 2 + fa;
      const next = {
        size: size,
        baseline: baseline,
        left: x - m.actualBoundingBoxLeft,
        right: x + m.actualBoundingBoxRight,
        top: baseline - m.actualBoundingBoxAscent,
        bottom: baseline + m.actualBoundingBoxDescent
      };
      word = next;

      const previous = glyphs;
      glyphs = [];
      let prefix = '';
      Array.from(s.text).forEach((char, i) => {
        prefix += char;
        const own = probe.measureText(char);
        const gx = x + probe.measureText(prefix).width - own.width;
        if (!char.trim()) return;
        const base = {
          char: char,
          x: gx,
          box: {
            x1: gx - own.actualBoundingBoxLeft,
            y1: baseline - own.actualBoundingBoxAscent,
            x2: gx + own.actualBoundingBoxRight,
            y2: baseline + own.actualBoundingBoxDescent
          }
        };
        const kept = previous[glyphs.length];
        const same = kept && kept.char === char && kept.index === i;
        glyphs.push(Object.assign(base, {
          offset: same ? kept.offset : { x: 0, y: 0 },
          velocity: same ? kept.velocity : { x: 0, y: 0 },
          outline: same ? kept.outline : 0,
          index: i,
          fill: sprite(next, base, false, ink),
          dashes: sprite(next, base, true, ink)
        }));
      });
      return next;
    }

    function glyphAt(x, y) {
      if (!word || y < word.top - 24 || y > word.bottom + 24) return -1;
      let best = -1;
      let bestDistance = Infinity;
      glyphs.forEach((glyph, i) => {
        const x1 = glyph.box.x1 + glyph.offset.x;
        const x2 = glyph.box.x2 + glyph.offset.x;
        const d = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      });
      return bestDistance < 28 ? best : -1;
    }

    function blit(art, dx, dy) {
      ctx.drawImage(art.image, Math.round((art.left + dx) * dpr), Math.round((art.top + dy) * dpr));
    }

    const crisp = value => (Math.round(value * dpr) + 0.5) / dpr;

    function perimeterPoint(distance, w, h) {
      let d = ((distance % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
      if (d < w) return [frame.x1 + d, frame.y1, 0, -1];
      d -= w;
      if (d < h) return [frame.x2, frame.y1 + d, 1, 0];
      d -= h;
      if (d < w) return [frame.x2 - d, frame.y2, 0, 1];
      d -= w;
      return [frame.x1, frame.y2 - d, -1, 0];
    }

    function drawSpecks(a, accent) {
      const w = frame.x2 - frame.x1;
      const h = frame.y2 - frame.y1;
      if (w < 2 || h < 2) return;
      const perimeter = 2 * (w + h);
      const seed = frame.index + 1;
      const grid = 3;
      ctx.fillStyle = accent;
      ctx.strokeStyle = accent;

      for (let k = 0; k < s.specks; k++) {
        const period = 0.5 + noise(seed, k, 11) * 1.2;
        const t = pulse / period + noise(seed, k, 17);
        const cycle = Math.floor(t);
        const life = t - cycle;
        if (life > 0.7) continue;
        const p = perimeterPoint(noise(seed, k, cycle) * perimeter, w, h);
        const pick = noise(seed, k, cycle, 2);
        const size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
        const large = size >= 8;
        const out = (large ? 9 : 4) + Math.floor(noise(seed, k, cycle, 1) * 5) * grid;
        const x = frame.x1 + Math.round((p[0] + p[2] * out - frame.x1) / grid) * grid;
        const y = frame.y1 + Math.round((p[1] + p[3] * out - frame.y1) / grid) * grid;
        const tone = noise(seed, k, cycle, 3);
        const blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
        const left = Math.round(x - size / 2);
        const top = Math.round(y - size / 2);
        ctx.globalAlpha = a * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
        if (tone < 0.26 || (large && tone < 0.78)) {
          ctx.strokeRect(left + 0.5, top + 0.5, size, size);
          if (large && tone > 0.5) ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
        } else {
          ctx.fillRect(left, top, size, size);
        }
      }

      for (let j = 0; j < 2; j++) {
        const head = (pulse * 0.42 * s.speed + j * 0.5) * perimeter;
        for (let i = 0; i < 4; i++) {
          const p = perimeterPoint(head - i * 6, w, h);
          const size = i === 0 ? 3 : 2;
          ctx.globalAlpha = a * [0.95, 0.55, 0.32, 0.16][i];
          ctx.fillRect(Math.round(p[0] - size / 2), Math.round(p[1] - size / 2), size, size);
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawFrame(accent) {
      const glyph = glyphs[frame.index];
      if (!glyph || frame.alpha < 0.01) return;
      const a = frame.alpha;
      const x1 = crisp(frame.x1);
      const y1 = crisp(frame.y1);
      const x2 = crisp(frame.x2);
      const y2 = crisp(frame.y2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = accent;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;

      const moved = Math.hypot(glyph.offset.x, glyph.offset.y);
      if (moved > 1) {
        const hx = (glyph.box.x1 + glyph.box.x2) / 2;
        const hy = (glyph.box.y1 + glyph.box.y2) / 2;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + glyph.offset.x, hy + glyph.offset.y);
        ctx.setLineDash([3, 4]);
        ctx.globalAlpha = 0.45 * a;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
        ctx.globalAlpha = 0.7 * a;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.rect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha = 0.5 * a;
      ctx.stroke();

      ctx.beginPath();
      [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].forEach(c => ctx.rect(Math.round(c[0]) - 2, Math.round(c[1]) - 2, 5, 5));
      ctx.globalAlpha = 0.95 * a;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (s.specks > 0) drawSpecks(a, accent);
      if (!s.labels) return;
      ctx.font = LABEL_FONT;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.62 * a;
      const label = moved > 1
        ? signed(Math.round(glyph.offset.x)) + ', ' + signed(Math.round(-glyph.offset.y))
        : glyph.char + '  ' + Math.round(glyph.box.x2 - glyph.box.x1) + ' × ' + Math.round(glyph.box.y2 - glyph.box.y1);
      ctx.fillText(label, Math.round(frame.x1), Math.round(frame.y1) - 7);
      ctx.globalAlpha = 1;
    }

    function kick(index) {
      const strength = (word ? word.size : 120) * 11;
      kicks.push({ index: index, at: pulse, velocity: strength });
      for (let d = 1; d < glyphs.length; d++) {
        const velocity = strength * Math.pow(KICK_DECAY, d);
        if (velocity < 30) break;
        [index - d, index + d].forEach(j => {
          if (j >= 0 && j < glyphs.length) kicks.push({ index: j, at: pulse + d * 0.055, velocity: velocity });
        });
      }
      wake();
    }

    function tick(now) {
      raf = 0;
      if (sizeDirty) {
        sizeDirty = false;
        width = Math.max(1, container.clientWidth);
        height = Math.max(1, container.clientHeight);
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pixelWidth = Math.round(width * dpr);
        const pixelHeight = Math.round(height * dpr);
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const colors = palette();
      const view = ensureLayout(colors.ink);
      const damping = 2 * Math.sqrt(SPRING) * (1 - clamp01(s.bounce) * 0.96);

      const sweeping = s.sweep && !reducedMotion && !pointer.inside && dragging < 0;
      if (sweeping) clock += dt * s.speed;
      pulse += dt;
      let targetX = pointer.x;
      let targetY = pointer.y;
      if (sweeping) {
        targetX = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
        targetY = view.top + (view.bottom - view.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
      }
      const active = pointer.inside || sweeping || dragging >= 0;
      if (active && !placed) {
        lens.x = targetX;
        lens.y = targetY;
      }
      if (active) {
        const lag = pointer.inside ? 0.05 : 0.22;
        lens.x = approach(lens.x, targetX, dt, lag);
        lens.y = approach(lens.y, targetY, dt, lag);
      }
      placed = active;

      for (let k = kicks.length - 1; k >= 0; k--) {
        if (kicks[k].at > pulse) continue;
        const glyph = glyphs[kicks[k].index];
        if (glyph) glyph.velocity.y -= kicks[k].velocity;
        kicks.splice(k, 1);
      }

      let moving = false;
      glyphs.forEach((glyph, i) => {
        if (i === dragging) {
          glyph.offset.x = approach(glyph.offset.x, pointer.x - grab.x, dt, 0.03);
          glyph.offset.y = approach(glyph.offset.y, pointer.y - grab.y, dt, 0.03);
          glyph.velocity.x = 0;
          glyph.velocity.y = 0;
          moving = true;
          return;
        }
        const offset = glyph.offset;
        const velocity = glyph.velocity;
        if (Math.abs(offset.x) < 0.05 && Math.abs(offset.y) < 0.05 && Math.hypot(velocity.x, velocity.y) < 0.5) {
          offset.x = offset.y = velocity.x = velocity.y = 0;
          return;
        }
        velocity.x += (-SPRING * offset.x - damping * velocity.x) * dt;
        velocity.y += (-SPRING * offset.y - damping * velocity.y) * dt;
        offset.x += velocity.x * dt;
        offset.y += velocity.y * dt;
        moving = true;
      });

      const focus = dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
      if (focus >= 0 && s.selection) {
        const glyph = glyphs[focus];
        const bx1 = glyph.box.x1 + glyph.offset.x - 6;
        const by1 = glyph.box.y1 + glyph.offset.y - 6;
        const bx2 = glyph.box.x2 + glyph.offset.x + 6;
        const by2 = glyph.box.y2 + glyph.offset.y + 6;
        if (frame.index < 0 || frame.alpha < 0.02) {
          frame.x1 = bx1;
          frame.y1 = by1;
          frame.x2 = bx2;
          frame.y2 = by2;
        }
        const glide = focus === dragging ? 0.02 : 0.08;
        frame.x1 = approach(frame.x1, bx1, dt, glide);
        frame.y1 = approach(frame.y1, by1, dt, glide);
        frame.x2 = approach(frame.x2, bx2, dt, glide);
        frame.y2 = approach(frame.y2, by2, dt, glide);
        frame.index = focus;
      }
      frame.alpha = approach(frame.alpha, focus >= 0 && s.selection ? 1 : 0, dt, 0.1);

      glyphs.forEach((glyph, i) => {
        const target = s.reveal === 'letter' && i === focus && i !== dragging ? 1 : 0;
        glyph.outline = approach(glyph.outline, target, dt, 0.09);
        if (Math.abs(glyph.outline - target) > 0.002) moving = true;
        else glyph.outline = target;
      });

      const hovering = focus >= 0 && pointer.inside;
      const nextCursor = dragging >= 0 ? 'grabbing' : hovering && s.draggable ? 'grab' : hovering && s.clickKick ? 'pointer' : '';
      if (nextCursor !== cursor) {
        cursor = nextCursor;
        container.style.cursor = nextCursor;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      glyphs.forEach(glyph => {
        const moved = Math.hypot(glyph.offset.x, glyph.offset.y);
        if (moved > 1) {
          ctx.globalAlpha = Math.min(1, moved / 24) * 0.55;
          blit(glyph.dashes, 0, 0);
          ctx.globalAlpha = 1;
        }
      });
      glyphs.forEach(glyph => {
        if (glyph.outline < 0.999) {
          ctx.globalAlpha = 1 - glyph.outline;
          blit(glyph.fill, glyph.offset.x, glyph.offset.y);
        }
        if (glyph.outline > 0.001) {
          ctx.globalAlpha = glyph.outline;
          blit(glyph.dashes, glyph.offset.x, glyph.offset.y);
        }
        ctx.globalAlpha = 1;
      });
      drawFrame(colors.accent);

      const settling = moving || kicks.length > 0 || (frame.alpha > 0.01 && frame.alpha < 0.99);
      if ((active || settling) && visible && alive) raf = requestAnimationFrame(tick);
    }

    function wake() {
      if (raf || !visible || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function resize() {
      sizeDirty = true;
      wake();
    }
    function refreshFonts() {
      layoutKey = '';
      wake();
    }
    function locate(e) {
      const rect = container.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    }
    function onMove(e) {
      locate(e);
      pointer.inside = true;
      wake();
    }
    function onLeave() {
      if (dragging >= 0) return;
      pointer.inside = false;
      wake();
    }
    function onDown(e) {
      locate(e);
      pointer.inside = true;
      const primary = e.pointerType !== 'mouse' || e.button === 0;
      const index = primary ? glyphAt(pointer.x, pointer.y) : -1;
      press.x = pointer.x;
      press.y = pointer.y;
      press.time = performance.now();
      press.index = index;
      if (s.draggable && index >= 0) {
        dragging = index;
        grab.x = pointer.x - glyphs[index].offset.x;
        grab.y = pointer.y - glyphs[index].offset.y;
        if (container.setPointerCapture) container.setPointerCapture(e.pointerId);
      }
      wake();
    }
    function onUp(e) {
      const rect = container.getBoundingClientRect();
      if (dragging >= 0) {
        dragging = -1;
        if (container.releasePointerCapture) container.releasePointerCapture(e.pointerId);
        pointer.inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      }
      if (e.type === 'pointerup' && press.index >= 0 && s.clickKick && !reducedMotion && performance.now() - press.time < 450) {
        if (Math.hypot(e.clientX - rect.left - press.x, e.clientY - rect.top - press.y) < 6) kick(press.index);
      }
      press.index = -1;
      wake();
    }

    const passive = { passive: true };
    container.addEventListener('pointermove', onMove, passive);
    container.addEventListener('pointerenter', onMove, passive);
    container.addEventListener('pointerdown', onDown, passive);
    container.addEventListener('pointerup', onUp, passive);
    container.addEventListener('pointercancel', onUp, passive);
    container.addEventListener('pointerleave', onLeave, passive);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      wake();
    });
    intersectionObserver.observe(container);
    // The site's light/dark switch sets a `color-scheme` attribute on <html>; redraw in the new ink.
    const themeObserver = new MutationObserver(wake);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'color-scheme'] });
    if (document.fonts) document.fonts.ready.then(refreshFonts, refreshFonts);

    return function destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      canvas.remove();
    };
  }

  // Draw a heading with one TechText canvas per line. The real text stays in the flow, transparent:
  // it keeps the original size and wrapping, and stays readable to search engines and screen readers.
  function enhanceHeading(heading) {
    const tmp = document.createElement('div');
    const segments = heading.innerHTML.split(/<br\s*\/?>/i).map(html => {
      tmp.innerHTML = html;
      return tmp.textContent.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    if (!segments.length) return;

    heading.classList.remove('reveal-type');  // SplitType would otherwise re-split the text
    heading.textContent = '';
    heading.style.position = 'relative';
    const sizer = document.createElement('span');
    sizer.style.cssText = 'color:transparent;user-select:none';
    segments.forEach((segment, i) => {
      if (i) sizer.appendChild(document.createElement('br'));
      segment.split(' ').forEach((wordText, j) => {
        if (j) sizer.appendChild(document.createTextNode(' '));
        const span = document.createElement('span');  // one span per word, to read where the browser wraps
        span.textContent = wordText;
        sizer.appendChild(span);
      });
    });
    const stage = document.createElement('span');
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = 'display:block;position:absolute;top:0;right:0;bottom:0;left:0;user-select:none';
    heading.append(sizer, stage);

    const words = Array.from(sizer.querySelectorAll('span'));
    let builtKey = '';
    let destroyers = [];

    function build() {
      const cs = getComputedStyle(heading);
      const size = parseFloat(cs.fontSize) || 40;
      if (!heading.clientWidth) return;

      const lines = [];
      words.forEach(span => {
        const current = lines[lines.length - 1];
        if (current && Math.abs(current.top - span.offsetTop) < 2) current.text += ' ' + span.textContent;
        else lines.push({ text: span.textContent, top: span.offsetTop, height: span.offsetHeight });
      });

      const key = [lines.map(line => line.text + '@' + line.top).join('|'), size, heading.clientWidth, cs.fontFamily, cs.fontWeight].join('|');
      if (key === builtKey) return;
      builtKey = key;
      destroyers.forEach(destroy => destroy());
      destroyers = [];
      stage.textContent = '';

      const font = {
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        fontSize: size,
        letterSpacing: (parseFloat(cs.letterSpacing) || 0) / size
      };
      const padY = Math.round(size * 0.35);  // room above/below the line for labels, specks and kicked letters
      lines.forEach(line => {
        const box = document.createElement('span');
        box.className = 'tech-text';
        box.style.cssText = 'display:block;position:absolute;touch-action:pan-y;left:' + -PAD_X + 'px;right:' + -PAD_X +
          'px;top:' + (line.top - padY) + 'px;height:' + (line.height + padY * 2) + 'px';
        stage.appendChild(box);
        // Only the hero sweeps on its own; section headings animate on hover/tap, to spare phone batteries.
        const sweep = heading.classList.contains('headline__title');
        destroyers.push(createTechText(box, Object.assign({ text: line.text, sweep: sweep }, font)));
      });
    }

    build();
    new ResizeObserver(build).observe(heading);
    if (document.fonts) document.fonts.ready.then(build);
  }
  document.querySelectorAll(HEADINGS).forEach(enhanceHeading);
})();
