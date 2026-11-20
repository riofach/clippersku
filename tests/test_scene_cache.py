from scene_cache import SceneCache, key_for, saved_intervals, source_time_at


def test_cut_timestamps_stay_on_the_correct_source_segments():
    segments = [{"start": 100, "end": 105}, {"start": 20, "end": 24}]
    assert source_time_at(segments, 2) == 102
    assert source_time_at(segments, 5) == 20
    assert source_time_at(segments, 8.5) == 23.5
    assert saved_intervals([{"start": 0, "end": 5}, {"start": 5, "end": 8.97}], 9) == [
        (0, 5), (5, 9)]
    assert not saved_intervals([{"start": 0, "end": 3}, {"start": 5, "end": 9}], 9)
    assert not saved_intervals([{"start": 0, "end": 8}], 9)


def test_scene_cache_invalidates_when_source_or_cut_changes(tmp_path):
    source = tmp_path / "source.mp4"
    source.write_bytes(b"source")
    segments = [{"start": 0, "end": 3}]
    key = key_for(source, segments)
    cache = SceneCache(tmp_path, 0, key)
    cache.thumbnail(0).write_bytes(b"jpeg")
    cache.preview.write_bytes(b"mp4")
    cache.save(1920, 1080, [{"index": 0, "start": 0, "end": 3, "has_thumbnail": True}])
    assert cache.load()["width"] == 1920
    assert key_for(source, [{"start": 1, "end": 4}]) != key
    source.write_bytes(b"replacement source")
    new_cache = SceneCache(tmp_path, 0, key_for(source, segments))
    assert new_cache.load() is None
    new_cache.save(1920, 1080, [{"index": 0, "start": 0, "end": 3, "has_thumbnail": False}])
    assert not cache.preview.exists()
    assert not cache.thumbnail(0).exists()
