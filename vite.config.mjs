import { resolve } from 'node:path';

// Cloudflare Pages site served at the root path.
// Set BASE_PATH='/recipes/' when running as a GitHub Pages project site.
const base = process.env.BASE_PATH || '/';

const pages = [
  'index.html',
  'menus.html',
  'guides.html',
  '404.html',
  'menu-stanz.html',
  'menu-sourduck.html',
  'menu-luccas.html',
  'menu-beach-break.html',
  'menu-weeknight-gotos.html',
  'menu-sunday-dinner.html',
];

export default {
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map((p) => [p.replace(/\.html$/, ''), resolve(p)])),
    },
  },
};
