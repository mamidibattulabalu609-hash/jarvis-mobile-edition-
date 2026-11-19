/* ==========================================
   J.A.R.V.I.S. PERSONAL AI ASSISTANT
   Gemini + Voice + Camera + Memory + Weather
   Fixed version
========================================== */

// IMPORTANT:
// This browser-only version is suitable for local testing.
// Do not publish your API key in a public website or public repository.

const CONFIG = {
    MODELS: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
    API_BASE: "https://generativelanguage.googleapis.com/v1beta/models/",
    MAX_HISTORY_MESSAGES: 20,
    MAX_CONTEXT_MESSAGES: 10
};

// ===== 1. STATE =====
let API_KEY = localStorage.getItem("jarvis_key") || "";
let chatHistory = [];

try {
    const saved = JSON.parse(localStorage.getItem("jarvis_history") || "[]");
    chatHistory = Array.isArray(saved) ? saved : [];
} catch {
    chatHistory = [];
}

let busy = false;
let recognition = null;
let wakeRecognition = null;
let isListening = false;
let wakeEnabled = false;

// ===== 2. HTML ELEMENTS =====
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");
const wakeBtn = document.getElementById("wake-btn");
const wakeStatus = document.getElementById("wake-status");
const imageInput = document.getElementById("img-input");
const chat = document.getElementById("chat");
const statusElement = document.getElementById("system-status");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ===== 3. CHAT DISPLAY AND MEMORY =====
function addMessage(message, type = "ai") {
    if (!chat) return;

    const div = document.createElement("div");
    div.className = "msg " + type;
    div.textContent = (type === "user" ? "YOU: " : "J.A.R.V.I.S: ") + message;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function setStatus(message) {
    if (statusElement) statusElement.textContent = message;
}

function saveHistory() {
    try {
        chatHistory = chatHistory.slice(-CONFIG.MAX_HISTORY_MESSAGES);
        localStorage.setItem("jarvis_history", JSON.stringify(chatHistory));
    } catch (error) {
        console.warn("Could not save chat history:", error);
    }
}

function restoreChat() {
    if (!chat) return;

    chat.innerHTML = "";

    if (chatHistory.length === 0) {
        addMessage("Systems online. How may I assist you?", "ai");
        return;
    }

    chatHistory.forEach(item => {
        const messageText = item.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (messageText) {
            addMessage(messageText, item.role === "user" ? "user" : "ai");
        }
    });
}

// ===== 4. TEXT-TO-SPEECH =====
function speak(text) {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => setStatus("SPEAKING...");
    utterance.onend = () => setStatus("SYSTEM READY");
    utterance.onerror = () => setStatus("SYSTEM READY");

    window.speechSynthesis.speak(utterance);
}

// ===== 5. SPEECH RECOGNITION =====
function getSpeechRecognition() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function stopVoiceInput() {
    if (recognition) {
        try {
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;
            recognition.stop();
        } catch (error) {
            console.warn("Could not stop speech recognition:", error);
        }
    }

    recognition = null;
    isListening = false;
    if (micBtn) micBtn.classList.remove("active");
}

function startVoiceInput() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage("Voice input is not supported in this browser. Try Chrome.", "ai");
        setStatus("VOICE NOT SUPPORTED");
        return;
    }

    if (isListening) {
        stopVoiceInput();
        setStatus("SYSTEM READY");
        return;
    }

    stopVoiceInput();

    recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    isListening = true;
    if (micBtn) micBtn.classList.add("active");
    setStatus("LISTENING...");

    recognition.onresult = event => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();

        stopVoiceInput();

        if (!transcript) {
            setStatus("SYSTEM READY");
            return;
        }

        if (input) input.value = transcript;
        sendMessage();
    };

    recognition.onerror = event => {
        stopVoiceInput();
        console.error("Speech recognition error:", event.error);

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            addMessage("Microphone permission was denied. Allow microphone access in your browser settings.", "ai");
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
        stopVoiceInput();
        console.error("Could not start microphone:", error);
        addMessage("Could not start the microphone. Please try again.", "ai");
        setStatus("MICROPHONE ERROR");
    }
}

if (micBtn) micBtn.addEventListener("click", startVoiceInput);

// ===== 6. OPTIONAL WAKE-WORD MODE =====
// Tap the microphone icon in the top bar to enable/disable "Hey Jarvis".
function stopWakeMode() {
    if (wakeRecognition) {
        try {
            wakeRecognition.onresult = null;
            wakeRecognition.onerror = null;
            wakeRecognition.onend = null;
            wakeRecognition.stop();
        } catch (error) {
            console.warn("Could not stop wake-word listener:", error);
        }
    }

    wakeRecognition = null;
    wakeEnabled = false;

    if (wakeStatus) wakeStatus.textContent = "WAKE: OFF";
    if (wakeBtn) wakeBtn.classList.remove("active");
}

