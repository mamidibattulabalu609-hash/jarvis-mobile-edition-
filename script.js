/* ==========================================
   J.A.R.V.I.S AI ASSISTANT
   Gemini + Voice + Camera + Memory
   Fixed version
========================================== */

// ===== 1. CONFIGURATION =====//
// ===== GEMINI AI MODEL =====
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
let recognition = null;
let isListening = false;
let wakeWordEnabled = false;
let wakeWordRestartTimer = null;

const WAKE_WORD = "hey jarvis";

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

    div.textContent =
        (type === "user" ? "YOU: " : "J.A.R.V.I.S: ") +
        message;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function setStatus(message) {
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Restore saved chat messages
function restoreChat() {
    if (!chat) return;

    chatHistory.forEach(item => {
        const text = item.parts
            ?.map(part => part.text || "")
            .join("");

        if (!text) return;

        addMessage(
            text,
            item.role === "user" ? "user" : "ai"
        );
    });
}

// ===== 4. VOICE OUTPUT =====

function speak(text) {
    if (!("speechSynthesis" in window)) {
        console.warn("Speech output is not supported.");
        return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-IN";
    speech.rate = 1;
    speech.pitch = 1;

    speech.onstart = () => setStatus("SPEAKING...");
    speech.onend = () => setStatus("SYSTEM READY");

    window.speechSynthesis.speak(speech);
}

// ===== 5. SPEECH RECOGNITION SUPPORT =====

function getSpeechRecognition() {
    return window.SpeechRecognition ||
           window.webkitSpeechRecognition ||
           null;
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

    if (micBtn) {
        micBtn.classList.remove("active");
    }
}

function startVoiceInput() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage(
            "Voice recognition is not supported in this browser. Try Google Chrome.",
            "ai"
        );
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

    if (micBtn) {
        micBtn.classList.add("active");
    }

    setStatus("LISTENING...");

    recognition.onresult = event => {
        const transcript =
            event.results[0][0].transcript.trim();

        if (!transcript) return;

        if (input) {
            input.value = transcript;
        }

        stopRecognition();

        setStatus("VOICE RECEIVED");

        // Send recognized words to JARVIS
        sendMessage();
    };

    recognition.onerror = event => {
        console.error("Voice error:", event.error);

        stopRecognition();

        if (event.error === "not-allowed" ||
            event.error === "service-not-allowed") {
            addMessage(
                "Microphone permission denied. Allow microphone access in Chrome settings.",
                "ai"
            );
        } else if (event.error === "no-speech") {
            addMessage(
                "I did not hear anything. Tap the microphone and try again.",
                "ai"
            );
        } else {
            addMessage(
                "Voice recognition error: " + event.error,
                "ai"
            );
        }

        setStatus("VOICE ERROR");
    };

    recognition.onend = () => {
        isListening = false;

        if (micBtn) {
            micBtn.classList.remove("active");
        }

        if (statusElement &&
            statusElement.textContent === "LISTENING...") {
            setStatus("SYSTEM READY");
        }
    };

    try {
        recognition.start();
    } catch (error) {
        console.error("Recognition start error:", error);

        stopRecognition();

        addMessage(
            "Could not start the microphone. Please try again.",
            "ai"
        );

        setStatus("MICROPHONE ERROR");
    }
}

// Connect microphone button
if (micBtn) {
    micBtn.addEventListener("click", startVoiceInput);
}

// ===== 6. CAMERA =====

function openCamera() {
    if (!imageInput) {
        addMessage(
            "Camera input is missing from the HTML page.",
            "ai"
        );
        return;
    }

    // Ask mobile devices to use the rear camera
    imageInput.setAttribute("accept", "image/*");
    imageInput.setAttribute("capture", "environment");

    imageInput.click();
}

// Connect camera button
if (camBtn) {
    camBtn.addEventListener("click", openCamera);
}

// Process selected or captured image
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

            const imageData = {
                mimeType: file.type,
                data: base64
            };

            if (input && !input.value.trim()) {
                input.value = "Describe this image.";
            }

            await sendMessage(imageData);

        } catch (error) {
            console.error("Image error:", error);

            addMessage(
                "Unable to read the image. Please try again.",
                "ai"
            );

            setStatus("IMAGE ERROR");
        }

        // Allow selecting the same image again
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

            // Remove the data:image/...;base64, prefix
            resolve(result.split(",")[1]);
        };

        reader.onerror = () => {
            reject(new Error("Image file read failed."));
        };

        reader.readAsDataURL(file);
    });
}

// ===== 7. LOCAL COMMANDS =====

