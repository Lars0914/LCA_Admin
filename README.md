# LCA Admin Dashboard

Web admin app for managing the **Archive** Supabase storage bucket: browse folders, upload files/folders with progress, rename, and delete.

## Local development

1. Copy environment file:

```bash
cp .env.example .env
```

2. Point `VITE_API_BASE_URL` at the backend API (default: `http://localhost:3001`).

3. On the backend, set `ADMIN_EMAILS` in `.env` to restrict admin access (comma-separated). Leave empty to allow any signed-in user during setup.

4. Install and run:

```bash
npm install
npm run dev
```

Open http://localhost:5174

## Deploy to Vercel

This project is ready for Vercel as a static Vite app. The `Admin` folder is the project root (it has its own git repo).

### Option A — Vercel Dashboard

1. Go to [vercel.com/new](https://vercel.com/new) and import the **Admin** repository.
2. Confirm build settings (auto-detected from `vercel.json`):
   - **Framework:** Vite
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
3. Add an environment variable:
   - **Name:** `VITE_API_BASE_URL`
   - **Value:** `https://ticker-backend-six.vercel.app` (or your backend URL)
   - Apply to **Production**, **Preview**, and **Development**
4. Deploy.

### Option B — Vercel CLI

From the `Admin` folder:

```bash
npm install -g vercel
vercel
```

Set `VITE_API_BASE_URL` when prompted, or add it in the Vercel dashboard after the first deploy:

```bash
vercel env add VITE_API_BASE_URL
```

Production deploy:

```bash
vercel --prod
```

### After deploy

1. Deploy the **backend** admin API routes first (if not already live).
2. Set `ADMIN_EMAILS` on the backend Vercel project to restrict who can sign in.
3. Open your Admin URL and sign up / sign in.

## Features

- Email/password sign up and sign in (no Google OAuth)
- Browse inner folders under the Archive bucket root
- Upload individual files or entire folders (with per-file progress %)
- Rename files and folders
- Delete files and folders
- Create empty folders

## Production build (local)

```bash
npm run build
npm run preview
```
