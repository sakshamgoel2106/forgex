/**
 * SvgSanitizer
 *
 * Provides strict, security-grade sanitization for engineering SVG drawings (P&IDs, schematics).
 * Strips active executable scripts, dangerous event handlers, malicious protocols,
 * XML entity declarations (XXE defense), and untrusted embedded objects while preserving
 * all engineering vector geometry, paths, labels, text elements, defs, markers, styles,
 * and data-* / id attributes used for tag mapping.
 */
export class SvgSanitizer {
  /**
   * Sanitizes arbitrary raw SVG markup.
   */
  public static sanitize(svgContent: string): {
    sanitized: string;
    hadUnsafeContent: boolean;
    removedViolations: string[];
  } {
    if (!svgContent || typeof svgContent !== 'string') {
      return { sanitized: '', hadUnsafeContent: false, removedViolations: [] };
    }

    const removedViolations: string[] = [];
    let clean = svgContent;

    // 1. Remove XML Declarations that could introduce XXE (DOCTYPE, ENTITY)
    if (/<!DOCTYPE[\s\S]*?>/gi.test(clean) || /<!ENTITY[\s\S]*?>/gi.test(clean)) {
      removedViolations.push('XXE_ENTITY_OR_DOCTYPE');
      clean = clean.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
      clean = clean.replace(/<!ENTITY[\s\S]*?>/gi, '');
    }

    // 2. Remove <script> tags and enclosed script bodies
    if (/<script\b[\s\S]*?(?:<\/script>|\/>)/gi.test(clean)) {
      removedViolations.push('SCRIPT_TAG');
      clean = clean.replace(/<script\b[\s\S]*?(?:<\/script>|\/>)/gi, '');
    }

    // 3. Remove dangerous HTML container/embedding tags: foreignObject, iframe, embed, object, applet, meta, link
    const dangerousTagPattern = /<\/?(foreignObject|iframe|embed|object|applet|meta|link|form|input|button)\b[\s\S]*?>/gi;
    if (dangerousTagPattern.test(clean)) {
      removedViolations.push('DANGEROUS_EMBED_TAGS');
      clean = clean.replace(dangerousTagPattern, '');
    }

    // 4. Strip inline JavaScript event handlers (e.g. onload, onclick, onerror, onmouseover, onfocus, etc.)
    const eventHandlerPattern = /\s+on[a-z0-9_-]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi;
    if (eventHandlerPattern.test(clean)) {
      removedViolations.push('INLINE_EVENT_HANDLER');
      clean = clean.replace(eventHandlerPattern, '');
    }

    // 5. Neutralize dangerous pseudo-protocols: javascript:, vbscript:, data:text/html
    const dangerousUriPattern = /(?:href|xlink:href|src)\s*=\s*['"]\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^'"]*['"]/gi;
    if (dangerousUriPattern.test(clean)) {
      removedViolations.push('DANGEROUS_URI_SCHEME');
      clean = clean.replace(dangerousUriPattern, 'href="#"');
    }

    // 6. Strip expression() or url(javascript:...) in inline style attributes or CSS
    if (/expression\s*\(/gi.test(clean) || /url\s*\(\s*['"]?\s*javascript:/gi.test(clean)) {
      removedViolations.push('CSS_SCRIPT_EXECUTION');
      clean = clean.replace(/expression\s*\([^)]*\)/gi, 'none');
      clean = clean.replace(/url\s*\(\s*['"]?\s*javascript:[^)]*['"]?\s*\)/gi, 'none');
    }

    const hadUnsafeContent = removedViolations.length > 0;
    return {
      sanitized: clean.trim(),
      hadUnsafeContent,
      removedViolations,
    };
  }
}
