/**
 * @file storage.js
 * @description Manages storing and retrieving extension settings.
 * NOTE: True encryption in client-side JS is complex. This provides a basic
 * abstraction over messenger.storage.local, not secure cryptographic storage.
 * For API keys, the browser's local storage is reasonably secure but not infallible.
 */

const SETTINGS_KEY = 'emailCollationSettings';

export class StorageManager {
    /**
     * Retrieves the settings object from local storage.
     * @returns {Promise<object>} The settings object.
     */
    static async getSettings() {
        try {
            const result = await messenger.storage.local.get(SETTINGS_KEY);
            // Provide sensible defaults if no settings are stored yet
            const defaults = {
                provider: 'ollama',
                ollama: {
                    endpoint: 'http://localhost:11434',
                    model: 'nomic-embed-text'
                },
                gemini: {
                    apiKey: ''
                },
                similarityThreshold: 0.95
            };
            return { ...defaults, ...(result[SETTINGS_KEY] || {}) };
        } catch (error) {
            console.error("Error getting settings:", error);
            return defaults;
        }
    }

    /**
     * Saves the settings object to local storage.
     * @param {object} settings - The settings object to save.
     * @returns {Promise<void>}
     */
    static async saveSettings(settings) {
        try {
            await messenger.storage.local.set({ [SETTINGS_KEY]: settings });
        } catch (error) {
            console.error("Error saving settings:", error);
            throw error; // Re-throw to be handled by the caller
        }
    }
}
