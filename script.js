/* ==========================================
   J.A.R.V.I.S. PERSONAL AI ASSISTANT
   Gemini AI + Voice + Text Chat
========================================== */

// ===== 1. API KEY =====

let API_KEY = localStorage.getItem("jarvis_key");

if (!API_KEY) {
    API_KEY = prompt("Enter your Gemini API Key:");

    if (API_KEY) {
        localStorage.setItem("jarvis_key", API_KEY.trim());
        API_KEY = API_KEY.trim();
    }
}

// ===== 2. MODEL LIST =====

const MODELS = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash-lite"
];

// ===== 3. HTML ELEMENTS =====

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const micBtn = document.getElementById("mic-btn");
const sendBtn = document.getElementById("send");

// Check required elements

if (!chat || !input || !micBtn || !sendBtn) {
    console.error("JARVIS: Required HTML elements missing.");
}

// ===== 4. ADD MESSAGE =====

function add(message, type) {
    const div = document.createElement("div");

    div.className = "msg " + type;
    div.innerText = message;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;

    return div;
}

// ===== 5. GEMINI AI ENGINE =====

async function callGemini(promptText) {

    if (!API_KEY) {
        throw new Error("Gemini API key is missing.");
    }

    let lastError = null;

    for (const model of MODELS) {

        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, 20000);

        try {

            console.log("Trying Gemini model:", model);

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
                            parts: [{
                                text: promptText
                            }]
                        }],

                        generationConfig: {
                            maxOutputTokens: 512,
                            temperature: 0.7
                        }
                    })
                }
            );

            const data = await response.json();

            // API error handling

            if (!response.ok) {

                const errorMessage =
                    data?.error?.message ||
                    `HTTP ${response.status}`;

                console.error(
                    model + " API error:",
                    errorMessage
                );

                // Key or request error:
                // stop trying other models

                if (
                    response.status === 400 ||
                    response.status === 401 ||
                    response.status === 403
                ) {
                    throw new Error(errorMessage);
                }

                // Other errors: try backup model

                lastError = new Error(
                    `${model}: ${errorMessage}`
                );

                continue;
            }

            // Extract response text

            const reply =
                data.candidates?.[0]?.content?.parts
                    ?.map(part => part.text || "")
                    .join("")
                    .trim();

            if (!reply) {

                lastError = new Error(
                    model + " returned an empty response."
                );

                console.warn(lastError.message);

                continue;
            }

            console.log(
                "JARVIS connected successfully using:",
                model
            );

            return reply;

        } catch (error) {

            lastError = error;

            if (error.name === "AbortError") {

                console.warn(
                    model + " timed out after 20 seconds."
                );

                lastError = new Error(
                    model + " timed out."
                );

            } else {

                console.error(
                    model + " failed:",
                    error.message
                );
            }

            // Stop for key or request problems

            if (
                error.message.includes("API key") ||
                error.message.includes("API_KEY") ||
                error.message.includes("400") ||
                error.message.includes("401") ||
                error.message.includes("403")
            ) {
                throw error;
            }

            // Otherwise try the next model

        } finally {

            clearTimeout(timeout);
        }
    }

    throw new Error(
        "All Gemini models failed. Please try again. " +
        (lastError?.message || "")
    );
}

// ===== 6. ASK JARVIS =====

async function askGemini(promptText) {

    const message = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        const reply = await callGemini(promptText);

        message.innerText =
            "J.A.R.V.I.S: " + reply;

        chat.scrollTop = chat.scrollHeight;

        speak(reply);

    } catch (error) {

        message.innerText =
            "J.A.R.V.I.S: ERROR - " +
            error.message;

        console.error("JARVIS error:", error);
    }
}

// ===== 7. TEXT SEND BUTTON =====

sendBtn.onclick = () => {

    const text = input.value.trim();

    if (!text) return;

    add("YOU: " + text, "user");

    input.value = "";

    askGemini(text);
};

// ENTER KEY SUPPORT

input.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {

        event.preventDefault();

        sendBtn.click();
    }

});

// ===== 8. SPEECH RECOGNITION =====

const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let rec = null;

if (SR) {

    rec = new SR();

    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (event) => {

        const text =
            event.results[0][0].transcript.trim();

        if (!text) return;

        add("YOU: " + text, "user");

        askGemini(text);
    };

    rec.onerror = (event) => {

        console.error(
            "Microphone error:",
            event.error
        );

        micBtn.innerText = "🎙️";
    };

    rec.onend = () => {

        micBtn.innerText = "🎙️";
    };

    micBtn.onclick = () => {

        try {

            rec.start();

            micBtn.innerText = "LISTENING...";

        } catch (error) {

            console.error(
                "Microphone start error:",
                error
            );
        }
    };

} else {

    micBtn.onclick = () => {

        alert(
            "Speech recognition is not supported in this browser."
        );
    };
}

// ===== 9. TEXT TO SPEECH =====

let voices = [];

function loadVoices() {

    if ("speechSynthesis" in window) {

        voices = speechSynthesis.getVoices();
    }
}

if ("speechSynthesis" in window) {

    loadVoices();

    speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {

    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();

    const utterance =
        new SpeechSynthesisUtterance(text);

    utterance.rate = 1.05;
    utterance.pitch = 0.85;

    const voice = voices.find(v =>
        v.lang.toLowerCase().startsWith("en")
    );

    if (voice) {

        utterance.voice = voice;
    }

    speechSynthesis.speak(utterance);
}

// ===== 10. SYSTEM STARTUP =====

console.log("J.A.R.V.I.S. SYSTEM ONLINE");

if (navigator.onLine) {

    console.log("Internet connection available.");

} else {

    console.log("No internet connection.");
}

window.addEventListener("online", () => {

    console.log("Internet connected.");
});
window.addEventListener("offline", () => {

    console.log("Internet disconnected.");
});
window.addEventListener("offline", () => {

    console.log("Internet disconnected.");
});
