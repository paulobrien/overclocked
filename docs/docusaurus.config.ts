import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// OVERCLOCKED developer documentation site.
// Build with:  npx docusaurus build --config docs/docusaurus.config.ts  (or see docs/README)
// The docs live under docs/docs and are written for developers extending the app.

const config: Config = {
  title: 'OVERCLOCKED',
  tagline: 'Developer documentation — how the sortation arena works',
  favicon: 'img/favicon.ico',

  url: 'https://overclocked.app',
  baseUrl: '/docs/',

  onBrokenLinks: 'throw',

  // The docs site is a separate Docusaurus app rooted in /docs. It documents
  // the source in /src + /worker, so we point i18n + presets at the docs tree.
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          // Serve markdown from docs/docs, with this sidebar.
          path: 'docs',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: undefined,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.ThemeOptions,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'OVERCLOCKED',
      logo: {
        alt: 'OVERCLOCKED',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Built for the Cerebras × Google DeepMind Gemma 4 hackathon.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript', 'jsx', 'tsx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
