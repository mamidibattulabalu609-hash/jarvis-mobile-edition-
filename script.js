/* ==========================================
   J.A.R.V.I.S PERSONAL AI ASSISTANT
   Gemini AI + Voice + Camera + Memory + Weather
========================================== */

// ===== 1. CONFIGURATION =====

const MODEL = "gemini-2.5-flash";

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

let API_KEY = sessionStorage.getItem("jarvis_key") || "";

let chatHistory = [];

try {
  const saved = JSON.parse(
    localStorage.getItem("jarvis_history") || "[]"
  );

  chatHistory = Array.isArray(saved) ? saved : [];
} catch {
  chatHistory = [];
}

let busy = false;
let recognition = null;
let isListening = false;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

// ===== 2. HTML ELEMENTS =====

const input = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const camBtn = document.getElementById("cam-btn");
const clearBtn = document.getElementById("clear-btn");
const imageInput = document.getElementById("img-input");
const chat = document.getElementById("chat");
const statusElement = document.getElementById("system-status");

// ===== 3. MESSAGE DISPLAY =====

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

function saveHistory() {
  try {
    chatHistory = chatHistory.slice(-20);

    localStorage.setItem(
      "jarvis_history",
      JSON.stringify(chatHistory)
    );
  } catch (error) {
    console.warn("History save failed:", error);
  }
}

function restoreChat() {
  if (!chat) return;

  chat.innerHTML = "";

  if (!chatHistory.length) {
    addMessage(
      "Systems online. How may I assist you?",
      "ai"
    );
    return;
  }

  chatHistory.forEach(item => {
    const message = item.parts
      ?.map(part => part.text || "")
      .join("");

    if (message) {
      addMessage(
        message,
        item.role === "user" ? "user" : "ai"
      );
    }
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

// ===== 5. VOICE INPUT =====

function getSpeechRecognition() {
  return (
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    null
  );
}

function stopRecognition() {
  if (recognition) {
    const oldRecognition = recognition;
    recognition = null;

    try {
      oldRecognition.stop();
    } catch (error) {
      console.log(error);
    }
  }

  isListening = false;

  if (micBtn) {
    micBtn.classList.remove("active");
  }
}

function startVoiceInput() {
  const SpeechRecognition = getSpeechRecognition();

  if (!SpeechRecognition) {
    addMessage(
      "Voice input is not supported. Try a supported browser.",
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

  recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  isListening = true;

  if (micBtn) micBtn.classList.add("active");

  setStatus("LISTENING...");

  recognition.onresult = event => {
    const transcript =
      event.results[0][0].transcript.trim();

    if (!transcript) return;

    if (input) input.value = transcript;

    stopRecognition();
    setStatus("VOICE RECEIVED");

    sendMessage();
  };

  recognition.onerror = event => {
    stopRecognition();

    addMessage(
      "Voice error: " + event.error,
      "ai"
    );

    setStatus("VOICE ERROR");
  };

  recognition.onend = () => {
    isListening = false;

    if (micBtn) {
      micBtn.classList.remove("active");
    }

    if (statusElement?.textContent === "LISTENING...") {
      setStatus("SYSTEM READY");
    }
  };

  try {
    recognition.start();
  } catch (error) {
    stopRecognition();

    addMessage(
      "Could not start microphone. Try again.",
      "ai"
    );

    setStatus("MICROPHONE ERROR");
  }
}

// ===== 6. CAMERA =====

function openCamera() {
  if (!imageInput) {
    addMessage("Image input is missing from HTML.", "ai");
    return;
  }

  imageInput.accept = "image/*";
  imageInput.setAttribute("capture", "environment");
  imageInput.click();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("Image reading failed."));
        return;
      }

      resolve(result.split(",")[1]);
    };

    reader.onerror = () =>
      reject(new Error("Could not read image."));

    reader.readAsDataURL(file);
  });
}

async function processImage() {
  const file = imageInput?.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    addMessage("Please select a valid image.", "ai");
    imageInput.value = "";
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    addMessage("Please choose an image smaller than 10 MB.", "ai");
    imageInput.value = "";
    return;
  }

  try {
    setStatus("PROCESSING IMAGE...");

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
    addMessage(error.message, "ai");
    setStatus("IMAGE ERROR");

  } finally {
    imageInput.value = "";
  }
}

// ===== 7. WEATHER =====

async function getWeather(promptText) {
  const match = promptText.match(
    /(?:weather|temperature|forecast)\s+(?:in|for|at)\s+([a-zA-Z\s]+?)(?:\s+(?:today|tomorrow|now)|[?.!]|$)/i
  );

  const city = match ? match[1].trim() : "Vijayawada";

  try {
    setStatus("FETCHING WEATHER...");

    const geoURL =
      "https://geocoding-api.open-meteo.com/v1/search?" +
      new URLSearchParams({
        name: city,
        count: "1",
        language: "en",
        format: "json"
      });

    const geoResponse = await fetch(geoURL);

    if (!geoResponse.ok) {
      throw new Error("Location service unavailable.");
    }

    const geoData = await geoResponse.json();

    if (!geoData.results?.length) {
      return "I could not find " + city + ".";
    }

    const place = geoData.results[0];

    const weatherURL =
      "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({
        latitude: place.latitude,
        longitude: place.longitude,
        current: "temperature_2m,wind_speed_10m",
        timezone: "auto"
      });

    const weatherResponse = await fetch(weatherURL);

    if (!weatherResponse.ok) {
      throw new Error("Weather service unavailable.");
    }

    const weatherData = await weatherResponse.json();

    const current = weatherData.current;

    if (!current) {
      throw new Error("Weather information unavailable.");
    }

    return (
      "Current weather in " +
      place.name + ", " + place.country +
      ": Temperature " +
      current.temperature_2m + "°C. Wind speed " +
      current.wind_speed_10m + " km/h."
    );

  } catch (error) {
    console.error("Weather error:", error);
    return "Unable to get weather right now.";
  }
}

