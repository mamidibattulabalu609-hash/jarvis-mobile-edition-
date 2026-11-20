
/* ==========================================
   J.A.R.V.I.S. PERSONAL AI ASSISTANT
   Gemini AI + Voice + Text Chat
   ========================================== */

// ===== 1. API KEY =====

let API_KEY = localStorage.getItem("jarvis_key");

if (!API_KEY) {
    API_KEY = prompt("Enter your Gemini API Key:");

    if (API_KEY) {
        localStorage.setItem("jarvis_key", API_KEY.trim());
        API_KEY = API_KEY.trim();
    }
}

// ===== 2. MODEL LIST =====

const MODELS = ["gemini-3.0-flash"];

// ===== 3. HTML ELEMENTS =====

const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const micBtn = document.getElementById("mic-btn");
const sendBtn = document.getElementById("send");

// Check required elements

if (!chat || !input || !micBtn || !sendBtn) {
    console.error("JARVIS: Required HTML elements missing.");
}

// ===== 4. ADD MESSAGE =====

function add(message, type) {
    const div = document.createElement("div");

    div.className = "msg " + type;
    div.innerText = message;

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;

    return div;
}

// ===== 5. GEMINI AI ENGINE =====

async function callGemini(promptText) {

    if (!API_KEY) {
        throw new Error("Gemini API key is missing.");
    }

    let lastError;

    for (const model of MODELS) {

        try {

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json"
                    },

                    body: JSON.stringify({
    contents: [{
        role: "user",
        parts: [{ text: promptText }]
    }],
    generationConfig: {
        maxOutputTokens: 256,
        temperature: 0.7
    }
})
                }
            );

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(
                    data.error?.message || "Gemini API request failed."
                );
            }

            const reply = data.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

            if (!reply) {
                throw new Error("Gemini returned an empty response.");
            }

            return reply;

        } catch (error) {

            lastError = error;

            console.error(model + " failed:", error);

            if (
                /quota|rate|unavailable|not found|deprecated|high demand|temporar/i
                .test(error.message)
            ) {
                continue;
            }

            throw error;
        }
    }

    throw lastError || new Error("All Gemini models failed.");
}

// ===== 6. ASK JARVIS =====

async function askGemini(promptText) {

    const message = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        const reply = await callGemini(promptText);

        message.innerText = "J.A.R.V.I.S: " + reply;

        chat.scrollTop = chat.scrollHeight;

        speak(reply);

    } catch (error) {

        message.innerText =
            "J.A.R.V.I.S: ERROR - " + error.message;

        console.error(error);
    }
}

// ===== 7. TEXT SEND BUTTON =====

sendBtn.onclick = () => {

    const text = input.value.trim();

    if (!text) return;

    add("YOU: " + text, "user");

    input.value = "";

    askGemini(text);
};

// ENTER KEY SUPPORT

input.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {
        event.preventDefault();
        sendBtn.click();
    }

});

// ===== 8. SPEECH RECOGNITION =====

const SR =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let rec = null;

if (SR) {

    rec = new SR();

    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (event) => {

        const text =
            event.results[0][0].transcript.trim();

        if (!text) return;

        add("YOU: " + text, "user");

        askGemini(text);
    };

    rec.onerror = (event) => {

        console.error("Microphone error:", event.error);

        micBtn.innerText = "🎙️";
    };

    rec.onend = () => {

        micBtn.innerText = "🎙️";
    };

    micBtn.onclick = () => {

        try {

            rec.start();

            micBtn.innerText = "LISTENING...";

        } catch (error) {

            console.error(error);
        }
    };

} else {

    micBtn.onclick = () => {
        alert("Speech recognition is not supported in this browser.");
    };
}

// ===== 9. TEXT TO SPEECH =====

let voices = [];

function loadVoices() {

    voices = speechSynthesis.getVoices();
}

if ("speechSynthesis" in window) {

    loadVoices();

    speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text) {

    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = 1.05;
    utterance.pitch = 0.85;

    const voice = voices.find(v =>
        v.lang.toLowerCase().startsWith("en")
    );

    if (voice) {
        utterance.voice = voice;
    }

    speechSynthesis.speak(utterance);
}

// ===== 10. SYSTEM STARTUP =====

console.log("J.A.R.V.I.S. SYSTEM ONLINE");

if (navigator.onLine) {
    console.log("Internet connection available.");
} else {
    console.log("No internet connection.");
}

window.addEventListener("online", () => {
    console.log("Internet connected.");
});

window.addEventListener("offline", () => {
    console.log("Internet disconnected.");
});
