const { execFileSync } = require("node:child_process");

// electron-builder afterPack hook to remove extended attributes that break codesign.
module.exports = async function clearXattr(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  try {
    console.log("Clearing xattrs for:", appPath);
    execFileSync("xattr", ["-cr", appPath], { stdio: "inherit" });

    // Some nested helper binaries can retain extended attributes despite a top-level clear.
    // Force-clear attributes file-by-file as a second pass.
    execFileSync(
      "find",
      [appPath, "-exec", "xattr", "-c", "{}", "+"],
      { stdio: "inherit" }
    );

    const helperExecutables = [
      `${appPath}/Contents/MacOS/${appName}`,
      `${appPath}/Contents/Frameworks/${appName} Helper.app/Contents/MacOS/${appName} Helper`,
      `${appPath}/Contents/Frameworks/${appName} Helper (Renderer).app/Contents/MacOS/${appName} Helper (Renderer)`,
      `${appPath}/Contents/Frameworks/${appName} Helper (GPU).app/Contents/MacOS/${appName} Helper (GPU)`,
      `${appPath}/Contents/Frameworks/${appName} Helper (Plugin).app/Contents/MacOS/${appName} Helper (Plugin)`
    ];

    for (const executablePath of helperExecutables) {
      try {
        execFileSync("codesign", ["--remove-signature", executablePath], {
          stdio: "inherit",
        });
      } catch {
      }
    }
  } catch (error) {
    console.warn("xattr cleanup failed:", error.message);
  }
};
