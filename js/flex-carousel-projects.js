// Config for the homepage portfolio glass-bend carousel (index.html).
// Classic script: relies on window.initFlexCarousel set by flex-carousel.js, loaded before this.
(function () {
const items = [
  {
    src: 'img/placeholders/photo-placeholder.svg',
    alt: '6Digit Media SEO growth campaign placeholder — replace with a real project image',
    title: 'SEO Growth Campaign',
    href: 'project-seo-growth.html'
  },
  {
    src: 'img/placeholders/photo-placeholder.svg',
    alt: '6Digit Media Paid ads campaign placeholder — replace with a real project image',
    title: 'Paid Ads Campaign',
    href: 'project-paid-ads.html'
  },
  {
    src: 'img/placeholders/photo-placeholder.svg',
    alt: '6Digit Media Social media growth placeholder — replace with a real project image',
    title: 'Social Media Growth',
    href: 'project-social-media.html'
  },
  {
    src: 'img/placeholders/photo-placeholder.svg',
    alt: '6Digit Media Website redesign placeholder — replace with a real project image',
    title: 'Website Redesign',
    href: 'project-web-design.html'
  }
];

const container = document.querySelector('[data-flex-carousel="projects"]');
if (container && window.initFlexCarousel) {
  window.initFlexCarousel(container, items, {
    preset: 'liquid',
    intro: 'rise',
    cardHeight: 0.55,
    gap: 16,
    focusOnClick: true,
    captions: true,
    captureWheel: false, // page scroll drives the slides (below), so vertical wheel must reach the page
    onSelect: (index, item) => {
      if (item.href) window.location.href = item.href;
    }
  }).then(carousel => {
    // Pin the section while scrolling walks through every slide once, then release to the next section.
    if (!carousel || !window.ScrollTrigger) return;
    let shown = 0;
    ScrollTrigger.create({
      trigger: container.closest('section'),
      start: 'center center',
      end: `+=${(items.length - 1) * 100}%`,
      pin: true,
      onUpdate: self => {
        const i = Math.round(self.progress * (items.length - 1));
        if (i !== shown) carousel.show((shown = i));
      }
    });
    ScrollTrigger.refresh(); // the pin adds page height after app.js measured its own triggers
  });
}
})();