function startWakeMode() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage("Wake-word listening is not supported in this browser.", "ai");
        return;
    }

    stopWakeMode();

    wakeRecognition = new SpeechRecognition();
    wakeRecognition.lang = "en-IN";
    wakeRecognition.continuous = true;
    wakeRecognition.interimResults = false;

    wakeEnabled = true;
    if (wakeStatus) wakeStatus.textContent = "WAKE: ON";
    if (wakeBtn) wakeBtn.classList.add("active");
    setStatus("WAITING FOR HEY JARVIS...");

    wakeRecognition.onresult = event => {
        const result = event.results[event.results.length - 1];
        const spoken = result?.[0]?.transcript?.trim() || "";
        const lower = spoken.toLowerCase();
        const phraseIndex = lower.indexOf("hey jarvis");

        if (phraseIndex !== -1) {
            const command = spoken.slice(phraseIndex + "hey jarvis".length).trim();
            stopWakeMode();

            if (command) {
                if (input) input.value = command;
                sendMessage();
            } else {
                addMessage("I'm listening. Please say your command.", "ai");
                startVoiceInput();
            }
        }
    };

    wakeRecognition.onerror = event => {
        console.warn("Wake-word error:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            stopWakeMode();
            addMessage("Microphone permission is required for wake-word mode.", "ai");
            setStatus("MICROPHONE PERMISSION NEEDED");
        }
    };

    wakeRecognition.onend = () => {
        // Some browsers stop continuous recognition automatically.
        if (wakeEnabled && wakeRecognition) {
            try {
                wakeRecognition.start();
            } catch (error) {
                console.warn("Wake-word restart failed:", error);
            }
        }
    };

    try {
        wakeRecognition.start();
    } catch (error) {
        stopWakeMode();
        addMessage("Could not start wake-word mode. Please try again.", "ai");
        setStatus("MICROPHONE ERROR");
    }
}

if (wakeBtn) {
    wakeBtn.addEventListener("click", () => {
        if (wakeEnabled) {
            stopWakeMode();
            setStatus("SYSTEM READY");
        } else {
            startWakeMode();
        }
    });
}

// ===== 7. CAMERA AND IMAGE INPUT =====
function openCamera() {
    if (!imageInput) {
        addMessage("Image input is missing from the HTML page.", "ai");
        return;
    }

    imageInput.click();
}

if (camBtn) camBtn.addEventListener("click", openCamera);

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result !== "string") {
                reject(new Error("Could not read the selected image."));
                return;
            }

            resolve(reader.result.split(",")[1]);
        };

        reader.onerror = () => reject(new Error("Image file reading failed."));
        reader.readAsDataURL(file);
    });
}

if (imageInput) {
    imageInput.addEventListener("change", async () => {
        const file = imageInput.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            addMessage("Please select a valid image.", "ai");
            imageInput.value = "";
            return;
        }

        try {
            setStatus("PROCESSING IMAGE...");
            const base64 = await fileToBase64(file);

            if (input && !input.value.trim()) {
                input.value = "Please describe this image.";
            }

            await sendMessage({
                mimeType: file.type,
                data: base64
            });
        } catch (error) {
            console.error("Image processing error:", error);
            addMessage("Unable to process this image: " + error.message, "ai");
            setStatus("IMAGE ERROR");
        } finally {
            imageInput.value = "";
        }
    });
}

// ===== 8. WEATHER =====
async function getWeather(userPrompt) {
    const match = userPrompt.match(/\b(?:weather|temperature|forecast)\s+(?:in|for|at)\s+([a-zA-Z\s]+?)(?:\?|$)/i);
    const city = match ? match[1].trim() : "Hyderabad";

    try {
        setStatus("FETCHING WEATHER...");

        const geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(city) + "&count=1&language=en&format=json";

        const geoResponse = await fetch(geoUrl);
        if (!geoResponse.ok) throw new Error("Weather location lookup failed.");

        const geoData = await geoResponse.json();

        if (!geoData.results?.length) {
            return "I could not find weather information for " + city + ".";
        }

        const place = geoData.results[0];

        const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=" +
            encodeURIComponent(place.latitude) +
            "&longitude=" + encodeURIComponent(place.longitude) +
            "&current=temperature_2m,wind_speed_10m";

        const weatherResponse = await fetch(weatherUrl);
        if (!weatherResponse.ok) throw new Error("Weather service returned an error.");

        const weatherData = await weatherResponse.json();
        const current = weatherData.current;

        if (!current) throw new Error("Current weather data is unavailable.");

        return "The current temperature in " + place.name + " is " +
            current.temperature_2m + "°C. Wind speed is " +
            current.wind_speed_10m + " km/h.";
    } catch (error) {
        console.error("Weather error:", error);
        return "I could not retrieve weather information right now. Please try again.";
    } finally {
        setStatus("SYSTEM READY");
    }
}

