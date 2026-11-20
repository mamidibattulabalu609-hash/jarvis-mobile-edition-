// =============================================
// J.A.R.V.I.S. MOBILE AI
// Text + Voice + Camera + Memory
// =============================================

// ========== 1. API KEY ==========

const SAVED_KEY = localStorage.getItem("jarvis_key") || "";

const enteredKey = prompt(
    "J.A.R.V.I.S. ONLINE\n\nEnter your Gemini API Key:"
);

let API_KEY = (enteredKey || SAVED_KEY).trim();

if (API_KEY) {
    localStorage.setItem("jarvis_key", API_KEY);
} else {
    alert("API key missing. AI features cannot work.");
}

// ========== 2. MODELS ==========

const MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash"
];

const REQUEST_TIMEOUT = 25000;

// ========== 3. MEMORY ==========

let MEMORY = [];

try {
    MEMORY = JSON.parse(
        localStorage.getItem("jarvis_memory") || "[]"
    );
} catch (e) {
    MEMORY = [];
}

function saveMemory() {
    localStorage.setItem(
        "jarvis_memory",
        JSON.stringify(MEMORY)
    );
}

// ========== 4. ELEMENTS ==========

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");

// ========== 5. LOAD MEMORY ==========

MEMORY.forEach(function (m) {
    add(
        (m.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") +
        m.text,
        m.role === "user" ? "user" : "ai"
    );
});

// ========== 6. GEMINI REQUEST ==========

async function geminiRequest(contents, model) {

    const controller = new AbortController();

    const timeout = setTimeout(function () {
        controller.abort();
    }, REQUEST_TIMEOUT);

    try {

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/" +
            model +
            ":generateContent",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": API_KEY
                },

                body: JSON.stringify({
                    contents: contents,

                    generationConfig: {
                        maxOutputTokens: 400
                    }
                }),

                signal: controller.signal
            }
        );

        const data = await response.json();

        if (!response.ok) {

            const message =
                data.error?.message ||
                "HTTP error " + response.status;

            throw new Error(
                "Gemini API (" + response.status + "): " + message
            );
        }

        const answer =
            data.candidates?.[0]?.content?.parts
                ?.map(function (part) {
                    return part.text || "";
                })
                .join("");

        if (!answer) {
            throw new Error("Gemini returned an empty answer.");
        }

        return answer;

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error(
                "Request timed out. Check internet and try again."
            );
        }

        if (error instanceof TypeError) {
            throw new Error(
                "Network connection failed. Check internet, API key restrictions, or try again."
            );
        }

        throw error;

    } finally {

        clearTimeout(timeout);
    }
}

// ========== 7. AI BRAIN ==========

async function callGemini(promptText) {

    if (!API_KEY) {
        throw new Error("API key missing.");
    }

    const contents = MEMORY.slice(-10).map(function (m) {
        return {
            role: m.role,
            parts: [{ text: m.text }]
        };
    });

    contents.push({
        role: "user",
        parts: [{ text: promptText }]
    });

    let lastError;

    for (let i = 0; i < MODELS.length; i++) {

        try {

            return await geminiRequest(
                contents,
                MODELS[i]
            );

        } catch (error) {

            lastError = error;

            console.warn(
                "Gemini model error:",
                MODELS[i],
                error.message
            );

            // Fallback only for model/API errors.
            // Do not repeat a failed network request.
            if (
                error.message.includes("Network connection") ||
                error.message.includes("timed out")
            ) {
                throw error;
            }
        }
    }

    throw lastError || new Error("AI request failed.");
}

// ========== 8. CHAT ==========

async function askGemini(promptText) {

    const thinking = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        const reply = await callGemini(promptText);

        MEMORY.push(
            { role: "user", text: promptText },
            { role: "model", text: reply }
        );

        if (MEMORY.length > 40) {
            MEMORY = MEMORY.slice(-40);
        }

        saveMemory();

        thinking.innerText =
            "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {

        thinking.innerText =
            "J.A.R.V.I.S: ERROR - " + error.message;

        console.error(error);
    }
}

// ========== 9. CAMERA INPUT ==========

