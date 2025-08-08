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

const rulesService = require('./utils/rules');
const filesService = require('./utils/files');
const webService = require('./utils/web');
const _ = require('lodash');
const config = require('./config');

const crawler = {

    counter: 0,
    allUrls: [],
    processes: [],
    processesCompleted: [],
    dataFetched: 0,
    baseUrlHashes: config.base.split('/').length,
    isProcessing: false,
    maxConcurrent: 3,
    activeRequests: 0,

    async getXml(xmUrl, limit) {
        console.log(`Queuing ${xmUrl}`);
        try {
            const data = await webService.getWeb(xmUrl);
            console.log(`Data received for ${xmUrl}: ${data.length} links`);
            this.counter = this.counter + 1;
            this.allUrls = _.union(this.allUrls, rulesService.checkRules(data));
            
            if (this.counter === limit) {
                await this.finalizeSitemap();
            }
        } catch (e) {
            console.error(`Error processing ${xmUrl}:`, e);
            this.counter = this.counter + 1;
            
            if (this.counter === limit) {
                await this.finalizeSitemap();
            }
        }
    },

    async autoFetch() {
        if (this.isProcessing) {
            console.log('Already processing, skipping duplicate call');
            return;
        }
        
        this.isProcessing = true;
        
        try {
            while (this.processes.length > 0 || this.activeRequests > 0) {
                while (this.processes.length > 0 && this.activeRequests < this.maxConcurrent) {
                    const xmUrl = this.processes.pop();
                    
                    if (!xmUrl || this.processesCompleted.includes(xmUrl)) {
                        continue;
                    }
                    
                    this.processesCompleted.push(xmUrl);
                    this.activeRequests++;
                    this.counter++;
                    
                    this.fetchUrl(xmUrl).catch(err => {
                        console.error(`Error in fetchUrl for ${xmUrl}:`, err);
                    }).finally(() => {
                        this.activeRequests--;
                        this.dataFetched++;
                        
                        if (this.processes.length === 0 && this.activeRequests === 0) {
                            this.checkCompletion();
                        }
                    });
                }
                
                if (this.activeRequests > 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            if (this.counter > 0 && this.dataFetched === this.counter) {
                await this.finalizeSitemap();
            }
        } catch (error) {
            console.error('Error in autoFetch:', error);
            await this.finalizeSitemap();
        } finally {
            this.isProcessing = false;
        }
    },

    async fetchUrl(xmUrl) {
        console.log(`[${this.dataFetched + 1}/${this.counter}] Fetching ${xmUrl}`);
        
        try {
            const data = await webService.getWeb(xmUrl);
            console.log(`Data received for ${xmUrl}: ${data.length} links found`);
            
            const newUrls = rulesService.checkRules(data);
            this.allUrls = _.union(this.allUrls, newUrls);
            
            console.log(`Progress: Queued ${this.counter} - Completed ${this.dataFetched + 1} - Active ${this.activeRequests}`);
            
            if (config.autoCrawl && newUrls.length > 0) {
                this.queueUrls(newUrls);
            }
        } catch (error) {
            console.error(`Failed to fetch ${xmUrl}:`, error.message);
        }
    },

    queueUrls(urls) {
        const removingCompleted = _.uniq(_.without(urls, ...this.processesCompleted));
        const removingQueued = _.without(removingCompleted, ...this.processes);
        
        const removingIgnoreLevels = _.filter(removingQueued, (url) => {
            const urlParts = url.split('/').filter(part => part.length > 0);
            const baseParts = config.base.split('/').filter(part => part.length > 0);
            return urlParts.length <= (baseParts.length + config.crawlLevel);
        });
        
        const urlsIgnored = _.difference(removingQueued, removingIgnoreLevels);
        
        if (urlsIgnored.length > 0) {
            console.log(`Ignoring ${urlsIgnored.length} URLs due to crawl level restrictions`);
            this.processesCompleted.push(...urlsIgnored);
        }
        
        const newUrls = removingIgnoreLevels.filter(url => !this.processesCompleted.includes(url));
        
        if (newUrls.length > 0) {
            console.log(`Adding ${newUrls.length} new URLs to queue`);
            this.processes = _.uniq([...this.processes, ...newUrls]);
        }
    },

    checkCompletion() {
        console.log(`Checking completion: Counter=${this.counter}, DataFetched=${this.dataFetched}, ActiveRequests=${this.activeRequests}`);
        
        if (this.counter === this.dataFetched && this.activeRequests === 0) {
            setImmediate(() => this.finalizeSitemap());
        }
    },

    async finalizeSitemap() {
        console.log(`Finalizing sitemap with ${this.allUrls.length} unique URLs`);
        
        await webService.cleanup();
        
        const sortedUrls = rulesService.sortLinks(this.allUrls);
        filesService.createXml(sortedUrls);
    }
};

module.exports = crawler;