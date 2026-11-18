
/* =========================================
   J.A.R.V.I.S AI ASSISTANT
   Gemini + Memory + Voice + Vision
   Corrected Version
========================================= */

// 1. API KEY
let API_KEY = localStorage.getItem("jarvis_key");

if (!API_KEY) {
    API_KEY = prompt("Enter your Gemini API Key:");

    if (API_KEY) {
        API_KEY = API_KEY.trim();
        localStorage.setItem("jarvis_key", API_KEY);
    }
}

// 2. GEMINI MODELS
const MODELS = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite"
];

// 3. HTML ELEMENTS
const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");

// 4. MEMORY
let MEMORY = [];

try {
    const saved = JSON.parse(
        localStorage.getItem("jarvis_memory") || "[]"
    );

    MEMORY = Array.isArray(saved)
        ? saved.filter(m =>
            m &&
            ["user", "model"].includes(m.role) &&
            typeof m.text === "string"
          )
        : [];

} catch {
    MEMORY = [];
}

function saveMemory() {
    try {
        localStorage.setItem(
            "jarvis_memory",
            JSON.stringify(MEMORY.slice(-50))
        );
    } catch (error) {
        console.error("Memory save error:", error);
    }
}

// 5. CHAT DISPLAY
function add(text, type) {

    const div = document.createElement("div");

    div.className = "msg " + type;
    div.innerText = text;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;

    return div;
}

// DISPLAY OLD CHAT
MEMORY.forEach(m => {
    add(
        (m.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") + m.text,
        m.role === "user" ? "user" : "ai"
    );
});

// 6. DELAY FUNCTION
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 7. GEMINI API ENGINE
async function requestGemini(contents, imageMode = false) {

    if (!API_KEY) {
        throw new Error("API key missing. Reload and enter your key.");
    }

    let lastError;

    for (const model of MODELS) {

        // Retry temporary server overloads
        for (let attempt = 0; attempt < 2; attempt++) {

            try {

                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-goog-api-key": API_KEY
                        },
                        body: JSON.stringify({
                            contents,
                            generationConfig: {
                                maxOutputTokens: 2048
                            }
                        })
                    }
                );

                const data = await response.json();

                if (!response.ok) {

                    const error = new Error(
                        data.error?.message ||
                        `Gemini error: ${response.status}`
                    );

                    error.status = response.status;

                    throw error;
                }

                const candidate = data.candidates?.[0];

                const reply = candidate?.content?.parts
                    ?.map(p => p.text || "")
                    .join("")
                    .trim();

                if (!reply) {
                    throw new Error(
                        candidate?.finishReason
                            ? "Gemini stopped: " + candidate.finishReason
                            : "Gemini returned an empty response."
                    );
                }

                console.log("J.A.R.V.I.S connected:", model);

                return reply;

            } catch (error) {

                lastError = error;

                console.error(model, error);

                // Invalid key or invalid request: stop
                if ([400, 401, 403].includes(error.status)) {
                    throw error;
                }

                // Retry temporary overload
                if (
                    [429, 500, 502, 503, 504].includes(error.status)
                    && attempt === 0
                ) {
                    await wait(1500);
                    continue;
                }

                // Try next model
                break;
            }
        }
    }

    throw lastError || new Error("All Gemini models failed.");
}

// 8. NORMAL CHAT
async function askGemini(question) {

    const message = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        const history = MEMORY.slice(-12).map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

        history.push({
            role: "user",
            parts: [{ text: question }]
        });

        const reply = await requestGemini(history);

        MEMORY.push(
            { role: "user", text: question },
            { role: "model", text: reply }
        );

        MEMORY = MEMORY.slice(-50);

        saveMemory();

        message.innerText = "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {

        message.innerText =
            "J.A.R.V.I.S ERROR: " + getErrorMessage(error);

        console.error(error);
    }
}

// 9. ERROR MESSAGES
function getErrorMessage(error) {

    if (!navigator.onLine) {
        return "Internet connection unavailable.";
    }

    if (error.status === 400) {
        return "Invalid request. Check your API request.";
    }

    if (error.status === 401 || error.status === 403) {
        return "API key invalid or API access denied. Check your Gemini API settings.";
    }

    if (error.status === 404) {
        return "Gemini model not found. Check the model name.";
    }

    if (error.status === 429) {
        return "Gemini quota or rate limit reached. Please try later.";
    }

    if ([500, 502, 503, 504].includes(error.status)) {
        return "Gemini servers are busy. Please try again later.";
    }

    return error.message || "Unknown error.";
}

