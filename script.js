/* =====================================================
   KALKI / J.A.R.V.I.S AI ASSISTANT
   Gemini AI + Voice Input + Voice Output
   Camera Vision + Chat Memory + API Key Settings
===================================================== */

"use strict";

// =====================================================
// 1. HTML ELEMENTS
// =====================================================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");

const micBtn = document.getElementById("mic-btn");
const imageInput = document.getElementById("img-input");
const cameraBtn = document.getElementById("cam-btn");

const clearBtn = document.getElementById("clear-btn");

const apiKeyInput = document.getElementById("gemini-api-key");
const saveKeyBtn = document.getElementById("save-api-key");
const clearKeyBtn = document.getElementById("clear-api-key");
const keyStatus = document.getElementById("gemini-key-status");

const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("voice-settings");

const voiceSelect = document.getElementById("tts-voice-select");
const languageSelect = document.getElementById("voice-input-language");
const autoReadToggle = document.getElementById("tts-auto-read");
const stopVoiceBtn = document.getElementById("tts-stop-button");
const ttsStatus = document.getElementById("tts-status");
const voiceModeStatus = document.getElementById("voice-mode-status");

// The existing inline script in index.html uses this name.
window.messageInput = input;

// =====================================================
// 2. CONFIGURATION
// =====================================================

const CONFIG = {
    MODEL: "gemini-2.5-flash",

    API_URL:
        "https://generativelanguage.googleapis.com/v1beta/models/",

    API_KEY_STORAGE: "kalki_gemini_api_key",
    HISTORY_STORAGE: "kalki_chat_history",

    MAX_HISTORY: 12,
    MAX_IMAGE_SIZE: 5 * 1024 * 1024,
    REQUEST_TIMEOUT: 45000
};

// =====================================================
// 3. APPLICATION STATE
// =====================================================

let apiKey = "";
let conversation = [];

let isProcessing = false;
let selectedImage = null;

let recognition = null;
let isListening = false;
let voiceModeActive = false;

let availableVoices = [];

window.kalkiAssistantState = "idle";

window.kalkiVoiceState = {
    active: false,
    listening: false,
    processing: false
};

// =====================================================
// 4. STATE UPDATES
// =====================================================

function updateAssistantState(state) {
    window.kalkiAssistantState = state;

    window.dispatchEvent(
        new CustomEvent("kalki:assistant-state")
    );
}

function updateVoiceState() {
    window.kalkiVoiceState = {
        active: voiceModeActive,
        listening: isListening,
        processing: isProcessing
    };

    window.dispatchEvent(
        new CustomEvent("kalki:voice-state")
    );
}

// =====================================================
// 5. MESSAGE DISPLAY
// =====================================================

function addMessage(text, who = "ai") {
    if (!chat) return null;

    const message = document.createElement("div");

    message.className = "msg " + who;
    message.textContent = text;

    chat.appendChild(message);
    chat.scrollTop = chat.scrollHeight;

    return message;
}

function displayAssistantMessage(text) {
    return addMessage("KALKI: " + text, "ai");
}

function displayUserMessage(text) {
    return addMessage("YOU: " + text, "user");
}

// =====================================================
// 6. CHAT MEMORY
// =====================================================

function loadMemory() {
    try {
        const saved = localStorage.getItem(
            CONFIG.HISTORY_STORAGE
        );

        const parsed = JSON.parse(saved || "[]");

        if (!Array.isArray(parsed)) {
            conversation = [];
            return;
        }

        conversation = parsed
            .filter(item =>
                item &&
                ["user", "model"].includes(item.role) &&
                typeof item.text === "string"
            )
            .slice(-CONFIG.MAX_HISTORY);

    } catch (error) {
        console.warn("Memory loading error:", error);
        conversation = [];
    }
}

