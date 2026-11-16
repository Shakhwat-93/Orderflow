/**
 * Code 128 Barcode Generator
 * ──────────────────────────
 * 100% self-contained, pure TypeScript implementation.
 * Zero external libraries or CDNs required.
 * Generates high-density vector SVG strings and data URLs suitable for
 * thermal printers (80mm / 100mm) and high-DPI displays.
 */

// Code 128 pattern table (patterns for characters 0-106)
// Each number string represents bar and space widths (total width = 11 modules, except stop = 13)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'                               // 100-106 (106 is Stop)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

export interface BarcodeOptions {
  width?: number;       // Module bar width in pixels (default 2)
  height?: number;      // Height of bars in pixels (default 60)
  includeText?: boolean;// Whether to render human-readable text below bars (default true)
  fontSize?: number;    // Font size for text (default 12)
  margin?: number;      // Quiet zone margin in pixels (default 10)
  color?: string;       // Bar color (default #000000)
  background?: string;  // Background color (default #ffffff)
}

/**
 * Encode an ASCII string into Code 128 (Code Set B) pattern widths
 */
function encodeCode128B(text: string): { patterns: string[]; checkSum: number } {
  const codes: number[] = [START_CODE_B];
  let checkSumSum = START_CODE_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    // Code Set B ASCII values are mapped from 32 (space) to 127
    let val = charCode - 32;
    if (val < 0 || val > 95) val = 0; // fallback to space
    codes.push(val);
    checkSumSum += val * (i + 1);
  }

  const checkDigit = checkSumSum % 103;
  codes.push(checkDigit);
  codes.push(STOP_CODE);

  const patterns = codes.map((c) => CODE128_PATTERNS[c]);
  return { patterns, checkSum: checkDigit };
}

/**
 * Generate a complete SVG element string for a Code 128 barcode
 */
export function generateCode128Svg(
  text: string,
  options: BarcodeOptions = {}
): string {
  const {
    width = 2,
    height = 54,
    includeText = true,
    fontSize = 11,
    margin = 8,
    color = '#000000',
    background = '#ffffff',
  } = options;

  const cleanText = text.trim();
  const { patterns } = encodeCode128B(cleanText);

  // Measure total modules
  let totalModules = 0;
  for (const pat of patterns) {
    for (let j = 0; j < pat.length; j++) {
      totalModules += parseInt(pat[j], 10);
    }
  }

  const svgWidth = totalModules * width + margin * 2;
  const textHeight = includeText ? fontSize + 4 : 0;
  const svgHeight = height + textHeight + margin * 2;

  let currentX = margin;
  const rects: string[] = [];

  for (const pat of patterns) {
    for (let j = 0; j < pat.length; j++) {
      const w = parseInt(pat[j], 10) * width;
      const isBar = j % 2 === 0; // Even indices are bars, odd are spaces
      if (isBar) {
        rects.push(
          `<rect x="${currentX}" y="${margin}" width="${w}" height="${height}" fill="${color}" shape-rendering="crispEdges"/>`
        );
      }
      currentX += w;
    }
  }

  const textSvg = includeText
    ? `<text x="${svgWidth / 2}" y="${margin + height + fontSize + 2}" font-family="'Consolas', 'Courier New', monospace" font-size="${fontSize}" font-weight="bold" fill="${color}" text-anchor="middle" letter-spacing="1.5">${cleanText}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <rect width="${svgWidth}" height="${svgHeight}" fill="${background}"/>
  ${rects.join('\n  ')}
  ${textSvg}
</svg>`;
}

/**
 * Generate a Base64 data URL for direct embedding in <img src="..." />
 */
export function generateCode128DataUrl(
  text: string,
  options: BarcodeOptions = {}
): string {
  const svg = generateCode128Svg(text, options);
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
  }
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}
