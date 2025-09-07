document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const UI_COMPLETION_DELAY = 5000; // ms to wait before resetting UI or closing window, allowing user to see the final status.

    // --- Globals ---
    let tomSelect;

    // --- Element Refs ---
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    const senderSelect = document.getElementById('sender-select');
    const senderLoader = document.getElementById('sender-loader');
    const startDateInput = document.getElementById('start-date');
    const startButton = document.getElementById('start-collation-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressBarInner = document.getElementById('progress-bar-inner');
    const progressText = document.getElementById('progress-text');
    const errorLog = document.getElementById('error-log');

    // Settings elements
    const saveSettingsButton = document.getElementById('save-settings-btn');
    const providerSelect = document.getElementById('provider-select');
    const ollamaSettings = document.getElementById('ollama-settings');
    const geminiSettings = document.getElementById('gemini-settings');
    const ollamaEndpointInput = document.getElementById('ollama-endpoint');
    const ollamaModelInput = document.getElementById('ollama-model');
    const geminiApiKeyInput = document.getElementById('gemini-api-key');
    const thresholdSlider = document.getElementById('similarity-threshold');
    const settingsSavedMsg = document.getElementById('settings-saved-msg');

    // --- Functions ---

    /**
     * Initializes the TomSelect instance for sender selection.
     */
    function initializeTomSelect() {
        tomSelect = new TomSelect(senderSelect, {
            create: true,
            plugins: ['remove_button'],
            placeholder: 'Select or type sender emails...',
        });
    }

    /**
     * Fetches all unique senders from the background script and populates the select dropdown.
     */
    async function loadSenders() {
        senderLoader.classList.add('active');
        try {
            const response = await messenger.runtime.sendMessage({ action: 'getAllSenders' });
            if (response.status === 'success') {
                const senders = response.data;
                tomSelect.clearOptions();
                senders
                    .sort((a, b) => b[1] - a[1]) // Sort by message count descending
                    .forEach(([email, count]) => {
                        tomSelect.addOption({
                            value: email,
                            text: `${email} (${count})`
                        });
                    });
                 checkForUrlParams();
            } else {
                throw new Error(response.message || "Failed to load senders.");
            }
        } catch (error) {
            console.error(error);
            progressText.textContent = `Error loading senders: ${error.message}`;
            errorLog.textContent = error.stack;
            progressContainer.classList.remove('hidden');
            errorLog.classList.remove('hidden');
        } finally {
            senderLoader.classList.remove('active');
        }
    }

    /**
     * Checks for a 'sender' URL parameter and pre-selects them.
     */
    function checkForUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const sender = params.get('sender');
        if (sender && tomSelect) {
            tomSelect.addItem(sender);
        }
    }


    /**
     * Handles tab switching between "Collate" and "Settings".
     * @param {Event} e - The click event.
     */
    function handleTabSwitch(e) {
        const targetTab = e.currentTarget.dataset.tab;

        tabContents.forEach(content => content.classList.remove('active'));
        tabLinks.forEach(link => link.classList.remove('active'));

        document.getElementById(targetTab).classList.add('active');
        e.currentTarget.classList.add('active');
    }

    /**
     * Handles provider selection change in settings.
     */
    function handleProviderChange() {
        ollamaSettings.classList.toggle('hidden', providerSelect.value !== 'ollama');
        geminiSettings.classList.toggle('hidden', providerSelect.value !== 'gemini');
    }

    /**
     * Loads settings from storage and populates the settings form.
     */
    async function loadSettings() {
        try {
            const response = await messenger.runtime.sendMessage({ action: 'getSettings' });
            if (response.status === 'success' && response.data) {
                const settings = response.data;
                providerSelect.value = settings.provider || 'ollama';
                ollamaEndpointInput.value = settings.ollama?.endpoint || 'http://localhost:11434';
                ollamaModelInput.value = settings.ollama?.model || 'nomic-embed-text';
                geminiApiKeyInput.value = settings.gemini?.apiKey || '';
                thresholdSlider.value = settings.similarityThreshold || 0.95;
                handleProviderChange();
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        }
    }

    /**
     * Saves the current settings from the form to storage.
     */
    async function saveSettings() {
        const settings = {
            provider: providerSelect.value,
            ollama: {
                endpoint: ollamaEndpointInput.value,
                model: ollamaModelInput.value
            },
            gemini: {
                apiKey: geminiApiKeyInput.value
            },
            similarityThreshold: parseFloat(thresholdSlider.value)
        };
        try {
            const response = await messenger.runtime.sendMessage({ action: 'saveSettings', data: settings });
            if (response.status === 'success') {
                settingsSavedMsg.classList.remove('hidden');
                setTimeout(() => settingsSavedMsg.classList.add('hidden'), 3000);
            } else {
                 throw new Error(response.message || "Failed to save settings.");
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            alert(`Error saving settings: ${error.message}`);
        }
    }

    /**
     * Starts the collation process by sending a message to the background script.
     */
    async function startCollation() {
        const selectedSenders = tomSelect.getValue();
        if (selectedSenders.length === 0) {
            alert('Please select at least one sender.');
            return;
        }

        // Reset UI
        startButton.disabled = true;
        startButton.textContent = 'Collating...';
        progressContainer.classList.remove('hidden');
        errorLog.classList.add('hidden');
        progressBarInner.style.width = '0%';
        progressText.textContent = 'Starting...';

        try {
            const settings = await messenger.runtime.sendMessage({ action: 'getSettings' });
            if (settings.status !== 'success') throw new Error("Could not retrieve settings.");

            const collationData = {
                senders: selectedSenders,
                startDate: startDateInput.value ? new Date(startDateInput.value).toISOString() : null,
                outputMethod: document.querySelector('input[name="output-method"]:checked').value,
                settings: settings.data
            };

            messenger.runtime.sendMessage({ action: 'collate', data: collationData });

        } catch (error) {
            updateProgress({
                type: 'error',
                message: `Failed to start collation: ${error.message}`
            });
            resetUiAfterCompletion();
        }
    }

    /**
     * Updates the progress UI based on messages from the background script.
     * @param {object} status - The progress status object.
     */
    function updateProgress(status) {
        if (status.type === 'progress') {
            progressBarInner.style.width = `${status.percentage}%`;
            progressText.textContent = `[${status.percentage}%] ${status.message}`;
        } else if (status.type === 'error') {
            progressBarInner.style.backgroundColor = 'var(--error-color)';
            progressText.textContent = `Error: ${status.message}`;
            errorLog.textContent = status.message; // Potentially add more detail if available
            errorLog.classList.remove('hidden');
            resetUiAfterCompletion();
        } else if (status.type === 'complete') {
             progressBarInner.style.width = `100%`;
             progressBarInner.style.backgroundColor = '#28a745';
             progressText.textContent = status.message || "Collation Complete!";
             resetUiAfterCompletion(true);
        }
    }

    function resetUiAfterCompletion(isSuccess = false) {
        setTimeout(() => {
            startButton.disabled = false;
            startButton.textContent = 'Start Collation';
            if(isSuccess) {
                 progressContainer.classList.add('hidden');
                 progressBarInner.style.width = '0%';
                 progressBarInner.style.backgroundColor = 'var(--primary-color)';
            }
        }, UI_COMPLETION_DELAY);
    }

    /**
     * Handles incoming messages (e.g., progress updates) from the background script.
     */
    function handleMessages(request, sender, sendResponse) {
        if (request.action === 'progress') {
            updateProgress(request.data);
            // The popup can be closed once the process is complete or has an error.
            if(request.data.type === 'complete' || request.data.type === 'error') {
                 // Automatically close the popup window after a short delay
                 setTimeout(() => window.close(), UI_COMPLETION_DELAY);
            }
        }
    }


    // --- Event Listeners ---
    tabLinks.forEach(link => link.addEventListener('click', handleTabSwitch));
    providerSelect.addEventListener('change', handleProviderChange);
    saveSettingsButton.addEventListener('click', saveSettings);
    startButton.addEventListener('click', startCollation);
    messenger.runtime.onMessage.addListener(handleMessages);


    // --- Initialization ---
    initializeTomSelect();
    loadSenders();
    loadSettings();
});
