
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

const parts = {};
const timers = {};
let html = '';

const genHtml = () => {
  const inner = Object.values(parts).sort((a,b) => {
      return a.index - b.index
  }).reduce((acc, p) => {
    if (p.type === 'part') {
      return `${acc}<div style="position:fixed;top:${p.top}px;left:${p.left}px;opacity:${p.opacity};transform:scale(${p.scale});${p.extrastyle}">${p.content}</div>`
    } else if (p.type === 'block') {
      return `${acc}<div style="position:fixed;top:${p.top}px;left:${p.left}px;width:${p.w}px;height:${p.h}px;opacity:${p.opacity};${p.extrastyle}">${p.content}</div>`
    }
  }, '');
  html = `<html>
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
          transform: scale(1);
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


const addPart = async (filename, left, top, opacity, scale) => {
  const f = await readFile(`src/${filename}.svg`, 'utf-8');
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
    // todo remove ugly fix
    content: withUniquifiedIDs,
    top: +firstDefined(top, 0),
    left: +firstDefined(left, 0),
    opacity: +firstDefined(opacity, 1),
    index: Object.values(parts).length,
    scale: +firstDefined(scale, 1.0),
    extrastyle: '',
  };
  genHtml()
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
  genHtml();
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
  timers[name] = setInterval(
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
      genHtml();
    },
    +ms
  )
}

const script = `
place board 0 0

; valen
place board_transaction_list_task 17 253
addstyle board_transaction_list_task box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35);border-radius:5px

place_div board_valentyn_minutes 319 190 15 14 1 "18"
place_div board_valentyn_seconds 319 205 15 14 1 "2"
addstyle board_valentyn_minutes color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;
addstyle board_valentyn_seconds color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;

schedule_eval valentyn_minutes 300 incr('board_valentyn_seconds'); if (+get('board_valentyn_seconds') >= 60) { incr('board_valentyn_minutes'); set('board_valentyn_seconds', 0)}

; max inactive active task

place board_signin_task 17 149
addstyle board_signin_task box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35);border-radius:5px

; max active task
place signin_board_task_active 302 252 0

place_div board_max_minutes 319 294 15 14 0 "0"
place_div board_max_seconds 319 309 15 14 0 "0"
addstyle board_max_minutes color:white;font-family:'Open Sans';font-weight:bold;font-size:12px;text-align:right;
addstyle board_max_seconds color:white;font-family:'Open Sans';font-weight:bold;font-size:12px;text-align:right;

; board

place app_backplate 145 374 0.4
addstyle app_backplate box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35)

place app_panel_no_track 969 530 0.4

place app_signin_task 285 526 0.4
addstyle app_signin_task box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35);border-radius:5px

place app_transaction_list_task 561 526 0.4
addstyle app_transaction_list_task box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.35);border-radius:5px

place bord_max_glow_header 300 0 0

place btn_gray_runtracker 594 2 0

place app_task_highliter 285 526 0.0


place_div app_max_minutes 1017 463 15 14 1 "0"
place_div app_max_seconds 1017 478 15 14 1 "0"
addstyle app_max_minutes color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;
addstyle app_max_seconds color:white;font-family:'Open Sans';font-weight: bold;font-size:12px;text-align: right;

place cursor 241 323
animate_400 move cursor 620 22

animate_200 pause
animate_50 scale cursor 1.6
animate_120 scale cursor 1
animate_200 opacity app_backplate 1 && opacity app_signin_task 1 && oppacity app_transaction_list_task 1 && opacity app_panel_no_track 1
animate_200 pause

animate_500 move cursor 497 520
animate_200 opacity app_task_highliter 1 && move cursor 442 673

animate_200 pause
animate_50 scale cursor 1.6
animate_120 scale cursor 1

animate_300 opacity app_task_highliter 0

animate_300 move board_signin_task 302 252 && opacity app_signin_task 0 
animate_100 move board_transaction_list_task 17 149 && opacity bord_max_glow_header 1 && opacity signin_board_task_active 1 && opacity btn_gray_runtracker 1 && opacity board_max_minutes 1 && opacity board_max_seconds 1

schedule_eval app_minutes 300 incr('app_max_seconds'); if (+get('app_max_seconds') >= 60) { incr('app_max_minutes'); set('app_max_seconds', 0)}
schedule_eval board_max_minutes 300 incr('board_max_seconds'); if (+get('board_max_seconds') >= 60) { incr('board_max_minutes'); set('board_max_seconds', 0)}

animate_2000 pause

`;

// todo recover shadow at place - add class


(async () => {
  fsExtra.emptyDirSync(FRAMES_DIR);
  const browser = await puppeteer.launch({args: ['--window-size=2320,1000'],});
  const page = await browser.newPage();

  const doFrame = async () => {
    genHtml()
    await page.setContent(html);
    fs.writeFile(`${FRAMES_DIR}/_index${(''+cntr).padStart(MAX_FILENAME_DIGS, '0')}.html`, html, function(err) {
      if(err) {
          return console.log(err);
      }
    });
  
    await page.screenshot({path: `${FRAMES_DIR}/${(''+cntr).padStart(MAX_FILENAME_DIGS, '0')}.png`});
    cntr += 1;
    log(`Frames gen: ${(cntr * 100.0 / (totalFrames + 1)).toFixed(2)}%`, '\033[F')
  }

  await page.setViewport({width: 2320, height: 0, deviceScaleFactor:2});
  await page._client.send('Emulation.clearDeviceMetricsOverride');

  let totalMs = 0;
  for (v of script.split('\n')) {
    const d1 = v.split(' ');
    const cmd = d1[0];
    if (cmd.startsWith('animate_')) {
      totalMs += +cmd.replace('animate_', '');
      totalFrames += Math.round(+cmd.replace('animate_', '') / 1.0e3 * FPS);
    }
  }
  log(`Foramt selected: ${proc_args.format}
Filename ${proc_args.filename}.${proc_args.format}
Total duration: ${(totalMs / 1e3).toFixed(1)}s FPS: ${FPS}  \n`);

  for (v of script.split('\n')) {
    const d1 = v.split(' ');
    const cmd = d1[0];
    let argSets = d1.slice(1).join(' ');

    if (argSets) {
      argSets = argSets.split('&&');
    }
    if (cmd === 'place') {
      let args = argSets[0].split(' ');
      await addPart(...args);
    }
    else if (cmd === 'place_div') {
      let args = argSets[0].split(' ');
      await addDiv(...args);
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
            const dstLeft = +ags_arr[2];
            const dstTop = +ags_arr[3];
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




  await browser.close();
  log('Frames generation done')


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