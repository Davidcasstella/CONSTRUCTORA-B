#!/usr/bin/env node

/**
 * ===========================================
 * SETUP CLOUDFRONT DISTRIBUTION
 * ===========================================
 * 
 * Creates an AWS CloudFront distribution that:
 * - Points to EC2 instance (54.234.248.234:3001) as origin
 * - Provides HTTPS via CloudFront's default *.cloudfront.net certificate
 * - Supports WebSocket connections (Socket.IO)
 * - Forwards all headers, cookies, and query strings (no caching)
 * 
 * Usage: node setup-cloudfront.js
 * 
 * Prerequisites:
 * - AWS IAM credentials in .env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * - IAM user must have CloudFront permissions
 */

require('dotenv').config();

const {
  CloudFrontClient,
  CreateDistributionCommand,
  ListDistributionsCommand,
} = require('@aws-sdk/client-cloudfront');

// ===========================================
// CONFIGURATION
// ===========================================
// CloudFront requires a domain name, not an IP address
const EC2_DOMAIN = 'ec2-54-234-248-234.compute-1.amazonaws.com';
const BACKEND_PORT = 3001;
const REGION = process.env.AWS_REGION || 'us-east-1';

// Unique caller reference (prevents duplicate distributions)
const CALLER_REF = `constructora-chat-${Date.now()}`;

