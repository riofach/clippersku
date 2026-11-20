import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import RemotionPreview from './RemotionPreview';
import Modal from './ui/Modal';
import SegmentedControl from './ui/SegmentedControl';
import { getApiUrl } from '../config';
import { apiJson } from '../lib/api';
import { hookFontFaces, HOOK_FONTS } from '../remotion/lib/fonts';

const ENTRANCE_OPTIONS = [
    { value: 'spring', label: 'Bounce' },
    { value: 'fade', label: 'Fade' },
    { value: 'slide-up', label: 'Slide Up' },
    { value: 'none', label: 'None' },
];

// Must mirror hooks.py HOOK_STYLES.
const HOOK_STYLES = [
    { value: 'pill', label: 'Pills', box: 'rgba(255,255,255,0.98)', text: '#000', sans: true },
    { value: 'classic', label: 'Classic', box: 'rgba(255,255,255,0.94)', text: '#000' },
    { value: 'dark', label: 'Dark', box: 'rgba(18,18,20,0.92)', text: '#fff' },
    { value: 'yellow', label: 'Yellow', box: 'rgba(255,214,0,0.96)', text: '#000' },
    { value: 'red', label: 'Red', box: 'rgba(220,38,38,0.96)', text: '#fff' },
    { value: 'outline', label: 'Outline', box: 'transparent', text: '#fff', outline: true },
    { value: 'outline_yellow', label: 'Outline+', box: 'transparent', text: '#FFD600', outline: true },
];

// Must mirror hooks.py HOOK_FONTS (all bundled: /fonts/*.ttf).
const FONT_OPTIONS = [
    { value: 'montserrat', label: 'Montserrat' },
    { value: 'archivo', label: 'Archivo Black' },
    { value: 'barlow', label: 'Barlow Condensed' },
    { value: 'anton', label: 'Anton' },
    { value: 'serif', label: 'Serif' },
];
const fontStyle = (id) => {
    const typeface = HOOK_FONTS[id] || HOOK_FONTS.serif;
    return { fontFamily: typeface.family, fontWeight: typeface.weight };
};
// The style's own typeface when none is picked (what hooks.py renders).
const styleFont = (st) => (st === 'pill' ? 'montserrat' : 'serif');

// auto: the server keeps the hook off the speaker's face and the captions
// (hook_placement.py). The preview cannot see faces and draws it at the top.
const POSITION_OPTIONS = [
    { value: 'auto', label: 'auto' },
    { value: 'top', label: 'top' },
    { value: 'center', label: 'center' },
    { value: 'bottom', label: 'bottom' },
];

const SIZE_OPTIONS = [
    { value: 'S', label: 'Small' },
    { value: 'M', label: 'Medium' },
    { value: 'L', label: 'Large' },
];

// Last-used hook settings, restored on the next open (style always reset to
// classic otherwise, which users read as the picker being broken).
function loadHookPrefs() {
    try { return JSON.parse(localStorage.getItem('os_hook_prefs')) || {}; } catch { return {}; }
}

