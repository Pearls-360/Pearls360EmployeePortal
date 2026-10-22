import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

export const PAGES = [
  'auth/login',
  'admin',
  'admin/admins',
  'admin/employees',
  'admin/library',
  'admin/resources',
  'admin/invoices',
  'admin/access',
  'admin/activity',
  'admin/deleted',
  'admin/profile',
  'admin/settings',
  'employee',
  'employee/resources',
  'employee/training',
  'employee/invoices',
  'employee/profile',
  'employee/settings',
  'auth/set-password',
  'auth/forgot-password'
];

/** Older public paths kept so existing links still open. */
const PAGE_ALIASES = {
  login: 'auth/login',
  'set-password': 'auth/set-password',
  'forgot-password': 'auth/forgot-password',
  'change-password': 'auth/forgot-password',
  'auth/change-password': 'auth/forgot-password'
};

/**
 * Serves the same API router used by the Vercel Function, plus clean page URLs,
 * so `npm run dev` / `npm run preview` behave like production.
 * @returns {import('vite').Plugin}
 */
function portalServer() {
  /** @param {import('vite').Connect.Server} middlewares @param {() => Promise<any>} loadRouter */
  function mount(middlewares, loadRouter) {
    middlewares.use(async (req, res, next) => {
      const url = req.url || '/';
      const pathname = url.split('?')[0];
      if (pathname === '/' || pathname === '/api' || pathname.startsWith('/api/')) {
        if (pathname === '/') req.url = '/api/entry';
        const { handleApi } = await loadRouter();
        await handleApi(req, res);
        return;
      }
      const page = pathname.replace(/^\/|\/$/g, '');
      const file = PAGES.includes(page) ? page : PAGE_ALIASES[page];
      if (file) req.url = `/${file}/index.html`;
      next();
    });
  }

  return {
    name: 'pearls360-portal-server',
    config(_, { mode }) {
      // Server-side secrets (DATABASE_URL etc.) for local runs only; never exposed via import.meta.env.
      const env = loadEnv(mode, root, '');
      for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith('VITE_') && process.env[key] === undefined) process.env[key] = value;
      }
    },
    configureServer(server) {
      mount(server.middlewares, () => server.ssrLoadModule('/server/router.js'));
    },
    configurePreviewServer(server) {
      mount(server.middlewares, () => import('./server/router.js'));
    }
  };
}

export default defineConfig({
  plugins: [portalServer()],
  build: {
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((page) => [page, resolve(root, `${page}/index.html`)]))
    }
  }
});
