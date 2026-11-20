"""Plain-text companion for the MP4s in a download bundle."""


def clip_copy_text(files):
    lines = ["Judul dan caption klip", ""]
    for name, clip in files:
        youtube = clip.get("video_title_for_youtube_short") or ""
        tiktok = clip.get("video_description_for_tiktok") or ""
        instagram = clip.get("video_description_for_instagram") or ""
        lines.extend([name, "Judul YouTube", youtube,
                      "Caption TikTok", tiktok or instagram,
                      "Caption Instagram", instagram or tiktok, ""])
    return "\n".join(lines) + "\n"
