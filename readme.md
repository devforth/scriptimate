# Scriptimate – OpenSource svg animation tool

Create webm/mp4/gif videos by animating qualitative SVG files (e.g. exported from Figma or any other vector image editor).

> ⚠️ for now Supported Node version is 16+ (Probably 14, but 12 is not working)

Works on on 🪟Windows WSL 2 🐧Ubuntu 🍏Mac
## Build performance

🪧 Scriptimate uses `/tmp` to store build cache, so to improve build speed even more, make sure `/tmp` is mounted on RAM in `/etc/fstab`

```
tmpfs /tmp tmpfs nosuid,nodev,noatime 0 0
```


> ⚠️ If you made changes out of project sources (e.g. updated sytem font and re-built video), and see there are no updates in results, please use no cache parameter (`-nc 1`)


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

If you are using custom changable texts, please make sure you have all fonts that you use in styles installed into OS, e.g. on Ubuntu:

```
sudo apt install fonts-roboto fonts-open-sans
```

## Getting started

Read here: https://tracklify.com/blog/scriptimate-an-open-source-tool-to-create-svg-animations-in-a-coding-way/


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




## CLI reference


After installing just use:

```
scriptimate -h
```

To show all available options.

```
usage: scriptimate.js [-h] [-v] [-f FORMAT] [-i INPUT] [-fn FILENAME] [-t THREADS] [-fs FROMSECOND] [-d DEBUGHTML] [-bd BASEDIR]
                      [-fps FPS] [-if INTERMEDIATEFORMAT] [-ijq INTERMEDIATEJPEGQUALITY] [-nc NOCACHE]

Scriptimate v1.2.18

optional arguments:
  -h, --help            show this help message and exit
  -v, --version         show program's version number and exit
  -f FORMAT, --format FORMAT
                        output file format, or multiple via comma: "webm,mp4". Available formats: mov, mp4, gif, webm, default
                        is mp4
  -i INPUT, --input INPUT
                        Input .smte script file
  -fn FILENAME, --filename FILENAME
                        output filename
  -t THREADS, --threads THREADS
                        Threads count used during compiling, defaults to 4
  -fs FROMSECOND, --fromsecond FROMSECOND
                        Start from defined second (could be used to debug animation faster, also you can use "exis" keyword in
                        smte script)
  -d DEBUGHTML, --debughtml DEBUGHTML
                        Create HTML files near image to debug
  -bd BASEDIR, --basedir BASEDIR
                        Input directory (folder where src subfolder and .smte file is located)
  -fps FPS, --fps FPS   FPS
  -if INTERMEDIATEFORMAT, --intermediateFormat INTERMEDIATEFORMAT
                        Screenshots format used to compile video png|jpeg, defaults to png
  -ijq INTERMEDIATEJPEGQUALITY, --intermediateJpegQuality INTERMEDIATEJPEGQUALITY
                        JPEG quality 0.0 - 1.0, defaults to 1
  -nc NOCACHE, --nocache NOCACHE
                        Don't use screenshots cache (but still generate it), for scriptimate develeopmnt
```

# .smte syntax

