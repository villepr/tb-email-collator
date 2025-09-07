/**
 * @file deduplication.js
 * @description Uses embeddings to find and remove duplicate messages.
 */

export class Deduplicator {
    constructor(similarityThreshold = 0.95) {
        // A high threshold means messages must be very similar to be duplicates.
        this.threshold = similarityThreshold;
    }

    /**
     * Deduplicates a list of messages based on embedding similarity.
     * @param {object[]} messages - Array of messages with an 'embedding' property.
     * @returns {object[]} A new array with duplicate messages removed.
     */
    deduplicate(messages) {
        const uniqueMessages = [];
        const messageEmbeddings = messages
            .filter(m => m.embedding && m.embedding.length > 0)
            .map(m => m.embedding);
        
        const isDuplicate = new Array(messages.length).fill(false);

        for (let i = 0; i < messages.length; i++) {
            if (isDuplicate[i] || !messages[i].embedding) continue;

            for (let j = i + 1; j < messages.length; j++) {
                if (isDuplicate[j] || !messages[j].embedding) continue;
                
                const similarity = this.cosineSimilarity(messages[i].embedding, messages[j].embedding);
                
                if (similarity > this.threshold) {
                    // Mark the shorter message as a duplicate.
                    // This tends to preserve the more complete message in a thread.
                    if (messages[i].body.length > messages[j].body.length) {
                        isDuplicate[j] = true;
                    } else {
                        isDuplicate[i] = true;
                        break; // Move to the next i
                    }
                }
            }
        }
        
        for (let i = 0; i < messages.length; i++) {
            if (!isDuplicate[i]) {
                uniqueMessages.push(messages[i]);
            }
        }
        
        return uniqueMessages;
    }

    /**
     * Calculates the cosine similarity between two vectors.
     * @param {number[]} vecA - The first vector.
     * @param {number[]} vecB - The second vector.
     * @returns {number} The cosine similarity, a value between -1 and 1.
     */
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) {
            return 0;
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
