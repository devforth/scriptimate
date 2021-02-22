#!/usr/bin/env node

const {promises: fs} = require('fs');
const util = require('util');
const puppeteer = require('puppeteer');
const short = require('short-uuid');
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
parser.add_argument('-t', '--threads', { help: 'Threads count', default: 4 });
parser.add_argument('-fs', '--fromsecond', { help: 'Start from second', default: 0 });
parser.add_argument('-d', '--debughtml', { help: 'Create html files near image to debug', default: false });
parser.add_argument('-i', '--input', { help: 'Input .scrp file', default: null });


 
const proc_args = parser.parse_args();

const parts = {};
const timers = {};
const boxholes = {};
let pageScale = 1;
let pageW;
let pageH;

const genHtml = () => {
  const inner = Object.values(parts).sort((a,b) => {
      return a.index - b.index
  }).reduce((acc, p) => {
    if (p.type === 'part') {
      const bh = boxholes[p.toBoxHole] || {left: 0, top:0};

      const partHTML = `<div style="position:${bh.name ? "absolute": "fixed"};top:${p.top-bh.top}px;left:${p.left-bh.left}px;opacity:${p.opacity};transform:scale(${p.scale});${p.extrastyle}">${p.content}</div>`;
      if (p.toBoxHole) {
        return `${acc}<div style="position:fixed;overflow:hidden;top:${bh.top}px;left:${bh.left}px;width:${bh.w}px;height:${bh.h}px;">
          ${partHTML}</div>`;
      } else {
        return `${acc}${partHTML}`;
      }
    } else if (p.type === 'block') {
      return `${acc}<div style="position:fixed;top:${p.top}px;left:${p.left}px;width:${p.w}px;height:${p.h}px;opacity:${p.opacity};${p.extrastyle}">${p.content}</div>`
    }
  }, '');
  return `<html>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com">
        <link href="https://fonts.googleapis.com/css2?family=Open+Sans&display=swap" rel="stylesheet">
        <style>
        * {
          -webkit-font-smoothing:antialiased;
          -moz-osx-font-smoothing:grayscale;
        }
        body {
          transform-origin: top left;
          transform: scale(${pageScale});
          margin: 0;
        }
        </style>
      </head>
    <body>${inner}</body>
  </html>`;
}
String.prototype.replaceAll = function(target, replacement) {
  return this.split(target).join(replacement);
};

function firstDefined(...vals) {
  for (let i = 0; i < vals.length; i += 1) {
    if (vals[i] !== undefined) {
      return vals[i];
    }
  }
  return undefined;
}


const addPart = async (filename, left, top, opacity, scale, toBoxHole) => {
  const f = await fs.readFile(`src/${filename}.svg`, 'utf-8');
  const partIds = {};
  let withUniquifiedIDs = f.replace(/id="(.*?)"/g, (_, v) => {
    if (!partIds[v]) {
      partIds[v] = `id_${short.generate()}`;
    }
    return `id="${partIds[v]}"`;
  });
  Object.keys(partIds).forEach((u) => {
    withUniquifiedIDs = withUniquifiedIDs.replaceAll(`#${u}`, `#${partIds[u]}`);
  })
  parts[filename] = {
    type: 'part',
    filename,
    content: withUniquifiedIDs,
    top: +firstDefined(top, 0),
    left: +firstDefined(left, 0),
    opacity: +firstDefined(opacity, 1),
    index: Object.values(parts).length,
    scale: +firstDefined(scale, 1.0),
    extrastyle: '',
    toBoxHole,
  };
};

const addDiv = async (name, left, top, w, h, opacity, ...rest) => {
  const content = rest.join(' ').replaceAll('"', '').replaceAll("'", '');
  parts[name] = {
    type: 'block',
    name,
    top: +firstDefined(top, 0),
    left: +firstDefined(left, 0),
    opacity: +firstDefined(opacity, 1),
    w: +firstDefined(w, 0),
    h: +firstDefined(h, 0),
    index: Object.values(parts).length,
    content: content,
  }
}

const addBoxHole = async (name, left, top, w, h) => {
  boxholes[name] = {
    name,
    top: +firstDefined(top, 0),
    left: +firstDefined(left, 0),
    w: +firstDefined(w, 0),
    h: +firstDefined(h, 0),
  }
}

const setPseudoInterval = (f, ms) => {
  const o = {
    t: 0,
    tick(passed_ms) {
      this.t += passed_ms;
      if (this.t >= ms) {
        f();
        this.t = 0;
      }
    }
  }
  return o;
}

const addStyle = async (part, style) => {
  if (!parts[part]) {
    log(`WARN: style not applied, part not found: ${part}`)
    return
  }
  parts[part].extrastyle = style;
}

