// ==========================================
// J.A.R.V.I.S. AI ASSISTANT
// Gemini + Voice + Camera + Memory
// ==========================================

// ===== 1. API KEY SETUP ON APP START =====

let savedKey = localStorage.getItem("jarvis_key") || "";

let enteredKey = prompt(
    "J.A.R.V.I.S. ONLINE\n\nEnter your Gemini API Key:"
);

let API_KEY = enteredKey && enteredKey.trim()
    ? enteredKey.trim()
    : savedKey;

if (API_KEY) {
    localStorage.setItem("jarvis_key", API_KEY);
} else {
    alert("No API key entered. J.A.R.V.I.S. AI will not work until you enter a key.");
}

// ===== 2. GEMINI MODELS =====

const MODELS = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite"
];

// ===== 3. MEMORY SYSTEM =====

let MEMORY = JSON.parse(
    localStorage.getItem("jarvis_memory") || "[]"
);

function saveMemory() {
    localStorage.setItem(
        "jarvis_memory",
        JSON.stringify(MEMORY)
    );
}

// ===== 4. HTML ELEMENTS =====

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");

// ===== 5. LOAD PREVIOUS MEMORY =====

MEMORY.forEach(function (m) {
    add(
        (m.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") + m.text,
        m.role === "user" ? "user" : "ai"
    );
});

// ===== 6. GEMINI AI ENGINE =====

async function callGemini(promptText) {

    if (!API_KEY) {
        throw new Error("Gemini API key is missing. Reload the app and enter your API key.");
    }

    const contents = MEMORY.slice(-12).map(function (m) {
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

    for (const model of MODELS) {

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
                        contents: contents
                    })
                }
            );

            const data = await response.json();

            if (!response.ok || data.error) {

                lastError = new Error(
                    data.error?.message || "HTTP error " + response.status
                );

                // Try another model for model availability,
                // quota, or temporary service errors.
                if (
                    response.status === 429 ||
                    response.status === 503 ||
                    response.status === 404 ||
                    response.status === 500
                ) {
                    continue;
                }

                throw lastError;
            }

            const reply =
                data.candidates?.[0]?.content?.parts
                    ?.map(part => part.text || "")
                    .join("");

            if (!reply) {
                throw new Error("Gemini returned an empty response.");
            }

            return reply;

        } catch (error) {

            lastError = error;

            if (error instanceof TypeError) {
                continue;
            }
        }
    }

    throw lastError || new Error("All Gemini models failed.");
}

// ===== 7. CHAT WITH JARVIS =====

async function askGemini(promptText) {

    const thinkingMessage = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        const reply = await callGemini(promptText);

        MEMORY.push({
            role: "user",
            text: promptText
        });

        MEMORY.push({
            role: "model",
            text: reply
        });

        saveMemory();

        thinkingMessage.innerText =
            "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {

        thinkingMessage.innerText =
            "J.A.R.V.I.S: ERROR - " + error.message;

        console.error("Gemini Error:", error);
    }
}

// ===== 8. CAMERA / IMAGE VISION =====

if (camBtn && imgInput) {

    camBtn.onclick = function () {
        imgInput.click();
    };

    imgInput.onchange = function () {

        const file = imgInput.files[0];

        if (!file) return;

        const reader = new FileReader();

        reader.onload = function () {

            const base64 = reader.result.split(",")[1];

            const question =
                input.value.trim() ||
                "What do you see in this image? Describe it briefly.";

            add("YOU: [IMAGE] " + question, "user");

            input.value = "";

            askVision(base64, file.type, question);
        };

        reader.readAsDataURL(file);
    };
}

async function askVision(base64, mimeType, question) {

    const thinkingMessage = add(
        "J.A.R.V.I.S: Analyzing image...",
        "ai"
    );

    if (!API_KEY) {
        thinkingMessage.innerText =
            "J.A.R.V.I.S: ERROR - API key is missing.";
        return;
    }

    let lastError;

    for (const model of MODELS) {

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
                        contents: [
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
                        ]
                    })
                }
            );

            const data = await response.json();

            if (!response.ok || data.error) {

                lastError = new Error(
                    data.error?.message || "HTTP error " + response.status
                );

                if (
                    response.status === 429 ||
                    response.status === 503 ||
                    response.status === 404 ||
                    response.status === 500
                ) {
                    continue;
                }

                throw lastError;
            }

            const reply =
                data.candidates?.[0]?.content?.parts
                    ?.map(part => part.text || "")
                    .join("");

            if (!reply) {
                throw new Error("No image analysis response.");
            }

            thinkingMessage.innerText =
                "J.A.R.V.I.S: " + reply;

            speak(reply);

            // Save image question and response to memory
            MEMORY.push({
                role: "user",
                text: "[Image] " + question
            });

            MEMORY.push({
                role: "model",
                text: reply
            });

            saveMemory();

            return;

        } catch (error) {

            lastError = error;

            if (error instanceof TypeError) {
                continue;
            }
        }
    }

    thinkingMessage.innerText =
        "J.A.R.V.I.S: ERROR - " +
        (lastError?.message || "Image analysis failed.");

    console.error("Vision Error:", lastError);
}

// ===== 9. MICROPHONE / SPEECH RECOGNITION =====

const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

if (SR && micBtn) {

    const rec = new SR();

    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = function (event) {

        const spokenText =
            event.results[0][0].transcript;

        add("YOU: " + spokenText, "user");

        askGemini(spokenText);
    };

    rec.onerror = function (event) {

        console.error("Microphone Error:", event.error);

        micBtn.innerText = "🎙️";
    };

    micBtn.onclick = function () {

        try {
            rec.start();
            micBtn.innerText = "LISTENING...";
        } catch (error) {
            console.log(error);
        }
    };

    rec.onend = function () {
        micBtn.innerText = "🎙️";
    };

} else if (micBtn) {

    micBtn.innerText = "MIC UNAVAILABLE";
}

// ===== 10. JARVIS VOICE =====

let voices = [];

function loadVoices() {
    voices = speechSynthesis.getVoices();
}

loadVoices();

speechSynthesis.onvoiceschanged = loadVoices;

function speak(text) {

    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = 1.05;
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

// ===== 11. SEND MESSAGE BUTTON =====

if (sendBtn) {

    sendBtn.onclick = function () {

        const text = input.value.trim();

        if (!text) return;

        add("YOU: " + text, "user");

        input.value = "";

        askGemini(text);
    };
}

// ===== 12. ENTER KEY TO SEND =====

if (input) {

    input.addEventListener("keydown", function (event) {

        if (event.key === "Enter") {
            event.preventDefault();

            if (sendBtn) {
                sendBtn.click();
            }
        }
    });
}

// ===== 13. CLEAR MEMORY BUTTON =====

if (clearBtn) {

    clearBtn.onclick = function () {

        MEMORY = [];

        saveMemory();

        chat.innerHTML = "";

        add("SYSTEM: Memory cleared.", "ai");
    };
}

// ===== 14. CHAT MESSAGE FUNCTION =====

function add(text, who) {

    const div = document.createElement("div");

    div.className = "msg " + who;
    div.innerText = text;

    chat.appendChild(div);

    chat.scrollTop = chat.scrollHeight;

    return div;
}

// ===== 15. SYSTEM STATUS =====

const systemStatus = document.getElementById("system-status");

if (systemStatus) {
    systemStatus.innerText =
        API_KEY ? "SYSTEM ONLINE" : "API KEY REQUIRED";
}
