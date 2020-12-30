
const fs = require('fs');
const util = require('util');
const puppeteer = require('puppeteer');
const short = require('short-uuid');
const readFile = util.promisify(fs.readFile);
const { spawn } = require('child_process');
const fsExtra = require('fs-extra')
const { ArgumentParser } = require('argparse');
const { version } = require('./package.json');
const { exception } = require('console');
 
const log = console.log;
const FPS = 25;
const MAX_FILENAME_DIGS = 7;
let cntr = 0;
let totalFrames = 0;
const FRAMES_DIR = 'frames';


const parser = new ArgumentParser({
  description: `Scriptimate v${version}`
});
 
parser.add_argument('-v', '--version', { action: 'version', version });
parser.add_argument('-f', '--format', { help: 'format webm or mp4', default: 'mp4' });
parser.add_argument('-fn', '--filename', { help: 'filename', default: 'out' });

 
const proc_args = parser.parse_args();

let parts = {};
let html = '';

const genHtml = () => {
  const inner = Object.values(parts).sort((a,b) => {
      return a.index - b.index
  }).reduce((acc, p) => {
    return `${acc}<div style="position:fixed;top:${p.top}px;left:${p.left}px;opacity:${p.opacity};transform:scale(${p.scale})">${p.content}</div>`
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
          transform: scale(1.2);
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
    scale: +scale || 1.0,
  };
  genHtml()
}

const script = `
place board 0 0
place signin_board_task 17 149
place transaction_list_board_task 17 253
place app_backplate 361 383 0.2
place app_signin_task 576 568 0.2

place app_transaction_list_task 852 568 0.2
place highliter 576 568 0.0


place cursor 321 323
animate_400 move cursor 755 22
animate_100 scale cursor 1.6
animate_50 scale cursor 1
animate_200 opacity app_backplate 1; opacity app_signin_task 1; oppacity app_transaction_list_task 1
animate_500 move cursor 755 22
animate_500 move cursor 755 568
animate_200 opacity highliter 1; move cursor 739 701
animate_100 scale cursor 1.6
animate_50 scale cursor 1
`;

// todo recover shadow at place - add class




(async () => {
  fsExtra.emptyDirSync(FRAMES_DIR);
  log(`Foramt selected ${proc_args.format}, filename ${proc_args.filename}.${proc_args.format}`)
  const browser = await puppeteer.launch({args: ['--window-size=2320,1000'],});
  const page = await browser.newPage();

  const doFrame = async () => {
    genHtml()
    await page.setContent(html);
    await page.screenshot({path: `${FRAMES_DIR}/${(''+cntr).padStart(MAX_FILENAME_DIGS, '0')}.png`});
    cntr += 1;
    log(`Frames gen: ${(cntr * 100.0 / (totalFrames + 1)).toFixed(2)}%`)
  }

  await page.setViewport({width: 2320, height: 0, deviceScaleFactor:2});
  await page._client.send('Emulation.clearDeviceMetricsOverride');

  let totalMs = 0;
  for (v of script.split('\n')) {
    const d1 = v.split(' ');
    const cmd = d1[0];
    if (cmd.startsWith('animate_')) {
      totalMs += +cmd.replace('animate_', '');
    }
  }
  totalFrames = totalMs / 1.0e3 * FPS;

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
            const dstScale = +ags_arr[2];
            if (!freezer[svg]) {
              freezer[svg] = {scale: parts[svg].scale};
            }
            parts[svg].scale = freezer[svg].scale + (dstScale - freezer[svg].scale) * i / frames;
          } else if (action === 'opacity') {
            const dstOpacity = +ags_arr[2];
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
  log('Frames generation done')

  fs.writeFile("index.html", html, function(err) {
    if(err) {
        return console.log(err);
    }
    log("The index.html file was saved!");
  });

  let ffmpeg_args = ['-framerate', `${FPS}/1`, '-i', `${FRAMES_DIR}/%0${MAX_FILENAME_DIGS}d.png`, '-r', ''+FPS, `${proc_args.filename}.${proc_args.format}`, '-y'];
  if (proc_args.format === 'webm') {
    ffmpeg_args = [...ffmpeg_args, '-c:v', 'libvpx-vp9', '-b:v', '2M']
  } else if (proc_args.format === 'mp4') {
    ffmpeg_args = [...ffmpeg_args, '-c:v', 'libx264',]
  } else {
    throw exception(`Unknown format: ${proc_args.format}`);
  }
  const ls = spawn('ffmpeg', ffmpeg_args);

  ls.stdout.on('data', (data) => {
    console.log(`ffmpeg: ${data}`);
  });
  
  ls.stderr.on('data', (data) => {
    console.error(`ffmpeg: ${data}`);
  });
  
  ls.on('close', (code) => {
    console.log(`ffmpeg exited with code ${code}`);
  });
  

})();