function saveMemory() {
    try {
        conversation = conversation.slice(
            -CONFIG.MAX_HISTORY
        );

        localStorage.setItem(
            CONFIG.HISTORY_STORAGE,
            JSON.stringify(conversation)
        );

    } catch (error) {
        console.warn("Memory saving error:", error);
    }
}

function restoreChat() {
    if (!chat) return;

    chat.innerHTML = "";

    conversation.forEach(item => {
        if (item.role === "user") {
            addMessage("YOU: " + item.text, "user");
        } else {
            addMessage("KALKI: " + item.text, "ai");
        }
    });

    chat.scrollTop = chat.scrollHeight;
}

// =====================================================
// 7. API KEY MANAGEMENT
// =====================================================

function updateKeyStatus(message, success = false) {
    if (!keyStatus) return;

    keyStatus.textContent = message;
    keyStatus.style.color = success
        ? "var(--green, #35d39a)"
        : "";
}

function loadAPIKey() {
    try {
        apiKey = (
            localStorage.getItem(CONFIG.API_KEY_STORAGE) || ""
        ).trim();

    } catch (error) {
        apiKey = "";
        console.warn("Could not load API key:", error);
    }

    if (apiKey) {
        updateKeyStatus(
            "Gemini API key saved on this device.",
            true
        );

        if (apiKeyInput) {
            apiKeyInput.value = apiKey;
        }

        return true;
    }

    updateKeyStatus("No key saved on this device.");

    return false;
}

function saveAPIKey() {
    const enteredKey = apiKeyInput?.value.trim();

    if (!enteredKey) {
        updateKeyStatus("Please enter your Gemini API key.");
        apiKeyInput?.focus();
        return;
    }

    apiKey = enteredKey;

    try {
        localStorage.setItem(
            CONFIG.API_KEY_STORAGE,
            apiKey
        );

        updateKeyStatus(
            "API key saved successfully.",
            true
        );

        displayAssistantMessage("Gemini API key saved.");

    } catch (error) {
        apiKey = "";

        updateKeyStatus(
            "Unable to save the key in this browser."
        );

        console.error(error);
    }
}

function clearAPIKey() {
    try {
        localStorage.removeItem(CONFIG.API_KEY_STORAGE);
    } catch (error) {
        console.warn(error);
    }

    apiKey = "";

    if (apiKeyInput) {
        apiKeyInput.value = "";
    }

    updateKeyStatus("API key cleared.");

    displayAssistantMessage("Saved API key cleared.");
}

function requestAPIKey() {
    if (apiKey) return true;

    if (settingsPanel) {
        settingsPanel.hidden = false;
    }

    if (settingsToggle) {
        settingsToggle.setAttribute(
            "aria-expanded",
            "true"
        );
    }

    if (apiKeyInput) {
        apiKeyInput.focus();
    }

    displayAssistantMessage(
        "Please enter and save your Gemini API key in Settings before chatting."
    );

    return false;
}

// =====================================================
// 8. GEMINI API REQUEST
// =====================================================

