#!/bin/bash

# Tilly - Create Deployment Zip for AWS Elastic Beanstalk

echo "Creating deployment package for Tilly..."

# Clean up any existing deployment files
rm -f tilly-deployment.zip
rm -rf deployment-temp/

# Create temporary directory for deployment files
mkdir deployment-temp
echo "Created temporary deployment directory"

# Copy essential files
echo "Copying application files..."

# Include built frontend (as backup)
if [ -d "dist" ]; then
    cp -r dist/ deployment-temp/dist/
    echo "Including built frontend (dist/)"
fi

# Core application files
cp package.json deployment-temp/
cp package-lock.json deployment-temp/
cp server.js deployment-temp/
cp supabase.js deployment-temp/

# Frontend source code
cp -r src/ deployment-temp/src/
if [ -d "public" ]; then
    cp -r public/ deployment-temp/public/
fi

# Build configuration
cp vite.config.js deployment-temp/
cp index.html deployment-temp/

# Elastic Beanstalk configuration
cp -r .ebextensions/ deployment-temp/

# Include .platform overrides if present (e.g., nginx conf tweaks)
if [ -d ".platform" ]; then
    cp -r .platform/ deployment-temp/.platform/
    echo "Included .platform configuration"
fi

# Copy .ebignore for reference
if [ -f .ebignore ]; then
    cp .ebignore deployment-temp/
fi

# Skip .env.production - let app use dynamic URL detection
echo "Skipping .env.production - using dynamic URL detection"

echo "Files copied successfully"

# Navigate to deployment directory
cd deployment-temp

# Create the zip file
echo "Creating deployment zip..."
zip -r ../tilly-deployment.zip . -x "*.DS_Store" "*.git*" "node_modules/*"

# Return to original directory
cd ..

# Clean up temporary directory
rm -rf deployment-temp/

echo "Deployment package created: tilly-deployment.zip"
echo "Package size: $(du -h tilly-deployment.zip | cut -f1)"

echo ""
echo "Next steps:"
echo "1. Upload tilly-deployment.zip to AWS Elastic Beanstalk"
echo "2. Set environment variables in EB console"
echo "3. Deploy and test"
echo ""
echo "Remember to set these environment variables in EB:"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_ANON_KEY"
echo "   - SUPABASE_SERVICE_ROLE_KEY"
echo "   - ANTHROPIC_API_KEY"
echo "   - NODE_ENV=production"
echo "   - PORT=8080" 