async function handleTools(text) {
    const t = text.toLowerCase().trim();

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

    // Open websites
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
        return "Opening " + t.replace("open ", "") + ".";
    }

    // Google search
    if (t.startsWith("search for ")) {
        const query = t.slice(11).trim();

        if (!query) {
            return "Please enter something to search.";
        }

        window.open(
            "https://www.google.com/search?q=" +
            encodeURIComponent(query),
            "_blank"
        );

        return "Searching Google for " + query;
    }

    // YouTube search
    if (t.startsWith("play ")) {
        const query = t.slice(5).trim();

        if (!query) {
            return "Please enter something to search.";
        }

        window.open(
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(query),
            "_blank"
        );

        return "Searching YouTube for " + query;
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
            return "Unable to calculate that.";
        }
    }

    // Battery
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

    // Internet
    if (t.includes("internet") || t.includes("connection")) {
        return navigator.onLine
            ? "Internet connection is online."
            : "Internet connection is offline.";
    }

    // Greeting
    if (/^(hello|hi|hey)\b/.test(t)) {
        return "Hello! JARVIS is online. How can I help you?";
    }

    return null;
}

// ===== 8. GEMINI AI CONNECTION =====

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

    const timeout = setTimeout(
        () => controller.abort(),
        45000
    );

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
            throw new Error(
                "Gemini returned an empty response. Try again."
            );
        }

        // Save conversation text only
        chatHistory.push({
            role: "user",
            parts: [{ text: message }]
        });

        chatHistory.push({
            role: "model",
            parts: [{ text: answer }]
        });

        // Keep recent messages
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

// ===== 9. MAIN MESSAGE PROCESSOR =====

async function sendMessage(imageData = null) {
    if (!input) return;

    const message = input.value.trim();

    if ((!message && !imageData) || busy) return;

    if (!navigator.onLine) {
        addMessage("No internet connection.", "ai");
        return;
    }

    busy = true;

    if (sendBtn) {
        sendBtn.disabled = true;
    }

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

        addMessage(
            "Error: " + error.message,
            "ai"
        );

        setStatus("CONNECTION ERROR");

    } finally {
        busy = false;

        if (sendBtn) {
            sendBtn.disabled = false;
        }

        if (input) {
            input.focus();
        }
    }
}

// ===== 10. SEND BUTTON =====

if (sendBtn) {
    sendBtn.addEventListener("click", () => {
        sendMessage();
    });
}

// Enter to send
if (input) {
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessage();
        }
    });
}

// ===== 11. CLEAR CHAT =====

if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        if (!confirm("Clear all JARVIS chat history?")) {
            return;
        }

        chatHistory = [];

        localStorage.removeItem("jarvis_history");

        if (chat) {
            chat.innerHTML = "";
        }

        addMessage(
            "Chat cleared. JARVIS is ready.",
            "ai"
        );

        setStatus("SYSTEM READY");
    });
}

// ===== 12. WAKE WORD ENGINE =====

function startWakeWordListening() {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
        addMessage(
            "Wake word recognition is not supported in this browser.",
            "ai"
        );
        return;
    }

    if (!wakeWordEnabled) return;

    stopRecognition();

    recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;

    isListening = true;

    setStatus("LISTENING FOR HEY JARVIS");

    recognition.onresult = event => {
        let transcript = "";

        for (let i = event.resultIndex;
             i < event.results.length;
             i++) {
            transcript +=
                event.results[i][0].transcript + " ";
        }

        transcript = transcript.toLowerCase().trim();

        if (transcript.includes(WAKE_WORD)) {
            wakeWordEnabled = false;

            stopRecognition();

            setStatus("JARVIS ACTIVATED");

            speak("Yes, how can I help?");

            // Start command listening after response
            setTimeout(() => {
                startVoiceInput();
            }, 1500);
        }
    };

    recognition.onerror = event => {
        console.error("Wake word error:", event.error);
        stopRecognition();
        setStatus("WAKE WORD ERROR");
    };

    recognition.onend = () => {
        isListening = false;

        if (wakeWordEnabled) {
            clearTimeout(wakeWordRestartTimer);

            wakeWordRestartTimer = setTimeout(() => {
                if (wakeWordEnabled) {
                    startWakeWordListening();
                }
            }, 1000);
        }
    };

    try {
        recognition.start();
    } catch (error) {
        console.error("Wake word start error:", error);
        stopRecognition();
    }
}

function toggleWakeWord() {
    wakeWordEnabled = !wakeWordEnabled;

    const wakeBtn = document.getElementById("wake-btn");
    const wakeStatus = document.getElementById("wake-status");

    if (wakeWordEnabled) {
        if (wakeBtn) {
            wakeBtn.classList.add("active");
        }

        if (wakeStatus) {
            wakeStatus.textContent =
                "LISTENING FOR HEY JARVIS...";
            wakeStatus.style.color = "#00ff00";
        }

        startWakeWordListening();

    } else {
        if (wakeBtn) {
            wakeBtn.classList.remove("active");
        }

        if (wakeStatus) {
            wakeStatus.textContent = "WAKE: OFF";
            wakeStatus.style.color = "#888";
        }

        clearTimeout(wakeWordRestartTimer);
        stopRecognition();

        setStatus("SYSTEM READY");
    }
}

// Connect optional wake word button
const wakeBtn = document.getElementById("wake-btn");

if (wakeBtn) {
    wakeBtn.addEventListener("click", toggleWakeWord);
}

// ===== 13. STARTUP =====

restoreChat();

setStatus("SYSTEM READY");

console.log("J.A.R.V.I.S loaded successfully.");