async function askGemini(userText, image = null) {
    if (!apiKey) {
        throw new Error(
            "API key missing. Open Settings and save your Gemini key."
        );
    }

    const endpoint =
        CONFIG.API_URL +
        CONFIG.MODEL +
        ":generateContent?key=" +
        encodeURIComponent(apiKey);

    const parts = [];

    if (image) {
        parts.push({
            inline_data: {
                mime_type: image.type,
                data: image.data
            }
        });
    }

    if (userText) {
        parts.push({
            text: userText
        });
    }

    const history = conversation
        .slice(-CONFIG.MAX_HISTORY)
        .map(item => ({
            role: item.role,
            parts: [
                {
                    text: item.text
                }
            ]
        }));

    const contents = [
        ...history,
        {
            role: "user",
            parts: parts
        }
    ];

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.REQUEST_TIMEOUT
    );

    try {
        const response = await fetch(endpoint, {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            signal: controller.signal,

            body: JSON.stringify({
                system_instruction: {
                    parts: [{
                        text:
                            "You are KALKI, also known as J.A.R.V.I.S. " +
                            "You are a helpful personal AI assistant. " +
                            "Give accurate, clear and useful answers. " +
                            "Keep simple answers short. " +
                            "Explain complicated topics step by step. " +
                            "Do not pretend to perform actions you cannot perform."
                    }]
                },

                contents: contents,

                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            const message =
                data?.error?.message ||
                "Gemini API request failed.";

            throw new Error(message);
        }

        const answer = data?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!answer) {
            const reason =
                data?.candidates?.[0]?.finishReason;

            throw new Error(
                reason
                    ? "Gemini could not complete this response: " + reason
                    : "Gemini returned an empty response."
            );
        }

        return answer;

    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error(
                "Request timed out. Please check your internet and try again."
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// =====================================================
// 9. IMAGE CONVERSION
// =====================================================

function convertImage(file) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith("image/")) {
            reject(
                new Error("Please select a valid image.")
            );
            return;
        }

        if (file.size > CONFIG.MAX_IMAGE_SIZE) {
            reject(
                new Error("Image must be smaller than 5 MB.")
            );
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            try {
                const result = reader.result;

                resolve({
                    type: file.type,
                    data: result.split(",")[1]
                });

            } catch (error) {
                reject(
                    new Error("Unable to process this image.")
                );
            }
        };

        reader.onerror = () => {
            reject(
                new Error("Unable to read the selected image.")
            );
        };

        reader.readAsDataURL(file);
    });
}

// =====================================================
// 10. SEND MESSAGE
// =====================================================

async function sendMessage() {
    if (isProcessing || !input) return;

    const userText = input.value.trim();

    if (!userText && !selectedImage) return;

    if (!apiKey) {
        requestAPIKey();
        return;
    }

    isProcessing = true;

    updateAssistantState("processing");
    updateVoiceState();

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = "…";
    }

    let imageData = null;

    if (userText) {
        displayUserMessage(userText);
    } else if (selectedImage) {
        displayUserMessage("Please analyze this image.");
    }

    input.value = "";

    const loading = displayAssistantMessage(
        "Thinking..."
    );

    try {
        if (selectedImage) {
            imageData = await convertImage(selectedImage);
        }

        const promptText =
            userText || "Please analyze this image.";

        const answer = await askGemini(
            promptText,
            imageData
        );

        if (loading) {
            loading.textContent = "KALKI: " + answer;
        }

        conversation.push({
            role: "user",
            text: promptText
        });

        conversation.push({
            role: "model",
            text: answer
        });

        saveMemory();

        if (autoReadToggle?.checked || voiceModeActive) {
            speak(answer);
        }

        selectedImage = null;

        if (imageInput) {
            imageInput.value = "";
        }

        updateAssistantState("idle");

    } catch (error) {
        console.error("KALKI ERROR:", error);

        if (loading) {
            loading.textContent =
                "KALKI ERROR: " + error.message;
        }

        updateAssistantState("error");

    } finally {
        isProcessing = false;

        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = "↑";
        }

        updateVoiceState();

        if (voiceModeActive && !isListening) {
            startListening();
        }

        input.focus();
    }
}

// =====================================================
// 11. VOICE OUTPUT
// =====================================================

function loadVoices() {
    if (!("speechSynthesis" in window)) return;

    availableVoices =
        window.speechSynthesis.getVoices();

    if (!voiceSelect) return;

    const previousValue = voiceSelect.value;

    voiceSelect.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Device default voice";

    voiceSelect.appendChild(defaultOption);

    availableVoices.forEach((voice, index) => {
        const option = document.createElement("option");

        option.value = String(index);

        option.textContent =
            voice.name + " (" + voice.lang + ")";

        voiceSelect.appendChild(option);
    });

    voiceSelect.value = previousValue;
}

