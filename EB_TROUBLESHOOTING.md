# Elastic Beanstalk Troubleshooting Guide

## Common 502 Bad Gateway Issues & Solutions

### 1. Missing Environment Variables
**Issue**: App fails to start due to missing API keys
**Solution**: Set these environment variables in EB Console:
```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_claude_api_key
NODE_ENV=production
PORT=8080
```

### 2. Build Failures
**Issue**: Frontend not building during deployment
**Check**: Look for build errors in EB logs
**Solution**: Our config now runs `npm run build` during deployment

### 3. Port Configuration
**Issue**: App not listening on correct port
**Solution**: App now binds to `0.0.0.0:8080` as required by EB

### 4. Static File Serving
**Issue**: Frontend not loading (404s for JS/CSS)
**Solution**: App serves from `dist/` directory in production

## Checking Deployment Status

### 1. View EB Logs
1. Go to EB Console → Your Environment
2. Click "Logs" → "Request Logs" → "Last 100 Lines"
3. Look for startup messages and errors

### 2. Health Check
Once deployed, test: `https://your-eb-url.amazonaws.com/health`
Should return: `{"status":"OK","message":"Proxy server is running"}`

### 3. Environment Variables Check
In logs, look for warnings like:
- `Missing environment variables: SUPABASE_URL`
- `Missing ANTHROPIC_API_KEY - AI features will not work`

## Expected Startup Messages
```
Tilly Calendar server running on port 8080
Environment: production
API endpoint: http://localhost:8080/api/claude
Events API: http://localhost:8080/api/events
Health check: http://localhost:8080/health
Serving static files from dist/
```

## Quick Fixes

### Re-deploy with Environment Variables
1. Upload new `tilly-deployment.zip`
2. Go to Configuration → Software
3. Add all required environment variables
4. Click "Apply"

### Force Rebuild
If deployment succeeds but still getting 502:
1. Configuration → Software → Edit
2. Add a dummy environment variable (like `REBUILD=1`)
3. Apply changes to force redeploy

### Check Instance Health
1. Go to EB Console → Health
2. If "Degraded", click "Causes" for details
3. Look for specific error messages

## Still Having Issues?

1. **Check EB Instance Logs**: Look for Node.js errors
2. **Test Locally**: Run `NODE_ENV=production npm start` locally
3. **Verify Build**: Ensure `dist/` directory exists after `npm run build`
4. **Check Network**: Ensure your EB environment has internet access for API calls 
