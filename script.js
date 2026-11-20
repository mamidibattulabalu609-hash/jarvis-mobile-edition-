
/* =========================================
   J.A.R.V.I.S PERSONAL AI ASSISTANT
   Gemini 3.8 Flash + Weather + Voice
   Wake Word + Camera + Memory
========================================= */

// ===== 1. CONFIGURATION =====

const MODEL = "gemini-3.8-flash";

const API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

let API_KEY = localStorage.getItem("jarvis_key") || "";

let chatHistory = [];

try {
    chatHistory = JSON.parse(
        localStorage.getItem("jarvis_history") || "[]"
    );

    if (!Array.isArray(chatHistory)) chatHistory = [];
} catch {
    chatHistory = [];
}

let busy = false;
let wakeWordEnabled = false;
let wakeRecognizer = null;
let commandRecognizer = null;
let wakeCommandPending = false;

const WAKE_WORD = "hey jarvis";

// ===== 2. HTML ELEMENTS =====

const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");
const imageInput = document.getElementById("img-input");
const chat = document.getElementById("chat");
const status = document.getElementById("system-status");
const wakeBtn = document.getElementById("wake-btn");
const wakeStatus = document.getElementById("wake-status");

// ===== 3. DISPLAY =====

function addMessage(message, type = "ai") {
    if (!chat) return;

    const div = document.createElement("div");
    div.className = "msg " + type;

    div.textContent =
        (type === "user" ? "YOU: " : "J.A.R.V.I.S: ") +
        String(message);

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function setStatus(message) {
    if (status) status.textContent = message;
}

function updateWakeStatus(message, color) {
    if (!wakeStatus) return;

    wakeStatus.textContent = message;

    if (color) wakeStatus.style.color = color;
}

// ===== 4. VOICE OUTPUT =====

function speak(text) {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);

    speech.lang = "en-IN";
    speech.rate = 1;

    window.speechSynthesis.speak(speech);
}

// ===== 5. LIVE WEATHER =====

async function getWeather(location) {
    const place = location || "Vijayawada";

    setStatus("FETCHING WEATHER...");

    try {
        const geoURL =
            "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(place) +
            "&count=1&language=en&format=json";

        const geoResponse = await fetch(geoURL);

        if (!geoResponse.ok) {
            throw new Error("Weather location search failed.");
        }

        const geoData = await geoResponse.json();

        if (!geoData.results || !geoData.results.length) {
            throw new Error("Location not found: " + place);
        }

        const city = geoData.results[0];

        const weatherURL =
            "https://api.open-meteo.com/v1/forecast?" +
            "latitude=" + city.latitude +
            "&longitude=" + city.longitude +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m" +
            "&timezone=auto";

        const weatherResponse = await fetch(weatherURL);

        if (!weatherResponse.ok) {
            throw new Error("Weather service unavailable.");
        }

        const data = await weatherResponse.json();

        const current = data.current;

        if (!current) {
            throw new Error("Weather data unavailable.");
        }

        const conditions = {
            0: "Clear sky",
            1: "Mainly clear",
            2: "Partly cloudy",
            3: "Overcast",
            45: "Fog",
            48: "Depositing rime fog",
            51: "Light drizzle",
            53: "Moderate drizzle",
            55: "Dense drizzle",
            61: "Slight rain",
            63: "Moderate rain",
            65: "Heavy rain",
            71: "Slight snowfall",
            73: "Moderate snowfall",
            75: "Heavy snowfall",
            80: "Rain showers",
            81: "Moderate rain showers",
            82: "Heavy rain showers",
            95: "Thunderstorm",
            96: "Thunderstorm with hail",
            99: "Severe thunderstorm with hail"
        };

        const condition =
            conditions[current.weather_code] || "Unknown conditions";

        return (
            "LIVE WEATHER REPORT\n\n" +
            "Location: " + city.name + "\n" +
            "Temperature: " + current.temperature_2m + "°C\n" +
            "Feels like: " + current.apparent_temperature + "°C\n" +
            "Condition: " + condition + "\n" +
            "Humidity: " + current.relative_humidity_2m + "%\n" +
            "Wind speed: " + current.wind_speed_10m + " km/h\n" +
            "Precipitation: " + current.precipitation + " mm\n\n" +
            "Source: Open-Meteo"
        );

    } catch (error) {
        throw new Error("Weather error: " + error.message);
    }
}

