import shutil
import subprocess

import pytest

import reframe_v2 as rf
from reframe_render_cache import ReframeRenderCache


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
                    reason="requires FFmpeg")
def test_changed_scene_is_encoded_and_unchanged_video_is_reused(tmp_path, monkeypatch):
    source = tmp_path / "source.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i",
                    "color=c=red:s=160x90:r=10:d=3",
                    "-f", "lavfi", "-i", "sine=d=3", "-c:v", "libx264",
                    "-c:a", "aac", str(source)], check=True)
    monkeypatch.setattr(rf.gpu_render, "usable", lambda _: False)
    real_encode = rf._run_segment
    encoded = []

    def count_encode(path, start, *args):
        encoded.append(start)
        return real_encode(path, start, *args)

    monkeypatch.setattr(rf, "_run_segment", count_encode)
    normal = "[0:v]crop=48:84:56:2,scale=90:160,setsar=1[v]"
    moved = "[0:v]crop=48:84:84:2,scale=90:160,setsar=1[v]"
    for n, graph in enumerate((normal, moved)):
        cache = ReframeRenderCache(tmp_path, 0, ["same-source", 0, 3])
        assert cache.prepare()
        work = tmp_path / f"work{n}"
        work.mkdir()
        output = tmp_path / f"out{n}.mp4"
        specs = [(0., 1., normal, None), (1., 1., graph, None), (2., 1., normal, None)]
        rf.encode_scenes(str(source), specs, 160, 90, 90, 160, 10, str(work),
                         None, str(output), render_cache=cache)
        assert cache.reused == (2 if n else 0)
        assert cache.encoded == (1 if n else 3)
        stream = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=codec_type,nb_frames",
            "-of", "csv=p=0", str(output)], text=True)
        assert "video,30" in stream and "audio" in stream
    assert encoded == [0., 1., 2., 1.]
