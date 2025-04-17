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

const config = require('../config');

const Rules = {

    checkRules(hrefs) {
        // Use filter for cleaner code
        return hrefs.filter(url => this.doNotIgnore(url));
    },

    notExemptions(url) {
        // Early returns for quick filtering
        if (config.disableHashRoutes && url.includes('#')) {
            return false;
        }

        if (!url.includes(config.strictPresence)) {
            return false;
        }

        // Check if URL contains any of the strings to ignore
        return !config.ignoreStrings.some(ignoreString => url.includes(ignoreString));
    },

    doNotIgnore(url) {
        return this.notExemptions(url);
    },

    sortLinks(links) {
        switch (config.sortBy) {
            case 'asc':
                console.log('Sorting in asc');
                return links.sort();
            case 'dsc':
                console.log('Sorting in dsc');
                return links.sort().reverse();
            default:
                console.log('No sort');
                return links;
        }
    }
}

module.exports = Rules;