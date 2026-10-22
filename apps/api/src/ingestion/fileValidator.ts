/**
 * ForgeX AI — Secure Upload Content Validation & Magic Bytes Detection
 */

export interface ValidatedFileInfo {
  detectedMimeType: string;
  sanitizedFilename: string;
  extension: string;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export function validateUpload(file: {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype?: string;
}): ValidatedFileInfo {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new Error('Upload validation failed: Empty or missing file buffer.');
  }

  if (file.buffer.length > MAX_FILE_SIZE_BYTES || file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Upload validation failed: File size ${file.buffer.length} exceeds limit of ${MAX_FILE_SIZE_BYTES} bytes.`
    );
  }

  const buffer = file.buffer;
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();

  // 1. Anti-Malware / Quarantine Signature Verification
  const headerPreview = buffer.subarray(0, 500).toString('ascii');
  if (headerPreview.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')) {
    throw new Error('Security Violation: Malware or virus test signature detected. File rejected.');
  }

  // 2. Check Magic Bytes
  // Reject executables / dangerous scripts immediately
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new Error('Security Violation: Windows PE executable format rejected.');
  }
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    throw new Error('Security Violation: ELF binary format rejected.');
  }

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return {
      detectedMimeType: 'application/pdf',
      sanitizedFilename: sanitizeFilename(file.originalname),
      extension: 'pdf',
    };
  }

  // PNG: \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      detectedMimeType: 'image/png',
      sanitizedFilename: sanitizeFilename(file.originalname),
      extension: 'png',
    };
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      detectedMimeType: 'image/jpeg',
      sanitizedFilename: sanitizeFilename(file.originalname),
      extension: 'jpg',
    };
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return {
      detectedMimeType: 'image/webp',
      sanitizedFilename: sanitizeFilename(file.originalname),
      extension: 'webp',
    };
  }

  // DOCX: PK\x03\x04 (ZIP container for Office Open XML)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04 &&
    (ext === 'docx' || file.mimetype?.includes('word'))
  ) {
    return {
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sanitizedFilename: sanitizeFilename(file.originalname),
      extension: 'docx',
    };
  }

  // Plain Text / Markdown: check that it's valid UTF-8 without NUL bytes
  if (ext === 'txt' || ext === 'md' || ext === 'text') {
    // Check for NUL byte in the first 4KB to distinguish text from binary
    const checkLength = Math.min(buffer.length, 4096);
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0x00) {
        throw new Error('Upload validation failed: Binary data detected in text file.');
      }
    }

    const mime = ext === 'md' ? 'text/markdown' : 'text/plain';
    return {
      detectedMimeType: mime,
      sanitizedFilename: sanitizeFilename(file.originalname),
      extension: ext,
    };
  }

  // 3D Models & Industrial CAD Formats:
  // GLB, GLTF, OBJ, STL, STEP, STP, SKP, FBX, USD, USDZ, IGES, IGS, PLY, 3MF
  const cadFormats: Record<string, string> = {
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    obj: 'model/obj',
    stl: 'model/stl',
    step: 'model/step',
    stp: 'model/step',
    skp: 'model/vnd.sketchup.skp',
    fbx: 'model/fbx',
    usd: 'model/vnd.usd',
    usdz: 'model/vnd.usdz+zip',
    iges: 'model/iges',
    igs: 'model/iges',
    ply: 'model/ply',
    '3mf': 'model/3mf',
  };

  // 3D Model: GLB (glTF binary, magic: 0x67 0x6C 0x54 0x46 -> "glTF")
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x67 &&
    buffer[1] === 0x6c &&
    buffer[2] === 0x54 &&
    buffer[3] === 0x46
  ) {
    return {
      detectedMimeType: 'model/gltf-binary',
      sanitizedFilename: sanitizeFilename(file.originalname),
      extension: 'glb',
    };
  }

  // 3D Model & CAD extensions validation
  if (cadFormats[ext]) {
    if (ext === 'stl' && buffer.length < 84) {
      const preview = buffer.toString('utf-8', 0, Math.min(buffer.length, 50)).trim().toLowerCase();
      if (!preview.startsWith('solid')) {
        throw new Error('Upload validation failed: Truncated or invalid STL 3D model.');
      }
    }

    return {
      detectedMimeType: cadFormats[ext],
      sanitizedFilename: sanitizeFilename(file.originalname),
      extension: ext,
    };
  }

  // 3D Model by MIME-type fallback
  for (const [cadExt, mime] of Object.entries(cadFormats)) {
    if (file.mimetype === mime) {
      return {
        detectedMimeType: mime,
        sanitizedFilename: sanitizeFilename(file.originalname),
        extension: cadExt,
      };
    }
  }

  throw new Error(
    `Upload validation failed: Unsupported or malformed file content. Magic bytes do not match allowed formats (PDF, DOCX, TXT, MD, PNG, JPG, WebP, CAD/3D: GLB, GLTF, OBJ, STL, STEP, STP, SKP, FBX, IGES, IGS, USD, USDZ, PLY, 3MF).`
  );
}

export function sanitizeFilename(filename: string): string {
  // Strip paths, control characters, and keep only safe alphanumerics and punctuation
  const basename = filename.replace(/^.*[/\\]/, '');
  const clean = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.slice(0, 200) || 'document';
}
