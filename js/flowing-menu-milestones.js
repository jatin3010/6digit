// Config for the Milestones flowing menu on index.html.
// Classic script: relies on window.initFlowingMenu set by flowing-menu.js, loaded before this.
(function () {
  const milestones = [
    { text: '6Digit founded', meta: '[TODO: year]' },
    { text: 'Expanded our services', meta: '2025' },
    { text: 'Growing businesses online', meta: 'Today' }
  ];

  document.querySelectorAll('[data-flowing-menu="milestones"]').forEach(container => {
    if (!window.initFlowingMenu) return;
    window.initFlowingMenu(container, milestones, {
      align: 'left',
      showIndex: true,
      dividers: true,
      intro: true,
      speed: 60,
      stretch: 0.6,
      magnet: 0.25,
      followCursor: 0.4,
      textColor: '#FFF0DC',
      bgColor: '#790B13',
      marqueeBgColor: '#FFF0DC',
      marqueeTextColor: '#790B13',
      borderColor: 'rgba(255, 240, 220, 0.14)'
    });
  });
})();
