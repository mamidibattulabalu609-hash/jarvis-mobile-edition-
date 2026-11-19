/* =====================================================
   J.A.R.V.I.S. PERSONAL AI ASSISTANT
   Gemini 3.6 Flash | Chat | Voice | Camera | Memory | Weather
   =====================================================

   IMPORTANT:
   - This is a browser-side learning/demo project.
   - A Gemini API key stored in browser storage is visible to
     anyone who can inspect the browser. Do not publish this
     project with a real key. For a public app, use a backend.
*/

"use strict";

// ==================== 1. CONFIGURATION ====================

const CONFIG = {
    MODEL: "gemini-3.6-flash",
    API_BASE: "https://generativelanguage.googleapis.com/v1beta/models/",
    MAX_SAVED_MESSAGES: 20,
    MAX_CONTEXT_MESSAGES: 8,
    MAX_OUTPUT_TOKENS: 700,
    RETRIES: 1
};

// ==================== 2. STATE ====================

let apiKey = localStorage.getItem("jarvis_key") || "";
let chatHistory = [];

try {
    const savedHistory = JSON.parse(
        localStorage.getItem("jarvis_history") || "[]"
    );
    chatHistory = Array.isArray(savedHistory) ? savedHistory : [];
} catch (error) {
    console.warn("Chat history could not be loaded:", error);
    chatHistory = [];
}

let isBusy = false;
let speechRecognition = null;
let wakeRecognition = null;
let isListening = false;
let wakeEnabled = false;

// ==================== 3. HTML ELEMENTS ====================

const input = document.getElementById("msg");
const sendButton = document.getElementById("send");
const micButton = document.getElementById("mic-btn");
const cameraButton = document.getElementById("cam-btn");
const clearButton = document.getElementById("clear-btn");
const wakeButton = document.getElementById("wake-btn");
const wakeStatus = document.getElementById("wake-status");
const imageInput = document.getElementById("img-input");
const chatBox = document.getElementById("chat");
const systemStatus = document.getElementById("system-status");

const wait = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds));

// ==================== 4. UI AND CHAT HISTORY ====================

function setStatus(message) {
    if (systemStatus) {
        systemStatus.textContent = message;
    }
}

function addMessage(message, type = "ai") {
    if (!chatBox) return;

    const messageElement = document.createElement("div");
    messageElement.className = "msg " + type;

    const prefix = type === "user" ? "YOU: " : "J.A.R.V.I.S: ";
    messageElement.textContent = prefix + message;

    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function saveHistory() {
    try {
        chatHistory = chatHistory.slice(-CONFIG.MAX_SAVED_MESSAGES);
        localStorage.setItem("jarvis_history", JSON.stringify(chatHistory));
    } catch (error) {
        console.warn("Could not save chat history:", error);
    }
}

function restoreChat() {
    if (!chatBox) return;

    chatBox.innerHTML = "";

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
            addMessage(
                messageText,
                item.role === "user" ? "user" : "ai"
            );
        }
    });
}

// ==================== 5. VOICE REPLY ====================

function speak(message) {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onstart = () => setStatus("SPEAKING...");
    utterance.onend = () => setStatus("SYSTEM READY");
    utterance.onerror = () => setStatus("SYSTEM READY");

    window.speechSynthesis.speak(utterance);
}

// ==================== 6. VOICE INPUT ====================

function getSpeechRecognition() {
    return window.SpeechRecognition ||
        window.webkitSpeechRecognition ||
        null;
}

function stopVoiceInput() {
    if (speechRecognition) {
        try {
            speechRecognition.onresult = null;
            speechRecognition.onerror = null;
            speechRecognition.onend = null;
            speechRecognition.stop();
        } catch (error) {
            console.warn("Voice stop error:", error);
        }
    }

    speechRecognition = null;
    isListening = false;

    if (micButton) {
        micButton.classList.remove("active");
    }
}

function startVoiceInput() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage(
            "Voice input is not supported in this browser. Please try Chrome.",
            "ai"
        );
        setStatus("VOICE NOT SUPPORTED");
        return;
    }

    if (isListening) {
        stopVoiceInput();
        setStatus("SYSTEM READY");
        return;
    }

    stopVoiceInput();

    speechRecognition = new SpeechRecognition();
    speechRecognition.lang = "en-IN";
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;
    speechRecognition.maxAlternatives = 1;

    isListening = true;

    if (micButton) {
        micButton.classList.add("active");
    }

    setStatus("LISTENING...");

    speechRecognition.onresult = event => {
        const transcript =
            event.results?.[0]?.[0]?.transcript?.trim() || "";

        stopVoiceInput();

        if (!transcript) {
            setStatus("SYSTEM READY");
            return;
        }

        if (input) {
            input.value = transcript;
        }

        sendMessage();
    };

    speechRecognition.onerror = event => {
        stopVoiceInput();

        if (event.error === "not-allowed" ||
            event.error === "service-not-allowed") {
            addMessage(
                "Microphone permission denied. Allow microphone access in browser settings.",
                "ai"
            );
        } else if (event.error === "no-speech") {
            addMessage(
                "I did not hear anything. Tap the microphone and try again.",
                "ai"
            );
        } else {
            addMessage("Voice error: " + event.error, "ai");
        }

        setStatus("VOICE ERROR");
    };

    speechRecognition.onend = () => {
        isListening = false;

        if (micButton) {
            micButton.classList.remove("active");
        }

        if (systemStatus &&
            systemStatus.textContent === "LISTENING...") {
            setStatus("SYSTEM READY");
        }
    };

    try {
        speechRecognition.start();
    } catch (error) {
        stopVoiceInput();
        addMessage("Could not start the microphone. Try again.", "ai");
        setStatus("MICROPHONE ERROR");
        console.error(error);
    }
}

