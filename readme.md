# Scriptimate – OpenSource svg animation tool

Create webm/mp4/gif videos by animating qualitative SVG files (e.g. exported from Figma or any other vector image editor).

## CLI ussage

```
usage: scriptimate [-h] [-v] [-f FORMAT] [-i INPUT] [-fn FILENAME] [-t THREADS] [-fs FROMSECOND] [-d DEBUGHTML] [-bd BASEDIR] [-fps FPS]
                   [-if INTERMEDIATEFORMAT] [-ijq INTERMEDIATEJPEGQUALITY]

Scriptimate v1.2.14

optional arguments:
  -h, --help            show this help message and exit
  -v, --version         show program's version number and exit
  -f FORMAT, --format FORMAT
                        format webm or mp4, or multiple: "webm,mp4"
  -i INPUT, --input INPUT
                        Input .scrp file
  -fn FILENAME, --filename FILENAME
                        filename
  -t THREADS, --threads THREADS
                        Threads count
  -fs FROMSECOND, --fromsecond FROMSECOND
                        Start from second
  -d DEBUGHTML, --debughtml DEBUGHTML
                        Create html files near image to debug
  -bd BASEDIR, --basedir BASEDIR
                        Input dir
  -fps FPS, --fps FPS   FPS
  -if INTERMEDIATEFORMAT, --intermediateFormat INTERMEDIATEFORMAT
                        png|jpeg
  -ijq INTERMEDIATEJPEGQUALITY, --intermediateJpegQuality INTERMEDIATEJPEGQUALITY
                        0.0 - 1.0
```


## Typical example


Create text file `demo.smte`:

```
set_frame_size 600 300
place boomerang 0 100
animate_1000 move boomerang 400 - && rotate boomerang 720 && scale boomerang 2
```

Place `boomerang.svg` into `src/` folder. E.g. this one: [boomerang.svg](./examples/src/boomerang.svg)

Execute scriptimate to compile video:

```
npx scriptimate@latest -i demo.smte -f gif
```

You will get:

![](./examples/3_parallel_animations.gif)

[Read guide here](https://tracklify.com/blog/scriptimate-an-open-source-tool-to-create-svg-animations-in-a-coding-way/)

## Prerequirements 

You need to have next packages on your system (works for Ubuntu and [Windows WSL2](https://hinty.io/devforth/how-to-install-wsl-2-best-way-to-run-real-linux-on-windows/)):

```
sudo apt install libnss3-dev libatk-bridge2.0-0 libcups2 libgtk-3-0 libgbm-dev ffmpeg
```

(All apart `ffmpeg` required to run pupeeter which is used to generate high-qaulity frames, some taken from here https://gist.github.com/winuxue/cfef08e2f5fe9dfc16a1d67a4ad38a01)s

Required version of `ffmpeg >=4.x` (Will be installed automatically in Ubuntu 20.04+, when in 18.04 it will be 3.x, which is not compatible)

If you are using custom changable texts, please make sure you have all fonts installed which you use:

```
sudo apt install fonts-roboto
```

## Hello world example

Read here: https://tracklify.com/blog/scriptimate-an-open-source-tool-to-create-svg-animations-in-a-coding-way/

# Development

Just do:

```
npm ci
cd examples
node ../bin/scriptimate.js -i 7_dashoffset.smte -f gif
```


## How to run examples from this repo

1. Pull the repo
2. `cd example`
3. Execute `npx scriptimate@latest -i 1_helloworld.smte`


## Advanced ussage

Under the hood next commands are used:

```
ffmpeg -framerate 25/1 -i frames/%07d.jpg -c:v libx264 -r 25 out.mp4 -y
```

Or for webm:

```
ffmpeg -framerate 25/1 -i frames/%07d.jpg -c:v libvpx-vp9 -b:v 2M -r 25 out.webm -y
```

After generation phace we frames folder will be persisted so feel free to change ffmpeg command in any way you want.