// ===== 6. LOCAL COMMANDS =====

async function handleTools(text) {
    const t = text.toLowerCase().trim();

    // Weather
    if (/\b(weather|temperature|forecast)\b/.test(t)) {
        const match = t.match(/\b(?:in|for|at)\s+(.+?)(?:\s+today|\s+now)?$/);

        const location = match
            ? match[1].trim()
            : "Vijayawada";

        return await getWeather(location);
    }

    // Time
    if (/\b(time|clock)\b/.test(t)) {
        return "Current time: " +
            new Date().toLocaleTimeString("en-IN");
    }

    // Date
    if (/\b(date|today)\b/.test(t)) {
        return "Today's date: " +
            new Date().toLocaleDateString("en-IN");
    }

    // Day
    if (/\b(day|weekday)\b/.test(t)) {
        return "Today is " +
            new Date().toLocaleDateString("en-IN", {
                weekday: "long"
            });
    }

    // Websites
    const websites = {
        "open google": "https://www.google.com",
        "open youtube": "https://www.youtube.com",
        "open gmail": "https://mail.google.com",
        "open facebook": "https://www.facebook.com",
        "open instagram": "https://www.instagram.com",
        "open whatsapp": "https://web.whatsapp.com"
    };

    if (websites[t]) {
        window.open(websites[t], "_blank");
        return "Opening " + t.replace("open ", "");
    }

    // Google search
    if (t.startsWith("search for ")) {
        const q = t.slice(11).trim();

        if (!q) return "What should I search for?";

        window.open(
            "https://www.google.com/search?q=" +
            encodeURIComponent(q),
            "_blank"
        );

        return "Searching Google for " + q;
    }

    // YouTube search
    if (t.startsWith("play ")) {
        const q = t.slice(5).trim();

        if (!q) return "What should I search for?";

        window.open(
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(q),
            "_blank"
        );

        return "Searching YouTube for " + q;
    }

    // Calculator
    if (t.startsWith("calculate ")) {
        const expression = t.slice(10).trim();

        if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
            return "Invalid mathematical expression.";
        }

        try {
            const result = Function(
                '"use strict"; return (' + expression + ')'
            )();

            return Number.isFinite(result)
                ? "The answer is " + result
                : "Invalid calculation.";

        } catch {
            return "Unable to calculate.";
        }
    }

    // Battery
    if (t.includes("battery")) {
        if (!navigator.getBattery) {
            return "Battery information unavailable.";
        }

        try {
            const battery = await navigator.getBattery();

            return "Battery level: " +
                Math.round(battery.level * 100) + "%";

        } catch {
            return "Unable to read battery.";
        }
    }

    // Internet
    if (t.includes("internet") || t.includes("connection")) {
        return navigator.onLine
            ? "Internet connection is online."
            : "Internet connection is offline.";
    }

    // Greetings
    if (/^(hello|hi|hey)\b/.test(t)) {
        return "Hello! JARVIS is online. How can I help you?";
    }

    return null;
}

// ===== 7. GEMINI ERROR HANDLING =====

function getGeminiErrorMessage(code, data) {
    const message = data?.error?.message || "";

    if (code === 429) {
        return "Gemini quota exceeded. Please try again later or check your API usage.";
    }

    if (code === 400) {
        return "Gemini rejected the request. Check the message or image format.";
    }

    if (code === 401 || code === 403) {
        return "API key invalid or Gemini access denied.";
    }

    if (code === 404) {
        return "Gemini model not found. Check the model name.";
    }

    if (code >= 500) {
        return "Google Gemini service is temporarily unavailable.";
    }

    return message || "Gemini API error: " + code;
}

