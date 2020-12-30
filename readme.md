


MP4 used by default (faster compile, less optimized)

npx run scriptimate

To use webm:

npx run scriptimate -f webm




Under the hood next commands are used:

ffmpeg -framerate 25/1 -i frames/%07d.png -c:v libx264 -r 25 out.mp4 -y


ffmpeg -framerate 25/1 -i frames/%07d.png -c:v libvpx-vp9 -b:v 2M -r 25 out.webm -y