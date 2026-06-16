import Jimp from 'jimp';
import * as path from 'path';
import * as fs from 'fs';

// Helper to make sure directory exists
function ensureDirectoryExistence(filePath: string) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

// Draw a beautiful purple circle gradient on an image
function drawPurpleCircle(image: Jimp, cx: number, cy: number, radius: number) {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const distSq = x * x + y * y;
      if (distSq <= radius * radius) {
        // Soft gradient from top-left to bottom-right
        const factor = (x + y + radius * 2) / (radius * 4);
        const r = Math.round(124 * (1 - factor) + 76 * factor);
        const g = Math.round(58 * (1 - factor) + 29 * factor);
        const b = Math.round(237 * (1 - factor) + 149 * factor);
        const alpha = 255;
        
        const colorVal = (r << 24) | (g << 16) | (b << 8) | alpha;
        
        // Anti-aliasing
        const distance = Math.sqrt(distSq);
        if (radius - distance < 1.5) {
          const edgeFactor = radius - distance;
          const finalAlpha = Math.round(alpha * (edgeFactor > 0 ? edgeFactor : 0));
          const edgeColor = (r << 24) | (g << 16) | (b << 8) | finalAlpha;
          image.setPixelColor(edgeColor, cx + x, cy + y);
        } else {
          image.setPixelColor(colorVal, cx + x, cy + y);
        }
      }
    }
  }
}

// Generate beautiful Android launcher icon
async function generateIcon(size: number, outputPath: string) {
  // Transparent base
  const image = new Jimp(size, size, 0x00000000);
  
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  const radius = Math.floor(size * 0.44); // 88% width
  
  drawPurpleCircle(image, cx, cy, radius);
  
  // Decide best font
  let font = Jimp.FONT_SANS_16_WHITE;
  if (size >= 144) font = Jimp.FONT_SANS_64_WHITE;
  else if (size >= 72) font = Jimp.FONT_SANS_32_WHITE;
  
  const loadedFont = await Jimp.loadFont(font);
  const text = "a";
  const textWidth = Jimp.measureText(loadedFont, text);
  const textHeight = Jimp.loadFont(font).then(f => 32); // Approximate height indicator
  
  // Center text estimation
  const tx = cx - Math.round(textWidth / 2);
  // Subtract some offset since letters are usually printed from baseline
  const ty = cy - Math.round(size * 0.17); 
  
  image.print(loadedFont, tx, ty, text);
  
  ensureDirectoryExistence(outputPath);
  await image.writeAsync(outputPath);
  console.log(`✓ Icon generated [${size}x${size}]: ${path.relative(process.cwd(), outputPath)}`);
}

// Generate Adaptive Icon Foreground (typically 108dp centered graphics with transparent background)
async function generateAdaptiveForeground(size: number, outputPath: string) {
  const image = new Jimp(size, size, 0x00000000);
  
  const cx = Math.floor(size / 2);
  const cy = Math.floor(size / 2);
  // Adaptive foreground should be smaller to stay inside the safe zone (around 50% size of the canvas)
  const radius = Math.floor(size * 0.25); 
  
  drawPurpleCircle(image, cx, cy, radius);
  
  // Choose Font nicely
  let font = Jimp.FONT_SANS_16_WHITE;
  if (size >= 216) font = Jimp.FONT_SANS_64_WHITE;
  else if (size >= 108) font = Jimp.FONT_SANS_32_WHITE;
  
  const loadedFont = await Jimp.loadFont(font);
  const text = "a";
  const textWidth = Jimp.measureText(loadedFont, text);
  
  const tx = cx - Math.round(textWidth / 2);
  const ty = cy - Math.round(size * 0.10);
  
  image.print(loadedFont, tx, ty, text);
  
  ensureDirectoryExistence(outputPath);
  await image.writeAsync(outputPath);
  console.log(`✓ Adaptive Foreground generated [${size}x${size}]: ${path.relative(process.cwd(), outputPath)}`);
}

// Generate Beautiful Splash Image (Port/Land)
async function generateSplash(width: number, height: number, outputPath: string) {
  // Rich deep dark background matching modern Angochat layout (0x13111AFF)
  const image = new Jimp(width, height, 0x13111AFF);
  
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  
  // Draw premium styled branding
  // Circle in center
  const minDim = Math.min(width, height);
  const radius = Math.floor(minDim * 0.15); // 15% of screen size max
  
  if (radius > 16) {
    drawPurpleCircle(image, cx, cy - Math.floor(radius * 0.3), radius);
    
    // Write styled "a" inside
    let fontSub = Jimp.FONT_SANS_16_WHITE;
    if (radius >= 40) fontSub = Jimp.FONT_SANS_32_WHITE;
    if (radius >= 80) fontSub = Jimp.FONT_SANS_64_WHITE;
    
    const loadedFontSub = await Jimp.loadFont(fontSub);
    const textLetter = "a";
    const wLetter = Jimp.measureText(loadedFontSub, textLetter);
    image.print(
      loadedFontSub, 
      cx - Math.round(wLetter / 2), 
      cy - Math.floor(radius * 0.3) - Math.round(radius * 0.45), 
      textLetter
    );
  }
  
  // Write "angochat" below the icon if resolution allows it
  if (minDim >= 240) {
    const loadedFontTitle = await Jimp.loadFont(minDim >= 480 ? Jimp.FONT_SANS_32_WHITE : Jimp.FONT_SANS_16_WHITE);
    const titleText = "angochat";
    const titleW = Jimp.measureText(loadedFontTitle, titleText);
    const titleY = cy + radius + 15;
    if (titleY + 20 < height) {
      image.print(loadedFontTitle, cx - Math.round(titleW / 2), titleY, titleText);
    }
  }
  
  ensureDirectoryExistence(outputPath);
  await image.writeAsync(outputPath);
  console.log(`✓ Splash generated [${width}x${height}]: ${path.relative(process.cwd(), outputPath)}`);
}

