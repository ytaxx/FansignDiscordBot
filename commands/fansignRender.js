const fansignCooldowns = new Map();
const globalCooldown = new Map();
const config = require('../config/config.json');
const version = config.version;
let altFontPath, altFontFamily;
let softOutline = true;

// later declared but never read 
const MAX_CONCURRENT = 3;
let currentlyProcessing = 0;

const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');
const stylesConfigPath = path.join(__dirname, '../config/styles.json');
let styles = [];
function loadStyles() {
    try {
        styles = JSON.parse(fs.readFileSync(stylesConfigPath, 'utf8'));
    } catch (e) {
        styles = [];
    }
};

loadStyles();
fs.watchFile(stylesConfigPath, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        loadStyles();
        console.log('styles.json reloaded');
    }
});
const { createCanvas, loadImage, registerFont } = require('canvas');


const fontsDir = path.join(__dirname, '../fonts');
const fontFiles = fs.readdirSync(fontsDir).filter(f => f.endsWith('.ttf'));

const { performance } = require('perf_hooks');

const concurrencyManager = require('../utils/concurrencyManager');

module.exports = {
    startTime: null,
    data: new SlashCommandBuilder()
        .setName('fs')
        .setDescription('Make a fansign with custom text and style (styles 1-25)')
        .addStringOption(option =>
            option.setName('style')
                .setDescription('choose the fansign style')
                .setRequired(true)
                .addChoices(...styles.slice(0, 25).map(s => ({ name: s.name, value: s.name })))
        )
        .addStringOption(option =>
            option.setName('text')
                .setDescription('the text to put on the fansign')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('font')
                .setDescription('choose a font')
                .setRequired(true)
                .addChoices(...fontFiles.map(f => ({ name: f.replace('.ttf',''), value: f })))
        ),
    async execute(interaction) {
        const startTime = performance.now();
        const allowedChannel = '1394020049211228383';
        
        const userId = interaction.user.id;
        if (concurrencyManager.isOnCooldown(userId)) {
            const remainingTime = Math.ceil(concurrencyManager.getRemainingCooldown(userId) / 1000);
            if (!interaction.deferred) {
                await interaction.reply({ 
                    content: `<:cooldown:1393755958290681987> Please wait ${remainingTime} seconds before using this command again.`,
                    flags: 64
                });
            } else {
                await interaction.editReply({ 
                    content: `<:cooldown:1393755958290681987> Please wait ${remainingTime} seconds before using this command again.`
                });
            }
            return;
        }

        if (!concurrencyManager.isProcessingAvailable()) {
            await interaction.reply({ 
                content: '<:cooldown:1393755958290681987> Too many requests running at once, please try again later.',
                flags: 64
            });
            return;
        }
        
        concurrencyManager.incrementProcessing();
        concurrencyManager.setCooldown(userId, 30000);
        try {
            if (interaction.channelId !== allowedChannel) {
            await interaction.reply({ content: '<:crossmark:1393755852221190205> This command can only be used in the command channel!', flags: 64 });
            return;
        }
        const styleName = interaction.options.getString('style');
        let text = interaction.options.getString('text');
        const now2 = Date.now();
        const cooldown = 60 * 1000;
        const roleId = '1392126648396025937';
        const member = interaction.member;
        const hasRole = member && member.roles && member.roles.cache && member.roles.cache.has(roleId);
        let replyDeferred = false;
        if (text.length > 20) {
            await interaction.deferReply({ flags: 64 });
            replyDeferred = true;
            await interaction.editReply({ content: '<:crossmark:1393755852221190205> The fansign text can be maximum 20 characters!' });
            return;
        }
        if (!hasRole) {
            const lastUsed = fansignCooldowns.get(userId);
            if (lastUsed && now2 - lastUsed < cooldown) {
                await interaction.deferReply({ flags: 64 });
                replyDeferred = true;
                const endTimestamp = Math.floor((lastUsed + cooldown) / 1000);
                await interaction.editReply({
                    content: `<:cooldown:1393755958290681987> You can use this command again <t:${endTimestamp}:R>.`
                });
                return;
            }
            fansignCooldowns.set(userId, now2);
        }
        await interaction.deferReply();
        replyDeferred = true;
        let blacklist = [];
        try {
            blacklist = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/blacklist.json'), 'utf8'));
        } catch (e) {
            blacklist = [];
        }
        const lowerText = text.toLowerCase();
        if (blacklist.some(word => lowerText.includes(word))) {
            await interaction.deferReply({ flags: 64 });
            await interaction.editReply({ content: '<:crossmark:1393755852221190205> The fansign text contains a blacklisted word!' });
            return;
        }

        // font fallback: try selected font, fallback if missing glyphs
        const selectedFont = interaction.options.getString('font');
        const config = styles.find(s => s.name.toLowerCase() === styleName.toLowerCase());

        const effectStrength = (typeof config.effectStrength === 'number') ? config.effectStrength : 1.0;
        if (!config) {
            await interaction.editReply({ content: `<:crossmark:1393755852221190205> No such style: ${styleName}. Available styles: ${styles.map(s => s.name).join(', ')}` });
            return;
        }
        const imagePath = path.join(__dirname, '../images', config.image);
        if (!fs.existsSync(imagePath)) {
            await interaction.editReply({ content: '<:crossmark:1393755852221190205> Image for this style not found!' });
            return;
        }
        const image = await loadImage(imagePath);
        const bgCanvas = createCanvas(image.width, image.height);
        const bgCtx = bgCanvas.getContext('2d');
        bgCtx.drawImage(image, 0, 0, image.width, image.height);
        
        // Analyze background image for optimal text parameters
        function analyzeBackground() {
            const imageData = bgCtx.getImageData(0, 0, image.width, image.height);
            const data = imageData.data;
            let brightness = 0;
            let contrast = 0;
            let edgeStrength = 0;
            const histogram = new Array(256).fill(0);
            
            // Calculate average brightness and build histogram
            for(let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
                brightness += luminance;
                histogram[Math.floor(luminance)]++;
            }
            brightness /= (data.length / 4);
            
            // Calculate contrast from histogram
            const pixels = image.width * image.height;
            let min = 0;
            let max = 255;
            let cumsum = 0;
            for(let i = 0; i < 256; i++) {
                cumsum += histogram[i];
                if(cumsum > pixels * 0.02 && min === 0) min = i;
                if(cumsum > pixels * 0.98) {
                    max = i;
                    break;
                }
            }
            contrast = (max - min) / 255;
            
            // Calculate edge strength using simple Sobel
            for(let y = 1; y < image.height - 1; y++) {
                for(let x = 1; x < image.width - 1; x++) {
                    const idx = (y * image.width + x) * 4;
                    const gx = 
                        -data[idx - 4] + data[idx + 4] +
                        -2 * data[idx - 4 + image.width * 4] + 2 * data[idx + 4 + image.width * 4] +
                        -data[idx - 4 - image.width * 4] + data[idx + 4 - image.width * 4];
                    const gy = 
                        -data[idx - image.width * 4] + data[idx + image.width * 4] +
                        -2 * data[idx + 4 - image.width * 4] + 2 * data[idx + 4 + image.width * 4] +
                        -data[idx - 4 - image.width * 4] + data[idx - 4 + image.width * 4];
                    edgeStrength += Math.sqrt(gx * gx + gy * gy);
                }
            }
            edgeStrength /= (image.width * image.height);
            
            // Adjust text parameters based on analysis
            const textParams = {
                opacity: Math.min(1.2, 1.5 - brightness / 255), // Darker background -> more opaque text
                skewStrength: Math.max(0.1, Math.min(0.3, edgeStrength / 500)), // More edges -> more natural variation
                pressureVar: Math.max(0.002, Math.min(0.01, contrast * 0.02)), // Higher contrast -> more pressure variation
                haloStrength: Math.max(0.5, Math.min(1.5, (255 - brightness) / 128)) // Darker background -> stronger halo
            };
            
            return textParams;
        }
        
        const bgAnalysis = analyzeBackground();
        const centerX = Math.floor(image.width / 2);
        const centerY = Math.floor(image.height / 2);
        let quality = typeof config.quality === 'number' ? config.quality : 1;
        if (!config.quality) {
            const minDim = Math.min(image.width, image.height);
            if (minDim < 400) quality = 0.25;
            else if (minDim < 800) quality = 0.5;
            else quality = 1;
        }
        // enhanced font rendering system
        let fontFile = selectedFont || config.font || 'Inhishan.ttf';
        let fontPath = path.join(fontsDir, fontFile);
        let fontFamily = fontFile.replace(/\.[^.]+$/, '');
        
        // modernized font handling with multiple fallbacks
        const fallbackFonts = ['1.ttf', '2.ttf'].filter(f => f !== fontFile);
        const fallbackPaths = fallbackFonts.map(f => path.join(fontsDir, f));
        const fallbackFamilies = fallbackFonts.map(f => f.replace(/\.[^.]+$/, ''));
        
        // font quality settings for better rendering
        const fontSettings = {
            subpixelOffset: 0.3,
            hinting: true,
            kerning: true,
            letterSpacing: -0.02
        };
        // Register primary and fallback fonts
        const registeredFonts = new Set();
        
        // Register primary font
        if (fs.existsSync(fontPath)) {
            registerFont(fontPath, { family: fontFamily });
            registeredFonts.add(fontFamily);
        }
        
        // Register all available fallback fonts
        const allFallbackFonts = ['1.ttf', '2.ttf', '1 jp ru support.ttf', '2 jp ru support.ttf'];
        allFallbackFonts.forEach(fallbackFont => {
            const fallbackPath = path.join(fontsDir, fallbackFont);
            const fallbackFamily = fallbackFont.replace(/\.[^.]+$/, '');
            if (fs.existsSync(fallbackPath) && !registeredFonts.has(fallbackFamily)) {
                registerFont(fallbackPath, { family: fallbackFamily });
                registeredFonts.add(fallbackFamily);
            }
        });

        // Enhanced font checking system
        function canFontRenderAll(text, family) {
            const testCanvas = createCanvas(1, 1);
            const testCtx = testCanvas.getContext('2d');
            
            // Test with different font sizes to ensure accurate measurement
            const testSizes = [48, 24, 72];
            for (const size of testSizes) {
                testCtx.font = `${size}px '${family}'`;
                const referenceWidth = testCtx.measureText('x').width;
                
                for (const ch of text) {
                    // Compare with both monospace and Arial for better accuracy
                    testCtx.font = `${size}px '${family}'`;
                    const w1 = testCtx.measureText(ch).width;
                    
                    testCtx.font = `${size}px monospace`;
                    const w2 = testCtx.measureText(ch).width;
                    
                    testCtx.font = `${size}px Arial`;
                    const w3 = testCtx.measureText(ch).width;
                    
                    // Check if the character width is suspiciously similar to fallback fonts
                    if (Math.abs(w1 - w2) < 0.01 || Math.abs(w1 - w3) < 0.01 || w1 === 0) {
                        return false;
                    }
                    
                    // Check for unrealistic width ratios
                    if (w1 / referenceWidth > 4 || w1 / referenceWidth < 0.1) {
                        return false;
                    }
                }
            }
            return true;
        }
        let usedFontFamily = fontFamily;
        let usedFontFile = fontFile;
        let fontOk = canFontRenderAll(text, fontFamily);
        if (!fontOk && altFontFamily && canFontRenderAll(text, altFontFamily)) {
            usedFontFamily = altFontFamily;
            usedFontFile = altFontFile;
            fontOk = true;
        }
        if (!fontOk) {
            // Try each fallback font in order
            for (const fallbackFamily of Array.from(registeredFonts)) {
                if (fallbackFamily !== fontFamily && canFontRenderAll(text, fallbackFamily)) {
                    fontFamily = fallbackFamily;
                    fontFile = `${fallbackFamily}.ttf`;
                    fontOk = true;
                    break;
                }
            }
            
            if (!fontOk) {
                await interaction.editReply({ 
                    content: `<:crossmark:1393755852221190205> None of the available fonts can render all characters in your text. Please try simpler characters or contact an administrator.` 
                });
                return;
            }
        }

        const pixelate = config.pixelate && config.pixelate > 1 ? config.pixelate : 1;
        const textCanvas = createCanvas(image.width, image.height);
        const textCtx = textCanvas.getContext('2d');
        const pureTextCanvas = createCanvas(image.width, image.height);
        const pureTextCtx = pureTextCanvas.getContext('2d');
        let opacity = Number(config.opacity);
        if (isNaN(opacity)) opacity = 1;
        if (opacity < 0) opacity = 0;
        if (opacity > 2) opacity = 2;
        let fillStyle = config.color || '#000';
        if (fillStyle.startsWith('#')) {
            const hex = fillStyle.replace('#', '');
            const bigint = parseInt(hex, 16);
            let r, g, b;
            if (hex.length === 6) {
                r = (bigint >> 16) & 255;
                g = (bigint >> 8) & 255;
                b = bigint & 255;
            } else {
                r = g = b = 0;
            }
            // if opacity >= 1, then fully opaque (alpha=1), if between 0-1, then alpha=opacity
            let alpha = opacity >= 1 ? 1 : opacity;
            fillStyle = `rgba(${r},${g},${b},${alpha})`;
        }
        // always set globalAlpha too, so it's stronger even above 1
        textCtx.globalAlpha = Math.min(opacity, 1);
        textCtx.fillStyle = fillStyle;
        textCtx.textAlign = config.align || 'center';
        textCtx.textBaseline = 'alphabetic';

        function wrapText(ctx, text, maxWidth) {
                const words = text.split(' ');
            const lines = [];
            let currentLine = '';
            let currentLineWidth = 0;
            const spaceWidth = ctx.measureText(' ').width;
            const wordMetrics = words.map(word => ({
                word,
                width: ctx.measureText(word).width,
                isEndOfSentence: /[.!?]$/.test(word)
            }));
            
            for (let i = 0; i < wordMetrics.length; i++) {
                const { word, width, isEndOfSentence } = wordMetrics[i];
                const nextWord = wordMetrics[i + 1];
                const wordSpacing = isEndOfSentence ? spaceWidth * 1.5 : spaceWidth;
                
                if (currentLine) {
                    if (currentLineWidth + wordSpacing + width > maxWidth) {
                        lines.push(currentLine);
                        currentLine = word;
                        currentLineWidth = width;
                    } else {
                        currentLine += ' ' + word;
                        currentLineWidth += wordSpacing + width;
                    }
                } else {
                    currentLine = word;
                    currentLineWidth = width;
                }
            }
            
            if (currentLine) lines.push(currentLine);
            return lines;
        }
        const minFontSize = config.minFontSize || 24;
        const maxFontSize = config.maxFontSize || 120;
        let autoFontSize;
        if (config.fontSize) {
            autoFontSize = config.fontSize;
        } else {
            const len = text.length;
            const minLen = 8;
            const maxLen = 32;
            if (len <= minLen) autoFontSize = maxFontSize;
            else if (len >= maxLen) autoFontSize = minFontSize;
            else {
                autoFontSize = maxFontSize - ((maxFontSize - minFontSize) * (len - minLen) / (maxLen - minLen));
            }
        }
        const fontSizePx = autoFontSize;
        textCtx.font = `${fontSizePx}px '${fontFamily}'`;
        const maxWidth = image.width * 0.9;
        let lines = wrapText(textCtx, text, maxWidth);

        let y = config.y;
        const rotationRad = (typeof config.rotation === 'number' ? config.rotation : 0) * Math.PI / 180;
        const shadowCanvas = createCanvas(image.width, image.height);
        const shadowCtx = shadowCanvas.getContext('2d');
        let baseY = (lines.length === 1) ? fontSizePx / 2 : fontSizePx / 4;
        let lineSpacing = fontSizePx * 1.1;

        for (let li = 0; li < lines.length; li++) {
            let line = lines[li];
            let lineWidth = 0;
            pureTextCtx.font = `${fontSizePx}px '${fontFamily}'`;
            const letterSpacing = -0.08 * fontSizePx;
            for (let i = 0; i < line.length; i++) {
                let ch = line[i];
                let chWidth = pureTextCtx.measureText(ch).width;
                if (i < line.length - 1) {
                    lineWidth += chWidth + letterSpacing;
                } else {
                    lineWidth += chWidth;
                }
            }
            let x0 = config.x;
            let y0 = config.y + li * lineSpacing;
            if ((config.align || 'center') === 'center') x0 -= lineWidth / 2;
            if ((config.align || 'center') === 'right') x0 -= lineWidth;
            let charX = 0;
            const perspSkewX = -0.18;
            const perspScaleY = 0.97;
            pureTextCtx.save();
            pureTextCtx.translate(x0 + lineWidth / 2, y0);
            pureTextCtx.rotate(rotationRad);
            pureTextCtx.translate(-(x0 + lineWidth / 2), -y0);
            for (let i = 0; i < line.length; i++) {
                let ch = line[i];
                let chWidth = pureTextCtx.measureText(ch).width;
                pureTextCtx.save();
                // enhanced character positioning and natural variation
                const charContext = {
                    prevChar: i > 0 ? line[i-1] : '',
                    nextChar: i < line.length - 1 ? line[i+1] : '',
                    posInWord: i / line.length,
                    isFirst: i === 0,
                    isLast: i === line.length - 1
                };

                // advanced writing dynamics simulation
                const handMomentum = Math.sin(charContext.posInWord * Math.PI * 2.5) * 0.018;
                const naturalShake = Math.sin(Date.now() * 0.001 + charContext.posInWord * 8) * 0.008;
                const speedVariation = Math.exp(-Math.pow(charContext.posInWord - 0.5, 2)) * 0.15;
                
                // pressure and flow dynamics - minimal variation for very consistent ink flow
                const pressureBase = Math.sin(charContext.posInWord * Math.PI * 2);
                const pressureVar = pressureBase * 0.005 * (1 + speedVariation * 0.05); // Drastically reduced variation
                const flowAngle = (handMomentum + naturalShake * 0.1) * 
                    (1 + Math.abs(pressureBase) * 0.01); // Reduced angle variation
                
                // enhanced character-specific behaviors with very consistent pressure
                const charTraits = getCharacterTraits(ch, charContext, {
                    momentum: handMomentum * 0.2,
                    pressure: 0.98 + pressureVar, // Higher base pressure with less variation
                    speed: speedVariation * 0.05  // Reduced speed variation
                });
                
                // realistic hand movement simulation
                let randRot = flowAngle + (Math.random() - 0.5) * 0.01 * charTraits.rotationMod;
                let randX = charTraits.xOffset + (Math.random() - 0.5) * fontSizePx * 0.005;
                let randY = charTraits.yOffset + (Math.random() - 0.5) * fontSizePx * 0.003;
                
                // AI-adjusted perspective and pressure variation based on background analysis
                let randSkew = perspSkewX * charTraits.skewMod + (Math.random() - 0.5) * bgAnalysis.skewStrength;
                let randScaleY = perspScaleY + pressureVar * bgAnalysis.pressureVar + (Math.random() - 0.5) * 0.001;
                let randAlpha = bgAnalysis.opacity * (0.97 + pressureVar * 0.3 + Math.random() * 0.02);
                let baseColor = fillStyle;
                let colorObj = /^rgba?\((\d+),(\d+),(\d+)(?:,(\d+(?:\.\d+)?))?\)$/.exec(baseColor);
                let r = 0, g = 0, b = 0, a = randAlpha;
                if (colorObj) {
                    r = parseInt(colorObj[1]);
                    g = parseInt(colorObj[2]);
                    b = parseInt(colorObj[3]);
                    if (colorObj[4]) a = parseFloat(colorObj[4]);
                    let lighten = Math.round(Math.random() * 3);
                    r = g = b = Math.min(255, Math.max(0, r + lighten));
                    pureTextCtx.fillStyle = `rgba(${r},${g},${b},${a})`;
                } else {
                    pureTextCtx.fillStyle = baseColor;
                }
                pureTextCtx.globalAlpha = a;
                pureTextCtx.globalCompositeOperation = 'multiply'; // only multiply, to avoid being too dark
                pureTextCtx.translate(x0 + charX + randX, y0 + randY);
                pureTextCtx.transform(1, randSkew, 0, randScaleY, 0, 0);
                pureTextCtx.rotate(randRot);
                let haloStrength = (typeof config.haloStrength === 'number') ? config.haloStrength : 1.0;
                haloStrength *= effectStrength;
                if (haloStrength === 0) {
                    pureTextCtx.filter = 'none';
                } else {
                    let blurPx = 0.3 * haloStrength;
                    let dropPx = 0.5 * haloStrength;
                    pureTextCtx.filter = `blur(${blurPx}px) drop-shadow(0px ${dropPx}px ${dropPx}px rgba(40,40,40,0.09))`;
                }
                pureTextCtx.fillText(ch, 0, 0);
                pureTextCtx.filter = 'none';
                pureTextCtx.globalCompositeOperation = 'source-over';
                pureTextCtx.restore();
                // reduce letter spacing
                if (i < line.length - 1) {
                    charX += chWidth + letterSpacing;
                } else {
                    charX += chWidth;
                }
            }
            pureTextCtx.restore();
        }
        // 3D analysis
        function analyze3DPaperDeformation(imageData, width, height) {
            const depthMap = new Float32Array(width * height);
            const gradientX = new Float32Array(width * height);
            const gradientY = new Float32Array(width * height);
            const normalMap = new Float32Array(width * height * 3);
            
            // scales
            const scales = [1, 2, 4];
            const weights = [0.5, 0.3, 0.2];
            
            // analyze image gradients with multi-scale approach
            for (let y = 4; y < height - 4; y++) {
                for (let x = 4; x < width - 4; x++) {
                    const idx = (y * width + x) * 4;
                    let totalGx = 0;
                    let totalGy = 0;
                    
                    // multi-scale sobel operator with enhanced edge detection
                    scales.forEach((scale, i) => {
                        const offset = scale * 4;
                        const kernelWeight = weights[i];
                        
                        // advanced Sobel operator with diagonal components
                        const gx = (
                            -3 * imageData[idx - offset] +
                            3 * imageData[idx + offset] +
                            -10 * imageData[idx - offset + width * 4] +
                            10 * imageData[idx + offset + width * 4] +
                            -3 * imageData[idx - offset - width * 4] +
                            3 * imageData[idx + offset - width * 4] +
                            // diagonal components for better edge detection
                            -2 * imageData[idx - offset - offset] +
                            2 * imageData[idx + offset + offset]
                        ) / 32 * kernelWeight;
                    
                    const gy = (
                        -3 * imageData[idx - width * 4] +
                        3 * imageData[idx + width * 4] +
                        -10 * imageData[idx + 4 - width * 4] +
                        10 * imageData[idx + 4 + width * 4] +
                        -3 * imageData[idx - 4 - width * 4] +
                        3 * imageData[idx - 4 + width * 4] +
                        // diagonal components
                        -2 * imageData[idx - width * 8] +
                        2 * imageData[idx + width * 8]
                    ) / 32 * kernelWeight;
                        
                        totalGx += gx;
                        totalGy += gy;
                    });
                    
                    // enhanced gradient analysis with noise reduction
                    const gradientMagnitude = Math.sqrt(totalGx * totalGx + totalGy * totalGy);
                    const gradientThreshold = 0.05; // Adjustable threshold for noise reduction
                    
                    if (gradientMagnitude > gradientThreshold) {
                        gradientX[y * width + x] = totalGx;
                        gradientY[y * width + x] = totalGy;
                        
                        // improved depth estimation with non-linear response
                        const depthValue = Math.pow(gradientMagnitude, 1.5) * 0.5;
                        depthMap[y * width + x] = Math.min(1.0, depthValue);
                        
                        // calculate surface normals
                        const nx = -totalGx / gradientMagnitude;
                        const ny = -totalGy / gradientMagnitude;
                        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
                        
                        const normalIdx = (y * width + x) * 3;
                        normalMap[normalIdx] = nx;
                        normalMap[normalIdx + 1] = ny;
                        normalMap[normalIdx + 2] = nz;
                    } else {
                        // smooth out flat regions
                        gradientX[y * width + x] = 0;
                        gradientY[y * width + x] = 0;
                        depthMap[y * width + x] = 0;
                        
                        const normalIdx = (y * width + x) * 3;
                        normalMap[normalIdx] = 0;
                        normalMap[normalIdx + 1] = 0;
                        normalMap[normalIdx + 2] = 1;
                    }
                }
            }
            
            return { depthMap, gradientX, gradientY };
        };

        // character traits helper function with 3D perspective
        function getCharacterTraits(char, context, dynamics) {
            const traits = {
                rotationMod: 1,
                xOffset: 0,
                yOffset: 0,
                skewMod: 1,
                pressureMod: 1,
                strokeWidth: 1,
                connectivityForce: 0,
                flowResistance: 1,
                // 3D perspective properties
                depth: 0,
                perspectiveX: 0,
                perspectiveY: 0,
                surfaceNormal: { x: 0, y: 0, z: 1 }
            };
            
            // enhanced character classification with stroke analysis
            const charClass = {
                ascender: 'bdfhklt'.includes(char),
                descender: 'gjpqy'.includes(char),
                round: 'oaec'.includes(char),
                sharp: 'vwxz'.includes(char),
                diagonal: 'vwxyz'.includes(char),
                dotted: 'ij'.includes(char),
                // additional classifications
                complex: 'km&@#'.includes(char),
                narrow: 'ijl|'.includes(char),
                wide: 'mw%'.includes(char),
                symmetrical: 'AHIMOTUVWXY'.includes(char.toUpperCase()),
                crossbar: 'eftz'.includes(char)
            };

                // advanced handwriting dynamics - highly consistent pressure
                const strokeAnalysis = {
                    pressure: 0.98 + dynamics.pressure * 0.02, // Higher base pressure, less variation
                    speed: dynamics.speed * 0.15,              // Reduced speed impact
                    direction: Math.atan2(dynamics.momentum * 0.2, 1),
                    acceleration: (dynamics.momentum - (context.prevMomentum || 0)) * 0.1
                };

                // minimal natural variation for very consistent writing
                const handTremor = Math.sin(Date.now() * 0.001 + context.posInWord * 12) * 0.002; // Reduced tremor
                const fatigue = Math.pow(context.posInWord, 1.5) * 0.01;  // Reduced fatigue effect
                const mood = Math.sin(Date.now() * 0.0002) * 0.01;        // Minimal mood variation // Very subtle mood variation            // characteristic adjustments based on letter features
            if (charClass.ascender) {
                traits.yOffset = -0.15 - handTremor;
                traits.skewMod = 1.1 + strokeAnalysis.pressure * 0.2;
                traits.rotationMod = 0.9 + mood;
            } else if (charClass.descender) {
                traits.yOffset = 0.12 + handTremor;
                traits.skewMod = 1.15 - fatigue * 0.3;
                traits.pressureMod = 1.1;
            } else if (charClass.round) {
                traits.rotationMod = 1.2 + strokeAnalysis.speed * 0.3;
                traits.skewMod = 0.95 + mood * 0.2;
                traits.pressureMod = 0.9;
            } else if (charClass.complex) {
                traits.rotationMod = 1 + handTremor * 2;
                traits.skewMod = 1 + fatigue * 0.5;
                traits.pressureMod = 1.2;
            }

            // enhanced natural writing variations
            const writingDynamics = {
                // base momentum and flow
                baseSpeed: dynamics.speed,
                flowDirection: Math.atan2(dynamics.momentum, 1),
                acceleration: dynamics.momentum - (context.prevMomentum || 0),
                
                // natural variation factors
                handTremor: {
                    highFreq: Math.sin(Date.now() * 0.003 + context.posInWord * 15) * 0.008,
                    lowFreq: Math.sin(Date.now() * 0.001 + context.posInWord * 8) * 0.015
                },
                
                // writer's state simulation
                fatigue: {
                    general: Math.pow(context.posInWord, 1.5) * 0.08,
                    local: Math.sin(context.posInWord * Math.PI * 2) * 0.03
                },
                
                // emotional/mood factors
                mood: {
                    variation: Math.sin(Date.now() * 0.0002) * 0.1,
                    confidence: 0.8 + Math.sin(Date.now() * 0.0001) * 0.2
                },
                
                // environmental factors
                surface: {
                    friction: 0.7 + Math.random() * 0.3,
                    texture: Math.sin(context.posInWord * 20) * 0.05
                }
            };

            // apply complex natural variations
            traits.rotationMod *= 1 + writingDynamics.baseSpeed * 0.2 
                + writingDynamics.handTremor.highFreq
                + writingDynamics.surface.texture;
                
            traits.skewMod += writingDynamics.acceleration * 0.1
                + writingDynamics.handTremor.lowFreq
                + writingDynamics.mood.variation * 0.15;
                
            traits.pressureMod *= (1 - Math.abs(writingDynamics.baseSpeed) * 0.3)
                * (1 - writingDynamics.fatigue.general)
                * writingDynamics.mood.confidence;

            // stroke width variation based on direction and pressure
            traits.strokeWidth *= 1 + Math.sin(writingDynamics.flowDirection) * 0.2
                + writingDynamics.surface.friction * 0.1;

            // context-based adjustments
            if (context.isFirst) {
                traits.xOffset = -0.05;
                traits.skewMod *= 0.9;
            } else if (context.isLast) {
                traits.skewMod *= 1.1;
            }

            // connection-based adjustments
            if (context.prevChar && 'oaec'.includes(context.prevChar)) {
                traits.xOffset -= 0.02;
            }
            if (context.nextChar && 'oaec'.includes(context.nextChar)) {
                traits.skewMod *= 1.05;
            }

            return traits;
        }

        textCtx.save();
        let haloStrength = (typeof config.haloStrength === 'number') ? config.haloStrength : 1.0;
        haloStrength *= effectStrength * bgAnalysis.haloStrength;

        if (haloStrength === 0) {
            textCtx.filter = 'none';
        } else {
            // light Config
            const lightingConfig = {
                mainLight: { angle: 45, intensity: 0.8, height: 100 },
                ambient: { intensity: 0.2, color: [255, 252, 245] },
                paperThickness: 0.15,
                inkHeight: 0.08
            };
            
            // shadows
            const shadowLayers = [
                { blur: 0.35, offset: 0.6, opacity: 0.08, color: [20, 20, 25] },
                { blur: 0.2, offset: 0.3, opacity: 0.05, color: [40, 35, 30] },
                { blur: 0.1, offset: 0.15, opacity: 0.03, color: [60, 55, 50] },
                { blur: 0.8, offset: -0.1, opacity: 0.02, color: [255, 230, 210] }
            ];
            
            // calculate dynamic shadow based on light angle
            const shadowAngle = lightingConfig.mainLight.angle * (Math.PI / 180);
            const shadowOffset = Math.cos(shadowAngle) * lightingConfig.mainLight.height;
            
            const shadows = shadowLayers
                .map(layer => {
                    const blurPx = layer.blur * haloStrength;
                    const offsetPx = layer.offset * haloStrength;
                    return `drop-shadow(0px ${offsetPx}px ${blurPx}px rgba(40,40,40,${layer.opacity}))`;
                })
                .join(' ');
            
            textCtx.filter = `blur(${0.2 * haloStrength}px) ${shadows}`;
        }
        textCtx.globalAlpha = 1;
        textCtx.drawImage(pureTextCanvas, 0, 0);
        textCtx.restore();



        // add paper grain/noise overlay to text layer
        function addNoiseToCanvas(ctx, width, height, amount = 0.10) {
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;
            
            // enhanced Paper Physics Config
            const paperProperties = {
                roughness: 0.7,
                grainSize: 0.12,
                fiberDensity: 0.85,
                surfaceVariation: 0.3,
                microStructure: {
                    cellSize: 0.05,
                    density: 0.9,
                    orientation: 45,
                    randomness: 0.3,
                    fiberNetwork: {
                        length: 0.8,
                        width: 0.02,
                        connectivity: 0.7,
                        orientation: {
                            mean: 45,
                            deviation: 15
                        }
                    }
                },
                coating: {
                    thickness: 0.08,
                    smoothness: 0.85,
                    absorption: 0.7,
                    layerCount: 2,
                    pigmentSize: 0.01,
                    binderRatio: 0.15
                },
                physical: {
                    thickness: 0.1,
                    stiffness: 0.8,
                    bendResistance: 0.75,
                    elasticModulus: 3.5,
                    moistureContent: 0.06,
                    temperatureResponse: 0.02
                },
                opticalProperties: {
                    glossiness: 0.2,
                    opacity: 0.95,
                    whiteness: 0.9,
                    fluorescence: 0.05,
                    scattering: {
                        surface: 0.3,
                        bulk: 0.7
                    }
                }
            };
            
            // multi-octave noise for realistic paper texture
            const noise2D = new Array(width * height).fill(0).map((_, i) => {
                const x = (i % width);
                const y = Math.floor(i / width);
                
                // enhanced Perlin noise with fractal behavior
                let value = 0;
                let amplitude = 1;
                let frequency = 1;
                const octaves = 4;
                const persistence = 0.5;
                const lacunarity = 2.0;
                
                for(let o = 0; o < octaves; o++) {
                    const nx = x * frequency * paperProperties.grainSize;
                    const ny = y * frequency * paperProperties.grainSize;
                    
                    // improved noise function with better gradient interpolation
                    const noise = (function improvedNoise(x, y) {
                        const X = Math.floor(x) & 255;
                        const Y = Math.floor(y) & 255;
                        x -= Math.floor(x);
                        y -= Math.floor(y);
                        
                        // improved smoothing function
                        const u = x * x * x * (x * (x * 6 - 15) + 10);
                        const v = y * y * y * (y * (y * 6 - 15) + 10);
                        
                        // random gradient vectors
                        const h = function(x, y) {
                            const theta = 2920 * Math.sin(x * 21942 + y * 171324 + 8912) * Math.cos(x * 23157 + y * 217832 + 9758);
                            return [Math.cos(theta), Math.sin(theta)];
                        };
                        
                        const g00 = h(X, Y);
                        const g10 = h(X + 1, Y);
                        const g01 = h(X, Y + 1);
                        const g11 = h(X + 1, Y + 1);
                        
                        // dot products
                        const d00 = g00[0] * x + g00[1] * y;
                        const d10 = g10[0] * (x - 1) + g10[1] * y;
                        const d01 = g01[0] * x + g01[1] * (y - 1);
                        const d11 = g11[0] * (x - 1) + g11[1] * (y - 1);
                        
                        // interpolate
                        const x1 = d00 + u * (d10 - d00);
                        const x2 = d01 + u * (d11 - d01);
                        return x1 + v * (x2 - x1);
                    })(nx, ny);
                    
                    value += noise * amplitude;
                    amplitude *= persistence;
                    frequency *= lacunarity;
                }
                
                // normalize and apply non-linear transformations
                value = (value + 1) * 0.5;  // Normalize to [0,1]
                value = Math.pow(value, 1.2); // Non-linear contrast adjustment
                
                // calculate base fiber angle
                const baseAngle = Math.atan2(y - height/2, x - width/2) + 
                                Math.sin(x * 0.05) * Math.cos(y * 0.05) * 0.2;
                
                // define fiber layers
                const fiberLayers = [
                    { scale: 1.0, density: 1.0, orientation: 0 },
                    { scale: 0.7, density: 0.8, orientation: Math.PI / 6 },
                    { scale: 0.4, density: 0.6, orientation: -Math.PI / 4 }
                ];

                // calculate layer effects
                const layerEffects = fiberLayers.map(layer => {
                    const layerAngle = baseAngle + layer.orientation;
                    return Math.sin(layerAngle * 8 + value * 3) * 
                           paperProperties.fiberDensity * layer.density * 
                           Math.pow(value, 0.7);
                });

                // enhanced paper fiber simulation
                const fiberSimulation = {
                    baseAngle: baseAngle,
                    layers: layerEffects,
                    
                    // fiber clustering and interaction
                    clustering: Math.pow(Math.sin(x * 0.02 + y * 0.03), 2) * 0.3,
                    crosslinking: Math.max(0, Math.sin(x * 0.1) * Math.cos(y * 0.1))
                };

                // combine all fiber layers with clustering effects
                const fiberPattern = fiberSimulation.layers.reduce((acc, layer, i) => 
                    acc + layer * (1 + fiberSimulation.clustering) * 
                    (1 + fiberSimulation.crosslinking * 0.2), 0) / 
                    fiberSimulation.layers.length;
                
                // enhanced 3D surface analysis
                const surfaceHeight = (value + Math.abs(fiberPattern) * paperProperties.surfaceVariation) / (1 + paperProperties.surfaceVariation);
                const surfaceCurvature = Math.sin(x * 0.01) * Math.cos(y * 0.01) * paperProperties.surfaceVariation;
                
                // calculate fiber angle based on surface properties
                const fiberAngle = baseAngle + 
                    Math.sin(x * 0.02 + y * 0.03) * Math.PI * 0.25 + 
                    Math.cos(surfaceCurvature * Math.PI);
                
                return {
                    height: surfaceHeight,
                    curvature: surfaceCurvature,
                    normal: {
                        x: Math.cos(fiberAngle) * surfaceCurvature,
                        y: Math.sin(fiberAngle) * surfaceCurvature,
                        z: Math.sqrt(1 - surfaceCurvature * surfaceCurvature)
                    }
                };
            });
            
            // analyze paper deformation
            const { depthMap, gradientX, gradientY } = analyze3DPaperDeformation(paperData, width, height);
            
                // enhanced Ink Physics Config
                const inkProperties = {
                    viscosity: 0.85,
                    surfaceTension: 0.12,
                    absorption: 0.75,
                    rheology: {
                        shearThinning: 0.3,
                        yieldStress: 0.05,
                        thixotropy: 0.2,
                        elasticity: 0.15,
                        plasticity: 0.25
                    },
                    drying: {
                        rate: 0.4,
                        shrinkage: 0.15,
                        surfaceMigration: 0.25,
                        evaporationProfile: {
                            initial: 0.8,
                            middle: 0.5,
                            final: 0.2
                        },
                        crackingThreshold: 0.85
                    },
                    capillary: {
                        spreadRate: 0.6,
                        penetrationDepth: 0.4,
                        fiberAttraction: 0.35,
                        porosity: 0.55,
                        surfaceEnergy: 0.3,
                        contactAngle: 45
                    },
                    particleProperties: {
                        size: 0.02,
                        density: 1.2,
                        aggregation: 0.3,
                        dispersion: 0.7
                    }
                };            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    if (data[i + 3] > 0) {
                        // enhanced local paper properties simulation
                        const noiseValue = noise2D[y * width + x];
                        const localFibers = (Math.sin(x * 0.1) * Math.sin(y * 0.1) + 1) * 0.5;
                        const fiberAlignment = Math.abs(Math.cos(x * 0.05 + y * 0.05));
                        
                        // complex ink physics simulation with 3D perspective
                        const localDepth = depthMap[y * width + x];
                        const localGradientX = gradientX[y * width + x];
                        const localGradientY = gradientY[y * width + x];
                        
                        // calculate 3D perspective transformation
                        const perspectiveStrength = 0.15;
                        const zDistance = 1000; // Base distance from viewer
                        const perspectiveX = (x - width/2) / zDistance * (localDepth + 1);
                        const perspectiveY = (y - height/2) / zDistance * (localDepth + 1);
                        
                        // enhanced ink physics with Navier-Stokes inspired simulation
                        const surfaceAngle = Math.atan2(localGradientY, localGradientX);
                        const surfaceSteepness = Math.sqrt(localGradientX * localGradientX + localGradientY * localGradientY);
                        
                        // advanced fluid dynamics simulation
                        const fluidDynamics = {
                            reynolds: (1 - inkProperties.viscosity) * 1000,
                            weber: inkProperties.surfaceTension * 100,
                            ohnesorge: inkProperties.viscosity / Math.sqrt(inkProperties.density * inkProperties.surfaceTension * inkProperties.characteristicLength),
                            marangoni: 0.2 + 0.1 * Math.sin(x * 0.1) * Math.cos(y * 0.1), // Surface tension gradients
                            bondNumber: 9.81 * inkProperties.density * Math.pow(inkProperties.characteristicLength, 2) / inkProperties.surfaceTension
                        };
                        
                        // calculate advanced capillary effects
                        const capillaryLength = Math.sqrt(inkProperties.surfaceTension / (inkProperties.particleProperties.density * 9.81));
                        const capillaryNumber = fluidDynamics.reynolds / fluidDynamics.weber;
                        const spreadingParameter = inkProperties.surfaceTension * (1 - Math.cos(inkProperties.capillary.contactAngle * (Math.PI / 180)));
                        
                        // simulate ink spreading dynamics
                        const viscousForce = Math.exp(-fluidDynamics.reynolds * 0.01);
                        const surfaceTensionForce = (1 - Math.exp(-fluidDynamics.weber * 0.1));
                        const capillaryForce = Math.pow(inkProperties.capillary.spreadRate, 0.3);
                        
                        // paper-ink interaction
                        const contactAngleRad = inkProperties.capillary.contactAngle * (Math.PI / 180);
                        const spreadFactor = Math.cos(contactAngleRad) * inkProperties.capillary.porosity;
                        
                        // fiber interaction
                        const fiberEffect = (1 - inkProperties.viscosity * localFibers) * 
                                         Math.pow(fiberAlignment, inkProperties.rheology.elasticity);
                        
                        // time-dependent drying effects
                        const dryingPhase = Math.random(); // Simulate different drying stages
                        const evaporationRate = inkProperties.drying.evaporationProfile.initial * (1 - dryingPhase) +
                                             inkProperties.drying.evaporationProfile.final * dryingPhase;
                        
                        // combined ink diffusion with all physics components
                        const inkDiffusion = Math.pow(noiseValue, 1.5) * 
                            amount * effectStrength * 
                            fiberEffect * 
                            (viscousForce + surfaceTensionForce * spreadFactor) *
                            capillaryForce *
                            Math.exp(-evaporationRate) *
                            (1 + surfaceSteepness * inkProperties.rheology.shearThinning) * 
                            (1 - Math.exp(-inkProperties.absorption * 5));
                            
                        // apply 3D perspective distortion
                        const perspectiveDistortion = 1 + (perspectiveX * perspectiveX + perspectiveY * perspectiveY) * perspectiveStrength;
                        
                        // simulate ink spreading with 3D effects
                        const spread = Math.max(0, Math.min(1, data[i + 3] / 255));
                        const inkBleed = Math.pow(spread, 1.2) * inkDiffusion;
                        
                        // apply realistic ink variation
                        for (let c = 0; c < 3; c++) {
                            const channelNoise = (noiseValue - 0.5) * 255 * inkBleed;
                            data[i + c] = Math.min(255, Math.max(0, data[i + c] + channelNoise));
                        }
                        
                                        for (let c = 0; c < 3; c++) {
                            const channelNoise = (noise2D[y * width + x] - 0.5) * 255 * inkBleed;
                            data[i + c] = Math.min(255, Math.max(0, data[i + c] + channelNoise));
                        }
                        
                        // simulate ink density variation
                        data[i + 3] = Math.min(255, Math.max(0, data[i + 3] - Math.abs(inkBleed * 20)));
                    }
                }
            }
            
            // enhanced multi-stage convolution for realistic ink spread
            const stages = [
                { radius: Math.max(1, Math.floor(amount * 2)), sigma: 0.8, weight: 0.4 },  // Fine details
                { radius: Math.max(1, Math.floor(amount * 3)), sigma: 1.5, weight: 0.35 }, // Medium spread
                { radius: Math.max(1, Math.floor(amount * 4)), sigma: 2.2, weight: 0.25 }  // Wide diffusion
            ];

            // apply multi-stage convolution with different kernels
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) {
                tempData[i] = data[i];
            }

            for (const stage of stages) {
                const kernel = createGaussianKernel(stage.radius, stage.sigma);
                applyConvolution(tempData, width, height, kernel);
                
                // blend results with original using stage weight
                for (let i = 0; i < data.length; i++) {
                    data[i] = data[i] * (1 - stage.weight) + tempData[i] * stage.weight;
                }
            }

            // apply non-linear contrast enhancement for ink edges
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] > 0) {  // Only process non-transparent pixels
                    for (let c = 0; c < 3; c++) {
                        const value = data[i + c] / 255;
                        const enhanced = Math.pow(value, 0.95); // Subtle contrast boost
                        data[i + c] = Math.min(255, Math.max(0, enhanced * 255));
                    }
                }
            }
            
            ctx.putImageData(imageData, 0, 0);
        }
        
        function createGaussianKernel(radius, sigma) {
            const size = radius * 2 + 1;
            const kernel = new Array(size * size);
            let sum = 0;
            
            for (let y = -radius; y <= radius; y++) {
                for (let x = -radius; x <= radius; x++) {
                    const exp = -(x * x + y * y) / (2 * sigma * sigma);
                    const value = Math.exp(exp) / (2 * Math.PI * sigma * sigma);
                    kernel[(y + radius) * size + (x + radius)] = value;
                    sum += value;
                }
            }
            
            // kernel
            for (let i = 0; i < kernel.length; i++) {
                kernel[i] /= sum;
            }
            
            return kernel;
        }
        
        function applyConvolution(data, width, height, kernel) {
            const radius = Math.floor(Math.sqrt(kernel.length) / 2);
            const size = radius * 2 + 1;
            const temp = new Uint8ClampedArray(data.length);
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    let r = 0, g = 0, b = 0, a = 0;
                    
                    for (let ky = -radius; ky <= radius; ky++) {
                        for (let kx = -radius; kx <= radius; kx++) {
                            const px = Math.min(width - 1, Math.max(0, x + kx));
                            const py = Math.min(height - 1, Math.max(0, y + ky));
                            const ki = (ky + radius) * size + (kx + radius);
                            const pi = (py * width + px) * 4;
                            
                            r += data[pi] * kernel[ki];
                            g += data[pi + 1] * kernel[ki];
                            b += data[pi + 2] * kernel[ki];
                            a += data[pi + 3] * kernel[ki];
                        }
                    }
                    
                    temp[i] = r;
                    temp[i + 1] = g;
                    temp[i + 2] = b;
                    temp[i + 3] = a;
                }
            }
            
            for (let i = 0; i < data.length; i++) {
                data[i] = temp[i];
            }
        }


        // prepare text and paper pixel data
        const paperImageData = bgCtx.getImageData(0, 0, image.width, image.height);
        const textImageData = textCtx.getImageData(0, 0, image.width, image.height);
        const paperData = paperImageData.data;
        const textData = textImageData.data;

        // apply 3D paper deformation effects
        const { depthMap, gradientX, gradientY } = analyze3DPaperDeformation(paperData, image.width, image.height);
        
        // apply displacement mapping based on depth
        const displacementCanvas = createCanvas(image.width, image.height);
        const displacementCtx = displacementCanvas.getContext('2d');
        displacementCtx.drawImage(textCanvas, 0, 0);
        
        for(let y = 0; y < image.height; y++) {
            for(let x = 0; x < image.width; x++) {
                const depth = depthMap[y * image.width + x];
                const offsetX = gradientX[y * image.width + x] * depth * 2;
                const offsetY = gradientY[y * image.width + x] * depth * 2;
                
                if(depth > 0.01) {
                    displacementCtx.drawImage(
                        textCanvas,
                        x, y, 1, 1,
                        x + offsetX, y + offsetY, 1, 1
                    );
                }
            }
        }
        
        textCtx.clearRect(0, 0, image.width, image.height);
        textCtx.drawImage(displacementCanvas, 0, 0);

        // bounding box detection for adaptive noise
        let minX = image.width;
        let minY = image.height;
        let maxX = 0;
        let maxY = 0;
        for (let i = 0; i < textData.length; i += 4) {
            if (textData[i + 3] > 0) {
                const x = (i / 4) % image.width;
                const y = Math.floor((i / 4) / image.width);
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        // add 2px margin to bounding box
        minX = Math.max(0, minX - 2);
        minY = Math.max(0, minY - 2);
        maxX = Math.min(image.width - 1, maxX + 2);
        maxY = Math.min(image.height - 1, maxY + 2);

        // adaptive noise: based on local paper contrast/brightness
        // sample from center of text bounding box
        let noiseSampleX = Math.floor((minX + maxX) / 2);
        let noiseSampleY = Math.floor((minY + maxY) / 2);
        let localStats = getLocalStats(noiseSampleX, noiseSampleY, 7, image.width, image.height, paperData);
        let baseNoise = 0.10;
        let contrastNorm = (localStats.std[0] + localStats.std[1] + localStats.std[2]) / 3 / 128;
        let lumNorm = localStats.lum / 255;
        // less noise on bright/contrasty paper, more on dark/homogeneous
        let noiseAmountAdaptive = baseNoise * (0.8 + 0.5 * (1 - contrastNorm)) * (0.9 + 0.3 * (1 - lumNorm));
        addNoiseToCanvas(textCtx, image.width, image.height, noiseAmountAdaptive * 0.5);


        // multiply blend: put text onto paper (reuse bounding box)
        const smallTextCanvas = createCanvas(image.width, image.height);
        const smallTextCtx = smallTextCanvas.getContext('2d');
        smallTextCtx.imageSmoothingEnabled = false;
        // use previously declared paperimagedata and textimagedata

        // local paper analysis, soft shadow, texture, color shift
        // adaptive chunk size based on font size
        let chunkSize = Math.round(fontSizePx * 0.13);
        if (chunkSize < 2) chunkSize = 2;
        if (chunkSize > 8) chunkSize = 8;
        // soft shadow layer (canvas)
        const shadowLayer = createCanvas(image.width, image.height);
        const shadowCtx2 = shadowLayer.getContext('2d');
        shadowCtx2.clearRect(0, 0, image.width, image.height);
        // local paper texture stats function
        function getLocalStats(x, y, radius = 7) {
            // stats
            let sum = [0, 0, 0], sum2 = [0, 0, 0], n = 0;
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    let xx = x + dx, yy = y + dy;
                    if (xx < 0 || xx >= image.width || yy < 0 || yy >= image.height) continue;
                    let idx = (yy * image.width + xx) * 4;
                    for (let c = 0; c < 3; c++) {
                        sum[c] += paperData[idx + c];
                        sum2[c] += paperData[idx + c] * paperData[idx + c];
                    }
                    n++;
                }
            }
            let avg = sum.map(v => v / n);
            let std = sum2.map((v, c) => Math.sqrt(v / n - avg[c] * avg[c]));
            let lum = 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2];
            return { avg, std, lum };
        }
        // (shadow/outline logic moved below, inside if (softOutline) block)
        if (typeof softOutline === 'undefined' || softOutline) {
            for (let cy = minY; cy <= maxY; cy += chunkSize) {
                for (let cx = minX; cx <= maxX; cx += chunkSize) {
                    // random offset for chunk position (avoid grid look)
                    const offsetX = Math.floor((Math.random() - 0.5) * 1.5);
                    const offsetY = Math.floor((Math.random() - 0.5) * 1.5);
                    // find chunk center: pixel with highest alpha
                    let maxAlpha = 0;
                    let centerX = cx + Math.floor(chunkSize / 2) + offsetX;
                    let centerY = cy + Math.floor(chunkSize / 2) + offsetY;
                    for (let y = cy; y < cy + chunkSize && y <= maxY; y++) {
                        for (let x = cx; x < cx + chunkSize && x <= maxX; x++) {
                            const idx = (y * image.width + x) * 4;
                            if (textData[idx + 3] > maxAlpha) {
                                maxAlpha = textData[idx + 3];
                                centerX = x;
                                centerY = y;
                            }
                        }
                    }
                    if (maxAlpha === 0) continue; // skip if no non-transparent pixel
                    const centerIdx = (centerY * image.width + centerX) * 4;
                    // paper pixel rgb at center
                    const r = paperData[centerIdx];
                    const g = paperData[centerIdx + 1];
                    const b = paperData[centerIdx + 2];
                    // local paper stats
                    function getAnnulusStats(cx, cy, radii) {
                        let samples = [];
                        for (let rIdx = 0; rIdx < radii.length - 1; rIdx++) {
                            let rIn = radii[rIdx], rOut = radii[rIdx + 1];
                            for (let a = 0; a < 360; a += 8) {
                                let rad = a * Math.PI / 180;
                                let rMid = (rIn + rOut) / 2 + (Math.random() - 0.5) * 0.3;
                                let x = Math.round(cx + Math.cos(rad) * rMid);
                                let y = Math.round(cy + Math.sin(rad) * rMid);
                                if (x >= 0 && x < image.width && y >= 0 && y < image.height) {
                                    let idx = (y * image.width + x) * 4;
                                    samples.push([
                                        paperData[idx],
                                        paperData[idx + 1],
                                        paperData[idx + 2]
                                    ]);
                                }
                            }
                        }
                        if (samples.length < 8) return { avg: [128,128,128], std: [0,0,0], lum: 128 };
                        let lums = samples.map(s => 0.2126*s[0]+0.7152*s[1]+0.0722*s[2]);
                        let sorted = lums.slice().sort((a,b)=>a-b);
                        let minLum = sorted[Math.floor(samples.length*0.1)];
                        let maxLum = sorted[Math.floor(samples.length*0.9)];
                        let filtered = samples.filter((s,i) => lums[i]>=minLum && lums[i]<=maxLum);
                        let avg = [0,0,0], std = [0,0,0];
                        for (let c=0;c<3;c++) {
                            let vals = filtered.map(s=>s[c]);
                            let mean = vals.reduce((a,b)=>a+b,0)/vals.length;
                            avg[c]=mean;
                            std[c]=Math.sqrt(vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/vals.length);
                        }
                        let lum = 0.2126*avg[0]+0.7152*avg[1]+0.0722*avg[2];
                        return { avg, std, lum };
                    }
                                        function getAnnulusStats(cx, cy, radii) {
                        const stats = {
                            avg: [0, 0, 0],
                            std: [0, 0, 0],
                            lum: 0,
                            count: 0
                        };
                        
                        for (let ri = 0; ri < radii.length - 1; ri++) {
                            const innerR = radii[ri];
                            const outerR = radii[ri + 1];
                            
                            for (let dy = -outerR; dy <= outerR; dy++) {
                                for (let dx = -outerR; dx <= outerR; dx++) {
                                    const r = Math.sqrt(dx * dx + dy * dy);
                                    if (r < innerR || r > outerR) continue;
                                    
                                    const px = Math.min(Math.max(0, cx + dx), image.width - 1);
                                    const py = Math.min(Math.max(0, cy + dy), image.height - 1);
                                    const idx = (py * image.width + px) * 4;
                                    
                                    for (let c = 0; c < 3; c++) {
                                        stats.avg[c] += paperData[idx + c];
                                    }
                                    stats.lum += (paperData[idx] * 0.299 + paperData[idx + 1] * 0.587 + paperData[idx + 2] * 0.114);
                                    stats.count++;
                                }
                            }
                        }
                        
                        if (stats.count > 0) {
                            for (let c = 0; c < 3; c++) {
                                stats.avg[c] /= stats.count;
                            }
                            stats.lum /= stats.count;
                        }
                        
                        return stats;
                    }
                    const local = getAnnulusStats(centerX, centerY, [6,10,16]);
                    // text pixel rgb at center
                    let tr = textData[centerIdx];
                    let tg = textData[centerIdx + 1];
                    let tb = textData[centerIdx + 2];
                    // rgb to hsl
                    function rgbToHsl(r, g, b) {
                        r /= 255; g /= 255; b /= 255;
                        let max = Math.max(r, g, b), min = Math.min(r, g, b);
                        let h, s, l = (max + min) / 2;
                        if (max === min) {
                            h = s = 0;
                        } else {
                            let d = max - min;
                            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                            switch (max) {
                                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                                case g: h = (b - r) / d + 2; break;
                                case b: h = (r - g) / d + 4; break;
                            }
                            h /= 6;
                        }
                        return { h, s, l };
                    }
                    function hslToRgb(h, s, l) {
                        let r, g, b;
                        if (s === 0) {
                            r = g = b = l;
                        } else {
                            function hue2rgb(p, q, t) {
                                if (t < 0) t += 1;
                                if (t > 1) t -= 1;
                                if (t < 1/6) return p + (q - p) * 6 * t;
                                if (t < 1/2) return q;
                                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                                return p;
                            }
                            let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                            let p = 2 * l - q;
                            r = hue2rgb(p, q, h + 1/3);
                            g = hue2rgb(p, q, h);
                            b = hue2rgb(p, q, h - 1/3);
                        }
                        return {
                            r: Math.round(r * 255),
                            g: Math.round(g * 255),
                            b: Math.round(b * 255)
                        };
                    }
                    // hsl manipulation: lightness, saturation, color shift, contrast
                    let hsl = rgbToHsl(tr, tg, tb);
                    // adjust to paper brightness, contrast, color shift
                    let paperLum = local.lum;
                    let contrast = (local.std[0] + local.std[1] + local.std[2]) / 3 / 128;
                    let colorShift = (local.avg[0] - r + local.avg[1] - g + local.avg[2] - b) / 3 / 255;
                    hsl.l = hsl.l * (0.80 + (paperLum / 255) * 0.32) + (Math.random() - 0.5) * 0.05;
                    hsl.s = Math.max(0, Math.min(1, hsl.s * (0.93 + contrast * 0.12 + (Math.random() - 0.5) * 0.08)));
                    hsl.h = hsl.h + colorShift * 0.04;
                    let rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
                    // soft shadow: faint blurred shadow around chunk
                    for (let y = cy; y < cy + chunkSize && y <= maxY; y++) {
                        for (let x = cx; x < cx + chunkSize && x <= maxX; x++) {
                            const i = (y * image.width + x) * 4;
                            if (textData[i + 3] === 0) continue;
                            // distance from chunk center = soften
                            let dist = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
                            // blending: stronger on bright/contrasty paper
                            let blendBase = 1 - dist / (chunkSize * 0.8);
                            let blend = Math.max(0.6, blendBase * (0.85 + 0.25 * (local.lum / 255)) * (0.9 + 0.2 * contrast));
                            textData[i] = Math.round(rgb.r * blend + textData[i] * (1 - blend) + (Math.random() - 0.5) * 1);
                            textData[i + 1] = Math.round(rgb.g * blend + textData[i + 1] * (1 - blend) + (Math.random() - 0.5) * 1);
                            textData[i + 2] = Math.round(rgb.b * blend + textData[i + 2] * (1 - blend) + (Math.random() - 0.5) * 1);
                            // alpha: stronger in center, weaker at edge
                            let baseA = textData[i + 3];
                            textData[i + 3] = Math.max(0, Math.min(255, baseA * blend + (Math.random() - 0.5) * 8));

                            // --- adaptive shadow/outline ---
                            let localContrast = (local.std[0]+local.std[1]+local.std[2])/3/128;
                            let shadowStrength = 0.11 + 0.04 * contrast + 0.03 * (local.lum / 255);
                            let edgeFalloff = Math.max(0, 1 - dist / (chunkSize * 1.25));
                            let textureFactor = Math.max(0, 1 - localContrast * 1.2);
                            let baseAlpha = Math.max(0, 1.2 * blend * (1 - baseA / 255) * shadowStrength * edgeFalloff * textureFactor);
                            let shadowLum = local.lum / 255;
                            let blurSteps = 12;
                            let minRadius = -0.7;
                            let maxRadius = 2.7;
                            let minAlpha = 0.008;
                            for (let blurStep = 0; blurStep < blurSteps; blurStep++) {
                                let t = blurStep / (blurSteps - 1);
                                let radius = minRadius + t * (maxRadius - minRadius) + Math.random() * 0.05;
                                if (radius < 0) radius = 0;
                                let falloff = t < 0.5
                                    ? Math.pow(1 - t, 2.5)
                                    : Math.pow(1 - t, 1.1);
                                let stepAlpha = baseAlpha * falloff;
                                let contrastFactor = Math.max(0, 1 - contrast * 1.3);
                                let finalAlpha = stepAlpha * contrastFactor;
                                if (finalAlpha < minAlpha) continue;
                                // blend text color with background for smooth edge
                                let blendT = 0.5 + 0.5 * t;
                                let r = Math.round(local.avg[0] * blendT + rgb.r * (1 - blendT));
                                let g = Math.round(local.avg[1] * blendT + rgb.g * (1 - blendT));
                                let b = Math.round(local.avg[2] * blendT + rgb.b * (1 - blendT));
                                let shadowColor;
                                if (shadowLum > 0.6) {
                                    shadowColor = `rgba(${r},${g},${b},${finalAlpha / 255 * 0.13 * (1-t)})`;
                                } else if (shadowLum < 0.25) {
                                    shadowColor = `rgba(${r},${g},${b},${finalAlpha / 255 * 0.07 * (1-t)})`;
                                } else {
                                    shadowColor = `rgba(${r},${g},${b},${finalAlpha / 255 * 0.09 * (1-t)})`;
                                }
                                shadowCtx2.fillStyle = shadowColor;
                                shadowCtx2.beginPath();
                                shadowCtx2.arc(x + 0.5, y + 0.5, radius, 0, 2 * Math.PI);
                                shadowCtx2.fill();
                            }
                        }
                    }
                }
            }
        }
        bgCtx.globalAlpha = 0.09 * effectStrength;
        bgCtx.drawImage(shadowLayer, 0, 0);
        bgCtx.restore();
        textCtx.putImageData(textImageData, 0, 0);
        smallTextCtx.globalCompositeOperation = 'multiply';
        smallTextCtx.drawImage(textCanvas, 0, 0, image.width, image.height);

        let blurAmount = config.blur && config.blur > 0 ? config.blur : 0;
        let noiseAmount = config.noise && config.noise > 0 ? config.noise : 0;
        let processedBuffer;
        let jimpImg;
        // jimp
        if (quality < 1) {
            const smallW = Math.max(1, Math.round(image.width * quality));
            const smallH = Math.max(1, Math.round(image.height * quality));
            const tmpCanvas = createCanvas(smallW, smallH);
            const tmpCtx = tmpCanvas.getContext('2d');
            tmpCtx.drawImage(smallTextCanvas, 0, 0, smallW, smallH);
            const finalCanvas = createCanvas(image.width, image.height);
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.imageSmoothingEnabled = false;
            finalCtx.drawImage(tmpCanvas, 0, 0, image.width, image.height);
            jimpImg = await Jimp.read(finalCanvas.toBuffer('image/png'));
        } else {
            jimpImg = await Jimp.read(smallTextCanvas.toBuffer('image/png'));
        }
        if (blurAmount > 0) {
            const blurInt = Math.floor(blurAmount);
            const blurFrac = blurAmount - blurInt;
            if (blurFrac === 0) {
                if (blurInt > 0) jimpImg.blur(blurInt);
            } else {
                const jimpImg2 = jimpImg.clone();
                if (blurInt > 0) jimpImg.blur(blurInt);
                jimpImg2.blur(blurInt + 1);
                jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function (x, y, idx) {
                    for (let c = 0; c < 4; c++) {
                        this.bitmap.data[idx + c] =
                            this.bitmap.data[idx + c] * (1 - blurFrac) +
                            jimpImg2.bitmap.data[idx + c] * blurFrac;
                    }
                });
            }
        }
        if (pixelate > 1) {
            const w = jimpImg.bitmap.width;
            const h = jimpImg.bitmap.height;
            const scale = 1 / pixelate;
            jimpImg.resize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)), Jimp.RESIZE_NEAREST_NEIGHBOR);
            jimpImg.resize(w, h, Jimp.RESIZE_NEAREST_NEIGHBOR);
        }
        if (noiseAmount > 0 && typeof jimpImg.addNoise === 'function') {
            jimpImg.addNoise(noiseAmount);
        }
        const paperBuffer = fs.readFileSync(imagePath);
        let paperJimp;
        if (typeof Jimp.read === 'function') {
            paperJimp = await Jimp.read(paperBuffer);
        } else {
            paperJimp = await Jimp(paperBuffer);
        }
        if (config.ghost) {
            const ghost = jimpImg.clone();
            ghost.blur(2);
            ghost.opacity(0);
            paperJimp.composite(ghost, 3, 3);
        }
        paperJimp.composite(jimpImg, 0, 0);
        // randomized texture overlay if not set in config
        let textureFile = config.texture;
        if (!textureFile) {
            // find all papertexture images in images folder
            const imageDir = path.join(__dirname, '../images');
            const allFiles = fs.readdirSync(imageDir);
            const textureCandidates = allFiles.filter(f => f.toLowerCase().includes('papertexture') && (f.endsWith('.png') || f.endsWith('.jpg')));
            if (textureCandidates.length > 0) {
                textureFile = textureCandidates[Math.floor(Math.random() * textureCandidates.length)];
            }
        }
        if (textureFile) {
            const texturePath = path.join(__dirname, '../images', textureFile);
            if (fs.existsSync(texturePath)) {
                let textureJimp;
                if (typeof Jimp.read === 'function') {
                    textureJimp = await Jimp.read(texturePath);
                } else {
                    textureJimp = await Jimp(texturePath);
                }
                textureJimp.resize(paperJimp.bitmap.width, paperJimp.bitmap.height);
                const overlayAlpha = 0.09 * effectStrength;
                textureJimp.opacity(overlayAlpha);
                const width = jimpImg.bitmap.width;
                const height = jimpImg.bitmap.height;
                for (let i = 0; i < width * height; i++) {
                    const idx = i << 2;
                    const alpha = jimpImg.bitmap.data[idx + 3];
                    if (alpha > 0) {
                        for (let c = 0; c < 3; c++) {
                            paperJimp.bitmap.data[idx + c] = Math.round(
                                paperJimp.bitmap.data[idx + c] * (1 - overlayAlpha) + textureJimp.bitmap.data[idx + c] * overlayAlpha
                            );
                        }
                    }
                }
            }
        }
        // output to discord
        const buffer = await paperJimp.getBufferAsync(Jimp.MIME_JPEG);
        const minNum = 1452;
        const maxNum = 6435;
        const randNum = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
        const fileName = `IMG_${randNum}.jpg`;
        const attachment = new AttachmentBuilder(buffer, { name: fileName });
        const userMention = `<@${interaction.user.id}>`;
        const executionTime = Math.round(performance.now() - startTime);
        const infoMsg = `> ${userMention} we made your fansign in ${executionTime}ms\n` +
            `> Style: \`${styleName}\` Text: \`${text}\` Font: \`${selectedFont.replace('.ttf','')}\` \n` +
            `-# We do not store or log any user requests.\n`;
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const configPath = path.join(__dirname, '../config/config.json');
        const appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        let version = appConfig.version || '';
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('version')
                .setLabel(`${version}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        );

        await interaction.editReply({ content: infoMsg, files: [attachment], components: [row] });
        
        // update global cooldown
        globalCooldown.set('global', Date.now());
        } finally {
            concurrencyManager.decrementProcessing();
        }
    }
}