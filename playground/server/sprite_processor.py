"""Local PetX-style green-screen extraction and sprite-strip normalization."""

from __future__ import annotations

import io
import sys

import cv2
import numpy as np
from PIL import Image


def extract_subject(image: Image.Image) -> Image.Image:
    source = image.convert("RGBA")
    data = np.asarray(source).copy()
    red = data[:, :, 0].astype(np.int16)
    green = data[:, :, 1].astype(np.int16)
    blue = data[:, :, 2].astype(np.int16)
    background = (green > 105) & (green > red * 1.32) & (green > blue * 1.22)
    lower_half = np.indices(green.shape)[0] > int(source.height * 0.60)
    floor_bar = lower_half & (
        ((red > 115) & (green < 78) & (blue < 78))
        | ((green > 90) & (green > red * 1.12) & (green > blue * 1.12))
    )
    background |= floor_bar
    data[background, 3] = 0
    alpha = data[:, :, 3]
    if not np.any(alpha):
        raise ValueError("当前帧未检测到角色，请检查绿幕背景和帧数")

    count, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 0).astype(np.uint8), 8)
    if count > 1:
        subject_label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        alpha[labels != subject_label] = 0
    source.putalpha(Image.fromarray(alpha, "L"))
    bounds = source.getbbox()
    if bounds is None:
        raise ValueError("抠图后没有可见主体")
    return source.crop(bounds)


def normalize(subject: Image.Image, frame_width: int, frame_height: int, baseline: int) -> Image.Image:
    max_width = round(frame_width * 174 / 192)
    max_height = round(frame_height * 194 / 208)
    fit = min(max_width / subject.width, max_height / subject.height)
    width = max(1, round(subject.width * fit))
    height = max(1, round(subject.height * fit))
    subject = subject.resize((width, height), Image.Resampling.LANCZOS)
    frame = Image.new("RGBA", (frame_width, frame_height))
    frame.alpha_composite(subject, ((frame_width - width) // 2, baseline - height))
    return frame


def process(raw: bytes, frame_width: int, frame_height: int, frame_count: int) -> bytes:
    if not (16 <= frame_width <= 1024 and 16 <= frame_height <= 1024 and 1 <= frame_count <= 16):
        raise ValueError("无效的帧尺寸或帧数")
    source = Image.open(io.BytesIO(raw)).convert("RGB")
    if source.width < frame_count or source.width / source.height < frame_count * 0.04:
        raise ValueError("图片太窄，无法按指定帧数解析横向精灵图")
    cell_width = source.width / frame_count
    baseline = round(frame_height * 201 / 208)
    strip = Image.new("RGBA", (frame_width * frame_count, frame_height))
    for index in range(frame_count):
        left = round(index * cell_width)
        right = round((index + 1) * cell_width)
        cell = source.crop((left, 0, right, source.height))
        strip.alpha_composite(normalize(extract_subject(cell), frame_width, frame_height, baseline), (index * frame_width, 0))
    output = io.BytesIO()
    strip.save(output, format="WEBP", lossless=True, method=6)
    return output.getvalue()


def main() -> None:
    try:
        frame_width, frame_height, frame_count = map(int, sys.argv[1:4])
        result = process(sys.stdin.buffer.read(), frame_width, frame_height, frame_count)
        sys.stdout.buffer.write(result)
    except Exception as error:
        print(str(error) or error.__class__.__name__, file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
