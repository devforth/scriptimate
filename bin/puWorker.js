
const util = require('util');
const puppeteer = require('puppeteer');
const  fs = require("fs");

const MAX_FILENAME_DIGS = 7;

fs.writeFileSync("/tmp/test.txt", JSON.stringify(process.argv), () => {})

const input = {
    pageW: +process.argv[2],
    pageH: +process.argv[3],
    index: +process.argv[4], 
    totalFramesCount: +process.argv[5],
    framesDir: process.argv[6],
    skipFrames: 0,
    format: process.argv[7],
    quality: process.argv[8],
}

const fileHtml = fs.readFileSync(`${input.framesDir}/_index${(''+input.index).padStart(MAX_FILENAME_DIGS, '0')}.html`, 'utf8')
const jpegFileName = `${input.framesDir}/${(''+(input.index - input.skipFrames)).padStart(MAX_FILENAME_DIGS, '0')}.${input.format}`;

const genScreenshots = async () => {
    const browser = await puppeteer.launch({args: [
        `--window-size=${input.pageW},${input.pageH}`,
        '--no-sandbox',
        '--disk-cache-dir=/tmp/pup',
    ], headless: true,});

    const page = await browser.newPage();
    await page.setViewport({width: input.pageW, height: input.pageH, deviceScaleFactor: 1});
    await page._client.send('Emulation.clearDeviceMetricsOverride');
    await page.setContent(fileHtml);
    await page.screenshot({path: jpegFileName, type: input.format, omitBackground: true});

    process.exit();
}

genScreenshots()