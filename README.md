Thunderbird Email Collation ExtensionThis is a Thunderbird WebExtension that allows users to select emails from one or more senders, and then collates them into a single, coherent HTML document. It uses AI embeddings (via a local Ollama instance or the Google Gemini API) to intelligently deduplicate content, ensuring the final timeline is clean and readable.FeaturesSender-Based Collation: Select one or more senders to include in the report.Date Filtering: Optionally specify a start date to limit the age of included emails.AI-Powered Deduplication: Utilizes text embeddings to find and remove semantically similar or redundant email content (like long reply chains).Timeline Preservation: The final output is sorted chronologically.Flexible Output: View the collated document in a new tab or save it directly to an HTML file.Easy Access: Accessible from the Tools menu, a message list context menu, or a toolbar button.Configurable: Choose between using a local Ollama instance (private) or the Google Gemini API (cloud).File Structureemail-collation-extension/
├── manifest.json               # The core extension manifest
├── background.js               # Main event handler script
├── popup/
│   ├── collate.html            # Main UI for the extension
│   ├── collate.js              # Logic for the UI
│   └── collate.css             # Styles for the UI
├── modules/
│   ├── collator.js             # Core collation logic
│   ├── embeddings.js           # Handles API calls to embedding services
│   ├── deduplication.js        # Logic for comparing embeddings and removing duplicates
│   ├── storage.js              # Manages extension settings
│   └── utils.js                # Utility classes (ProgressReporter, etc.)
├── popup/vendor/
│   ├── tom-select.css          # Vendored library for rich select dropdowns
│   └── tom-select.complete.js
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   ├── icon-64.png
│   └── icon-128.png
├── _locales/
│   └── en/
│       └── messages.json       # For internationalization
└── README.md
Development & InstallationPrerequisitesThunderbird: Version 128 or newer.Node.js & npm: For installing development tools.web-ext: The command-line tool for building and running WebExtensions.SetupInstall web-ext:npm install --global web-ext
Run the Extension in Thunderbird:Navigate to the email-collation-extension/ directory in your terminal and run:web-ext run --target=thunderbird
This will launch Thunderbird with the extension temporarily loaded. Changes to the source files will cause the extension to automatically reload.Configure the Extension:Open the extension's UI by clicking its toolbar icon or going to Tools -> Collate Emails by Sender....Go to the Settings tab.For Ollama (Recommended for Privacy):Ensure you have Ollama running locally.Pull an embedding model: ollama pull nomic-embed-textThe default endpoint (http://localhost:11434) and model name in the extension settings should work.For Gemini:Obtain an API key from Google AI Studio.Paste the key into the Gemini API Key field in the extension settings.PackagingTo create a distributable .zip file for submission to the Thunderbird Add-ons portal (ATN), run the following command from the email-collation-extension/ directory:web-ext build
This will create a zip file in the web-ext-artifacts/ directory.This project is structured to be robust and maintainable, following the best practices for modern Thunderbird extension development using Manifest V3.