/* ==========================================
   J.A.R.V.I.S. AI ASSISTANT
   Gemini 3.6 Flash
   Chat + Voice + Camera + Weather + Chat History
========================================== */

const CONFIG = {
  MODEL: "gemini-3.6-flash",
  API_URL: "https://generativelanguage.googleapis.com/v1beta/models/",
  HISTORY_KEY: "jarvis_chat_history",
  MAX_HISTORY: 12
};

// ===== ELEMENTS =====
const chat = document.getElementById("chat");
const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");
const imageInput = document.getElementById("img-input");
const statusElement = document.getElementById("system-status");

// ===== STATE =====
let history = [];
let selectedImage = null;
let recognition = null;
let busy = false;

// ===== API KEY =====
function getApiKey() {
  let key = sessionStorage.getItem("jarvis_api_key");

  if (!key) {
    key = prompt("Enter your Gemini API key:");
    if (!key) return null;
    sessionStorage.setItem("jarvis_api_key", key.trim());
  }

  return key.trim();
}

// ===== STATUS =====
function setStatus(message) {
  if (statusElement) statusElement.textContent = message;
}

// ===== CHAT DISPLAY =====
function addMessage(sender, message) {
  const item = document.createElement("div");

  item.className =
    sender === "YOU"
      ? "message user-message"
      : "message jarvis-message";

  const label = document.createElement("strong");
  label.textContent = sender + ": ";

  const content = document.createElement("span");
  content.textContent = message;

  item.appendChild(label);
  item.appendChild(content);
  chat.appendChild(item);

  chat.scrollTop = chat.scrollHeight;
}

function showWelcome() {
  if (chat.children.length === 0) {
    addMessage("J.A.R.V.I.S", "Systems online. How may I assist you?");
  }
}

// ===== SAVE HISTORY =====
function saveHistory() {
  try {
    localStorage.setItem(
      CONFIG.HISTORY_KEY,
      JSON.stringify(history)
    );
  } catch (error) {
    console.warn("Could not save chat history:", error);
  }
}

function loadHistory() {
  try {
    history = JSON.parse(
      localStorage.getItem(CONFIG.HISTORY_KEY) || "[]"
    );

    if (!Array.isArray(history)) history = [];

    history.forEach(item => {
      if (item.role === "user") {
        addMessage("YOU", item.text);
      } else if (item.role === "model") {
        addMessage("J.A.R.V.I.S", item.text);
      }
    });
  } catch (error) {
    history = [];
  }

  showWelcome();
}

// ===== GEMINI API =====
async function askGemini(message, image = null) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("Gemini API key was not provided.");
  }

  const parts = [
    { text: message }
  ];

  // Add image ONLY when an image was selected.
  // This fixes: Inline data requires a mime_type.
  if (image) {
    parts.push({
      inline_data: {
        mime_type: image.mimeType || "image/jpeg",
        data: image.base64
      }
    });
  }

  const contents = [
    ...history.slice(-CONFIG.MAX_HISTORY).map(item => ({
      role: item.role,
      parts: [{ text: item.text }]
    })),
    {
      role: "user",
      parts: parts
    }
  ];

  const response = await fetch(
    CONFIG.API_URL + CONFIG.MODEL + ":generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{
            text:
              "You are J.A.R.V.I.S., a helpful AI assistant. " +
              "Be friendly, clear, accurate and concise. " +
              "Do not claim to control devices or access information " +
              "unless the user has provided that capability."
          }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const detail =
      data.error?.message || "Gemini request failed.";

    throw new Error(
      "Gemini API error (" + response.status + "): " + detail
    );
  }

  const answer =
    data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

  if (!answer) {
    throw new Error("Gemini returned an empty response.");
  }

  return answer;
}

// ===== SEND MESSAGE =====
async function sendMessage() {
  if (busy) return;

  const message = input.value.trim();

  if (!message && !selectedImage) return;

  const imageToSend = selectedImage;

  input.value = "";
  selectedImage = null;

  if (imageInput) imageInput.value = "";

  if (message) addMessage("YOU", message);
  else addMessage("YOU", "Please describe this image.");

  busy = true;
  sendBtn.disabled = true;
  setStatus("CONNECTING...");

  try {
    const prompt = message || "Describe this image.";

    const answer = await askGemini(prompt, imageToSend);

    addMessage("J.A.R.V.I.S", answer);

    history.push(
      { role: "user", text: prompt },
      { role: "model", text: answer }
    );

    history = history.slice(-CONFIG.MAX_HISTORY);
    saveHistory();

    speak(answer);
    setStatus("OPERATIONAL");

  } catch (error) {
    console.error(error);

    addMessage("J.A.R.V.I.S", "Error: " + error.message);
    setStatus("CONNECTION ERROR");

  } finally {
    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

// ===== BUTTONS =====
sendBtn?.addEventListener("click", sendMessage);

input?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});

