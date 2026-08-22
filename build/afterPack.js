const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

module.exports = async function afterPack(context) {
  const ext = context.electronPlatformName === 'darwin' ? '.app' : context.electronPlatformName === 'win32' ? '.exe' : '';
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}${ext}`);

  await flipFuses(exePath, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  });
};
