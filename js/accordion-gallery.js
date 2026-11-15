// Vanilla port of React Bits <AccordionGallery />. Classic script; uses the global gsap from libs.min.js.
// The panels are written in the HTML (so the content is crawlable); this only adds the behaviour.
// Not ported (unused here): vertical orientation, per-panel links, showLabels/grayscale switches.
(function () {
  'use strict';

  window.initAccordionGallery = function (root, userOptions) {
    const o = Object.assign({
      defaultIndex: 0,
      expandRatio: 0.52,
      gap: 10,
      duration: 0.6,
      ease: 'power3.out',
      parallax: 0.5,
      tilt: 8,
      stagger: 0.06,
      trigger: 'hover'
    }, userOptions);

    const panels = Array.from(root.querySelectorAll('.ag-panel'));
    const count = panels.length;
    if (!count || !window.gsap) return;

    const medias = panels.map(p => p.querySelector('.ag-panel__media'));
    const bars = panels.map(p => p.querySelector('.ag-panel__bar'));
    const texts = panels.map(p => p.querySelector('.ag-panel__text'));
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ratio = Math.min(Math.max(o.expandRatio, 0.2), 0.9);

    let active = Math.min(Math.max(o.defaultIndex, 0), count - 1);
    let mediaSize = 320;
    let tl = null;

    function applyLayout(animate) {
      const grow = count > 1 ? (ratio * (count - 1)) / (1 - ratio) : 1;
      if (tl) tl.kill();
      const dur = animate && !prefersReduced ? o.duration : 0;
      tl = gsap.timeline();

      panels.forEach((panel, i) => {
        const isActive = i === active;
        panel.classList.toggle('ag-panel--active', isActive);
        if (isActive) panel.setAttribute('aria-current', 'true');
        else panel.removeAttribute('aria-current');

        const rot = isActive ? 0 : i < active ? o.tilt : -o.tilt;
        tl.to(panel, { flexGrow: isActive ? grow : 1, rotateY: rot, duration: dur, ease: o.ease }, 0);

        const drift = Math.max(-1.5, Math.min(1.5, active - i));
        tl.to(medias[i], {
          xPercent: -50,
          yPercent: -50,
          x: isActive ? 0 : drift * o.parallax * mediaSize * 0.06,
          '--ag-gray': isActive ? 0 : 1,
          '--ag-dim': isActive ? 0 : 0.35,
          duration: dur,
          ease: o.ease
        }, 0);

        if (isActive) {
          tl.to([bars[i], texts[i]], { opacity: 1, x: 0, duration: dur, ease: o.ease, stagger: prefersReduced ? 0 : o.stagger }, 0);
        } else {
          tl.to([bars[i], texts[i]], { opacity: 0, x: -14, duration: dur * 0.6, ease: o.ease }, 0);
        }
      });
    }

    function setActive(i) {
      if (i === active) return;
      active = i;
      applyLayout(true);
    }

    panels.forEach((panel, i) => {
      panel.addEventListener('mouseenter', () => { if (o.trigger === 'hover') setActive(i); });
      panel.addEventListener('click', () => setActive(i));
      panel.addEventListener('focus', () => setActive(i));
      panel.addEventListener('keydown', e => {
        let next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % count;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + count) % count;
        if (next < 0) return;
        e.preventDefault();
        panels[next].focus();  // focus handler opens it
      });
    });

    let first = true;
    new ResizeObserver(() => {
      const usable = Math.max(root.getBoundingClientRect().width - o.gap * (count - 1), 120);
      mediaSize = Math.max(140, usable * ratio * 1.22);
      root.style.setProperty('--ag-media-size', mediaSize + 'px');
      applyLayout(!first);
      first = false;
    }).observe(root);
  };

  document.querySelectorAll('[data-accordion-gallery]').forEach(el => window.initAccordionGallery(el));
})();
