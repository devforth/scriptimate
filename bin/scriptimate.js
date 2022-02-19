#!/usr/bin/env node

const {promises: fs, constants: fsConstants} = require('fs');
const { spawn, execFile } = require('child_process');
const { ArgumentParser } = require('argparse');
const { version } = require('../package.json');
const svgDim = require('svg-dimensions');
const YAML = require('yaml');
const crypto = require('crypto');
const os = require('os');

let uniq;

function initUnique() {
  uniq = 0;
}

function generateUniqueId() {
  return 1237841 + uniq++;
}

const path = require('path');

const log = console.log;
const MAX_FILENAME_DIGS = 7;
let FRAMES_DIR = 'frames';

const parser = new ArgumentParser({
  description: `Scriptimate v${version}`
});

parser.add_argument('-v', '--version', { action: 'version', version });
parser.add_argument('-f', '--format', { help: 'output file format, or multiple via comma: "webm,mp4". Available formats: mov, mp4, gif, webm, default is mp4', default: 'mp4' });
parser.add_argument('-i', '--input', { help: 'Input .smte script file', default: null });
parser.add_argument('-fn', '--filename', { help: 'output filename', default: null });
parser.add_argument('-t', '--threads', { help: 'Threads count used during compiling, defaults to 4', default: 4 });
parser.add_argument('-fs', '--fromsecond', { help: 'Start from defined second (could be used to debug animation faster, also you can use "exis" keyword in smte script)', default: 0 });
parser.add_argument('-d', '--debughtml', { help: 'Create HTML files near image to debug', default: false });
parser.add_argument('-bd', '--basedir', { help: 'Input directory (folder where src subfolder and .smte file is located)', default: './' });
parser.add_argument('-fps', '--fps', { help: 'FPS', default: 25 });
parser.add_argument('-if', '--intermediateFormat', { help: 'Screenshots format used to compile video png|jpeg, defaults to png', default: 'png' });
parser.add_argument('-ijq', '--intermediateJpegQuality', { help: 'JPEG quality 0.0 - 1.0, defaults to 1', default: 1 });
parser.add_argument('-nc', '--nocache', { help: "Don't use screenshots cache (but still generate it), for scriptimate develeopmnt", default: false });




const proc_args = parser.parse_args();

const FPS = +proc_args.fps;

const FORMAT = proc_args.intermediateFormat;
const QUALITY = +proc_args.intermediateJpegQuality;


FRAMES_DIR = proc_args.basedir + '/' + FRAMES_DIR;

let translationsDict = {};
let parts;
let timers;
let boxholes;

let groups;  // name => Array of lines
let freezer; 

let pageScale, pageW, pageH;
let groupToAddNext;
let skipFrames;
let globalFramesCounter;
let globalLastFrame;
let cntr;
let totalFrames;
let totalFramesCount;


function initVariables() {
  parts = {};
  timers = {};
  boxholes = {};
  groups = {};  // name => Array of lines
  freezer = {};
  pageScale = 1;
  pageW = 0;
  pageH = 0;
  groupToAddNext = null;
  skipFrames = 0;
  globalFramesCounter = 0;
  globalLastFrame = null;
  cntr = 0;
  totalFrames = 0;
  totalFramesCount = 0;
  frameAbsIndexByHTMLHash = {};
  reuseAbsFrameIndexForAbsFrameIndex = {};
  frameHashByAbsIndex = {};
}


const arrayChunks = (arr, size) => arr.reduce((acc, e, i) => (i % size ? acc[acc.length - 1].push(e) : acc.push([e]), acc), []);

// want more? copy from here: https://hinty.io/ivictbor/animation-formulas/
const animationHandlersByMode = {
  linear: (t, b, c, d) => {
    return c*t/d + b;
  },
  easein: (t, b, c, d) => { // Quadratic easing in 
    t /= d;
    return c*t*t + b;
  },
  easeout: (t, b, c, d) => { // Quadratic easing out
    t /= d;
	  return -c * t*(t-2) + b;
  },
  easeinout: (t, b, c, d) => {  // Quadratic easing out
    t /= d/2;
    if (t < 1) return c/2*t*t + b;
    t--;
    return -c/2 * (t*(t-2) - 1) + b;
  },	
}

