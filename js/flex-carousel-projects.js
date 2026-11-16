// Shared config for the portfolio glass-bend carousel, used by both index.html and projects.html.
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
    onSelect: (index, item) => {
      if (item.href) window.location.href = item.href;
    }
  });
}
})();