const schedule_eval = async (name, ms, ...rest) => {
  const code = rest.join(' ');
  // todo check that timer already scheduled and drop warn
  timers[name] = setPseudoInterval(
    () => {
      const incr = (part) => {
        parts[part].content = +parts[part].content + 1;
      }
      const get = (part) => {
        return parts[part].content;
      }
      const set = (part, value) => {
        parts[part].content = value;
      }
      eval(code)
    },
    +ms
  )
}

const unschedule = async (name) => {
  // chack that schedulled and drop warn
  delete timers[name];
}

const script = await fs.readFile(proc_args.input);
if (! script) {
  throw "Please specify .scrp file e.g. -i demo.scrp"
}


const framesHTMLs = [];

const arrayChunks = (arr, size) => arr.reduce((acc, e, i) => (i % size ? acc[acc.length - 1].push(e) : acc.push([e]), acc), []);

let skipFrames = 0;

(async () => {

  const doFrame = async () => {
    const html = genHtml();
    if (cntr < skipFrames) {
      cntr += 1;
      return;
    }
    framesHTMLs.push({
      path: `${FRAMES_DIR}/${(''+(cntr - skipFrames)).padStart(MAX_FILENAME_DIGS, '0')}.jpg`,
      html,
    });
    
    if (proc_args.debughtml) {
      await fs.writeFile(`${FRAMES_DIR}/_index${(''+cntr).padStart(MAX_FILENAME_DIGS, '0')}.html`, html, function(err) {
        if(err) {
            return console.log(err);
        }
      });
    }
    
    cntr += 1;
    log(`HTML pages gen: ${(cntr * 100.0 / (totalFrames + 1)).toFixed(2)}%`, '\033[F');
  }

  
  let totalMs = 0;
  for (v of script.split('\n')) {
    const d1 = v.split(' ');
    const cmd = d1[0];
    if (cmd.startsWith('animate_')) {
      totalMs += +cmd.replace('animate_', '');
      totalFrames += Math.round(+cmd.replace('animate_', '') / 1.0e3 * FPS);
    }
  }

  fsExtra.emptyDirSync(FRAMES_DIR);

  for (v of script.split('\n')) {
    const d1 = v.split(' ');
    const cmd = d1[0];
    let argSets = d1.slice(1).join(' ');
    
    if (argSets) {
      argSets = argSets.split('&&');
    }
    if (cmd === 'init_page') {
      if (pageW) {
        continue;
      }
      const args = argSets[0].split(' ');
      pageScale = firstDefined(args[2], 1);
      pageW = Math.round(args[0] * pageScale);
      pageH = Math.round(args[1] * pageScale);
      if (proc_args.fromsecond) {
        skipFrames = proc_args.fromsecond * FPS;
      }
      log(`🎥 Foramt selected: ${proc_args.format}
📁 Filename ${proc_args.filename}.${proc_args.format}
📺 Resolution: ${pageW}x${pageH}
🕗 Total duration: ${(totalMs / 1e3).toFixed(1)}s FPS: ${FPS}
✂ Start from second: ${proc_args.fromsecond}s
  \n`);
    }
    else if (cmd === 'place') {
      let args = argSets[0].split(' ');
      await addPart(...args);
    }
    else if (cmd === 'place_div') {
      let args = argSets[0].split(' ');
      await addDiv(...args);
    }
    else if (cmd === 'place_boxhole') {
      let args = argSets[0].split(' ');
      await addBoxHole(...args);
    }
    else if (cmd === 'schedule_eval') {
      let args = argSets[0].split(' ');
      await schedule_eval(...args);
    }
    else if (cmd === 'unschedule') {
      let args = argSets[0].split(' ');
      await unschedule(...args);
    }
    
    else if (cmd === 'addstyle') {
      let args =  argSets[0].split(' ');
      await addStyle(args[0], args.slice(1).join(' '));
    }
    else if (cmd.startsWith('animate_')) {
      const ms = +cmd.replace('animate_', '');
      const freezer = {};
      const frames = Math.round(ms / 1.0e3 * FPS);
      for (i = 1; i <= frames; i += 1) {
        Object.values(timers).forEach((t) => t.tick(1000.0 / FPS));
        await doFrame();
        for (let ags of argSets) {
          const ags_arr = ags.trim().split(' ');
          const action = ags_arr[0];
          if (action === 'move') {
            const svg = ags_arr[1];
            if (!parts[svg]) {
              log(`WARN: opacity not applied, part not found: ${svg}, line: \n${cmd}\n`);
              continue;
            }
            const dstLeft = ags_arr[2] === '-' ? parts[svg].left : +ags_arr[2];
            const dstTop =  ags_arr[3] === '-' ? parts[svg].top : +ags_arr[3];
            if (!freezer[svg]) {
              freezer[svg] = {top: parts[svg].top, left: parts[svg].left};
            }
            parts[svg].top = freezer[svg].top + (dstTop - freezer[svg].top) * i / frames;
            parts[svg].left = freezer[svg].left + (dstLeft - freezer[svg].left) * i / frames;
            // log('parts[svg].left', svg, dstLeft, parts[svg].left)
          } else if (action === 'scale') {
            const svg = ags_arr[1];
            if (!parts[svg]) {
              log(`WARN: opacity not applied, part not found: ${svg}, line: \n${cmd}\n`);
              continue;
            }
            const dstScale = +ags_arr[2];
            if (!freezer[svg]) {
              freezer[svg] = {scale: parts[svg].scale};
            }
            parts[svg].scale = freezer[svg].scale + (dstScale - freezer[svg].scale) * i / frames;
          } else if (action === 'opacity') {
            const svg = ags_arr[1];
            if (!parts[svg]) {
              log(`WARN: opacity not applied, part not found: ${svg}, line: \n${cmd}\n`);
              continue;
            }
            const dstOpacity = +ags_arr[2];
            if (!freezer[svg]) {
              freezer[svg] = {opacity: parts[svg].opacity};
            }
            parts[svg].opacity = freezer[svg].opacity + (dstOpacity - freezer[svg].opacity) * i / frames;
          } else if (action === 'resize_div') {
            const svg = ags_arr[1];
            if (!parts[svg]) {
              log(`WARN: resize_div not applied, part not found: ${svg}, line: \n${cmd}\n`);
              continue;
            }
            if (parts[svg].type !== 'block') {
              log(`WARN: resize_div could be applied only to type block: not ${parts[svg].type}, part: ${svg}, line: \n${cmd}\n`);
              continue;
            }
            const dstW = ags_arr[2] === '-' ? parts[svg].w : +ags_arr[2];
            const dstH =  ags_arr[3] === '-' ? parts[svg].h : +ags_arr[3];
            if (!freezer[svg]) {
              freezer[svg] = {w: parts[svg].w, h: parts[svg].h};
            }
            parts[svg].h = freezer[svg].h + (dstH - freezer[svg].h) * i / frames;
            parts[svg].w = freezer[svg].w + (dstW - freezer[svg].w) * i / frames;
          }

          
        }

      }
    }
  }
  await doFrame();

  log('✅ HTML generation done')
  const THREADS = + proc_args.threads;
  let totalGenCntr = 0;
  

  const genScreenshots = async (seq) => {
    const browser = await puppeteer.launch({args: [
      `--window-size=${pageW},${pageH}`, 
      '--no-sandbox',
      '--disk-cache-dir=/tmp/pup'
    ], headless: true,});
    
    for (let o of seq) {
      const page = await browser.newPage();
      await page.setViewport({width: pageW, height: pageH, deviceScaleFactor: 1});
      await page._client.send('Emulation.clearDeviceMetricsOverride');
      await page.setContent(o.html);
      await page.screenshot({path: o.path, type: 'jpeg', quality: 100});
      delete o;
      totalGenCntr += 1;
      log(`Frames gen: ${(totalGenCntr * 100.0 / framesHTMLs.length).toFixed(2)}%`, '\033[F');
      await page.close();
      try {
        if (global.gc) {global.gc();}
      } catch (e) {
        console.log("`node --expose-gc index.js`");
        process.exit();
      }
    }
    await browser.close();
  }
  await Promise.all(arrayChunks(framesHTMLs, Math.round(framesHTMLs.length / THREADS) ).map(async (ch) => await genScreenshots(ch)))
  log('✅ Frames generation done')
  

  let ffmpeg_args = ['-framerate', `${FPS}/1`, '-i', `${FRAMES_DIR}/%0${MAX_FILENAME_DIGS}d.jpg`, ];
  if (proc_args.format === 'webm') {
    ffmpeg_args = [...ffmpeg_args, '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-r', ''+FPS, `${proc_args.filename}.${proc_args.format}`, '-y']
  } else if (proc_args.format === 'mp4') {
    ffmpeg_args = [...ffmpeg_args, '-c:v', 'libx264', '-r', ''+FPS, `${proc_args.filename}.${proc_args.format}`, '-y']
  } else {
    throw exception(`Unknown format: ${proc_args.format}`);
  }
  log(`💿 Running encoder:\nffmpeg ${ffmpeg_args.join(' ')}`)
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