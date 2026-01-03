# Sarah AI Phone Assistant - Railway Deployment

## 🚀 Deploy to Railway

### 1. Create New Project
- Go to [Railway.app](https://railway.app)
- Click "New Project"
- Choose "Deploy from GitHub repo" or "Empty Project"

### 2. Add Environment Variables
In Railway project settings, add these variables:

```
OPENAI_API_KEY=your_openai_api_key_here
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key_here
PORT=8080
```

### 3. Deploy
- Upload these files to your Railway project
- Railway will automatically detect Node.js and run `npm start`
- Wait for deployment to complete

### 4. Get Your URL
- Railway will give you a URL like: `https://your-app.railway.app`
- Copy this URL

### 5. Update Twilio Webhook
- Go to Twilio Console
- Find your phone number
- Set webhook to: `https://your-app.railway.app/incoming-call`
- Save

## ✅ Test
Call your Twilio number - Sarah should answer in English with short responses!

## 📊 Monitor
- Check Railway logs for real-time debugging
- Check Supabase `clients` table for saved call data