function speak(text) {
    if (!("speechSynthesis" in window)) {
        if (ttsStatus) {
            ttsStatus.textContent =
                "Speech output is not supported in this browser.";
        }
        return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);

    speech.lang =
        languageSelect?.value || "en-IN";

    speech.rate = 1;
    speech.pitch = 1;

    const selectedIndex = voiceSelect?.value;

    if (
        selectedIndex !== "" &&
        selectedIndex !== undefined
    ) {
        const selectedVoice =
            availableVoices[Number(selectedIndex)];

        if (selectedVoice) {
            speech.voice = selectedVoice;
            speech.lang = selectedVoice.lang;
        }
    }

    speech.onstart = () => {
        if (ttsStatus) {
            ttsStatus.textContent = "KALKI is speaking...";
        }
    };

    speech.onend = () => {
        if (ttsStatus) {
            ttsStatus.textContent = "Speech completed.";
        }
    };

    speech.onerror = event => {
        console.warn("Speech output error:", event);

        if (ttsStatus) {
            ttsStatus.textContent =
                "Voice output could not be played.";
        }
    };

    window.speechSynthesis.speak(speech);
}

function stopVoice() {
    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    if (ttsStatus) {
        ttsStatus.textContent = "Voice stopped.";
    }
}

// =====================================================
// 12. VOICE INPUT
// =====================================================

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

function setupSpeechRecognition() {
    if (!SpeechRecognition) {
        if (voiceModeStatus) {
            voiceModeStatus.textContent =
                "Voice recognition is not supported in this browser. Try a supported browser.";
        }

        return;
    }

    recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        isListening = true;

        if (micBtn) {
            micBtn.setAttribute("aria-pressed", "true");
            micBtn.textContent = "🔴";
        }

        if (voiceModeStatus) {
            voiceModeStatus.textContent =
                "Listening... Speak now.";
        }

        updateVoiceState();
    };

    recognition.onresult = event => {
        const transcript =
            event.results?.[0]?.[0]?.transcript?.trim();

        if (!transcript) return;

        if (input) {
            input.value = transcript;
        }

        stopListening();

        if (voiceModeActive) {
            sendMessage();
        }
    };

    recognition.onerror = event => {
        console.warn(
            "Speech recognition error:",
            event.error
        );

        if (voiceModeStatus) {
            voiceModeStatus.textContent =
                "Microphone error: " + event.error;
        }

        isListening = false;
        updateVoiceState();
    };

    recognition.onend = () => {
        isListening = false;

        if (micBtn) {
            micBtn.setAttribute("aria-pressed", "false");
            micBtn.textContent = "🎙";
        }

        updateVoiceState();

        if (voiceModeActive && !isProcessing) {
            setTimeout(() => {
                if (voiceModeActive && !isProcessing) {
                    startListening();
                }
            }, 500);
        }
    };
}

function startListening() {
    if (!recognition || isListening || isProcessing) {
        return;
    }

    try {
        recognition.lang =
            languageSelect?.value || "en-IN";

        recognition.start();

    } catch (error) {
        console.warn("Could not start microphone:", error);
    }
}

function stopListening() {
    if (!recognition || !isListening) return;

    try {
        recognition.stop();
    } catch (error) {
        console.warn(error);
    }

    isListening = false;
    updateVoiceState();
}

function toggleVoiceMode() {
    if (!recognition) {
        displayAssistantMessage(
            "Voice recognition is unavailable in this browser."
        );
        return;
    }

    if (!apiKey) {
        requestAPIKey();
        return;
    }

    if (voiceModeActive) {
        voiceModeActive = false;

        stopListening();
        stopVoice();

        if (voiceModeStatus) {
            voiceModeStatus.textContent =
                "Voice conversation stopped.";
        }

        if (micBtn) {
            micBtn.setAttribute("aria-pressed", "false");
            micBtn.textContent = "🎙";
        }

    } else {
        voiceModeActive = true;

        if (voiceModeStatus) {
            voiceModeStatus.textContent =
                "Voice conversation active. Tap the microphone to stop.";
        }

        startListening();
    }

   updateVoiceState();
}