if (micButton) {
    micButton.addEventListener("click", startVoiceInput);
}

// ==================== 7. WAKE WORD ====================

function stopWakeMode() {
    if (wakeRecognition) {
        try {
            wakeRecognition.onresult = null;
            wakeRecognition.onerror = null;
            wakeRecognition.onend = null;
            wakeRecognition.stop();
        } catch (error) {
            console.warn("Wake listener stop error:", error);
        }
    }

    wakeRecognition = null;
    wakeEnabled = false;

    if (wakeStatus) {
        wakeStatus.textContent = "WAKE: OFF";
    }

    if (wakeButton) {
        wakeButton.classList.remove("active");
    }
}

function startWakeMode() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage(
            "Wake-word listening is not supported in this browser.",
            "ai"
        );
        return;
    }

    stopWakeMode();

    wakeRecognition = new SpeechRecognition();
    wakeRecognition.lang = "en-IN";
    wakeRecognition.continuous = true;
    wakeRecognition.interimResults = false;

    wakeEnabled = true;

    if (wakeStatus) {
        wakeStatus.textContent = "WAKE: ON";
    }

    if (wakeButton) {
        wakeButton.classList.add("active");
    }

    setStatus("WAITING FOR HEY JARVIS...");

    wakeRecognition.onresult = event => {
        const lastResult = event.results[event.results.length - 1];
        const spokenText =
            lastResult?.[0]?.transcript?.trim() || "";

        const lowerText = spokenText.toLowerCase();
        const wakeIndex = lowerText.indexOf("hey jarvis");

        if (wakeIndex !== -1) {
            const command = spokenText
                .slice(wakeIndex + "hey jarvis".length)
                .trim();

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
        console.warn("Wake-word recognition error:", event.error);

        if (event.error === "not-allowed" ||
            event.error === "service-not-allowed") {
            stopWakeMode();
            addMessage("Microphone permission is required.", "ai");
            setStatus("MICROPHONE PERMISSION NEEDED");
        }
    };

    wakeRecognition.onend = () => {
        if (wakeEnabled && wakeRecognition) {
            try {
                wakeRecognition.start();
            } catch (error) {
                console.warn("Wake listener restart failed:", error);
            }
        }
    };

    try {
        wakeRecognition.start();
    } catch (error) {
        stopWakeMode();
        addMessage("Could not start wake-word mode. Try again.", "ai");
        setStatus("MICROPHONE ERROR");
    }
}

if (wakeButton) {
    wakeButton.addEventListener("click", () => {
        if (wakeEnabled) {
            stopWakeMode();
            setStatus("SYSTEM READY");
        } else {
            startWakeMode();
        }
    });
}

// ==================== 8. CAMERA AND IMAGE ====================

function openCamera() {
    if (!imageInput) {
        addMessage("Image input is missing from the HTML page.", "ai");
        return;
    }

    imageInput.click();
}

if (cameraButton) {
    cameraButton.addEventListener("click", openCamera);
}

function readImageAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            if (typeof reader.result !== "string") {
                reject(new Error("Could not read the image."));
                return;
            }

            resolve(reader.result.split(",")[1]);
        };

        reader.onerror = () => {
            reject(new Error("Image reading failed."));
        };

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
            setStatus("READING IMAGE...");

            const base64Data = await readImageAsBase64(file);

            if (input && !input.value.trim()) {
                input.value = "Please describe this image.";
            }

            await sendMessage({
                mimeType: file.type,
                data: base64Data
            });
        } catch (error) {
            console.error("Image error:", error);
            addMessage("Image error: " + error.message, "ai");
            setStatus("IMAGE ERROR");
        } finally {
            imageInput.value = "";
        }
    });
}

// ==================== 9. WEATHER ====================

