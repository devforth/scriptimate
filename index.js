
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

const script = `

init_page 1080 881 1

place board 0 0

; valen
place board_transaction_list_task 17 253
addstyle board_transaction_list_task box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35);border-radius:5px

place_div board_valentyn_minutes 319 190 15 14 1 "18"
place_div board_valentyn_seconds 319 205 15 14 1 "2"
addstyle board_valentyn_minutes color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;
addstyle board_valentyn_seconds color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;

schedule_eval valentyn_minutes 500 incr('board_valentyn_seconds'); if (+get('board_valentyn_seconds') >= 60) { incr('board_valentyn_minutes'); set('board_valentyn_seconds', 0)}

; max inactive active task

place board_signin_task 17 149
addstyle board_signin_task box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35);border-radius:5px

; max active task
place signin_board_task_active 302 252 0

place_div board_max_minutes 319 294 15 14 0 "0"
place_div board_max_seconds 319 309 15 14 0 "0"
addstyle board_max_minutes color:white;font-family:'Open Sans';font-weight:bold;font-size:12px;text-align:right;
addstyle board_max_seconds color:white;font-family:'Open Sans';font-weight:bold;font-size:12px;text-align:right;

; board max glow
place bord_max_glow_header 300 0 0

; place app

place app_backplate 145 374 0.4
addstyle app_backplate box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35)

place_boxhole boxhole_app_panel 960 530 112 347
place app_panel_no_track 960 530 0.4 1 boxhole_app_panel
place app_panel_track 1072 530 1 1 boxhole_app_panel

; app tasks
place_boxhole boxhole_app_area 145 433 816 443

place app_signin_task 285 526 0.4 1 boxhole_app_area
addstyle app_signin_task box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35);border-radius:5px

place app_transaction_list_task 561 526 0.4 1 boxhole_app_area
addstyle app_transaction_list_task box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35);border-radius:5px

place app_active_task 145 876 1 1 boxhole_app_area

place btn_gray_runtracker 594 2 0

place app_task_highliter 285 526 0.0


place_div app_max_minutes 1017 463 15 14 1 "0"
place_div app_max_seconds 1017 478 15 14 1 "0"
addstyle app_max_minutes color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;
addstyle app_max_seconds color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;

place_div app_task_minutes 195 800 15 14 1 "0"
place_div app_task_seconds 195 815 15 14 1 "0"
addstyle app_max_minutes color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;
addstyle app_max_seconds color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;


animate_2000 pause

; place cursor and run app

place cursor 241 323
animate_400 move cursor 620 22

animate_200 pause
animate_50 scale cursor 1.6
animate_120 scale cursor 1
animate_200 opacity app_backplate 1 && opacity app_signin_task 1 && oppacity app_transaction_list_task 1 && opacity app_panel_no_track 1
animate_2000 pause

animate_500 move cursor 497 520
animate_200 opacity app_task_highliter 1 && move cursor 442 673

animate_200 pause
animate_50 scale cursor 1.6
animate_120 scale cursor 1

animate_300 opacity app_task_highliter 0

animate_300 move board_signin_task 302 252 && opacity app_signin_task 0 && move app_panel_no_track 1072 - && move app_active_task - 433 && move app_transaction_list_task - 0
animate_100 move board_transaction_list_task 17 149 && opacity bord_max_glow_header 1 && opacity signin_board_task_active 1 && opacity btn_gray_runtracker 1 && opacity board_max_minutes 1 && opacity board_max_seconds 1 && move app_panel_track 960 -

schedule_eval app_minutes 500 incr('app_max_seconds'); if (+get('app_max_seconds') >= 60) { incr('app_max_minutes'); set('app_max_seconds', 0)}
schedule_eval board_max_minutes 500 incr('board_max_seconds'); if (+get('board_max_seconds') >= 60) { incr('board_max_minutes'); set('board_max_seconds', 0)}
schedule_eval app_task_minutes 500 incr('app_task_seconds'); if (+get('app_task_seconds') >= 60) { incr('app_task_minutes'); set('app_task_seconds', 0)}


animate_5000 pause

`;

// todo recover shadow at place - add class

const framesHTMLs = [];

const arrayChunks = (arr, size) => arr.reduce((acc, e, i) => (i % size ? acc[acc.length - 1].push(e) : acc.push([e]), acc), []);


(async () => {

  const doFrame = async () => {
    const html = genHtml();
    framesHTMLs.push({
      path: `${FRAMES_DIR}/${(''+cntr).padStart(MAX_FILENAME_DIGS, '0')}.png`,
      html,
    });
    
    // await fs.writeFile(`${FRAMES_DIR}/_index${(''+cntr).padStart(MAX_FILENAME_DIGS, '0')}.html`, html, function(err) {
    //   if(err) {
    //       return console.log(err);
    //   }
    // });
    
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
  log(`🎥 Foramt selected: ${proc_args.format}
Filename ${proc_args.filename}.${proc_args.format}
🕗 Total duration: ${(totalMs / 1e3).toFixed(1)}s FPS: ${FPS}  \n`);

  for (v of script.split('\n')) {
    const d1 = v.split(' ');
    const cmd = d1[0];
    let argSets = d1.slice(1).join(' ');
    
    if (argSets) {
      argSets = argSets.split('&&');
    }
    if (cmd === 'init_page') {
      const args = argSets[0].split(' ');
      pageScale = firstDefined(args[2], 1);
      pageW = args[0] * pageScale;
      pageH = args[1] * pageScale;
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
          }
        }

      }
    }
  }
  await doFrame();

  log('✔  HTML generation done')
  fsExtra.emptyDirSync(FRAMES_DIR);
  const THREADS = 3;
  let totalGenCntr = 0;
  
  

  const genScreenshots = async (seq) => {
    const browser = await puppeteer.launch({args: [
      `--window-size=${pageW},${pageH}`, 
      '--no-sandbox',
      '--disk-cache-dir=/tmp/pup'
    ], headless: true,});
    const page = await browser.newPage();
    await page.setViewport({width: pageW, height: pageH, deviceScaleFactor: 1});
    await page._client.send('Emulation.clearDeviceMetricsOverride');
    for (let o of seq) {
      await page.setContent(o.html);
      await page.screenshot({path: o.path});
      
      totalGenCntr += 1;
      log(`Frames gen: ${(totalGenCntr * 100.0 / (totalFrames + 1)).toFixed(2)}%`, '\033[F');
    }
    await browser.close();
  }
  await Promise.all(arrayChunks(framesHTMLs, Math.round(framesHTMLs.length / THREADS) ).map(async (ch) => await genScreenshots(ch)))
 

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