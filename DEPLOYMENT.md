# GenFrenzy — Deployment Guide

This guide deploys:
- **Frontend** → Vercel (free)
- **Backend** → Render (free tier)
- **Redis** → Upstash (free tier)
- **Custom domain** → connect to Vercel

---

## Step 1 — Set up Upstash Redis (free, no credit card)

1. Go to https://upstash.com → **Sign up free**
2. Click **Create Database**
3. Name: `genfrenzy-redis` · Region: pick closest to you · Type: **Regional**
4. After creation, scroll to **REST API** section and copy the **Redis URL**  
   It looks like: `rediss://default:AXxx...@xxx-xxx.upstash.io:6379`
5. Save this — you'll need it in Step 2

---

## Step 2 — Deploy Backend to Render (free)

### 2a. Push your code to GitHub first

```bash
# From inside the genfrenzy2/ folder
git init
git add .
git commit -m "GenFrenzy v2"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/genfrenzy.git
git push -u origin main
```

### 2b. Deploy on Render

1. Go to https://render.com → **Sign up free** (use GitHub login)
2. Click **New → Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Name:** `genfrenzy-backend`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/index.js`
5. Click **Advanced → Add Environment Variables:**

   | Key | Value |
   |---|---|
   | `PORT` | `4000` |
   | `REDIS_URL` | *(your Upstash Redis URL from Step 1)* |
   | `ADMIN_PASSWORD` | *(choose a strong password)* |
   | `FRONTEND_URL` | *(leave blank for now — fill after Step 3)* |

6. Click **Create Web Service**
7. Wait ~3 mins for first deploy. Copy your backend URL:  
   `https://genfrenzy-backend.onrender.com`

> **Note:** Render free tier spins down after 15 min of inactivity and takes ~30s to wake.  
> For production use, upgrade to Render Starter ($7/mo) to keep it always-on.

---

## Step 3 — Deploy Frontend to Vercel (free)

1. Go to https://vercel.com → **Sign up free** (use GitHub login)
2. Click **Add New → Project**
3. Import your GitHub repo
4. Configure:
   - **Framework Preset:** Next.js *(auto-detected)*
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build` *(auto)*
   - **Output Directory:** `.next` *(auto)*
5. **Environment Variables** → Add:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_BACKEND_URL` | `https://genfrenzy-backend.onrender.com` |

6. Click **Deploy**
7. After deploy, copy your Vercel URL:  
   `https://genfrenzy-abc123.vercel.app`

### 3b. Update backend FRONTEND_URL

Go back to Render → your backend service → **Environment** → update:
```
FRONTEND_URL = https://genfrenzy-abc123.vercel.app
```
Click **Save** → Render auto-redeploys.

---

## Step 4 — Connect a Custom Domain

### On Vercel (frontend domain)

1. In your Vercel project → **Settings → Domains**
2. Click **Add Domain** → type your domain e.g. `genfrenzy.xyz`
3. Vercel shows you DNS records to add. Go to your domain registrar (Namecheap, GoDaddy, etc.)
4. Add these records in your DNS settings:

   | Type | Name | Value |
   |---|---|---|
   | `A` | `@` | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |

5. Wait 5–30 min for DNS to propagate
6. Vercel auto-provisions SSL (HTTPS) — no config needed

### On Render (optional backend subdomain)

1. In Render → your service → **Settings → Custom Domain**
2. Add e.g. `api.genfrenzy.xyz`
3. Add a `CNAME` record at your registrar:

   | Type | Name | Value |
   |---|---|---|
   | `CNAME` | `api` | `genfrenzy-backend.onrender.com` |

4. Update `NEXT_PUBLIC_BACKEND_URL` in Vercel to `https://api.genfrenzy.xyz`

---

## Step 5 — Test Everything

1. Open your domain → Join with a quiz code
2. Open `/admin` → create a quiz → start it
3. Open in 2 browser tabs as players → answer questions
4. After quiz ends → click **Download XLSX**

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Connection refused" on join | Backend not running — check Render logs |
| "Quiz not found" | Redis URL wrong — check Upstash URL in Render env vars |
| Players can't connect | `FRONTEND_URL` on backend doesn't match your Vercel URL |
| XLSX download does nothing | Check browser console — usually a CORS issue on export endpoint |
| Backend sleeps (Render free) | Upgrade to Render Starter, or use Railway.app (free $5 credit) |
| Images not loading | Make sure images are under 5MB; Vercel has a 4.5MB body limit — keep images small |

---

## Alternative Free Backend Hosts

If Render doesn't work for you:

| Platform | Notes |
|---|---|
| **Railway** | $5 free credit/mo, always-on, easy deploy |
| **Fly.io** | Free tier, good for WebSocket apps |
| **Cyclic.sh** | Fully free, Node.js focused |
| **Koyeb** | Free tier with no sleep |

All work the same way — push code, set env vars, deploy.

---

## Cost Summary

| Service | Free tier limits | Cost to upgrade |
|---|---|---|
| Vercel (frontend) | Unlimited hobby projects | $20/mo Pro |
| Render (backend) | Sleeps after 15min inactivity | $7/mo Starter |
| Upstash (Redis) | 10K commands/day, 256MB | $0.2/100K commands |
| Domain (.xyz) | — | ~$1–3/year |

**Total for production always-on:** ~$8–10/month + domain
