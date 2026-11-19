/* ==========================================
   J.A.R.V.I.S AI ASSISTANT
   Gemini + Voice + Camera + Memory + Weather
   Complete & Fixed Version
========================================== */

// ===== 1. CONFIGURATION ===== //
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3-flash-preview"];

function getApiUrl(modelName) {
    return `https://googleapis.com{modelName}:generateContent`;
}

let API_KEY = localStorage.getItem("jarvis_key") || "";

let chatHistory = [];
try {
    chatHistory = JSON.parse(localStorage.getItem("jarvis_history") || "[]");
    if (!Array.isArray(chatHistory)) chatHistory = [];
} catch {
    chatHistory = [];
}

let busy = false;
let recognition = null;
let isListening = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ===== 2. HTML ELEMENTS =====
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");
const imageInput = document.getElementById("img-input");
const chat = document.getElementById("chat");
const statusElement = document.getElementById("system-status");

// ===== 3. DISPLAY MESSAGES =====
function addMessage(message, type = "ai") {
    if (!chat) return;

    const div = document.createElement("div");
    div.className = "msg " + type;
    div.textContent = (type === "user" ? "YOU: " : "J.A.R.V.I.S: ") + message;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function setStatus(message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
}

function saveHistory() {
    try {
        // Keep last 20 turns so localStorage doesn't overflow
        const trimmed = chatHistory.slice(-20);
        localStorage.setItem("jarvis_history", JSON.stringify(trimmed));
    } catch (e) {
        console.warn("Could not save history:", e);
    }
}

function restoreChat() {
    if (!chat) return;
    chat.innerHTML = "";
    chatHistory.forEach(item => {
        const text = item.parts?.map(part => part.text || "").join("");
        if (!text) return;
        addMessage(text, item.role === "user" ? "user" : "ai");
    });
}

// ===== 4. VOICE OUTPUT =====
function speak(text) {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-IN";
    speech.rate = 1;
    speech.pitch = 1;

    speech.onstart = () => setStatus("SPEAKING...");
    speech.onend = () => setStatus("SYSTEM READY");

    window.speechSynthesis.speak(speech);
}

// ===== 5. SPEECH RECOGNITION =====
function getSpeechRecognition() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function stopRecognition() {
    if (recognition) {
        try {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.stop();
        } catch (error) {
            console.log("Recognition stop:", error);
        }
    }
    recognition = null;
    isListening = false;
    if (micBtn) micBtn.classList.remove("active");
}

function startVoiceInput() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage("Voice recognition is not supported in this browser. Try Google Chrome.", "ai");
        setStatus("VOICE NOT SUPPORTED");
        return;
    }

    if (isListening) {
        stopRecognition();
        setStatus("SYSTEM READY");
        return;
    }

    stopRecognition();
    recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    isListening = true;
    if (micBtn) micBtn.classList.add("active");
    setStatus("LISTENING...");

    recognition.onresult = event => {
        const transcript = event.results[0][0].transcript.trim();
        if (!transcript) return;
        if (input) input.value = transcript;
        stopRecognition();
        setStatus("VOICE RECEIVED");
        sendMessage();
    };

    recognition.onerror = event => {
        console.error("Voice error:", event.error);
        stopRecognition();
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            addMessage("Microphone permission denied. Allow microphone access in Chrome settings.", "ai");
        } else if (event.error === "no-speech") {
            addMessage("I did not hear anything. Tap the microphone and try again.", "ai");
        } else {
            addMessage("Voice recognition error: " + event.error, "ai");
        }
        setStatus("VOICE ERROR");
    };

    recognition.onend = () => {
        isListening = false;
        if (micBtn) micBtn.classList.remove("active");
        if (statusElement && statusElement.textContent === "LISTENING...") {
            setStatus("SYSTEM READY");
        }
    };

    try {
        recognition.start();
    } catch (error) {
        console.error("Recognition start error:", error);
        stopRecognition();
        addMessage("Could not start the microphone. Please try again.", "ai");
        setStatus("MICROPHONE ERROR");
    }
}

