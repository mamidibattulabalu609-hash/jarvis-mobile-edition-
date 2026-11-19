
/* =========================================
   J.A.R.V.I.S 2.0
   ULTRA FAST AI ASSISTANT
   Gemini + Streaming + Memory + Voice + Vision
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
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash"
];

// 3. SETTINGS
const SETTINGS = {
    maxOutputTokens: 512,
    memoryLimit: 40,
    historyLimit: 8,
    language: "en-IN"
};

// 4. HTML ELEMENTS
const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");

let isBusy = false;

// 5. MEMORY SYSTEM
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
        ).slice(-SETTINGS.memoryLimit)
        : [];

} catch {
    MEMORY = [];
}

function saveMemory() {
    try {
        localStorage.setItem(
            "jarvis_memory",
            JSON.stringify(MEMORY.slice(-SETTINGS.memoryLimit))
        );
    } catch (error) {
        console.error("Memory error:", error);
    }
}

function remember(question, answer) {
    MEMORY.push(
        { role: "user", text: question },
        { role: "model", text: answer }
    );

    MEMORY = MEMORY.slice(-SETTINGS.memoryLimit);

    saveMemory();
}

// 6. DISPLAY CHAT
function add(text, type) {
    const div = document.createElement("div");

    div.className = "msg " + type;
    div.innerText = text;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;

    return div;
}

// LOAD OLD CHAT
MEMORY.forEach(m => {
    add(
        (m.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") + m.text,
        m.role === "user" ? "user" : "ai"
    );
});

// 7. BUTTON STATUS
function setBusy(value) {
    isBusy = value;

    if (sendBtn) {
        sendBtn.disabled = value;
        sendBtn.innerText = value ? "WAIT..." : "SEND";
    }
}

// 8. ERROR HANDLING
function getErrorMessage(error) {
    if (!navigator.onLine) {
        return "Internet connection unavailable.";
    }

    if (error.status === 400) {
        return "Invalid Gemini request.";
    }

    if ([401, 403].includes(error.status)) {
        return "API key invalid or API access denied.";
    }

    if (error.status === 404) {
        return "Gemini model not found.";
    }

    if (error.status === 429) {
        return "API quota or rate limit reached.";
    }

    if ([500, 502, 503, 504].includes(error.status)) {
        return "Gemini server is busy. Try again.";
    }

    return error.message || "Unknown error.";
}

// 9. STREAMING GEMINI ENGINE
async function requestGemini(contents, onUpdate) {

    if (!API_KEY) {
        throw new Error("Gemini API key missing.");
    }

    let lastError;

    for (const model of MODELS) {

        let receivedText = "";

        try {

            const url =
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;

            const response = await fetch(url, {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": API_KEY
                },

                body: JSON.stringify({
                    contents,

                    generationConfig: {
                        maxOutputTokens: SETTINGS.maxOutputTokens,
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) {

                let data = {};

                try {
                    data = await response.json();
                } catch {}

                const error = new Error(
                    data.error?.message ||
                    `Gemini error: ${response.status}`
                );

                error.status = response.status;

                throw error;
            }

            if (!response.body) {
                throw new Error("Streaming is not supported by this browser.");
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let buffer = "";

            async function processLine(line) {

                line = line.trim();

                if (!line.startsWith("data:")) return;

                const jsonText = line.slice(5).trim();

                if (!jsonText || jsonText === "[DONE]") return;

                let data;

                try {
                    data = JSON.parse(jsonText);
                } catch {
                    return;
                }

                if (data.error) {
                    throw new Error(data.error.message || "Streaming error.");
                }

                const parts =
                    data.candidates?.[0]?.content?.parts || [];

                for (const part of parts) {
                    if (typeof part.text === "string") {
                        receivedText += part.text;

                        if (onUpdate) {
                            onUpdate(receivedText);
                        }
                    }
                }
            }

            while (true) {

                const { value, done } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, {
                    stream: true
                });

                const lines = buffer.split("\n");

                buffer = lines.pop() || "";

                for (const line of lines) {
                    await processLine(line);
                }
            }

            buffer += decoder.decode();

            if (buffer.trim()) {
                await processLine(buffer);
            }

            if (!receivedText.trim()) {
                throw new Error("Gemini returned an empty response.");
            }

            console.log("Connected to Gemini:", model);

            return receivedText.trim();

        } catch (error) {

            lastError = error;

            console.error(model, error);

            // Do not retry invalid API requests.
            if ([400, 401, 403].includes(error.status)) {
                throw error;
            }

            // Avoid repeating a partially received response.
            if (receivedText.length > 0) {
                throw error;
            }

            // Try the next model.
        }
    }

    throw lastError || new Error("All Gemini models failed.");
}

// 10. NORMAL AI CHAT
async function askGemini(question) {

    if (isBusy) return;

    setBusy(true);

    const message = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        // Send only recent conversation history.
        const history = MEMORY.slice(-SETTINGS.historyLimit)
            .map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            }));

        history.push({
            role: "user",
            parts: [{ text: question }]
        });

        const reply = await requestGemini(
            history,
            text => {
                message.innerText = "J.A.R.V.I.S: " + text;
                chat.scrollTop = chat.scrollHeight;
            }
        );

        remember(question, reply);

        message.innerText = "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {

        message.innerText =
            "J.A.R.V.I.S ERROR: " + getErrorMessage(error);

        console.error(error);

    } finally {
        setBusy(false);
    }
}

// 11. IMAGE RECOGNITION
if (camBtn && imgInput) {

    camBtn.onclick = () => {
        imgInput.click();
    };

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

        if (isBusy) {
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

            } finally {
                imgInput.value = "";
            }
        };

        reader.onerror = () => {
            add("IMAGE ERROR: Cannot read image.", "ai");
            imgInput.value = "";
        };

        reader.readAsDataURL(file);
    };
}

// 12. VISION ENGINE
async function askVision(base64, mime, question) {

    if (isBusy) return;

    setBusy(true);

    const message = add(
        "J.A.R.V.I.S: Analyzing image...",
        "ai"
    );

    try {

        const reply = await requestGemini(
            [{
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
            }],

            text => {
                message.innerText = "J.A.R.V.I.S: " + text;
            }
        );

        remember("[Image] " + question, reply);

        message.innerText = "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {

        message.innerText =
            "J.A.R.V.I.S ERROR: " + getErrorMessage(error);

        console.error(error);

    } finally {
        setBusy(false);
    }
}

// 13. VOICE INPUT
const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let recognition = null;

if (SR && micBtn) {

    recognition = new SR();

    recognition.lang = SETTINGS.language;
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

        console.error("Voice error:", event.error);

        add(
            "VOICE ERROR: " + event.error,
            "ai"
        );
    };

    recognition.onend = () => {
        micBtn.innerText = "🎙️";
    };

    micBtn.onclick = () => {

        if (isBusy) return;

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

// 14. VOICE OUTPUT
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

    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const cleanText = text
        .replace(/[*#`_]/g, "")
        .trim();

    if (!cleanText) return;

    const utterance =
        new SpeechSynthesisUtterance(cleanText);

    utterance.lang = SETTINGS.language;
    utterance.rate = 1.05;
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

// 15. SEND BUTTON
if (sendBtn && input) {

    sendBtn.onclick = () => {

        const question = input.value.trim();

        if (!question || isBusy) return;

        add("YOU: " + question, "user");

        input.value = "";

        askGemini(question);
    };
}

// 16. ENTER TO SEND
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

// 17. CLEAR MEMORY
if (clearBtn) {

    clearBtn.onclick = () => {

        if (isBusy) return;

        MEMORY = [];

        saveMemory();

        chat.innerHTML = "";

        add("SYSTEM: Memory cleared.", "ai");

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }
    };
}

// 18. SYSTEM STATUS
console.log("--------------------------------");
console.log("J.A.R.V.I.S 2.0 INITIALIZED");
console.log("Streaming: ENABLED");
console.log("Memory: ENABLED");
console.log("Voice: ENABLED");
console.log("Vision: ENABLED");
console.log("--------------------------------");

if (!API_KEY) {
    console.warn("Gemini API key not configured.");
}

if (!SR) {
    console.warn("Speech recognition unavailable.");
}

if (!("speechSynthesis" in window)) {
    console.warn("Speech synthesis unavailable.");
}
