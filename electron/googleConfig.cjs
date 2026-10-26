// The KERYX project's OAuth client in Google Cloud (docs/google-drive-setup.md),
// type "App para computador". For a desktop client Google treats the client
// as public: what is here ships inside the installer and is not a secret
// (anyone can read it out of the app). It only names the app to Google; what
// a person may do is still decided by their own sign-in and the scopes.
//
// clientSecret: Google's token endpoint refuses a desktop client's exchange
// without it ("client_secret is missing", checked 26/10 with a fake code).
// It is the value Google shows beside the client ID, never made up, and it
// stays out of git (owner 2026-10-26): the installer's build writes it into
// googleSecret.json beside this file (scripts/google-secret.cjs, gitignored);
// KERYX_GOOGLE_CLIENT_SECRET in the shell gives it to a dev run.

let built = null;
try {
    built = require("./googleSecret.json").clientSecret || null;
} catch { /* not in this build: dev, or a build without Google */ }

module.exports = {
    clientId: "46840435137-8vhb7spsejvt28feoe1q0hvmusuesd8u.apps.googleusercontent.com",
    clientSecret: process.env.KERYX_GOOGLE_CLIENT_SECRET || built,
    // Only the app's hidden folder on the church's Drive, and which account it is.
    scopes: ["https://www.googleapis.com/auth/drive.appdata", "openid", "email"],
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    revokeUrl: "https://oauth2.googleapis.com/revoke",
};