// ===== 8. GEMINI CONNECTION =====

async function askGemini(message, imageData = null) {
    if (!API_KEY) {
        const enteredKey = prompt("Enter your Gemini API key:");

        if (!enteredKey || !enteredKey.trim()) {
            throw new Error("Gemini API key is required.");
        }

        API_KEY = enteredKey.trim();

        localStorage.setItem("jarvis_key", API_KEY);
    }

    const parts = [
        { text: message || "Describe this image." }
    ];

    if (imageData) {
        if (!imageData.mimeType || !imageData.data) {
            throw new Error("Image type or data is missing.");
        }

        parts.push({
            inline_data: {
                mime_type: imageData.mimeType,
                data: imageData.data
            }
        });
    }

    const validHistory = chatHistory.filter(item =>
        item &&
        (item.role === "user" || item.role === "model") &&
        Array.isArray(item.parts)
    );

    const contents = [
        ...validHistory,
        {
            role: "user",
            parts
        }
    ];

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 45000);

    try {
        const response = await fetch(API_URL, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": API_KEY
            },

            body: JSON.stringify({
                contents,

                systemInstruction: {
                    parts: [{
                        text:
                            "You are JARVIS, a helpful personal AI assistant. " +
                            "Answer accurately, clearly and concisely. " +
                            "You can help with education, technology and daily tasks."
                    }]
                },

                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024
                }
            }),

            signal: controller.signal
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Gemini returned an unreadable response.");
        }

        if (!response.ok) {
            throw new Error(
                getGeminiErrorMessage(response.status, data)
            );
        }

        const answer = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!answer) {
            throw new Error(
                data.promptFeedback?.blockReason
                    ? "Response blocked: " +
                      data.promptFeedback.blockReason
                    : "Gemini returned an empty response."
            );
        }

        chatHistory.push(
            {
                role: "user",
                parts: [{ text: message || "Describe this image." }]
            },
            {
                role: "model",
                parts: [{ text: answer }]
            }
        );

        chatHistory = chatHistory.slice(-12);

        try {
            localStorage.setItem(
                "jarvis_history",
                JSON.stringify(chatHistory)
            );
        } catch (error) {
            console.warn("History save failed:", error);
        }

        return answer;

    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Request timed out. Please try again.");
        }

        throw error;

    } finally {
        clearTimeout(timeout);
    }
}

// ===== 9. MAIN MESSAGE PROCESSOR =====

async function sendMessage(imageData = null) {
    if (!input || busy) return;

    const message = input.value.trim();

    if (!message && !imageData) return;

    if (!navigator.onLine) {
        addMessage("No internet connection.", "ai");
        setStatus("NO INTERNET CONNECTION");
        return;
    }

    busy = true;

    if (sendBtn) sendBtn.disabled = true;

    if (message) {
        addMessage(message, "user");
    }

    input.value = "";

    setStatus("PROCESSING...");

    try {
        let answer;

        const toolResult = imageData
            ? null
            : await handleTools(message);

        if (toolResult !== null) {
            answer = toolResult;
        } else {
            answer = await askGemini(message, imageData);
        }

        addMessage(answer, "ai");

        speak(answer);

        setStatus("SYSTEM READY");

    } catch (error) {
        console.error("JARVIS ERROR:", error);

        addMessage(
            "Error: " + (error.message || "Unknown error."),
            "ai"
        );

        setStatus(
            /quota|usage limit|rate limit/i.test(error.message || "")
                ? "QUOTA LIMIT"
                : "CONNECTION ERROR"
        );

    } finally {
        busy = false;

        if (sendBtn) sendBtn.disabled = false;

        if (input) input.focus();

        if (wakeWordEnabled && !wakeCommandPending) {
            setTimeout(startWakeWordListening, 800);
        }
    }
}

