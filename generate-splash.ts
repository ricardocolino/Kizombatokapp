import Jimp from 'jimp';
import * as path from 'path';

async function generate() {
  try {
    console.log(">>> [Splash Generator] Iniciando geração da imagem combinada de Splash do zero com Jimp estável...");

    const canvasWidth = 800;
    const canvasHeight = 850;
    
    // 1. Criar imagem transparente de 800x850
    // No Jimp clássico, o construtor é new Jimp(width, height, backgroundHexColor)
    // 0x00000000 representa transparente completo
    const image = new Jimp(canvasWidth, canvasHeight, 0x00000000);

    // 2. Desenhar o ícone circular com gradiente roxo no centro
    // Centro: (400, 260). Raio: 120 (diâmetro 240)
    const cx = 400;
    const cy = 260;
    const radius = 120;
    
    console.log(">>> [Splash Generator] Renderizando círculo com gradiente em pixels...");
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const distSq = x * x + y * y;
        if (distSq <= radius * radius) {
          // Gradiente suave de cima/esquerda para baixo/direita
          const factor = (x + y + radius * 2) / (radius * 4);
          const r = Math.round(124 * (1 - factor) + 76 * factor);
          const g = Math.round(58 * (1 - factor) + 29 * factor);
          const b = Math.round(237 * (1 - factor) + 149 * factor);
          const alpha = 255;
          
          // No Jimp clássico, as cores RGBA são expressas como formato hexadecimal de 32 bits: 0xRRGGBBAA
          const colorVal = (r << 24) | (g << 16) | (b << 8) | alpha;
          
          // Anti-aliasing na borda externa
          const distance = Math.sqrt(distSq);
          if (radius - distance < 1.5) {
            const edgeFactor = radius - distance;
            const finalAlpha = Math.round(alpha * edgeFactor);
            const edgeColor = (r << 24) | (g << 16) | (b << 8) | finalAlpha;
            image.setPixelColor(edgeColor, cx + x, cy + y);
          } else {
            image.setPixelColor(colorVal, cx + x, cy + y);
          }
        }
      }
    }

    // 3. Carregar as fontes estáveis padrão do Jimp
    console.log(">>> [Splash Generator] Carregando fontes built-in do Jimp...");
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const fontSlogan = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

    // 4. Desenhar uma letra 'a' estilizada (a de angochat) de forma destacada dentro do círculo roxo
    // Para ficar elegante, colocamos "a" centralizado
    const letter = "a";
    // FONT_SANS_64_WHITE é bela e nítida. Vamos centralizar horizontal e verticalmente no círculo
    const letterWidth = Jimp.measureText(fontTitle, letter);
    const letterX = cx - Math.round(letterWidth / 2);
    // Para y, o FONT_SANS_64 tem altura média de ~64px
    const letterY = cy - 32;
    image.print(fontTitle, letterX, letterY, letter);

    // 5. Escrever o nome "angochat"
    const titleText = "angochat";
    const titleWidth = Jimp.measureText(fontTitle, titleText);
    const titleX = Math.round((canvasWidth - titleWidth) / 2);
    const titleY = cy + radius + 50; // posicionado abaixo do círculo
    image.print(fontTitle, titleX, titleY, titleText);

    // 6. Escrever o slogan "dubla o momento"
    const sloganText = "dubla o momento";
    const sloganWidth = Jimp.measureText(fontSlogan, sloganText);
    const sloganX = Math.round((canvasWidth - sloganWidth) / 2);
    const sloganY = titleY + 90; // posicionado abaixo do título com boa legibilidade
    image.print(fontSlogan, sloganX, sloganY, sloganText);

    // 7. Gravar no diretório Android res/drawable como splash_content.png de alta-definição
    const destPath = path.join(process.cwd(), 'android', 'app', 'src' , 'main', 'res', 'drawable', 'splash_content.png');
    await image.writeAsync(destPath);
    console.log(">>> [Splash Generator] Ficheiro splash_content.png gerado e guardado com sucesso em:", destPath);
  } catch (error) {
    console.error(">>> [Splash Generator] Erro na geração com o Jimp estável:", error);
    process.exit(1);
  }
}

generate();