clearBtn?.addEventListener("click", () => {
  history = [];
  localStorage.removeItem(CONFIG.HISTORY_KEY);

  if (chat) chat.innerHTML = "";

  selectedImage = null;
  if (imageInput) imageInput.value = "";

  showWelcome();
  setStatus("MEMORY CLEARED");
});

// ===== IMAGE / CAMERA =====
camBtn?.addEventListener("click", () => {
  imageInput?.click();
});

imageInput?.addEventListener("change", event => {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    addMessage("J.A.R.V.I.S", "Please select an image file.");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const result = reader.result;

    if (typeof result !== "string") return;

    const base64 = result.split(",")[1];

    if (!base64) {
      addMessage("J.A.R.V.I.S", "Could not read the image.");
      return;
    }

    selectedImage = {
      base64: base64,
      mimeType: file.type || "image/jpeg"
    };

    addMessage("J.A.R.V.I.S", "Image ready. Type a question and press EXECUTE.");
  };

  reader.onerror = () => {
    addMessage("J.A.R.V.I.S", "Could not read the selected image.");
  };

  reader.readAsDataURL(file);
});

// ===== VOICE OUTPUT =====
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
    addMessage(
      "J.A.R.V.I.S",
      "Voice recognition error: " + event.error
    );
  };

  recognition.onend = () => {
    if (micBtn) micBtn.disabled = false;
  };
}

micBtn?.addEventListener("click", () => {
  if (!recognition) {
    addMessage(
      "J.A.R.V.I.S",
      "Voice recognition is not supported in this browser."
    );
    return;
  }

  try {
    micBtn.disabled = true;
    recognition.start();
  } catch (error) {
    micBtn.disabled = false;
    console.error(error);
  }
});

// ===== WEATHER =====
async function getWeather(city) {
  const locationResponse = await fetch(
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(city) +
    "&count=1&language=en&format=json"
  );

  if (!locationResponse.ok) {
    throw new Error("Could not find the city.");
  }

  const locationData = await locationResponse.json();
  const place = locationData.results?.[0];

  if (!place) {
    throw new Error("City not found.");
  }

  const weatherResponse = await fetch(
    "https://api.open-meteo.com/v1/forecast?latitude=" +
    place.latitude +
    "&longitude=" +
    place.longitude +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m"
  );

  if (!weatherResponse.ok) {
    throw new Error("Weather service unavailable.");
  }

  const weatherData = await weatherResponse.json();
  const current = weatherData.current;

  return (
    "Weather in " + place.name + ": " +
    current.temperature_2m + "°C. " +
    "Humidity: " + current.relative_humidity_2m + "%. " +
    "Wind speed: " + current.wind_speed_10m + " km/h."
  );
}

// ===== LOCAL COMMANDS =====
async function handleCommand(message) {
  const lower = message.toLowerCase();

  if (lower === "time" || lower.includes("what time")) {
    return "The current time is " +
      new Date().toLocaleTimeString("en-IN");
  }

  if (lower === "date" || lower.includes("today's date")) {
    return "Today's date is " +
      new Date().toLocaleDateString("en-IN");
  }

  if (lower.includes("weather")) {
    const match = message.match(
      /weather(?:\s+in)?\s+(.+)/i
    );

    if (!match) {
      return "Please say the city name, for example: weather in Vijayawada.";
    }

    return await getWeather(match[1].trim());
  }

  return null;
}

// ===== OVERRIDE SEND FOR LOCAL COMMANDS =====
const originalSendMessage = sendMessage;

sendBtn?.removeEventListener("click", originalSendMessage);

async function executeMessage() {
  if (busy) return;

  const message = input.value.trim();

  if (!message && !selectedImage) return;

  if (message && !selectedImage) {
    try {
      const localAnswer = await handleCommand(message);

      if (localAnswer) {
        input.value = "";
        addMessage("YOU", message);
        addMessage("J.A.R.V.I.S", localAnswer);
        speak(localAnswer);
        return;
      }
    } catch (error) {
      input.value = "";
      addMessage("YOU", message);
      addMessage("J.A.R.V.I.S", error.message);
      return;
    }
  }

  await originalSendMessage();
}

sendBtn?.addEventListener("click", executeMessage);

input?.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    executeMessage();
  }
});

// ===== START =====
loadHistory();
setStatus("OPERATIONAL");

console.log("J.A.R.V.I.S. initialized.");
