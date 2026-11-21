import { useState } from 'react';
import { Check, Eye, EyeOff, Key, Plus } from 'lucide-react';

const EMPTY_DRAFT = { id: null, label: '', value: '' };

export default function KeyInput({ profiles, onChange }) {
    const { keys, activeId } = profiles;
    const [form, setForm] = useState(null);
    const [visible, setVisible] = useState(false);
    const [error, setError] = useState('');
    const draft = form ?? EMPTY_DRAFT;
    const showForm = form !== null || keys.length === 0;

    const open = (entry = EMPTY_DRAFT) => {
        setForm(entry);
        setVisible(false);
        setError('');
    };

    const change = (next) => {
        try {
            onChange(next);
            setError('');
            return true;
        } catch {
            setError('Could not save your Gemini keys in this browser.');
            return false;
        }
    };

    const save = (event) => {
        event.preventDefault();
        const value = draft.value.trim();
        if (!value || /\s/.test(value)) {
            setError('Paste one API key at a time.');
            return;
        }
        if (keys.some((entry) => entry.id !== draft.id && entry.value === value)) {
            setError('This API key is already in the list.');
            return;
        }
        if (draft.id && !keys.some((entry) => entry.id === draft.id)) {
            setError('This key was removed in another tab.');
            return;
        }

        const id = draft.id ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
        let number = 1;
        while (keys.some((entry) => entry.label === `Key ${number}`)) number++;
        const entry = { id, label: draft.label.trim() || `Key ${number}`, value };
        const next = draft.id ? keys.map((key) => key.id === id ? entry : key) : [...keys, entry];
        if (change({ keys: next, activeId: activeId ?? id })) {
            setForm(null);
            setVisible(false);
        }
    };

    const remove = (id) => {
        const next = keys.filter((entry) => entry.id !== id);
        if (change({ keys: next, activeId: activeId === id ? next[0]?.id ?? null : activeId }) && draft.id === id) {
            setForm(null);
            setVisible(false);
        }
    };

    return (
        <div className="card p-4 sm:p-6 mb-8 animate-fade">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-paper3 rounded-input text-brass"><Key size={18} /></div>
                    <h2 className="font-display lowercase text-lg text-ink">Gemini API Keys</h2>
                </div>
                {keys.length > 0 && (
                    <button type="button" className="btn-quiet" onClick={() => open()}>
                        <Plus size={14} /> Add key
                    </button>
                )}
            </div>

            {keys.length > 0 && <ul className="space-y-2">
                {keys.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-input border border-rule p-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm text-ink">{entry.label}</span>
                            {entry.id === activeId && <span className="badge-ok shrink-0"><Check size={12} /> Active</span>}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                            {entry.id !== activeId && (
                                <button type="button" className="btn-quiet" aria-label={`Use key ${entry.label}`}
                                    onClick={() => change({ keys, activeId: entry.id })}>Use key</button>
                            )}
                            <button type="button" className="btn-quiet" aria-label={`Edit key ${entry.label}`}
                                onClick={() => open(entry)}>Edit</button>
                            <button type="button" className="btn-quiet text-warn" aria-label={`Remove key ${entry.label}`}
                                onClick={() => remove(entry.id)}>Remove</button>
                        </div>
                    </li>
                ))}
            </ul>}

            {showForm && <form onSubmit={save} className={`${keys.length ? 'mt-4 border-t border-rule pt-4' : ''} space-y-3`} autoComplete="off">
                <label className="block space-y-1.5 text-xs text-muted">
                    <span>Key label</span>
                    <input type="text" className="input-field" value={draft.label} maxLength={48}
                        placeholder="e.g. HihuClip" onChange={(e) => setForm({ ...draft, label: e.target.value })} />
                </label>
                <div>
                    <label htmlFor="gemini-secret" className="mb-1.5 block text-xs text-muted">API key</label>
                    <div className="relative">
                        <input id="gemini-secret" type={visible ? 'text' : 'password'} value={draft.value}
                            autoComplete="off" spellCheck={false} placeholder="AIzaSy…" className="input-field pr-12 font-mono"
                            onChange={(e) => setForm({ ...draft, value: e.target.value })} />
                        <button type="button" aria-label={visible ? 'Hide API key' : 'Show API key'}
                            onClick={() => setVisible(!visible)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
                            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="submit" className="btn-primary" disabled={!draft.value.trim()}>Save key</button>
                    {keys.length > 0 && <button type="button" className="btn-quiet" onClick={() => {
                        setForm(null); setVisible(false); setError('');
                    }}>Cancel</button>}
                </div>
            </form>}

            {error && <p role="alert" className="mt-3 text-xs text-warn">{error}</p>}
            <p className="mt-3 text-xs text-muted">
                Keys are stored in this browser. New requests use the active key.
            </p>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                className="mt-1 inline-block text-xs text-brass hover:underline">Get a Gemini API key →</a>
        </div>
    );
}
