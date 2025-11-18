const { notarize } = require("@electron/notarize");

/**
 * afterSign hook for electron-builder. Ensures the app is notarized for macOS builds.
 * Uses App Store Connect API key for authentication.
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  // API Key method (recommended)
  const appleApiKey = process.env.APPLE_API_KEY || "/Users/tyler/Documents/App Build/AuthKey_TGZQHAB68V.p8";
  const appleApiKeyId = process.env.APPLE_API_KEY_ID || "TGZQHAB68V";
  const appleApiIssuer = process.env.APPLE_API_ISSUER_ID || "dfca6c2d-1c83-4780-b61b-f528cecd2605";
  const teamId = process.env.APPLE_TEAM_ID || "7T6ZP3UT35";

  console.log("Notarization credentials:");
  console.log("API Key:", appleApiKey);
  console.log("API Key ID:", appleApiKeyId);
  console.log("API Issuer:", appleApiIssuer);
  console.log("Team ID:", teamId);

  await notarize({
    appBundleId: "com.churchlobby.companion",
    appPath: `${appOutDir}/${appName}.app`,
    appleApiKey: appleApiKey,
    appleApiKeyId: appleApiKeyId,
    appleApiIssuer: appleApiIssuer,
  });
};
