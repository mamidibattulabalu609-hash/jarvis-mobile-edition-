
/* =========================================
   J.A.R.V.I.S AI ASSISTANT
   Gemini + Voice + Camera + Memory
   Corrected Complete Version
========================================= */

// ===== 1. CONFIGURATION =====

// Change this if your Gemini API key uses a different model.
const MODEL = "gemini-3.6-flash";

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
const wakeBtn = document.getElementById("wake-btn");
const wakeStatus = document.getElementById("wake-status");

// ===== 3. DISPLAY MESSAGES =====

function addMessage(message, type = "ai") {
    if (!chat) return;

    const div = document.createElement("div");

    div.className = "msg " + type;

    div.textContent =
        (type === "user" ? "YOU: " : "J.A.R.V.I.S: ") + message;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function setStatus(message) {
    if (status) status.textContent = message;
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

// ===== 5. LOCAL TOOLS =====

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

    // 10. Google Search
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

    // 11. YouTube Search
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
        const enteredKey = prompt("Enter your Gemini API key:");

        if (!enteredKey || !enteredKey.trim()) {
            throw new Error("Gemini API key is required.");
        }

        API_KEY = enteredKey.trim();

        localStorage.setItem("jarvis_key", API_KEY);
    }

    const parts = [
        {
            text: message || "Describe this image."
        }
    ];

    // Add image safely
    if (imageData) {
        if (!imageData.mimeType || !imageData.data) {
            throw new Error("Image type or image data is missing.");
        }

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
                contents: contents,

                systemInstruction: {
                    parts: [{
                        text:
                            "You are JARVIS, a helpful personal AI assistant. " +
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
                data.error?.message ||
                "Gemini API error: " + response.status
            );
        }

        const answer = data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!answer) {
            throw new Error("Gemini returned an empty response.");
        }

        // Save text only, not image data
        chatHistory.push({
            role: "user",
            parts: [{
                text: message || "Describe this image."
            }]
        });

        chatHistory.push({
            role: "model",
            parts: [{
                text: answer
            }]
        });

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
    if (!input || busy) return;

    const message = input.value.trim();

    if (!message && !imageData) return;

    if (!navigator.onLine) {
        addMessage("No internet connection.", "ai");
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

        addMessage("Error: " + error.message, "ai");

        setStatus("CONNECTION ERROR");

    } finally {
        busy = false;

        if (sendBtn) sendBtn.disabled = false;

        if (input) input.focus();
    }
}

// ===== 8. SEND BUTTON =====

if (sendBtn) {
    sendBtn.addEventListener("click", () => {
        sendMessage();
    });
}

if (input) {
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });
}

// ===== 9. MICROPHONE =====

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

function startManualMicrophone() {
    if (!SpeechRecognition) {
        addMessage(
            "Voice recognition is not supported in this browser.",
            "ai"
        );
        return;
    }

    if (busy) return;

    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-IN";

    recognition.onstart = () => {
        setStatus("LISTENING...");
    };

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

// ===== 10. WAKE WORD =====

let wakeWordEnabled = false;
let wakeRecognizer = null;
let commandRecognizer = null;

const WAKE_WORD = "hey jarvis";

function updateWakeStatus(message, color = "") {
    if (wakeStatus) {
        wakeStatus.textContent = message;

        if (color) {
            wakeStatus.style.color = color;
        }
    }
}

function startWakeWordListening() {
    if (!SpeechRecognition || !wakeWordEnabled || busy) return;

    if (wakeRecognizer) {
        try {
            wakeRecognizer.stop();
        } catch (error) {}
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
            updateWakeStatus("JARVIS ACTIVATED", "#00ff00");

            setStatus("JARVIS ACTIVATED");

            wakeRecognizer.stop();

            speak("Yes?");

            setTimeout(() => {
                listenForWakeCommand();
            }, 1000);
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
        if (wakeWordEnabled && !busy) {
            setTimeout(startWakeWordListening, 700);
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
    if (!SpeechRecognition || !wakeWordEnabled || busy) return;

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
        if (wakeWordEnabled && !busy) {
            setTimeout(startWakeWordListening, 800);
        }
    };

    try {
        commandRecognizer.start();
        setStatus("LISTENING FOR COMMAND...");
    } catch (error) {
        console.error(error);
        startWakeWordListening();
    }
}

function stopWakeWordListening() {
    if (wakeRecognizer) {
        try {
            wakeRecognizer.onend = null;
            wakeRecognizer.stop();
        } catch (error) {}
    }

    if (commandRecognizer) {
        try {
            commandRecognizer.stop();
        } catch (error) {}
    }

    wakeRecognizer = null;
    commandRecognizer = null;
}

function toggleWakeWord() {
    if (!SpeechRecognition) {
        addMessage(
            "Wake word is not supported in this browser.",
            "ai"
        );
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

// ===== 11. IMAGE READER =====

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

            const mimeType = result
                .slice(5, result.indexOf(";"));

            const data = result.split(",")[1];

            if (!mimeType || !data) {
                reject(new Error("Image type or data is missing."));
                return;
            }

            resolve({
                mimeType,
                data
            });
        };

        reader.onerror = () => {
            reject(new Error("Image reading failed."));
        };

        reader.readAsDataURL(file);
    });
}

// ===== 12. CAMERA AND IMAGE UPLOAD =====

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
            addMessage(
                "Please choose a JPG, PNG or WEBP image.",
                "ai"
            );

            imageInput.value = "";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            addMessage(
                "Please choose an image under 5 MB.",
                "ai"
            );

            imageInput.value = "";
            return;
        }

        try {
            setStatus("READING IMAGE...");

            const imageData = await readImage(file);

            await sendMessage(imageData);

        } catch (error) {
            console.error(error);

            addMessage(
                "Image error: " + error.message,
                "ai"
            );

            setStatus("SYSTEM READY");

        } finally {
            imageInput.value = "";
        }
    });
}

// ===== 13. CLEAR MEMORY =====

if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        if (busy) return;

        chatHistory = [];

        localStorage.removeItem("jarvis_history");

        if (chat) chat.innerHTML = "";

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }

        addMessage(
            "Memory cleared. JARVIS is ready!",
            "ai"
        );

        setStatus("SYSTEM READY");
    });
}

// ===== 14. INTERNET STATUS =====

window.addEventListener("online", () => {
    setStatus("SYSTEM READY");
});

window.addEventListener("offline", () => {
    setStatus("NO INTERNET CONNECTION");
});

// ===== 15. STARTUP =====

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
        console.error(
            "JARVIS: Missing HTML element:",
            name
        );
    }
}

setStatus("SYSTEM READY");

addMessage(
    "Systems online. JARVIS is ready!",
    "ai"
);

console.log("J.A.R.V.I.S initialized successfully.");
