#!/usr/bin/env node
/**
 * Script để test Cloudinary configuration
 * Usage: node scripts/test-cloudinary.js
 */

/* eslint-disable no-console */

require("dotenv").config();

async function testCloudinary() {
  console.log("🧪 Testing Cloudinary Configuration...\n");

  // Check environment variables
  const requiredVars = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  ];
  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error("❌ Missing required environment variables:");
    missingVars.forEach((varName) => {
      console.error(`   - ${varName}`);
    });
    console.error("\nPlease add these to your .env file");
    process.exit(1);
  }

  console.log("✅ All required environment variables found");
  console.log(
    `   - CLOUDINARY_CLOUD_NAME: ${process.env.CLOUDINARY_CLOUD_NAME}`
  );
  console.log(`   - CLOUDINARY_API_KEY: ${process.env.CLOUDINARY_API_KEY}`);
  console.log(
    `   - CLOUDINARY_API_SECRET: ${"*".repeat(process.env.CLOUDINARY_API_SECRET.length)}\n`
  );

  try {
    // Import and configure Cloudinary
    const cloudinary = require("cloudinary").v2;

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });

    console.log("🔍 Testing Cloudinary connection...");

    // Test connection by getting account details
    const usage = await cloudinary.api.usage();

    console.log("✅ Successfully connected to Cloudinary!");
    console.log(
      `   - Credits used: ${usage.credits.usage.toLocaleString()} / ${usage.credits.limit.toLocaleString()}`
    );
    console.log(
      `   - Storage used: ${(usage.storage.usage / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(
      `   - Bandwidth used: ${(usage.bandwidth.usage / 1024 / 1024).toFixed(2)} MB this month\n`
    );

    // Test a simple upload
    console.log("📤 Testing file upload...");

    // Create a small test image (1x1 pixel PNG in base64)
    const testImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

    const uploadResult = await cloudinary.uploader.upload(testImage, {
      public_id: "outline-test-" + Date.now(),
      resource_type: "image",
    });

    console.log("✅ Test upload successful!");
    console.log(`   - Public ID: ${uploadResult.public_id}`);
    console.log(`   - URL: ${uploadResult.secure_url}`);
    console.log(`   - Format: ${uploadResult.format}`);
    console.log(`   - Size: ${uploadResult.bytes} bytes\n`);

    // Clean up test file
    console.log("🧹 Cleaning up test file...");
    await cloudinary.uploader.destroy(uploadResult.public_id);
    console.log("✅ Test file deleted");

    console.log("\n🎉 Cloudinary is ready to use!");
    console.log("\nTo enable Cloudinary in Outline, set:");
    console.log("   FILE_STORAGE=cloudinary");
  } catch (error) {
    console.error("❌ Cloudinary test failed:");
    console.error(`   Error: ${error.message}`);

    if (error.http_code === 401) {
      console.error("\n💡 This usually means invalid API credentials.");
      console.error(
        "   Please double-check your CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET"
      );
    } else if (error.http_code === 403) {
      console.error("\n💡 This usually means insufficient permissions.");
      console.error("   Please check your Cloudinary account settings");
    }

    process.exit(1);
  }
}

// Run the test
testCloudinary().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