const ACTION_HANDLERS = {
  move: (i, ags_arr, first_frame_in_animate, frames, mode) => {
    const svg = ags_arr[0];
    if (!parts[svg]) {
      return;
    }
    const dstLeft = ags_arr[1] === '-' ? parts[svg].left : eval(ags_arr[1]);
    const dstTop =  ags_arr[2] === '-' ? parts[svg].top : eval(ags_arr[2]);
    if (first_frame_in_animate) {
      freezer[svg] = {...freezer[svg], top: parts[svg].top, left: parts[svg].left};
    }

    parts[svg].top = animationHandlersByMode[mode](i, freezer[svg].top, dstTop - freezer[svg].top, frames);
    parts[svg].left = animationHandlersByMode[mode](i, freezer[svg].left, dstLeft - freezer[svg].left, frames);
    global[`\$${svg}__X`] = parts[svg].left;  //todo legacy
    global[`\$${svg}__Y`] = parts[svg].top;  //todo legacy
    global[`\$${svg}__LEFT`] = parts[svg].left;
    global[`\$${svg}__TOP`] = parts[svg].top;
  },
  scale: (i, ags_arr, first_frame_in_animate, frames, mode, cmd) => {
    const svg = ags_arr[0];
    if (!parts[svg]) {
      log(`WARN: opacity not applied, part not found: ${svg}, line: \n${cmd}\n`);
      return;
    }
    const dstScale = +eval(ags_arr[1]);
    let transformOrigin = null;
    if (ags_arr[2]) {
      transformOrigin = `${ags_arr[2]}`;
      if (ags_arr[3]) {
        transformOrigin = `${transformOrigin} ${ags_arr[3]}`;
      }
    }
    if (first_frame_in_animate) {
      freezer[svg] = {...freezer[svg], scale: parts[svg].scale};
    }
    parts[svg].transformOrigin = transformOrigin;
    parts[svg].scale = animationHandlersByMode[mode](i, freezer[svg].scale, dstScale - freezer[svg].scale, frames);
  },
  rotate: (i, ags_arr, first_frame_in_animate, frames, mode, cmd) => {
    const svg = ags_arr[0];
    if (!parts[svg]) {
      log(`WARN: rotate not applied, part not found: ${svg}, line: \n${cmd}\n`);
      return;
    }
    const dstRotate = +eval(ags_arr[1]);
    let transformOrigin = null;
    if (ags_arr[2]) {
      transformOrigin = `${ags_arr[2]}`;
      if (ags_arr[3]) {
        transformOrigin = `${transformOrigin} ${ags_arr[3]}`;
      }
    }
    parts[svg].transformOrigin = transformOrigin;
    if (first_frame_in_animate) {
      freezer[svg] = {...freezer[svg], rotate: parts[svg].rotate};
    }
    parts[svg].rotate = animationHandlersByMode[mode](i, freezer[svg].rotate, dstRotate - freezer[svg].rotate, frames);
  },
  opacity: (i, ags_arr, first_frame_in_animate, frames, mode, cmd) => {
    const svg = ags_arr[0];
    if (!parts[svg]) {
      log(`WARN: opacity not applied, part not found: ${svg}, line: \n${cmd}\n`);
      return;
    }
    const dstOpacity = +eval(ags_arr[1]);
    if (first_frame_in_animate) {
      freezer[svg] = {...freezer[svg], opacity: parts[svg].opacity};
    }
    parts[svg].opacity = animationHandlersByMode[mode](i, freezer[svg].opacity, dstOpacity - freezer[svg].opacity, frames);
  },
  dashoffset: (i, ags_arr, first_frame_in_animate, frames, mode, cmd) => {
    const svg = ags_arr[0];
    if (!parts[svg]) {
      log(`WARN: dashoffset not applied, part not found: ${svg}, line: \n${cmd}\n`);
      return;
    }
    const dstOffset = +eval(ags_arr[1]);
    if (first_frame_in_animate) {
      freezer[svg] = {...freezer[svg], dashoffset: parts[svg].dashoffset};
    }
    parts[svg].dashoffset = animationHandlersByMode[mode](i, freezer[svg].dashoffset, dstOffset - freezer[svg].dashoffset, frames);
  },
  resize_div: (i, ags_arr, first_frame_in_animate, frames, mode, cmd) => {
    const svg = ags_arr[0];
    if (!parts[svg]) {
      log(`WARN: resize_div not applied, part not found: ${svg}, line: \n${cmd}\n`);
      return;
    }
    if (parts[svg].type !== 'block') {
      log(`WARN: resize_div could be applied only to type block: not ${parts[svg].type}, part: ${svg}, line: \n${cmd}\n`);
      return;
    }
    const dstW = ags_arr[1] === '-' ? parts[svg].w : eval(ags_arr[1]);
    const dstH =  ags_arr[2] === '-' ? parts[svg].h : eval(ags_arr[2]);
    if (first_frame_in_animate) {
      freezer[svg] = {...freezer[svg], w: parts[svg].w, h: parts[svg].h};
    }

    parts[svg].w = animationHandlersByMode[mode](i, freezer[svg].w, dstW - freezer[svg].w, frames);
    parts[svg].h = animationHandlersByMode[mode](i, freezer[svg].h, dstH - freezer[svg].h, frames);
  },
  pause: () =>{

  }
}

