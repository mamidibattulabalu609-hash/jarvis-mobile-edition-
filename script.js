
/* ==========================================
   J.A.R.V.I.S AI ASSISTANT
   Gemini + Voice + Camera + Memory
========================================== */

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

// ===== 2. HTML ELEMENTS =====

const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");
const imageInput = document.getElementById("img-input");
const chat = document.getElementById("chat");
const status = document.getElementById("system-status");

// ===== 3. DISPLAY MESSAGES =====

function addMessage(message, type = "ai") {
    const div = document.createElement("div");

    div.className = "msg " + type;
    div.textContent =
        (type === "user" ? "YOU: " : "J.A.R.V.I.S: ") + message;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function setStatus(message) {
    status.textContent = message;
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

// ===== 5. LOCAL TOOLS (15 COMMANDS) =====

async function handleTools(text) {
    const t = text.toLowerCase().trim();

    // 1. Time
    if (/\b(time|clock)\b/.test(t)) {
        return "Current time: " +
            new Date().toLocaleTimeString();
    }

    // 2. Date
    if (/\b(date|today)\b/.test(t)) {
        return "Today's date: " +
            new Date().toLocaleDateString();
    }

    // 3. Day
    if (/\b(day|weekday)\b/.test(t)) {
        return "Today is " +
            new Date().toLocaleDateString("en-IN", {
                weekday: "long"
            });
    }

    // 4. Google
    if (t === "open google") {
        window.open("https://www.google.com", "_blank");
        return "Opening Google.";
    }

    // 5. YouTube
    if (t === "open youtube") {
        window.open("https://www.youtube.com", "_blank");
        return "Opening YouTube.";
    }

    // 6. Gmail
    if (t === "open gmail") {
        window.open("https://mail.google.com", "_blank");
        return "Opening Gmail.";
    }

    // 7. Facebook
    if (t === "open facebook") {
        window.open("https://www.facebook.com", "_blank");
        return "Opening Facebook.";
    }

    // 8. Instagram
    if (t === "open instagram") {
        window.open("https://www.instagram.com", "_blank");
        return "Opening Instagram.";
    }

    // 9. WhatsApp
    if (t === "open whatsapp") {
        window.open("https://web.whatsapp.com", "_blank");
        return "Opening WhatsApp.";
    }

    // 10. Google search
    if (t.startsWith("search for ")) {
        const q = t.slice(11).trim();

        if (!q) return "Please enter something to search.";

        window.open(
            "https://www.google.com/search?q=" +
            encodeURIComponent(q),
            "_blank"
        );

        return "Searching Google for " + q;
    }

    // 11. YouTube search
    if (t.startsWith("play ")) {
        const q = t.slice(5).trim();

        if (!q) return "Please enter something to search.";

        window.open(
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(q),
            "_blank"
        );

        return "Searching YouTube for " + q;
    }

    // 12. Calculator
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
            return "Unable to calculate that.";
        }
    }

    // 13. Battery
    if (t.includes("battery")) {
        if (!navigator.getBattery) {
            return "Battery information is unavailable.";
        }

        try {
            const battery = await navigator.getBattery();

            return "Battery level: " +
                Math.round(battery.level * 100) + "%";
        } catch {
            return "Unable to read battery information.";
        }
    }

    // 14. Internet
    if (t.includes("internet") || t.includes("connection")) {
        return navigator.onLine
            ? "Internet connection is online."
            : "Internet connection is offline.";
    }

    // 15. Greeting
    if (/^(hello|hi|hey)\b/.test(t)) {
        return "Hello! JARVIS is online. How can I help you?";
    }

    return null;
}

// ===== 6. GEMINI AI CONNECTION =====

async function askGemini(message, imageData = null) {
    if (!API_KEY) {
        API_KEY = prompt("Enter your Gemini API key:");

        if (!API_KEY || !API_KEY.trim()) {
            throw new Error("Gemini API key is required.");
        }

        API_KEY = API_KEY.trim();
        localStorage.setItem("jarvis_key", API_KEY);
    }

    const parts = [{ text: message }];

    if (imageData) {
        parts.push({
            inlineData: {
                mimeType: imageData.mimeType,
                data: imageData.data
            }
        });
    }

    const contents = [
        ...chatHistory,
        {
            role: "user",
            parts: parts
        }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": API_KEY
            },
            body: JSON.stringify({
                contents: contents,
                systemInstruction: {
                    parts: [{
                        text: "You are JARVIS, a helpful personal AI assistant. " +
                              "Answer clearly, accurately and concisely."
                    }]
                },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024
                }
            }),
            signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error?.message || "Gemini API error: " +
                response.status
            );
        }

        const answer = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!answer) {
            throw new Error(
                "Gemini returned an empty response. Try again."
            );
        }

        // Save conversation without image data
        chatHistory.push({
            role: "user",
            parts: [{ text: message }]
        });

        chatHistory.push({
            role: "model",
            parts: [{ text: answer }]
        });

        // Keep recent conversation only
        chatHistory = chatHistory.slice(-12);

        localStorage.setItem(
            "jarvis_history",
            JSON.stringify(chatHistory)
        );

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

