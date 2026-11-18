
// ========================================
// J.A.R.V.I.S - AI BRAIN
// ========================================

// 1. ELEMENTS

const chat = document.getElementById("chat");
const input = document.getElementById("msg");

const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");
const stopBtn = document.getElementById("stopVoice");

const aiStatus = document.getElementById("aiStatus");
const networkStatus = document.getElementById("networkStatus");
const voiceStatus = document.getElementById("voiceStatus");
const speechStatus = document.getElementById("speechStatus");

// 2. GEMINI API CONFIGURATION

const MODEL = "gemini-2.5-flash";

let API_KEY = sessionStorage.getItem("jarvis_key");

if (!API_KEY) {
    API_KEY = prompt("Enter your Gemini API Key:");

    if (API_KEY) {
        API_KEY = API_KEY.trim();
        sessionStorage.setItem("jarvis_key", API_KEY);
    }
}

// 3. CHAT MEMORY

let history = [];

// 4. DISPLAY MESSAGES

function add(text, who = "ai") {
    const d = document.createElement("div");

    d.className = "msg " + who;
    d.textContent = text;

    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;

    return d;
}

// 5. UPDATE STATUS

function status(element, message, online) {
    if (!element) return;

    element.textContent = message;
    element.className = online ? "on" : "off";
}

function updateNetwork() {
    status(
        networkStatus,
        navigator.onLine ? "● ONLINE" : "○ OFFLINE",
        navigator.onLine
    );
}

window.addEventListener("online", updateNetwork);
window.addEventListener("offline", updateNetwork);

updateNetwork();

// 6. VOICE OUTPUT

function speak(text) {

    if (!("speechSynthesis" in window)) {
        status(speechStatus, "○ NOT SUPPORTED", false);
        return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(text);

    speech.lang = "en-IN";
    speech.rate = 0.95;
    speech.pitch = 0.9;
    speech.volume = 1;

    speech.onstart = () => {
        status(speechStatus, "● SPEAKING", true);
    };

    speech.onend = () => {
        status(speechStatus, "● READY", true);
    };

    speech.onerror = () => {
        status(speechStatus, "○ ERROR", false);
    };

    window.speechSynthesis.speak(speech);
}

// 7. STOP SPEAKING

function stopSpeaking() {
    window.speechSynthesis.cancel();
    status(speechStatus, "● STOPPED", true);
}

// 8. GEMINI AI CONNECTION

async function askGemini(question) {

    if (!API_KEY) {
        throw new Error("Gemini API key is missing.");
    }

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": API_KEY
            },

            body: JSON.stringify({

                systemInstruction: {
                    parts: [{
                        text: "You are J.A.R.V.I.S., a smart, friendly and intelligent AI assistant. Address the user as Boss when appropriate. Give clear and useful answers."
                    }]
                },

                contents: [
                    ...history,
                    {
                        role: "user",
                        parts: [{ text: question }]
                    }
                ],

                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000
                }
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error?.message || "Gemini API error: " + response.status
        );
    }

    const answer = data.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        .map(p => p.text)
        .join("\n");

    if (!answer) {
        throw new Error("Gemini returned no answer.");
    }

    history.push(
        {
            role: "user",
            parts: [{ text: question }]
        },
        {
            role: "model",
            parts: [{ text: answer }]
        }
    );

    return answer;
}

// 9. SEND MESSAGE

async function sendMessage() {

    const question = input.value.trim();

    if (!question) return;

    add("YOU: " + question, "user");

    input.value = "";
    sendBtn.disabled = true;

    const loading = add(
        "J.A.R.V.I.S: Thinking...",
        "ai"
    );

    try {

        status(aiStatus, "● CONNECTING", true);

        const answer = await askGemini(question);

        loading.remove();

        add("J.A.R.V.I.S: " + answer, "ai");

        status(aiStatus, "● ONLINE", true);

        speak(answer);

    } catch (error) {

        loading.remove();

        add("J.A.R.V.I.S ERROR: " + error.message, "ai");

        status(aiStatus, "○ ERROR", false);

        console.error(error);

    } finally {

        sendBtn.disabled = false;
        input.focus();

    }
}

// 10. SEND BUTTON

sendBtn.addEventListener("click", sendMessage);

// ENTER KEY

input.addEventListener("keydown", function(event) {

    if (event.key === "Enter") {
        sendMessage();
    }

});

// 11. MICROPHONE INPUT

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let recognition = null;

if (SpeechRecognition) {

    recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        status(voiceStatus, "● LISTENING", true);

        if (micBtn) {
            micBtn.textContent = "🎙 LISTENING...";
        }
    };

    recognition.onresult = (event) => {

        const result = event.results[0][0].transcript;

        input.value = result;

        status(voiceStatus, "● READY", true);

        sendMessage();
    };

    recognition.onerror = (event) => {

        status(voiceStatus, "○ " + event.error.toUpperCase(), false);

        console.error("Voice error:", event.error);
    };

    recognition.onend = () => {

        if (micBtn) {
            micBtn.textContent = "🎤 ACTIVATE VOICE";
        }

        if (voiceStatus.textContent.includes("LISTENING")) {
            status(voiceStatus, "● READY", true);
        }
    };

    status(voiceStatus, "● READY", true);

} else {

    status(voiceStatus, "○ NOT SUPPORTED", false);
}

// 12. START MICROPHONE

function startListening() {

    if (!recognition) {
        alert("Voice recognition is not supported. Try Chrome.");
        return;
    }

    try {

        window.speechSynthesis.cancel();

        recognition.start();

    } catch (error) {

        console.error(error);

        alert("Microphone is already active or unavailable.");

    }
}

// 13. MICROPHONE BUTTON

if (micBtn) {
    micBtn.addEventListener("click", startListening);
}

// 14. STOP VOICE BUTTON

if (stopBtn) {
    stopBtn.addEventListener("click", stopSpeaking);
}

// 15. INITIALIZE

status(
    aiStatus,
    API_KEY ? "● READY" : "○ NO API KEY",
    !!API_KEY
);

if ("speechSynthesis" in window) {
    status(speechStatus, "● READY", true);
} else {
    status(speechStatus, "○ NOT SUPPORTED", false);
}

add("J.A.R.V.I.S: System initialized. Awaiting your command, Boss.", "ai");
    