const genHtml = (allParts) => {
  const inner = Object.values(allParts).sort((a,b) => {
      return a.index - b.index
  }).reduce((acc, p) => {
    if (p.type === 'part') {
      const bh = boxholes[p.toBoxHole] || {left: 0, top:0};

      const partHTML = `<div style="position:${bh.name ? "absolute": "fixed"};top:${p.top-bh.top}px;left:${p.left-bh.left}px;opacity:${p.opacity};transform-origin:${p.transformOrigin || 'center'};transform:scale(${p.scale}) rotate(${p.rotate}deg);stroke-dashoffset:${p.dashoffset};${p.extrastyle}">${p.content}</div>`;
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

const moveToTop = async ( filename) => {
  if (!parts[filename]) {
    console.error(`error: can't moveToTop ${filename}, part should be first added, e.g. using "place"`);
    return;
  }
  parts[filename].index = Object.values(parts).reduce((a, p) => Math.max(a, p.index), 0) + 1;
}

const addPart = async (lang, filename, left, top, opacity, scale, toBoxHole, dashoffset) => {
  let f;
  
  const readFname = async (fn) => {
    const filePath = `${proc_args.basedir}/src/${fn}.svg`;
    const fileBuffer = await fs.readFile(filePath, { encoding: 'utf-8' });
    return fileBuffer.toString();
  };
  let fname = `${filename}_${lang}`;
  try {
    f = await readFname(fname);
  } catch (e) {
    fname = filename;
    f = await readFname(fname)
  }
  await new Promise((resolve) => {
    svgDim.get(`${proc_args.basedir}/src/${fname}.svg`, function(err, dimensions) {
      if (err) {
        console.log(`INFO: can't read ${filename} dimensions`, err);
      } else {
        global[`\$${filename}__WIDTH`] = dimensions.width;
        global[`\$${filename}__HEIGHT`] = dimensions.height;
      }
      resolve();
    });
  });
  const partIds = {};
  let withUniquifiedIDs = f.replace(/id="(.*?)"/g, (_, v) => {
    if (!partIds[v]) {
      partIds[v] = `id_${generateUniqueId()}`;
    }
    return `id="${partIds[v]}"`;
  });

  // for languages where texts might have unstable width, we need remove box limiting
  withUniquifiedIDs = withUniquifiedIDs.replace(/<filter(.+?)width="(.+?)"(.*?)>/g, (_, v1, mid, v2) => {
    return `<filter${v1}${v2}>`;
  });

  Object.keys(partIds).forEach((u) => {
    withUniquifiedIDs = withUniquifiedIDs.replaceAll(`#${u}`, `#${partIds[u]}`);
  });
  if (lang !== 'default') {
    const strings = translationsDict[lang];
    Object.keys(strings).forEach((tr) => {
      withUniquifiedIDs = withUniquifiedIDs.replace(new RegExp(`>(.+?)${tr}(.+?)<`, 'g'), (_, v1, v2) => {
        return `>${v1}${strings[tr]}${v2}<`;
      });
      // withUniquifiedIDs = withUniquifiedIDs.replaceAll(tr, strings[tr]);
    });
  }
  parts[filename] = {
    type: 'part',
    filename,
    content: withUniquifiedIDs,
    top: +firstDefined(eval(top), 0),
    left: +firstDefined(eval(left), 0),
    opacity: +firstDefined(eval(opacity), 1),
    index: Object.values(parts).reduce((a, p) => Math.max(a, p.index), 0) + 1,
    scale: +firstDefined(eval(scale), 1.0),
    rotate: +firstDefined(0, 0),
    dashoffset: +firstDefined(eval(dashoffset), 0),
    extrastyle: '',
    toBoxHole,
  };
  freezer[filename] = {};
  global[`\$${filename}__X`] = parts[filename].left;
  global[`\$${filename}__Y`] = parts[filename].top;
  global[`\$${filename}__LEFT`] = parts[filename].left;
  global[`\$${filename}__TOP`] = parts[filename].top;
};

const addDiv = (name, left, top, w, h, opacity, c, toBoxHole) => {
  //+rest.join(' ').replaceAll('"', '').replaceAll("'", '')
  const content = eval(c);
  parts[name] = {
    type: 'block',
    name,
    top: +firstDefined(eval(top), 0),
    left: +firstDefined(eval(left), 0),
    opacity: +firstDefined(opacity, 1),
    w: +firstDefined(eval(w), 0),
    h: +firstDefined(eval(h), 0),
    index: Object.values(parts).length,
    rotate: +firstDefined(0, 0),
    dashoffset: +firstDefined(0, 0),
    content: content,
    toBoxHole,
  }
  global[`\$${name}__X`] = parts[name].left;
  global[`\$${name}__Y`] = parts[name].top;
  global[`\$${name}__LEFT`] = parts[name].left;
  global[`\$${name}__TOP`] = parts[name].top;
}

const addBoxHole = (name, left, top, w, h) => {
  boxholes[name] = {
    name,
    top: +firstDefined(eval(top), 0),
    left: +firstDefined(eval(left), 0),
    w: +firstDefined(eval(w), 0),
    h: +firstDefined(eval(h), 0),
  }
}

const setPseudoInterval = (callback, ms) => {
  const o = {
    t: 0,
    tick(passed_ms) {
      this.t += passed_ms;
      while (this.t >= ms) {
        callback();
        this.t -= ms;
      }
    }
  }
  return o;
}

const addStyle = (part, style) => {
  if (!parts[part]) {
    log(`WARN: style not applied, part not found: ${part}`)
    return
  }
  parts[part].extrastyle = style;
}

const schedule_eval = (name, ms, ...rest) => {
  const code = rest.join(' ');
  // todo check that timer already scheduled and drop warn

  timers[name] = setPseudoInterval(
    () => {
      const incr = (part, delta) => {
        parts[part].content = +parts[part].content + (delta || 1);
        global[part+'_value'] = parts[part].content
      }
      const get = (part) => {
        return parts[part].content;
      }
      const set = (part, value) => {
        parts[part].content = value;
        global[part+'_value'] = value;
      }
      eval(code);
    },
    +ms
  )
}

const schedule_time = (name, ms = 50) => {
  const code = `incrM('${name}_minutes'); if (+get('${name}_minutes') >= 60) { incr('${name}_hours'); set('${name}_minutes', 0)}`;
  
  timers[name] = setPseudoInterval(
    () => {
      const incr = (part) => {
        parts[part].content = +parts[part].content + 1;
        global[part+'_value'] = parts[part].content
      }
      const incrM = (part) => {
        parts[part].content = +parts[part].content + 7;
        global[part+'_value'] = parts[part].content
      }
      const get = (part) => {
        return parts[part].content;
      }
      const set = (part, value) => {
        parts[part].content = eval(value);
        global[part+'_value'] = eval(value)
      }
      eval(code)
    },
    +ms
  )
}

const unschedule = (name) => {
  // chack that schedulled and drop warn
  delete timers[name];
}



let frameAbsIndexByHTMLHash = {};
let reuseAbsFrameIndexForAbsFrameIndex = {};
let frameHashByAbsIndex = {};
let cacheDir = '';

const runGeneration = async (lang) => {
  initVariables();
  initUnique();

  function getFilename() {
    const baseFilename = proc_args.filename ? proc_args.filename: proc_args.input.split('.').slice(0, -1).join('.');
    let prefix = '';
    if (lang !== 'default') {
      prefix = `_${lang}`;
    }
    return `${baseFilename}${prefix}`;
  }
  
  const doFrame = async () => {
    
    if (cntr < skipFrames || (globalLastFrame && cntr > globalLastFrame)) {
      cntr += 1;
      return;
    }
    totalFramesCount += 1;

    const html = genHtml(parts);
    const hash = crypto.createHash('sha1').update(html).digest('base64url');
    frameHashByAbsIndex[cntr] = hash;
    
    if (!frameAbsIndexByHTMLHash[hash]) {
      frameAbsIndexByHTMLHash[hash] = cntr;

      const screenshotCachedPath = path.join(cacheDir, `${hash}.${FORMAT}`);
      
      const noHTMLNeeded = false;
      try {
        await fs.access(screenshotCachedPath, fsConstants.F_OK);
        noHTMLNeeded = true;
      } catch (e) {
        // no file exists to copy, so need generate
      }
      if (!noHTMLNeeded) {
        await fs.writeFile(`${FRAMES_DIR}/_index${(''+cntr).padStart(MAX_FILENAME_DIGS, '0')}.html`, html, function(err) {
          if (err) {
            return console.log(err);
          }
        });
      }
    } else {
      reuseAbsFrameIndexForAbsFrameIndex[cntr] = frameAbsIndexByHTMLHash[hash];
    }
    
    cntr += 1;
    log(`HTML pages gen: ${(cntr * 100.0 / (totalFrames + 1)).toFixed(2)}%`, '\033[F');
  }

  const scriptBuffer = await fs.readFile(proc_args.basedir + '/' + proc_args.input);
  const script = scriptBuffer.toString();
  if (! script) {
    throw "Please specify .smte file e.g. -i demo.smte"
  }

  cacheDir = path.join(os.tmpdir(), 'scriptimateCache');
  await fs.mkdir(cacheDir, { recursive: true });

  let totalMs = 0;
  for (v of script.split('\n')) {
    const d1 = v.split(' ');
    const cmd = d1[0];
    if (cmd.startsWith('animate_')) {
      totalMs += +cmd.replace('animate_', '');
      totalFrames += Math.round(+cmd.replace('animate_', '') / 1.0e3 * FPS);
    }
  }

  await fs.rmdir(FRAMES_DIR, { recursive: true });
  await fs.mkdir(FRAMES_DIR, { recursive: true });

  const processed_lines = []
  for (const lineIter of script.split('\n')) {
    let line = lineIter;
    if (!line.trim() || line.trim().startsWith(';')) {
      // empty line
      continue;
    }
    if (lang !== 'default') {
      const strings = translationsDict[lang];
      Object.keys(strings).forEach((tr) => {
        // allows to translate constants in script too
        line = line.replaceAll(`'${tr}'`, `'${strings[tr]}'`).replaceAll(`"${tr}"`, `"${strings[tr]}"`);
      });
    }

    if (line.trim().startsWith('&&')) {
      processed_lines[processed_lines.length - 1] += ` ${line.trim()} `;
    } else {
      processed_lines.push(line);
    }
  }

  for (const [file_line, line] of processed_lines.entries()) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (groupToAddNext) {
        if(!groups[groupToAddNext]) {
          groups[groupToAddNext] = [];
        }
        groups[groupToAddNext].push(line.trim());
        continue;
      } else {
        throw `Line can start with whitespace only if it follows after define_group on line ${file_line + 1}:\n${line}`;
      }
    } else {
      groupToAddNext = null;
    }

    const handleActionsInAnimate = (i, argSets, frames, cmd) => {
      let atLeastOneFrameMade = false;
      const first_frame_in_animate = i === 1;
    
      for (let ags of argSets) {
        const ags_arr = ags.trim().split(' ');
        const action = ags_arr.shift();
        let mode = 'linear';
        if (Object.keys(animationHandlersByMode).includes(ags_arr[0])) {
          mode = ags_arr.shift()
        }
        ACTION_HANDLERS[action](i, ags_arr, first_frame_in_animate, frames, mode, cmd);
        atLeastOneFrameMade = true;
      }
      return atLeastOneFrameMade;
    }

    const process_line = async (line, group) => {
      const line_splitted_by_whitespace = line.split(' ');
      const cmd = line_splitted_by_whitespace[0];
      let argSets = line_splitted_by_whitespace.slice(1).join(' ');
      
      if (argSets) {
        argSets = argSets.split('&&');
      }
      if (cmd === 'set_frame_size' || cmd === 'init_page') {  //init_page is legacy
        if (pageW) {
          return;
        }
        const args = argSets[0].split(' ');
        pageScale = firstDefined(args[2], 1);
        pageW = Math.round(eval(args[0]) * pageScale);
        pageH = Math.round(eval(args[1]) * pageScale);
        if (proc_args.fromsecond) {
          skipFrames = proc_args.fromsecond * FPS;
        }
        log(`🎥 Format selected: ${proc_args.format}
📁 Filename ${getFilename()}.${proc_args.format}
📺 Resolution: ${pageW}x${pageH}
✂ Start from second: ${proc_args.fromsecond}s
    \n`);
      }
      else if (cmd === 'const' || cmd === 'var'){
        argSets[0].split(' ').forEach((s)=>{
          let v = s.split('=')
          global[v[0]] = eval(v[1])
        })
      } else if (cmd === 'exit') {
        globalLastFrame = globalLastFrame || globalFramesCounter;
      } else if (cmd === 'place') {
        let args = argSets[0].split(' ');
        await addPart(lang, ...args);
      } else if (cmd === 'moveToTop') {
        let args = argSets[0].split(' ');
        await moveToTop(...args);
      }
      else if (cmd === 'place_div') {
        let args = argSets[0].split(' ');
        addDiv(...args);
      }
      else if (cmd === 'place_boxhole') {
        let args = argSets[0].split(' ');
        addBoxHole(...args);
      }
      else if (cmd === 'schedule_eval') {
        let args = argSets[0].split(' ');
        schedule_eval(...args);
      }
      else if (cmd === 'schedule_time') {
        let args = argSets[0].split(' ');
        schedule_time(...args);
      }
      else if (cmd === 'unschedule') {
        let args = argSets[0].split(' ');
        unschedule(...args);
      }
      else if (cmd === 'addstyle') {
        let args = argSets[0].split(' ');
        addStyle(args[0], args.slice(1).join(' '));
      }
      else if (cmd === 'define_group') {
        let grpName = argSets[0].trim();
        if (grpName.endsWith(':')) {
          grpName = grpName.slice(0, -1)
        }
        groupToAddNext = grpName;
      }
      else if (cmd.startsWith('animate_')) {
        const duration_ms = +cmd.replace('animate_', '');
        const frames = Math.round(duration_ms / 1.0e3 * FPS);
        
        for (let i = 1; i <= frames; i += 1) {
          Object.values(timers).forEach((t) => t.tick(1000.0 / FPS));
          handleActionsInAnimate(i, argSets, frames, cmd)
          await doFrame();
          globalFramesCounter += 1;
        }
      }
      else if (cmd.startsWith('run_groups_together')) {
        const executing_groups = argSets[0].split(' ').map(g => g.trim());
        let needNextIteration = true;
        const needOperationByGroup = {};
        const animationStateByGroup = {}
        while (needNextIteration) {

          let atLeastOneFrameMade = false;
          for (const grp of executing_groups) {
            if (!needOperationByGroup[grp]) {
              while (groups[grp].length) {
                needOperationByGroup[grp] = groups[grp].shift()
                lineIn = needOperationByGroup[grp]
                
                if (needOperationByGroup[grp].startsWith('animate_')) {
                  break; // we found next animate
                } else {
                  await process_line(lineIn, grp);
                  needOperationByGroup[grp] = null;  // something which does not need a frames, omit it
                }
              }
              if (needOperationByGroup[grp]) {
                // this is a new next animation
                const line_splitted_by_whitespace = needOperationByGroup[grp].split(' ');
                const cmd = line_splitted_by_whitespace[0];
                let argSets = line_splitted_by_whitespace.slice(1).join(' ');
                
                if (argSets) {
                  argSets = argSets.split('&&');
                }

                const duration_ms = +cmd.replace('animate_', '');
                const frames = Math.round(duration_ms / 1.0e3 * FPS);
                animationStateByGroup[grp] = {
                  argSets,
                  frames,
                  i: 1,
                }
              }
            }

            if (needOperationByGroup[grp]) {
              const state = animationStateByGroup[grp];

              if (handleActionsInAnimate(state.i, state.argSets, state.frames)) {
                atLeastOneFrameMade = true;
              }

              state.i += 1;
              if (state.i > state.frames) {
                needOperationByGroup[grp] = null; // next cycle should pick up something
              }
            }
          }
          
          needNextIteration = atLeastOneFrameMade;
          if (atLeastOneFrameMade) {
            Object.values(timers).forEach((t) => t.tick(1000.0 / FPS));
            globalFramesCounter += 1;
            await doFrame();
          }
        }
        
      }
    }
    await process_line(line);
  }

  
  log('✅ [2/4] HTML generation done')
  log(`🕗 Total duration: ${(globalFramesCounter / FPS).toFixed(1)}s 🎞️  FPS: ${FPS}`)

  const THREADS = + proc_args.threads;
  let totalGenCntr = 0;
  
  async function genScreenshots(index) {
    const absoluteIndex = index + skipFrames;
    const htmlHash = frameHashByAbsIndex[absoluteIndex];
    const screenshotCachedPath = path.join(cacheDir, `${htmlHash}.${FORMAT}`);
    const dstFile = `${FRAMES_DIR}/${(''+(index)).padStart(MAX_FILENAME_DIGS, '0')}.${FORMAT}`;
    
    try {
      if (!proc_args.nocache) {
        await fs.copyFile(screenshotCachedPath, dstFile);
        return;
      }
    } catch (e) {
      // console.log('errr', e);
      // no file exists to copy, so need generate
    }
    await new Promise((resolve) => {
      if (!reuseAbsFrameIndexForAbsFrameIndex[absoluteIndex]) {
        
        const proc = spawn('node', [
          path.resolve(__dirname, 'puWorker.js'), 
          pageW, pageH, 
          absoluteIndex, 
          totalFramesCount, 
          FRAMES_DIR, 
          FORMAT, 
          QUALITY, skipFrames || 0
        ], { shell: true });
        proc.stdout.on('data', (data) => {
          // console.log(`NodeOUT: ${data}`);
        });
        proc.stderr.on('data', (data) => {
          console.error(`NodeERR: ${data}`);
        });
        proc.on('close', async (code) => {
          totalGenCntr += 1;
          log(`Frames gen: ${(totalGenCntr * 100.0 / totalFramesCount).toFixed(2)}%`, '\033[F');
          if (code !== 0) {
            log('🔴  node failed')
            process.exit(-1)
          }
          await fs.copyFile(dstFile, screenshotCachedPath);
          resolve();
        });
      } else {
        totalGenCntr += 1;
        resolve();
      }
    });
  }

  async function copyReusedScreenshots(index) {
    const absoluteIndex = index + skipFrames;
    if (reuseAbsFrameIndexForAbsFrameIndex[absoluteIndex]) {
      const reuseAbsIndex = reuseAbsFrameIndexForAbsFrameIndex[absoluteIndex];
      const srcFile = `${FRAMES_DIR}/${(''+(reuseAbsIndex - skipFrames)).padStart(MAX_FILENAME_DIGS, '0')}.${FORMAT}`;
      const dstFile = `${FRAMES_DIR}/${(''+(index)).padStart(MAX_FILENAME_DIGS, '0')}.${FORMAT}`;
      try {
        await fs.copyFile(srcFile, dstFile);
      } catch (e) {
        log(`🔴  failed to copy frame ${srcFile} to ${dstFile}`)
        throw e;
      }
    }
  }

  async function genScreenshotsForChunk(indexesChunk) {
    for (let i=0; i < indexesChunk.length; i+=1) {
      await genScreenshots(indexesChunk[i]);
    }
  }
  
  const indexes = Array.from( Array(totalFramesCount).keys() );

  await Promise.all(
    arrayChunks(indexes, Math.round( (indexes.length) / THREADS) ).map(async (indexesChunk) => await genScreenshotsForChunk(indexesChunk))
  )

  // another run to copy all duplicate files
  indexes.forEach(copyReusedScreenshots);




  log('✅ [3/4] Frames generation done')
  
  await (new Promise((resolve) => {

    const formats = proc_args.format.split(',');
    formats.forEach((format) => {
      if (!format.trim()) {
        return;
      }
      let ffmpeg_args = ['-framerate', `${FPS}/1`, '-i', `${FRAMES_DIR}/%0${MAX_FILENAME_DIGS}d.${FORMAT}`, ];
      if (format === 'webm') {
        ffmpeg_args = [...ffmpeg_args, '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-r', ''+FPS, `${getFilename()}.${format}`, '-y']
      } else if (format === 'mp4') {
        ffmpeg_args = [...ffmpeg_args, '-c:v', 'libx264', '-r', ''+FPS, `${getFilename()}.${format}`, '-y']
      } else if (format === 'mov') {
        ffmpeg_args = [...ffmpeg_args, '-c:v', 'hevc_videotoolbox', '-allow_sw', '1', '-alpha_quality', '0.75', '-vtag', 'hvc1', '-r', ''+FPS, `${getFilename()}.${format}`, '-y']
      } else if (format === 'gif') {
        // to gen palled for each frame use stats_mode=single and add :new=1 to paletteuse options
        ffmpeg_args = [...ffmpeg_args, '-vf', `fps=${FPS},split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=sierra2_4a:bayer_scale=5`, '-loop', '0', `${getFilename()}.${format}`, '-y']

      } else {
        console.error(`Unknown format: ${format}`);
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
        if (code === 0) {
          log('✅ [4/4] Video encoding done')
        } else {
          log('🔴 [4/4] Video encoding failed, se output above')
        }
        resolve();
      });
    });

  }));
};

(async () => {
  try {
    const transBuffer = await fs.readFile(proc_args.basedir + '/translations.yml');
    const transStr = transBuffer.toString();
    if (transStr) {
      translationsDict = YAML.parse(transStr);
    }
  } catch (e) {
    console.log('Running without translations.yml', e)
  }

  for (let lang of [...Object.keys(translationsDict), 'default']) {
    await runGeneration(lang);
  }
})();