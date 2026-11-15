// Config for the project sphere on projects.html.
// Classic script: relies on window.initInfiniteMenu set by infinite-menu.js, loaded before this.
(function () {
  // TODO: swap the placeholder images for real project images, and the descriptions for real results.
  const projects = [
    {
      image: 'img/placeholders/photo-placeholder.svg',
      link: 'project-seo-growth.html',
      title: 'SEO Growth Campaign',
      description: 'Technical SEO, content and links to grow organic traffic.'
    },
    {
      image: 'img/placeholders/photo-placeholder.svg',
      link: 'project-paid-ads.html',
      title: 'Paid Ads Campaign',
      description: 'Google and Meta Ads built and tuned to convert.'
    },
    {
      image: 'img/placeholders/photo-placeholder.svg',
      link: 'project-social-media.html',
      title: 'Social Media Growth',
      description: 'Content and paid social that build an engaged audience.'
    },
    {
      image: 'img/placeholders/photo-placeholder.svg',
      link: 'project-web-design.html',
      title: 'Website Redesign',
      description: 'A fast, responsive site made to turn visitors into customers.'
    }
  ];

  document.querySelectorAll('[data-infinite-menu="projects"]').forEach(root => {
    if (!window.initInfiniteMenu) return;
    window.initInfiniteMenu(root, projects, {
      count: 160,
      tileSize: 0.63,
      roundness: 0.2,
      zoom: 1.65,
      pullBack: 1,
      stretch: 0.6,
      inertia: 0.6,
      autoplay: 3,
      grayscale: true,
      dim: 0.5,
      intro: true,
      showInfo: true,
      textColor: '#FFF0DC',
      accentColor: '#FFF0DC',
      onAccentColor: '#790B13',
      placeholderColor: '#A8545A',
      toneColor: '#790B13'   // page background, so far tiles melt into it
    });
  });
})();
