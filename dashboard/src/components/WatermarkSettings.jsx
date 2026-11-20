import { useEffect, useState } from 'react';
import { apiJson } from '../lib/api';

export default function WatermarkSettings() {
    const [settings, setSettings] = useState(null);
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        apiJson('/api/settings/watermark', { signal: controller.signal })
            .then((data) => {
                setSettings(data);
                setName(data.name);
            })
            .catch(() => {});
        return () => controller.abort();
    }, []);

    if (!settings) return null;

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            const data = await apiJson('/api/settings/watermark', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            setSettings(data);
            setName(data.name);
            setMessage('Watermark name saved.');
        } catch (error) {
            setMessage(error.detail || 'Could not save the watermark name.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="card mb-6 space-y-3 p-5 sm:p-6" onSubmit={save}>
            <h2 className="text-base font-medium text-ink">Watermark</h2>
            <label htmlFor="watermark-name" className="eyebrow block">Watermark name</label>
            <div className="flex flex-col gap-2 sm:flex-row">
                <input id="watermark-name" type="text" className="input-field min-w-0 flex-1"
                    value={name} onChange={(e) => { setName(e.target.value); setMessage(''); }}
                    maxLength={settings.max_length} disabled={saving} required />
                <button className="btn-primary px-4 py-2 text-sm" type="submit"
                    disabled={saving || !name.trim() || name.trim() === settings.name}>
                    {saving ? 'Saving…' : 'Save watermark'}
                </button>
            </div>
            <p className="text-xs text-muted">Used on new clips and the next render of an edited clip.</p>
            {message && <p role="status" className="text-xs text-ink">{message}</p>}
        </form>
    );
}
