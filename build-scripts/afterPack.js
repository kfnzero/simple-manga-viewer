const path = require('path');
const rcedit = require('rcedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );

  console.log(`  • rcedit: updating exe metadata → ${exePath}`);

  await rcedit(exePath, {
    'product-version': context.packager.appInfo.version,
    'file-version': context.packager.appInfo.version,
    'version-string': {
      ProductName: 'Simple Manga Viewer',
      FileDescription: 'Simple Manga Viewer',
      CompanyName: 'kfnzero',
      OriginalFilename: 'Simple Manga Viewer.exe',
    },
  });

  console.log('  • rcedit: done');
};