async function getWeather(command) {
    const match = command.match(
        /\b(?:weather|temperature|forecast)\s+(?:in|for|at)\s+([a-zA-Z\s]+?)(?:\?|$)/i
    );

    const city = match ? match[1].trim() : "Hyderabad";

    try {
        setStatus("FETCHING WEATHER...");

        const geoURL =
            "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(city) +
            "&count=1&language=en&format=json";

        const geoResponse = await fetch(geoURL);

        if (!geoResponse.ok) {
            throw new Error("Location lookup failed.");
        }

        const geoData = await geoResponse.json();

        if (!geoData.results || geoData.results.length === 0) {
            return "I could not find weather information for " + city + ".";
        }

        const place = geoData.results[0];

        const weatherURL =
            "https://api.open-meteo.com/v1/forecast?latitude=" +
            encodeURIComponent(place.latitude) +
            "&longitude=" +
            encodeURIComponent(place.longitude) +
            "&current=temperature_2m,wind_speed_10m";

        const weatherResponse = await fetch(weatherURL);

        if (!weatherResponse.ok) {
            throw new Error("Weather service returned an error.");
        }

        const weatherData = await weatherResponse.json();
        const current = weatherData.current;

        if (!current) {
            throw new Error("Current weather data is unavailable.");
        }

        return "Current temperature in " + place.name + " is " +
            current.temperature_2m + " degrees Celsius. Wind speed is " +
            current.wind_speed_10m + " kilometres per hour.";
    } catch (error) {
        console.error("Weather request failed:", error);
        return "I could not retrieve weather information right now.";
    } finally {
        setStatus("SYSTEM READY");
    }
}

// ==================== 10. LOCAL COMMANDS ====================

async function handleLocalCommand(command) {
    const text = command.toLowerCase().trim();

    if (/\b(weather|temperature|forecast)\b/.test(text)) {
        return await getWeather(command);
    }

    if (/\b(time|clock)\b/.test(text)) {
        return "Current time: " +
            new Date().toLocaleTimeString("en-IN");
    }

    if (/\b(date|today's date|what day is today)\b/.test(text)) {
        return "Today's date: " +
            new Date().toLocaleDateString("en-IN");
    }

    if (/\b(day of week|weekday)\b/.test(text)) {
        return "Today is " +
            new Date().toLocaleDateString("en-IN", {
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

    for (const phrase of Object.keys(websites)) {
        if (text.includes(phrase)) {
            const siteName = phrase.replace("open ", "");
            window.open(
                websites[phrase],
                "_blank",
                "noopener,noreferrer"
            );
            return "Opening " + siteName + ".";
        }
    }

    return null;
}

// ==================== 11. GEMINI 3.6 FLASH API ====================

async function getApiKey() {
    if (apiKey) return apiKey;

    const enteredKey = window.prompt("Enter your Gemini API key:");

    if (!enteredKey || !enteredKey.trim()) {
        throw new Error("No Gemini API key was entered.");
    }

    apiKey = enteredKey.trim();

    try {
        localStorage.setItem("jarvis_key", apiKey);
    } catch (error) {
        console.warn("Could not save API key in this browser:", error);
    }

    return apiKey;
}

async function callGemini(contents) {
    const key = await getApiKey();

    const endpoint =
        CONFIG.API_BASE +
        CONFIG.MODEL +
        ":generateContent";

    let lastError = null;

    for (let attempt = 0; attempt <= CONFIG.RETRIES; attempt++) {
        try {
            const response = await fetch(endpoint, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": key
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [{
                            text:
                                "You are J.A.R.V.I.S., a helpful personal AI assistant. " +
                                "Give clear, accurate, concise answers. " +
                                "Reply in the same language as the user."
                        }]
                    },
                    contents: contents,
                    generationConfig: {
                        maxOutputTokens: CONFIG.MAX_OUTPUT_TOKENS
                    }
                })
            });

            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                const answer = data.candidates?.[0]?.content?.parts
                    ?.map(part => part.text || "")
                    .join("")
                    .trim();

                if (!answer) {
                    throw new Error(
                        data.promptFeedback?.blockReason
                            ? "Request blocked: " + data.promptFeedback.blockReason
                            : "Gemini returned an empty response."
                    );
                }

                return answer;
            }

            const apiMessage =
                data.error?.message ||
                ("Gemini API error: HTTP " + response.status);

            lastError = new Error(apiMessage);

            // Retry only temporary rate-limit/server errors once.
            if (
                attempt < CONFIG.RETRIES &&
                [429, 500, 502, 503, 504].includes(response.status)
            ) {
                setStatus("RETRYING...");
                await wait(700);
                continue;
            }

            throw lastError;
        } catch (error) {
            lastError = error;

            if (attempt < CONFIG.RETRIES &&
                !(error instanceof TypeError)) {
                throw error;
            }

            if (attempt < CONFIG.RETRIES) {
                setStatus("RECONNECTING...");
                await wait(700);
                continue;
            }
        }
    }

    throw lastError || new Error("Gemini request failed.");
}

// ==================== 12. SEND MESSAGE ====================

async function sendMessage(imageData = null) {
    if (isBusy) return;

    const userText = input ? input.value.trim() : "";

    if (!userText && !imageData) return;

    isBusy = true;

    if (input) {
        input.value = "";
    }

    addMessage(userText || "Image attached", "user");

    try {
        // Handle local commands without calling Gemini.
        if (!imageData) {
            const localReply = await handleLocalCommand(userText);

            if (localReply) {
                addMessage(localReply, "ai");
                speak(localReply);
                setStatus("SYSTEM READY");
                return;
            }
        }

        setStatus(imageData ? "ANALYZING IMAGE..." : "THINKING...");

        const userParts = [];

        if (userText) {
            userParts.push({ text: userText });
        }

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

        const answer = await callGemini(requestContents);

        chatHistory.push(
