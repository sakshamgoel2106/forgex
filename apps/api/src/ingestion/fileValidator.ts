/**
 * ForgeX AI — Secure Upload Content Validation & Magic Bytes Detection
 */

import type { VisualAssetType } from '@forgex/shared-types';

export interface ValidatedFileInfo {
  detectedMimeType: string;
  sanitizedFilename: string;
  extension: string;
}

export interface ValidatedVisualUploadInfo {
  detectedMimeType: string;
  sanitizedFilename: string;
  extension: string;
  suggestedAssetType: VisualAssetType;
  fileSizeBytes: number;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

export function checkDangerousExtension(filename: string): void {
  const parts = filename.toLowerCase().split('.').filter(Boolean);
  const dangerous = new Set([
    'exe', 'bat', 'cmd', 'sh', 'bash', 'ps1', 'vbs', 'js', 'ts', 'py', 'jar',
    'msi', 'scr', 'pif', 'com', 'hta', 'cpl', 'dll', 'so', 'dylib', 'php',
    'jsp', 'asp', 'aspx', 'cgi'
  ]);
  for (const part of parts) {
    if (dangerous.has(part)) {
      throw new Error(`Security Violation: Dangerous executable/script extension '.${part}' detected.`);
    }
  }
}

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

  // 2. Check Dangerous Extensions
  checkDangerousExtension(file.originalname);

  // 3. Check Magic Bytes
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

/**
 * Validates uploads specifically for Visual Intelligence & Engineering resources:
 * - Industrial machine photographs (PNG, JPEG, WebP)
 * - Engineering drawings and schematics (SVG, PDF, PNG, JPEG)
 * - P&ID diagrams (PDF, SVG, PNG, JPEG)
 * - 3D CAD models (GLB, GLTF, STEP/STP, STL, OBJ)
 * - Technical manuals / specifications (PDF)
 */
export function validateVisualAndEngineeringUpload(file: {
  buffer: Buffer;
  originalname: string;
  size: number;
  mimetype?: string;
}): ValidatedVisualUploadInfo {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new Error('Upload validation failed: Empty or missing file buffer.');
  }

