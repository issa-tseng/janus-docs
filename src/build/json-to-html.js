// 1. Read in all required data from disk.
const { readFileSync, writeFileSync } = require('fs');
const readFileAsUtf8Sync = (path) => readFileSync(path, 'utf8');
const [ , , indexFile, tocFile, articleFile, outFile ] = process.argv;
const [ html, tocData, articleData ] = [ indexFile, tocFile, articleFile ].map(readFileAsUtf8Sync);

// 2. Initialize a DOM for rendering.
const $ = require('janus-dollar');
const dom = $(`<div>${html}</div>`);

// 3. Obtain a Docs application.
const { baseApp } = require('../base');
const urlPath = articleFile.replace(/(^dist)|((?:index)?.json$)/g, '');
const app = baseApp(urlPath);

// 4a. Render a table of contents in the appropriate place.
const { Tocs } = require('../model/toc');
const toc = Tocs.deserialize(JSON.parse(tocData));
const tocView = app.view(toc);
dom.find('#left nav').append(tocView.artifact());

// 4b. Render the main article in the appropriate place.
const { Article } = require('../model/article');
const article = Article.deserialize(JSON.parse(articleData));
const articleView = app.view(article);
dom.find('#main').append(articleView.artifact());

// 5. Attach model data to the page.
const inlineScript = $('<script/>');
inlineScript.text(`init(${[ tocData, articleData ].join(',')})`);
dom.find('script').after(inlineScript);

// 6. Write our HTML output.
writeFileSync(outFile, dom.get(0).innerHTML, 'utf8');

