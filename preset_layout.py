"""Local crop geometry for the Gaming 60/40 and Podcast 2x2 presets."""
import math

import camera_inset
import panel_layout
import split_layout

GAMING = "gaming"
PANEL = "panel"
SPLIT = "split"
PRESETS = (GAMING, PANEL)
MANUAL_LAYOUTS = (*PRESETS, SPLIT)
DEFAULT_GAMEPLAY_PERCENT = 60
AUTO_FACECAM_SCALE = 1.18


def panel_sizes(preset, width, height, *, count=4, gameplay_percent=DEFAULT_GAMEPLAY_PERCENT):
    if preset == GAMING:
        top = 2 * math.floor(height * gameplay_percent / 200 + .5)
        return [(width, top), (width, height - top)]
    if preset == SPLIT:
        half_h = height // 2
        return [(width, half_h - half_h % 2)] * 2
    _, _, tile_w, tile_h = panel_layout.tile_grid(4, width, height)
    if count == 3:
        return [(tile_w, tile_h)] * 2 + [(width, height - tile_h)]
    return [(tile_w, tile_h)] * 4


def cover_box(bounds, target):
    """Largest target-shaped rectangle inside (width, height, left, top)."""
    w, h, x, y = bounds
    out_w, out_h = target
    ratio = out_w / out_h
    crop_w = min(w, h * ratio)
    crop_h = crop_w / ratio
    return crop_w, crop_h, x + (w - crop_w) / 2, y + (h - crop_h) / 2


def fractions(boxes, width, height):
    return [[box[2] / width, box[3] / height, box[0] / width, box[1] / height]
            if box is not None else None for box in boxes]


def validate_override(value):
    """Validate a manually placed set of source rectangles."""
    preset = value["layout"]
    boxes = value["boxes"]
    if preset not in MANUAL_LAYOUTS or not isinstance(boxes, list):
        raise ValueError("Invalid layout preset")
    if len(boxes) not in ((3, 4) if preset == PANEL else (2,)):
        raise ValueError("Wrong number of crop boxes")
    normalized = []
    for i, box in enumerate(boxes):
        if preset == PANEL and i == 3 and box is None:
            normalized.append(None)
            continue
        if not isinstance(box, (list, tuple)) or len(box) != 4:
            raise ValueError("Crop box needs four coordinates")
        x, y, w, h = map(float, box)
        if (not all(math.isfinite(p) for p in (x, y, w, h))
                or min(x, y) < 0 or min(w, h) < .015
                or x + w > 1.00001 or y + h > 1.00001):
            raise ValueError("Crop box must fit inside the source")
        normalized.append([x, y, min(w, 1 - x), min(h, 1 - y)])
    result = {"layout": preset, "boxes": normalized}
    if preset == GAMING and "gameplay_percent" in value:
        percent = value["gameplay_percent"]
        if type(percent) is not int or not 40 <= percent <= 80:
            raise ValueError("Gameplay height must be between 40% and 80%")
        result["gameplay_percent"] = percent
    return result


def pixels(boxes, width, height):
    return [(box[2] * width, box[3] * height, box[0] * width, box[1] * height)
            if box is not None else None for box in boxes]


def split_boxes(width, height, out_w, out_h, centres):
    return [split_layout.split_geometry(width, height, out_w, out_h, centre)[:4]
            for centre in centres]


def initial_boxes(preset, width, height, out_w, out_h):
    """Starting positions when an automatic layout was not applied."""
    sizes = panel_sizes(preset, out_w, out_h)
    if preset == GAMING:
        return gaming_boxes(width, height, sizes,
                            (.32 * width, .36 * height, .68 * width, .64 * height))
    half_w, half_h = width / 2, height / 2
    return [cover_box((half_w, half_h, x, y), sizes[0])
            for y in (0, half_h) for x in (0, half_w)]


def gaming_boxes(width, height, sizes, inset, *, facecam_scale=1.0):
    x, y, w, h = inset
    fw, fh, fx, fy = cover_box((w, h, x, y), sizes[1])
    scale = min(facecam_scale, width / fw, height / fh)
    wider = fw * scale
    taller = fh * scale
    # Keep the inset centered where possible, shifting the extra room inward
    # for a facecam next to the source edge.
    fx = min(max(0, fx + (fw - wider) / 2), width - wider)
    fy = min(max(0, fy + (fh - taller) / 2), height - taller)
    return [cover_box((width, height, 0, 0), sizes[0]), (wider, taller, fx, fy)]


def automatic(preset, path, scenes, strategies, bounds, width, height, out_w, out_h,
              overrides):
    """Return per-scene boxes in source pixels, with manual settings taking priority."""
    sizes = panel_sizes(preset, out_w, out_h)
    pending = [i for i in range(len(scenes)) if i not in overrides]
    detected = {}
    if pending and preset == GAMING:
        inset = camera_inset.detect(path, prefer_corner=True)
        if inset:
            for i in pending:
                if camera_inset.present_in_scene(path, inset, *bounds[i]):
                    detected[i] = gaming_boxes(width, height, sizes, inset, facecam_scale=AUTO_FACECAM_SCALE)
    if pending and preset == PANEL:
        candidates = [s if i in pending else 'TRACK' for i, s in enumerate(strategies)]
        for i, centres in panel_layout.detect_panel_scenes(
                path, scenes, candidates, enabled=True).items():
            detected[i] = panel_layout.panel_boxes(width, height, *sizes[0], centres)
    for i, value in overrides.items():
        if 0 <= i < len(scenes) and isinstance(value, dict) and value.get("layout") == preset:
            detected[i] = pixels(value["boxes"], width, height)
    return detected


def filtergraph(preset, boxes, orig_w, orig_h, out_w, out_h, *,
                gameplay_percent=DEFAULT_GAMEPLAY_PERCENT):
    sizes = panel_sizes(preset, out_w, out_h, count=len(boxes), gameplay_percent=gameplay_percent)
    inputs = "".join(f"[s{i}]" for i in range(len(sizes)))
    parts = [f"[0:v]split={len(sizes)}{inputs};"]
    for i, (box, (out_x, out_y)) in enumerate(zip(boxes, sizes)):
        if box is None:
            parts.append(
                f"[s{i}]scale={out_x}:{out_y}:force_original_aspect_ratio=decrease:"
                f"force_divisible_by=2,pad={out_x}:{out_y}:(ow-iw)/2:(oh-ih)/2,setsar=1[t{i}];")
            continue
        w, h, x, y = cover_box(box, (out_x, out_y))
        w = max(2, min(orig_w // 2, round(w / 2)) * 2)
        h = max(2, min(orig_h // 2, round(h / 2)) * 2)
        x = max(0, min((orig_w - w) // 2, round(x / 2)) * 2)
        y = max(0, min((orig_h - h) // 2, round(y / 2)) * 2)
        parts.append(f"[s{i}]crop={w}:{h}:{x}:{y},scale={out_x}:{out_y},setsar=1[t{i}];")
    if preset == PANEL and len(boxes) == 3:
        parts += [f"[t0][t1]hstack,pad={out_w}:{sizes[0][1]}:0:0[top];",
                  "[top][t2]vstack[v]"]
    elif preset == PANEL:
        parts += ["[t0][t1]hstack[top];", "[t2][t3]hstack[bottom];",
                  f"[top][bottom]vstack,pad={out_w}:{out_h}:0:0[v]"]
    elif preset == SPLIT:
        parts.append(f"[t0][t1]vstack,pad={out_w}:{out_h}:0:0[v]")
    else:
        parts.append("[t0][t1]vstack[v]")
    return "".join(parts)
