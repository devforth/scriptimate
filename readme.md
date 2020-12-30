
ffmpeg -framerate 25/1 -i res/%06d.png -c:v libx264 -r 25 out.mp4 -y


ffmpeg -framerate 25/1 -i res/%06d.png -c:v libvpx-vp9 -b:v 2M -r 25 out.webm -y