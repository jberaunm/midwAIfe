# Vercel Deployment Guide - Midwaife Frontend

This guide will walk you through deploying the Midwaife frontend to Vercel.

## Prerequisites

1. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
2. **Backend API** - Your FastAPI backend must be deployed and accessible via HTTPS
3. **Git Repository** - Your code should be pushed to GitHub, GitLab, or Bitbucket

## Pre-Deployment Checklist

### ✅ Completed Preparations

- [x] Removed hardcoded localhost URLs from code
- [x] Removed PostgreSQL dependencies (pg package)
- [x] Created vercel.json configuration
- [x] Environment variables configured to use `process.env.NEXT_PUBLIC_API_URL`

### ⚠️ Required Actions Before Deploying

1. **Deploy your FastAPI backend** to a production server (e.g., Railway, Render, DigitalOcean, AWS)
2. **Get your backend URL** (e.g., `https://your-backend.railway.app`)
3. **Have your Supabase credentials ready** (if using Supabase)

## Step-by-Step Deployment

### 1. Connect Your Repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click "Import Git Repository"
3. Select your repository
4. Vercel will auto-detect Next.js

### 2. Configure Project Settings

**Root Directory:**
```
frontend
```
*Important:* Set this to `frontend` since your Next.js app is in a subdirectory.

**Framework Preset:**
- Vercel should auto-detect Next.js 15
- If not, select "Next.js" manually

**Build Command:**
```bash
npm run build
```

**Output Directory:**
```
.next
```

**Install Command:**
```bash
npm install
```

### 3. Configure Environment Variables

Click "Environment Variables" and add the following:

#### Required Variables

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://your-backend-url.com` | Your FastAPI backend URL (no trailing slash) |

#### Optional Variables (if using Supabase)

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | Your Supabase anon/public key |

**Important Notes:**
- Use `NEXT_PUBLIC_` prefix for variables that need to be accessible in the browser
- Never expose secret API keys with `NEXT_PUBLIC_` prefix
- Copy the `.env.local.example` file for reference on what variables are needed

### 4. Deploy

1. Click "Deploy"
2. Wait for the build to complete (usually 2-5 minutes)
3. Vercel will provide a URL like `https://your-project.vercel.app`

## Post-Deployment

### Verify Your Deployment

1. **Visit your Vercel URL**
2. **Check the console** (F12 → Console tab) for any API connection errors
3. **Test the AI companion** - Make sure it can connect to your backend
4. **Test meal planning features** - Add/remove meals to verify API connectivity

### Common Issues & Solutions

#### Issue: API calls failing with CORS errors

**Solution:** Update your FastAPI backend CORS settings:

```python
# In your app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-project.vercel.app",  # Add your Vercel URL
        "http://localhost:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Issue: Environment variables not loading

**Solution:**
1. Check that variables start with `NEXT_PUBLIC_` for client-side access
2. Redeploy after adding/changing environment variables
3. Clear Vercel cache: Settings → Clear Cache → Redeploy

#### Issue: Build fails with "Module not found"

**Solution:**
1. Run `npm install` locally to update package-lock.json
2. Commit and push the updated package-lock.json
3. Redeploy on Vercel

## Custom Domain (Optional)

### Add Your Own Domain

1. Go to your project → Settings → Domains
2. Add your domain (e.g., `app.yourdomain.com`)
3. Follow Vercel's DNS configuration instructions
4. Update your backend CORS to include your custom domain

## Environment Management

### Development vs Production

Vercel automatically separates environments:

- **Production** - Deploys from your main/master branch
- **Preview** - Deploys from feature branches (for testing)

You can set different environment variables for each:

```
Production:   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
Preview:      NEXT_PUBLIC_API_URL=https://staging-api.yourdomain.com
Development:  Uses your local .env.local file
```

## Monitoring & Analytics

### Built-in Vercel Analytics

1. Go to project → Analytics
2. Enable Vercel Analytics for real-time insights
3. Monitor:
   - Page views
   - Performance metrics
   - Error rates

### View Logs

1. Go to project → Deployments
2. Click on a deployment
3. View → Function Logs (if using API routes)
4. Check for runtime errors

## Updating Your Deployment

### Automatic Deployments

Vercel automatically deploys when you push to your repository:

```bash
git add .
git commit -m "Update feature"
git push origin main
```

Vercel will:
1. Detect the push
2. Build your project
3. Deploy if build succeeds
4. Assign a unique preview URL

### Manual Deployment

From Vercel dashboard:
1. Go to your project
2. Click "Redeploy" on the latest deployment
3. Optionally clear cache before redeploying

## Rollback

If a deployment breaks something:

1. Go to Deployments
2. Find a working deployment
3. Click "Promote to Production"

## Performance Optimization

### Recommended Settings

1. **Enable Edge Functions** (if using API routes)
2. **Enable ISR** (Incremental Static Regeneration) for better performance
3. **Configure caching** for static assets

### Image Optimization

If you add images later, use Next.js `Image` component:

```tsx
import Image from 'next/image';

<Image src="/logo.png" alt="Logo" width={200} height={100} />
```

## Cost

- **Free Tier** includes:
  - 100 GB bandwidth per month
  - Unlimited deployments
  - Automatic HTTPS
  - Preview deployments

- **Pro Tier** ($20/month):
  - More bandwidth
  - Team collaboration
  - Advanced analytics

## Security Best Practices

1. ✅ **Never commit `.env` files** - They're in .gitignore
2. ✅ **Use `NEXT_PUBLIC_` prefix wisely** - Only for non-sensitive data
3. ✅ **Rotate API keys regularly**
4. ✅ **Enable Vercel's security headers** (in vercel.json)
5. ✅ **Use HTTPS only** for backend communication

## Troubleshooting Commands

### Local Testing Before Deployment

```bash
# Build locally to catch errors
cd frontend
npm install
npm run build
npm run start

# Test production build
# Visit http://localhost:3000
```

### Check Environment Variables

```bash
# In your frontend terminal during dev
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL);
```

## Support

- **Vercel Documentation**: https://vercel.com/docs
- **Next.js Documentation**: https://nextjs.org/docs
- **Vercel Community**: https://github.com/vercel/vercel/discussions

## Next Steps After Deployment

1. **Monitor your application** for the first 24 hours
2. **Set up error tracking** (e.g., Sentry)
3. **Configure monitoring alerts** in Vercel
4. **Test all features** in production
5. **Update README** with your production URL

---

## Quick Reference

### Vercel CLI (Optional)

Install Vercel CLI for command-line deployments:

```bash
npm install -g vercel

# Deploy from command line
cd frontend
vercel

# Deploy to production
vercel --prod
```

### Important URLs

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Project Settings**: https://vercel.com/[your-username]/[your-project]/settings
- **Deployment Logs**: https://vercel.com/[your-username]/[your-project]/deployments

---

**Last Updated**: January 2026
**Framework**: Next.js 15.1.0
**Node Version**: 20.x (Vercel default)
