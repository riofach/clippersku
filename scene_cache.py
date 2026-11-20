"""One cached set of scene thumbnails and one preview per clip timeline."""
import hashlib
import json
import math
import re
from pathlib import Path

from jsonfile import write_json_atomic

_VERSION = 1
_KEY = re.compile(r"[a-f0-9]{20}")


def saved_intervals(ranges, duration, tolerance=.25):
    """Use an existing scene map only if it covers the current cut end to end."""
    if not ranges or duration <= 0:
        return []
    intervals = []
    last_end = 0.0
    for r in ranges:
        try:
            start, end = float(r["start"]), float(r["end"])
        except (KeyError, TypeError, ValueError):
            return []
        if (not math.isfinite(start) or not math.isfinite(end)
                or abs(start - last_end) > tolerance or end <= last_end):
            return []
        intervals.append((last_end, end))
        last_end = end
    if abs(last_end - duration) > tolerance or intervals[-1][0] >= duration:
        return []
    intervals[-1] = (intervals[-1][0], duration)
    return intervals


def source_time_at(segments, time_in_cut):
    for segment in segments:
        duration = segment["end"] - segment["start"]
        if time_in_cut < duration:
            return segment["start"] + max(0., time_in_cut)
        time_in_cut -= duration
    return segments[-1]["end"]


def key_for(source, segments):
    path = Path(source).resolve()
    stat = path.stat()
    signature = (_VERSION, str(path), stat.st_size, stat.st_mtime_ns,
                 [(s["start"], s["end"]) for s in segments])
    return hashlib.sha256(json.dumps(signature).encode()).hexdigest()[:20]


class SceneCache:
    def __init__(self, output_dir, clip_index, key):
        self.directory = Path(output_dir)
        self.clip_index = clip_index
        self.key = key
        self.record = self.directory / f"temp_reframe_cache_{clip_index}.json"

    @property
    def preview(self):
        return self.directory / f"temp_preview_{self.clip_index}_{self.key}.mp4"

    def thumbnail(self, index):
        return self.directory / f"temp_scene_{self.clip_index}_{self.key}_{index:03d}.jpg"

    def _read(self):
        try:
            data = json.loads(self.record.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else None
        except (OSError, ValueError):
            return None

    def load(self):
        data = self._read()
        if not data or data.get("key") != self.key:
            return None
        scenes = data.get("scenes")
        if not isinstance(scenes, list) or not scenes or not data.get("width") or not data.get("height"):
            return None
        if not all(isinstance(scene, dict) and "has_thumbnail" in scene
                   and (not scene["has_thumbnail"] or self.thumbnail(i).is_file())
                   for i, scene in enumerate(scenes)):
            return None
        return data

    def save(self, width, height, scenes):
        previous = self._read()
        data = {"key": self.key, "width": width, "height": height, "scenes": scenes}
        write_json_atomic(self.record, data)
        old_key = previous.get("key") if previous else None
        if isinstance(old_key, str) and old_key != self.key and _KEY.fullmatch(old_key):
            old = SceneCache(self.directory, self.clip_index, old_key)
            for path in [old.preview, *(old.thumbnail(i)
                         for i, _ in enumerate(previous.get("scenes") or []))]:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
        return data
