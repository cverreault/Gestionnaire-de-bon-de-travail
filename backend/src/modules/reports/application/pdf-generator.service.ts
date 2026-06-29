import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import puppeteer, { Browser } from 'puppeteer-core';
import { existsSync } from 'node:fs';

/**
 * Thin wrapper around puppeteer-core.
 *
 * Single shared browser per process — launched lazily on first
 * render(), reused for subsequent calls, closed on shutdown. Each
 * render gets a fresh page so isolation is preserved.
 *
 * Chromium binary is resolved from PUPPETEER_EXECUTABLE_PATH (set by
 * the production Dockerfile to /usr/bin/chromium-browser). When that
 * path is missing — local dev without Chrome installed, for instance
 * — render() throws an explicit error so callers can degrade or
 * surface the misconfiguration instead of crashing on boot.
 */
@Injectable()
export class PdfGeneratorService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  isAvailable(): boolean {
    const path = process.env.PUPPETEER_EXECUTABLE_PATH;
    return !!path && existsSync(path);
  }

  async render(html: string): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new Error(
        'PDF generation unavailable: PUPPETEER_EXECUTABLE_PATH is not set or points to a missing binary. ' +
          'Install Chromium and set the env var, or rebuild the production Docker image.',
      );
    }

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) return this.browser;
    if (this.launching) return this.launching;

    this.launching = puppeteer
      .launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      })
      .then((b) => {
        this.browser = b;
        this.launching = null;
        b.on('disconnected', () => {
          this.logger.warn('Chromium disconnected — will relaunch on next render');
          this.browser = null;
        });
        return b;
      })
      .catch((err) => {
        this.launching = null;
        throw err;
      });

    return this.launching;
  }
}