// ===== 10. SEND BUTTON =====

if (sendBtn) {
    sendBtn.addEventListener("click", () => sendMessage());
}

if (input) {
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });
}

// ===== 11. MICROPHONE =====

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

function startManualMicrophone() {
    if (!SpeechRecognition) {
        addMessage("Voice recognition is not supported.", "ai");
        return;
    }

    if (busy) return;

    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";

    recognition.onstart = () => setStatus("LISTENING...");

    recognition.onresult = event => {
        const transcript =
            event.results[0][0].transcript.trim();

        if (transcript && input) {
            input.value = transcript;
            sendMessage();
        }
    };

    recognition.onerror = event => {
        addMessage("Microphone error: " + event.error, "ai");
        setStatus("SYSTEM READY");
    };

    recognition.onend = () => {
        if (!busy && !wakeWordEnabled) {
            setStatus("SYSTEM READY");
        }
    };

    try {
        recognition.start();
    } catch (error) {
        console.error(error);
        addMessage("Could not start microphone.", "ai");
    }
}

if (micBtn) {
    micBtn.addEventListener("click", startManualMicrophone);
}

// ===== 12. WAKE WORD =====

function startWakeWordListening() {
    if (
        !SpeechRecognition ||
        !wakeWordEnabled ||
        busy ||
        wakeCommandPending
    ) return;

    if (wakeRecognizer) {
        try {
            wakeRecognizer.onend = null;
            wakeRecognizer.stop();
        } catch {}
    }

    wakeRecognizer = new SpeechRecognition();

    wakeRecognizer.continuous = true;
    wakeRecognizer.interimResults = true;
    wakeRecognizer.lang = "en-IN";

    wakeRecognizer.onresult = event => {
        let transcript = "";

        for (
            let i = event.resultIndex;
            i < event.results.length;
            i++
        ) {
            transcript +=
                event.results[i][0].transcript + " ";
        }

        transcript = transcript.toLowerCase().trim();

        if (transcript.includes(WAKE_WORD)) {
            wakeCommandPending = true;

            updateWakeStatus("JARVIS ACTIVATED", "#00ff00");

            setStatus("JARVIS ACTIVATED");

            wakeRecognizer.stop();

            speak("Yes?");

            setTimeout(listenForWakeCommand, 1000);
        }
    };

    wakeRecognizer.onerror = event => {
        console.error("Wake word error:", event.error);

        if (
            event.error === "not-allowed" ||
            event.error === "service-not-allowed"
        ) {
            wakeWordEnabled = false;

            if (wakeBtn) wakeBtn.classList.remove("active");

            updateWakeStatus(
                "MICROPHONE PERMISSION REQUIRED",
                "#ff4444"
            );
        }
    };

    wakeRecognizer.onend = () => {
        if (
            wakeWordEnabled &&
            !busy &&
            !wakeCommandPending
        ) {
            setTimeout(startWakeWordListening, 1000);
        }
    };

    try {
        wakeRecognizer.start();
        setStatus("LISTENING FOR HEY JARVIS...");
    } catch (error) {
        console.error("Wake listener:", error);
    }
}

function listenForWakeCommand() {
    if (!SpeechRecognition || !wakeWordEnabled || busy) {
        wakeCommandPending = false;
        return;
    }

    commandRecognizer = new SpeechRecognition();

    commandRecognizer.continuous = false;
    commandRecognizer.interimResults = false;
    commandRecognizer.lang = "en-IN";

    commandRecognizer.onresult = event => {
        const command =
            event.results[0][0].transcript.trim();

        if (command && input) {
            input.value = command;
            sendMessage();
        }
    };

    commandRecognizer.onerror = event => {
        console.error("Command recognition:", event.error);
    };

    commandRecognizer.onend = () => {
        wakeCommandPending = false;

        if (wakeWordEnabled && !busy) {
            setTimeout(startWakeWordListening, 1000);
        }
    };

    try {
        commandRecognizer.start();
        setStatus("LISTENING FOR COMMAND...");
    } catch (error) {
        console.error(error);
        wakeCommandPending = false;
        startWakeWordListening();
    }
}