// ===== 7. MAIN MESSAGE PROCESSOR =====

async function sendMessage(imageData = null) {
    const message = input.value.trim();

    if ((!message && !imageData) || busy) return;

    if (!navigator.onLine) {
        addMessage("No internet connection.", "ai");
        return;
    }

    busy = true;
    sendBtn.disabled = true;

    if (message) {
        addMessage(message, "user");
    }

    input.value = "";
    setStatus("PROCESSING...");

    try {
        // Run local commands first
        const toolResult = imageData
            ? null
            : await handleTools(message);

        let answer;

        if (toolResult !== null) {
            answer = toolResult;
        } else {
            answer = await askGemini(
                message || "Describe this image.",
                imageData
            );
        }

        addMessage(answer, "ai");
        speak(answer);

        setStatus("SYSTEM READY");

    } catch (error) {
        console.error("JARVIS ERROR:", error);

        addMessage(
            "Error: " + error.message,
            "ai"
        );

        setStatus("CONNECTION ERROR");

    } finally {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

// ===== 8. EXECUTE BUTTON =====

sendBtn.addEventListener("click", () => {
    sendMessage();
});

// Press Enter to send
input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        sendMessage();
    }
});
    
// ===== WAKE WORD ENGINE =====

let wakeWordEnabled = false;
let wakeWordTimeout = null;

const WAKE_WORD = "hey jarvis";

// Toggle Wake Word
function toggleWakeWord() {

    wakeWordEnabled = !wakeWordEnabled;

    const btn = document.getElementById('wake-btn');
    const status = document.getElementById('wake-status');

    if (wakeWordEnabled) {

        if (btn) btn.classList.add('active');

        if (status) {
            status.innerText = "LISTENING FOR 'HEY JARVIS'...";
            status.style.color = "#00ff00";
        }

        startContinuousListening();

    } else {

        if (btn) btn.classList.remove('active');

        if (status) {
            status.innerText = "WAKE: OFF";
            status.style.color = "#888";
        }

        stopContinuousListening();
    }
}


// Start Continuous Listening
function startContinuousListening() {

    if (!rec) {
        console.error("Speech recognition is not available.");
        return;
    }

    if (!wakeWordEnabled) return;

    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {

        let transcript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {

            transcript += event.results[i][0].transcript + " ";
        }

        transcript = transcript.toLowerCase().trim();

        console.log("Heard:", transcript);

        if (transcript.includes(WAKE_WORD)) {

            console.log("Wake Word Detected!");

            // Stop listening temporarily
            wakeWordEnabled = false;

            rec.stop();

            speak("Yes Boss?");

            if (typeof setJarvisVisualState === 'function') {
                setJarvisVisualState('LISTENING');
            }

            const status = document.getElementById('wake-status');

            if (status) {
                status.innerText = "JARVIS ACTIVATED";
                status.style.color = "#00ff00";
            }

            // Restart wake word detection after 5 seconds
            clearTimeout(wakeWordTimeout);

            wakeWordTimeout = setTimeout(() => {

                if (!wakeWordEnabled) return;

                startContinuousListening();

            }, 5000);
        }
    };

    rec.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
    };

    rec.onend = () => {

        if (wakeWordEnabled) {

            setTimeout(() => {

                if (wakeWordEnabled) {
                    try {
                        rec.start();
                    } catch (error) {
                        console.log("Recognition restart:", error);
                    }
                }

            }, 500);
        }
    };

    try {
        rec.start();
    } catch (error) {
        console.log("Recognition already running:", error);
    }
}


// Stop Continuous Listening
function stopContinuousListening() {

    clearTimeout(wakeWordTimeout);

    if (rec) {
        rec.onend = null;
        rec.stop();
    }
}

