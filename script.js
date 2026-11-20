// =====================================================
// J.A.R.V.I.S. MOBILE AI - COMPLETE SCRIPT
// Chat | Memory | Voice | Camera | Tools
// =====================================================

// =============== 1. API KEY ===============

const SAVED_KEY = localStorage.getItem("jarvis_key") || "";

let API_KEY = prompt(
    "J.A.R.V.I.S. ONLINE\nEnter your Gemini API Key:",
    SAVED_KEY
);

API_KEY = (API_KEY || SAVED_KEY).trim();

if (API_KEY) {
    localStorage.setItem("jarvis_key", API_KEY);
} else {
    alert("API key missing. AI features will not work.");
}

// =============== 2. MODELS ===============

const MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite"
];

const REQUEST_TIMEOUT = 20000;

// =============== 3. MEMORY ===============

let MEMORY = [];

try {
    MEMORY = JSON.parse(
        localStorage.getItem("jarvis_memory") || "[]"
    );
    if (!Array.isArray(MEMORY)) MEMORY = [];
} catch (e) {
    MEMORY = [];
}

function saveMemory() {
    localStorage.setItem(
        "jarvis_memory",
        JSON.stringify(MEMORY)
    );
}

// =============== 4. HTML ELEMENTS ===============

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");

// =============== 5. CHAT DISPLAY ===============

function add(text, who) {
    const div = document.createElement("div");

    div.className = "msg " + who;
    div.innerText = text;

    if (chat) {
        chat.appendChild(div);
        chat.scrollTop = chat.scrollHeight;
    }

    return div;
}

// =============== 6. LOAD MEMORY ===============

MEMORY.forEach(function (m) {
    if (!m || !m.text) return;

    add(
        (m.role === "user" ? "YOU: " : "J.A.R.V.I.S: ") + m.text,
        m.role === "user" ? "user" : "ai"
    );
});

// =============== 7. GEMINI REQUEST ===============

