/**
 * @file collator.js
 * @description Handles the main logic of fetching, processing, and collating emails.
 */
import { EmbeddingService } from './embeddings.js';
import { Deduplicator } from './deduplication.js';
import { ProgressReporter } from './utils.js';

export class EmailCollator {
    constructor(settings) {
        this.settings = settings;
        this.embeddingService = new EmbeddingService(settings);
        this.deduplicator = new Deduplicator(settings.similarityThreshold || 0.95);
        this.progressReporter = new ProgressReporter();
    }

    /**
     * Main collation method.
     * @param {string[]} senders - An array of sender emails to collate.
     * @param {string|null} startDate - ISO date string to filter emails from.
     * @returns {Promise<string>} The final generated HTML content.
     */
    async collate(senders, startDate) {
        try {
            // 1. Fetch messages
            await this.progressReporter.reportProgress(0, 100, `Fetching emails for ${senders.length} sender(s)...`);
            const messages = await this.fetchEmailsBySenders(senders, startDate);
            if (messages.length === 0) {
                 await this.progressReporter.reportProgress(100, 100, `No messages found.`);
                 return "<h1>No Messages Found</h1><p>No messages matched the selected criteria.</p>";
            }

            // 2. Extract content
            const totalMessages = messages.length;
            await this.progressReporter.reportProgress(10, 100, `Found ${totalMessages} messages. Extracting content...`);
            const messageContents = await this.extractAllMessageContents(messages);

            // 3. Generate embeddings
            await this.progressReporter.reportProgress(40, 100, `Generating AI embeddings for content analysis...`);
            const messagesWithEmbeddings = await this.embeddingService.generateEmbeddingsForMessages(
                messageContents.filter(mc => mc.body.trim().length > 50), // Only embed non-trivial bodies
                (current, total) => this.progressReporter.reportProgress(40 + Math.round((current/total)*30), 100, `Generating embedding ${current} of ${total}...`)
            );
            
            // 4. Deduplicate
            await this.progressReporter.reportProgress(70, 100, `Deduplicating content...`);
            const uniqueMessages = this.deduplicator.deduplicate(messagesWithEmbeddings);
            
            // 5. Sort and generate HTML
            await this.progressReporter.reportProgress(90, 100, `Generating final HTML document...`);
            const sortedMessages = uniqueMessages.sort((a, b) => new Date(a.date) - new Date(b.date));
            const html = this.generateHtml(sortedMessages, senders);

            await this.progressReporter.reportProgress(100, 100, `Collation complete! Found ${uniqueMessages.length} unique messages.`);
            this.progressReporter.reportComplete(`Collation Complete! Found ${uniqueMessages.length} unique messages.`);

            return html;

        } catch (error) {
            console.error("Collation process failed:", error);
            this.progressReporter.reportError(error);
            throw error;
        }
    }

    /**
     * Fetches all messages for the given senders using the query API.
     * @param {string[]} senders - Array of sender emails.
     * @param {string|null} fromDate - ISO date string.
     * @returns {Promise<object[]>} An array of message headers.
     */
    async fetchEmailsBySenders(senders, fromDate) {
        const allMessages = [];
        for (const sender of senders) {
            try {
                const queryInfo = { author: sender, includeSubFolders: true };
                if (fromDate) {
                    queryInfo.fromDate = new Date(fromDate);
                }

                let page = await messenger.messages.query(queryInfo);
                allMessages.push(...page.messages);

                while (page.id) {
                    page = await messenger.messages.continueList(page.id);
                    allMessages.push(...page.messages);
                }
            } catch (error) {
                 console.warn(`Could not fetch emails for ${sender}:`, error);
            }
        }
        return allMessages;
    }

    /**
     * Extracts full content for a list of message headers.
     * @param {object[]} messages - Array of message headers.
     * @returns {Promise<object[]>} Array of message content objects.
     */
    async extractAllMessageContents(messages) {
        const contents = [];
        let processedCount = 0;
        const total = messages.length;

        for (const message of messages) {
            const content = await this.extractMessageContent(message.id);
            if (content) {
                contents.push(content);
            }
            processedCount++;
             if (processedCount % 10 === 0 || processedCount === total) {
                 await this.progressReporter.reportProgress(10 + Math.round((processedCount/total)*30), 100, `Extracted content from ${processedCount} of ${total} messages...`);
            }
        }
        return contents;
    }

    /**
     * Extracts subject, date, from, and plain text body for a single message.
     * @param {number} messageId - The ID of the message.
     * @returns {Promise<object|null>} The extracted content or null on error.
     */
    async extractMessageContent(messageId) {
        try {
            const fullMessage = await messenger.messages.getFull(messageId);
            const bodyPart = await messenger.messages.getPlainTextBody(messageId);
            
            return {
                id: messageId,
                subject: fullMessage.headers.subject?.[0] || 'No Subject',
                date: fullMessage.headers.date?.[0] || new Date().toISOString(),
                from: fullMessage.headers.from?.[0] || 'Unknown Sender',
                body: bodyPart || ''
            };
        } catch (error) {
            console.error(`Failed to extract content for message ${messageId}:`, error);
            return null;
        }
    }

    /**
     * Generates the final HTML report from the collated messages.
     * @param {object[]} messages - The sorted, unique array of messages.
     * @param {string[]} senders - The list of senders for the report header.
     * @returns {string} The generated HTML as a string.
     */
    generateHtml(messages, senders) {
        let bodyContent = messages.map(msg => `
            <div class="message">
                <div class="meta">
                    <strong>From:</strong> ${this.escapeHtml(msg.from)}<br>
                    <strong>Subject:</strong> ${this.escapeHtml(msg.subject)}<br>
                    <strong>Date:</strong> ${new Date(msg.date).toLocaleString()}
                </div>
                <div class="body">
                    <pre>${this.escapeHtml(msg.body)}</pre>
                </div>
            </div>
        `).join('');

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Email Collation Report</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 2rem auto; padding: 0 1rem; background-color: #f9f9f9; }
                h1, h2 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; }
                .report-meta { background-color: #e7f3ff; border: 1px solid #b3d7ff; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; }
                .message { border: 1px solid #ddd; border-radius: 8px; margin-bottom: 1.5rem; background-color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .meta { background-color: #f7f7f7; padding: 1rem; border-bottom: 1px solid #ddd; border-radius: 8px 8px 0 0; }
                .body { padding: 1rem; }
                pre { white-space: pre-wrap; word-wrap: break-word; font-family: "SF Mono", "Fira Code", "Source Code Pro", Menlo, Consolas, Monaco, monospace; font-size: 0.95em; }
                strong { color: #555; }
            </style>
        </head>
        <body>
            <h1>Email Collation Report</h1>
            <div class="report-meta">
                <h2>Report Details</h2>
                <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
                <p><strong>Collated ${messages.length} unique messages from sender(s):</strong></p>
                <ul>${senders.map(s => `<li>${this.escapeHtml(s)}</li>`).join('')}</ul>
            </div>
            ${bodyContent}
        </body>
        </html>
        `;
    }

    /**
     * Simple HTML escaper.
     * @param {string} str - The string to escape.
     */
    escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
