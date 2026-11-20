"""Bounded, job-local cache for repeated reframes of one cut."""
import hashlib
import json
import os
import re
import shutil
import uuid
from contextlib import suppress
from pathlib import Path

from jsonfile import write_json_atomic


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


class ReframeRenderCache:
    def __init__(self, job_dir, clip_index, scope):
        self.root = Path(job_dir) / f".reframe_render_{clip_index}"
        self.key = digest((1, scope))
        self.cut = self.root / "cut.mp4"
        self.reused = 0
        self.encoded = 0

    def prepare(self):
        """Invalidate the previous timeline; keep at most one file per scene."""
        try:
            self.root.mkdir(exist_ok=True)
            marker = self.root / "timeline.json"
            try:
                current = json.loads(marker.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                current = None
            if current != self.key:
                for path in self.root.iterdir():
                    if path == self.cut or re.fullmatch(r"scene_\d+\.(?:mp4|json)", path.name):
                        path.unlink(missing_ok=True)
                write_json_atomic(marker, self.key)
            return True
        except OSError:
            return False

    def segment(self, index, signature):
        marker = self.root / f"scene_{index}.json"
        video = self.root / f"scene_{index}.mp4"
        try:
            if json.loads(marker.read_text(encoding="utf-8")) == signature and video.stat().st_size:
                self.reused += 1
                return str(video)
        except (OSError, ValueError):
            pass
        return None

    def save_segment(self, index, signature, source):
        self.encoded += 1
        path = self.root / f"scene_{index}.mp4"
        marker = self.root / f"scene_{index}.json"
        temp = self.root / f".part_{uuid.uuid4().hex}.mp4"
        try:
            shutil.copyfile(source, temp)
            # Never leave an old signature paired with a newly saved video.
            marker.unlink(missing_ok=True)
            os.replace(temp, path)
            write_json_atomic(marker, signature)
        except OSError:
            pass
        finally:
            with suppress(OSError):
                temp.unlink(missing_ok=True)