if (micBtn) micBtn.addEventListener("click", startVoiceInput);

// ===== 6. CAMERA =====
function openCamera() {
    if (!imageInput) {
        addMessage("Camera input is missing from the HTML page.", "ai");
        return;
    }
    imageInput.setAttribute("accept", "image/*");
    imageInput.setAttribute("capture", "environment");
    imageInput.click();
}

if (camBtn) camBtn.addEventListener("click", openCamera);

if (imageInput) {
    imageInput.addEventListener("change", async () => {
        const file = imageInput.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            addMessage("Please select an image.", "ai");
            imageInput.value = "";
            return;
        }

        setStatus("PROCESSING IMAGE...");
        try {
            const base64 = await fileToBase64(file);
            const imageData = { mimeType: file.type, data: base64 };

            if (input && !input.value.trim()) {
                input.value = "Describe this image.";
            }
            await sendMessage(imageData);
        } catch (error) {
            console.error("Image error:", error);
            addMessage("Unable to read the image. Please try again.", "ai");
            setStatus("IMAGE ERROR");
        }
        imageInput.value = "";
    });
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string") {
                reject(new Error("Unable to read image."));
                return;
            }
            resolve(result.split(",")[1]);
        };
        reader.onerror = () => reject(new Error("Image file read failed."));
        reader.readAsDataURL(file);
    });
}

// ===== 7. LIVE WEATHER HELPER (FIXED URLS) =====
async function getWeather(userPrompt) {
    // Extract city name if provided, otherwise default to Vijayawada
    const cleanPrompt = userPrompt.replace(/\b(today|tomorrow|right now|please)\b/gi, "").trim();
    const match = cleanPrompt.match(/(?:weather|temperature)\s+(?:in|for|at)\s+([a-zA-Z\s]+)/i);
    const city = match ? match[1].trim() : "Vijayawada";

    try {
        setStatus("FETCHING WEATHER...");

        const geoRes = await fetch(
            `https://open-meteo.com{encodeURIComponent(city)}&count=1&format=json`
        );
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            return `I could not find weather data for ${city}.`;
        }

        const { latitude, longitude, name, country } = geoData.results[0];

        const weatherRes = await fetch(
            `https://open-meteo.com{latitude}&longitude=${longitude}&current_weather=true`
        );
        const weatherData = await weatherRes.json();
        const current = weatherData.current_weather;

        return `The current temperature in ${name}, ${country} is ${current.temperature}°C with wind speeds of ${current.windspeed} km/h.`;
    } catch (error) {
        console.error("Weather fetch error:", error);
        return "Unable to reach the weather satellite right now. Please try again.";
    }
}

// ===== 8. LOCAL COMMANDS =====
async function handleTools(text) {
    const t = text.toLowerCase().trim();

    // 1. Weather (Must come BEFORE date/today check)
    if (/\b(weather|temperature|forecast)\b/.test(t)) {
        return await getWeather(text);
    }

    // 2. Time
    if (/\b(time|clock)\b/.test(t)) {
        return "Current time: " + new Date().toLocaleTimeString("en-IN");
    }

    // 3. Date
    if (/\b(date|today's date|what day is today)\b/.test(t)) {
        return "Today's date: " + new Date().toLocaleDateString("en-IN");
    }

    // 4. Day of week
    if (/\b(day of week|weekday)\b/.test(t)) {
        return "Today is " + new Date().toLocaleDateString("en-IN", { weekday: "long" });
    }

    // 5. Open websites
    const websites = {
        "open google": "https://google.com",
        "open youtube": "https://youtube.com",
        "open gmail": "https://google.com",
        "open github": "https://github.com"
    };

    for (const [cmd, url] of Object.entries(websites)) {
        if (t.includes(cmd)) {
            window.open(url, "_blank");
            return `Opening ${cmd.replace("open ", "")}...`;
        }
    }

    return null; // Not a local command; pass to Gemini
}

