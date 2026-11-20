/* =====================================================
   J.A.R.V.I.S. AI ASSISTANT
   Gemini 3.5 Flash-Lite + 3.8 Flash Fallback
   Chat + Memory + Voice + Vision + 15 Tools
   Orbs Visual State System
===================================================== */

// =====================================================
// 1. CONFIGURATION
// =====================================================

const CONFIG = {
    MODEL: "gemini-3.5-flash-lite",
    FALLBACK_MODEL: "gemini-3.8-flash",
    API_URL: "https://generativelanguage.googleapis.com/v1beta/models/",
    TIMEOUT: 30000,
    MAX_HISTORY: 20,
    MAX_CONTEXT: 8,
    MAX_OUTPUT: 1024
};

// Ask API key every time app opens.
// API key is not saved.

let API_KEY = "";

function requestApiKey() {
    const key = prompt(
        "J.A.R.V.I.S. SYSTEM\n\nEnter your Gemini API Key:"
    );

    API_KEY = key ? key.trim() : "";

    if (!API_KEY) {
        add("J.A.R.V.I.S.: API key required. Please enter your key.", "ai");
        return false;
    }

    return true;
}

requestApiKey();


// =====================================================
// 2. MEMORY SYSTEM
// =====================================================

let MEMORY = [];

try {
    const saved = JSON.parse(
        localStorage.getItem("jarvis_memory") || "[]"
    );

    if (Array.isArray(saved)) {
        MEMORY = saved.filter(m =>
            m &&
            ["user", "model"].includes(m.role) &&
            typeof m.text === "string"
        ).slice(-CONFIG.MAX_HISTORY);
    }
} catch (error) {
    MEMORY = [];
}

function saveMemory() {
    try {
        localStorage.setItem(
            "jarvis_memory",
            JSON.stringify(MEMORY.slice(-CONFIG.MAX_HISTORY))
        );
    } catch (error) {
        console.warn("Memory storage unavailable.");
    }
}


// =====================================================
// 3. HTML ELEMENTS
// =====================================================

const chat = document.getElementById("chat");
const input = document.getElementById("msg");

const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");


// =====================================================
// 4. ORBS VISUAL STATE SYSTEM
// =====================================================

let orbInstance = window.jarvisOrbInstance || null;

const ORB_COLORS = {
    IDLE: "#00ffff",
    LISTENING: "#00ff00",
    THINKING: "#ffa500"
};

function setJarvisVisualState(state) {

    if (!ORB_COLORS[state]) return;

    // Update Orbs library if initialized
    if (orbInstance &&
        typeof orbInstance.setColor === "function") {

        orbInstance.setColor(ORB_COLORS[state]);
    }

    // CSS fallback
    const orb = document.getElementById("jarvis-orb");

    if (orb) {
        orb.style.background = `
            radial-gradient(
                circle,
                white,
                ${ORB_COLORS[state]} 30%,
                #004466 65%,
                transparent 75%
            )
        `;

        orb.style.boxShadow =
            `0 0 30px ${ORB_COLORS[state]},
             0 0 80px ${ORB_COLORS[state]}`;
    }

    const status = document.getElementById("status");

    if (status) {
        status.textContent = {
            IDLE: "SYSTEM ONLINE",
            LISTENING: "LISTENING...",
            THINKING: "PROCESSING..."
        }[state];
    }
}


// =====================================================
// 5. CHAT DISPLAY
// =====================================================

function add(message, type = "ai") {

    if (!chat) return null;

    const div = document.createElement("div");

    div.className = type;
    div.textContent = message;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;

    return div;
}


// =====================================================
// 6. VOICE REPLY
// =====================================================

function speak(text) {

    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);

    speech.lang = "en-IN";
    speech.rate = 1;
    speech.pitch = 1;

    speechSynthesis.speak(speech);
}


// =====================================================
// 7. API REQUEST SYSTEM
// =====================================================

