
const fs = require('fs');
const util = require('util');
const puppeteer = require('puppeteer');
const short = require('short-uuid');
const readFile = util.promisify(fs.readFile);

let parts = {};
let html = '';

const genHtml = () => {
  const inner = Object.values(parts).sort((a,b) => {
      return a.index - b.index
  }).reduce((acc, p) => {
    return `${acc}<div style="position:fixed;top:${p.top}px;left:${p.left}px;opacity:${p.opacity}">${p.content}</div>`
  }, '');
  html = `<html>
      <head>
        <style>
        * {
          -webkit-font-smoothing:antialiased;
          -moz-osx-font-smoothing:grayscale;
        }
        body {
          transform-origin: top left;
          transform: scale(2);
        }
        </style>
      </head>
    <body>${inner}</body>
  </html>`;
}
String.prototype.replaceAll = function(target, replacement) {
  return this.split(target).join(replacement);
};
const addPart = async (filename, left, top, opacity, scale) => {
  const f = await readFile(`src/${filename}.svg`, 'utf-8');
  parts[filename] ={
    filename,
    // todo remove ugly fix
    content: f.replaceAll('pattern0', `pattern${short.generate()}`).replaceAll('pattern1', `#pattern${short.generate()}`).replaceAll('pattern2', `#pattern${short.generate()}`).replaceAll('image0', `image${short.generate()}`).replaceAll('image1', `#image${short.generate()}`).replaceAll('image2', `#image${short.generate()}`),
    top: +top || 0,
    left: +left || 0,
    opacity: +opacity||1,
    index: Object.values(parts).length,
    scale: scale || 1.0,
  };
  genHtml()
}

const script = `
place board 0 0
place signin_board_task 17 149
place transaction_list_board_task 17 253
place app_backplate 361 383 0.2
place cursor 321 323
animate_500 move cursor 755 22
animate_30 scale cursor 1.4
animate_50 scale cursor 1
animate_100 opacity app_backplate 1
`;

// todo recover shadow at place - add class

const log = console.log;
const FPS = 25;
let cntr = 0;



(async () => {
  const browser = await puppeteer.launch({args: ['--window-size=2320,1000'],});
  const page = await browser.newPage();

  const doFrame = async () => {
    genHtml()
    await page.setContent(html);
    await page.screenshot({path: `res/${(''+cntr).padStart(6, '0')}.png`});
    cntr += 1;
  }

  await page.setViewport({width: 2320, height: 0, deviceScaleFactor:2});
  await page._client.send('Emulation.clearDeviceMetricsOverride');
  for (v of script.split('\n')) {
    const d1 = v.split(' ');
    const cmd = d1[0];
    let argSets = d1.slice(1).join(' ');

    if (argSets) {
      argSets = argSets.split(';');
    }
    if (cmd === 'place') {
      let args = argSets[0].split(' ');
      await addPart(args[0], args[1], args[2], args[3], args[4]);
    } else if (cmd.startsWith('animate_')) {
      const ms = +cmd.replace('animate_', '');
      const freezer = {};
      const frames = ms / 1.0e3 * FPS;
      for (i = 0; i < frames; i += 1) {
        await doFrame();
        for (let ags of argSets) {
          const ags_arr = ags.split(' ');
          const action = ags_arr[0];
          const svg = ags_arr[1];
          if (action === 'move') {
            const dstLeft = +ags_arr[2];
            const dstTop = +ags_arr[3];
            if (!freezer[svg]) {
              freezer[svg] = {top: parts[svg].top, left: parts[svg].left};
            }
            parts[svg].top = freezer[svg].top + (dstTop - freezer[svg].top) * i / frames;
            parts[svg].left = freezer[svg].left + (dstLeft - freezer[svg].left) * i / frames;
          } else if (action === 'scale') {
            const dstScale = +ags_arr[1];
            if (!freezer[svg]) {
              freezer[svg] = {scale: parts[svg].scale};
            }
            parts[svg].scale = freezer[svg].scale + (dstScale - freezer[svg].scale) * i / frames;
          } else if (action === 'opacity') {
            const dstOpacity = +ags_arr[1];
            if (!freezer[svg]) {
              freezer[svg] = {opacity: parts[svg].opacity};
            }
            parts[svg].opacity = freezer[svg].opacity + (dstOpacity - freezer[svg].opacity) * i / frames;
          }
        }

      }
    }
  }
  await doFrame();




  await browser.close();

  fs.writeFile("index.html", html, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("The file was saved!");
}); 
})();