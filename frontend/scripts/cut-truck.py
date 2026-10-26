"""Cut the S2 studio truck ("Carrier clips/truck-side.jpg", 625x350) out of its background.

Usage (from the repo root):
  ffmpeg -i "Carrier clips/truck-side.jpg" -vf hflip -f rawvideo -pix_fmt rgb24 /tmp/flip.rgb
  python3 scripts/cut-truck.py /tmp/flip.rgb /tmp/truck.rgba /tmp/wheel 6
  ffmpeg -f rawvideo -pix_fmt rgba -s 512x202 -i /tmp/truck.rgba -c:v libwebp -pix_fmt yuva420p -quality 92 public/media/truck-side.webp
  ffmpeg -f rawvideo -pix_fmt rgba -s 54x54 -i /tmp/wheel-rear.rgba  -c:v libwebp -pix_fmt yuva420p -quality 95 public/media/truck-wheel-rear.webp
  ffmpeg -f rawvideo -pix_fmt rgba -s 54x54 -i /tmp/wheel-front.rgba -c:v libwebp -pix_fmt yuva420p -quality 95 public/media/truck-wheel-front.webp

The photo faces left, so it is mirrored first to drive left → right. Geometry (box, wheel centres,
crop) is hard-coded for this image.

Flood-fills from the image border through pixels that change smoothly and stay bright,
drops everything below the tyres (floor reflection), feathers the edge, and writes RGBA."""
import sys
from collections import deque

W, H = 625, 350
src, out_truck, out_wheels = sys.argv[1], sys.argv[2], sys.argv[3]
STEP, MIN_L, FLOOR_Y = int(sys.argv[4]), 150, 281
b = open(src, 'rb').read()

def px(x, y):
    i = (y * W + x) * 3
    return b[i], b[i + 1], b[i + 2]

# the cargo box is an exact rectangle; never let the flood into it
BOX = (52, 90, 445, 224)
inbox = lambda x, y: BOX[0] <= x < BOX[2] and BOX[1] <= y < BOX[3]

bg = bytearray(W * H)  # 1 = background
q = deque()
for y in range(H):
    for x in range(W):
        if y >= FLOOR_Y:
            bg[y * W + x] = 1
        elif x in (0, W - 1) or y == 0:
            bg[y * W + x] = 1
            q.append((x, y))
for x in range(W):  # seed the floor line
    q.append((x, FLOOR_Y))
# floor pockets boxed in by the wheels, chassis and contact shadow
for sx, sy in ((330, 266), (280, 270), (400, 270), (120, 268), (100, 272)):
    if not inbox(sx, sy):
        bg[sy * W + sx] = 1
        q.append((sx, sy))
while q:
    x, y = q.popleft()
    p = px(x, y)
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < W and 0 <= ny < FLOOR_Y and not bg[ny * W + nx] and not inbox(nx, ny):
            n = px(nx, ny)
            if min(n) >= MIN_L and max(abs(n[k] - p[k]) for k in range(3)) <= STEP:
                bg[ny * W + nx] = 1
                q.append((nx, ny))

# alpha with a 3x3 feather
a = bytearray(W * H)
for y in range(H):
    for x in range(W):
        s = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                xx, yy = min(W - 1, max(0, x + dx)), min(H - 1, max(0, y + dy))
                s += 0 if bg[yy * W + xx] else 255
        a[y * W + x] = s // 9

def write(path, x0, y0, w, h, mask=None):
    o = bytearray()
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            r, g, bb = px(x, y)
            al = a[y * W + x] if mask is None else mask(x, y)
            o += bytes((r, g, bb, al))
    open(path, 'wb').write(o)

# truck crop: x 44..555, y 84..285  (512 x 202)
write(out_truck, 44, 84, 512, 202)
# wheels: circular crops, r 27, centres from the grid pass
for name, cx, cy in (('rear', 182, 254), ('front', 480, 254)):
    R = 27
    def m(x, y, cx=cx, cy=cy):
        d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
        return 255 if d <= R - 1 else (0 if d >= R else int(255 * (R - d)))
    write(f'{out_wheels}-{name}.rgba', cx - R, cy - R, 2 * R, 2 * R, m)
print('ok')