// 10. IMAGE RECOGNITION
if (camBtn && imgInput) {

    camBtn.onclick = () => imgInput.click();

    imgInput.onchange = async () => {

        const file = imgInput.files?.[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please select an image.");
            imgInput.value = "";
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert("Image must be smaller than 10 MB.");
            imgInput.value = "";
            return;
        }

        const reader = new FileReader();

        reader.onload = async () => {

            try {

                const base64 = reader.result.split(",")[1];

                const question =
                    input.value.trim() ||
                    "Describe what you see in this image.";

                input.value = "";

                add("YOU: [IMAGE] " + question, "user");

                await askVision(
                    base64,
                    file.type,
                    question
                );

            } catch (error) {
                add("IMAGE ERROR: " + error.message, "ai");
            }

            imgInput.value = "";
        };

        reader.onerror = () => {
            add("IMAGE ERROR: Cannot read image.", "ai");
            imgInput.value = "";
        };

        reader.readAsDataURL(file);
    };
}

// 11. VISION ENGINE
async function askVision(base64, mime, question) {

    const message = add(
        "J.A.R.V.I.S: Analyzing image...",
        "ai"
    );

    try {

        const reply = await requestGemini([
            {
                role: "user",
                parts: [
                    { text: question },
                    {
                        inlineData: {
                            mimeType: mime,
                            data: base64
                        }
                    }
                ]
            }
        ], true);

        MEMORY.push(
            { role: "user", text: "[Image] " + question },
            { role: "model", text: reply }
        );

        MEMORY = MEMORY.slice(-50);

        saveMemory();

        message.innerText = "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {

        message.innerText =
            "J.A.R.V.I.S ERROR: " + getErrorMessage(error);

        console.error(error);
    }
}

// 12. VOICE INPUT
const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let recognition = null;

if (SR && micBtn) {

    recognition = new SR();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        micBtn.innerText = "LISTENING...";
    };

    recognition.onresult = event => {

        const spokenText =
            event.results[0][0].transcript.trim();

        if (!spokenText) return;

        add("YOU: " + spokenText, "user");

        askGemini(spokenText);
    };

    recognition.onerror = event => {

        console.error("Voice input:", event.error);

        add(
            "VOICE ERROR: " + event.error,
            "ai"
        );
    };

    recognition.onend = () => {
        micBtn.innerText = "🎙️";
    };

    micBtn.onclick = () => {

        try {
            recognition.start();
        } catch (error) {
            console.error("Microphone:", error);
        }
    };

} else if (micBtn) {

    micBtn.onclick = () => {
        alert("Voice input is not supported. Try Chrome.");
    };
}

// 13. VOICE OUTPUT
let voices = [];

function loadVoices() {

    if (!("speechSynthesis" in window)) return;

    voices = window.speechSynthesis.getVoices();
}

if ("speechSynthesis" in window) {

    loadVoices();

    window.speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {

    if (!("speechSynthesis" in window)) {
        console.warn("Speech output not supported.");
        return;
    }

    window.speechSynthesis.cancel();

    const cleanText = text
        .replace(/[*#`_]/g, "")
        .trim();

    const utterance =
        new SpeechSynthesisUtterance(cleanText);

    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.pitch = 0.9;
    utterance.volume = 1;

    const voice = voices.find(v =>
        v.lang.toLowerCase() === "en-in"
    ) || voices.find(v =>
        v.lang.toLowerCase().startsWith("en")
    );

    if (voice) {
        utterance.voice = voice;
    }

    window.speechSynthesis.speak(utterance);
}

// 14. SEND BUTTON
if (sendBtn && input) {

    sendBtn.onclick = () => {

        const text = input.value.trim();

        if (!text) return;

        add("YOU: " + text, "user");

        input.value = "";

        askGemini(text);
    };
}

// 15. ENTER TO SEND
if (input && sendBtn) {

    input.addEventListener("keydown", event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {
            event.preventDefault();
            sendBtn.click();
        }
    });
}

// 16. CLEAR MEMORY
if (clearBtn) {

    clearBtn.onclick = () => {

        MEMORY = [];

        saveMemory();

        chat.innerHTML = "";

        add("SYSTEM: Memory cleared.", "ai");

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }
    };
}

// 17. SYSTEM STATUS
console.log("J.A.R.V.I.S SYSTEM INITIALIZED");

if (!API_KEY) {
    console.warn("Gemini API key not configured.");
}

if (!SR) {
    console.warn("Speech recognition unavailable.");
}

if (!("speechSynthesis" in window)) {
    console.warn("Speech synthesis unavailable.");
           }
