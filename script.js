
/* ==========================================
   J.A.R.V.I.S AI ASSISTANT
   MOBILE EDITION
   Gemini AI + Voice + Camera + Memory
========================================== */

"use strict";

// ==========================================
// 1. HTML ELEMENTS
// ==========================================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");

// Optional HTML elements
const micBtn = document.getElementById("mic");
const cameraBtn = document.getElementById("camera");
const imageInput = document.getElementById("imageInput");

// ==========================================
// 2. CONFIGURATION
// ==========================================

const CONFIG = {
    MODEL: "gemini-2.5-flash",
    API_URL: "https://generativelanguage.googleapis.com/v1beta/models/",
    STORAGE_KEY: "jarvis_api_key",
    HISTORY_KEY: "jarvis_chat_history",
    MAX_HISTORY: 12
};

let apiKey = "";
let isProcessing = false;
let selectedImage = null;

// ==========================================
// 3. MEMORY
// ==========================================

let conversation = [];

try {
    conversation = JSON.parse(
        localStorage.getItem(CONFIG.HISTORY_KEY) || "[]"
    );

    if (!Array.isArray(conversation)) {
        conversation = [];
    }
} catch {
    conversation = [];
}

function saveMemory() {
    try {
        localStorage.setItem(
            CONFIG.HISTORY_KEY,
            JSON.stringify(conversation.slice(-CONFIG.MAX_HISTORY))
        );
    } catch (error) {
        console.warn("Memory could not be saved:", error);
    }
}

// ==========================================
// 4. API KEY SETUP
// ==========================================

function setupAPIKey() {

    const savedKey = localStorage.getItem(CONFIG.STORAGE_KEY);

    if (savedKey) {
        apiKey = savedKey;
        return true;
    }

    const enteredKey = prompt(
        "J.A.R.V.I.S SYSTEM\n\nEnter your Gemini API Key:"
    );

    if (!enteredKey || !enteredKey.trim()) {
        addMessage(
            "J.A.R.V.I.S: API key missing. Reload and enter your key.",
            "ai"
        );
        return false;
    }

    apiKey = enteredKey.trim();

    localStorage.setItem(CONFIG.STORAGE_KEY, apiKey);

    return true;
}

// ==========================================
// 5. MESSAGE DISPLAY
// ==========================================

function addMessage(text, who) {

    if (!chat) return null;

    const message = document.createElement("div");

    message.className = "msg " + who;
    message.textContent = text;

    chat.appendChild(message);

    chat.scrollTop = chat.scrollHeight;

    return message;
}

// ==========================================
// 6. VOICE OUTPUT
// ==========================================

function speak(text) {

    if (!("speechSynthesis" in window)) {
        return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);

    speech.lang = "en-IN";
    speech.rate = 1;
    speech.pitch = 1;

    window.speechSynthesis.speak(speech);
}

// ==========================================
// 7. GEMINI API
// ==========================================

async function askGemini(userText, image = null) {

    if (!apiKey) {
        throw new Error("Gemini API key is missing.");
    }

    const url =
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
        parts.push({ text: userText });
    }

    const history = conversation
        .slice(-CONFIG.MAX_HISTORY)
        .map(item => ({
            role: item.role,
            parts: [{ text: item.text }]
        }));

    const contents = [
        ...history,
        {
            role: "user",
            parts: parts
        }
    ];

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            system_instruction: {
                parts: [{
                    text:
                        "You are J.A.R.V.I.S., a helpful AI assistant. " +
                        "Answer clearly, politely and quickly. " +
                        "Call the user Boss when appropriate."
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
        throw new Error(
            data.error?.message || "Gemini API request failed."
        );
    }

    const answer = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!answer) {
        throw new Error("Gemini returned an empty response.");
    }

    return answer;
}

// ==========================================
// 8. SEND MESSAGE
// ==========================================

