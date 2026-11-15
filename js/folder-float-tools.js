// Config for the "Tools & platforms we use" folder on index.html / about.html.
// Classic script: relies on window.initFolderFloat set by folder-float.js, loaded before this.
(function () {
  const tools = [
    { label: 'Google Ads', value: 'google-ads', icon: 'img/icons/google_ads-official.svg' },
    { label: 'Meta Ads Manager', value: 'meta-ads', icon: 'img/icons/meta-ads-manager-icon.svg' },
    { label: 'Google Analytics', value: 'google-analytics', icon: 'img/icons/google_analytics-official.svg' },
    { label: 'Search Console', value: 'search-console', icon: 'img/icons/google-search-console-icon.svg' },
    { label: 'SEMrush', value: 'semrush', icon: 'img/icons/semrush-icon.svg' },
    { label: 'WordPress', value: 'wordpress', icon: 'img/icons/wordpress-icon.svg' },
    { label: 'Mailchimp', value: 'mailchimp', icon: 'img/icons/mailchimp-icon.svg' },
    { label: 'Canva', value: 'canva', icon: 'img/icons/canva-icon.svg' }
  ];

  // Wider on desktop (fewer, shorter rows), but capped to the viewport so it never
  // forces horizontal scroll on phones.
  const spread = Math.max(150, Math.min(300, Math.floor((window.innerWidth - 48) / 2)));

  document.querySelectorAll('[data-folder-float="tools"]').forEach(container => {
    if (!window.initFolderFloat) return;
    window.initFolderFloat(container, tools, {
      label: 'Our stack',
      sublabel: `${tools.length} platforms`,
      trigger: 'hover',
      closeOnSelect: false,
      physics: true,
      drift: 0.5,
      width: 220,
      height: 150,
      radius: 16,
      spread: spread,
      lift: 30,
      folderColor: '#F2DDBF',   // back flap: a shade darker so the cream front reads as a separate layer
      frontColor: '#FFF0DC',
      paperColor: '#790B13',    // sheets inside must contrast with the cream folder
      itemColor: '#FFF0DC',
      itemTextColor: '#790B13',
      labelColor: '#790B13'     // label is printed on the cream front
    });
  });
})();
