// electron-builder's beforePack: what goes into the installer that git does
// not hold. The Google client secret (google-secret.cjs) and the tools of
// "Baixar para a Mídia" (youtube-tools.cjs, packed as resources/youtube).
const { writeSecret } = require("./google-secret.cjs");
const { toolsForInstaller } = require("./youtube-tools.cjs");

module.exports = async () => {
    const inside = writeSecret();
    console.log(inside ? "  • chave do cliente do Google no instalador" : "  • build SEM o Google (KERYX_BUILD_WITHOUT_GOOGLE=1)");
    const tools = await toolsForInstaller();
    console.log(tools ? "  • yt-dlp e ffmpeg no instalador" : "  • build SEM as ferramentas do YouTube (KERYX_BUILD_WITHOUT_YOUTUBE=1)");
};