// =====================================================
// 13. CAMERA AND IMAGE INPUT
// =====================================================

if (imageInput) {
    imageInput.addEventListener("change", event => {
        const file = event.target.files?.[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            selectedImage = null;

            displayAssistantMessage(
                "Image vision currently accepts image files only. PDF and document analysis is not configured."
            );

            imageInput.value = "";
            return;
        }
       if (file.size > CONFIG.MAX_IMAGE_SIZE) {
            selectedImage = null;

            displayAssistantMessage(
                "Please choose an image smaller than 5 MB."
            );

            imageInput.value = "";
            return;
        }

        selectedImage = file;

        if (input) {
            input.placeholder =
                "Ask KALKI about the selected image...";
        }

        displayAssistantMessage(
            "Image selected. Type your question and press SEND."
        );
    });
}

if (cameraBtn && imageInput) {
    cameraBtn.addEventListener("click", () => {
        imageInput.click();
    });
}
// =====================================================
// 14. SETTINGS PANEL
// =====================================================

if (settingsToggle && settingsPanel) {
    settingsToggle.addEventListener("click", () => {
        const opening = settingsPanel.hidden;

        settingsPanel.hidden = !opening;

        settingsToggle.setAttribute(
            "aria-expanded",
            String(opening)
        );
    });
}

saveKeyBtn?.addEventListener("click", saveAPIKey);

clearKeyBtn?.addEventListener("click", clearAPIKey);

stopVoiceBtn?.addEventListener("click", stopVoice);
// =====================================================
// 15. CLEAR CHAT
// =====================================================

function clearChat() {
    if (!confirm("Clear your KALKI conversation history?")) {
        return;
    }

    conversation = [];

    saveMemory();

    if (chat) {
        chat.innerHTML = "";
    }

    selectedImage = null;

    if (imageInput) {
        imageInput.value = "";
    }
   displayAssistantMessage(
        "Conversation cleared. Systems online."
    );

    updateAssistantState("idle");
}

clearBtn?.addEventListener("click", clearChat);

// =====================================================
// 16. EVERYDAY TOOLS
// =====================================================

document
    .querySelectorAll("[data-tool-command]")
    .forEach(button => {
        button.addEventListener("click", () => {
            const command =
                button.getAttribute("data-tool-command");

            if (!command || !input) return;
           input.value = command;
            input.focus();
        });
    });

// =====================================================
// 17. CHAT EVENTS
// =====================================================

sendBtn?.addEventListener("click", sendMessage);

input?.addEventListener("keydown", event => {
    if (
        event.key === "Enter" &&
        !event.shiftKey
    ) {
        event.preventDefault();
        sendMessage();
    }
});

micBtn?.addEventListener("click", toggleVoiceMode);

 // =====================================================
// 18. VOICE SETTINGS
// =====================================================

if ("speechSynthesis" in window) {
    loadVoices();

    window.speechSynthesis.onvoiceschanged = loadVoices;
}

autoReadToggle?.addEventListener("change", () => {
    if (ttsStatus) {
        ttsStatus.textContent =
            autoReadToggle.checked
                ? "Automatic voice replies enabled."
                : "Automatic voice replies disabled.";
    }
});

// =====================================================
// 19. INITIALIZATION
// =====================================================  
function initializeKalki() {
    loadMemory();
    loadAPIKey();
    restoreChat();

    setupSpeechRecognition();

    if (conversation.length === 0) {
        displayAssistantMessage(
            "Systems online. How may I assist you?"
        );
    }

    if (!apiKey) {
        requestAPIKey();
    }

    updateAssistantState("idle");
    updateVoiceState();

    console.log("KALKI AI SYSTEM INITIALIZED");
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeKalki
    );
} else {
    initializeKalki();
}
       
