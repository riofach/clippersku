import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import type { ShortVideoProps } from "../lib/types";
import { Subtitles } from "./Subtitles";
import { HookOverlay } from "./HookOverlay";
import { VideoEffects } from "./VideoEffects";

function IntroBlur({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  // Match the timing of the background layer in hooks.py.
  const radius = interpolate(frame / fps, [2, 2.5], [width * 0.018, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ filter: radius ? `blur(${radius}px)` : undefined }}>{children}</AbsoluteFill>;
}

/**
 * Main composition that layers all post-processing on top of the base video.
 * Uses @remotion/media Video for browser-side rendering compatibility.
 */
export const ShortVideo: React.FC<Record<string, unknown>> = (rawProps) => {
  const { videoUrl, subtitles, hook, effects } =
    rawProps as unknown as ShortVideoProps;
  const video = <Video src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Layer 1: Base video with optional zoom/color effects */}
      <VideoEffects config={effects}>
        {hook?.introBlur ? <IntroBlur>{video}</IntroBlur> : video}
      </VideoEffects>

      {/* Layer 2: Animated subtitles */}
      {subtitles && <Subtitles config={subtitles} />}

      {/* Layer 3: Hook text overlay */}
      {hook && <HookOverlay config={hook} />}
    </AbsoluteFill>
  );
};
