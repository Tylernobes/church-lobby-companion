const { notarize } = require("@electron/notarize");

/**
 * afterSign hook for electron-builder. Ensures the app is notarized for macOS builds.
 * Fails fast with a clear error if required Apple credentials are missing so we
 * don't accidentally ship an un-notarized DMG that macOS will block.
 */
exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID || "7T6ZP3UT35";

  if (!appleId || !appleIdPassword) {
    throw new Error(
      "Missing APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD in environment. Set these to enable notarization."
    );
  }

  await notarize({
    appBundleId: "com.churchlobby.companion",
    appPath: `${appOutDir}/${appName}.app`,
    appleId,
    appleIdPassword,
    teamId,
    staple: true,
  });
};
