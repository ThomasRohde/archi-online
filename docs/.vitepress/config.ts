import { defineConfig } from 'vitepress';
import { wikiLinksPlugin } from './wikiLinks';

const base = '/archi-online/';

// The docs live in docs/wiki/*.md (also published to the GitHub Wiki). This
// VitePress site reuses that content: wikiLinksPlugin rewrites [[links]], the
// wiki-only pages are excluded, and index.md is the hero landing page.
export default defineConfig({
  base,
  lang: 'en',
  title: 'Archi Online',
  description:
    'A web-based ArchiMate 3.2 modeler — a browser clone of Archi, scriptable with a jArchi-compatible JavaScript API.',
  cleanUrls: true,
  lastUpdated: true,
  // The live app is injected into /app/ at deploy time; it is not a VitePress page.
  ignoreDeadLinks: [/^\/app\/?/],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}icons/icon.svg` }],
    ['meta', { name: 'theme-color', content: '#fafafa' }],
  ],
  srcExclude: [
    'wiki/_Sidebar.md',
    'wiki/_Footer.md',
    'wiki/Home.md',
    'brainstorms/**',
    'superpowers/**',
    'github-publication.md',
    'wiki-publishing.md',
    'pages-publishing.md',
  ],
  markdown: {
    config: (md) => md.use(wikiLinksPlugin),
  },
  themeConfig: {
    logo: '/icons/icon.svg',
    siteTitle: 'Archi Online',
    nav: [
      { text: 'Guide', link: '/wiki/Getting-Started', activeMatch: '/wiki/' },
      { text: 'Scripting', link: '/wiki/Scripting-API' },
      { text: 'Open the app ↗', link: 'https://bitter-mill-c9qn.here.now/' },
    ],
    sidebar: [
      {
        text: 'Using Archi Online',
        items: [
          { text: 'Getting Started', link: '/wiki/Getting-Started' },
          { text: 'User Guide', link: '/wiki/User-Guide' },
          { text: 'C4 Modeling', link: '/wiki/C4-Modeling' },
          { text: 'Import & Export', link: '/wiki/Import-and-Export' },
          { text: 'Archi Compatibility', link: '/wiki/Archi-Compatibility' },
        ],
      },
      {
        text: 'Automation',
        items: [
          { text: 'Scripting API', link: '/wiki/Scripting-API' },
          { text: 'Extension API', link: '/wiki/Extension-API' },
          { text: 'Extension Packages', link: '/wiki/Extension-Packages' },
        ],
      },
      {
        text: 'Project',
        items: [{ text: 'Development', link: '/wiki/Development' }],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/ThomasRohde/archi-online' }],
    search: { provider: 'local' },
    editLink: {
      pattern: 'https://github.com/ThomasRohde/archi-online/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    outline: 'deep',
    footer: {
      message:
        'Released under the MIT License. ArchiMate® is a registered trademark of The Open Group.',
      copyright: '© 2026 Thomas Klok Rohde',
    },
  },
});
