# HushHub Deployment Guide

## Option 1: Railway (Recommended for real-time features)

1. **Setup:**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your HushHub repository

2. **Configuration:**
   - Railway will auto-detect Node.js
   - No additional config needed
   - Your app will be available at: `your-app-name.up.railway.app`

3. **Environment:**
   - PORT is automatically set by Railway
   - Real-time features work perfectly

## Option 2: Render

1. **Setup:**
   - Go to [render.com](https://render.com)
   - Sign up and connect GitHub
   - Click "New" → "Web Service"
   - Connect your HushHub repo

2. **Configuration:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free (512MB RAM)

## Option 3: Vercel (Static + Serverless)

**Note:** Vercel's free tier has limitations for real-time Socket.io apps. The serverless functions have a 10-second timeout, which may cause connection issues.

1. **Setup:**
   - Install Vercel CLI: `npm i -g vercel`
   - Run: `vercel --prod`
   - Follow prompts

## Deployment Steps:

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial HushHub deployment"
   git branch -M main
   git remote add origin https://github.com/yourusername/hushhub.git
   git push -u origin main
   ```

2. **Deploy on Railway/Render:**
   - Connect the GitHub repo
   - Platform will auto-deploy
   - Get your live URL

## Testing Multiple Devices:

Once deployed, you can test on multiple devices by:
1. Opening your live URL on different phones/tablets
2. Ensuring location services are enabled
3. Testing in the same physical location (within 50 meters)

## Important Notes:

- **Location Testing:** Users need to be physically near each other (within 50m)
- **HTTPS Required:** Location services require HTTPS (auto-provided by hosting platforms)
- **Mobile Testing:** Best experience on mobile devices with GPS
- **Browser Support:** Modern browsers with geolocation support

## Debugging Tips:

1. **Check Console:** Open browser dev tools for error messages
2. **Location Permissions:** Ensure location is enabled in browser settings
3. **Network Tab:** Check WebSocket connections in dev tools
4. **Multiple Devices:** Test with friends in same location

## Free Tier Limitations:

- **Railway:** 512MB RAM, sleeps after 30min inactivity
- **Render:** 512MB RAM, spins down after 15min inactivity
- **Vercel:** Serverless functions, 10s timeout limit

For production with many users, consider upgrading to paid tiers.