async function fetchToolJson(url, options = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        CONFIG.TIMEOUT
    );

    try {

        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {

            const error = new Error(
                data.error?.message ||
                `API Error: HTTP ${response.status}`
            );

            error.status = response.status;

            throw error;
        }

        return data;

    } catch (error) {

        if (error.name === "AbortError") {
            throw new Error("Request timed out. Please try again.");
        }

        if (error instanceof TypeError) {
            throw new Error("Network connection failed. Check your internet.");
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}


// =====================================================
// 8. GEMINI BRAIN
// =====================================================

async function callGemini(promptText, imageParts = []) {

    if (!API_KEY) {
        throw new Error("Gemini API key is missing.");
    }

    const history = MEMORY.slice(-CONFIG.MAX_CONTEXT).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));

    const contents = [
        ...history,
        {
            role: "user",
            parts: [
                { text: promptText },
                ...imageParts
            ]
        }
    ];

    const models = [
        CONFIG.MODEL,
        CONFIG.FALLBACK_MODEL
    ];

    let lastError;

    for (let i = 0; i < models.length; i++) {

        const model = models[i];

        try {

            const url =
                CONFIG.API_URL +
                model +
                ":generateContent";

            const data = await fetchToolJson(url, {

                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": API_KEY
                },

                body: JSON.stringify({

                    contents,

                    generationConfig: {
                        maxOutputTokens: CONFIG.MAX_OUTPUT
                    }
                })
            });

            const answer =
                data.candidates?.[0]?.content?.parts
                    ?.map(p => p.text || "")
                    .join("")
                    .trim();

            if (!answer) {
                throw new Error(
                    data.candidates?.[0]?.finishReason ||
                    data.promptFeedback?.blockReason ||
                    "Gemini returned an empty response."
                );
            }

            MEMORY.push(
                { role: "user", text: promptText },
                { role: "model", text: answer }
            );

            MEMORY = MEMORY.slice(-CONFIG.MAX_HISTORY);

            saveMemory();

            return answer;

        } catch (error) {

            lastError = error;

            // Don't retry with another model for an invalid API key.
            if ([400, 401, 403].includes(error.status)) {
                break;
            }

            // Try fallback for model, capacity or quota errors.
            if (![404, 429, 500, 502, 503, 504].includes(error.status)
                && error.status !== undefined) {
                break;
            }

            if (i === models.length - 1) {
                break;
            }

            console.warn("Trying fallback model:", error.message);
        }
    }

    throw lastError || new Error("Gemini connection failed.");
}


// =====================================================
// 9. TOOLS - THE HANDS (15 TOOLS)
// =====================================================

