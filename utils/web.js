/*
 * *
 *  Copyright 2014 Comcast Cable Communications Management, LLC
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 * /
 */

const puppeteer = require('puppeteer');
const config = require('../config');

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

const WebService = {
    browser: null,
    isInitialized: false,
    pagePool: [],
    maxPages: 5,
    retryAttempts: 3,
    retryDelay: 2000,
    enableVerboseLogging: config.verboseLogging !== undefined ? config.verboseLogging : false,

    async initBrowser() {
        if (!this.browser || !this.isInitialized) {
            try {
                console.log('Initializing browser instance...');
                this.browser = await puppeteer.launch({
                    headless: 'new',
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--enable-logging',
                        '--v=1'
                    ],
                    dumpio: true
                });
                this.isInitialized = true;
                console.log('Browser initialized successfully');

                this.browser.on('targetcreated', async (target) => {
                    if (this.enableVerboseLogging) {
                        console.log(`[Browser] New target created: ${target.type()} - ${target.url()}`);
                    }
                });

                this.browser.on('targetchanged', async (target) => {
                    if (this.enableVerboseLogging) {
                        console.log(`[Browser] Target changed: ${target.type()} - ${target.url()}`);
                    }
                });

                this.browser.on('targetdestroyed', async (target) => {
                    if (this.enableVerboseLogging) {
                        console.log(`[Browser] Target destroyed: ${target.type()} - ${target.url()}`);
                    }
                });

                this.browser.on('disconnected', () => {
                    console.log('[Browser] Browser disconnected');
                    this.isInitialized = false;
                    this.browser = null;
                });

                process.on('SIGINT', () => this.cleanup());
                process.on('SIGTERM', () => this.cleanup());
                process.on('exit', () => this.cleanup());
            } catch (error) {
                console.error('Failed to initialize browser:', error);
                throw error;
            }
        }
        return this.browser;
    },

    async getPage() {
        await this.initBrowser();

        if (this.pagePool.length > 0) {
            const page = this.pagePool.pop();
            console.log(`[Page Pool] Reusing page from pool (${this.pagePool.length} remaining)`);
            return page;
        }

        console.log('[Page Pool] Creating new page');
        const page = await this.browser.newPage();

        await page.setViewport({ width: 1920, height: 1080 });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            const url = request.url();
            request.continue();
        });

        page.on('requestfailed', (request) => {
            const failure = request.failure();
            if (failure) {
                console.error(`[Request Failed] ${request.url()}: ${failure.errorText}`);
            }
        });

        page.on('response', (response) => {
            const status = response.status();
            const url = response.url();

            if (status >= 400) {
                console.error(`[HTTP Error] ${status} - ${url}`);
            } else if (this.enableVerboseLogging && status >= 300 && status < 400) {
                console.log(`[HTTP Redirect] ${status} - ${url}`);
            }
        });

        page.on('console', async (msg) => {
            const type = msg.type();
            const text = msg.text();
            const location = msg.location();

            let prefix = '[Page Console]';
            let logMethod = console.log;

            switch(type) {
                case 'error':
                    prefix = '[Page Console ERROR]';
                    logMethod = console.error;
                    break;
                case 'warning':
                    prefix = '[Page Console WARN]';
                    logMethod = console.warn;
                    break;
                case 'info':
                    prefix = '[Page Console INFO]';
                    break;
                case 'debug':
                    if (!this.enableVerboseLogging) return;
                    prefix = '[Page Console DEBUG]';
                    break;
                default:
                    prefix = `[Page Console ${type.toUpperCase()}]`;
            }

            const args = [];
            try {
                for (const arg of msg.args()) {
                    const value = await arg.jsonValue().catch(() => arg.toString());
                    args.push(value);
                }
            } catch (e) {
                args.push(text);
            }

            const locationStr = location.url ? ` (${location.url}:${location.lineNumber}:${location.columnNumber})` : '';
            logMethod(`${prefix}${locationStr}:`, args.length > 0 ? args : text);
        });

        page.on('pageerror', (error) => {
            console.error('[Page Error]:', error.message);
            if (error.stack && this.enableVerboseLogging) {
                console.error('[Page Error Stack]:', error.stack);
            }
        });

        page.on('error', (error) => {
            console.error('[Page Crashed]:', error);
        });

        page.on('dialog', async (dialog) => {
            console.log(`[Page Dialog] ${dialog.type()}: ${dialog.message()}`);
            await dialog.dismiss();
        });

        page.on('frameattached', (frame) => {
            if (this.enableVerboseLogging) {
                console.log(`[Frame Attached] ${frame.url()}`);
            }
        });

        page.on('framenavigated', (frame) => {
            if (this.enableVerboseLogging) {
                console.log(`[Frame Navigated] ${frame.url()}`);
            }
        });

        page.on('load', () => {
            if (this.enableVerboseLogging) {
                console.log('[Page Event] Load event fired');
            }
        });

        page.on('domcontentloaded', () => {
            if (this.enableVerboseLogging) {
                console.log('[Page Event] DOMContentLoaded event fired');
            }
        });

        await page.evaluateOnNewDocument(() => {
            window.addEventListener('error', (e) => {
                console.error('Window error:', e.message, 'at', e.filename, ':', e.lineno, ':', e.colno);
            });

            window.addEventListener('unhandledrejection', (e) => {
                console.error('Unhandled promise rejection:', e.reason);
            });
        });

        return page;
    },

    async releasePage(page) {
        try {
            await page.goto('about:blank');

            if (this.pagePool.length < this.maxPages) {
                console.log(`[Page Pool] Returning page to pool (${this.pagePool.length + 1}/${this.maxPages})`);
                this.pagePool.push(page);
            } else {
                console.log('[Page Pool] Pool full, closing page');
                await page.close();
            }
        } catch (error) {
            console.error('Error releasing page:', error);
            try {
                await page.close();
            } catch (closeError) {
                console.error('Error closing page:', closeError);
            }
        }
    },

    async getWebWithRetry(url, attempt = 1) {
        const page = await this.getPage();

        try {
            const pageTimeout = config.pageLoad?.timeout || 30000;
            // Use domcontentloaded as fallback if networkidle is taking too long
            const waitUntil = config.pageLoad?.waitUntil || 'domcontentloaded';

            console.log(`\n${'='.repeat(80)}`);
            console.log(`[Attempt ${attempt}/${this.retryAttempts}] Navigating to: ${url}`);
            console.log(`[Settings] Timeout: ${pageTimeout}ms, WaitUntil: ${waitUntil}`);
            console.log(`${'='.repeat(80)}`);

            const startTime = Date.now();

            await page.goto(url, {
                waitUntil: waitUntil,
                timeout: pageTimeout
            });

            const loadTime = Date.now() - startTime;
            console.log(`[Navigation] Page loaded in ${loadTime}ms`);

            const metrics = await page.metrics();
            if (this.enableVerboseLogging) {
                console.log('[Performance Metrics]:', {
                    TaskDuration: `${metrics.TaskDuration?.toFixed(2)}ms`,
                    JSHeapUsedSize: `${(metrics.JSHeapUsedSize / 1024 / 1024).toFixed(2)}MB`,
                    Nodes: metrics.Nodes,
                    LayoutCount: metrics.LayoutCount,
                    RecalcStyleCount: metrics.RecalcStyleCount
                });
            }

            await page.waitForSelector('body', { timeout: 5000 }).catch(() => {
                console.log('[Wait] Body element not found within 5s, continuing...');
            });

            // For SPAs, wait longer to ensure JavaScript has time to render content
            const waitTime = Math.min(5000, pageTimeout / 6);
            console.log(`[Wait] Waiting ${waitTime}ms for SPA JavaScript to render content...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));

            // Try to wait for common SPA indicators
            await Promise.race([
                page.waitForSelector('a[href]', { timeout: 3000 }),
                page.waitForFunction(() => document.querySelectorAll('a[href]').length > 0, { timeout: 3000 })
            ]).catch(() => {
                console.log('[Wait] No links found yet, proceeding anyway...');
            });

            const links = await page.evaluate(() => {
                const anchors = document.querySelectorAll('a[href]');
                const uniqueLinks = new Set();

                console.log(`Found ${anchors.length} anchor elements on page`);

                anchors.forEach(anchor => {
                    try {
                        const href = anchor.href;
                        if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                            const url = new URL(href, window.location.origin);
                            uniqueLinks.add(url.href);
                        }
                    } catch (e) {
                        console.error('Error processing anchor:', e.message);
                    }
                });

                console.log(`Extracted ${uniqueLinks.size} unique valid links`);
                return Array.from(uniqueLinks);
            });

            console.log(`[Success] Fetched ${links.length} unique links from ${url}`);
            console.log(`${'='.repeat(80)}\n`);

            await this.releasePage(page);

            return links;

        } catch (error) {
            console.error(`${'!'.repeat(80)}`);

            if (error.name === 'TimeoutError') {
                console.error(`[TIMEOUT ERROR] ${url} - Attempt ${attempt}/${this.retryAttempts}`);
                console.error(`[Details] Page failed to load within ${config.pageLoad?.timeout || 30000}ms`);
            } else {
                console.error(`[ERROR] ${url} - Attempt ${attempt}/${this.retryAttempts}`);
                console.error(`[Error Type] ${error.name}`);
                console.error(`[Error Message] ${error.message}`);
                if (this.enableVerboseLogging && error.stack) {
                    console.error(`[Stack Trace]\n${error.stack}`);
                }
            }

            console.error(`${'!'.repeat(80)}\n`);

            await this.releasePage(page);

            if (attempt < this.retryAttempts) {
                console.log(`[Retry] Waiting ${this.retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.getWebWithRetry(url, attempt + 1);
            }

            console.error(`[FAILED] Unable to fetch ${url} after ${this.retryAttempts} attempts`);
            return [];
        }
    },

    async getWeb(url) {
        try {
            return await this.getWebWithRetry(url);
        } catch (error) {
            console.error(`[CRITICAL ERROR] ${url}:`, error);
            return [];
        }
    },

    async cleanup() {
        console.log('\n[Cleanup] Starting browser cleanup...');

        try {
            for (const page of this.pagePool) {
                await page.close().catch(err => console.error('[Cleanup] Error closing pooled page:', err));
            }
            this.pagePool = [];
            console.log('[Cleanup] All pooled pages closed');

            if (this.browser) {
                await this.browser.close().catch(err => console.error('[Cleanup] Error closing browser:', err));
                this.browser = null;
                this.isInitialized = false;
                console.log('[Cleanup] Browser instance closed');
            }

            console.log('[Cleanup] Browser cleanup completed successfully');
        } catch (error) {
            console.error('[Cleanup] Error during cleanup:', error);
        }
    }
};

module.exports = WebService;
