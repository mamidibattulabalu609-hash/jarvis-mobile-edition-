/* ==========================================
   J.A.R.V.I.S AI ASSISTANT
   Gemini + Voice + Camera + Memory + Weather
   Complete & Fixed Version
========================================== */

// ===== 1. CONFIGURATION ===== //
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3-flash-preview"];

function getApiUrl(modelName) {
    return "https://googleapis.com" + modelName + ":generateContent";
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
        const trimmed = chatHistory.slice(-20);
        localStorage.setItem("jarvis_history", JSON.stringify(trimmed));
    } catch (e) {
        console.warn("Could not save history:", e);
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

// ===== 7. LIVE WEATHER HELPER =====
async function getWeather(userPrompt) {
    const cleanPrompt = userPrompt.replace(/\b(today|tomorrow|right now|please)\b/gi, "").trim();
    const match = cleanPrompt.match(/(?:weather|temperature)\s+(?:in|for|at)\s+([a-zA-Z\s]+)/i);
    const city = match ? match[1].trim() : "Vijayawada";

    try {
        setStatus("FETCHING WEATHER...");

        const geoUrl = "https://open-meteo.com" + encodeURIComponent(city) + "&count=1&format=json";
        const geoRes = await fetch(geoUrl);
        const geoData = await geoRes.json();

        if (!geoData.results || geoData.results.length === 0) {
            return "I could not find weather data for " + city + ".";
        }

        const { latitude, longitude, name, country } = geoData.results[0];

        const weatherUrl = "https://open-meteo.com" + latitude + "&longitude=" + longitude + "&current_weather=true";
        const weatherRes = await fetch(weatherUrl);
        const weatherData = await weatherRes.json();
        const current = weatherData.current_weather;

        return "The current temperature in " + name + ", " + country + " is " + current.temperature + "°C with wind speeds of " + current.windspeed + " km/h.";
    } catch (error) {
        console.error("Weather fetch error:", error);
        return "Unable to reach the weather satellite right now. Please try again.";
    }
}

// ===== 8. LOCAL COMMANDS =====
async function handleTools(text) {
    const t = text.toLowerCase().trim();

    // 1. Weather
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

    // 5. Open websites (Mobile popup-blocker safe)
    const websites = {
        "open google": "https://google.com",
        "open youtube": "https://youtube.com",
        "open gmail": "https://google.com",
        "open github": "https://github.com",
        "open instagram": "https://instagram.com",
        "open whatsapp": "https://whatsapp.com"
    };

    for (const [cmd, url] of Object.entries(websites)) {
        if (t.includes(cmd)) {
            const siteName = cmd.replace("open ", "");
           with caution.
setTimeout(() => {
const win = window.open(url, "_blank");
if (!win) {
window.location.href = url;
}
}, 800);
return "Opening " + siteName + "...";
}
}
return null;
}
// ===== 9. GEMINI API WITH RETRY & FALLBACK =====
async function callGeminiWithRetry(contentsPayload) {
if (!API_KEY) {
const enteredKey = prompt("Enter your Gemini API key:");
if (!enteredKey) throw new Error("API key is required.");
API_KEY = enteredKey.trim();
localStorage.setItem("jarvis_key", API_KEY);
}
for (const model of MODELS) {
const url = getApiUrl(model) + "?key=" + API_KEY;
for (let attempt = 1; attempt <= 3; attempt++) {
try {
const response = await fetch(url, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({
systemInstruction: {
parts: [{ text: "You are J.A.R.V.I.S., an intelligent, concise, and helpful AI assistant." }]
},
contents: contentsPayload
})
});
if (response.ok) {
const data = await response.json();
const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
if (!reply) throw new Error("Empty response from AI.");
return reply;
}
if (response.status === 503 || response.status === 429) {
setStatus("HIGH DEMAND - RETRYING (" + attempt + "/3)...");
if (attempt < 3) {
await sleep(1000 * Math.pow(2, attempt - 1));
continue;
}
setStatus("SWITCHING ENGINE...");
break;
}
const errData = await response.json().catch(() => ({}));
throw new Error(errData.error?.message || "HTTP Error " + response.status);
} catch (err) {
if (attempt === 3 && model === MODELS[MODELS.length - 1]) {
throw err;
}
}
}
}
throw new Error("All AI engines are currently overloaded. Please try again in a moment.");
}
// ===== 10. MAIN SEND HANDLER =====
async function sendMessage(imageData = null) {
if (busy) return;
const text = input ? input.value.trim() : "";
if (!text && !imageData) return;
busy = true;
if (input) input.value = "";
addMessage(text || "", "user");
try {
if (!imageData) {
const toolReply = await handleTools(text);
if (toolReply) {
addMessage(toolReply, "ai");
speak(toolReply);
setStatus("SYSTEM READY");
busy = false;
return;
}
}
setStatus("THINKING...");
const userParts = [];
if (text) userParts.push({ text });
if (imageData) {
userParts.push({
inlineData: {
mimeType: imageData.mimeType,
data: imageData.data
}
});
}
const requestContents = [
...chatHistory.slice(-10),
{ role: "user", parts: userParts }
];
const aiReply = await callGeminiWithRetry(requestContents);
chatHistory.push({ role: "user", parts: [{ text: text || "" }] });
chatHistory.push({ role: "model", parts: [{ text: aiReply }] });
saveHistory();
addMessage(aiReply, "ai");
speak(aiReply);
setStatus("SYSTEM READY");
} catch (error) {
console.error("J.A.R.V.I.S. Error:", error);
addMessage("Error: " + error.message, "ai");
setStatus("CONNECTION ERROR");
} finally {
busy = false;
}
}
// ===== 11. EVENT LISTENERS & INIT =====
if (sendBtn) sendBtn.addEventListener("click", () => sendMessage());
if (input) {
input.addEventListener("keypress", (e) => {
if (e.key === "Enter") sendMessage();
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
