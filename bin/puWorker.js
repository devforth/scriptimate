
const util = require('util');
const puppeteer = require('puppeteer');
const  fs = require("fs");

// fs.writeFileSync("/tmp/test.txt", "111", () => {} )


const MAX_FILENAME_DIGS = 7;

fs.writeFileSync("/tmp/test.txt", JSON.stringify(process.argv), () => {})

const input = {
    pageW: +process.argv[2],
    pageH: +process.argv[3],
    index: +process.argv[4], 
    totalFramesCount: +process.argv[5],
    framesDir: process.argv[6],
    skipFrames: 0
}

// fs.writeFileSync("/tmp/test.txt", JSON.stringify(input), () => {})

const fileHtml = fs.readFileSync(`${input.framesDir}/_index${(''+input.index).padStart(MAX_FILENAME_DIGS, '0')}.html`, 'utf8')
const jpegFileName = `${input.framesDir}/${(''+(input.index - input.skipFrames)).padStart(MAX_FILENAME_DIGS, '0')}.jpg`;

const log = console.log;

const genScreenshots = async () => {
    var totalGenCntr = 0;
    const browser = await puppeteer.launch({args: [
        `--window-size=${input.pageW},${input.pageH}`, 
        '--no-sandbox',
        '--disk-cache-dir=/tmp/pup',
    ], headless: true,});

   // for (let o of seq) {
        
        const page = await browser.newPage();
        await page.setViewport({width: input.pageW, height: input.pageH, deviceScaleFactor: 1});
        await page._client.send('Emulation.clearDeviceMetricsOverride');
        await page.setContent(fileHtml);
        await page.screenshot({path: jpegFileName, type: 'jpeg', quality: 100});
        // delete o;
        totalGenCntr += 1;
        const memory = process.memoryUsage().heapUsed / 1024 / 1024;
        log(`Frames gen: ${(totalGenCntr * 100.0 / input.framesCount).toFixed(2)}% Memory: ${memory}`, '\033[F');
        await page.close();
        delete page;
        
        try {
            if (global.gc) {global.gc();}
        } catch (e) {
            console.log("`node --expose-gc index.js`");
            process.exit();
        }
   // }
    await browser.close();
    delete browser; 
}

genScreenshots()