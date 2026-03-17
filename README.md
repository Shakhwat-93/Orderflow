# Orderflow

Order management dashboard built with React + Vite + Supabase.

## Local development

- Install: `npm install`
- Run dev server: `npm run dev`
- Build: `npm run build`
- Preview production build: `npm run preview`

## Vercel deployment (ready)

This project is configured for Vercel with [`vercel.json`](vercel.json):

- Framework: `vite`
- Build command: `npm run build`
- Output directory: `dist`
- SPA rewrite to [`index.html`](index.html) for React Router paths

### Required environment variables (Vercel Project Settings)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Set both in Vercel → Project → Settings → Environment Variables, then redeploy.

## Notes

- PWA is enabled via [`vite-plugin-pwa`](vite.config.js).
- Supabase client uses Vite env variables in [`src/lib/supabase.js`](src/lib/supabase.js).
