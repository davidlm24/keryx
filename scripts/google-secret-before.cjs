// electron-builder's beforePack: the Google client secret into the app (google-secret.cjs).
const { writeSecret } = require("./google-secret.cjs");

module.exports = async () => {
    const inside = writeSecret();
    console.log(inside ? "  • chave do cliente do Google no instalador" : "  • build SEM o Google (KERYX_BUILD_WITHOUT_GOOGLE=1)");
};
