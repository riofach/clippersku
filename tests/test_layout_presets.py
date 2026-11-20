import shutil
import subprocess

import pytest

import layout_ranges
import preset_layout as presets


@pytest.mark.parametrize("preset,source,boxes,samples", [
    ("gaming", "color=red:s=160x90:d=1,drawbox=x=120:y=60:w=40:h=30:c=blue:t=fill",
     [(80, 90, 40, 0), (40, 30, 120, 60)],
     [(80, 167, 0), (80, 168, 2)]),
    ("panel", "color=red:s=160x90:d=1,drawbox=x=80:y=0:w=80:h=44:c=lime:t=fill,"
              "drawbox=x=0:y=44:w=80:h=46:c=blue:t=fill,"
              "drawbox=x=80:y=44:w=80:h=46:c=white:t=fill",
     [(48, 42, 16, 0), (48, 42, 96, 0), (48, 44, 16, 44), (48, 44, 96, 44)],
     [(40, 70, 0), (120, 70, 1), (40, 210, 2), (120, 210, 0)]),
])
@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs FFmpeg")
def test_filtergraph_renders_expected_panel_pixels(preset, source, boxes, samples):
    graph = presets.filtergraph(preset, boxes, 160, 90, 160, 280)
    rgb = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", source,
         "-filter_complex", graph, "-map", "[v]", "-frames:v", "1",
         "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], timeout=20)
    assert len(rgb) == 160 * 280 * 3
    for x, y, channel in samples:
        i = (y * 160 + x) * 3
        assert rgb[i + channel] > 215
    if preset == "gaming":
        assert rgb[(167 * 160 + 80) * 3 + 2] < 30
        assert rgb[(168 * 160 + 80) * 3] < 30


def test_facecam_uses_manual_crop_when_missing_and_only_splits_visible_scenes(monkeypatch):
    monkeypatch.setattr(presets.camera_inset, "detect", lambda *a, **kw: (600, 320, 40, 40))
    monkeypatch.setattr(presets.camera_inset, "present_in_scene",
                        lambda path, inset, start, end: start == 0)
    manual = presets.validate_override({
        "layout": "gaming", "boxes": [[.2, .1, .4, .8], [.1, .55, .18, .35]],
    })
    got = presets.automatic(
        "gaming", "in.mp4", [None] * 3, ["WIDE"] * 3,
        [(0, 30), (30, 60), (60, 90)], 640, 360, 1080, 1920, {2: manual})
    assert set(got) == {0, 2}
    assert got[2] == presets.pixels(manual["boxes"], 640, 360)
    assert got[0][1][2] >= 600


def test_panel_supports_a_wide_tile_and_preserves_boxes_in_metadata(tmp_path, monkeypatch):
    monkeypatch.setattr(presets.panel_layout, "detect_panel_scenes",
                        lambda *a, **kw: {0: [(100, 125), (320, 125), (540, 125)]})
    got = presets.automatic("panel", "in.mp4", [None], ["GENERAL"], [(0, 90)],
                            640, 360, 1080, 1920, {})
    assert len(got[0]) == 4 and got[0][3] is None
    boxes = presets.fractions(got[0], 640, 360)
    path = str(tmp_path / "out.mp4")
    layout_ranges.write(path, [(0, 3, "PANEL", None, boxes)])
    assert layout_ranges.remap(layout_ranges.read(path), [{"start": 1, "end": 3}]) == [
        {"start": 0, "end": 2, "layout": "panel", "boxes": boxes}]


@pytest.mark.parametrize("boxes", [
    [[.9, .9, .3, .3], [.1, .1, .2, .2]],
    [[float("nan"), 0, .2, .2], [.1, .1, .2, .2]],
    [[0, 0, 1, 1]],
])
def test_rejects_invalid_manual_crops(boxes):
    with pytest.raises(ValueError):
        presets.validate_override({"layout": "gaming", "boxes": boxes})
