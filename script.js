/* ==========================================
   J.A.R.V.I.S PERSONAL AI ASSISTANT
   Gemini | Chat | Voice | Camera | Memory
========================================== */

"use strict";

// ============== CONFIGURATION ==============

const CONFIG = {
    MODEL: "gemini-3.6-flash",
    API: "https://generativelanguage.googleapis.com/v1beta/models/",
    MAX_HISTORY: 20,
    MAX_CONTEXT: 8
};

// ============== STATE ======================

let apiKey = localStorage.getItem("jarvis_key") || "";
let chatHistory = [];
let isBusy = false;
let recognition = null;
let wakeRecognition = null;
let wakeEnabled = false;

// ============== HTML ELEMENTS ==============

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

// ============== HELPERS ====================

const wait = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

function setStatus(message) {
    if (systemStatus) {
        systemStatus.textContent = message;
    }
}

function addMessage(message, type = "ai") {
    if (!chatBox) return;

    const div = document.createElement("div");
    div.className = "msg " + type;

    div.textContent =
        (type === "user" ? "YOU: " : "J.A.R.V.I.S: ") + message;

    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ============== MEMORY =====================

try {
    const saved = JSON.parse(
        localStorage.getItem("jarvis_history") || "[]"
    );

    chatHistory = Array.isArray(saved) ? saved : [];
} catch {
    chatHistory = [];
}

function saveHistory() {
    chatHistory = chatHistory.slice(-CONFIG.MAX_HISTORY);

    try {
        localStorage.setItem(
            "jarvis_history",
            JSON.stringify(chatHistory)
        );
    } catch (error) {
        console.error("Memory error:", error);
    }
}

function restoreChat() {
    if (!chatBox) return;

    chatBox.innerHTML = "";

    if (!chatHistory.length) {
        addMessage("Systems online. How may I assist you?", "ai");
        return;
    }

    chatHistory.forEach(item => {
        const text = item.parts
            ?.map(part => part.text || "")
            .join("");

        if (text) {
            addMessage(
                text,
                item.role === "user" ? "user" : "ai"
            );
        }
    });
}

// ============== VOICE REPLY =================

function speak(message) {
    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(message);

    speech.lang = "en-IN";
    speech.rate = 1;
    speech.pitch = 1;

    speech.onstart = () => setStatus("SPEAKING...");
    speech.onend = () => setStatus("SYSTEM READY");

    speechSynthesis.speak(speech);
}

// ============== GEMINI API ==================

async function getApiKey() {
    if (apiKey) return apiKey;

    const entered = prompt("Enter your Gemini API key:");

    if (!entered || !entered.trim()) {
        throw new Error("Gemini API key is required.");
    }

    apiKey = entered.trim();

    localStorage.setItem("jarvis_key", apiKey);

    return apiKey;
}

async function askGemini(contents) {
    const key = await getApiKey();

    const endpoint =
        CONFIG.API + CONFIG.MODEL + ":generateContent";

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
                        "You are J.A.R.V.I.S., a helpful AI assistant. " +
                        "Give accurate and clear answers. " +
                        "Reply in the same language as the user."
                }]
            },
            contents,
            generationConfig: {
                maxOutputTokens: 800
            }
        })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Gemini API error."
        );
    }

    const answer = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

    if (!answer) {
        throw new Error("Gemini returned an empty response.");
    }

    return answer;
}
// ============== WEATHER ====================

async function getWeather(command) {
    const match = command.match(
        /\b(?:weather|temperature|forecast)\s+(?:in|for|at)\s+([a-zA-Z\s]+?)(?:\?|$)/i
    );

    const city = match ? match[1].trim() : "Vijayawada";

    try {
        setStatus("FETCHING WEATHER...");

        const geoResponse = await fetch(
            "https://geocoding-api.open-meteo.com/v1/search?name=" +
            encodeURIComponent(city) + "&count=1"
        );

        if (!geoResponse.ok) throw new Error("Location lookup failed.");

        const geo = await geoResponse.json();

        if (!geo.results?.length) {
            return "City not found.";
        }

        const place = geo.results[0];

        const weatherResponse = await fetch(
            "https://api.open-meteo.com/v1/forecast?latitude=" +
            place.latitude +
            "&longitude=" +
            place.longitude +
            "&current=temperature_2m,wind_speed_10m"
        );

        if (!weatherResponse.ok) throw new Error("Weather lookup failed.");

        const weather = await weatherResponse.json();

        return "Weather in " + place.name +
            ": " + weather.current.temperature_2m +
            " degrees Celsius. Wind speed: " +
            weather.current.wind_speed_10m +
            " kilometres per hour.";

    } catch (error) {
        console.error(error);
        return "Weather service is unavailable.";
    } finally {
        setStatus("SYSTEM READY");
    }
}