// ===== 8. LOCAL COMMANDS =====

async function handleTools(command) {
  const t = command.toLowerCase().trim();

  // WEATHER
  if (/\b(weather|temperature|forecast)\b/.test(t)) {
    return await getWeather(command);
  }

  // TIME
  if (/\b(time|clock)\b/.test(t)) {
    return "Current time: " +
      new Date().toLocaleTimeString("en-IN");
  }

  // DATE
  if (/\b(date|today's date|what day is today)\b/.test(t)) {
    return "Today's date: " +
      new Date().toLocaleDateString("en-IN");
  }

  // DAY
  if (/\b(day of week|weekday)\b/.test(t)) {
    return "Today is " +
      new Date().toLocaleDateString("en-IN", {
        weekday: "long"
      });
  }

  // OPEN WEBSITES
  const websites = {
    "open google": "https://www.google.com",
    "open youtube": "https://www.youtube.com",
    "open gmail": "https://mail.google.com",
    "open github": "https://github.com",
    "open instagram": "https://www.instagram.com",
    "open whatsapp": "https://www.whatsapp.com"
  };

  for (const [cmd, url] of Object.entries(websites)) {
    if (t === cmd || t.includes(cmd)) {
      const siteName = cmd.replace("open ", "");

      const newWindow = window.open(
        url,
        "_blank",
        "noopener,noreferrer"
      );

      if (!newWindow) {
        return "Your browser blocked the popup. Please allow popups for this page.";
      }

      return "Opening " + siteName + "...";
    }
  }

  return null;
}

// ===== 9. GEMINI AI =====

async function callGemini(contents) {
  if (!API_KEY) {
    const enteredKey = prompt(
      "Enter your Gemini API key:"
    );

    if (!enteredKey?.trim()) {
      throw new Error("Gemini API key is required.");
    }

    API_KEY = enteredKey.trim();

    // Keep the key for this browser session only.
    sessionStorage.setItem("jarvis_key", API_KEY);
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(
        GEMINI_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": API_KEY
          },

          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text:
                  "You are J.A.R.V.I.S., a helpful, intelligent and concise personal AI assistant. Reply naturally and clearly."
              }]
            },

            contents
          })
        }
      );

      const data = await response.json();

      if (response.ok) {
        const reply =
          data.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

        if (!reply) {
          throw new Error("AI returned an empty response.");
        }

        return reply;
      }

      if (
        response.status === 429 ||
        response.status === 503
      ) {
        if (attempt < 3) {
          setStatus("RETRYING AI CONNECTION...");
          await sleep(1000 * attempt);
          continue;
        }
      }

      throw new Error(
        data.error?.message ||
        "Gemini API error: " + response.status
      );

    } catch (error) {
      if (attempt === 3) throw error;

      if (
        !String(error.message).includes("fetch")
      ) {
        throw error;
      }

      await sleep(1000);
    }
  }

  throw new Error("AI connection failed.");
}

// ===== 10. MAIN SEND FUNCTION =====

async function sendMessage(imageData = null) {
  if (busy) return;

  const message = input?.value.trim() || "";

  if (!message && !imageData) return;

  busy = true;

  if (input) input.value = "";

  addMessage(
    message || "Image attached",
    "user"
  );

  try {
    // Local commands
    if (!imageData) {
      const toolReply = await handleTools(message);

      if (toolReply) {
        addMessage(toolReply, "ai");
        speak(toolReply);
        setStatus("SYSTEM READY");
        return;
      }
    }

    setStatus("THINKING...");

    const userParts = [];

    if (message) {
      userParts.push({ text: message });
    }

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
      {
        role: "user",
        parts: userParts
      }
    ];

    const aiReply = await callGemini(requestContents);

    // Save text history only, not large image data.
    chatHistory.push({
      role: "user",
      parts: [{
        text: message || "[Image attached]"
      }]
    });

    chatHistory.push({
      role: "model",
      parts: [{
        text: aiReply
      }]
    });

    saveHistory();

    addMessage(aiReply, "ai");
    speak(aiReply);

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
  }
}

// ===== 11. CLEAR CHAT =====

function clearChat() {
  if (busy) return;

  chatHistory = [];

  localStorage.removeItem("jarvis_history");

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  stopRecognition();

  restoreChat();

  setStatus("MEMORY CLEARED");
}

// ===== 12. INITIALIZE BUTTONS =====

function initializeJarvis() {
  if (sendBtn) {
    sendBtn.addEventListener("click", sendMessage);
  }

  if (input) {
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendMessage();
      }
    });
  }

  if (micBtn) {
    micBtn.addEventListener(
      "click",
      startVoiceInput
    );
  }

  if (camBtn) {
    camBtn.addEventListener(
      "click",
      openCamera
    );
  }

  if (imageInput) {
    imageInput.addEventListener(
      "change",
      processImage
    );
  }

  if (clearBtn) {
    clearBtn.addEventListener(
      "click",
      clearChat
    );
  }

  restoreChat();

  setStatus("SYSTEM READY");

  console.log("J.A.R.V.I.S initialized successfully.");
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeJarvis
  );
} else {
  initializeJarvis();
}