// ===========================================
// AWS CLIENT
// ===========================================
const cloudfront = new CloudFrontClient({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ===========================================
// CHECK FOR EXISTING DISTRIBUTION
// ===========================================
async function checkExistingDistribution() {
  console.log('🔍 Checking for existing CloudFront distributions...\n');

  try {
    const response = await cloudfront.send(new ListDistributionsCommand({}));
    const distributions = response.DistributionList?.Items || [];

    for (const dist of distributions) {
      const origins = dist.Origins?.Items || [];
      for (const origin of origins) {
        if (origin.DomainName === EC2_DOMAIN) {
          console.log('⚠️  Found existing distribution pointing to this EC2:');
          console.log(`   Distribution ID: ${dist.Id}`);
          console.log(`   Domain: https://${dist.DomainName}`);
          console.log(`   Status: ${dist.Status}`);
          console.log(`   Enabled: ${dist.Enabled}`);
          console.log('');
          return dist;
        }
      }
    }
  } catch (err) {
    if (err.name === 'AccessDenied' || err.name === 'AccessDeniedException') {
      console.error('❌ ACCESS DENIED: Your IAM user does not have CloudFront permissions.');
      console.error('');
      console.error('   Add the following policy to your IAM user in AWS Console:');
      console.error('   - Go to IAM → Users → Your User → Add Permissions');
      console.error('   - Attach policy: CloudFrontFullAccess');
      console.error('');
      process.exit(1);
    }
    throw err;
  }

  return null;
}

// ===========================================
// CREATE CLOUDFRONT DISTRIBUTION
// ===========================================
async function createDistribution() {
  console.log('🚀 Creating CloudFront distribution...\n');
  console.log(`   Origin: http://${EC2_DOMAIN}:${BACKEND_PORT}`);
  console.log(`   Protocol: HTTP Only (EC2 → CloudFront)`);
  console.log(`   Viewer: HTTPS Only (CloudFront → Users)`);
  console.log(`   WebSocket: Enabled`);
  console.log('');

  const originId = 'constructora-backend';

  const params = {
    DistributionConfig: {
      CallerReference: CALLER_REF,
      Comment: 'Constructora Chat - WhatsApp Chatbot Backend + Frontend',
      Enabled: true,

      // ===========================================
      // ORIGIN: EC2 instance with custom port
      // ===========================================
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: originId,
            DomainName: EC2_DOMAIN,
            CustomOriginConfig: {
              HTTPPort: BACKEND_PORT,
              HTTPSPort: 443,
              OriginProtocolPolicy: 'http-only', // EC2 doesn't have SSL
              OriginSslProtocols: {
                Quantity: 1,
                Items: ['TLSv1.2'],
              },
              OriginReadTimeout: 60, // 60s for long-polling/WebSocket handshake
              OriginKeepaliveTimeout: 60,
            },
          },
        ],
      },

      // ===========================================
      // DEFAULT CACHE BEHAVIOR (ALL requests)
      // ===========================================
      DefaultCacheBehavior: {
        TargetOriginId: originId,
        ViewerProtocolPolicy: 'redirect-to-https', // Force HTTPS

        // Allow ALL HTTP methods (needed for API POST/PUT/DELETE)
        AllowedMethods: {
          Quantity: 7,
          Items: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'POST', 'PATCH', 'DELETE'],
          CachedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD'],
          },
        },

        // DISABLE CACHING - Forward everything to origin
        // This is critical for API requests and WebSocket
        CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad', // CachingDisabled managed policy

        // Forward ALL origin request headers (needed for WebSocket upgrade, auth, etc.)
        OriginRequestPolicyId: '216adef6-5c7f-47e4-b989-5492eafa07d3', // AllViewer managed policy

        Compress: true,
      },

      // ===========================================
      // PRICE CLASS (reduce cost - use only NA + EU)
      // ===========================================
      PriceClass: 'PriceClass_100', // North America + Europe only

      // ===========================================
      // DEFAULT ROOT OBJECT
      // ===========================================
      DefaultRootObject: '',

      // ===========================================
      // NO CUSTOM ERROR PAGES
      // ===========================================
      CustomErrorResponses: {
        Quantity: 0,
        Items: [],
      },

      // ===========================================
      // RESTRICTIONS (none)
      // ===========================================
      Restrictions: {
        GeoRestriction: {
          RestrictionType: 'none',
          Quantity: 0,
        },
      },

      // ===========================================
      // VIEWER CERTIFICATE (default CloudFront cert)
      // ===========================================
      ViewerCertificate: {
        CloudFrontDefaultCertificate: true,
        MinimumProtocolVersion: 'TLSv1.2_2021',
      },

      // ===========================================
      // HTTP VERSION
      // ===========================================
      HttpVersion: 'http2and3',

      // ===========================================
      // IPV6
      // ===========================================
      IsIPV6Enabled: true,
    },
  };

  try {
    const response = await cloudfront.send(new CreateDistributionCommand(params));
    const distribution = response.Distribution;

    console.log('✅ CloudFront distribution created successfully!\n');
    console.log('===========================================');
    console.log('   DISTRIBUTION DETAILS');
    console.log('===========================================');
    console.log(`   Distribution ID: ${distribution.Id}`);
    console.log(`   Domain Name:     https://${distribution.DomainName}`);
    console.log(`   Status:          ${distribution.Status}`);
    console.log(`   ARN:             ${distribution.ARN}`);
    console.log('===========================================\n');

    console.log('📋 NEXT STEPS:\n');
    console.log('   1. Wait 5-15 minutes for CloudFront to deploy (Status: Deployed)');
    console.log('');
    console.log('   2. Update your backend .env file on the EC2 server:');
    console.log(`      CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001,https://${distribution.DomainName}`);
    console.log(`      FRONTEND_URL=https://${distribution.DomainName}`);
    console.log('');
    console.log('   3. Restart the backend on EC2:');
    console.log('      pm2 restart whatsapp-chatbot');
    console.log('');
    console.log('   4. Test the HTTPS URL:');
    console.log(`      curl https://${distribution.DomainName}/health`);
    console.log('');
    console.log('   5. Open in browser:');
    console.log(`      https://${distribution.DomainName}`);
    console.log('');

    console.log('⚠️  IMPORTANT: Make sure your EC2 Security Group allows');
    console.log('   inbound traffic on port 3001 from 0.0.0.0/0 (or CloudFront IPs)');
    console.log('');

    return distribution;
  } catch (err) {
    if (err.name === 'AccessDenied' || err.name === 'AccessDeniedException') {
      console.error('❌ ACCESS DENIED: Your IAM user lacks CloudFront:CreateDistribution permission.');
      console.error('');
      console.error('   Fix: In AWS Console → IAM → Users → Your User');
      console.error('   → Add Permissions → Attach: CloudFrontFullAccess');
      console.error('');
    } else if (err.name === 'CNAMEAlreadyExists') {
      console.error('❌ A distribution with this CNAME already exists.');
    } else {
      console.error('❌ Error creating CloudFront distribution:', err.message);
      console.error('   Code:', err.name);
    }
    process.exit(1);
  }
}

// ===========================================
// MAIN
// ===========================================
async function main() {
  console.log('');
  console.log('===========================================');
  console.log('  AWS CLOUDFRONT SETUP - Constructora Chat');
  console.log('===========================================\n');

  // Validate credentials
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Missing AWS credentials in .env file');
    console.error('   Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  console.log(`   AWS Region: ${REGION}`);
  console.log(`   EC2 Origin: ${EC2_DOMAIN}:${BACKEND_PORT}`);
  console.log('');

  // Check for existing distribution
  const existing = await checkExistingDistribution();
  if (existing) {
    console.log('ℹ️  A distribution already exists for this origin.');
    console.log(`   Use: https://${existing.DomainName}`);
    console.log('');
    console.log('   If you want to create a new one, delete the existing first');
    console.log(`   in AWS Console → CloudFront → ${existing.Id} → Delete`);
    return;
  }

  // Create new distribution
  console.log('📦 No existing distribution found. Creating new one...\n');
  await createDistribution();
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
