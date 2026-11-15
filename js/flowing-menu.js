// Vanilla-JS port of the "FlowingMenu" component (originally React + @hugeicons).
// A stack of big text rows; hovering a row glides a liquid "band" over it with a
// scrolling marquee of that row's text/image. Spring physics make the band stretch.
//
// Classic script (not an ES module) so it also runs when the page is opened from disk
// (file://). Dropped vs. the original: the `carryContent` float-layer mode (unused here)
// and the @hugeicons arrow (so no dependency) — pass showArrow and it's simply ignored.
(function () {
  const EASE = 'cubic-bezier(0.2, 0.9, 0.2, 1)';
  const DIRECTIONS = ['left', 'right', 'alternate'];
  const SHAPES = ['pill', 'rounded', 'circle'];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const prefersReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  function initFlowingMenu(container, items, options = {}) {
    const s = {
      speed: Math.max(0, options.speed ?? 60),
      direction: DIRECTIONS.includes(options.direction) ? options.direction : 'left',
      followCursor: clamp(options.followCursor ?? 0.4, 0, 1),
      duration: Math.max(0.1, options.duration ?? 0.5),
      stretch: clamp(options.stretch ?? 0.6, 0, 1),
      magnet: clamp(options.magnet ?? 0.25, 0, 1),
      bandInset: Math.max(0, options.bandInset ?? 0),
      bandRadius: Math.max(0, options.bandRadius ?? 0),
      dimInactive: options.dimInactive ?? false,
      dividers: options.dividers ?? true,
      align: options.align === 'left' ? 'left' : 'center',
      showIndex: options.showIndex ?? false,
      imageShape: SHAPES.includes(options.imageShape) ? options.imageShape : 'pill',
      intro: options.intro ?? true,
      activeIndex: options.activeIndex,
      onItemClick: options.onItemClick,
      textColor: options.textColor ?? '#ffffff',
      bgColor: options.bgColor ?? '#120F17',
      marqueeBgColor: options.marqueeBgColor ?? '#ffffff',
      marqueeTextColor: options.marqueeTextColor ?? '#120F17',
      borderColor: options.borderColor ?? 'rgba(255, 255, 255, 0.14)'
    };

    const rows = [];
    const marquees = [];
    let metrics = [];
    let copies = [];
    const band = { top: 0, bottom: 0, vTop: 0, vBottom: 0, toTop: 0, toBottom: 0, lead: 1, shown: false, index: -1, rest: 0 };
    const cursor = { x: 0, y: null, t: 0, vx: 0 };
    const engine = { raf: 0, last: 0, timers: [], touched: false };

    const marqueeAt = index => {
      if (!marquees[index]) marquees[index] = { x: 0, part: 0, spin: 0, covered: false };
      return marquees[index];
    };
    const insetFor = height => Math.min(s.bandInset, Math.max(0, height / 2 - 2));
    const rowHeight = () => metrics.find(Boolean)?.height ?? 0;

    // --- Build DOM ---
    container.classList.add('flowing-menu');
    container.style.backgroundColor = s.bgColor;
    container.style.color = s.textColor;
    container.style.setProperty('--flowing-menu-border', s.borderColor);
    container.setAttribute('data-align', s.align);
    container.setAttribute('data-shape', s.imageShape);

    const list = document.createElement('ul');
    list.className = 'flowing-menu__list';
    container.appendChild(list);

    const buildParts = (track, item, count) => {
      track.textContent = '';
      for (let c = 0; c < count; c++) {
        const part = document.createElement('div');
        part.className = 'flowing-menu__part';
        const text = document.createElement('span');
        text.className = 'flowing-menu__part-text';
        text.textContent = item.marquee ?? item.text;
        part.appendChild(text);
        if (item.image) {
          const img = document.createElement('span');
          img.className = 'flowing-menu__image';
          img.style.backgroundImage = `url(${item.image})`;
          part.appendChild(img);
        }
        track.appendChild(part);
      }
    };

    items.forEach((item, index) => {
      const active = index === s.activeIndex;
      const li = document.createElement('li');
      li.className = 'flowing-menu__item';

      if (s.dividers && index > 0) {
        const div = document.createElement('span');
        div.className = 'flowing-menu__divider';
        div.setAttribute('data-intro-rule', '');
        div.setAttribute('aria-hidden', 'true');
        li.appendChild(div);
      }

      const interactive = !!item.link;
      const link = document.createElement(interactive ? 'a' : 'div');
      link.className = 'flowing-menu__link';
      if (interactive) {
        link.href = item.link;
        if (active) link.setAttribute('aria-current', 'page');
      }

      const idx = document.createElement('span');
      idx.className = 'flowing-menu__index';
      idx.setAttribute('data-intro-fade', '');
      idx.setAttribute('aria-hidden', 'true');
      if (s.showIndex) idx.textContent = String(index + 1).padStart(2, '0');

      const label = document.createElement('span');
      label.className = 'flowing-menu__label';
      const labelText = document.createElement('span');
      labelText.className = 'flowing-menu__label-text';
      labelText.setAttribute('data-intro-line', '');
      labelText.textContent = item.text;
      label.appendChild(labelText);
      if (active) {
        const dot = document.createElement('span');
        dot.className = 'flowing-menu__dot';
        dot.setAttribute('aria-hidden', 'true');
        label.appendChild(dot);
      }

      const end = document.createElement('span');
      end.className = 'flowing-menu__end';
      end.setAttribute('data-intro-fade', '');
      end.setAttribute('aria-hidden', 'true');
      if (item.meta) {
        const meta = document.createElement('span');
        meta.className = 'flowing-menu__meta';
        meta.textContent = item.meta;
        end.appendChild(meta);
      }

      link.appendChild(idx);
      link.appendChild(label);
      link.appendChild(end);
      if (interactive && s.onItemClick) {
        link.addEventListener('click', e => s.onItemClick(item, index, e));
      }
      li.appendChild(link);

      const bandEl = document.createElement('div');
      bandEl.className = 'flowing-menu__band';
      bandEl.setAttribute('aria-hidden', 'true');
      bandEl.style.backgroundColor = s.marqueeBgColor;
      bandEl.style.color = s.marqueeTextColor;
      const track = document.createElement('div');
      track.className = 'flowing-menu__track';
      buildParts(track, item, 3);
      bandEl.appendChild(track);
      li.appendChild(bandEl);

      list.appendChild(li);
      rows[index] = { item, node: li, band: bandEl, track };
    });

    const markRows = () => {
      const dim = s.dimInactive && band.index >= 0;
      rows.forEach((row, index) => {
        if (!row?.node) return;
        if (index === band.index) row.node.setAttribute('data-current', '');
        else row.node.removeAttribute('data-current');
        if (dim && index !== band.index) row.node.setAttribute('data-dimmed', '');
        else row.node.removeAttribute('data-dimmed');
      });
    };

    const paint = () => {
      const height = Math.max(0, band.bottom - band.top);
      rows.forEach((row, index) => {
        const m = metrics[index];
        if (!row?.band || !m) return;
        const state = marqueeAt(index);
        state.covered = false;
        const from = Math.max(band.top, m.top);
        const to = Math.min(band.bottom, m.top + m.height);
        if (!band.shown || to - from < 0.25) {
          row.band.style.visibility = 'hidden';
        } else {
          const side = Math.min(s.bandInset, Math.max(0, m.height / 2 - 2));
          const radius = Math.min(s.bandRadius, height / 2, Math.max(0, (row.node?.clientWidth ?? 0) / 2 - side));
          row.band.style.visibility = 'visible';
          row.band.style.clipPath = `inset(${(band.top - m.top).toFixed(2)}px ${side}px ${(m.top + m.height - band.bottom).toFixed(2)}px ${side}px round ${radius.toFixed(2)}px)`;
          state.covered = (to - from) / m.height > 0.04;
        }
        if (row.track) row.track.style.transform = `translate3d(${state.x.toFixed(2)}px, 0, 0)`;
      });
    };

    const frame = now => {
      engine.raf = 0;
      const b = band;
      const c = cursor;
      const reduced = prefersReduced();
      const elapsed = clamp((now - engine.last) / 1000, 0, 1 / 20);
      engine.last = now;
      let busy = false;

      if (b.shown) {
        const current = b.index >= 0 ? metrics[b.index] : null;
        if (current) {
          const inset = insetFor(current.height);
          const lean =
            c.y === null || reduced
              ? 0
              : clamp((c.y - (current.top + current.height / 2)) * s.magnet, -current.height * 0.3, current.height * 0.3);
          b.toTop = current.top + inset + lean;
          b.toBottom = current.top + current.height - inset + lean;
        } else if (b.index < 0) {
          b.toTop = b.toBottom = b.rest;
        }
        const gap = (b.toTop + b.toBottom) / 2 - (b.top + b.bottom) / 2;
        if (Math.abs(gap) > 2) b.lead = gap > 0 ? 1 : -1;
        if (reduced) {
          b.top = b.toTop;
          b.bottom = b.toBottom;
          b.vTop = b.vBottom = 0;
        } else {
          const omega = (Math.PI * 2) / s.duration;
          const fast = omega * (1 + 1.1 * s.stretch);
          const slow = omega * (1 - 0.4 * s.stretch);
          const zeta = 1 - 0.3 * s.stretch;
          const wTop = b.lead > 0 ? slow : fast;
          const wBottom = b.lead > 0 ? fast : slow;
          const steps = Math.max(1, Math.ceil(elapsed / (1 / 240)));
          const dt = elapsed / steps;
          for (let i = 0; i < steps; i++) {
            b.vTop += (-wTop * wTop * (b.top - b.toTop) - 2 * zeta * wTop * b.vTop) * dt;
            b.vBottom += (-wBottom * wBottom * (b.bottom - b.toBottom) - 2 * zeta * wBottom * b.vBottom) * dt;
            b.top += b.vTop * dt;
            b.bottom += b.vBottom * dt;
            if (b.bottom < b.top) {
              const mid = (b.top + b.bottom) / 2;
              const v = (b.vTop + b.vBottom) / 2;
              b.top = b.bottom = mid;
              b.vTop = b.vBottom = v;
            }
          }
        }
        const resting =
          Math.abs(b.top - b.toTop) < 0.1 &&
          Math.abs(b.bottom - b.toBottom) < 0.1 &&
          Math.abs(b.vTop) < 2 &&
          Math.abs(b.vBottom) < 2;
        if (resting) {
          b.top = b.toTop;
          b.bottom = b.toBottom;
          b.vTop = b.vBottom = 0;
          if (b.index < 0 && b.bottom - b.top < 0.5) b.shown = false;
        } else busy = true;
      }

      c.vx *= Math.exp(-elapsed / 0.3);
      const push = clamp(c.vx * s.followCursor * 0.55, -1600, 1600);

      marquees.forEach((state, index) => {
        if (!state) return;
        const goal = state.covered ? 1 : 0;
        state.spin += (goal - state.spin) * (1 - Math.exp(-elapsed / 0.35));
        if (Math.abs(goal - state.spin) < 0.002) state.spin = goal;
        if (!state.covered && state.spin === 0) return;
        busy = true;
        if (state.part <= 0 || reduced) return;
        const flow = s.direction === 'alternate' ? (index % 2 ? 1 : -1) : s.direction === 'right' ? 1 : -1;
        state.x += (flow * s.speed + push) * state.spin * elapsed;
        state.x = (((state.x % state.part) + state.part) % state.part) - state.part;
      });

      paint();
      if (busy) engine.raf = requestAnimationFrame(frame);
    };

    const kick = () => {
      if (engine.raf) return;
      engine.last = performance.now();
      engine.raf = requestAnimationFrame(frame);
    };

    const goTo = (index, from) => {
      const m = metrics[index];
      if (!m) return;
      const b = band;
      const inset = insetFor(m.height);
      const top = m.top + inset;
      const bottom = m.top + m.height - inset;
      if (!b.shown) {
        const start = from === 'bottom' ? bottom : from === 'center' ? (top + bottom) / 2 : top;
        b.top = b.bottom = start;
        b.vTop = b.vBottom = 0;
        b.shown = true;
      }
      const shift = (top + bottom) / 2 - (b.top + b.bottom) / 2;
      if (Math.abs(shift) > 0.5) b.lead = shift > 0 ? 1 : -1;
      else b.lead = from === 'bottom' ? -1 : 1;
      b.toTop = top;
      b.toBottom = bottom;
      b.index = index;
      markRows();
      kick();
    };

    const release = toward => {
      const b = band;
      if (!b.shown) return;
      const point = toward === 'top' ? b.toTop : toward === 'bottom' ? b.toBottom : (b.toTop + b.toBottom) / 2;
      b.lead = toward === 'top' ? -1 : 1;
      b.rest = point;
      b.toTop = b.toBottom = point;
      b.index = -1;
      cursor.y = null;
      markRows();
      kick();
    };

    const rowAt = clientY => {
      const y = clientY - list.getBoundingClientRect().top;
      return metrics.findIndex(m => m && y >= m.top && y < m.top + m.height);
    };
    const halfOf = (clientY, index) => {
      const m = metrics[index];
      if (!m) return 'top';
      return clientY - list.getBoundingClientRect().top - m.top < m.height / 2 ? 'top' : 'bottom';
    };

    const stopIntro = () => {
      engine.touched = true;
      engine.timers.forEach(clearTimeout);
      engine.timers = [];
    };

    const measure = () => {
      metrics = rows.map(row => (row?.node ? { top: row.node.offsetTop, height: row.node.offsetHeight } : null));
      if (metrics[0]) {
        const height = metrics[0].height;
        const inset = insetFor(height);
        container.style.setProperty('--flowing-menu-band', String(height ? (height - inset * 2) / height : 1));
      }
      const next = rows.map((row, index) => {
        const state = marqueeAt(index);
        const part = row?.track?.firstElementChild;
        const width = part?.getBoundingClientRect().width ?? 0;
        const total = row?.node?.getBoundingClientRect().width ?? 0;
        if (width > 0) {
          state.part = width;
          state.x = (((state.x % width) + width) % width) - width;
        }
        return width > 0 ? Math.max(2, Math.ceil(total / width) + 1) : 3;
      });
      const changed = copies.length !== next.length || copies.some((v, i) => v !== next[i]);
      if (changed) {
        copies = next;
        rows.forEach((row, index) => {
          if (row?.track) buildParts(row.track, row.item, copies[index] ?? 3);
        });
      }
      if (band.shown && band.index >= 0) {
        const m = metrics[band.index];
        if (m) {
          const inset = insetFor(m.height);
          band.toTop = m.top + inset;
          band.toBottom = m.top + m.height - inset;
        }
      }
      paint();
      kick();
    };

    // --- Pointer handlers on the list ---
    list.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      stopIntro();
      const now = performance.now();
      const gap = (now - cursor.t) / 1000;
      if (gap > 0 && gap < 0.1) {
        const instant = (event.clientX - cursor.x) / gap;
        cursor.vx += (instant - cursor.vx) * (1 - Math.exp(-gap / 0.08));
      }
      cursor.x = event.clientX;
      cursor.t = now;
      cursor.y = event.clientY - list.getBoundingClientRect().top;
      const index = rowAt(event.clientY);
      if (index >= 0 && index !== band.index) goTo(index, halfOf(event.clientY, index));
      else kick();
    });
    list.addEventListener('pointerleave', event => {
      if (event.pointerType === 'touch') return;
      if (band.index < 0) return;
      const rect = list.getBoundingClientRect();
      if (event.clientY <= rect.top) release('top');
      else if (event.clientY >= rect.bottom) release('bottom');
      else release(halfOf(event.clientY, band.index));
    });

    // --- Measure now and on resize ---
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => measure());
      observer.observe(container);
      rows.forEach(row => {
        const part = row?.track?.firstElementChild;
        if (part) observer.observe(part);
      });
    }

    // --- Intro: rows rise, lines draw, the band sweeps once down the menu ---
    if (s.intro && !prefersReduced()) {
      container.querySelectorAll('[data-intro-line]').forEach((node, i) => {
        node.animate([{ transform: 'translateY(110%)' }, { transform: 'none' }], { duration: 900, delay: i * 70, easing: EASE, fill: 'backwards' });
      });
      container.querySelectorAll('[data-intro-fade]').forEach((node, i) => {
        node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, delay: 200 + i * 40, easing: 'ease', fill: 'backwards' });
      });
      container.querySelectorAll('[data-intro-rule]').forEach((node, i) => {
        node.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 1100, delay: i * 70, easing: EASE, fill: 'backwards' });
      });
      const count = rows.filter(Boolean).length;
      const start = 650 + count * 70;
      for (let i = 0; i < count; i++) {
        engine.timers.push(setTimeout(() => { if (!engine.touched) goTo(i, 'top'); }, start + i * 170));
      }
      engine.timers.push(setTimeout(() => { if (!engine.touched) release('bottom'); }, start + count * 170 + 120));
    }
  }

  window.initFlowingMenu = initFlowingMenu;
})();
