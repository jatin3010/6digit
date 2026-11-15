// Vanilla-JS port of the "FolderFloat" component (originally React + matter-js).
// A folder whose flap opens to float out a cloud of pills; once they land, an optional
// zero-gravity matter-js world lets them drift, collide and be dragged.
//
// Classic script (not an ES module) so it also runs when the page is opened directly
// from disk (file://). matter-js is pulled in with a dynamic import() of a remote URL
// the first time physics starts — that works from a classic script and from file://
// alike, and keeps it off the page-load path (the folder is closed by default).
(function () {
  const PAD = 28;
  const CHAR = 6.8;
  const GAP = 12;
  const ROW = 52;
  const DRAG_MIN = 4;
  const ZONE_PAD = 8;

  const jitter = i => {
    const x = Math.sin(i * 12.9898 + 4.1414) * 43758.5453;
    return x - Math.floor(x);
  };

  const layout = (list, spread, lift, tilt, sizes) => {
    const rows = [];
    let row = [];
    let width = 0;
    list.forEach((item, i) => {
      const pw = sizes[i]?.w ?? PAD + item.label.length * CHAR;
      if (row.length && width + GAP + pw > spread * 2) {
        rows.push({ items: row, width });
        row = [];
        width = 0;
      }
      row.push({ i, pw });
      width += (row.length > 1 ? GAP : 0) + pw;
    });
    if (row.length) rows.push({ items: row, width });
    const pos = [];
    rows.forEach((r, ri) => {
      let x = -r.width / 2;
      const shift = (ri % 2 ? 1 : -1) * Math.min(16, spread * 0.1);
      r.items.forEach(({ i, pw }) => {
        const j = jitter(i);
        pos[i] = { x: x + pw / 2 + shift + (j - 0.5) * 6, y: -lift - ri * ROW - j * 6, r: tilt * (j * 2 - 1) };
        x += pw + GAP;
      });
    });
    return pos;
  };

  let MatterLib;
  async function ensureMatter() {
    if (MatterLib !== undefined) return MatterLib;
    try {
      MatterLib = (await import('https://cdn.jsdelivr.net/npm/matter-js@0.20.0/+esm')).default;
    } catch {
      MatterLib = null; // CDN unreachable: fall back to CSS-only drift, no physics
    }
    return MatterLib;
  }

  function initFolderFloat(container, items, options = {}) {
    const o = {
      label: options.label ?? 'Design feedback',
      sublabel: options.sublabel ?? '',
      trigger: options.trigger ?? 'hover',
      defaultOpen: options.defaultOpen ?? false,
      closeOnSelect: options.closeOnSelect ?? true,
      physics: options.physics ?? true,
      drift: options.drift ?? 0.5,
      onSelect: options.onSelect,
      onOpenChange: options.onOpenChange,
      folderColor: options.folderColor ?? '#3f3f46',
      frontColor: options.frontColor ?? '#52525b',
      paperColor: options.paperColor ?? '#f5f5f5',
      itemColor: options.itemColor ?? '#f5f5f5',
      itemTextColor: options.itemTextColor ?? '#18181b',
      labelColor: options.labelColor ?? '#f5f5f5',
      width: options.width ?? 200,
      height: options.height ?? 148,
      radius: options.radius ?? 14,
      spread: options.spread ?? 180,
      lift: options.lift ?? 26,
      tilt: options.tilt ?? 8,
      flapAngle: options.flapAngle ?? 34,
      restAngle: options.restAngle ?? 16,
      openDuration: options.openDuration ?? 520,
      stagger: options.stagger ?? 45,
      bounce: options.bounce ?? 0.3
    };

    const list = items.map(item => (typeof item === 'string' ? { label: item, value: item } : item));
    const n = list.length;
    const sub = o.sublabel || `${n} ${n === 1 ? 'note' : 'notes'}`;

    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduce = reduceMq.matches;

    let open = o.defaultOpen;
    let live = false;
    let sizes = [];
    let popTimer;
    let liveTimer;
    const world = { engine: null, bodies: [], sizes: [], raf: 0, last: 0, t0: 0, drag: null, zone: null };

    container.classList.add('folder-float');
    container.setAttribute('data-trigger', o.trigger);
    if (o.physics) container.setAttribute('data-physics', '');
    const vars = {
      '--ff-w': `${o.width}px`,
      '--ff-h': `${o.height}px`,
      '--ff-r': `${o.radius}px`,
      '--ff-back': o.folderColor,
      '--ff-front': o.frontColor,
      '--ff-paper': o.paperColor,
      '--ff-item': o.itemColor,
      '--ff-item-ink': o.itemTextColor,
      '--ff-label': o.labelColor,
      '--ff-spread': `${o.spread}px`,
      '--ff-lift': `${o.lift}px`,
      '--ff-angle': `${o.flapAngle}deg`,
      '--ff-rest': `${o.restAngle}deg`,
      '--ff-open': `${o.openDuration}ms`,
      '--ff-close': `${Math.round(o.openDuration * 0.6)}ms`,
      '--ff-stagger': `${o.stagger}ms`,
      '--ff-n': n,
      '--ff-spring': `cubic-bezier(0.34, ${(1 + o.bounce * 1.9).toFixed(2)}, 0.64, 1)`
    };
    Object.entries(vars).forEach(([k, v]) => container.style.setProperty(k, v));

    // Build DOM: items wrap (pills) first, then the folder, matching the original stack order.
    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'folder-float__items';
    const anchorEl = itemsWrap;
    const pillEls = list.map((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'folder-float__item';
      btn.tabIndex = open ? 0 : -1;
      if (!open) btn.setAttribute('aria-hidden', 'true');
      btn.style.setProperty('--i', i);
      const drift = document.createElement('span');
      drift.className = 'folder-float__drift';
      if (item.icon) {
        const img = document.createElement('img');
        img.className = 'folder-float__logo';
        img.src = item.icon;
        img.alt = '';
        img.loading = 'lazy';
        drift.appendChild(img);
      }
      drift.appendChild(document.createTextNode(item.label));
      btn.appendChild(drift);
      btn.addEventListener('pointerdown', e => down(e, i));
      btn.addEventListener('pointermove', e => move(e, i));
      btn.addEventListener('pointerup', e => up(e, i, item));
      btn.addEventListener('pointercancel', e => up(e, i, item));
      btn.addEventListener('click', e => {
        if (!live || e.detail === 0) pick(item, i);
      });
      itemsWrap.appendChild(btn);
      return btn;
    });

    const folder = document.createElement('div');
    folder.className = 'folder-float__folder';
    folder.innerHTML =
      '<span class="folder-float__back" aria-hidden="true"></span>' +
      '<span class="folder-float__paper" aria-hidden="true"></span>' +
      '<span class="folder-float__front" aria-hidden="true">' +
      '<span class="folder-float__label"></span>' +
      '<span class="folder-float__sub"></span>' +
      '</span>' +
      '<button type="button" class="folder-float__trigger"></button>';
    folder.querySelector('.folder-float__label').textContent = o.label;
    folder.querySelector('.folder-float__sub').textContent = sub;
    const triggerBtn = folder.querySelector('.folder-float__trigger');
    triggerBtn.setAttribute('aria-expanded', String(open));
    triggerBtn.setAttribute('aria-label', `${o.label}, ${sub}`);
    triggerBtn.addEventListener('click', () => set(!open));

    container.appendChild(itemsWrap);
    container.appendChild(folder);
    if (open) container.setAttribute('data-open', '');

    function applyLayout() {
      const pos = layout(list, o.spread, o.lift, o.tilt, sizes);
      pillEls.forEach((el, i) => {
        const p = pos[i];
        if (!p) return;
        el.style.setProperty('--x', `${p.x.toFixed(1)}px`);
        el.style.setProperty('--y', `${p.y.toFixed(1)}px`);
        el.style.setProperty('--r', `${p.r.toFixed(2)}deg`);
      });
    }

    function measure() {
      const next = pillEls.map(el => ({ w: el.offsetWidth, h: el.offsetHeight }));
      if (next.some(s => !s.w)) return;
      const same = sizes.length === next.length && sizes.every((s, i) => s.w === next[i].w && s.h === next[i].h);
      if (!same) {
        sizes = next;
        applyLayout();
      }
    }

    function stopPhysics() {
      clearTimeout(liveTimer);
      cancelAnimationFrame(world.raf);
      world.raf = 0;
      if (world.engine && MatterLib) {
        const { Composite, Engine } = MatterLib;
        world.bodies.forEach((b, i) => {
          const el = pillEls[i];
          if (!el) return;
          el.style.setProperty('--x', `${b.position.x.toFixed(1)}px`);
          el.style.setProperty('--y', `${(b.position.y - world.sizes[i].h / 2).toFixed(1)}px`);
        });
        Composite.clear(world.engine.world, false, true);
        Engine.clear(world.engine);
        world.engine = null;
      }
      world.bodies = [];
      world.drag = null;
      live = false;
      container.removeAttribute('data-live');
    }

    async function startPhysics() {
      if (world.engine) return;
      const M = await ensureMatter();
      if (!M || !open) return; // import failed, or folder closed while loading
      const { Bodies, Body, Composite, Engine } = M;
      const pos = layout(list, o.spread, o.lift, o.tilt, sizes);
      const engine = Engine.create({ gravity: { x: 0, y: 0 } });
      engine.enableSleeping = false;
      world.engine = engine;
      world.sizes = pillEls.map(el => ({ w: el.offsetWidth, h: el.offsetHeight }));
      const ys = pos.map(p => p.y);
      const zone = {
        left: -o.spread - ZONE_PAD,
        right: o.spread + ZONE_PAD,
        top: Math.min(...ys) - ZONE_PAD,
        bottom: -o.lift + Math.max(...world.sizes.map(s => s.h))
      };
      world.zone = zone;
      world.bodies = pillEls.map((el, i) => {
        const { w: bw, h: bh } = world.sizes[i];
        const b = Bodies.rectangle(pos[i].x, pos[i].y + bh / 2, bw, bh, {
          chamfer: { radius: Math.min(bh / 2 - 1, 16) },
          restitution: 0.55,
          friction: 0,
          frictionAir: 0.08,
          inertia: Infinity
        });
        b.plugin = { phase: jitter(i) * Math.PI * 2 };
        return b;
      });
      const T = 80;
      const cx = (zone.left + zone.right) / 2;
      const cy = (zone.top + zone.bottom) / 2;
      const walls = [
        Bodies.rectangle(cx, zone.top - T / 2, zone.right - zone.left + 2 * T, T, { isStatic: true }),
        Bodies.rectangle(cx, zone.bottom + T / 2, zone.right - zone.left + 2 * T, T, { isStatic: true }),
        Bodies.rectangle(zone.left - T / 2, cy, T, zone.bottom - zone.top + 2 * T, { isStatic: true }),
        Bodies.rectangle(zone.right + T / 2, cy, T, zone.bottom - zone.top + 2 * T, { isStatic: true })
      ];
      Composite.add(engine.world, [...world.bodies, ...walls]);
      live = true;
      world.last = 0;
      world.t0 = performance.now();
      container.setAttribute('data-live', '');
      const tick = now => {
        if (!world.engine) return;
        const dt = world.last ? Math.min(32, now - world.last) : 16;
        world.last = now;
        const t = (now - world.t0) / 1000;
        const k = o.drift * 0.00005 * Math.min(1, t / 2);
        world.bodies.forEach((b, i) => {
          if (world.drag && world.drag.i === i) return;
          const ph = b.plugin.phase;
          Body.applyForce(b, b.position, {
            x: Math.sin(t * 0.9 + ph) * k * b.mass,
            y: Math.cos(t * 1.3 + ph * 1.7) * k * b.mass
          });
        });
        Engine.update(world.engine, dt);
        world.bodies.forEach((b, i) => {
          const el = pillEls[i];
          if (!el) return;
          el.style.setProperty('--x', `${b.position.x.toFixed(1)}px`);
          el.style.setProperty('--y', `${(b.position.y - world.sizes[i].h / 2).toFixed(1)}px`);
        });
        world.raf = requestAnimationFrame(tick);
      };
      world.raf = requestAnimationFrame(tick);
    }

    function set(next) {
      if (open === next) return;
      if (!next) stopPhysics();
      open = next;
      container.toggleAttribute('data-open', open);
      triggerBtn.setAttribute('aria-expanded', String(open));
      pillEls.forEach(el => {
        el.tabIndex = open ? 0 : -1;
        if (open) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', 'true');
      });
      o.onOpenChange?.(open);
      scheduleLive();
    }

    function scheduleLive() {
      clearTimeout(liveTimer);
      if (!open || !o.physics || reduce) {
        if (!open || !o.physics) stopPhysics();
        return;
      }
      liveTimer = setTimeout(startPhysics, o.openDuration + (n - 1) * o.stagger + 80);
    }

    function pick(item, i) {
      o.onSelect?.(item.value, i);
      clearTimeout(popTimer);
      pillEls[i].setAttribute('data-pop', '');
      popTimer = setTimeout(() => pillEls[i].removeAttribute('data-pop'), 320);
      if (o.closeOnSelect) set(false);
    }

    function pointerAt(e) {
      const r = anchorEl.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function down(e, i) {
      if (!live || e.button !== 0) return;
      const b = world.bodies[i];
      if (!b) return;
      const p = pointerAt(e);
      world.drag = { i, id: e.pointerId, dx: b.position.x - p.x, dy: b.position.y - p.y, sx: e.clientX, sy: e.clientY, moved: false };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
    function move(e, i) {
      const d = world.drag;
      if (!d || d.i !== i || d.id !== e.pointerId) return;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= DRAG_MIN) {
        d.moved = true;
        e.currentTarget.setAttribute('data-drag', '');
      }
      if (!d.moved) return;
      const b = world.bodies[i];
      const { w: bw, h: bh } = world.sizes[i];
      const z = world.zone;
      const { Body } = MatterLib;
      const p = pointerAt(e);
      const x = Math.min(z.right - bw / 2, Math.max(z.left + bw / 2, p.x + d.dx));
      const y = Math.min(z.bottom - bh / 2, Math.max(z.top + bh / 2, p.y + d.dy));
      Body.setVelocity(b, { x: (x - b.position.x) * 0.6, y: (y - b.position.y) * 0.6 });
      Body.setPosition(b, { x, y });
    }
    function up(e, i, item) {
      const d = world.drag;
      if (!d || d.i !== i || d.id !== e.pointerId) return;
      world.drag = null;
      e.currentTarget.removeAttribute('data-drag');
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      if (!d.moved && e.type === 'pointerup') pick(item, i);
    }

    const hover = o.trigger === 'hover';
    if (hover) {
      container.addEventListener('pointerenter', () => set(true));
      container.addEventListener('pointerleave', () => {
        if (!world.drag) set(false);
      });
    }
    container.addEventListener('keydown', e => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        set(false);
      }
    });
    reduceMq.addEventListener('change', () => {
      reduce = reduceMq.matches;
    });

    // Initial measure (and again once webfonts settle, which can change pill widths).
    requestAnimationFrame(measure);
    document.fonts?.ready.then(measure);
    if (open) scheduleLive();
  }

  window.initFolderFloat = initFolderFloat;
})();