// ============== LOCAL COMMANDS =============

async function handleLocalCommand(command) {
    const text = command.toLowerCase().trim();

    if (/\b(weather|temperature|forecast)\b/.test(text)) {
        return await getWeather(command);
    }

    if (/\b(time|clock)\b/.test(text)) {
        return "Current time: " +
            new Date().toLocaleTimeString("en-IN");
    }

    if (/\b(date|today's date)\b/.test(text)) {
        return "Today's date: " +
            new Date().toLocaleDateString("en-IN");
    }

    const websites = {
        "open google": "https://google.com",
        "open youtube": "https://youtube.com",
        "open gmail": "https://mail.google.com",
        "open github": "https://github.com",
        "open instagram": "https://instagram.com",
        "open whatsapp": "https://whatsapp.com"
    };

    for (const phrase in websites) {
        if (text.includes(phrase)) {
            window.open(websites[phrase], "_blank");
            return "Opening " + phrase.replace("open ", "");
        }
    }

    return null;
}
// ============== SEND MESSAGE ===============

async function sendMessage(imageData = null) {
    if (isBusy) return;

    const userText = input?.value.trim() || "";

    if (!userText && !imageData) return;

    isBusy = true;

    if (input) input.value = "";

    addMessage(userText || "Image attached", "user");

    try {
        if (!imageData) {
            const localReply = await handleLocalCommand(userText);

            if (localReply) {
                addMessage(localReply, "ai");
                speak(localReply);

                chatHistory.push(
                    { role: "user", parts: [{ text: userText }] },
                    { role: "model", parts: [{ text: localReply }] }
                );

                saveHistory();
                return;
            }
        }

        setStatus(imageData ? "ANALYZING IMAGE..." : "THINKING...");

        const parts = [];

        if (userText) {
            parts.push({ text: userText });
        }

        if (imageData) {
            parts.push({
                inlineData: {
                    mimeType: imageData.mimeType,
                    data: imageData.data
                }
            });
        }

        const contents = [
            ...chatHistory.slice(-CONFIG.MAX_CONTEXT),
            {
                role: "user",
                parts
            }
        ];

        const answer = await askGemini(contents);

        addMessage(answer, "ai");
        speak(answer);

        chatHistory.push(
            { role: "user", parts },
            { role: "model", parts: [{ text: answer }] }
        );

        saveHistory();

        setStatus("SYSTEM READY");

    } catch (error) {
        console.error(error);
        addMessage("Error: " + error.message, "ai");
        setStatus("ERROR");
    } finally {
        isBusy = false;
    }
}

// ============== EXECUTE BUTTON =============

if (sendButton) {
    sendButton.addEventListener("click", sendMessage);
}

if (input) {
    input.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });
}
// ============== MICROPHONE =================

function getSpeechRecognition() {
    return window.SpeechRecognition ||
        window.webkitSpeechRecognition ||
        null;
}

function startVoiceInput() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage("Voice input is not supported. Try Chrome.", "ai");
        return;
    }

    if (recognition) {
        recognition.stop();
        recognition = null;
        return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;

    setStatus("LISTENING...");

    if (micButton) micButton.classList.add("active");

    recognition.onresult = event => {
        const transcript = event.results[0][0].transcript;

        if (input) input.value = transcript;

        recognition = null;

        if (micButton) micButton.classList.remove("active");

        sendMessage();
    };

    recognition.onerror = () => {
        recognition = null;
        if (micButton) micButton.classList.remove("active");
        setStatus("VOICE ERROR");
    };

    recognition.onend = () => {
        recognition = null;
        if (micButton) micButton.classList.remove("active");
        if (systemStatus?.textContent === "LISTENING...") {
            setStatus("SYSTEM READY");
        }
    };

    try {
        recognition.start();
    } catch (error) {
        console.error(error);
        recognition = null;
        setStatus("MICROPHONE ERROR");
    }
}

