/* =========================================
   J.A.R.V.I.S PERSONAL AI ASSISTANT
   Gemini + Voice + Wake Word + Camera + Memory
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

    if (color) {
        wakeStatus.style.color = color;
    }
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

// ===== 5. LOCAL COMMANDS =====

async function handleTools(text) {
    const t = text.toLowerCase().trim();

    if (/\b(time|clock)\b/.test(t)) {
        return "Current time: " +
            new Date().toLocaleTimeString();
    }

    if (/\b(date|today)\b/.test(t)) {
        return "Today's date: " +
            new Date().toLocaleDateString("en-IN");
    }

    if (/\b(day|weekday)\b/.test(t)) {
        return "Today is " +
            new Date().toLocaleDateString("en-IN", {
                weekday: "long"
            });
    }

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

    if (t.includes("internet") || t.includes("connection")) {
        return navigator.onLine
            ? "Internet connection is online."
            : "Internet connection is offline.";
    }

    if (/^(hello|hi|hey)\b/.test(t)) {
        return "Hello! JARVIS is online. How can I help you?";
    }

    return null;
}

// ===== 6. GEMINI ERROR HANDLING =====

function getGeminiErrorMessage(code, data) {
    const message = data?.error?.message || "";
    const combined = message.toLowerCase();

    if (
        code === 429 ||
        combined.includes("quota") ||
        combined.includes("rate limit")
    ) {
        return "Gemini usage quota exceeded. Please wait for your quota to reset or check your Google AI Studio usage.";
    }

    if (code === 400) {
        return "Gemini rejected the request. Check the message or image format.";
    }

    if (code === 401 || code === 403) {
        return "API key invalid or Gemini API access denied. Check your API key.";
    }

    if (code === 404) {
        return "Gemini model not found. Check the model name in the configuration.";
    }

    if (code >= 500) {
        return "Google Gemini service is temporarily unavailable. Try again later.";
    }

    return message || "Gemini API error: " + code;
}

// ===== 7. GEMINI CONNECTION =====

async function askGemini(message, imageData = null) {

    if (!API_KEY) {
        const enteredKey = prompt("Enter your Gemini API key:");

        if (!enteredKey || !enteredKey.trim()) {
            throw new Error("Gemini API key is required.");
        }

        API_KEY = enteredKey.trim();

        localStorage.setItem("jarvis_key", API_KEY);
    }

    const textMessage = message || "Describe this image.";

    const parts = [
        { text: textMessage }
    ];

    // IMPORTANT: Gemini REST API image format.
    // Use inline_data and mime_type.

    if (imageData) {
        if (!imageData.mimeType || !imageData.data) {
            throw new Error("Image type or image data is missing.");
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

                system_instruction: {
                    parts: [{
                        text:
                            "You are JARVIS, a helpful personal AI assistant. " +
                            "Answer clearly, accurately and concisely."
                    }]
                },

                generation_config: {
                    temperature: 0.7,
                    max_output_tokens: 1024
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
            const reason = data.promptFeedback?.blockReason;

            throw new Error(
                reason
                    ? "Gemini could not answer: " + reason
                    : "Gemini returned an empty response."
            );
        }

        // Save text only, never save image data.

        chatHistory.push(
            {
                role: "user",
                parts: [{ text: textMessage }]
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
            console.warn("Could not save history:", error);
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

// ===== 8. MAIN MESSAGE PROCESSOR =====

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

// ===== 9. SEND BUTTON =====

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

// ===== 10. MICROPHONE =====

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

// ===== 11. WAKE WORD =====

function startWakeWordListening() {
    if (!SpeechRecognition || !wakeWordEnabled || busy ||
        wakeCommandPending) return;

    if (wakeRecognizer) {
        try {
            wakeRecognizer.onend = null;
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
            wakeCommandPending = true;

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
        } catch (error) {}
    }

    if (commandRecognizer) {
        try {
            commandRecognizer.onend = null;
            commandRecognizer.stop();
        } catch (error) {}
    }

    wakeRecognizer = null;
    commandRecognizer = null;
    wakeCommandPending = false;
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

// ===== 12. IMAGE READER =====

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

// ===== 13. CAMERA AND IMAGE UPLOAD =====

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

// ===== 14. CLEAR MEMORY =====

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

// ===== 15. INTERNET S