// ===== 9. LOCAL COMMANDS =====
async function handleTools(commandText) {
    const t = commandText.toLowerCase().trim();

    if (/\b(weather|temperature|forecast)\b/.test(t)) {
        return getWeather(commandText);
    }

    if (/\b(time|clock)\b/.test(t)) {
        return "Current time: " + new Date().toLocaleTimeString("en-IN");
    }

    if (/\b(date|today's date|what day is today)\b/.test(t)) {
        return "Today's date: " + new Date().toLocaleDateString("en-IN");
    }

    if (/\b(day of week|weekday)\b/.test(t)) {
        return "Today is " + new Date().toLocaleDateString("en-IN", {
            weekday: "long"
        });
    }

    const websites = {
        "open google": "https://www.google.com",
        "open youtube": "https://www.youtube.com",
        "open gmail": "https://mail.google.com",
        "open github": "https://github.com",
        "open instagram": "https://www.instagram.com",
        "open whatsapp": "https://www.whatsapp.com"
    };

    for (const [phrase, url] of Object.entries(websites)) {
        if (t.includes(phrase)) {
            const siteName = phrase.replace("open ", "");
            window.open(url, "_blank", "noopener,noreferrer");
            return "Opening " + siteName + ".";
        }
    }

    return null;
}

// ===== 10. GEMINI API =====
async function askGemini(contentsPayload) {
    if (!API_KEY) {
        const enteredKey = window.prompt("Enter your Gemini API key:");
        if (!enteredKey || !enteredKey.trim()) {
            throw new Error("Gemini API key was not entered.");
        }

        API_KEY = enteredKey.trim();
        localStorage.setItem("jarvis_key", API_KEY);
    }

    let lastError = null;

    for (const model of CONFIG.MODELS) {
        const url = CONFIG.API_BASE + model + ":generateContent";

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-goog-api-key": API_KEY
                    },
                    body: JSON.stringify({
                        systemInstruction: {
                            parts: [{
                                text: "You are J.A.R.V.I.S., a helpful, clear, concise personal AI assistant. Reply in the language used by the user."
                            }]
                        },
                        contents: contentsPayload,
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 1024
                        }
                    })
                });

                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    const reply = data.candidates?.[0]?.content?.parts
                        ?.map(part => part.text || "")
                        .join("")
                        .trim();

                    if (!reply) {
                        throw new Error("Gemini returned an empty response.");
                    }

                    return reply;
                }

                const message = data.error?.message || ("HTTP " + response.status);
                lastError = new Error(message);

                // Retry temporary server or rate-limit errors.
                if ([429, 500, 502, 503, 504].includes(response.status)) {
                    setStatus("RETRYING " + attempt + "/3...");
                    if (attempt < 3) {
                        await sleep(1000 * attempt);
                        continue;
                    }
                    break;
                }

                // Do not retry invalid keys, invalid requests, or unavailable models.
                if ([400, 401, 403, 404].includes(response.status)) {
                    throw lastError;
                }

                throw lastError;
            } catch (error) {
                lastError = error;

                // Network errors can be retried a limited number of times.
                if (attempt < 3 && !(error.message && /API key|permission|not found|invalid/i.test(error.message))) {
                    await sleep(1000 * attempt);
                    continue;
                }

                break;
            }
        }
    }

    throw lastError || new Error("All configured Gemini models failed. Check your model access and API key.");
}

// ===== 11. SEND MESSAGE =====
async function sendMessage(imageData = null) {
    if (busy) return;

    const messageText = input ? input.value.trim() : "";
    if (!messageText && !imageData) return;

    busy = true;
    if (input) input.value = "";

    addMessage(messageText || "Image attached", "user");

    try {
        if (!imageData) {
            const localReply = await handleTools(messageText);

            if (localReply) {
                addMessage(localReply, "ai");
                speak(localReply);
                setStatus("SYSTEM READY");
                return;
            }
        }

        setStatus(imageData ? "ANALYZING IMAGE..." : "THINKING...");

        const userParts = [];
        if (messageText) userParts.push({ text: messageText });

        if (imageData) {
            userParts.push({
                inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.data
                }
            });
        }

        const requestContents = [
            ...chatHistory.slice(-CONFIG.MAX_CONTEXT_MESSAGES),
            {
                role: "user",
                parts: userParts
            }
        ];

        const aiReply = await askGemini(requestContents);

        chatHistory.push({
            role: "user",
            parts: [{ text: messageText || "Image attached" }]
        });

        chatHistory.push({
            role: "model",
            parts: [{ text: aiReply }]
        });

        saveHistory();
        addMessage(aiReply, "ai");
        speak(aiReply);
        setStatus("SYSTEM READY");
    } catch (error) {
        console.error("J.A.R.V.I.S. error:", error);
        addMessage("Error: " + (error.message || "Unknown error"), "ai");
        setStatus("CONNECTION ERROR");
    } finally {
        busy = false;
    }
}

// ===== 12. BUTTONS AND STARTUP =====
if (sendBtn) {
    sendBtn.addEventListener("click", () => sendMessage());
}

if (input) {
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") sendMessage();
    });
}

if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        chatHistory = [];
        localStorage.removeItem("jarvis_history");
        restoreChat();
        setStatus("MEMORY CLEARED");
    });
}

restoreChat();
setStatus("SYSTEM READY");
            
