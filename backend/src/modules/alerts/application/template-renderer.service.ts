import { Injectable } from '@nestjs/common';

/**
 * B10 — Simple `{{path.to.field}}` templating for alert titles/bodies.
 *
 * Deliberately NOT Handlebars — we don't need conditionals, loops, or
 * helpers for MVP. This shape covers 100% of what a tenant admin can
 * express in the UI's text inputs today.
 *
 * Missing paths render as empty string (never crash the dispatch chain).
 * All output is treated as plain text; the caller is responsible for
 * escaping if the channel is HTML-sensitive (EmailChannelService already
 * builds a safe multipart with its own text/html separation).
 */
@Injectable()
export class TemplateRendererService {
  private static readonly PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

  render(template: string | null | undefined, context: unknown): string {
    if (!template) return '';
    return template.replace(TemplateRendererService.PATTERN, (_, path) => {
      const value = resolvePath(context, path);
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      if (value instanceof Date) return value.toISOString();
      // Complex objects/arrays — fall back to JSON so at least it shows up
      // instead of crashing.
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    });
  }
}

function resolvePath(root: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = root;
  for (const key of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