if (camBtn && imgInput) {

    camBtn.onclick = function () {
        imgInput.click();
    };

    imgInput.onchange = async function () {

        const file = imgInput.files?.[0];

        if (!file) return;

        const thinking = add(
            "J.A.R.V.I.S: Preparing photo...",
            "ai"
        );

        try {

            if (!file.type.startsWith("image/")) {
                throw new Error("Selected file is not an image.");
            }

            // Read photo
            const objectURL = URL.createObjectURL(file);
            const image = new Image();

            image.src = objectURL;

            await new Promise(function (resolve, reject) {
                image.onload = resolve;
                image.onerror = reject;
            });

            // Resize large photo
            const MAX = 1024;

            let width = image.width;
            let height = image.height;

            if (Math.max(width, height) > MAX) {

                const scale = MAX / Math.max(width, height);

                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }

            const canvas = document.createElement("canvas");

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");

            ctx.drawImage(image, 0, 0, width, height);

            URL.revokeObjectURL(objectURL);

            // Convert photo to JPEG
            const jpeg = canvas.toDataURL(
                "image/jpeg",
                0.75
            );

            const base64 = jpeg.split(",")[1];

            const question =
                input.value.trim() ||
                "Describe what you see in this photo.";

            input.value = "";

            add("YOU: [PHOTO] " + question, "user");

            thinking.innerText =
                "J.A.R.V.I.S: Analyzing photo...";

            // Send to Gemini
            const reply = await callVisionGemini(
                base64,
                "image/jpeg",
                question
            );

            thinking.innerText =
                "J.A.R.V.I.S: " + reply;

            MEMORY.push(
                { role: "user", text: "[Photo] " + question },
                { role: "model", text: reply }
            );

            if (MEMORY.length > 40) {
                MEMORY = MEMORY.slice(-40);
            }

            saveMemory();

            speak(reply);

        } catch (error) {

            console.error("Camera error:", error);

            thinking.innerText =
                "J.A.R.V.I.S: PHOTO ERROR - " +
                error.message;

        } finally {

            imgInput.value = "";
        }
    };
}

// ========== 10. IMAGE AI ==========

async function callVisionGemini(
    base64,
    mimeType,
    question
) {

    const contents = [
        {
            role: "user",
            parts: [
                { text: question },

                {
                    inline_data: {
                        mime_type: mimeType,
                        data: base64
                    }
                }
            ]
        }
    ];

    let lastError;

    for (let i = 0; i < MODELS.length; i++) {

        try {

            return await geminiRequest(
                contents,
                MODELS[i]
            );

        } catch (error) {

            lastError = error;

            console.warn(
                "Image model error:",
                MODELS[i],
                error.message
            );

            if (
                error.message.includes("Network connection") ||
                error.message.includes("timed out")
            ) {
                throw error;
            }
        }
    }

    throw lastError || new Error("Image analysis failed.");
}

// ========== 11. MICROPHONE ==========

const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

if (SR && micBtn) {

    const recognition = new SR();

    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = function (event) {

        const text =
            event.results[0][0].transcript;

        add("YOU: " + text, "user");

        askGemini(text);
    };

    recognition.onerror = function (event) {

        console.error("Mic error:", event.error);

        micBtn.innerText = "🎙️";
    };

    recognition.onend = function () {
        micBtn.innerText = "🎙️";
    };

    micBtn.onclick = function () {

        try {
            recognition.start();
            micBtn.innerText = "LISTENING...";
        } catch (e) {
            console.log(e);
        }
    };

} else if (micBtn) {

    micBtn.innerText = "MIC UNAVAILABLE";
}

// ========== 12. VOICE RESPONSE ==========

let voices = [];

function loadVoices() {
    voices = speechSynthesis.getVoices();
}

loadVoices();

speechSynthesis.onvoiceschanged = loadVoices;

function speak(text) {

    if (!window.speechSynthesis) return;

    speechSynthesis.cancel();

    const utterance =
        new SpeechSynthesisUtterance(text);

    utterance.rate = 1.0;
    utterance.pitch = 0.85;
    utterance.volume = 1;

    const voice = voices.find(function (v) {
        return v.lang.startsWith("en");
    });

    if (voice) {
        utterance.voice = voice;
    }

    speechSynthesis.speak(utterance);
}

// ========== 13. SEND BUTTON ==========

if (sendBtn) {

    sendBtn.onclick = function () {

        const text = input.value.trim();

        if (!text) return;

        add("YOU: " + text, "user");

        input.value = "";

        askGemini(text);
    };
}

// ========== 14. ENTER KEY ==========

if (input) {

    input.addEventListener("keydown", function (event) {

        if (event.key === "Enter") {

            event.preventDefault();

            sendBtn?.click();
        }
    });
}

// ========== 15. CLEAR MEMORY ==========

if (clearBtn) {

    clearBtn.onclick = function () {

        MEMORY = [];

        saveMemory();

        chat.innerHTML = "";

        add("SYSTEM: Memory cleared.", "ai");
    };
}

// ========== 16. CHAT DISPLAY ==========

function add(text, who) {

    const div = document.createElement("div");

    div.className = "msg " + who;
    div.innerText = text;

    chat.appendChild(div);

    chat.scrollTop = chat.scrollHeight;

    return div;
}

// ========== 17. SYSTEM STATUS ==========

const systemStatus =
    document.getElementById("system-status");

if (systemStatus) {

    systemStatus.innerText = API_KEY
        ? "SYSTEM ONLINE"
        : "API KEY REQUIRED";
}
