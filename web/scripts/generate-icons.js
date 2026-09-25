#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, '..', 'public', 'icons');

const sizes = [48, 72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  // Use the square brand mark for browser/PWA icons. The horizontal
  // logo-text.svg contains the wordmark too, so it is not suitable here.
  const workspaceMarkPath = join(publicDir, 'workspace-mark.svg');
  const logo1024Path = join(publicDir, 'logo-1024.png');
  const faviconPath = join(__dirname, '..', 'public', 'favicon.svg');
  const sourcePath = existsSync(workspaceMarkPath)
    ? workspaceMarkPath
    : existsSync(logo1024Path)
      ? logo1024Path
      : faviconPath;

  console.log(`Using source: ${sourcePath}`);
  const sourceBuffer = readFileSync(sourcePath);

  // Keep the high-resolution fallback and desktop package icon aligned with
  // the current brand mark, instead of carrying an older raster logo.
  const desktopIconPath = join(__dirname, '..', '..', 'electron', 'assets', 'miniclaw-icon.png');
  await sharp(sourceBuffer).resize(1024, 1024).png().toFile(logo1024Path);
  if (existsSync(join(__dirname, '..', '..', 'electron', 'assets'))) {
    await sharp(sourceBuffer).resize(1024, 1024).png().toFile(desktopIconPath);
  }

  // Generate standard icons
  for (const size of sizes) {
    const pngPath = join(publicDir, `icon-${size}.png`);
    console.log(`Generating ${pngPath}...`);

    await sharp(sourceBuffer)
      .resize(size, size)
      .png()
      .toFile(pngPath);

    console.log(`✓ Generated ${pngPath}`);
  }

  // Generate maskable icon (512x512 with 20% padding)
  const maskablePath = join(publicDir, 'icon-512-maskable.png');
  console.log(`Generating ${maskablePath}...`);

  const innerSize = Math.floor(512 * 0.6); // 60% of 512
  const padding = Math.floor((512 - innerSize) / 2);

  const maskableBuffer = await sharp(sourceBuffer)
    .resize(innerSize, innerSize)
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 25, g: 55, b: 93, alpha: 1 },
    },
  })
    .composite([{ input: maskableBuffer, top: padding, left: padding }])
    .png()
    .toFile(maskablePath);

  console.log(`✓ Generated ${maskablePath}`);

  // Generate Apple Touch Icon (180x180)
  const appleTouchIconPath = join(publicDir, 'apple-touch-icon-180.png');
  console.log(`Generating ${appleTouchIconPath}...`);

  await sharp(sourceBuffer)
    .resize(180, 180)
    .png()
    .toFile(appleTouchIconPath);

  console.log(`✓ Generated ${appleTouchIconPath}`);

  console.log('\n✅ All icons generated successfully!');
}

generateIcons().catch((error) => {
  console.error('❌ Error generating icons:', error);
  process.exit(1);
});
