
/* =========================================
   J.A.R.V.I.S. AI ASSISTANT
   Gemini + Memory + Voice + Vision
========================================= */

// 1. API KEY
let API_KEY = localStorage.getItem("jarvis_key");

if (!API_KEY) {
    API_KEY = prompt("Enter your Gemini API Key:");

    if (API_KEY) {
        localStorage.setItem("jarvis_key", API_KEY.trim());
        API_KEY = API_KEY.trim();
    }
}

// 2. GEMINI MODELS
const MODELS = [
    "gemini-3.8-flash",
    "gemini-3.6-flash"
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
    MEMORY = JSON.parse(
        localStorage.getItem("jarvis_memory") || "[]"
    );

    if (!Array.isArray(MEMORY)) MEMORY = [];

} catch {
    MEMORY = [];
}

function saveMemory() {
    localStorage.setItem(
        "jarvis_memory",
        JSON.stringify(MEMORY)
    );
}

// 5. DISPLAY OLD CHAT
function add(text, type) {

    const div = document.createElement("div");

    div.className = "msg " + type;
    div.innerText = text;

    chat.appendChild(div);

    chat.scrollTop = chat.scrollHeight;

    return div;
}

MEMORY.forEach(m => {
    add(
        (m.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") + m.text,
        m.role === "user" ? "user" : "ai"
    );
});

// 6. GEMINI API CONNECTION
async function callGemini(promptText) {

    if (!API_KEY) {
        throw new Error("API key missing.");
    }

    const contents = MEMORY.slice(-12).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));

    contents.push({
        role: "user",
        parts: [{ text: promptText }]
    });

    let lastError;

    for (const model of MODELS) {

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
                        contents: contents,
                        generationConfig: {
                            maxOutputTokens: 2048
                        }
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {

                const error = new Error(
                    data.error?.message || "Gemini API error"
                );

                error.status = response.status;

                throw error;
            }

            const reply = data.candidates?.[0]?.content
                ?.parts?.map(p => p.text || "").join("");

            if (!reply) {
                throw new Error("Empty Gemini response.");
            }

            console.log("Connected model:", model);

            return reply;

        } catch (error) {

            lastError = error;

            if ([404, 429, 500, 503].includes(error.status)) {
                continue;
            }

            throw error;
        }
    }

    throw lastError || new Error("All models failed.");
}

// 7. ASK JARVIS
async function askGemini(question) {

    const message = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        const reply = await callGemini(question);

        MEMORY.push({
            role: "user",
            text: question
        });

        MEMORY.push({
            role: "model",
            text: reply
        });

        saveMemory();

        message.innerText = "J.A.R.V.I.S: " + reply;

        speak(reply);

    } catch (error) {

        message.innerText =
            "J.A.R.V.I.S ERROR: " + error.message;

        console.error(error);
    }
}

// 8. IMAGE RECOGNITION
if (camBtn && imgInput) {

    camBtn.onclick = () => imgInput.click();

    imgInput.onchange = () => {

        const file = imgInput.files[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Please select an image.");
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            alert("Please select an image smaller than 10 MB.");
            return;
        }

        const reader = new FileReader();

        reader.onload = async () => {

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

            imgInput.value = "";
        };

        reader.readAsDataURL(file);
    };
}

// 9. VISION ENGINE
async function askVision(base64, mime, question) {

    const message = add(
        "J.A.R.V.I.S: Analyzing image...",
        "ai"
    );

    let lastError;

    for (const model of MODELS) {

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
                        contents: [{
                            role: "user",
                            parts: [
                                { text: question },
                                {
                                    inline_data: {
                                        mime_type: mime,
                                        data: base64
                                    }
                                }
                            ]
                        }]
                    })
                }
            );

            const data = await response.json();

            if (!response.ok) {

                const error = new Error(
                    data.error?.message || "Vision API error"
                );

                error.status = response.status;

                throw error;
            }

            const reply = data.candidates?.[0]?.content
                ?.parts?.map(p => p.text || "").join("");

            if (!reply) {
                throw new Error("No image response.");
            }

            MEMORY.push({
                role: "user",
                text: "[Image] " + question
            });

            MEMORY.push({
                role: "model",
                text: reply
            });

            saveMemory();

            message.innerText = "J.A.R.V.I.S: " + reply;

            speak(reply);

            return;

        } catch (error) {

            lastError = error;

            if ([404, 429, 500, 503].includes(error.status)) {
                continue;
            }

            break;
        }
    }

    message.innerText =
        "J.A.R.V.I.S ERROR: " +
        (lastError?.message || "Image analysis failed.");
}

// 10. VOICE INPUT
const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

if (SR && micBtn) {

    const recognition = new SR();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        micBtn.innerText = "LISTENING...";
    };

    recognition.onresult = (event) => {

        const text =
            event.results[0][0].transcript;

        add("YOU: " + text, "user");

        askGemini(text);
    };

    recognition.onerror = (event) => {

        add("VOICE ERROR: " + event.error, "ai");
    };

    recognition.onend = () => {
        micBtn.innerText = "🎙️";
    };

    micBtn.onclick = () => {

        try {
            recognition.start();
        } catch (error) {
            console.error(error);
        }
    };

} else if (micBtn) {

    micBtn.onclick = () => {
        alert("Voice input is not supported in this browser.");
    };
}

// 11. VOICE OUTPUT
let voices = [];

function loadVoices() {

    voices = speechSynthesis.getVoices();
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

    utterance.rate = 1;
    utterance.pitch = 0.9;
    utterance.volume = 1;

    const voice = voices.find(v =>
        v.lang.toLowerCase().startsWith("en-in")
    ) || voices.find(v =>
        v.lang.toLowerCase().startsWith("en")
    );

    if (voice) {
        utterance.voice = voice;
    }

    speechSynthesis.speak(utterance);
}

// 12. SEND BUTTON
if (sendBtn && input) {

    sendBtn.onclick = () => {

        const text = input.value.trim();

        if (!text) return;

        add("YOU: " + text, "user");

        input.value = "";

        askGemini(text);
    };
}

// 13. ENTER TO SEND
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

// 14. CLEAR MEMORY
if (clearBtn) {

    clearBtn.onclick = () => {

        MEMORY = [];

        saveMemory();

        chat.innerHTML = "";

        add("SYSTEM: Memory cleared.", "ai");

        if ("speechSynthesis" in window) {
            speechSynthesis.cancel();
        }
    };
}

console.log("J.A.R.V.I.S SYSTEM INITIALIZED");
          
