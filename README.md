# LCA Admin Dashboard

Web admin app for managing the **Archive** Supabase storage bucket: browse folders, upload files/folders with progress, rename, and delete.

## Setup

1. Copy environment file:

```bash
cp .env.example .env
```

2. Point `VITE_API_BASE_URL` at the backend API (local dev or Vercel).

3. On the backend, set `ADMIN_EMAILS` in `.env` to restrict admin access (comma-separated). Leave empty to allow any signed-in user during setup.

4. Install and run:

```bash
npm install
npm run dev
```

Open http://localhost:5174

## Features

- Email/password sign up and sign in (no Google OAuth)
- Browse inner folders under the Archive bucket root
- Upload individual files or entire folders (with per-file progress %)
- Rename files and folders
- Delete files and folders
- Create empty folders

## Production build

```bash
npm run build
npm run preview
```

Deploy the `dist/` folder to any static host (Vercel, Netlify, etc.) and set `VITE_API_BASE_URL` to your production API.
