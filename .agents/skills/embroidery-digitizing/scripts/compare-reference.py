#!/usr/bin/env python3
"""Create a standalone SVG comparing reference and stitches in one millimetre frame.

Requires pystitch (available in Threadroom's .venv). The preview must be an unaltered
capture_preview PNG; PES, preview and full project must describe the same revision.
"""
import argparse
import base64
import json
import math
from pathlib import Path
import struct
from xml.sax.saxutils import escape, quoteattr

from pystitch import read_pes, STITCH, COMMAND_MASK

HOOPS = {'100x100': (100, 100), '180x130': (180, 130),
         '300x200': (300, 200), '60x40': (60, 40)}


def source_bounds(image):
    cx, cy = image['x'] + image['width'] / 2, image['y'] + image['height'] / 2
    angle = math.radians(image.get('rotation', 0))
    corners = [(cx + x * math.cos(angle) - y * math.sin(angle),
                cy + x * math.sin(angle) + y * math.cos(angle))
               for x in (-image['width'] / 2, image['width'] / 2)
               for y in (-image['height'] / 2, image['height'] / 2)]
    return [min(p[0] for p in corners), min(p[1] for p in corners),
            max(p[0] for p in corners), max(p[1] for p in corners)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, type=Path)
    parser.add_argument('--pes', required=True, type=Path)
    parser.add_argument('--preview', required=True, type=Path)
    parser.add_argument('--image-id', required=True)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--region', nargs=4, type=float, metavar=('X0', 'Y0', 'X1', 'Y1'))
    args = parser.parse_args()
    project = json.loads(args.project.read_text())
    image = next((i for i in project.get('images', []) if i['id'] == args.image_id), None)
    if image is None:
        parser.error('Reference image ID is not in the project.')
    src = image.get('src', '')
    if not src.startswith('data:image/') or src.endswith(('…', '...')):
        parser.error('Use a full project with the complete reference data URL.')
    width, height = HOOPS[project['hoop']]
    pattern = read_pes(str(args.pes))
    points = [(x / 10 + width / 2, y / 10 + height / 2)
              for x, y, command in pattern.stitches if command & COMMAND_MASK == STITCH]
    if not points:
        parser.error('PES contains no stitches.')
    stitch_box = [min(q[0] for q in points) - 5, min(q[1] for q in points) - 5,
                  max(q[0] for q in points) + 5, max(q[1] for q in points) + 5]
    png = args.preview.read_bytes()
    if png[:8] != b'\x89PNG\r\n\x1a\n':
        parser.error('Preview must be the original capture_preview PNG.')
    pixel_width, pixel_height = struct.unpack('>II', png[16:24])
    bw, bh = stitch_box[2] - stitch_box[0], stitch_box[3] - stitch_box[1]
    if abs(pixel_width / pixel_height - bw / bh) > .01:
        parser.error('Preview aspect does not match the PES bounds; check revision and cropping.')
    box = args.region or source_bounds(image)
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        parser.error('Comparison region must have positive width and height.')
    panel_w = 600
    panel_h = round(panel_w * (y1 - y0) / (x1 - x0))
    gap, margin, top = 20, 20, 66
    canvas_w, canvas_h = panel_w * 2 + gap + margin * 2, top + panel_h + margin
    preview_src = 'data:image/png;base64,' + base64.b64encode(png).decode()
    rotation = image.get('rotation', 0)
    cx, cy = image['x'] + image['width'] / 2, image['y'] + image['height'] / 2
    source_image = (f'<image href={quoteattr(src)} x="{image["x"]}" y="{image["y"]}" '
                    f'width="{image["width"]}" height="{image["height"]}" '
                    f'transform="rotate({rotation} {cx} {cy})"/>')
    stitch_image = (f'<image href={quoteattr(preview_src)} x="{stitch_box[0]}" y="{stitch_box[1]}" '
                    f'width="{bw}" height="{bh}"/>')
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{canvas_w}" height="{canvas_h}">',
           '<rect width="100%" height="100%" fill="#151515"/>',
           '<style>text{font-family:Arial,sans-serif;fill:#f0f0f0} .sub{fill:#aaa;font-size:12px}</style>']
    for index, (title, body) in enumerate([('REFERENCE', source_image), ('STITCH RENDER', stitch_image)]):
        x = margin + index * (panel_w + gap)
        svg += [f'<text x="{x}" y="25" font-size="16">{title}</text>',
                f'<text class="sub" x="{x}" y="46">Same frame: {x0:.1f}, {y0:.1f} to {x1:.1f}, {y1:.1f} mm</text>',
                f'<svg x="{x}" y="{top}" width="{panel_w}" height="{panel_h}" '
                f'viewBox="{x0} {y0} {x1-x0} {y1-y0}" overflow="hidden">',
                f'<rect x="{x0}" y="{y0}" width="{x1-x0}" height="{y1-y0}" fill="black"/>', body, '</svg>']
    svg += [f'<desc>{escape(project["name"])}. Visual comparison, not a physical stitch-out.</desc>', '</svg>']
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text('\n'.join(svg))
    print(json.dumps({'output': str(args.out), 'regionMm': box, 'stitchPreviewBoundsMm': stitch_box}))


if __name__ == '__main__':
    main()
