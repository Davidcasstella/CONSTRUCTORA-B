/**
 * ===========================================
 * SCRIPT TO CREATE S3 BUCKET
 * ===========================================
 *
 * Creates the S3 bucket for media storage.
 * Bucket name is read from AWS_S3_BUCKET env var.
 *
 * Run: node create-s3-bucket.js
 */

require('dotenv').config();

const { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION;

if (!BUCKET) {
  console.error('❌ AWS_S3_BUCKET not set in .env');
  process.exit(1);
}

const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function main() {
  console.log(`🪣 Creating S3 bucket: ${BUCKET} in ${REGION}...`);

  // Check if bucket already exists
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`✅ Bucket ${BUCKET} already exists!`);
    return;
  } catch (error) {
    if (error.name !== 'NotFound' && error.$metadata?.httpStatusCode !== 404 && error.$metadata?.httpStatusCode !== 403) {
      // Some other error
      console.error(`❌ Error checking bucket: ${error.message}`);
    }
    // Bucket doesn't exist, create it
  }

  try {
    const createParams = {
      Bucket: BUCKET,
    };

    // Only add LocationConstraint for non us-east-1 regions
    if (REGION && REGION !== 'us-east-1') {
      createParams.CreateBucketConfiguration = {
        LocationConstraint: REGION
      };
    }

    await s3Client.send(new CreateBucketCommand(createParams));
    console.log(`✅ Bucket ${BUCKET} created successfully!`);

    // Configure CORS for the bucket
    console.log('🔧 Configuring CORS...');
    await s3Client.send(new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'POST'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600
          }
        ]
      }
    }));
    console.log('✅ CORS configured!');

  } catch (error) {
    console.error(`❌ Error creating bucket: ${error.message}`);
    if (error.name === 'BucketAlreadyOwnedByYou') {
      console.log('✅ Bucket already owned by you - OK!');
    } else if (error.name === 'BucketAlreadyExists') {
      console.error('⚠️  This bucket name is taken globally. Choose a different name.');
    } else {
      process.exit(1);
    }
  }
}

main();
