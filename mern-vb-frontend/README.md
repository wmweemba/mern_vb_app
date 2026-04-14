# Chama360 — Frontend

React + Vite PWA frontend for the Chama360 village banking app.

**Live:** https://chama360.nxhub.online

See the [root README](../README.md) for full project documentation.

## Development

```bash
pnpm dev       # start Vite dev server (http://localhost:5173)
pnpm build     # production build → dist/
pnpm test      # run Jest + Testing Library tests
```

## Environment Variables

Create `mern-vb-frontend/.env`:
```
VITE_API_URL=http://localhost:5000/api
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

> These are baked into the bundle at build time. Set them as build-time env vars in Coolify for production.
