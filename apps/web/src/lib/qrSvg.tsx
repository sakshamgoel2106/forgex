/**
 * ForgeX AI - Standalone SVG QR Code Generator
 * Pure TypeScript implementation of ISO/IEC 18004 QR Code Matrix Generator.
 * Zero external dependencies. Generates crisp, scannable SVGs and DataURLs.
 */
import React, { useMemo } from 'react';

// Galois Field GF(256) tables for QR polynomial math
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    LOG_TABLE[val] = i;
    val <<= 1;
    if (val & 0x100) {
      val ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

function polyMul(p1: any, p2: any): any {
  const res = new Uint8Array(p1.length + p2.length - 1);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      res[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return res;
}

function polyMod(dividend: any, divisor: any): any {
  const result = new Uint8Array(dividend);
  const divLen = divisor.length;
  for (let i = 0; i <= result.length - divLen; i++) {
    const coef = result[i];
    if (coef !== 0) {
      for (let j = 0; j < divLen; j++) {
        result[i + j] ^= gfMul(divisor[j], coef);
      }
    }
  }
  return result.slice(result.length - divLen + 1);
}

function getGeneratorPoly(ecLength: number): any {
  let poly: any = new Uint8Array([1]);
  for (let i = 0; i < ecLength; i++) {
    poly = polyMul(poly, new Uint8Array([1, EXP_TABLE[i]]));
  }
  return poly;
}

// Version table: [version, totalCodewords, ecCodewordsPerBlock, numBlocks]
// Using Error Correction Level M for strong industrial camera readability
interface QrVersionSpec {
  version: number;
  size: number;
  totalDataCodewords: number;
  ecCodewordsPerBlock: number;
  blocks: { numBlocks: number; dataCodewords: number }[];
  alignmentCoords: number[];
}

const QR_VERSIONS: QrVersionSpec[] = [
  {
    version: 1,
    size: 21,
    totalDataCodewords: 16,
    ecCodewordsPerBlock: 10,
    blocks: [{ numBlocks: 1, dataCodewords: 16 }],
    alignmentCoords: [],
  },
  {
    version: 2,
    size: 25,
    totalDataCodewords: 28,
    ecCodewordsPerBlock: 16,
    blocks: [{ numBlocks: 1, dataCodewords: 28 }],
    alignmentCoords: [6, 18],
  },
  {
    version: 3,
    size: 29,
    totalDataCodewords: 44,
    ecCodewordsPerBlock: 26,
    blocks: [{ numBlocks: 1, dataCodewords: 44 }],
    alignmentCoords: [6, 22],
  },
  {
    version: 4,
    size: 33,
    totalDataCodewords: 64,
    ecCodewordsPerBlock: 18,
    blocks: [{ numBlocks: 2, dataCodewords: 32 }],
    alignmentCoords: [6, 26],
  },
  {
    version: 5,
    size: 37,
    totalDataCodewords: 86,
    ecCodewordsPerBlock: 24,
    blocks: [{ numBlocks: 2, dataCodewords: 43 }],
    alignmentCoords: [6, 30],
  },
  {
    version: 6,
    size: 41,
    totalDataCodewords: 108,
    ecCodewordsPerBlock: 16,
    blocks: [{ numBlocks: 4, dataCodewords: 27 }],
    alignmentCoords: [6, 34],
  },
  {
    version: 7,
    size: 45,
    totalDataCodewords: 124,
    ecCodewordsPerBlock: 18,
    blocks: [{ numBlocks: 4, dataCodewords: 31 }],
    alignmentCoords: [6, 22, 38],
  },
  {
    version: 8,
    size: 49,
    totalDataCodewords: 154,
    ecCodewordsPerBlock: 22,
    blocks: [
      { numBlocks: 2, dataCodewords: 38 },
      { numBlocks: 2, dataCodewords: 39 },
    ],
    alignmentCoords: [6, 24, 42],
  },
];

/**
 * Encodes text into QR matrix
 */
export function encodeQrCode(text: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const dataLen = utf8Bytes.length;

  // Pick smallest fitting version
  const spec = QR_VERSIONS.find((v) => v.totalDataCodewords >= dataLen + 3) || QR_VERSIONS[QR_VERSIONS.length - 1];

  // 1. Bit Buffer: Mode (4 bits: 0100 for Byte) + Count (8 or 16 bits) + Data
  const bits: number[] = [0, 1, 0, 0]; // 8-bit byte mode
  const countBits = spec.version < 10 ? 8 : 16;
  for (let i = countBits - 1; i >= 0; i--) {
    bits.push((dataLen >> i) & 1);
  }
  for (let i = 0; i < dataLen; i++) {
    const b = utf8Bytes[i];
    for (let j = 7; j >= 0; j--) {
      bits.push((b >> j) & 1);
    }
  }

  // 2. Terminator (up to 4 zero bits)
  const capacityBits = spec.totalDataCodewords * 8;
  const termLen = Math.min(4, capacityBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);

  // Pad to multiple of 8
  while (bits.length % 8 !== 0) bits.push(0);

  // 3. Convert to bytes and pad with 0xEC, 0x11
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) {
      byteVal = (byteVal << 1) | bits[i + j];
    }
    dataBytes.push(byteVal);
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < spec.totalDataCodewords) {
    dataBytes.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // 4. Split into blocks and compute error correction
  const blocksData: Uint8Array[] = [];
  const blocksEc: Uint8Array[] = [];
  const genPoly = getGeneratorPoly(spec.ecCodewordsPerBlock);

  let offset = 0;
  for (const group of spec.blocks) {
    for (let b = 0; b < group.numBlocks; b++) {
      const slice = new Uint8Array(dataBytes.slice(offset, offset + group.dataCodewords));
      blocksData.push(slice);
      offset += group.dataCodewords;

      // Calculate EC
      const padded = new Uint8Array(group.dataCodewords + spec.ecCodewordsPerBlock);
      padded.set(slice);
      const ec = polyMod(padded, genPoly);
      blocksEc.push(ec);
    }
  }

  // 5. Interleave codewords
  const finalCodewords: number[] = [];
  const maxDataLen = Math.max(...blocksData.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocksData) {
      if (i < b.length) finalCodewords.push(b[i]);
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i++) {
    for (const ec of blocksEc) {
      finalCodewords.push(ec[i]);
    }
  }

  // 6. Build matrix
  const size = spec.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      isFunction[r][c] = true;
    }
  };

  // Place Finder Patterns
  const placeFinder = (startR: number, startC: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = startR + r;
        const col = startC + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          setModule(row, col, isBlack);
        } else {
          // Separator
          setModule(row, col, false);
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const coords = spec.alignmentCoords;
  for (const r of coords) {
    for (const c of coords) {
      if (isFunction[r][c]) continue; // Skip if collides with finder
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isBlack = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setModule(r + dr, c + dc, isBlack);
        }
      }
    }
  }

  // Dark module
  setModule(4 * spec.version + 9, 8, true);

  // Reserve format information areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunction[8][i] = true;
      isFunction[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = true;
    isFunction[size - 1 - i][8] = true;
  }

  // 7. Place data bits (Mask 0: (row + col) % 2 === 0)
  const bitArray: number[] = [];
  for (const cw of finalCodewords) {
    for (let b = 7; b >= 0; b--) {
      bitArray.push((cw >> b) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing line
    const rows = [];
    for (let r = 0; r < size; r++) rows.push(r);
    if (upwards) rows.reverse();

    for (const r of rows) {
      for (let c = right; c >= right - 1; c--) {
        if (!isFunction[r][c]) {
          let bit = bitIdx < bitArray.length ? bitArray[bitIdx++] : 0;
          // Apply mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            bit ^= 1;
          }
          matrix[r][c] = bit === 1;
        }
      }
    }
    upwards = !upwards;
  }

  // Format bits: Level M (00) + Mask 0 (000) -> 00000 + ECC bits = 0x5412 (101010000010010)
  const formatBits = 0x5412; // Standard masked format bits for Level M, Mask 0
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> (14 - i)) & 1) === 1;
    if (i < 6) {
      matrix[8][i] = bit;
    } else if (i === 6) {
      matrix[8][7] = bit;
    } else if (i === 7) {
      matrix[8][8] = bit;
    } else if (i === 8) {
      matrix[7][8] = bit;
    } else {
      matrix[14 - i][8] = bit;
    }

    // Second copy
    if (i < 8) {
      matrix[size - 1 - i][8] = bit;
    } else {
      matrix[8][size - 15 + i] = bit;
    }
  }

  return matrix.map((row) => row.map((val) => val === true));
}

interface QrSvgProps {
  value: string;
  size?: number;
  className?: string;
  fgColor?: string;
  bgColor?: string;
}

export const QrSvg: React.FC<QrSvgProps> = ({
  value,
  size = 180,
  className = '',
  fgColor = '#000000',
  bgColor = '#FFFFFF',
}) => {
  const matrix = useMemo(() => {
    try {
      return encodeQrCode(value);
    } catch (e) {
      console.error('QR encoding error:', e);
      return [];
    }
  }, [value]);

  if (!matrix.length) return null;

  const count = matrix.length;
  const padding = 2; // Quiet zone
  const total = count + padding * 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      className={className}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={total} height={total} fill={bgColor} />
      {matrix.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c + padding}
              y={r + padding}
              width={1}
              height={1}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  );
};