async function geminiRequest(contents, model) {

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT
    );

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
                        maxOutputTokens: 400,
                        temperature: 0.5
                    }
                }),

                signal: controller.signal
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error?.message ||
                "Gemini API error: " + response.status
            );
        }

        const answer =
            data.candidates?.[0]?.content?.parts
                ?.map(p => p.text || "")
                .join("");

        if (!answer) {
            throw new Error("Gemini returned an empty response.");
        }

        return answer;

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error(
                "Request timed out. Please try again."
            );
        }

        if (error instanceof TypeError) {
            throw new Error(
                "Network error. Check internet connection or API key restrictions."
            );
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// =============== 8. AI BRAIN ===============

async function callGemini(promptText) {

    if (!API_KEY) {
        throw new Error("API key is missing.");
    }

    const contents = MEMORY
        .slice(-10)
        .map(m => ({
            role: m.role,
            parts: [{ text: m.text }]
        }));

    contents.push({
        role: "user",
        parts: [{ text: promptText }]
    });

    let lastError;

    for (let i = 0; i < MODELS.length; i++) {

        try {
            return await geminiRequest(contents, MODELS[i]);

        } catch (error) {

            lastError = error;

            console.warn(
                "Model " + MODELS[i] + " failed:",
                error.message
            );

            // Network/timeouts don't benefit from trying
            // another model, so stop immediately.
            if (
                error.message.includes("Network error") ||
                error.message.includes("timed out")
            ) {
                throw error;
            }
        }
    }

    throw lastError || new Error("AI request failed.");
}

// =============== 9. TIME TOOL ===============

function timeTool() {

    return "The time is " +
        new Date().toLocaleTimeString() +
        ", Boss.";
}

// =============== 10. WEATHER TOOL ===============

function weatherTool() {

    return new Promise(resolve => {

        if (!navigator.geolocation) {
            resolve("Location is not supported, Boss.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async position => {

                try {

                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;

                    const url =
                        "https://api.open-meteo.com/v1/forecast" +
                        "?latitude=" + lat +
                        "&longitude=" + lon +
                        "&current=temperature_2m,relative_humidity_2m,wind_speed_10m";

                    const response = await fetch(url);

                    if (!response.ok) {
                        throw new Error("Weather request failed");
                    }

                    const data = await response.json();
                    const current = data.current;

                    resolve(
                        "Current weather: " +
                        current.temperature_2m + "°C. " +
                        "Humidity: " +
                        current.relative_humidity_2m + "%. " +
                        "Wind speed: " +
                        current.wind_speed_10m +
                        " km/h, Boss."
                    );

                } catch (error) {
                    resolve("Weather service error, Boss.");
                }
            },

            () => resolve(
                "Please allow location permission to check weather, Boss."
            ),

            {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 300000
            }
        );
    });
}

// =============== 11. TIMER TOOL ===============

function timerTool(text) {

    const match = text.match(
        /(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i
    );

    if (!match) {
        return "Boss, please specify a timer duration, like 5 minutes.";
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    let factor = 1000;

    if (unit.startsWith("min")) {
        factor = 60000;
    }

    if (unit.startsWith("hour") || unit.startsWith("hr")) {
        factor = 3600000;
    }

    const duration = amount * factor;

    if (duration > 2147483647) {
        return "That timer is too long, Boss.";
    }

    setTimeout(function () {

        speak("Boss, your timer is finished.");

        alert("Timer finished, Boss!");

    }, duration);

    return "Timer set for " + amount + " " + unit + ", Boss.";
}

// =============== 12. TRANSLATE TOOL ===============

async function translateTool(text) {

    const query = text
        .replace(/translate/i, "")
        .replace(/into telugu/i, "")
        .replace(/to telugu/i, "")
        .replace(/in telugu/i, "")
        .replace(/తెలుగులోకి/i, "")
        .replace(/తెలుగులో/i, "")
        .replace(/అనువదించు/i, "")
        .trim();

    if (!query) {
        return "Boss, tell me what you want to translate.";
    }

    try {

        const url =
            "https://api.mymemory.translated.net/get?q=" +
            encodeURIComponent(query) +
            "&langpair=en|te";

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Translation API failed.");
        }

        const data = await response.json();

        const translated =
            data.responseData?.translatedText;

        if (!translated) {
            throw new Error("Translation unavailable.");
        }

        return "Telugu translation: " + translated;

    } catch (error) {

        return "Translation service is unavailable, Boss.";
    }
}

// =============== 13. YOUTUBE TOOL ===============

function youtubeTool(text) {

    const query = text
        .replace(/play/i, "")
        .replace(/youtube/i, "")
        .replace(/on youtube/i, "")
        .trim();

    if (!query) {
        return "Boss, what would you like to search on YouTube?";
    }

    const url =
        "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(query);

    // Opens search results. If the browser blocks pop-ups,
    // the user can allow them for the app.
    window.open(url, "_blank");

    return "Searching YouTube for " + query + ", Boss.";
}

// =============== 14. TOOLS ROUTER ===============

async function handleTools(text) {

    const t = text.toLowerCase().trim();

    // TIME
    if (
        /\btime\b/.test(t) ||
        t.includes("సమయం") ||
        t.includes("సమయము")
    ) {
        return timeTool();
    }

    // WEATHER
    if (
        t.includes("weather") ||
        t.includes("వాతావరణం")
    ) {
        return await weatherTool();
    }

    // TIMER
    if (
        t.includes("timer") ||
        t.includes("టైమర్")
    ) {
        return timerTool(text);
    }

    // TRANSLATE
    if (
        t.includes("translate") ||
        t.includes("తెలుగులో") ||
        t.includes("అనువదించు")
    ) {
        return await translateTool(text);
    }

    // YOUTUBE
    if (
        t.includes("youtube") ||
        /\bplay\b/.test(t)
    ) {
        return youtubeTool(text);
    }

    return null;
}

// =============== 15. ASK JARVIS ===============

let busy = false;

async function askGemini(promptText) {

    if (busy) {
        add("J.A.R.V.I.S: Please wait for my current response, Boss.", "ai");
        return;
    }

    busy = true;

    const thinking = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        // Check tools before using AI
        const toolReply = await handleTools(promptText);

        const reply = toolReply !== null
            ? toolReply
            : await callGemini(promptText);

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

        console.error("JARVIS error:", error);

    } finally {
        busy = false;
    }
}

// =============== 16. CAMERA BUTTON ===============

if (camBtn && imgInput) {

    camBtn.onclick = function () {
        imgInput.click();
    };

    imgInput.onchange = async function () {

        const file = imgInput.files?.[0];

        if (!file) return;

        if (busy) {
            add("J.A.R.V.I.S: Please wait for the current task.", "ai");
            imgInput.value = "";
            return;
        }

        busy = true;

        const thinking = add(
            "J.A.R.V.I.S: Preparing photo...",
            "ai"
        );

        try {

            if (!file.type.startsWith("image/")) {
                throw new Error("Please select an image.");
            }

            // Load image
            const objectURL = URL.createObjectURL(file);
            const image = new Image();

            image.src = objectURL;

            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
            });

            // Resize image for quicker upload
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

            // Convert to compressed JPEG
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

            const contents = [
                {
                    role: "user",
                    parts: [
                        { text: question },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: base64
                            }
                        }
                    ]
                }
            ];

            let reply = null;
            let lastError = null;

            for (const model of MODELS) {

                try {
                    reply = await geminiRequest(contents, model);
                    break;

                } catch (error) {

                    lastError = error;

                    if (
                        error.message.includes("Network error") ||
                        error.message.includes("timed out")
                    ) {
                        throw error;
                    }
                }
            }

            if (!reply) {
                throw lastError || new Error("Photo analysis failed.");
            }

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

            thinking.innerText =
                "J.A.R.V.I.S: PHOTO ERROR - " +
                error.message;

            console.error("Camera error:", error);

        } finally {

            imgInput.value = "";
            busy = false;
        }
    };
}

