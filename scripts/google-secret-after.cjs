// electron-builder's afterPack: the Google client secret's file goes once it is packed (google-secret.cjs).
const { removeSecret } = require("./google-secret.cjs");

module.exports = async () => {
    removeSecret();
};
