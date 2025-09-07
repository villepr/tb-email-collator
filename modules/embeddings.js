/**
 * @file embeddings.js
 * @description Manages communication with embedding APIs (Ollama, Gemini).
 * Includes caching and rate limiting.
 */
import { RateLimiter, EmbeddingCache } from './utils.js';

export class EmbeddingService {
    constructor(settings) {
        this.provider = settings.provider || 'ollama';
        this.config = settings[this.provider];
        this.cache = new EmbeddingCache(1000); // Cache up to 1000 embeddings
        
        // Gemini API has a default limit of 60 requests per minute.
        // We set a conservative limit here.
        this.rateLimiter = new RateLimiter(45, 60 * 1000); 
    }

    /**
     * Generates embeddings for an array of message objects.
     * @param {object[]} messages - Messages with a 'body' property.
     * @param {function} onProgress - Callback for progress updates.
     * @returns {Promise<object[]>} Messages with an added 'embedding' property.
     */
    async generateEmbeddingsForMessages(messages, onProgress = () => {}) {
        const messagesWithEmbeddings = [];
        let count = 0;
        for (const message of messages) {
            try {
                const embedding = await this.getEmbedding(message.body);
                messagesWithEmbeddings.push({ ...message, embedding });
            } catch (error) {
                console.warn(`Could not generate embedding for message ID ${message.id}:`, error.message);
                // Push message without embedding to not lose it
                messagesWithEmbeddings.push({ ...message, embedding: null });
            }
            count++;
            onProgress(count, messages.length);
        }
        return messagesWithEmbeddings;
    }


    /**
     * Gets an embedding for a given text, using cache if available.
     * @param {string} text - The text to embed.
     * @returns {Promise<number[]>} The embedding vector.
     */
    async getEmbedding(text) {
        const cached = await this.cache.get(text);
        if (cached) {
            return cached;
        }

        await this.rateLimiter.throttle();

        let embedding;
        if (this.provider === 'ollama') {
            embedding = await this.getOllamaEmbedding(text);
        } else if (this.provider === 'gemini') {
            embedding = await this.getGeminiEmbedding(text);
        } else {
            throw new Error(`Unsupported embedding provider: ${this.provider}`);
        }

        await this.cache.set(text, embedding);
        return embedding;
    }

    /**
     * Fetches an embedding from a local Ollama instance.
     * @param {string} text - The text to embed.
     * @returns {Promise<number[]>} The embedding vector.
     */
    async getOllamaEmbedding(text) {
        const endpoint = this.config.endpoint || 'http://localhost:11434';
        const response = await fetch(`${endpoint}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.config.model || 'nomic-embed-text',
                prompt: text,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Ollama API error (${response.status}): ${errorBody}`);
        }
        const data = await response.json();
        return data.embedding;
    }
    
    /**
     * Fetches an embedding from the Google Gemini API.
     * @param {string} text - The text to embed.
     * @returns {Promise<number[]>} The embedding vector.
     */
    async getGeminiEmbedding(text) {
        const apiKey = this.config.apiKey;
        if (!apiKey) {
            throw new Error("Gemini API key is missing.");
        }
        
        const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "models/text-embedding-004",
                content: { parts: [{ text }] }
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Gemini API error (${response.status}): ${errorBody.error.message}`);
        }
        const data = await response.json();
        return data.embedding.value;
    }
}
