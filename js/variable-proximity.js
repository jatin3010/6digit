// Vanilla port of React Bits <VariableProximity />, applied to every <p> on the page: letters near the
// pointer swell from the paragraph's own weight up to 900 on the site's variable font (Urbanist).
// Classic script, no dependencies; load it after app.js.
//
// Differences from the React original:
// - It splits the paragraph's existing text nodes in place instead of rendering a `label` string, so
//   links, <em>, <strong> and <br> inside paragraphs keep working.
// - One shared pointer listener and animation loop drives every paragraph (not one per instance), and
//   only paragraphs within reach of the pointer measure their letters.
// - Not ported (unused here): exponential/gaussian falloff, colour shift, scale, lift, idle wave.
(function () {
  'use strict';

  const RADIUS = 100;     // px around the pointer that letters react to
  const SMOOTHING = 0.2;  // 0 = instant, 1 = slow trailing wake
  const TO_WEIGHT = 900;  // Urbanist's heaviest weight
  // Component captions that rewrite or animate their own text.
  const SKIP_PARAGRAPHS = '.ag-panel__descr, .infinite-menu__description';
  // Typed.js owns the contents of these.
  const SKIP_TEXT = '#typed, #typed-strings';
  // Screen-reader copy of each text run; user-select:none keeps it out of copy/paste.
  const HIDDEN = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;user-select:none';

  const blocks = [];
  const pointer = { x: 0, y: 0, active: false };
  let raf = 0;
  let last = 0;
  let dirty = false;

  // Replace each text node with [hidden copy][aria-hidden word/letter spans]; inline letter spans
  // keep underlines and colours from the surrounding link or <em>.
  function split(p) {
    const groups = [];
    const letters = [];
    const nodes = [];
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeValue.trim() && !n.parentElement.closest(SKIP_TEXT)) nodes.push(n);
    }
    nodes.forEach(node => {
      const visual = document.createElement('span');
      visual.setAttribute('aria-hidden', 'true');
      const group = { el: visual, from: 400 };
      // ASCII whitespace only, so &nbsp; stays inside its word.
      node.nodeValue.split(/([ \t\n\r\f]+)/).forEach(token => {
        if (!token) return;
        if (/^[ \t\n\r\f]+$/.test(token)) {
          visual.appendChild(document.createTextNode(' '));
          return;
        }
        const word = document.createElement('span');
        word.className = 'vp-word';
        word.style.whiteSpace = 'nowrap';
        Array.from(token).forEach(ch => {
          const el = document.createElement('span');
          el.textContent = ch;
          word.appendChild(el);
          letters.push({ el: el, group: group, level: 0, target: 0, weight: '' });
        });
        visual.appendChild(word);
      });
      const copy = document.createElement('span');
      copy.style.cssText = HIDDEN;
      copy.textContent = node.nodeValue;
      node.replaceWith(copy, visual);
      groups.push(group);
    });
    return { p: p, groups: groups, letters: letters, breaks: [], white: p.style.whiteSpace, near: false, live: false, stale: false };
  }

  // Swelling letters widen their line. Like the original, freeze each line where it breaks at rest
  // (explicit <br>s + nowrap) so the text never reflows while the pointer moves over it.
  // Batched as all writes, then all reads, then all writes: one forced layout for any number of paragraphs.
  function layout(list) {
    list = list.filter(b => b.p.isConnected);
    list.forEach(b => {
      b.breaks.forEach(br => br.remove());
      b.breaks = [];
      b.p.style.whiteSpace = b.white;
    });
    list.forEach(b => {
      b.groups.forEach(g => { g.from = parseFloat(getComputedStyle(g.el).fontWeight) || 400; });
      b.starts = [];
      b.wraps = false;
      if (!b.p.offsetWidth || getComputedStyle(b.p).whiteSpace !== 'normal') return;  // hidden, or not wrapping anyway
      let lastTop = null;
      let forced = false;  // the paragraph's own <br> already starts the next line
      b.p.querySelectorAll('.vp-word, br').forEach(el => {
        if (el.tagName === 'BR') {
          forced = true;
          return;
        }
        const top = el.getBoundingClientRect().top;
        if (lastTop !== null && top > lastTop + 2 && !forced) b.starts.push(el);
        lastTop = top;
        forced = false;
      });
      b.wraps = true;
    });
    list.forEach(b => {
      if (!b.wraps) return;
      b.starts.forEach(word => {
        const br = document.createElement('br');
        word.before(br);
        b.breaks.push(br);
      });
      b.p.style.whiteSpace = 'nowrap';
    });
  }

  // Paragraphs mid-swell are relaid out once they settle, so a resize never re-breaks lines under the pointer.
  const pending = new Set();
  let layoutFrame = 0;
  function requestLayout(list) {
    list.forEach(b => {
      if (b.live) b.stale = true;
      else pending.add(b);
    });
    if (!layoutFrame && pending.size) {
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = 0;
        layout(Array.from(pending));
        pending.clear();
      });
    }
  }

  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(now - last, 64) : 16;
    last = now;
    const ease = 1 - Math.exp(-dt / (SMOOTHING * 400));

    // 1. Reads: only when the pointer moved or the page scrolled.
    if (dirty) {
      dirty = false;
      blocks.forEach(b => {
        b.near = false;
        if (pointer.active && b.p.isConnected) {
          const r = b.p.getBoundingClientRect();
          const dx = Math.max(r.left - pointer.x, 0, pointer.x - r.right);
          const dy = Math.max(r.top - pointer.y, 0, pointer.y - r.bottom);
          b.near = dx * dx + dy * dy < RADIUS * RADIUS;
        }
        if (b.near) {
          b.letters.forEach(l => {
            const r = l.el.getBoundingClientRect();
            const d = Math.hypot(pointer.x - (r.left + r.width / 2), pointer.y - (r.top + r.height / 2));
            l.target = d < RADIUS ? 1 - d / RADIUS : 0;  // linear falloff
          });
        } else if (b.live) {
          b.letters.forEach(l => { l.target = 0; });
        }
      });
    }

    // 2. Writes.
    let busy = false;
    const settled = [];
    blocks.forEach(b => {
      if (!b.near && !b.live) return;
      let live = false;
      b.letters.forEach(l => {
        let next = l.level + (l.target - l.level) * ease;
        if (Math.abs(l.target - next) < 0.002) next = l.target;
        else busy = true;
        if (next > 0) live = true;
        l.level = next;
        const weight = next ? String(Math.round(l.group.from + (TO_WEIGHT - l.group.from) * next)) : '';
        if (weight !== l.weight) {
          l.weight = weight;
          l.el.style.fontWeight = weight;
        }
      });
      b.live = live;
      if (!live && b.stale) {
        b.stale = false;
        settled.push(b);
      }
    });
    if (settled.length) requestLayout(settled);

    if (busy) raf = requestAnimationFrame(tick);
    else last = 0;
  }

  function schedule() {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function move(x, y) {
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
    schedule();
  }
  function leave() {
    pointer.active = false;
    schedule();
  }

  document.querySelectorAll('p').forEach(p => {
    if (p.matches(SKIP_PARAGRAPHS) || p.closest('[data-vp]')) return;
    p.setAttribute('data-vp', '');
    const block = split(p);
    if (block.letters.length) blocks.push(block);
  });
  if (!blocks.length) return;
  layout(blocks);

  // Relayout when a paragraph's column changes width (window resize, a hidden reply message shown).
  const widths = new Map();
  const byParent = new Map();
  blocks.forEach(b => {
    const parent = b.p.parentElement;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(b);
  });
  const observer = new ResizeObserver(entries => {
    entries.forEach(entry => {
      const width = entry.contentRect.width;
      const previous = widths.get(entry.target);
      widths.set(entry.target, width);
      if (previous === undefined || Math.abs(width - previous) < 1) return;  // first report, or no real change
      requestLayout(byParent.get(entry.target) || []);
    });
  });
  byParent.forEach((list, parent) => observer.observe(parent));
  if (document.fonts) document.fonts.ready.then(() => requestLayout(blocks));

  window.addEventListener('mousemove', e => move(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (t) move(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('touchend', leave);
  window.addEventListener('touchcancel', leave);
  window.addEventListener('scroll', () => { if (pointer.active) schedule(); }, { capture: true, passive: true });
  document.documentElement.addEventListener('mouseleave', leave);
})();
