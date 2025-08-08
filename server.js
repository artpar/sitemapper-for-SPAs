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

const http = require('http');
const config = require('./config');
const pages = config.urls;
const crawler = require('./crawler');
const webService = require('./utils/web');

const app = http.createServer((req, res) => {  
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Sitemap generator!\n');
});

async function crawlBusiness() {
    try {
        console.log('Starting sitemap generation...');
        console.log(`Mode: ${config.autoCrawl ? 'Auto-crawl' : 'Manual'}`);
        
        if (!config.autoCrawl) {
            console.log(`Processing ${pages.length} URLs manually...`);
            
            const promises = pages.map(page => crawler.getXml(page, pages.length));
            await Promise.all(promises);
        } else {
            console.log(`Starting auto-crawl from base URL: ${config.base}`);
            console.log(`Crawl level: ${config.crawlLevel}`);
            
            process.setMaxListeners(Infinity);
            crawler.processes.push(config.base);
            await crawler.autoFetch();
        }
    } catch (e) {
        console.error('Error during crawling:', e);
        await cleanup();
    }
}

async function cleanup() {
    console.log('Performing cleanup...');
    try {
        await webService.cleanup();
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
    process.exit(0);
}

process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await cleanup();
});

process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await cleanup();
});

process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await cleanup();
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await cleanup();
});

startServer();

function startServer() {
    const server = app.listen(process.env.PORT || 8090, err => {
        if (err) return console.error(err);
        const port = server.address().port;
        console.info(`App listening on port ${port}`);
        crawlBusiness();
    });
}
