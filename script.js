
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

// ===== 9. MICROPHONE =====

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

if (SpeechRecognition) {
    const recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    micBtn.addEventListener("click", () => {
        try {
            recognition.start();
            setStatus("LISTENING...");
        } catch (error) {
            addMessage("Microphone is already active.", "ai");
        }
    });

    recognition.onresult = event => {
        const transcript =
            event.results[0][0].transcript;

        input.value = transcript;
        sendMessage();
    };

    recognition.onerror = event => {
        setStatus("SYSTEM READY");
        addMessage(
            "Microphone error: " + event.error,
            "ai"
        );
    };

    recognition.onend = () => {
        if (!busy) setStatus("SYSTEM READY");
    };

} else {
    micBtn.addEventListener("click", () => {
        addMessage(
            "Voice recognition is not supported in this browser.",
            "ai"
        );
    });
}

// ===== 10. CAMERA =====

camBtn.addEventListener("click", () => {
    imageInput.click();
});

imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        addMessage("Please select an image.", "ai");
        imageInput.value = "";
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        addMessage("Please choose an image under 5 MB.", "ai");
        imageInput.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        const dataURL = reader.result;
        const imageData = {
            mimeType: file.type,
            data: dataURL.split(",")[1]
        };

        sendMessage(imageData);
        imageInput.value = "";
    };

    reader.onerror = () => {
        addMessage("Unable to read the image.", "ai");
        imageInput.value = "";
    };

    reader.readAsDataURL(file);
});

// ===== 11. CLEAR MEMORY =====

clearBtn.addEventListener("click", () => {
    if (busy) return;

    chatHistory = [];

    localStorage.removeItem("jarvis_history");

    chat.innerHTML = "";

    addMessage(
        "Memory cleared. JARVIS is ready!",
        "ai"
    );

    window.speechSynthesis?.cancel();

    setStatus("SYSTEM READY");
});

// ===== 12. STARTUP =====

setStatus("SYSTEM READY");

console.log("J.A.R.V.I.S initialized successfully.");
