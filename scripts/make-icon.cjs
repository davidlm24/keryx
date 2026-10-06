// One-off: builds build/icon.png (512x512) from the church logo, for the
// installer and the app's window/taskbar icon. Run with Electron because it
// uses nativeImage:  npx electron scripts/make-icon.cjs
const fs = require("node:fs");
const path = require("node:path");
const { app, nativeImage } = require("electron");

app.whenReady().then(() => {
    const root = path.resolve(__dirname, "..");
    const source = nativeImage.createFromPath(path.join(root, "resources", "branding", "church-logo.jpg"));
    if (source.isEmpty()) {
        console.error("church-logo.jpg could not be read");
        app.exit(1);
        return;
    }
    const png = source.resize({ width: 512, height: 512, quality: "best" }).toPNG();
    fs.mkdirSync(path.join(root, "build"), { recursive: true });
    fs.writeFileSync(path.join(root, "build", "icon.png"), png);
    console.log(`build/icon.png written (${png.length} bytes)`);
    app.exit(0);
});