  if (file.buffer.length > MAX_FILE_SIZE_BYTES || file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `Upload validation failed: File size ${file.buffer.length} exceeds limit of ${MAX_FILE_SIZE_BYTES} bytes (50MB).`
    );
  }

  const buffer = file.buffer;
  const originalname = file.originalname || 'unknown_asset';
  const ext = (originalname.split('.').pop() || '').toLowerCase();

  // 1. Anti-Malware / Quarantine Signature Verification
  const headerPreview = buffer.subarray(0, 500).toString('ascii');
  if (headerPreview.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')) {
    throw new Error('Security Violation: Malware or virus test signature detected. File rejected.');
  }

  // 2. Dangerous & Double Extensions Rejection
  checkDangerousExtension(originalname);

  // 3. Executable binary / script detection
  // Windows PE MZ (0x4d 0x5a)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new Error('Security Violation: Windows PE executable format rejected.');
  }
  // Linux ELF (0x7f 0x45 0x4c 0x46)
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    throw new Error('Security Violation: ELF binary format rejected.');
  }
  // Mach-O
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
     (buffer[0] === 0xce && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe) ||
     (buffer[0] === 0xcf && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe))
  ) {
    throw new Error('Security Violation: Mach-O binary executable format rejected.');
  }
  // Shell scripts: #!/
  if (buffer.length >= 3 && buffer[0] === 0x23 && buffer[1] === 0x21 && buffer[2] === 0x2f) {
    throw new Error('Security Violation: Shell script executable rejected.');
  }

  // 4. Archive formats rejection (to prevent zip slip / archive traversal)
  // ZIP: PK\x03\x04 — Allow DOCX if extension is docx
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    if (ext === 'docx') {
      return {
        detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sanitizedFilename: sanitizeFilename(originalname),
        extension: 'docx',
        suggestedAssetType: 'MANUAL_PAGE',
        fileSizeBytes: buffer.length,
      };
    }
    throw new Error('Upload validation failed: Archive formats (.zip, .jar, etc.) are not supported for visual intelligence uploads.');
  }
  // GZIP: 0x1f 0x8b
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    throw new Error('Upload validation failed: Archive formats (.tar.gz, .gz) are not supported for visual intelligence uploads.');
  }
  // 7z: 0x37 0x7a 0xbc 0xaf 0x27 0x1c
  if (buffer.length >= 6 && buffer[0] === 0x37 && buffer[1] === 0x7a && buffer[2] === 0xbc && buffer[3] === 0xaf && buffer[4] === 0x27 && buffer[5] === 0x1c) {
    throw new Error('Upload validation failed: 7z archive format is not supported for visual intelligence uploads.');
  }
  // RAR: 0x52 0x61 0x72 0x21
  if (buffer.length >= 4 && buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21) {
    throw new Error('Upload validation failed: RAR archive format is not supported for visual intelligence uploads.');
  }

  const cleanFilename = sanitizeFilename(originalname);

  // 5. Plain Text & Markdown Industrial Documents (.md, .txt)
  if (ext === 'md' || ext === 'txt' || ext === 'text') {
    const scanLen = Math.min(buffer.length, 1024);
    for (let i = 0; i < scanLen; i++) {
      if (buffer[i] === 0x00) {
        throw new Error('Upload validation failed: Binary data detected in text document.');
      }
    }
    const detectedMime = ext === 'md' ? 'text/markdown' : 'text/plain';
    return {
      detectedMimeType: detectedMime,
      sanitizedFilename: cleanFilename,
      extension: ext === 'md' ? 'md' : 'txt',
      suggestedAssetType: 'MANUAL_PAGE',
      fileSizeBytes: buffer.length,
    };
  }

  // 6. PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    const isDrawingOrPid =
      originalname.toLowerCase().includes('pid') ||
      originalname.toLowerCase().includes('p&id') ||
      originalname.toLowerCase().includes('drawing') ||
      originalname.toLowerCase().includes('schematic');

    return {
      detectedMimeType: 'application/pdf',
      sanitizedFilename: cleanFilename,
      extension: 'pdf',
      suggestedAssetType: isDrawingOrPid ? 'ENGINEERING_DRAWING' : 'MANUAL_PAGE',
      fileSizeBytes: buffer.length,
    };
  }

  // 6. PNG: \x89PNG\r\n\x1a\n
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
    const lower = originalname.toLowerCase();
    let suggested: VisualAssetType = 'PHOTOGRAPH';
    if (lower.includes('pid') || lower.includes('p&id')) suggested = 'PID_RENDER';
    else if (lower.includes('drawing') || lower.includes('schematic') || lower.includes('diagram')) suggested = 'DIAGRAM';

    return {
      detectedMimeType: 'image/png',
      sanitizedFilename: cleanFilename,
      extension: 'png',
      suggestedAssetType: suggested,
      fileSizeBytes: buffer.length,
    };
  }

  // 7. JPEG: 0xFF 0xD8 0xFF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    const lower = originalname.toLowerCase();
    let suggested: VisualAssetType = 'PHOTOGRAPH';
    if (lower.includes('pid') || lower.includes('p&id')) suggested = 'PID_RENDER';
    else if (lower.includes('drawing') || lower.includes('schematic') || lower.includes('diagram')) suggested = 'DIAGRAM';

    return {
      detectedMimeType: 'image/jpeg',
      sanitizedFilename: cleanFilename,
      extension: 'jpg',
      suggestedAssetType: suggested,
      fileSizeBytes: buffer.length,
    };
  }

  // 8. WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return {
      detectedMimeType: 'image/webp',
      sanitizedFilename: cleanFilename,
      extension: 'webp',
      suggestedAssetType: 'PHOTOGRAPH',
      fileSizeBytes: buffer.length,
    };
  }

  // 9. SVG: XML containing <svg
  const asciiHeader = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('utf8');
  if (
    (ext === 'svg' || file.mimetype === 'image/svg+xml' || asciiHeader.includes('<svg')) &&
    asciiHeader.toLowerCase().includes('<svg')
  ) {
    // Sanitize against embedded scripts or event handlers (SVG XSS prevention)
    const lowerContent = buffer.toString('utf8').toLowerCase();
    if (
      lowerContent.includes('<script') ||
      lowerContent.includes('javascript:') ||
      lowerContent.includes('onerror=') ||
      lowerContent.includes('onload=')
    ) {
      throw new Error('Security Violation: SVG contains executable script or event handler content.');
    }
    return {
      detectedMimeType: 'image/svg+xml',
      sanitizedFilename: cleanFilename,
      extension: 'svg',
      suggestedAssetType: 'ENGINEERING_DRAWING',
      fileSizeBytes: buffer.length,
    };
  }

  // 10. GLB (Binary glTF 3D model): magic bytes "glTF"
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x67 &&
    buffer[1] === 0x6c &&
    buffer[2] === 0x54 &&
    buffer[3] === 0x46
  ) {
    return {
      detectedMimeType: 'model/gltf-binary',
      sanitizedFilename: cleanFilename,
      extension: 'glb',
      suggestedAssetType: 'CAD_MODEL',
      fileSizeBytes: buffer.length,
    };
  }

  // 11. GLTF (JSON glTF 3D model)
  if (ext === 'gltf' || file.mimetype === 'model/gltf+json') {
    try {
      const parsed = JSON.parse(buffer.toString('utf8'));
      if (parsed && typeof parsed === 'object' && parsed.asset && parsed.asset.version) {
        return {
          detectedMimeType: 'model/gltf+json',
          sanitizedFilename: cleanFilename,
          extension: 'gltf',
          suggestedAssetType: 'CAD_MODEL',
          fileSizeBytes: buffer.length,
        };
      }
    } catch {
      // not valid JSON
    }
  }

  // 12. STEP / STP (ISO-10303-21 CAD Exchange)
  if (ext === 'step' || ext === 'stp') {
    const textSample = buffer.subarray(0, Math.min(buffer.length, 1024)).toString('ascii');
    if (
      textSample.toUpperCase().includes('ISO-10303-21') ||
      textSample.toUpperCase().includes('FILE_DESCRIPTION') ||
      textSample.toUpperCase().includes('HEADER;')
    ) {
      return {
        detectedMimeType: 'application/step',
        sanitizedFilename: cleanFilename,
        extension: ext,
        suggestedAssetType: 'CAD_MODEL',
        fileSizeBytes: buffer.length,
      };
    }
  }

  // 13. STL (3D Stereolithography)
  if (ext === 'stl' || file.mimetype === 'model/stl') {
    // ASCII STL starts with "solid" and ends with "endsolid"
    const textSample = buffer.subarray(0, Math.min(buffer.length, 512)).toString('ascii').trim().toLowerCase();
    if (textSample.startsWith('solid')) {
      return {
        detectedMimeType: 'model/stl',
        sanitizedFilename: cleanFilename,
        extension: 'stl',
        suggestedAssetType: 'CAD_MODEL',
        fileSizeBytes: buffer.length,
      };
    }
    // Binary STL: 80 bytes header, 4 bytes triangle count (total length >= 84)
    if (buffer.length >= 84 && (buffer.length - 84) % 50 === 0) {
      return {
        detectedMimeType: 'model/stl',
        sanitizedFilename: cleanFilename,
        extension: 'stl',
        suggestedAssetType: 'CAD_MODEL',
        fileSizeBytes: buffer.length,
      };
    }
  }

  // 14. OBJ (Wavefront 3D model)
  if (ext === 'obj') {
    const textSample = buffer.subarray(0, Math.min(buffer.length, 2048)).toString('ascii');
    if (/^(v\s|vn\s|vt\s|f\s|#)/m.test(textSample)) {
      return {
        detectedMimeType: 'model/obj',
        sanitizedFilename: cleanFilename,
        extension: 'obj',
        suggestedAssetType: 'CAD_MODEL',
        fileSizeBytes: buffer.length,
      };
    }
  }

  throw new Error(
    `Upload validation failed: Unsupported file type or content signature for '${originalname}'. Supported formats: PNG, JPEG, WebP, PDF, SVG, GLB, GLTF, STEP/STP, STL, OBJ.`
  );
}

export function sanitizeFilename(filename: string): string {
  // Strip null bytes, paths, control characters
  const withoutNulls = filename.replace(/\0/g, '');
  const basename = withoutNulls.replace(/^.*[/\\]/, '');
  const clean = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Strip dangerous leading/trailing dots or underscores
  const trimmed = clean.replace(/^[._]+/, '');
  return trimmed.slice(0, 200) || 'document';
}

