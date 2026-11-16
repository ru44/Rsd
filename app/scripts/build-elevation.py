"""Builds public/elevation.png: land height and sea depth for the whole world.

Source: Mapzen "terrarium" terrain tiles (a blend of ETOPO1, SRTM, GMTED and
others), zoom 4, about 10 km per point at the equator. They are stitched,
unwrapped from the Mercator projection onto an even latitude/longitude grid,
and written as a picture where red*256 + green - 11000 is the height in metres.

Needs Pillow and numpy. Run:  python3 scripts/build-elevation.py <work-dir>
"""
import io, sys, math, pathlib, urllib.request, concurrent.futures
import numpy as np
from PIL import Image

Z, N, T = 4, 16, 256
W, H, F = 2880, 1440, 1  # 7.5 arc-minutes: about 14 km
OFFSET = 11000
work = pathlib.Path(sys.argv[1]); work.mkdir(parents=True, exist_ok=True)
out = pathlib.Path(__file__).resolve().parent.parent / "public" / "elevation.png"

def fetch(xy):
    x, y = xy
    f = work / f"{Z}-{x}-{y}.png"
    if not f.exists():
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png"
        f.write_bytes(urllib.request.urlopen(url, timeout=60).read())
    return x, y, np.asarray(Image.open(io.BytesIO(f.read_bytes())).convert("RGB"), dtype=np.float32)

merc = np.zeros((N * T, N * T), dtype=np.float32)
with concurrent.futures.ThreadPoolExecutor(8) as pool:
    for x, y, a in pool.map(fetch, [(x, y) for x in range(N) for y in range(N)]):
        merc[y * T:(y + 1) * T, x * T:(x + 1) * T] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

# Row r of the result is latitude 90 - (r + 0.5) * 180 / H. Mercator stops at
# about 85 degrees; beyond that the nearest row is repeated.
lat = np.radians(np.clip(90 - (np.arange(H * F) + 0.5) * 180 / (H * F), -85.05, 85.05))
my = (1 - np.log(np.tan(lat) + 1 / np.cos(lat)) / math.pi) / 2 * N * T
rows = np.clip(my.astype(int), 0, N * T - 1)
cols = np.clip(((np.arange(W * F) + 0.5) / (W * F) * N * T).astype(int), 0, N * T - 1)
fine = merc[rows][:, cols]
# Average each block of points down to the final grid.
fine = fine.reshape(H, F, W, F).mean(axis=(1, 3)) if F > 1 else fine
print("highest at", np.unravel_index(fine.argmax(), fine.shape), "lowest at", np.unravel_index(fine.argmin(), fine.shape))
grid = np.rint(fine).astype(np.int32) + OFFSET
grid = np.clip(grid, 0, 65535)

rgb = np.zeros((H, W, 3), dtype=np.uint8)
rgb[..., 0] = grid >> 8
rgb[..., 1] = grid & 255
Image.fromarray(rgb).save(out, optimize=True)
print(out, out.stat().st_size, "bytes; min", grid.min() - OFFSET, "max", grid.max() - OFFSET)