async function main() {
  console.log("=========================================");
  console.log("ANGOCHAT FULL ANDROID ASSETS REBUILDER");
  console.log("=========================================");
  
  const baseRes = path.join(process.cwd(), "android", "app", "src", "main", "res");
  
  // List of standard Launcher Icons
  const icons = [
    { size: 48, name: "mipmap-mdpi/ic_launcher.png" },
    { size: 48, name: "mipmap-mdpi/ic_launcher_round.png" },
    { size: 72, name: "mipmap-hdpi/ic_launcher.png" },
    { size: 72, name: "mipmap-hdpi/ic_launcher_round.png" },
    { size: 96, name: "mipmap-xhdpi/ic_launcher.png" },
    { size: 96, name: "mipmap-xhdpi/ic_launcher_round.png" },
    { size: 144, name: "mipmap-xxhdpi/ic_launcher.png" },
    { size: 144, name: "mipmap-xxhdpi/ic_launcher_round.png" },
    { size: 192, name: "mipmap-xxxhdpi/ic_launcher.png" },
    { size: 192, name: "mipmap-xxxhdpi/ic_launcher_round.png" },
  ];
  
  // Adaptive Foreground Icons
  const adaptiveIcons = [
    { size: 108, name: "mipmap-mdpi/ic_launcher_foreground.png" },
    { size: 162, name: "mipmap-hdpi/ic_launcher_foreground.png" },
    { size: 216, name: "mipmap-xhdpi/ic_launcher_foreground.png" },
    { size: 324, name: "mipmap-xxhdpi/ic_launcher_foreground.png" },
    { size: 432, name: "mipmap-xxxhdpi/ic_launcher_foreground.png" },
  ];
  
  // Portrait splashes
  const portSplashes = [
    { w: 320, h: 480, name: "drawable-port-mdpi/splash.png" },
    { w: 480, h: 800, name: "drawable-port-hdpi/splash.png" },
    { w: 720, h: 1280, name: "drawable-port-xhdpi/splash.png" },
    { w: 960, h: 1600, name: "drawable-port-xxhdpi/splash.png" },
    { w: 1280, h: 1920, name: "drawable-port-xxxhdpi/splash.png" },
  ];
  
  // Landscape splashes
  const landSplashes = [
    { w: 480, h: 320, name: "drawable-land-mdpi/splash.png" },
    { w: 800, h: 480, name: "drawable-land-hdpi/splash.png" },
    { w: 1280, h: 720, name: "drawable-land-xhdpi/splash.png" },
    { w: 1600, h: 960, name: "drawable-land-xxhdpi/splash.png" },
    { w: 1920, h: 1280, name: "drawable-land-xxxhdpi/splash.png" },
  ];
  
  // General splashes
  const generalSplashes = [
    { w: 512, h: 512, name: "drawable/splash.png" },
    { w: 800, h: 850, name: "drawable/splash_content.png" }
  ];

  console.log("\n1/4. Generating Launcher Icons...");
  for (const icon of icons) {
    const dest = path.join(baseRes, icon.name);
    await generateIcon(icon.size, dest);
  }
  
  console.log("\n2/4. Generating Adaptive Foreground Icons...");
  for (const aIcon of adaptiveIcons) {
    const dest = path.join(baseRes, aIcon.name);
    await generateAdaptiveForeground(aIcon.size, dest);
  }
  
  console.log("\n3/4. Generating Portrait Splash screens...");
  for (const splash of portSplashes) {
    const dest = path.join(baseRes, splash.name);
    await generateSplash(splash.w, splash.h, dest);
  }
  
  console.log("\n4/4. Generating Landscape & General Splash screens...");
  for (const splash of landSplashes) {
    const dest = path.join(baseRes, splash.name);
    await generateSplash(splash.w, splash.h, dest);
  }
  for (const splash of generalSplashes) {
    const dest = path.join(baseRes, splash.name);
    await generateSplash(splash.w, splash.h, dest);
  }
  
  console.log("\n=========================================");
  console.log("✓ SUCCESS: All 27 binary assets generated!");
  console.log("=========================================");
}

main().catch(err => {
  console.error("Critical failure during assets generation:", err);
  process.exit(1);
});