// =============== 17. MICROPHONE ===============

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

        console.error("Speech recognition error:", event.error);

        micBtn.innerText = "🎙️";
    };

    recognition.onend = function () {
        micBtn.innerText = "🎙️";
    };

    micBtn.onclick = function () {

        try {
            recognition.start();
            micBtn.innerText = "LISTENING...";
        } catch (error) {
            console.warn(error);
        }
    };

} else if (micBtn) {

    micBtn.innerText = "MIC UNAVAILABLE";
}

// =============== 18. VOICE ===============

let voices = [];

function loadVoices() {
    if (window.speechSynthesis) {
        voices = speechSynthesis.getVoices();
    }
}

if (window.speechSynthesis) {

    loadVoices();

    speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {

    if (!window.speechSynthesis) return;

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = 1.0;
    utterance.pitch = 0.85;
    utterance.volume = 1.0;

    const voice = voices.find(v =>
        v.lang && v.lang.startsWith("en")
    );

    if (voice) {
        utterance.voice = voice;
    }

    speechSynthesis.speak(utterance);
}

// =============== 19. SEND BUTTON ===============

if (sendBtn) {

    sendBtn.onclick = function () {

        const text = input.value.trim();

        if (!text) return;

        add("YOU: " + text, "user");

        input.value = "";

        askGemini(text);
    };
}

// =============== 20. ENTER KEY ===============

if (input) {

    input.addEventListener("keydown", function (event) {

        if (event.key === "Enter") {
            event.preventDefault();
            sendBtn?.click();
        }
    });
}

// =============== 21. CLEAR MEMORY ===============

if (clearBtn) {

    clearBtn.onclick = function () {

        MEMORY = [];

        saveMemory();

        if (chat) {
            chat.innerHTML = "";
        }

        add("SYSTEM: Memory cleared.", "ai");
    };
}

// =============== 22. STATUS ===============

const systemStatus =
    document.getElementById("system-status");

if (systemStatus) {
    systemStatus.innerText = API_KEY
        ? "SYSTEM ONLINE"
        : "API KEY REQUIRED";
}

console.log("J.A.R.V.I.S. loaded successfully.");
