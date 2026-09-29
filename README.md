# OrderFlow — Enterprise Order Management System

Modern, intelligent, high-performance E-Commerce Order Management Platform built with **Next.js 15 (App Router)** + **Supabase** + **Tailwind CSS**.

---

## 🚀 Next.js Enterprise Hub (`next-app`)

The production-ready Next.js application is located in the [`next-app/`](next-app) directory.

### Quick Start (Local)

```bash
cd next-app
npm install
npm run dev
```

Or from the repository root:
```bash
npm run next:dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Deployment Guide

### Option 1: Deploy to Vercel (Recommended)

1. Import this repository into **Vercel**.
2. In the **Configure Project** screen:
   - **Root Directory**: Click *Edit* and select or type `next-app`.
   - **Framework Preset**: Automatically detected as `Next.js`.
3. Add the following **Environment Variables** in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` (e.g. `https://your-domain.vercel.app`)
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL` (e.g. `openai/gpt-4o-mini`)
   - `STEADFAST_API_KEY`
   - `STEADFAST_SECRET_KEY`
4. Click **Deploy**.

---

### Option 2: Deploy to VPS (Ubuntu / Debian + Node.js + PM2 + Nginx)

1. **Clone repository on VPS:**
   ```bash
   git clone https://github.com/Shakhwat-93/Orderflow.git
   cd Orderflow/next-app
   ```

2. **Configure Environment:**
   Create `.env.local` inside `next-app/`:
   ```bash
   nano .env.local
   ```
   Paste all required environment variables, then save (`Ctrl+O`, `Enter`, `Ctrl+X`).

3. **Install & Build:**
   ```bash
   npm install
   npm run build
   ```

4. **Run with PM2:**
   ```bash
   pm2 start npm --name "orderflow" -- start -- -p 3000
   pm2 save
   pm2 startup
   ```

5. **Nginx Reverse Proxy (Example):**
   ```nginx
   server {
       server_name your-domain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## 📦 Legacy React (Vite) App

The original client-only React Vite application remains in the root directory for backward compatibility:
- Run: `npm run dev`
- Build: `npm run build`

