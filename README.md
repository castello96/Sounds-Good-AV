# 🎵 Sounds Good AV - Professional Audio/Visual Services

A modern, responsive website for Sounds Good AV with contact form and email notifications.

## 🚀 Deploy to Render (Free)

### Quick Deploy Steps:

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Deploy on Render:**
   - Go to [render.com](https://render.com)
   - Click "New Web Service"
   - Connect your GitHub repository
   - Render auto-detects settings from `render.yaml`

3. **Set Environment Variables:**
   ```
   RESEND_API_KEY=your_resend_api_key_here
   FROM_EMAIL=noreply@yourdomain.com  
   TO_EMAIL=your@email.com
   ```

4. **Deploy!** ✅

### 📧 Email Setup (Resend):

1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month)
2. Get your API key from the dashboard
3. Add the API key to Render environment variables
4. For production: verify your domain with Resend

### 🛠 Local Development:

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Test production build
npm start
```

### 📂 Project Structure:

```
├── client/          # React frontend
├── server/          # Express backend
├── shared/          # Shared schemas/types
├── render.yaml      # Render deployment config
└── package.json     # Dependencies & scripts
```

### ✨ Features:

- ✅ Modern React frontend with Tailwind CSS
- ✅ Express backend with TypeScript
- ✅ Contact form with email notifications
- ✅ Environment-based configuration
- ✅ Production-ready build process
- ✅ Health monitoring endpoint

### 💰 Hosting Cost: **FREE**

- **Render**: Free tier (sleeps after 15 min)
- **Resend**: Free tier (3,000 emails/month)
- **Custom Domain**: Optional ($10/year)

---

**Website:** [Your Deployed URL]  
**Contact:** your@email.com
