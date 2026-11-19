
/* =====================================
   J.A.R.V.I.S. AI ASSISTANT
   Gemini 3.6 Flash
   Chat + Image + Voice + Memory
===================================== */

const MODEL = "gemini-3.8-flash";
const API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/";

const HISTORY_KEY = "jarvis_chat_history";
const KEY_NAME = "jarvis_key";
const MAX_HISTORY = 12;

// ===== API KEY =====
let API_KEY = localStorage.getItem(KEY_NAME);

if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:");

  if (API_KEY) {
    localStorage.setItem(KEY_NAME, API_KEY.trim());
    API_KEY = API_KEY.trim();
  }
}

// ===== HTML ELEMENTS =====
const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");

// ===== MEMORY =====
let history = [];

try {
  history = JSON.parse(
    localStorage.getItem(HISTORY_KEY) || "[]"
  );
} catch {
  history = [];
}

let selectedImage = null;
let busy = false;

// ===== DISPLAY MESSAGE =====
function addMessage(text, sender) {
  const message = document.createElement("div");

  message.className = sender;
  message.textContent = text;

  chat.appendChild(message);
  chat.scrollTop = chat.scrollHeight;

  return message;
}

// ===== SAVE MEMORY =====
function saveHistory() {
  history = history.slice(-MAX_HISTORY);

  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(history)
  );
}

// ===== IMAGE UPLOAD =====
if (camBtn && imgInput) {
  camBtn.addEventListener("click", () => {
    imgInput.click();
  });
}

if (imgInput) {
  imgInput.addEventListener("change", async () => {
    const file = imgInput.files[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addMessage("Please select a valid image.", "ai");
      return;
    }

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve(reader.result.split(",")[1]);
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      selectedImage = {
        data: base64,
        mimeType: file.type
      };

      addMessage("Image selected: " + file.name, "ai");

    } catch (error) {
      addMessage("Image upload failed.", "ai");
    }
  });
}

// ===== GEMINI API =====
async function askGemini(question, image = null) {
  if (!API_KEY) {
    throw new Error("API key is missing. Refresh and enter your key.");
  }

  const parts = [{ text: question }];

  if (image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.data
      }
    });
  }

  const contents = [
    ...history,
    {
      role: "user",
      parts: parts
    }
  ];

  const response = await fetch(
    `${API_URL}${MODEL}:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "Gemini API request failed."
    );
  }

  const answer =
    result.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!answer) {
    throw new Error("Gemini returned an empty response.");
  }

  history.push(
    { role: "user", parts: [{ text: question }] },
    { role: "model", parts: [{ text: answer }] }
  );

  saveHistory();

  return answer;
}

// ===== SEND MESSAGE =====
async function sendMessage() {
  const question = input.value.trim();

  if ((!question && !selectedImage) || busy) return;

  if (!API_KEY) return;

  busy = true;
  sendBtn.disabled = true;

  addMessage(
    question || "Please analyse this image.",
    "user"
  );

  input.value = "";

  const image = selectedImage;
  selectedImage = null;

  const loading = addMessage("J.A.R.V.I.S: Thinking...", "ai");

  try {
    const answer = await askGemini(question, image);

    loading.textContent = "J.A.R.V.I.S: " + answer;

    speak(answer);

  } catch (error) {
    loading.textContent = "J.A.R.V.I.S Error: " + error.message;
    console.error(error);
  }

  busy = false;
  sendBtn.disabled = false;
  input.focus();
}

// ===== SEND BUTTON =====
if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

// ===== ENTER KEY =====
if (input) {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

// ===== VOICE REPLY =====
function speak(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-IN";
  speech.rate = 1;
  speech.pitch = 1;

  window.speechSynthesis.speak(speech);
}

// ===== VOICE INPUT =====
const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = event => {
    const spokenText =
      event.results[0][0].transcript;

    input.value = spokenText;
    sendMessage();
  };

  recognition.onerror = event => {
    addMessage("Voice error: " + event.error, "ai");
  };

  recognition.onend = () => {
    if (micBtn) micBtn.textContent = "🎤";
  };
}

if (micBtn) {
  micBtn.addEventListener("click", () => {
    if (!recognition) {
      addMessage(
        "Voice recognition is not supported in this browser.",
        "ai"
      );
      return;
    }

    micBtn.textContent = "🔴";
    recognition.start();
  });
}

// ===== CLEAR CHAT MEMORY =====
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    history = [];
    localStorage.removeItem(HISTORY_KEY);
    chat.innerHTML = "";

    addMessage(
      "J.A.R.V.I.S: Memory cleared. Systems ready.",
      "ai"
    );

    window.speechSynthesis?.cancel();
  });
}

// ===== STARTUP =====
addMessage(
  "J.A.R.V.I.S: Systems online. How may I assist you?",
  "ai"
);

