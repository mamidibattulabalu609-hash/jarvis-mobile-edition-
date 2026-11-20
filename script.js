/* ==========================================
   J.A.R.V.I.S. FAST ASSISTANT
   Startup API Key + Gemini + Voice
========================================== */

// ===== 1. STARTUP: ASK FOR API KEY =====

let API_KEY = "";

function getAPIKey() {
    const key = prompt(
        "J.A.R.V.I.S.\n\nEnter your Gemini API key to start:"
    );

    if (!key || !key.trim()) {
        alert("API key required. JARVIS is not started.");
        return false;
    }

    API_KEY = key.trim();
    return true;
}

const JARVIS_READY = getAPIKey();

// ===== 2. FAST MODELS =====

const MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash"
];

// ===== 3. HTML ELEMENTS =====

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const micBtn = document.getElementById("mic-btn");
const sendBtn = document.getElementById("send");

let busy = false;

// ===== 4. CHAT DISPLAY =====

function add(text, type) {
    if (!chat) return null;

    const div = document.createElement("div");
    div.className = "msg " + type;
    div.textContent = text;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;

    return div;
}

// ===== 5. GEMINI ENGINE =====

async function callGemini(promptText) {
    if (!JARVIS_READY || !API_KEY) {
        throw new Error("API key not entered.");
    }

    let lastError = null;

    for (const model of MODELS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    signal: controller.signal,
                    body: JSON.stringify({
                        contents: [{
                            role: "user",
                            parts: [{ text: promptText }]
                        }],
                        generationConfig: {
                            maxOutputTokens: 256
                        }
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                const errorMessage =
                    data?.error?.message || "HTTP " + response.status;

                if ([400, 401, 403].includes(response.status)) {
                    throw new Error(errorMessage);
                }

                lastError = new Error(errorMessage);
                continue;
            }

            const reply = data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

            if (reply) return reply;

            lastError = new Error("Empty AI response.");

        } catch (error) {
            lastError = error.name === "AbortError"
                ? new Error(model + " timed out.")
                : error;

            if (/API.?key|400|401|403/i.test(error.message || "")) {
                throw error;
            }

        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError || new Error("All models failed.");
}

// ===== 6. ASK JARVIS =====

async function askGemini(promptText) {
    if (!JARVIS_READY || busy) return;

    busy = true;

    if (sendBtn) sendBtn.disabled = true;

    const message = add("J.A.R.V.I.S: Thinking...", "ai");

    try {
        const reply = await callGemini(promptText);

        if (message) {
            message.textContent = "J.A.R.V.I.S: " + reply;
        }

        speak(reply);

    } catch (error) {
        if (message) {
            message.textContent =
                "J.A.R.V.I.S: " + error.message;
        }

        console.error("JARVIS error:", error);

    } finally {
        busy = false;

        if (sendBtn) sendBtn.disabled = false;

        if (chat) chat.scrollTop = chat.scrollHeight;
    }
}

// ===== 7. SEND BUTTON =====

if (sendBtn && input) {
    sendBtn.onclick = () => {
        const text = input.value.trim();

        if (!text || busy || !JARVIS_READY) return;

        add("YOU: " + text, "user");
        input.value = "";

        askGemini(text);
    };

    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendBtn.click();
        }
    });
}

// ===== 8. MICROPHONE =====

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let recognition = null;

if (SpeechRecognition && micBtn) {
    recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = event => {
        const text = event.results[0][0].transcript.trim();

        if (!text || !JARVIS_READY) return;

        add("YOU: " + text, "user");
        askGemini(text);
    };

    recognition.onerror = event => {
        console.error("Microphone:", event.error);
        micBtn.textContent = "🎙️";
    };

    recognition.onend = () => {
        micBtn.textContent = "🎙️";
    };

    micBtn.onclick = () => {
        if (!JARVIS_READY || busy) return;

        try {
            recognition.start();
            micBtn.textContent = "Listening...";
        } catch (error) {
            console.warn(error);
        }
    };
}

// ===== 9. VOICE REPLY =====

function speak(text) {
    if (!window.speechSynthesis) return;

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.pitch = 0.9;

    speechSynthesis.speak(utterance);
}

// ===== 10. STARTUP =====

if (JARVIS_READY) {
    console.log("J.A.R.V.I.S. is ready.");
    add("J.A.R.V.I.S: Systems online. How can I help?", "ai");
} else {
    console.log("J.A.R.V.I.S. startup cancelled.");
}
