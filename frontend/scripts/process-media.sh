#!/usr/bin/env bash
# Turn the raw clips in "Carrier clips/" into the web assets in public/media/ (plan §7).
#
# Usage:  bash scripts/process-media.sh ["Carrier clips"] [public/media]
#
#   hero-2.mp4       → dispatch-intro.mp4     (S0 slide 1, plays once, then the hero slide)
#   hero.mp4         → dispatch-loop.mp4      (S0 slide 2; "ROOT ROUTE" printed on the truck)
#   catching_parcels.mp4 → inspect/0001.webp … (S1 Platform, canvas frame sequence, green keyed out)
#   aerial rise.mp4  → scale-scrub.mp4        (S3, all-intra for instant seeking)
#   connect.mp4      → fulfill-1a.mp4         (S4 card 1, loops)
#   Decide.mp4       → fulfill-1b.mp4         (S4 card 2, loops)
#   Learn.mp4        → fulfill-1c.mp4         (S4 card 3, plays once)
#   footer-new.mp4   → fulfill-2-scrub.mp4    (Deliver/footer, all-intra) + fulfill-2-end.webp (still)
#
# Mobile: *-m.mp4 are 720p 9:16 centre crops of the scrubbed clips.
set -euo pipefail

RAW=${1:-"Carrier clips"}
OUT=${2:-public/media}
FF=(ffmpeg -v error -y)

command -v ffmpeg >/dev/null || { echo "ffmpeg not found"; exit 1; }
mkdir -p "$OUT/inspect"
ASSETS=$(cd "$(dirname "$0")/assets" && pwd)
RAW_ABS=$(cd "$RAW" && pwd)

# brand: "ROOT ROUTE" (Michroma) printed on the hero truck's box side. The truck never moves in
# hero.mp4, so the text is warped once onto the side's corners (TL, TR, BL, BR in 1920×1080) and laid
# over every frame. The text layer is drawn 1920×878 and stretched to 1080 to offset the perspective
# squash. ffmpeg's filter parser chokes on long paths, so this runs from a temp dir.
BRAND=$(mktemp -d)
trap 'rm -rf "$BRAND"' EXIT
cp "$ASSETS/Michroma-Regular.ttf" "$BRAND/brand.ttf"
printf 'ROOT ROUTE' > "$BRAND/brand.txt"
HERO="$BRAND/hero-branded.mp4"
(cd "$BRAND" && "${FF[@]}" -i "$RAW_ABS/hero.mp4" -f lavfi -i "color=c=black@0:s=1920x878,format=rgba" -filter_complex \
  "[1:v]drawtext=fontfile=brand.ttf:textfile=brand.txt:fontsize=150:fontcolor=0x2a2d32@0.88:borderw=5:bordercolor=0x2a2d32@0.88:x=(w-text_w)/2:y=(h-text_h)/2-40,scale=1920:1080,format=yuva444p,perspective=x0=1125:y0=406:x1=1682:y1=452:x2=1125:y2=688:x3=1682:y3=676:sense=destination:interpolation=cubic,gblur=sigma=0.7[t];[0:v][t]overlay=format=auto:shortest=1" \
  -an -c:v libx264 -crf 12 -preset fast -pix_fmt yuv420p "$HERO")

# loops
"${FF[@]}" -i "$RAW/hero-2.mp4" -an -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -vf scale=1920:-2 -movflags +faststart "$OUT/dispatch-intro.mp4"
"${FF[@]}" -i "$HERO" -an -c:v libx264 -crf 27 -preset slow -pix_fmt yuv420p -vf scale=1920:-2 -movflags +faststart "$OUT/dispatch-loop.mp4"
for pair in "connect:a" "Decide:b" "Learn:c"; do
  src=${pair%%:*} x=${pair##*:}
  "${FF[@]}" -i "$RAW/$src.mp4" -an -c:v libx264 -crf 29 -preset slow -pix_fmt yuv420p -vf scale=1280:-2 -movflags +faststart "$OUT/fulfill-1$x.mp4"
done

# scrubbed: every frame a keyframe so seeking never stutters
scrub() {
  local in=$1 name=$2
  "${FF[@]}" -i "$in" -an -c:v libx264 -g 1 -crf 26 -preset slow -pix_fmt yuv420p -vf scale=1920:-2 -movflags +faststart "$OUT/$name.mp4"
  "${FF[@]}" -i "$in" -an -c:v libx264 -g 1 -crf 27 -preset slow -pix_fmt yuv420p -vf "crop=ih*9/16:ih,scale=720:-2" -movflags +faststart "$OUT/$name-m.mp4"
}
scrub "$RAW/aerial rise.mp4" scale-scrub
scrub "$RAW/footer-new.mp4" fulfill-2-scrub

# frame sequence: green screen keyed out to transparent webp. The box paints over the sparkle
# watermark in the bottom-right corner first so it keys out with the background.
rm -f "$OUT"/inspect/*.webp
"${FF[@]}" -i "$RAW/catching_parcels.mp4" -vf "fps=24,drawbox=x=1690:y=850:w=110:h=110:color=0x16B824:t=fill,chromakey=0x16B824:0.13:0.08,despill=type=green,scale=1600:-2:flags=lanczos,format=yuva420p" -c:v libwebp -quality 70 -compression_level 6 "$OUT/inspect/%04d.webp"

# posters: first frame of each clip, the final frame of footer
poster() { "${FF[@]}" -i "$1" -frames:v 1 -vf "scale=$3:-2" -c:v libwebp -quality 78 "$OUT/$2.webp"; }
poster "$RAW/hero-2.mp4" dispatch-intro-poster 1920
poster "$HERO" dispatch-poster 1920
poster "$RAW/aerial rise.mp4" scale-poster 1920
poster "$RAW/connect.mp4" fulfill-1a 1280
poster "$RAW/Decide.mp4" fulfill-1b 1280
poster "$RAW/Learn.mp4" fulfill-1c 1280
poster "$RAW/footer-new.mp4" fulfill-2-poster 1920
"${FF[@]}" -sseof -0.15 -i "$RAW/footer-new.mp4" -frames:v 1 -vf scale=1920:-2 -c:v libwebp -quality 78 "$OUT/fulfill-2-end.webp"

echo "inspect frames: $(find "$OUT/inspect" -name '*.webp' | wc -l | tr -d ' ')  ($(du -sh "$OUT/inspect" | cut -f1))"
ls -lh "$OUT" | awk 'NR>1 {print $5, $9}'
