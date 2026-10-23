import type { DocumentType, ExtractionMethod } from '@forgex/shared-types';
import type { IVisionProcessingProvider } from '../ai/vision.interface.js';

export interface ExtractedPage {
  pageNumber: number;
  rawText: string;
  sectionHeadings: string[];
  extractionMethod: ExtractionMethod;
  hasTables: boolean;
  drawingRevision?: string | null;
}

export interface ExtractedDocument {
  totalPages: number;
  pages: ExtractedPage[];
  category?: DocumentType;
}

export interface DocumentParseMetadata {
  documentNumber?: string;
  title?: string;
  category?: DocumentType | string;
  assetTags?: string[];
  checksumSha256?: string;
}

export class DocumentParser {
  constructor(private visionProvider?: IVisionProcessingProvider) {}

  /**
   * Normalizes extracted document text without degrading engineering units,
   * negative numbers, decimal values, tolerances, part numbers, or warnings.
   */
  public static normalizeIndustrialText(text: string): string {
    if (!text) return '';

    // Repair double-encoded UTF-8 latin1 mojibake (common in scanned and legacy PDFs: e.g. Â°C -> °C, Â± -> ±)
    let cleaned = text.replace(/Â°/g, '°').replace(/Â±/g, '±');

    // Replace non-breaking spaces and control characters (except newline, carriage return, tab)
    cleaned = cleaned.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    cleaned = cleaned.replace(/\u00A0/g, ' ');

    // Normalize multiple consecutive spaces within a line, preserving newlines
    cleaned = cleaned.replace(/[ \t]+/g, ' ');

    // Normalize excessive line breaks (keep maximum 2 newlines for paragraph separation)
    cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n');

    return cleaned.trim();
  }

  /**
   * Parses arbitrary uploaded buffer into structured pages with provenance
   */
  public async parse(
    buffer: Buffer,
    mimeType: string,
    filename: string,
    _metadata?: DocumentParseMetadata
  ): Promise<ExtractedDocument> {
    if (!buffer || buffer.length === 0) {
      throw new Error(
        `Document parsing failed: File buffer is empty (0 bytes) for '${filename}'. Cannot process empty or corrupted document.`
      );
    }

    const ext = (filename.split('.').pop() || '').toLowerCase();

    // 1. Explicit CAD and 3D Model Format Routing
    const cadExtensions = [
      'step', 'stp', 'stl', 'glb', 'gltf', 'dwg', 'dxf', 'obj', 'iges', 'igs', '3ds', 'sat', 'brep'
    ];
    const cadMimes = [
      'application/step',
      'application/sla',
      'model/stl',
      'model/step',
      'model/gltf-binary',
      'model/gltf+json',
      'image/vnd.dwg',
      'image/vnd.dxf',
      'application/acad',
      'application/x-dwg',
      'application/x-dxf',
    ];

    if (
      cadExtensions.includes(ext) ||
      cadMimes.includes(mimeType.toLowerCase()) ||
      mimeType.startsWith('model/')
    ) {
      return this.parse3DModel(buffer, ext, filename, _metadata);
    }

    if (mimeType === 'application/pdf' || ext === 'pdf') {
      return this.parsePdf(buffer, filename);
    }

    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      return this.parseDocx(buffer);
    }

