#!/usr/bin/env python3
import os
import struct
import sys
import zlib
from collections import deque

PNG_SIG = b"\x89PNG\r\n\x1a\n"

def read_png_rgba(path):
    data = open(path, "rb").read()
    if not data.startswith(PNG_SIG):
        raise ValueError(f"not a PNG: {path}")
    pos = len(PNG_SIG)
    width = height = bit_depth = color_type = None
    idat = []
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos+4])[0]
        ctype = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+length]
        pos += 12 + length
        if ctype == b"IHDR":
            width, height, bit_depth, color_type, comp, filt, interlace = struct.unpack(">IIBBBBB", chunk)
            if bit_depth != 8 or interlace != 0 or color_type not in (2, 6):
                raise ValueError(f"unsupported PNG format in {path}: bit={bit_depth}, type={color_type}, interlace={interlace}")
        elif ctype == b"IDAT":
            idat.append(chunk)
        elif ctype == b"IEND":
            break
    channels = 4 if color_type == 6 else 3
    raw = zlib.decompress(b"".join(idat))
    stride = width * channels
    rows = []
    i = 0
    prev = [0] * stride
    bpp = channels
    for _ in range(height):
        f = raw[i]
        i += 1
        cur = list(raw[i:i+stride])
        i += stride
        if f == 1:
            for x in range(stride):
                left = cur[x-bpp] if x >= bpp else 0
                cur[x] = (cur[x] + left) & 255
        elif f == 2:
            for x in range(stride):
                cur[x] = (cur[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                left = cur[x-bpp] if x >= bpp else 0
                cur[x] = (cur[x] + ((left + prev[x]) // 2)) & 255
        elif f == 4:
            for x in range(stride):
                a = cur[x-bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x-bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if pa <= pb and pa <= pc else b if pb <= pc else c
                cur[x] = (cur[x] + pr) & 255
        elif f != 0:
            raise ValueError(f"unsupported PNG filter {f} in {path}")
        prev = cur
        rows.append(cur)
    pixels = bytearray(width * height * 4)
    p = 0
    for row in rows:
        for x in range(width):
            j = x * channels
            pixels[p:p+4] = bytes((row[j], row[j+1], row[j+2], row[j+3] if channels == 4 else 255))
            p += 4
    return width, height, pixels

def write_png_rgba(path, width, height, pixels):
    def chunk(ctype, payload):
        return struct.pack(">I", len(payload)) + ctype + payload + struct.pack(">I", zlib.crc32(ctype + payload) & 0xffffffff)
    raw = bytearray()
    row_len = width * 4
    for y in range(height):
        raw.append(0)
        start = y * row_len
        raw.extend(pixels[start:start+row_len])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(PNG_SIG)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        f.write(chunk(b"IEND", b""))

def is_border_background_candidate(r, g, b, a):
    if a == 0:
        return True
    mx, mn = max(r, g, b), min(r, g, b)
    # The fake transparency is a light neutral checkerboard. Flood fill only from borders,
    # so white fur is protected unless it directly connects to the outer frame.
    return mx >= 218 and (mx - mn) <= 22

def clean(path, out_path):
    w, h, px = read_png_rgba(path)
    total = w * h
    bg = bytearray(total)
    q = deque()
    def enqueue(x, y):
        if x < 0 or y < 0 or x >= w or y >= h:
            return
        idx = y * w + x
        if bg[idx]:
            return
        p = idx * 4
        if is_border_background_candidate(px[p], px[p+1], px[p+2], px[p+3]):
            bg[idx] = 1
            q.append((x, y))
    for x in range(w):
        enqueue(x, 0)
        enqueue(x, h - 1)
    for y in range(h):
        enqueue(0, y)
        enqueue(w - 1, y)
    while q:
        x, y = q.popleft()
        enqueue(x + 1, y)
        enqueue(x - 1, y)
        enqueue(x, y + 1)
        enqueue(x, y - 1)
    removed = 0
    for idx, is_bg in enumerate(bg):
        if is_bg:
            px[idx*4 + 3] = 0
            removed += 1
    write_png_rgba(out_path, w, h, px)
    return removed, total

def main():
    inputs = sys.argv[1:] or [
        "public/mascots/idle/angel_cassette.png",
        "public/mascots/idle/devil_nintendo.png",
    ]
    for src in inputs:
        if not os.path.exists(src):
            continue
        base = os.path.splitext(os.path.basename(src))[0]
        out = os.path.join("public/mascots/idle-cleaned", base + ".png")
        removed, total = clean(src, out)
        print(f"{src} -> {out} removed {removed/total:.1%}")

if __name__ == "__main__":
    main()