if (micButton) {
    micButton.addEventListener("click", startVoiceInput);
}

// ============== CAMERA =====================

if (cameraButton && imageInput) {
    cameraButton.addEventListener("click", () => {
        imageInput.click();
    });
}

function readImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            resolve(reader.result.split(",")[1]);
        };

        reader.onerror = () => reject(new Error("Image read failed."));

        reader.readAsDataURL(file);
    });
}

if (imageInput) {
    imageInput.addEventListener("change", async () => {
        const file = imageInput.files?.[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            addMessage("Please select an image.", "ai");
            imageInput.value = "";
            return;
        }

        try {
            const base64 = await readImage(file);

            await sendMessage({
                mimeType: file.type,
                data: base64
            });

        } catch (error) {
            addMessage("Image error: " + error.message, "ai");
        } finally {
            imageInput.value = "";
        }
    });
}
// ============== WAKE WORD ==================

function stopWakeMode() {
    if (wakeRecognition) {
        wakeRecognition.onend = null;

        try {
            wakeRecognition.stop();
        } catch (error) {
            console.warn(error);
        }
    }

    wakeRecognition = null;
    wakeEnabled = false;

    if (wakeStatus) wakeStatus.textContent = "WAKE: OFF";
    if (wakeButton) wakeButton.classList.remove("active");
}

function startWakeMode() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage("Wake word is not supported in this browser.", "ai");
        return;
    }

    stopWakeMode();

    wakeRecognition = new SpeechRecognition();
    wakeRecognition.lang = "en-IN";
    wakeRecognition.continuous = true;
    wakeRecognition.interimResults = false;

    wakeEnabled = true;

    if (wakeStatus) wakeStatus.textContent = "WAKE: ON";
    if (wakeButton) wakeButton.classList.add("active");

    setStatus("WAITING FOR HEY JARVIS...");

    wakeRecognition.onresult = event => {
        const result = event.results[event.results.length - 1];
        const spoken = result[0].transcript.trim();
        const lower = spoken.toLowerCase();

        const index = lower.indexOf("hey jarvis");

        if (index !== -1) {
            const command = spoken
                .slice(index + "hey jarvis".length)
                .trim();

            stopWakeMode();

            if (command) {
                if (input) input.value = command;
                sendMessage();
            } else {
                startVoiceInput();
            }
        }
    };

    wakeRecognition.onerror = event => {
        console.warn("Wake error:", event.error);

        if (event.error === "not-allowed") {
            stopWakeMode();
            addMessage("Please allow microphone permission.", "ai");
            setStatus("MICROPHONE PERMISSION NEEDED");
        }
    };

    wakeRecognition.onend = () => {
        if (wakeEnabled && wakeRecognition) {
            try {
                wakeRecognition.start();
            } catch (error) {
                console.warn(error);
            }
        }
    };

    try {
        wakeRecognition.start();
    } catch (error) {
        stopWakeMode();
        addMessage("Could not start wake mode.", "ai");
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

// ============== CLEAR MEMORY ===============

function clearMemory() {
    chatHistory = [];

    localStorage.removeItem("jarvis_history");

    if (chatBox) chatBox.innerHTML = "";

    addMessage("Chat memory cleared. Systems ready.", "ai");

    setStatus("SYSTEM READY");
}

if (clearButton) {
    clearButton.addEventListener("click", clearMemory);
}

// ============== STARTUP ====================

restoreChat();

setStatus("SYSTEM READY");

console.log("J.A.R.V.I.S. initialized.");

console.log({
    input: !!input,
    send: !!sendButton,
    microphone: !!micButton,
    camera: !!cameraButton,
    clear: !!clearButton,
    wake: !!wakeButton,
    image: !!imageInput,
    chat: !!chatBox
});