function stopWakeWordListening() {
    if (wakeRecognizer) {
        try {
            wakeRecognizer.onend = null;
            wakeRecognizer.stop();
        } catch {}
    }

    if (commandRecognizer) {
        try {
            commandRecognizer.onend = null;
            commandRecognizer.stop();
        } catch {}
    }

    wakeRecognizer = null;
    commandRecognizer = null;
    wakeCommandPending = false;
}

function toggleWakeWord() {
    if (!SpeechRecognition) {
        addMessage("Wake word is not supported.", "ai");
        return;
    }

    wakeWordEnabled = !wakeWordEnabled;

    if (wakeWordEnabled) {
        if (wakeBtn) wakeBtn.classList.add("active");

        updateWakeStatus("WAKE: ON", "#00ff00");

        startWakeWordListening();

    } else {
        stopWakeWordListening();

        if (wakeBtn) wakeBtn.classList.remove("active");

        updateWakeStatus("WAKE: OFF", "#888");

        setStatus("SYSTEM READY");
    }
}

if (wakeBtn) {
    wakeBtn.addEventListener("click", toggleWakeWord);
}

// ===== 13. IMAGE READER =====

function readImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = reader.result;

            if (
                typeof result !== "string" ||
                !result.includes(",")
            ) {
                reject(new Error("Could not read image."));
                return;
            }

            const mimeType =
                result.slice(5, result.indexOf(";"));

            const data = result.split(",")[1];

            if (!mimeType || !data) {
                reject(new Error("Image type or data is missing."));
                return;
            }

            resolve({ mimeType, data });
        };

        reader.onerror = () => {
            reject(new Error("Image reading failed."));
        };

        reader.readAsDataURL(file);
    });
}
// ===== 14. CAMERA AND IMAGE UPLOAD =====

if (camBtn && imageInput) {
    camBtn.addEventListener("click", () => {
        imageInput.click();
    });

    imageInput.addEventListener("change", async () => {
        const file = imageInput.files[0];

        if (!file) return;

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.type)) {
            addMessage("Choose a JPG, PNG or WEBP image.", "ai");
            imageInput.value = "";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            addMessage("Choose an image under 5 MB.", "ai");
            imageInput.value = "";
            return;
        }

        try {
            setStatus("READING IMAGE...");

            const imageData = await readImage(file);

            await sendMessage(imageData);

        } catch (error) {
            addMessage("Image error: " + error.message, "ai");
            setStatus("SYSTEM READY");

        } finally {
            imageInput.value = "";
        }
    });
}
// ===== 15. CLEAR MEMORY =====

if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        if (busy) return;

        chatHistory = [];

        localStorage.removeItem("jarvis_history");

        if (chat) chat.innerHTML = "";

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }

        addMessage("Memory cleared. JARVIS is ready!", "ai");

        setStatus("SYSTEM READY");
    });
}

// ===== 16. INTERNET STATUS =====

window.addEventListener("online", () => {
    setStatus("SYSTEM READY");
});

window.addEventListener("offline", () => {
    setStatus("NO INTERNET CONNECTION");
});

// ===== 17. STARTUP =====

const requiredElements = {
    input,
    sendBtn,
    micBtn,
    camBtn,
    clearBtn,
    imageInput,
    chat,
    status
};

for (const [name, element] of Object.entries(requiredElements)) {
    if (!element) {
        console.error("JARVIS: Missing HTML element:", name);
    }
}

setStatus("SYSTEM READY");

addMessage(
    "Systems online. J.A.R.V.I.S. is ready!",
    "ai"
);

console.log("J.A.R.V.I.S initialized successfully.");