Please start with reading [scriptimate getting started blog post](https://tracklify.com/blog/scriptimate-an-open-source-tool-to-create-svg-animations-in-a-coding-way/).
This reference could be used for advanced use-cases.

Supported commands:

## place: Place part

Part is svg file which is basic part of animation.
Filename should slug-compatible (latin, no spaces, etc).
Also this filename is used as id of part anywhere

```
place <svg file name without .svg> <left cord> <top cord> <[optional] opcaity: 0-1> <[optional] scale> <[optional] whichBoxHoleToAdd> <[optional] dashOffset>
```

Example:
Place cursor.svg at 400 120:
```
place cursor 400 120
```



## place_div: place a div

Usecases:
* dynamically change content of div via schedule_eval
* appear some content on page

```
place_div <id of div (any slug)> <left cord> <top cord> <width> <height> <[optional] opcaity 0-1> <[optional] content of div> <[optional] whichBoxHoleToAdd>
```

## place_boxhole: place boxhole

Boxhole is a rectangle zone on page which relatively places parts in it with hidden overflow (with ability to hide out of the box and then slide to zone) 

```
place_boxhole <left cord> <top cord> <width> <height>
```

## addstyle: add style to part or div

``` 
addstyle <svg name or id of div> <css styles without spaces, e.g.: "color:white;font-family:'OpenSans'">
```

## schedule_eval: schedule running of JavaScript

```
schedule_eval <id of interval> <interval in ms> <javascript code>
```

Example:

```
# schedule_eval task_time 10 incr('task_time_secs', 2); if (+get('task_time_secs') >= 60) { incr('task_time_mins'); set('task_time_secs', 0)}
```

## animate_xxx: apply animators during xxx milliseconds

You can pass one or multiple animators(via '&&'). 
If multiple animators are specified they will be executed in parallel


```
animate_<duration in ms> <animator 1> <[optional] mode> [args of animator 1]  && <animator 2> <[optional] mode> [args of animator 2] and so on
```

`mode`: could be one of:
* linear (default)
* easein
* easeout
* easeinout

Available animators:

### pause : do nothing, just wait (sleep)

```
pause
```

Example: sleep for 3.5 seconds:

```
animate_3500 pause
```

### move: move part

```
move <svg name> <[optional] mode> <target left> <target top>
```

### scale: scale part

```
scale <svg name> <[optional] mode> <target scale factor> <scale origin>
```

`<scale origin>` is css transform-origin, could be e.g.

* center (default)
* top left
* bottom right
* etc

### rotate: rotate part

```
rotate <svg name> <[optional] mode> <target rotate deg> <scale origin>
```

### opacity: change part opacity

```
opacity <svg name> <[optional] mode> <target opacity 0 - 1>
```

### dashoffset: change dash offset

Used to draw strokes. Added by [@maxm123](https://github.com/maxm123)


```
dashoffset <svg name> <[optional] mode> <target dashoffset>
```

### resize_div

Could be used to create animated bars.
This animator only changes width and height css attributes, so div should have display:flex or something added via `addstyle`.
```
resize_div <div_name> <destination width> <destination height>
```



# define_group: define group of commands

Could be used to define several parallel complex scenarious.

```
define_group <group name, slug compatable>:
  <command 1> command args
  <command 2> command args
  etc

```

Then `run_groups_together` should be used to start them

```
run_groups_together <group name 1> <group name 2> etc.
```

Example: 

```
define_group scenario1:
  animate_1000 move easein boomerang1 270 -
  animate_2000 move easeout boomerang1 $frameW-$boomerang1__WIDTH $frameH-$boomerang1__HEIGHT


define_group scenario2:
  animate_1000 move boomerang2 250 -
  animate_1000 pause
  animate_1000 move boomerang2 $frameW-$boomerang1__WIDTH 0

define_group rotator:
  animate_3000 rotate boomerang1 360*4 && rotate boomerang2 360*5

run_groups_together scenario1 scenario2 rotator
```

# Constants

Anywhere in smte you can define a constant with using:

```
const <slug compatible constant name>=<constant value>
```

Example:

```
const $PositionX=600 $underLocation=300
```

## Built-in constants

When part is added there are internal constants

```
$<part name>__WIDTH    # width of SVG part in px
$<part name>__HEIGHT   # height of SVG part in px
$<part name>__LEFT     # current left coordinate of SVG part in px
$<part name>__TOP      # current top coordinate of SVG part in px
```
They return dimensions of SVG image.

Example. Place cake.svg and plate.svg directly under it:

```
place cake 0 0 
place plate 0 $cake__HEIGHT
```


# Development

Just do:

```
npm ci
cd examples
node ../bin/scriptimate.js -i 7_dashoffset.smte -f gif
```

## Known bugs and improvements

* HTML Pages gen xx% shows more then 100% if run_groups_together is used. Only visual status bug, compiled video is correct
* HTML pages generation process is not cached and not parallelized.
* boxhole should be removed, instead we should specify div id and count relational coordinates from div