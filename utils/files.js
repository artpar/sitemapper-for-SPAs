/*
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
 */

const fs = require('fs');

const FilesService = {
    /**
     * Creates XML sitemap and JSON file from array of URLs
     * @param {string[]} hrefs - Array of URLs to include in sitemap
     */
    createXml(hrefs) {
        try {
            // XML header
            const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>\n' +
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
                'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
                'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';
            
            // Current date for lastmod
            const today = new Date().toISOString().split('T')[0];
            
            // Generate URL entries
            const urlEntries = hrefs.map(href => {
                return `\n<url>\n    <loc>${href}</loc>\n    <changefreq>weekly</changefreq>\n    <lastmod>${today}</lastmod>\n    <priority>0.8</priority>\n</url>`;
            });
            
            // Combine all parts
            const xmlContent = xmlHeader + urlEntries.join('') + '\n</urlset>';
            
            console.log(`Creating sitemap for ${hrefs.length} links`);
            
            // Write files
            fs.writeFileSync('sitemap.xml', xmlContent, 'utf-8');
            fs.writeFileSync('sitemap.json', JSON.stringify({
                'hrefs': hrefs, 
                'generatedAt': new Date().toISOString(),
                'count': hrefs.length
            }, null, 2), 'utf-8');
            
            console.log('Sitemap generation completed successfully!');
            
            // Use a more graceful exit with a small delay
            setTimeout(() => process.exit(0), 100);
        } catch (error) {
            console.error('Error creating sitemap:', error);
            process.exit(1);
        }
    }
};

module.exports = FilesService;
