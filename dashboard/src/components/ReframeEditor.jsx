import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, Crosshair, RotateCcw, AlertCircle, Play, Pause, Columns2 } from 'lucide-react';
import { getApiUrl } from '../config';
import { apiJson } from '../lib/api';

// Manual reframing: the automatic crop is right most of the time and grossly
// wrong occasionally, and until now there was no way to say "frame it here".
//
// The unit is the scene, because a podcast cuts between a fixed close camera
// and a fixed wide one and the right crop differs per camera. Scenes the user
// does not touch stay automatic, so fixing one bad shot cannot spoil the good
// ones — only adjusted scenes are sent.
//
// Two things a still frame cannot tell you, and both are handled here:
//   - WHO is talking. Each scene plays its own range of an uncropped preview,
//     with sound, and the rectangle stays overlaid while it plays.
//   - Whether one window is even enough. A scene can be split into two stacked
//     regions, positioned independently.

const fmt = (s) => {
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${String(r).padStart(2, '0')}`;
};

export default function ReframeEditor({ jobId, clipIndex, clipTitle, onClose, onReframed }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [overrides, setOverrides] = useState({});
    const [playing, setPlaying] = useState(null);     // scene index being played
    const [saving, setSaving] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await apiJson(`/api/clip/${jobId}/${clipIndex}/scenes`);
                if (!alive) return;
                setData(res);
                setPreviewUrl(res.preview_url);
                // Start from what is already applied. A re-render rebuilds
                // from source with only what it receives, so opening blank
                // would quietly discard every earlier adjustment on the next
                // save.
                const salvos = res.saved_overrides || {};
                setOverrides(Object.fromEntries(
                    Object.entries(salvos).map(([k, v]) => [Number(k), v])
                ));
            } catch (e) {
                if (alive) setError(e?.message || 'Could not read the scenes of this clip.');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [jobId, clipIndex]);

    const half = (data?.crop_width_fraction ?? 0.5) / 2;
    const clamp = useCallback((v) => Math.min(1 - half, Math.max(half, v)), [half]);

    const setSingle = useCallback((idx, fraction) => {
        setOverrides((o) => ({ ...o, [idx]: clamp(fraction) }));
    }, [clamp]);

    const resetScene = useCallback((idx) => {
        setOverrides((o) => {
            const next = { ...o };
            delete next[idx];
            return next;
        });
    }, []);

    const adjusted = Object.keys(overrides).length;
    const preset = data?.layout_preset;
    const dirty = !!data && JSON.stringify(overrides) !== JSON.stringify(data.saved_overrides || {});
    const setLayout = (index, layout, boxes, gameplayPercent) => setOverrides((current) => ({
        ...current, [index]: { layout, boxes, ...(gameplayPercent == null ? {} : { gameplay_percent: gameplayPercent }) },
    }));

    const togglePlayback = async (idx) => {
        if (playing === idx) {
            setPlaying(null);
            return;
        }
        setPlaying(idx);
        if (previewUrl || previewLoading || !data?.preview_request_url) return;
        setPreviewLoading(true);
        setError(null);
        try {
            const res = await apiJson(data.preview_request_url);
            setPreviewUrl(res.preview_url);
        } catch (e) {
            setPlaying(null);
            setError(e?.message || 'Could not load the scene preview.');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSave = async () => {
        if (!dirty || saving) return;
        setSaving(true);
        setError(null);
        try {
            const res = await apiJson('/api/clip/reframe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_id: jobId, clip_index: clipIndex, crop_overrides: overrides,
                    reset_automatic: !adjusted,
                    scene_key: data.scene_key,
                }),
            });
            if (onReframed) onReframed(clipIndex, res);
            onClose();
        } catch (e) {
            setError(e?.detail || e?.message || 'The re-render failed.');
        } finally {
            setSaving(false);
        }
    };

    return (
        /* Bottom sheet on a phone, centred dialog from sm — same shape as the
           shared Modal so the app has one overlay idiom, not two. */
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="card w-full max-w-3xl max-h-[92vh] sm:max-h-[90vh] flex flex-col rounded-b-none sm:rounded-card animate-sheet-up sm:animate-none">
                <div className="flex items-center justify-between p-4 border-b border-rule">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Crosshair size={18} className="text-brass shrink-0" />
                        <div className="min-w-0">
                            <h2 className="text-base font-medium text-ink lowercase truncate">reframing</h2>
                            {clipTitle && <p className="text-xs text-muted truncate">{clipTitle}</p>}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-paper3 rounded-input transition-colors">
                        <X size={18} className="text-muted" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-4 space-y-5">
                    <p className="text-xs text-muted leading-relaxed">
                        {preset
                            ? 'Select one panel to move or resize its crop. Check the layout preview before applying your changes.'
                            : 'Play a scene to hear who is talking, then drag the rectangle over the person you want. Untouched scenes keep the automatic crop.'}
                    </p>

                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-muted py-8 justify-center">
                            <Loader2 size={18} className="animate-spin text-brass" />
                            reading the scenes…
                        </div>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 text-xs text-warn border border-warn/40 rounded-input p-3">
                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    {data?.scenes?.map((scene) => {
                        const override = overrides[scene.index];
                        const touched = scene.index in overrides;
                        const resetting = !touched && scene.index in (data.saved_overrides || {});
                        const presetApplied = !resetting && scene.preset_applied;
                        const automaticMode = !presetApplied && !resetting && scene.rendered_split_boxes ? 'split'
                            : preset === 'panel' && !presetApplied ? null : preset;
                        const mode = touched ? override?.layout || (scene.legacy_split_boxes ? 'split' : null)
                            : automaticMode;
                        const onGrid = data.grid_defaults && mode !== 'panel'
                            ? () => setLayout(scene.index, 'panel', data.grid_defaults) : null;
                        const playback = {
                            previewUrl,
                            playing: playing === scene.index && !!previewUrl,
                            loadingPreview: playing === scene.index && previewLoading,
                            onPlayToggle: () => togglePlayback(scene.index),
                        };
                        const onReset = () => resetScene(scene.index);
                        return mode ? (
                        <PresetScene
                            key={`${scene.index}-${mode}`}
                            scene={scene}
                            preset={mode}
                            sourceAspect={data.source_width / data.source_height}
                            outputWidth={data.output_width}
                            outputHeight={data.output_height}
                            gridDefaults={data.grid_defaults}
                            gameplayPercent={override?.gameplay_percent ?? 60}
                            boxes={override?.boxes ?? (mode === 'split'
                                ? scene.rendered_split_boxes ?? scene.legacy_split_boxes ?? scene.split_defaults
                                : resetting ? data.preset_defaults : scene.preset_boxes)}
                            touched={touched}
                            onChange={(boxes, percent) => setLayout(scene.index, mode, boxes, percent)}
                            onGrid={onGrid}
                            onSingle={() => setSingle(scene.index, scene.suggested_center)}
                            onReset={onReset}
                            {...playback}
                        />
                    ) : (
                        <SceneRow
                            key={scene.index}
                            scene={scene}
                            value={clamp(typeof override === 'number' ? override : scene.suggested_center)}
                            widthFraction={data.crop_width_fraction}
                            touched={touched}
                            gridFallback={preset === 'panel' && !touched}
                            onMoveSingle={(f) => setSingle(scene.index, f)}
                            onSplit={() => setLayout(scene.index, 'split', scene.split_defaults)}
                            onGrid={onGrid}
                            onReset={onReset}
                            {...playback}
                        />
                        );
                    })}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-rule">
                    <span className="text-xs text-muted">
                        {adjusted === 0
                            ? (dirty ? 'automatic framing will be restored' : 'no manual adjustments')
                            : `${adjusted} scene${adjusted > 1 ? 's' : ''} reframed by hand`}
                    </span>
                    <div className="flex items-center gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
                        <button onClick={onClose} className="btn-quiet py-2 px-4 text-sm">cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={!dirty || saving}
                            className="btn-primary py-2 px-4 text-sm disabled:opacity-40"
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                            {saving ? 're-rendering…' : 'apply reframing'}
                        </button>
                    </div>
                </div>
                <div className="sm:hidden safe-bottom" />
            </div>
        </div>
    );
}

const clampTo = (value, max) => Math.max(0, Math.min(max, value));

function panelSizes(preset, count, width, height, gameplayPercent) {
    if (preset === 'gaming') {
        const top = 2 * Math.round(height * gameplayPercent / 200);
        return [[width, top], [width, height - top]];
    }
    const halfHeight = 2 * Math.floor(height / 4);
    if (preset === 'split') return [[width, halfHeight], [width, halfHeight]];
    const tile = [2 * Math.floor(width / 4), halfHeight];
    return count === 3 ? [tile, tile, [width, height - halfHeight]] : [tile, tile, tile, tile];
}

function resizeBoxForPanel(box, [width, height], sourceAspect) {
    const [x, y, oldW, oldH] = box;
    const ratio = width / height / sourceAspect;
    const h = Math.min(1, 1 / ratio, Math.max(oldH, .02, .02 / ratio));
    const w = h * ratio;
    return [clampTo(x + (oldW - w) / 2, 1 - w), clampTo(y + (oldH - h) / 2, 1 - h), w, h];
}

function PresetScene({ scene, preset, sourceAspect, outputWidth, outputHeight, gridDefaults,
    boxes, gameplayPercent, touched, onChange, onReset, onGrid, onSingle,
    previewUrl, playing, loadingPreview, onPlayToggle }) {
    const mediaRef = useRef(null);
    const dragRef = useRef(null);
    const fourthBox = useRef(gridDefaults?.[3]);
    const [selected, setSelected] = useState(0);
    const videoRef = useScenePlayback(scene, playing);
    const gaming = preset === 'gaming';
    const grid = preset === 'panel';
    const labels = gaming ? ['Gameplay', 'Facecam'] : !grid ? ['Top', 'Bottom']
        : boxes.length === 3 ? ['Top left', 'Top right', 'Bottom']
        : ['Top left', 'Top right', 'Bottom left', 'Bottom right'];
    const sizes = panelSizes(preset, boxes.length, outputWidth, outputHeight, gameplayPercent);
    const active = boxes[selected];
    const thumbnail = scene.thumbnail_url ? getApiUrl(scene.thumbnail_url) : null;

    const update = (index, box) => onChange(boxes.map((current, i) => i === index ? box : current),
        gaming ? gameplayPercent : undefined);
    const resizeGameplay = (percent) => {
        const nextSizes = panelSizes(preset, 2, outputWidth, outputHeight, percent);
        onChange(boxes.map((box, i) => resizeBoxForPanel(box, nextSizes[i], sourceAspect)), percent);
    };
    const setPanelCount = (count) => {
        if (count === boxes.length) return;
        if (count === 3) fourthBox.current = boxes[3];
        const next = boxes.slice(0, 3);
        const nextSizes = panelSizes(preset, count, outputWidth, outputHeight, gameplayPercent);
        next[2] = resizeBoxForPanel(next[2], nextSizes[2], sourceAspect);
        if (count === 4) next.push(fourthBox.current);
        setSelected((i) => Math.min(i, count - 1));
        onChange(next);
    };
    const move = (index, box, dx, dy) => {
        const [x, y, w, h] = box;
        update(index, [clampTo(x + dx, 1 - w), clampTo(y + dy, 1 - h), w, h]);
    };
    const resize = (w) => {
        const [x, y, oldW, oldH] = active;
        const h = w * oldH / oldW;
        update(selected, [clampTo(x + (oldW - w) / 2, 1 - w),
            clampTo(y + (oldH - h) / 2, 1 - h), w, h]);
    };

    const startDrag = (e, index) => {
        const rect = mediaRef.current.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { index, box: boxes[index], x: e.clientX, y: e.clientY, rect };
    };
    const drag = (e) => {
        const current = dragRef.current;
        if (!current) return;
        move(current.index, current.box,
            (e.clientX - current.x) / current.rect.width,
            (e.clientY - current.y) / current.rect.height);
    };

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 text-xs">
                <ScenePlaybackButton {...{ scene, playing, loadingPreview, onPlayToggle }} />
                <div className="flex flex-wrap justify-end gap-1">
                    {onGrid && <button type="button" onClick={onGrid} className="btn-quiet px-2 py-1">
                        2×2 grid
                    </button>}
                    <button type="button" onClick={onSingle} className="btn-quiet px-2 py-1">
                        Use single crop
                    </button>
                    {touched && <button type="button" onClick={onReset} className="btn-quiet px-2 py-1">
                        Reset to auto
                    </button>}
                </div>
            </div>
            {grid && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Panel count">
                {[3, 4].map((count) => <button key={count} type="button" aria-pressed={boxes.length === count}
                    onClick={() => setPanelCount(count)}
                    className={`${boxes.length === count ? 'btn-primary' : 'btn-quiet'} px-2 py-1 text-xs`}>
                    {count} panels
                </button>)}
            </div>}
            <div className="flex flex-wrap gap-1.5">
                {labels.map((label, i) => (
                    <button key={label} type="button" aria-pressed={selected === i}
                        onClick={() => setSelected(i)}
                        className={`${selected === i ? 'btn-primary' : 'btn-quiet'} px-2 py-1 text-xs`}>
                        {i + 1}. {label}
                    </button>
                ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,26%)]">
                <div className="min-w-0 space-y-2">
                    <div ref={mediaRef} className="relative overflow-hidden select-none rounded-input bg-paper3 ring-1 ring-rule"
                        style={{ aspectRatio: sourceAspect }}>
                        {playing ? <video ref={videoRef} src={getApiUrl(previewUrl)} playsInline
                            className="absolute inset-0 h-full w-full" />
                            : thumbnail && <img src={thumbnail} alt="Uncropped source frame" loading="lazy"
                                draggable={false} className="absolute inset-0 h-full w-full" />}
                        {active && <button key={selected} type="button" aria-label={`Move ${labels[selected]} crop`}
                            className="absolute border-2 border-brass touch-none cursor-move"
                            style={{ left: `${active[0] * 100}%`, top: `${active[1] * 100}%`,
                                width: `${active[2] * 100}%`, height: `${active[3] * 100}%` }}
                            onPointerDown={(e) => startDrag(e, selected)} onPointerMove={drag}
                            onLostPointerCapture={() => { dragRef.current = null; }}
                            onKeyDown={(e) => {
                                const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0],
                                    ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
                                if (!delta) return;
                                e.preventDefault();
                                const step = e.shiftKey ? .05 : .01;
                                move(selected, active, delta[0] * step, delta[1] * step);
                            }}>
                            <span aria-hidden="true" className="absolute left-0 top-0 bg-paper text-ink px-1 text-xs">
                                {selected + 1}
                            </span>
                        </button>}
                    </div>
                    {active && <label className="flex items-center gap-2 text-xs text-muted">
                        {labels[selected]} crop size
                        <input type="range" className="min-w-0 flex-1" step="any"
                            min={Math.max(.02, .02 * active[2] / active[3])}
                            max={Math.min(1, active[2] / active[3])}
                            value={active[2]} onChange={(e) => resize(Number(e.target.value))} />
                    </label>}
                    {gaming && <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>Gameplay height {gameplayPercent}% · Facecam {100 - gameplayPercent}%</span>
                        <input type="range" aria-label="Gameplay height" className="min-w-24 flex-1"
                            min={40} max={80} value={gameplayPercent}
                            onChange={(e) => resizeGameplay(Number(e.target.value))} />
                    </label>}
                    {grid && selected === 3 && (
                        <button type="button" className="btn-quiet px-2 py-1 text-xs"
                            onClick={() => update(3, active ? null : gridDefaults[3])}>
                            {active ? 'Use wide shot' : 'Crop fourth panel'}
                        </button>
                    )}
                </div>
                {thumbnail && <PresetPreview thumbnail={thumbnail} grid={grid} boxes={boxes}
                    sizes={sizes} outputWidth={outputWidth} outputHeight={outputHeight}
                    selected={selected} sourceAspect={sourceAspect} />}
            </div>
            {gaming && !touched && !scene.preset_applied && <p className="text-xs text-muted">
                This scene used a fallback layout. Adjust any box to apply the preset here.
            </p>}
        </div>
    );
}

function PresetPreview({ thumbnail, grid, boxes, sizes, selected, sourceAspect, outputWidth, outputHeight }) {
    const bottom = sizes[grid ? 2 : 1][1];
    return (
        <figure className="mx-auto w-full max-w-[11rem] sm:max-w-none">
            <figcaption className="mb-1 text-xs text-muted">Layout preview · still frame</figcaption>
            <div className={`grid overflow-hidden rounded-input bg-black ring-1 ring-rule ${grid ? 'grid-cols-2' : ''}`}
                style={{ aspectRatio: outputWidth / outputHeight,
                    gridTemplateRows: `${100 * sizes[0][1] / outputHeight}% ${100 * bottom / outputHeight}%` }}>
                {boxes.map((box, i) => {
                    let style;
                    if (box) {
                        const [x, y, width, height] = box;
                        const tileAspect = sizes[i][0] / sizes[i][1];
                        // Match the renderer's centred cover crop inside the selected box.
                        const w = Math.min(width, height * tileAspect / sourceAspect);
                        const h = w * sourceAspect / tileAspect;
                        style = {
                            width: `${100 / w}%`, height: `${100 / h}%`,
                            left: `${-100 * (x + (width - w) / 2) / w}%`,
                            top: `${-100 * (y + (height - h) / 2) / h}%`,
                        };
                    }
                    return <div key={i} className={`relative overflow-hidden ${grid && boxes.length === 3 && i === 2 ? 'col-span-2' : ''}`}>
                        <img src={thumbnail} alt="" loading="lazy" draggable={false}
                            className={`absolute max-w-none ${box ? '' : 'inset-0 h-full w-full object-contain'}`}
                            style={style} />
                        {selected === i && <div className="pointer-events-none absolute inset-0 border border-brass" />}
                    </div>;
                })}
            </div>
        </figure>
    );
}


function useScenePlayback(scene, playing) {
    const videoRef = useRef(null);
    // Play only this scene's slice of the shared preview.
    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (!playing) { v.pause(); return; }
        v.currentTime = scene.start;
        v.play().catch(() => {});
        const stopAtEnd = () => { if (v.currentTime >= scene.end) { v.pause(); } };
        v.addEventListener('timeupdate', stopAtEnd);
        return () => v.removeEventListener('timeupdate', stopAtEnd);
    }, [playing, scene.start, scene.end]);
    return videoRef;
}

function ScenePlaybackButton({ scene, playing, loadingPreview, onPlayToggle }) {
    const label = loadingPreview ? 'preparing preview' : playing ? 'pause scene' : 'play this scene with sound';
    return (
        <div className="flex items-center gap-2 min-w-0">
            <button type="button" onClick={onPlayToggle} aria-label={label} title={label}
                className="flex items-center text-ink2 hover:text-brass transition-colors">
                {loadingPreview ? <Loader2 size={13} className="animate-spin" />
                    : playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <span className="readout text-muted truncate">
                scene {scene.index + 1} · {fmt(scene.start)}–{fmt(scene.end)}
            </span>
        </div>
    );
}

function SceneRow({ scene, value, widthFraction, previewUrl, touched, gridFallback, playing, loadingPreview,
                    onPlayToggle, onMoveSingle, onSplit, onGrid, onReset }) {
    const boxRef = useRef(null);
    const videoRef = useScenePlayback(scene, playing);

    const fractionFromEvent = useCallback((clientX) => {
        const el = boxRef.current;
        if (!el) return 0.5;
        const rect = el.getBoundingClientRect();
        return (clientX - rect.left) / rect.width;
    }, []);

    const left = Math.max(0, (value - widthFraction / 2) * 100);
    const right = Math.max(0, 100 - (value + widthFraction / 2) * 100);

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs gap-2">
                <ScenePlaybackButton {...{ scene, playing, loadingPreview, onPlayToggle }} />
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        type="button" onClick={onSplit}
                        className="flex items-center gap-1 text-muted hover:text-ink2 transition-colors"
                        title="stack two regions instead of one window"
                    >
                        <Columns2 size={12} /> split
                    </button>
                    {onGrid && <button type="button" onClick={onGrid}
                        className="flex items-center gap-1 text-muted hover:text-ink2"
                        title="Use three or four panels">
                        2×2 grid
                    </button>}
                    {touched ? (
                        <button onClick={onReset} className="flex items-center gap-1 text-brass hover:underline">
                            <RotateCcw size={12} /> automatic
                        </button>
                    ) : (
                        <span className="text-muted">automatic</span>
                    )}
                </div>
            </div>

            {gridFallback && <p className="text-xs text-muted">
                This scene uses automatic framing. Choose 2×2 grid to place three or four panels.
            </p>}

            <div
                ref={boxRef}
                className={`relative overflow-hidden rounded-input select-none border ${
                    touched ? 'border-brass' : 'border-rule'}`}
            >
                {playing && previewUrl ? (
                    <video
                        ref={videoRef}
                        src={getApiUrl(previewUrl)}
                        playsInline
                        className="w-full block"
                    />
                ) : scene.thumbnail_url ? (
                    <img
                        src={getApiUrl(scene.thumbnail_url)}
                        alt=""
                        draggable={false}
                        className="w-full block pointer-events-none"
                    />
                ) : (
                    <div className="w-full aspect-video bg-paper3" />
                )}

                <div className="absolute inset-y-0 left-0 bg-black/65 pointer-events-none" style={{ width: `${left}%` }} />
                <div className="absolute inset-y-0 right-0 bg-black/65 pointer-events-none" style={{ width: `${right}%` }} />
                <button type="button" aria-label="Move single crop"
                    className="absolute inset-y-0 border-2 border-brass touch-pan-y cursor-ew-resize"
                    style={{ left: `${left}%`, width: `${widthFraction * 100}%` }}
                    onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        onMoveSingle(fractionFromEvent(e.clientX));
                    }}
                    onPointerMove={(e) => {
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) onMoveSingle(fractionFromEvent(e.clientX));
                    }}
                    onKeyDown={(e) => {
                        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                        e.preventDefault();
                        onMoveSingle(value + (e.key === 'ArrowLeft' ? -.01 : .01));
                    }} />
            </div>
        </div>
    );
}