async function sendMessage() {

    if (isProcessing || !input) return;

    const text = input.value.trim();

    if (!text && !selectedImage) return;

    if (!apiKey && !setupAPIKey()) return;

    isProcessing = true;

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = "WAIT";
    }

    if (text) {
        addMessage("YOU: " + text, "user");
    } else if (selectedImage) {
        addMessage("YOU: Analyze this image.", "user");
    }

    input.value = "";

    const loading = addMessage(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        let imageData = null;

        if (selectedImage) {
            imageData = await convertImage(selectedImage);
        }

        const answer = await askGemini(text, imageData);

        if (loading) {
            loading.textContent = "J.A.R.V.I.S: " + answer;
        }

        if (text || imageData) {
            conversation.push({
                role: "user",
                text: text || "Analyze this image."
            });
        }

        conversation.push({
            role: "model",
            text: answer
        });

        saveMemory();

        speak(answer);

        selectedImage = null;

    } catch (error) {

        console.error("JARVIS ERROR:", error);

        if (loading) {
            loading.textContent =
                "J.A.R.V.I.S ERROR: " + error.message;
        }

    } finally {

        isProcessing = false;

        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = "SEND";
        }

        if (input) input.focus();
    }
}

// ==========================================
// 9. IMAGE CONVERSION
// ==========================================

function convertImage(file) {

    return new Promise((resolve, reject) => {

        if (!file || !file.type.startsWith("image/")) {
            reject(new Error("Please select a valid image."));
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            reject(new Error("Image must be smaller than 5 MB."));
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {

            const result = reader.result;

            resolve({
                type: file.type,
                data: result.split(",")[1]
            });
        };

        reader.onerror = () => {
            reject(new Error("Unable to read image."));
        };

        reader.readAsDataURL(file);
    });
}

// ==========================================
// 10. CAMERA / IMAGE
// ==========================================

if (cameraBtn && imageInput) {

    cameraBtn.addEventListener("click", () => {
        imageInput.click();
    });

    imageInput.addEventListener("change", event => {

        const file = event.target.files?.[0];

        if (!file) return;

        selectedImage = file;

        addMessage(
            "J.A.R.V.I.S: Image selected. Enter a question or press SEND.",
            "ai"
        );
    });
}

// ==========================================
// 11. VOICE INPUT
// ==========================================

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

if (micBtn) {

    if (SpeechRecognition) {

        const recognition = new SpeechRecognition();

        recognition.lang = "en-IN";
        recognition.continuous = false;
        recognition.interimResults = false;

        micBtn.addEventListener("click", () => {

            try {
                recognition.start();
                micBtn.textContent = "LISTENING...";
            } catch (error) {
                console.warn("Microphone:", error);
            }

        });

        recognition.onresult = event => {

            const transcript =
                event.results[0][0].transcript;

            input.value = transcript;

            micBtn.textContent = "MIC";

            sendMessage();
        };

        recognition.onerror = () => {
            micBtn.textContent = "MIC";
            addMessage(
                "J.A.R.V.I.S: Microphone error. Check permission.",
                "ai"
            );
        };

        recognition.onend = () => {
            micBtn.textContent = "MIC";
        };

    } else {

        micBtn.addEventListener("click", () => {
            addMessage(
                "J.A.R.V.I.S: Voice recognition is not supported in this browser.",
                "ai"
            );
        });
    }
}

// ==========================================
// 12. SEND BUTTON
// ==========================================

if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
}

if (input) {

    input.addEventListener("keydown", event => {

        if (event.key === "Enter" && !event.shiftKey) {

            event.preventDefault();

            sendMessage();
        }
    });
}

// ==========================================
// 13. VOICE CONTROL COMMANDS
// ==========================================

function stopVoice() {

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }
}

// ==========================================
// 14. CLEAR CHAT
// ==========================================

function clearChat() {

    conversation = [];

    saveMemory();

    if (chat) {
        chat.innerHTML = "";
    }

    addMessage(
        "J.A.R.V.I.S: Chat memory cleared. Systems online.",
        "ai"
    );
}

// ==========================================
// 15. CHANGE API KEY
// ==========================================

function changeAPIKey() {

    const newKey = prompt("Enter your new Gemini API key:");

    if (!newKey || !newKey.trim()) return;

    apiKey = newKey.trim();

    localStorage.setItem(CONFIG.STORAGE_KEY, apiKey);

    addMessage(
        "J.A.R.V.I.S: API key updated.",
        "ai"
    );
}

// ==========================================
// 16. INITIALIZATION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    console.log("J.A.R.V.I.S SYSTEM INITIALIZED");

});

if (chat) {

    if (!apiKey) {
        setupAPIKey();
    }

    addMessage(
        "J.A.R.V.I.S: Systems online. How may I assist you, Boss?",
        "ai"
    );

}

