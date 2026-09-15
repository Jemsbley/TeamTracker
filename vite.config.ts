import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The standalone public info pages in `public/`, served at extensionless URLs.
 * Kept in sync with the rewrites in vercel.json.
 */
const PUBLIC_PAGES = ['about', 'privacy', 'terms'];

const rewriteCleanUrl: Connect.NextHandleFunction = (req, _res, next) => {
  const slug = req.url?.split('?')[0].replace(/^\/+|\/+$/g, '');
  if (slug && PUBLIC_PAGES.includes(slug)) {
    req.url = `/${slug}.html`;
  }
  next();
};

/**
 * In production Vercel rewrites `/about` to `/about.html` (see vercel.json).
 * The dev and preview servers don't read vercel.json, so without this the
 * public info pages 404 locally while working once deployed — and the SPA
 * fallback would swallow them before the static file is ever found.
 */
function publicPageCleanUrls(): Plugin {
  return {
    name: 'public-page-clean-urls',
    configureServer(server) {
      server.middlewares.use(rewriteCleanUrl);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewriteCleanUrl);
    },
  };
}

export default defineConfig({
  plugins: [react(), publicPageCleanUrls()],
  server: { port: 5173, open: true },
});
