/**
 * @file background.js
 * @description Main background script for the Thunderbird Email Collation extension.
 * Handles menu creation, event listeners, and communication with the popup UI.
 * Acts as the central controller for the collation process.
 */

import { EmailCollator } from './modules/collator.js';
import { StorageManager } from './modules/storage.js';

const DEBUG = true;

function debugLog(...args) {
    if (DEBUG) {
        console.log('[Email Collation BG]', ...args);
    }
}

/**
 * Creates the context menu items when the extension is installed or updated.
 */
function setupMenus() {
    messenger.menus.create({
        id: "collate-emails-tools-menu",
        title: "Collate Emails by Sender...",
        contexts: ["tools_menu"]
    }, () => {
        if (messenger.runtime.lastError) {
            debugLog("Error creating tools menu item:", messenger.runtime.lastError);
        }
    });

    messenger.menus.create({
        id: "collate-from-sender-context-menu",
        title: "Collate emails from this sender",
        contexts: ["message_list"]
    }, () => {
        if (messenger.runtime.lastError) {
            debugLog("Error creating message list menu item:", messenger.runtime.lastError);
        }
    });
}

// Set up menus on install or startup
messenger.runtime.onInstalled.addListener(setupMenus);
messenger.runtime.onStartup.addListener(setupMenus);


/**
 * Handles clicks on the context menu items.
 * @param {object} info - Information about the clicked menu item.
 * @param {object} tab - The tab where the click occurred.
 */
messenger.menus.onClicked.addListener(async (info, tab) => {
    debugLog("Menu clicked:", info);

    if (info.menuItemId === "collate-emails-tools-menu") {
        messenger.windows.create({
            url: "/popup/collate.html",
            type: "popup",
            width: 800,
            height: 700,
        });

    } else if (info.menuItemId === "collate-from-sender-context-menu") {
        if (info.selectedMessages && info.selectedMessages.messages.length > 0) {
            const sender = info.selectedMessages.messages[0].author;
            messenger.windows.create({
                url: `/popup/collate.html?sender=${encodeURIComponent(sender)}`,
                type: "popup",
                width: 800,
                height: 700,
            });
        } else {
            debugLog("No message selected for context menu action.");
        }
    }
});


/**
 * Main message handler for requests from the popup script.
 * @param {object} request - The message sent from the popup.
 * @param {object} sender - Information about the sender.
 * @param {function} sendResponse - Function to call to send a response.
 * @returns {boolean} - True to indicate an asynchronous response.
 */
messenger.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debugLog("Message received:", request);

    switch (request.action) {
        case 'collate':
            handleCollation(request.data)
                .then(result => sendResponse({ status: 'success', data: result }))
                .catch(error => {
                    console.error("Collation failed:", error);
                    sendResponse({ status: 'error', message: error.message });
                });
            return true; // Indicates async response

        case 'getSettings':
            StorageManager.getSettings()
                .then(settings => sendResponse({ status: 'success', data: settings }))
                .catch(error => sendResponse({ status: 'error', message: error.message }));
            return true;

        case 'saveSettings':
            StorageManager.saveSettings(request.data)
                .then(() => sendResponse({ status: 'success' }))
                .catch(error => sendResponse({ status: 'error', message: error.message }));
            return true;

        case 'getAllSenders':
            getAllSenders()
                .then(senders => sendResponse({ status: 'success', data: Array.from(senders.entries()) }))
                .catch(error => {
                     console.error("Failed to get senders:", error);
                     sendResponse({ status: 'error', message: error.message })
                });
            return true;

        default:
            debugLog(`Unknown action: ${request.action}`);
            sendResponse({ status: 'error', message: `Unknown action: ${request.action}` });
            return false;
    }
});

/**
 * Handles the entire email collation process.
 * @param {object} data - The collation parameters from the popup.
 */
async function handleCollation(data) {
    debugLog("Starting collation with data:", data);
    try {
        const collator = new EmailCollator(data.settings);

        // Forward progress reports to the popup
        collator.progressReporter.addListener((status) => {
             messenger.runtime.sendMessage({ action: 'progress', data: status });
        });

        const htmlContent = await collator.collate(data.senders, data.startDate);
        
        if (data.outputMethod === 'tab') {
            await openResultInBrowser(htmlContent);
        } else {
            await exportToFile(htmlContent, `collation-${Date.now()}.html`);
        }
        return "Collation complete.";
    } catch (error) {
        console.error("Error during handleCollation:", error);
        // Also report error back to UI
        messenger.runtime.sendMessage({ action: 'progress', data: { type: 'error', message: `Collation failed: ${error.message}` } });
        throw error;
    }
}

/**
 * Opens the generated HTML content in a new browser tab.
 * @param {string} htmlContent - The HTML string to display.
 */
async function openResultInBrowser(htmlContent) {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    await messenger.tabs.create({ url: url });

    // The blob URL is revoked automatically when the tab is closed.
}

/**
 * Prompts the user to save the generated HTML content to a file.
 * @param {string} htmlContent - The HTML string to save.
 * @param {string} filename - The default filename.
 */
async function exportToFile(htmlContent, filename) {
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    await messenger.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
    });

    // Revoke the URL after a short delay to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}


/**
 * Fetches all unique senders from all accounts and folders.
 * This can be a long-running operation.
 * @returns {Promise<Map<string, number>>} A map of sender emails to their message count.
 */
async function getAllSenders() {
    const senders = new Map();
    const accounts = await messenger.accounts.list(true); // include identities

    for (const account of accounts) {
        for (const folder of account.folders) {
            await processFolder(folder, senders);
        }
    }
    return senders;
}

/**
 * Recursively process a folder and its subfolders to get senders.
 * @param {object} folder - The folder object from the API.
 * @param {Map<string, number>} senders - The map to accumulate senders.
 */
async function processFolder(folder, senders) {
    debugLog(`Processing folder: ${folder.name}`);
    try {
        let page = await messenger.messages.list(folder.id);
        while (true) {
            for (const message of page.messages) {
                const author = message.author;
                if (!senders.has(author)) {
                    senders.set(author, 0);
                }
                senders.set(author, senders.get(author) + 1);
            }

            if (!page.id) break; // No more pages
            page = await messenger.messages.continueList(page.id);
        }
    } catch (e) {
        debugLog(`Could not list messages for folder ${folder.name}:`, e);
    }

    if (folder.subFolders) {
        for (const subFolder of folder.subFolders) {
            await processFolder(subFolder, senders);
        }
    }
}

debugLog("Background script loaded.");
