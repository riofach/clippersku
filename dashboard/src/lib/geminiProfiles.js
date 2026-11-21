export const GEMINI_PROFILES_STORAGE = 'gemini_key_profiles_v1';
const LEGACY_STORAGE = 'gemini_key';

export function loadGeminiProfiles() {
    try {
        let saved;
        try { saved = JSON.parse(localStorage.getItem(GEMINI_PROFILES_STORAGE)); }
        catch { /* recover from the old key if the profile record is malformed */ }
        if (Array.isArray(saved?.keys)) {
            const keys = saved.keys.filter((entry) =>
                typeof entry?.id === 'string' && typeof entry.label === 'string'
                && typeof entry.value === 'string' && entry.value.trim());
            const activeId = keys.some((entry) => entry.id === saved.activeId)
                ? saved.activeId : keys[0]?.id ?? null;
            return { keys, activeId };
        }
        const value = localStorage.getItem(LEGACY_STORAGE)?.trim();
        if (value) return { keys: [{ id: 'legacy', label: 'Default', value }], activeId: 'legacy' };
    } catch { /* local storage can be unavailable */ }
    return { keys: [], activeId: null };
}

export function saveGeminiProfiles(profiles) {
    // Once the list is saved, it is authoritative even when it is empty.
    localStorage.setItem(GEMINI_PROFILES_STORAGE, JSON.stringify(profiles));
    localStorage.removeItem(LEGACY_STORAGE);
}