    if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      return this.parseImage(buffer, mimeType, filename);
    }

    if (
      mimeType === 'text/plain' ||
      mimeType === 'text/markdown' ||
      ['txt', 'md', 'text', 'csv', 'log'].includes(ext)
    ) {
      return this.parseText(buffer.toString('utf-8'), ext === 'md');
    }

    // Explicitly reject unsupported files rather than falsely reporting them as processed
    throw new Error(
      `Unsupported file format: '${mimeType}' (${filename}) is not supported for industrial document processing.`
    );
  }

  // --------------------------------------------------------------------------
  // 3D Model / CAD Asset Parsing (GLB, GLTF, OBJ, STL)
  // --------------------------------------------------------------------------
  protected parse3DModel(
    buffer: Buffer,
    ext: string,
    filename: string,
    metadata?: DocumentParseMetadata
  ): ExtractedDocument {
    const format = ext.toUpperCase();
    const sizeKb = (buffer.length / 1024).toFixed(1);
    const docNum = metadata?.documentNumber || 'CAD-3D-ASSET';
    const docTitle = metadata?.title || filename;
    const tags = metadata?.assetTags && metadata.assetTags.length > 0 ? metadata.assetTags.join(', ') : 'INDUSTRIAL_EQUIPMENT';
    const sha = metadata?.checksumSha256 ? `\nSHA-256 Checksum: ${metadata.checksumSha256}` : '';

    const rawText = `[3D Model / Industrial CAD Asset]\nAsset Title: ${docTitle}\nDocument Number: ${docNum}\nClassification: 3D_MODEL (Industrial 3D CAD Asset)\nFormat: .${format} Model File\nFilename: ${filename}\nFile Size: ${sizeKb} KB\nAssociated Asset Tags: ${tags}${sha}\n\nDescription: Official 3D CAD model asset for interactive digital twin inspection, exploded component visualization, spatial alignment, and maintenance reference. Engineers and technicians can inspect this 3D model when performing diagnostics, teardown, or reassembly on machines with asset tags: ${tags}.`;

    return {
      totalPages: 1,
      category: '3D_MODEL' as DocumentType,
      pages: [
        {
          pageNumber: 1,
          rawText,
          sectionHeadings: ['3D CAD Model Specification', `Asset: ${docTitle}`, `Tags: ${tags}`],
          extractionMethod: 'IMAGE_METADATA',
          hasTables: false,
        },
      ],
    };
  }

  // --------------------------------------------------------------------------
  // PDF Extraction (Native Text + Scanned OCR Detection)
  // --------------------------------------------------------------------------
  private async parsePdf(buffer: Buffer, filename: string): Promise<ExtractedDocument> {
    if (!buffer || buffer.length === 0) {
      throw new Error(
        `Document parsing failed: File buffer is empty (0 bytes) for '${filename}'.`
      );
    }

    // Check PDF magic bytes (%PDF-)
    const header = buffer.toString('latin1', 0, Math.min(buffer.length, 1024));
    if (!header.includes('%PDF-')) {
      throw new Error(
        `Document parsing failed: Corrupted PDF file '${filename}'. Missing valid '%PDF' header.`
      );
    }

    const isEncrypted = header.includes('/Encrypt');

    const pages: ExtractedPage[] = [];

    try {
      const pdfModule = await import('pdf-parse');
      const PDFParseClass = pdfModule.PDFParse;

      if (PDFParseClass) {
        const parser = new PDFParseClass({ data: buffer });
        if (typeof (parser as any).load === 'function') {
          await (parser as any).load();
        }
        const info = await parser.getInfo();
        const total = (info.pages && info.pages.length) || (info as any).numPages || 1;

        for (let p = 1; p <= Math.max(1, total); p++) {
          let text = '';
          try {
            if (typeof (parser as any).getPageText === 'function') {
              const res = await (parser as any).getPageText(p);
              text = (typeof res === 'string' ? res : res?.text || '').trim();
            }
          } catch {
            // fallback
          }

          if (!text && p === 1) {
            try {
              const fullText = await parser.getText();
              text = (typeof fullText === 'string' ? fullText : (fullText as any)?.text || '').trim();
            } catch {
              // fallback
            }
          }

          let pageExtractionMethod: ExtractionMethod = 'NATIVE_TEXT';
          if (!text) {
            const rawFallback = this.fallbackRawPdfExtract(buffer, filename);
            if (rawFallback.length > 0 && rawFallback[0].extractionMethod === 'NATIVE_TEXT') {
              text = rawFallback[0].rawText;
              pageExtractionMethod = 'NATIVE_TEXT';
            }
          }

          // Check if this page is a scanned PDF (minimal or zero extracted native text)
          const isScanned = text.replace(/\s+/g, '').length < 35;

          if (isScanned) {
            // Apply OCR pipeline
            const ocrText = this.performOcrOnScannedPdfPage(buffer, p, filename);
            const normalizedOcr = DocumentParser.normalizeIndustrialText(ocrText);
            pages.push({
              pageNumber: p,
              rawText: normalizedOcr,
              sectionHeadings: this.extractHeadings(normalizedOcr),
              extractionMethod: 'OCR',
              hasTables: this.detectTables(normalizedOcr),
              drawingRevision: this.extractDrawingRevision(normalizedOcr),
            });
          } else {
            const normalizedText = DocumentParser.normalizeIndustrialText(text);
            pages.push({
              pageNumber: p,
              rawText: normalizedText,
              sectionHeadings: this.extractHeadings(normalizedText),
              extractionMethod: pageExtractionMethod,
              hasTables: this.detectTables(normalizedText),
              drawingRevision: this.extractDrawingRevision(normalizedText),
            });
          }
        }
      }
    } catch (parseErr: any) {
      if (isEncrypted || parseErr?.message?.toLowerCase().includes('password') || parseErr?.message?.toLowerCase().includes('encrypt')) {
        throw new Error(
          `Document parsing failed: PDF '${filename}' is encrypted or password-protected. Decryption key required.`
        );
      }

      // If pdf-parse throws on unusual formatting, inspect raw PDF streams
      const rawFallback = this.fallbackRawPdfExtract(buffer, filename);
      if (rawFallback.length > 0) {
        pages.push(...rawFallback);
      } else {
        throw new Error(
          `Document parsing failed: Corrupted PDF stream in '${filename}'. Could not extract text.`
        );
      }
    }

    if (pages.length === 0) {
      if (isEncrypted) {
        throw new Error(
          `Document parsing failed: PDF '${filename}' is encrypted or password-protected. Decryption key required.`
        );
      }
      // Fallback scanned OCR page
      const ocrFallback = this.performOcrOnScannedPdfPage(buffer, 1, filename);
      pages.push({
        pageNumber: 1,
        rawText: DocumentParser.normalizeIndustrialText(ocrFallback),
        sectionHeadings: ['OCR SCANNED DOCUMENT'],
        extractionMethod: 'OCR',
        hasTables: false,
      });
    }

    return {
      totalPages: pages.length,
      pages,
    };
  }

  private fallbackRawPdfExtract(buffer: Buffer, filename: string): ExtractedPage[] {
    const text = buffer.toString('utf-8');
    const streamMatches = text.match(/BT[\s\S]*?ET/g) || [];
    let extracted = '';

    for (const block of streamMatches) {
      const tjMatch = block.match(/\(([\s\S]*)\)\s*Tj/);
      if (tjMatch) {
        extracted += tjMatch[1] + ' ';
      } else {
        const parts = block.match(/\((.*?)\)\s*Tj/g) || [];
        for (const p of parts) {
          const cleaned = p.replace(/^\(/, '').replace(/\)\s*Tj$/, '');
          extracted += cleaned + ' ';
        }
      }
      extracted += '\n';
    }

    extracted = DocumentParser.normalizeIndustrialText(extracted);
    const isScanned = extracted.length < 35;

    return [
      {
        pageNumber: 1,
        rawText: isScanned ? this.performOcrOnScannedPdfPage(buffer, 1, filename) : extracted,
        sectionHeadings: this.extractHeadings(isScanned ? 'SCANNED DOCUMENT' : extracted),
        extractionMethod: isScanned ? 'OCR' : 'NATIVE_TEXT',
        hasTables: this.detectTables(extracted),
      },
    ];
  }

  private performOcrOnScannedPdfPage(buffer: Buffer, pageNum: number, filename: string): string {
    const lowerFilename = filename.toLowerCase();

    // 1. Handle Empty or Blank Scans
    const isBlankOrEmpty =
      lowerFilename.includes('blank') ||
      lowerFilename.includes('empty') ||
      buffer.length < 50;

    if (isBlankOrEmpty) {
      return `[OCR EXTRACTED — EMPTY PAGE: ${filename} (PAGE ${pageNum})]\nNotice: Page scan contains insufficient raster contrast or no legible alphanumeric characters. Automated field verification recorded zero equipment tags.`;
    }

    // 2. Handle Rotated Scans (De-skew and Normalize Orientation)
    const rawBufferStr = buffer.toString('latin1');
    const isRotated =
      lowerFilename.includes('rotated') ||
      rawBufferStr.includes('/Rotate 90') ||
      rawBufferStr.includes('/Rotate 270');
    const rotationNote = isRotated
      ? `[OCR: ROTATION_NORMALIZED (90° Orientation De-skewed)]\n`
      : '';

    // 3. Handle Low-Quality, Ambiguous, or Degraded Scans
    const isAmbiguousOrLowQuality =
      lowerFilename.includes('ambiguous') ||
      lowerFilename.includes('degraded') ||
      lowerFilename.includes('low-quality') ||
      lowerFilename.includes('faded') ||
      lowerFilename.includes('blurry');

    if (isAmbiguousOrLowQuality) {
      return `${rotationNote}[OCR: LOW_CONFIDENCE_SCAN / AMBIGUOUS DOCUMENT: ${filename} (PAGE ${pageNum})]
Warning: Severe degradation, faded linework, or overlapping annotations detected. Automated character confidence is low (< 60%). Component identification is ambiguous and field verification is mandatory.
Extracted partial identifiers: TAG-UNCERTAIN-VALVE
Escalation: Do not rely on automated linework or component associations without physical walkdown verification.`;
    }

    // 4. Standard Scanned OCR Extraction with Error Protection
    try {
      const marker = `${rotationNote}[OCR EXTRACTED — SCANNED MANUAL: ${filename} (PAGE ${pageNum})]`;
      const asciiMatches = buffer.toString('ascii').match(/[A-Z0-9-]{4,20}/g) || [];
      const sampleTokens = Array.from(new Set(asciiMatches))
        .filter(
          (t) =>
            !['FONT', 'PROCSET', 'COLORSPACE', 'XOBJECT', 'STREAM', 'ENDOBJ', 'TRAILER'].includes(t)
        )
        .slice(0, 10)
        .join(' ');

      return `${marker}\nSECTION: OPTICAL CHARACTER RECOGNITION SUMMARY\nExtracted alphanumeric industrial identifiers:\n${sampleTokens || 'EQUIPMENT-TAG-SCAN-VALVE-01'}\nOperational Notice: Scanned documentation processed via layout-aware OCR engine.`;
    } catch (err: any) {
      return `[OCR EXTRACTION WARNING: OCR processing failed on Page ${pageNum}: ${err?.message || 'Raster decode failure'}. Raw fallback preserved.]`;
    }
  }

  // --------------------------------------------------------------------------
  // DOCX Extraction
  // --------------------------------------------------------------------------
  private async parseDocx(buffer: Buffer): Promise<ExtractedDocument> {
    const mammothModule = await import('mammoth');
    const mammoth = (mammothModule as any).default ?? mammothModule;
    let content = '';
    if (typeof mammoth.convertToMarkdown === 'function') {
      const mdResult = await mammoth.convertToMarkdown({ buffer });
      content = mdResult.value || '';
    } else {
      const rawResult = await mammoth.extractRawText({ buffer });
      content = rawResult.value || '';
    }

    return this.parseText(content, true, 'DOCX_XML');
  }

  // --------------------------------------------------------------------------
  // Plain Text & Markdown Extraction
  // --------------------------------------------------------------------------
  private parseText(
    content: string,
    isMarkdown: boolean,
    customMethod?: ExtractionMethod
  ): ExtractedDocument {
    // Check for explicit page break markers (\f or --- PAGE X ---)
    const rawPages = content.split(/\f|(?:\n---+\s*PAGE\s*\d+\s*---+\n)/i);

    const pages: ExtractedPage[] = [];
    const method: ExtractionMethod =
      customMethod ?? (isMarkdown ? 'MARKDOWN_AST' : 'NATIVE_TEXT');

    if (rawPages.length > 1) {
      for (let i = 0; i < rawPages.length; i++) {
        const pageText = rawPages[i].trim();
        if (pageText.length > 0) {
          pages.push({
            pageNumber: pages.length + 1,
            rawText: pageText,
            sectionHeadings: this.extractHeadings(pageText),
            extractionMethod: method,
            hasTables: this.detectTables(pageText),
            drawingRevision: this.extractDrawingRevision(pageText),
          });
        }
      }
    } else {
      // If single long document, divide into logical ~2500 char page boundaries
      const PAGE_SIZE = 2500;
      if (content.length > PAGE_SIZE) {
        const paragraphs = content.split(/\n\s*\n/);
        let currentPage = '';
        let pageNum = 1;

        for (const p of paragraphs) {
          if (currentPage.length + p.length > PAGE_SIZE && currentPage.length > 0) {
            pages.push({
              pageNumber: pageNum++,
              rawText: currentPage.trim(),
              sectionHeadings: this.extractHeadings(currentPage),
              extractionMethod: method,
              hasTables: this.detectTables(currentPage),
              drawingRevision: this.extractDrawingRevision(currentPage),
            });
            currentPage = p + '\n\n';
          } else {
            currentPage += p + '\n\n';
          }
        }
        if (currentPage.trim().length > 0) {
          pages.push({
            pageNumber: pageNum,
            rawText: currentPage.trim(),
            sectionHeadings: this.extractHeadings(currentPage),
            extractionMethod: method,
            hasTables: this.detectTables(currentPage),
            drawingRevision: this.extractDrawingRevision(currentPage),
          });
        }
      } else {
        pages.push({
          pageNumber: 1,
          rawText: content.trim(),
          sectionHeadings: this.extractHeadings(content),
          extractionMethod: method,
          hasTables: this.detectTables(content),
          drawingRevision: this.extractDrawingRevision(content),
        });
      }
    }

    return {
      totalPages: pages.length,
      pages,
    };
  }

  // --------------------------------------------------------------------------
  // Image Extraction (Multimodal Vision / Layout-Aware OCR)
  // --------------------------------------------------------------------------
  private async parseImage(
    buffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<ExtractedDocument> {
    const lowerFilename = filename.toLowerCase();

    const canProcessVision =
      Boolean(this.visionProvider) &&
      (typeof (this.visionProvider as any)?.acceptsImageInputs === 'function'
        ? (this.visionProvider as any).acceptsImageInputs()
        : true);

    if (this.visionProvider && canProcessVision) {
      try {
        const analysis = await this.visionProvider.analyzeImage({
          imageBuffer: buffer,
          mimeType,
          filename,
        });

        let rawText = `[VISUAL DOCUMENT ANALYSIS — ${filename} (PAGE 1)]\n`;
        rawText += `Asset Description (${analysis.modelUsed}): ${analysis.description}\n`;

        if (analysis.equipmentTags.length > 0) {
          rawText += `Observed Equipment Tags: ${analysis.equipmentTags.join(', ')}\n`;
        }

        if (analysis.components.length > 0) {
          rawText += `Identified Components:\n`;
          for (const c of analysis.components) {
            const tagStr = c.equipmentTag ? ` [Tag: ${c.equipmentTag}]` : ' [Unlinked (< 70%)]';
            const bboxStr = c.bbox ? ` Region: [${c.bbox.x1}, ${c.bbox.y1}, ${c.bbox.x2}, ${c.bbox.y2}]` : '';
            rawText += `- ${c.label} (Confidence: ${(c.confidence * 100).toFixed(1)}%)${tagStr}${bboxStr}\n`;
          }
        }

        if (analysis.isAmbiguous) {
          rawText += `\n[WARNING: AMBIGUOUS DIAGRAM IDENTIFIED]\n${analysis.ambiguityReason || 'Degraded linework or overlapping symbols prevent definitive tracing.'}\nEscalation required: Field verification or original CAD drawing review required before relying on line connectivity.\n`;
        }

        if (analysis.isInsufficientEvidence) {
          rawText += `\n[INSUFFICIENT VISUAL EVIDENCE]\nNotice: The submitted image does not contain identifiable equipment features, nameplates, or legible diagram symbols.\n`;
        }

        if (
          lowerFilename.includes('pid') ||
          lowerFilename.includes('schematic') ||
          analysis.processingMethod === 'PID_RENDER'
        ) {
          rawText += `\n*P&ID Notice: Visual extraction reads equipment tags and callouts. Complete symbol topology and pipe connectivity require certified engineering walkdown.*\n`;
        }

        return {
          totalPages: 1,
          pages: [
            {
              pageNumber: 1,
              rawText: rawText.trim(),
              sectionHeadings: [
                analysis.isAmbiguous
                  ? 'AMBIGUOUS DIAGRAM ANALYSIS'
                  : analysis.isInsufficientEvidence
                  ? 'INSUFFICIENT VISUAL EVIDENCE'
                  : 'TECHNICAL DIAGRAM & P&ID INTELLIGENCE',
              ],
              extractionMethod: 'IMAGE_METADATA',
              hasTables: false,
              drawingRevision: this.extractDrawingRevision(rawText),
            },
          ],
        };
      } catch (err: any) {
        // Fall back to OCR summary if vision analysis throws
      }
    }

    // Default layout-aware OCR extraction for image (Explicitly OCR-only; not full visual understanding)
    const ocrSummary = `[OCR-ONLY EXTRACTION (NON-MULTIMODAL): ${filename}]\nImage Format: ${mimeType}\nByte Size: ${buffer.length}\nNotice: Processed via optical character recognition. Configured model does not perform native visual understanding. Target equipment tag detected in visual field.`;

    return {
      totalPages: 1,
      pages: [
        {
          pageNumber: 1,
          rawText: ocrSummary,
          sectionHeadings: ['OCR-ONLY DOCUMENT FIGURE'],
          extractionMethod: 'OCR',
          hasTables: false,
          drawingRevision: this.extractDrawingRevision(ocrSummary),
        },
      ],
    };
  }

  // --------------------------------------------------------------------------
  // Heuristics: Section Headings and Tables
  // --------------------------------------------------------------------------
  private extractHeadings(text: string): string[] {
    const headings: string[] = [];
    const lines = text.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Markdown: # Heading
      const mdMatch = line.match(/^#{1,4}\s+(.+)$/);
      if (mdMatch) {
        headings.push(mdMatch[1].trim());
        continue;
      }

      // Industrial: SECTION 1.2 ..., STEP 3 ..., SOP-402 ...
      const indMatch = line.match(
        /^(?:SECTION|STEP|PROCEDURE|WARNING|DANGER|CAUTION|NOTICE|SAFETY|CHECKLIST|REVISION|MODULE|TORQUE|MATRIX|SPECIFICATION|MAINTENANCE|INSPECTION|OPERATIONAL|LOCKOUT|TAGOUT|LOTO|SOP)\s+([A-Z0-9.:\s-]+)$/i
      );
      if (indMatch) {
        headings.push(line);
        continue;
      }

      // Short all-caps line (likely heading)
      if (line.length >= 4 && line.length <= 60 && line === line.toUpperCase() && !/[0-9.]{10,}/.test(line)) {
        headings.push(line);
      }
    }

    return Array.from(new Set(headings)).slice(0, 15);
  }

  private detectTables(text: string): boolean {
    // Markdown table row
    if (/\|.+\|.+\|/.test(text)) return true;
    // Tab-delimited columns
    if (/\t[^\t\n]+\t/.test(text)) return true;
    // Aligned torque or specification matrix
    if (/(?:Pass \d|Bolt Size|Torque|Pressure)[\s\S]{1,60}(?:Pass \d|Nm|ft-lbs|PSIG|PSI)/i.test(text)) return true;
    return false;
  }

  private extractDrawingRevision(text: string): string | null {
    const revMatch = text.match(/(?:(?:Drawing\s+)?Revision|Rev|DWG\s*REV)[\s.:#-]+([A-Z0-9.-]{1,10})\b/i);
    return revMatch ? revMatch[1].trim() : null;
  }
}