async function handleTools(text) {

    const t = text.toLowerCase().trim();

    // 1. TIME

    if (/\b(time|current time|what time)\b/.test(t) ||
        t.includes("సమయం")) {

        return "The time is " +
            new Date().toLocaleTimeString() +
            ", Boss.";
    }


    // 2. DATE

    if (/\b(date|today's date|today date)\b/.test(t)) {

        return "Today's date is " +
            new Date().toLocaleDateString() +
            ", Boss.";
    }


    // 3. WEATHER

    if (t.includes("weather") || t.includes("వాతావరణం")) {

        if (!navigator.geolocation) {
            return "Location is not supported.";
        }

        return new Promise(resolve => {

            navigator.geolocation.getCurrentPosition(

                async position => {

                    try {

                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;

                        const url =
                            "https://api.open-meteo.com/v1/forecast" +
                            `?latitude=${lat}&longitude=${lon}` +
                            "&current=temperature_2m,relative_humidity_2m,wind_speed_10m";

                        const data = await fetchToolJson(url);

                        const w = data.current;

                        resolve(
                            `Temperature: ${w.temperature_2m}°C. ` +
                            `Humidity: ${w.relative_humidity_2m}%. ` +
                            `Wind: ${w.wind_speed_10m} km/h.`
                        );

                    } catch (error) {
                        resolve("Weather service error.");
                    }
                },

                () => resolve("Please allow location permission.")
            );
        });
    }


    // 4. TIMER

    const timer = t.match(
        /(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/
    );

    if (timer && (t.includes("timer") || t.includes("remind"))) {

        const amount = Number(timer[1]);
        const unit = timer[2];

        const factor =
            unit.startsWith("h") ? 3600000 :
            unit.startsWith("m") ? 60000 : 1000;

        const duration = amount * factor;

        if (duration > 86400000) {
            return "Timer maximum is 24 hours.";
        }

        setTimeout(() => {

            speak("Boss, your timer is complete!");

            alert("J.A.R.V.I.S. TIMER COMPLETE!");

        }, duration);

        return `Timer started for ${amount} ${unit}.`;
    }


    // 5. TRANSLATE TO TELUGU

    if (t.includes("translate")) {

        const query = text
            .replace(/translate( this)?/i, "")
            .trim();

        if (!query) {
            return "Please provide text to translate.";
        }

        try {

            const url =
                "https://api.mymemory.translated.net/get?q=" +
                encodeURIComponent(query) +
                "&langpair=en|te";

            const data = await fetchToolJson(url);

            return "Telugu translation: " +
                data.responseData.translatedText;

        } catch (error) {
            return "Translation service error.";
        }
    }


    // 6. OPEN YOUTUBE

    if (/^open youtube$/.test(t)) {

        window.open(
            "https://www.youtube.com/",
            "_blank",
            "noopener,noreferrer"
        );

        return "Opening YouTube, Boss.";
    }


    // 7. YOUTUBE SEARCH

    const videoMatch = text.match(
        /^(?:play|youtube(?: search)?|search youtube)\s+(.+)$/i
    );

    if (videoMatch) {

        const query = videoMatch[1].trim();

        window.open(
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(query),
            "_blank",
            "noopener,noreferrer"
        );

        return "Searching YouTube for " + query;
    }


    // 8. OPEN GOOGLE

    if (/^open google$/.test(t)) {

        window.open(
            "https://www.google.com/",
            "_blank",
            "noopener,noreferrer"
        );

        return "Opening Google, Boss.";
    }


    // 9. GOOGLE SEARCH

    const googleMatch = text.match(
        /^(?:google search|search google|search for)\s+(.+)$/i
    );

    if (googleMatch) {

        const query = googleMatch[1].trim();

        window.open(
            "https://www.google.com/search?q=" +
            encodeURIComponent(query),
            "_blank",
            "noopener,noreferrer"
        );

        return "Searching Google for " + query;
    }


    // 10. OPEN WEBSITE

    const urlMatch = text.match(
        /^open\s+(https?:\/\/\S+)$/i
    );

    if (urlMatch) {

        try {

            const destination = new URL(urlMatch[1]);

            window.open(
                destination.href,
                "_blank",
                "noopener,noreferrer"
            );

            return "Opening website.";

        } catch (error) {
            return "Invalid website address.";
        }
    }


    // 11. WIKIPEDIA SEARCH

    const wikiMatch = text.match(
        /^(?:wikipedia|search wikipedia)\s+(.+)$/i
    );

    if (wikiMatch) {

        try {

            const query = wikiMatch[1].trim();

            const url =
                "https://en.wikipedia.org/w/api.php" +
                "?action=query&list=search&srsearch=" +
                encodeURIComponent(query) +
                "&format=json&origin=*";

            const data = await fetchToolJson(url);

            const result = data.query?.search?.[0];

            if (!result) return "No Wikipedia result found.";

            const snippet = result.snippet
                .replace(/<[^>]*>/g, "");

            return result.title + ": " + snippet;

        } catch (error) {
            return "Wikipedia search error.";
        }
    }


    // 12. STOP VOICE

    if (t === "stop speaking" || t === "stop voice") {

        speechSynthesis.cancel();

        return "Voice stopped, Boss.";
    }


    // 13. CLEAR CHAT

    if (t === "clear chat") {

        MEMORY = [];
        saveMemory();

        if (chat) chat.replaceChildren();

        return "Chat history cleared.";
    }


    // 14. GREETING

    if (/^(hello|hi jarvis|hey jarvis)$/.test(t)) {

        return "Systems online. How may I assist you, Boss?";
    }


    // 15. GEMINI FALLBACK

    return null;
}


// =====================================================
// 10. AGENT MODE ENGINE
// =====================================================

async function runAgent(goal) {

    add("J.A.R.V.I.S.: Agent Mode activated.", "ai");

    const planPrompt = `
You are J.A.R.V.I.S.

Analyze this request:
${goal}

Return ONLY a JSON array.

Available tools:
["time","weather","date","search"]

Rules:
- Use only relevant tools.
- Maximum 3 tools.
- If no tool is needed, return [].
`;

    try {

        const plan = await callGemini(planPrompt);

        const clean = plan
            .replace(/```json|```/g, "")
            .trim();

        const tools = JSON.parse(clean);

        if (!Array.isArray(tools)) {
            throw new Error("Invalid agent plan.");
        }

        const results = {};

        for (const tool of tools.slice(0, 3)) {

            if (["time", "weather", "date"].includes(tool)) {
                results[tool] = await handleTools(tool);
            }

            if (tool === "search") {
                results.search = "Google search is available.";
            }
        }

        return await callGemini(
            "User goal: " + goal +
            "\nAgent results: " + JSON.stringify(results) +
            "\nGive a clear, concise answer."
        );

    } catch (error) {

        return await callGemini(goal);
    }
}


function isAgentModeRequest(text) {

    return /\b(agent mode|run as agent|agent use|briefing|research and analyze)\b/i
        .test(text);
}


// =====================================================
// 11. IMAGE VISION
// =====================================================

async function analyzeImage(file, promptText) {

    if (!file || !file.type.startsWith("image/")) {
        throw new Error("Please select a valid image.");
    }

    if (file.size > 10 * 1024 * 1024) {
        throw new Error("Image must be smaller than 10 MB.");
    }

    const base64 = await new Promise((resolve, reject) => {

        const reader = new FileReader();

        reader.onload = () => {
            resolve(reader.result.split(",")[1]);
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);
    });

    return await callGemini(
        promptText || "Describe and analyze this image.",
        [{
            inline_data: {
                mime_type: file.type,
                data: base64
            }
        }]
    );
}


// =====================================================
// 12. SEND MESSAGE
// =====================================================

let busy = false;

async function sendMessage() {

    if (busy || !input) return;

    const message = input.value.trim();

    if (!message) return;

    if (!API_KEY && !requestApiKey()) return;

    busy = true;

    setJarvisVisualState("THINKING");

    add("YOU: " + message, "user");

    input.value = "";

    const loading = add(
        "J.A.R.V.I.S.: Processing...",
        "ai"
    );

    try {

        const toolResult = await handleTools(message);

        let answer;

        if (toolResult !== null) {

            answer = toolResult;

        } else if (isAgentModeRequest(message)) {

            answer = await runAgent(message);

        } else {

            answer = await callGemini(message);
        }

        if (loading) loading.remove();

        add("J.A.R.V.I.S.: " + answer, "ai");

        speak(answer);

    } catch (error) {

        if (loading) loading.remove();

        add(
            "J.A.R.V.I.S. ERROR: " + error.message,
            "ai"
        );

        console.error("JARVIS:", error);

    } finally {

        busy = false;

        setJarvisVisualState("IDLE");
    }
}


// =====================================================
// 13. VOICE INPUT
// =====================================================

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let recognition = null;
let listening = false;

if (SpeechRecognition) {

    recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {

        listening = true;

        setJarvisVisualState("LISTENING");
    };

    recognition.onresult = event => {

        const spoken =
            event.results[0][0].transcript;

        if (input) {
            input.value = spoken;
            sendMessage();
        }
    };

    recognition.onerror = event => {

        add(
            "Voice recognition error: " + event.error,
            "ai"
        );
    };

    recognition.onend = () => {

        listening = false;

        if (!busy) {
            setJarvisVisualState("IDLE");
        }
    };
}

if (micBtn) {

    micBtn.addEventListener("click", () => {

        if (!recognition) {

            add(
                "Voice input is not supported in this browser.",
                "ai"
            );

            return;
        }

        if (listening) {
            recognition.stop();
            return;
        }

        try {
            recognition.start();
        } catch (error) {
    console.warn("Microphone:", error);
        }
    });
}
// =====================================================
// 14. CAMERA AND IMAGE VISION
// =====================================================

if (camBtn && imgInput) {

    camBtn.addEventListener("click", () => {
        imgInput.click();
    });

    imgInput.addEventListener("change", async () => {

        const file = imgInput.files?.[0];

        if (!file || busy) return;

        if (!API_KEY && !requestApiKey()) {
            imgInput.value = "";
            return;
        }

        busy = true;

        setJarvisVisualState("THINKING");
       
add("YOU: Analyze this image.", "user");

        const loading = add(
            "J.A.R.V.I.S.: Analyzing image...",
            "ai"
        );

        try {

            const answer = await analyzeImage(
                file,
                "Analyze this image and explain what you see."
            );

            if (loading) loading.remove();

            add("J.A.R.V.I.S.: " + answer, "ai");

            speak(answer);

        } catch (error) {

            if (loading) loading.remove();

            add("Vision error: " + error.message, "ai");
           } finally {

            busy = false;

            setJarvisVisualState("IDLE");

            imgInput.value = "";
        }
    });
}


// =====================================================
// 15. CLEAR HISTORY
// =====================================================

if (clearBtn) {

    clearBtn.addEventListener("click", () => {

        MEMORY = [];

        saveMemory();

        if (chat) chat.replaceChildren();

        if ("speechSynthesis" in window) {
            speechSynthesis.cancel();
        }
       add(
            "J.A.R.V.I.S.: Memory cleared, Boss.",
            "ai"
        );
    });
}


// =====================================================
// 16. EVENT LISTENERS
// =====================================================

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
// =====================================================
// 17. SYSTEM STARTUP
// =====================================================

window.addEventListener("load", () => {

    setJarvisVisualState("IDLE");

    add(
        API_KEY
            ? "J.A.R.V.I.S.: Systems online. Gemini connection ready. How may I assist you, Boss?"
            : "J.A.R.V.I.S.: Waiting for API key, Boss.",
        "ai"
    );

    console.log("J.A.R.V.I.S. SYSTEM INITIALIZED");

    console.log("Primary Model:", CONFIG.MODEL);

    console.log("Fallback Model:", CONFIG.FALLBACK_MODEL);
});