export default function HookModal({ isOpen, onClose, onGenerate, onRemove, isProcessing, videoUrl, initialText,
    durationInSeconds, existingSubtitles, hasCaptions, serverRender, burnedHook, existingHook, jobId, clipIndex }) {
    const [prefs] = useState(loadHookPrefs);
    const saved = existingHook || burnedHook;
    const [text, setText] = useState(saved?.text ?? initialText ?? '');
    const [position, setPosition] = useState(saved?.position || prefs.pos || 'auto');
    const [size, setSize] = useState(saved?.size || prefs.size || 'M');
    const [style, setStyle] = useState(saved?.style || prefs.style || 'pill');
    // null = follow the style's own typeface.
    const [font, setFont] = useState(saved ? saved.font || null : prefs.font || null);
    const effectiveFont = font || styleFont(style);
    const [entranceAnimation, setEntranceAnimation] = useState(saved?.entranceAnimation || prefs.entranceAnimation || 'none');
    const [displayDuration, setDisplayDuration] = useState(saved?.displayDurationSec ?? saved?.duration_seconds ?? 5);
    const [introBlur, setIntroBlur] = useState(saved?.introBlur ?? saved?.intro_blur ?? prefs.introBlur ?? true);
    const [cleanPreview, setCleanPreview] = useState(null);
    const [previewError, setPreviewError] = useState('');
    const playerRef = useRef(null);

    useEffect(() => {
        if (!isOpen || !serverRender) return;
        const controller = new AbortController();
        apiJson(`/api/clip/${jobId}/${clipIndex}/hook-preview`, { signal: controller.signal })
            .then(({ video_url }) => setCleanPreview(getApiUrl(video_url)))
            .catch((error) => {
                if (!controller.signal.aborted) setPreviewError(error.detail || 'Could not load the clean preview.');
            });
        return () => controller.abort();
    }, [isOpen, serverRender, jobId, clipIndex]);

    if (!isOpen) return null;

    // Build hook config for Remotion preview
    const hookConfig = {
        text: text || 'Enter your text...',
        position,
        size,
        style,
        font: effectiveFont,
        entranceAnimation: serverRender ? 'none' : entranceAnimation,
        displayDurationSec: displayDuration,
        introBlur,
    };
    const previewSource = serverRender ? cleanPreview : videoUrl;

    const replayIntro = () => {
        playerRef.current?.seekTo(0);
        playerRef.current?.play();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="lg" eyebrow="EDITOR · HOOK" title="edit hook">
            <style>{hookFontFaces}</style>
            <div className="flex flex-col md:flex-row gap-6">
                {/* Left: Preview */}
                <div className="w-full max-w-[300px] mx-auto md:mx-0 md:w-[300px] shrink-0 self-start">
                    <div className="bg-black rounded-card border border-rule overflow-hidden aspect-[9/16]">
                        {previewSource ? (
                            <RemotionPreview
                                playerRef={playerRef}
                                videoUrl={previewSource}
                                durationInSeconds={durationInSeconds || 30}
                                hook={hookConfig}
                                subtitles={existingSubtitles || null}
                            />
                        ) : (
                            <div role="status" className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
                                {previewError || (serverRender ? 'Loading preview…' : 'Preview unavailable.')}
                            </div>
                        )}
                    </div>
                    {previewSource && <button type="button" className="btn-quiet mt-2" onClick={replayIntro}>
                        Replay intro
                    </button>}
                </div>

                {/* Right: Controls */}
                <div className="w-full md:w-80 flex flex-col">
                    <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar pr-1">
                        {/* Text Input */}
                        <div>
                            <p className="eyebrow mb-2">Text</p>
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                rows={4}
                                className="input-field resize-none"
                                placeholder="Enter text that will stop the scroll..."
                            />
                        </div>

                        {/* Style (new) */}
                        <div>
                            <p className="eyebrow mb-2">Style</p>
                            <div className="grid grid-cols-3 gap-1.5">
                                {HOOK_STYLES.map((s) => (
                                    <button
                                        key={s.value}
                                        onClick={() => setStyle(s.value)}
                                        className={`px-1 py-2 rounded-input border text-xs transition-colors
                                            ${style === s.value ? 'border-[color:var(--color-accent)]' : 'border-rule2 hover:border-[color:var(--color-accent)]'}`}
                                        title={s.label}
                                    >
                                        {s.value === 'pill' ? (
                                            <span className="flex flex-col items-center gap-0.5 py-0.5" style={fontStyle(font || styleFont(s.value))}>
                                                <span className="rounded-md px-1.5 text-[13px] leading-5 bg-white text-black">Aa Bb</span>
                                                <span className="rounded-md px-1.5 text-[13px] leading-5 bg-white text-black">Cc</span>
                                            </span>
                                        ) : (
                                            <span
                                                className="block rounded-md px-1 py-1.5 text-[15px] leading-5"
                                                style={{
                                                    ...fontStyle(font || styleFont(s.value)),
                                                    backgroundColor: s.box,
                                                    color: s.text,
                                                    textShadow: s.outline ? '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' : 'none',
                                                }}
                                            >Aa</span>
                                        )}
                                        <span className="block mt-1 text-muted">{s.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Typeface */}
                        <div>
                            <p className="eyebrow mb-2">Font</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {FONT_OPTIONS.map((f) => (
                                    <button
                                        key={f.value}
                                        type="button"
                                        aria-pressed={effectiveFont === f.value}
                                        onClick={() => setFont(f.value)}
                                        className={`px-1 py-2 rounded-input border text-[15px] text-ink transition-colors
                                            ${effectiveFont === f.value ? 'border-[color:var(--color-accent)]' : 'border-rule2 hover:border-[color:var(--color-accent)]'}`}
                                    >
                                        <span aria-hidden="true" className="block text-lg leading-6" style={fontStyle(f.value)}>Aa</span>
                                        <span className="block text-xs">{f.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label className="flex items-start justify-between gap-3">
                            <span>
                                <span className="eyebrow block">Gaussian blur intro</span>
                                <span className="mt-1 block text-xs text-muted">Blur for 2s, then fade to clear.</span>
                            </span>
                            <input type="checkbox" checked={introBlur} onChange={(e) => setIntroBlur(e.target.checked)}
                                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
                        </label>

                        {/* Position Control */}
                        <div>
                            <p className="eyebrow mb-2">Position</p>
                            <SegmentedControl
                                options={POSITION_OPTIONS}
                                value={position}
                                onChange={setPosition}
                                size="sm"
                            />
                            {position === 'auto' && (
                                <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
                                    Placed where it covers no face and no captions.
                                    The preview shows it at the top.
                                </p>
                            )}
                            {position === 'bottom' && hasCaptions && (
                                <p className="text-[11px] text-warn mt-1.5 leading-relaxed">
                                    This clip has captions near the bottom — the hook may
                                    overlap them (and TikTok's UI). Top is the safe zone.
                                </p>
                            )}
                        </div>

                        {/* Size Control */}
                        <div>
                            <p className="eyebrow mb-2">Size</p>
                            <SegmentedControl
                                options={SIZE_OPTIONS}
                                value={size}
                                onChange={setSize}
                                size="sm"
                            />
                        </div>

                        {/* Entrance Animation (new) */}
                        {!serverRender && (
                        <div>
                            <p className="eyebrow mb-2">Entrance</p>
                            <SegmentedControl
                                options={ENTRANCE_OPTIONS}
                                value={entranceAnimation}
                                onChange={setEntranceAnimation}
                                columns={2}
                                size="sm"
                            />
                        </div>
                        )}

                        {/* Display Duration (new) */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="eyebrow">Duration</p>
                                <span className="readout">{displayDuration}S</span>
                            </div>
                            <input
                                type="range"
                                min="2"
                                max="15"
                                value={displayDuration}
                                onChange={(e) => setDisplayDuration(parseInt(e.target.value))}
                                className="w-full accent-[var(--color-accent)]"
                            />
                            <div className="flex justify-between">
                                <span className="readout">2S</span>
                                <span className="readout">15S</span>
                            </div>
                        </div>

                        {burnedHook && (
                            <div className="p-3 border border-rule rounded-input text-xs text-muted space-y-2">
                                <p>
                                    This clip has a hook burned in ("{burnedHook.text}").
                                    Generating replaces it with the new one.
                                </p>
                                {onRemove && (
                                    <button
                                        onClick={onRemove}
                                        disabled={isProcessing}
                                        className="text-warn underline underline-offset-2 hover:opacity-80 transition-opacity"
                                    >
                                        remove hook from clip
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="p-3 border border-rule rounded-input text-xs text-muted">
                            Tip: keep it short and punchy. Using "POV:" or specific questions works best for retention.
                        </div>
                    </div>

                    <div className="flex gap-2 mt-5 shrink-0">
                        <button onClick={onClose} className="btn-ghost">
                            cancel
                        </button>
                        <button
                            onClick={() => {
                                try {
                                    localStorage.setItem('os_hook_prefs', JSON.stringify({
                                        style, font, pos: position, size, entranceAnimation, introBlur,
                                    }));
                                } catch { /* ignore */ }
                                onGenerate({
                                    text, position, size, style, font: effectiveFont,
                                    // Remotion data
                                    remotion: hookConfig,
                                });
                            }}
                            disabled={isProcessing || !text.trim()}
                            className="btn-primary flex-1"
                        >
                            {isProcessing && <Loader2 size={16} className="animate-spin text-brassink" />}
                            {isProcessing ? 'saving...' : (burnedHook ? 'update hook' : 'add hook')}
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
