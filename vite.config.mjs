import { resolve } from 'node:path';

// GitHub Pages project site lives under /recipes/ (repo name).
// Change BASE_PATH to '/' when the static site later moves to Cloudflare.
const base = process.env.BASE_PATH || '/recipes/';

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
