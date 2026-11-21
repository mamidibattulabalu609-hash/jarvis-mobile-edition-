/* =========================================================
   J.A.R.V.I.S. PERSONAL AI ASSISTANT
   Gemini 3.5 Flash | Agent tools | Voice | Camera | Memory
   Works with the current index.html IDs:
   chat, msg, send, mic, camera, clear, cameraContainer,
   cameraPreview, cameraCanvas, capture
========================================================= */

(() => {
  "use strict";

  // ---------- CONFIGURATION ----------
  const CONFIG = {
    MODEL: "gemini-3.5-flash",
    API_BASE: "https://generativelanguage.googleapis.com/v1beta/models/",
    MAX_HISTORY_MESSAGES: 16,
    MAX_AGENT_STEPS: 5,
    REQUEST_TIMEOUT_MS: 45000,
    SPEECH_LANGUAGE: "en-IN",
    AUTO_SPEAK: true,
    SYSTEM_PROMPT:
      "You are J.A.R.V.I.S., a helpful, concise personal AI assistant. " +
      "Answer clearly and naturally. Use available tools when they genuinely help. " +
      "Never claim a tool succeeded unless its result confirms success. " +
      "Ask before taking actions that could delete or change user data."
  };

  // API keys used in a browser can be seen by anyone who can access the site.
  // For personal testing only. Use API-key restrictions in Google AI Studio.
  const KEY_STORAGE = "jarvis_session_api_key";
  const HISTORY_STORAGE = "jarvis_chat_history_v2";
  const NOTES_STORAGE = "jarvis_notes_v1";

  // ---------- ELEMENTS ----------
  const $ = (id) => document.getElementById(id);

  const input = $("msg");
  const sendBtn = $("send");
  const micBtn = $("mic") || $("mic-btn");
  const cameraBtn = $("camera") || $("cam-btn");
  const clearBtn = $("clear") || $("clear-btn");
  const chat = $("chat");

  const cameraContainer = $("cameraContainer");
  const cameraPreview = $("cameraPreview");
  const cameraCanvas = $("cameraCanvas");
  const captureBtn = $("capture");

  let apiKey = "";
  let busy = false;
  let recognition = null;
  let listening = false;
  let cameraStream = null;
  let activeAssistantBubble = null;
  let currentAbortController = null;

  // ---------- SAFE STORAGE ----------
  function storageGet(storage, key, fallback) {
    try {
      const value = storage.getItem(key);
      return value === null ? fallback : value;
    } catch (error) {
      console.warn("Storage read unavailable:", error);
      return fallback;
    }
  }

  function storageSet(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn("Storage write unavailable:", error);
      return false;
    }
  }

  function loadHistory() {
    try {
      const parsed = JSON.parse(storageGet(localStorage, HISTORY_STORAGE, "[]"));
      return Array.isArray(parsed) ? parsed.slice(-CONFIG.MAX_HISTORY_MESSAGES) : [];
    } catch {
      return [];
    }
  }

  let history = loadHistory();

  function saveHistory() {
    history = history.slice(-CONFIG.MAX_HISTORY_MESSAGES);
    storageSet(localStorage, HISTORY_STORAGE, JSON.stringify(history));
  }

  function loadNotes() {
    try {
      const parsed = JSON.parse(storageGet(localStorage, NOTES_STORAGE, "[]"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveNotes(notes) {
    storageSet(localStorage, NOTES_STORAGE, JSON.stringify(notes));
  }

  // ---------- STATUS + CHAT UI ----------
  function setStatus(message) {
    const status = $("system-status");
    if (status) status.textContent = message;

    const connection = $("connection-label");
    if (connection) connection.textContent = message;
  }

  function scrollChat() {
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  function addMessage(message, type = "ai") {
    if (!chat) return null;

    const bubble = document.createElement("div");
    bubble.className = type === "user" ? "message user" : "message ai";
    bubble.textContent =
      (type === "user" ? "YOU: " : "J.A.R.V.I.S: ") + String(message || "");

    chat.appendChild(bubble);
    scrollChat();
    return bubble;
  }

  function addAssistantBubble() {
    const bubble = document.createElement("div");
    bubble.className = "message ai";
    bubble.textContent = "J.A.R.V.I.S: ";
    chat?.appendChild(bubble);
    scrollChat();
    return bubble;
  }

  function updateAssistantBubble(bubble, text) {
    if (!bubble) return;
    bubble.textContent = "J.A.R.V.I.S: " + text;
    scrollChat();
  }

  function addLinkMessage(label, url) {
    if (!chat) return;
    const wrapper = document.createElement("div");
    wrapper.className = "message ai";

    const text = document.createElement("span");
    text.textContent = "J.A.R.V.I.S: " + label + " ";

    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "OPEN";
    link.style.color = "#00ffff";
    link.style.textDecoration = "underline";

    wrapper.append(text, link);
    chat.appendChild(wrapper);
    scrollChat();
  }

  function renderHistory() {
    if (!chat) return;
    chat.innerHTML = "";

    if (!history.length) {
      addMessage("Systems online. How may I assist you today?", "ai");
      return;
    }

    history.forEach((item) => {
      const text = item.parts
        ?.filter((part) => typeof part.text === "string")
        .map((part) => part.text)
        .join("");

      if (text) {
        addMessage(text, item.role === "user" ? "user" : "ai");
      }
    });
  }

  // ---------- API KEY ----------
  function askForApiKey() {
    apiKey = storageGet(sessionStorage, KEY_STORAGE, "");

    if (!apiKey) {
      const entered = window.prompt(
        "Enter your Gemini API key to start J.A.R.V.I.S.:"
      );

      if (entered && entered.trim()) {
        apiKey = entered.trim();
        storageSet(sessionStorage, KEY_STORAGE, apiKey);
      }
    }

    if (!apiKey) {
      setStatus("API KEY REQUIRED");
      addMessage(
        "Gemini API key is required. Refresh the page and enter your key to connect.",
        "ai"
      );
      return false;
    }

    setStatus("API KEY LOADED");
    return true;
  }

  // ---------- SPEECH OUTPUT ----------
  function speak(text) {
    if (!CONFIG.AUTO_SPEAK || !("speechSynthesis" in window) || !text) return;

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = CONFIG.SPEECH_LANGUAGE;
      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onstart = () => setStatus("SPEAKING...");
      utterance.onend = () => setStatus("SYSTEM READY");
      utterance.onerror = () => setStatus("SYSTEM READY");

      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.warn("Speech output unavailable:", error);
    }
  }

  // ---------- SPEECH INPUT ----------
  function stopVoiceInput() {
    if (recognition) {
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      } catch (error) {
        console.warn("Voice stop:", error);
      }
    }

    recognition = null;
    listening = false;
    micBtn?.classList.remove("active");
  }

  function startVoiceInput() {
    const SpeechAPI =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechAPI) {
      addMessage(
        "Voice input is not supported by this browser. Try the latest Chrome browser.",
        "ai"
      );
      setStatus("VOICE NOT SUPPORTED");
      return;
    }

    if (listening) {
      stopVoiceInput();
      setStatus("SYSTEM READY");
      return;
    }

    if (busy) {
      addMessage("Please wait until the current request finishes.", "ai");
      return;
    }

    stopVoiceInput();

    recognition = new SpeechAPI();
    recognition.lang = CONFIG.SPEECH_LANGUAGE;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    listening = true;
    micBtn?.classList.add("active");
    setStatus("LISTENING...");

    recognition.onresult = (event) => {
      let transcript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      if (input) input.value = transcript.trim();

      const last = event.results[event.results.length - 1];
      if (last?.isFinal && transcript.trim()) {
        const finalText = transcript.trim();
        stopVoiceInput();
        if (input) input.value = finalText;
        sendMessage();
      }
    };

    recognition.onerror = (event) => {
      stopVoiceInput();
      const reason = event.error || "unknown";

      if (reason === "not-allowed" || reason === "service-not-allowed") {
        addMessage(
          "Microphone permission was blocked. Allow microphone access in your browser settings.",
          "ai"
        );
      } else if (reason === "no-speech") {
        addMessage("No speech detected. Tap the microphone and try again.", "ai");
      } else if (reason !== "aborted") {
        addMessage("Voice input error: " + reason, "ai");
      }

      setStatus("VOICE ERROR");
    };

    recognition.onend = () => {
      listening = false;
      micBtn?.classList.remove("active");
      if (String($("system-status")?.textContent || "").includes("LISTENING")) {
        setStatus("SYSTEM READY");
      }
    };

    try {
      recognition.start();
    } catch (error) {
      stopVoiceInput();
      addMessage("Could not start the microphone. Please try again.", "ai");
      setStatus("MICROPHONE ERROR");
      console.error(error);
    }
  }

  // ---------- IMAGE HELPERS ----------
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== "string") {
          reject(new Error("Could not read the selected image."));
          return;
        }
        resolve(reader.result.split(",")[1]);
      };

      reader.onerror = () => reject(new Error("Image reading failed."));
      reader.readAsDataURL(file);
    });
  }

  function resizeImageDataUrl(dataUrl, maxSide = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Image canvas is unavailable."));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };

      image.onerror = () => reject(new Error("Could not process the image."));
      image.src = dataUrl;
    });
  }

  // ---------- CAMERA ----------
  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      addMessage(
        "Camera access is unavailable. Open this GitHub Pages site over HTTPS in a supported browser.",
        "ai"
      );
      return;
    }

    if (cameraStream) {
      closeCamera();
      return;
    }

    try {
      setStatus("OPENING CAMERA...");

      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      if (cameraPreview) {
        cameraPreview.srcObject = cameraStream;
        await cameraPreview.play().catch(() => {});
      }

      if (cameraContainer) cameraContainer.hidden = false;
      setStatus("CAMERA READY");
    } catch (error) {
      cameraStream = null;
      console.error("Camera error:", error);

      // Fallback to the phone's image picker/camera.
      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "image/*";
      picker.setAttribute("capture", "environment");

      picker.addEventListener("change", async () => {
        const file = picker.files?.[0];
        if (!file) return;

        try {
          const data = await fileToBase64(file);
          const resized = await resizeImageDataUrl(
            "data:" + file.type + ";base64," + data
          );
          await sendMessage({
            text: input?.value.trim() || "Describe this image.",
            image: { mimeType: "image/jpeg", data: resized }
          });
        } catch (imageError) {
          addMessage("Image error: " + imageError.message, "ai");
        }
      });

      picker.click();
      setStatus("CAMERA PICKER");
    }
  }

  function closeCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }

    if (cameraPreview) cameraPreview.srcObject = null;
    if (cameraContainer) cameraContainer.hidden = true;
    setStatus("SYSTEM READY");
  }

  async function captureCameraImage() {
    if (!cameraStream || !cameraPreview || !cameraCanvas) {
      addMessage("Open the camera first, then tap CAPTURE IMAGE.", "ai");
      return;
    }

    const width = cameraPreview.videoWidth;
    const height = cameraPreview.videoHeight;

    if (!width || !height) {
      addMessage("Camera is still starting. Please try again in a moment.", "ai");
      return;
    }

    cameraCanvas.width = width;
    cameraCanvas.height = height;

    const context = cameraCanvas.getContext("2d");
    context.drawImage(cameraPreview, 0, 0, width, height);

    const dataUrl = cameraCanvas.toDataURL("image/jpeg", 0.82);
    const base64 = dataUrl.split(",")[1];

    closeCamera();

    await sendMessage({
      text: input?.value.trim() || "Describe what you can see in this image.",
      image: { mimeType: "image/jpeg", data: base64 }
    });
  }

  // ---------- SAFE CALCULATOR ----------
  function calculateExpression(expression) {
    const source = String(expression)
      .replace(/,/g, "")
      .replace(/\b(sqrt|sin|cos|tan|log|ln|abs|pi)\b/gi, (word) => word.toLowerCase());

    if (!/^[0-9+\-*/().%\s^a-z]*$/i.test(source)) {
      throw new Error("Only basic arithmetic and supported math functions are allowed.");
    }

    const tokens = source.match(
      /(?:\d+(?:\.\d*)?|\.\d+)|(?:sqrt|sin|cos|tan|log|ln|abs|pi)|[()+\-*/%^]/gi
    );

    if (!tokens || tokens.join("").replace(/\s/g, "") !== source.replace(/\s/g, "")) {
      throw new Error("Please enter a valid math expression.");
    }

    let index = 0;

    function peek() {
      return tokens[index];
    }

    function consume() {
      return tokens[index++];
    }

    function primary() {
      const token = consume();

      if (token === undefined) throw new Error("Incomplete expression.");

      if (token === "+") return unary();
      if (token === "-") return -unary();

      if (token === "(") {
        const value = addSub();
        if (consume() !== ")") throw new Error("Missing closing bracket.");
        return value;
      }

      const lower = token.toLowerCase();

      if (lower === "pi") return Math.PI;

      if (["sqrt", "sin", "cos", "tan", "log", "ln", "abs"].includes(lower)) {
        if (consume() !== "(") throw new Error("Use function calls like sqrt(25).");
        const value = addSub();
        if (consume() !== ")") throw new Error("Missing function closing bracket.");

        const functions = {
          sqrt: Math.sqrt,
          sin: (n) => Math.sin((n * Math.PI) / 180),
          cos: (n) => Math.cos((n * Math.PI) / 180),
          tan: (n) => Math.tan((n * Math.PI) / 180),
          log: Math.log10,
          ln: Math.log,
          abs: Math.abs
        };

        return functions[lower](value);
      }

      const number = Number(token);
      if (!Number.isFinite(number)) throw new Error("Invalid number.");
      return number;
    }

    function power() {
      let value = primary();
      if (peek() === "^") {
        consume();
        value = Math.pow(value, unary());
      }
      return value;
    }

    function unary() {
      return power();
    }

    function multiplyDivide() {
      let value = unary();

      while (["*", "/", "%"].includes(peek())) {
        const operator = consume();
        const right = unary();

        if ((operator === "/" || operator === "%") && right === 0) {
          throw new Error("Cannot divide by zero.");
        }

        if (operator === "*") value *= right;
        if (operator === "/") value /= right;
        if (operator === "%") value %= right;
      }

      return value;
    }

    function addSub() {
      let value = multiplyDivide();

      while (peek() === "+" || peek() === "-") {
        const operator = consume();
        const right = multiplyDivide();
        value = operator === "+" ? value + right : value - right;
      }

      return value;
    }

    const result = addSub();

    if (index !== tokens.length || !Number.isFinite(result)) {
      throw new Error("Could not calculate that expression.");
    }

    return result;
  }

  // ---------- WEATHER ----------
  async function getWeather(city) {
    const place = String(city || "").trim() || "Vijayawada";

    const geoUrl =
      "https://geocoding-api.open-meteo.com/v1/search?name=" +
      encodeURIComponent(place) +
      "&count=1&language=en&format=json";

    const geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) throw new Error("Weather location lookup failed.");

    const geo = await geoResponse.json();
    const location = geo.results?.[0];

    if (!location) return "I could not find that location.";

    const weatherUrl =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      location.latitude +
      "&longitude=" +
      location.longitude +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m";

    const weatherResponse = await fetch(weatherUrl);
    if (!weatherResponse.ok) throw new Error("Weather service is unavailable.");

    const data = await weatherResponse.json();
    const current = data.current;

    if (!current) return "Current weather data is unavailable.";

    return (
      "Current weather in " +
      location.name +
      ": " +
      current.temperature_2m +
      "°C, feels like " +
      current.apparent_temperature +
      "°C, humidity " +
      current.relative_humidity_2m +
      "%, wind " +
      current.wind_speed_10m +
      " km/h."
    );
  }

  // ---------- 15 AGENT TOOLS ----------
  const TOOL_DECLARATIONS = [
    {
      name: "get_current_time",
      description: "Get the current local time on the user's device.",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "get_current_date",
      description: "Get today's local date and day of week.",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "calculate",
      description: "Calculate a basic arithmetic or math expression. Supports + - * / % ^, brackets, pi, sqrt, sin, cos, tan, log, ln and abs. Trigonometry uses degrees.",
      parameters: {
        type: "OBJECT",
        properties: {
          expression: { type: "STRING", description: "Math expression to calculate." }
        },
        required: ["expression"]
      }
    },
    {
      name: "get_weather",
      description: "Get current weather for a city or place.",
      parameters: {
        type: "OBJECT",
        properties: {
          city: { type: "STRING", description: "City or place name." }
        },
        required: ["city"]
      }
    },
    {
      name: "search_web",
      description: "Create a Google search link for information the user wants to look up. This tool does not read search results.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Search terms." }
        },
        required: ["query"]
      }
    },
    {
      name: "open_website",
      description: "Create a safe clickable link to a supported website.",
      parameters: {
        type: "OBJECT",
        properties: {
          site: {
            type: "STRING",
            enum: ["google", "youtube", "gmail", "github", "instagram", "whatsapp", "wikipedia"],
            description: "Website to open."
          }
        },
        required: ["site"]
      }
    },
    {
      name: "save_note",
      description: "Save a note in this browser on this device.",
      parameters: {
        type: "OBJECT",
        properties: {
          note: { type: "STRING", description: "Note text to save." }
        },
        required: ["note"]
      }
    },
    {
      name: "list_notes",
      description: "List notes saved in this browser.",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "delete_note",
      description: "Delete a saved note by its number. Ask the user which note if unclear.",
      parameters: {
        type: "OBJECT",
        properties: {
          number: { type: "INTEGER", description: "1-based note number." }
        },
        required: ["number"]
      }
    },
    {
      name: "set_timer",
      description: "Set a browser timer for a requested number of seconds, up to one hour.",
      parameters: {
        type: "OBJECT",
        properties: {
          seconds: { type: "INTEGER", description: "Timer length in seconds, 1 to 3600." }
        },
        required: ["seconds"]
      }
    },
    {
      name: "get_device_info",
      description: "Get basic browser and device information, without accessing personal files.",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "get_network_status",
      description: "Check whether the browser currently reports an online connection.",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "get_battery_status",
      description: "Get battery percentage and charging status if the browser supports it.",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "convert_units",
      description: "Convert common length, mass, temperature, and speed units.",
      parameters: {
        type: "OBJECT",
        properties: {
          value: { type: "NUMBER", description: "Value to convert." },
          from: { type: "STRING", description: "Source unit." },
          to: { type: "STRING", description: "Target unit." }
        },
        required: ["value", "from", "to"]
      }
    },
    {
      name: "random_number",
      description: "Generate a random whole number between min and max.",
      parameters: {
        type: "OBJECT",
        properties: {
          min: { type: "INTEGER" },
          max: { type: "INTEGER" }
        },
        required: ["min", "max"]
      }
    }
  ];

  // ---------- TOOL IMPLEMENTATIONS ----------
  const WEBSITE_URLS = {
    google: "https://www.google.com/",
    youtube: "https://www.youtube.com/",
    gmail: "https://mail.google.com/",
    github: "https://github.com/",
    instagram: "https://www.instagram.com/",
    whatsapp: "https://www.whatsapp.com/",
    wikipedia: "https://www.wikipedia.org/"
  };

  const activeTimers = [];

  function convertUnits(value, from, to) {
    const f = String(from).toLowerCase().trim();
    const t = String(to).toLowerCase().trim();

    const aliases = {
      m: "m", meter: "m", meters: "m", km: "km", kilometer: "km", kilometers: "km",
      cm: "cm", mm: "mm", mile: "mile", miles: "mile", ft: "ft", feet: "ft",
      kg: "kg", kilogram: "kg", kilograms: "kg", g: "g", gram: "g", grams: "g",
      lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
      c: "c", "°c": "c", celsius: "c", f: "f", "°f": "f", fahrenheit: "f",
      k: "k", kelvin: "k", "m/s": "m/s", "km/h": "km/h", mph: "mph"
    };

    const a = aliases[f];
    const b = aliases[t];
    if (!a || !b) return "Unsupported units. Try m, km, cm, kg, g, lb, °C, °F, K, m/s, km/h or mph.";

    let result;
    const length = { m: 1, km: 1000, cm: 0.01, mm: 0.001, mile: 1609.344, ft: 0.3048 };
    const mass = { kg: 1, g: 0.001, lb: 0.45359237 };
    const speed = { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704 };

    if (a in length && b in length) result = Number(value) * length[a] / length[b];
    else if (a in mass && b in mass) result = Number(value) * mass[a] / mass[b];
    else if (a in speed && b in speed) result = Number(value) * speed[a] / speed[b];
    else if (["c", "f", "k"].includes(a) && ["c", "f", "k"].includes(b)) {
      let celsius = Number(value);
      if (a === "f") celsius = (celsius - 32) * 5 / 9;
      if (a === "k") celsius = celsius - 273.15;
      result = celsius;
      if (b === "f") result = celsius * 9 / 5 + 32;
      if (b === "k") result = celsius + 273.15;
    } else {
      return "Those units are from different measurement categories.";
    }

    return Number(result.toFixed(6)) + " " + to;
  }

  async function executeTool(name, args = {}) {
    switch (name) {
      case "get_current_time":
        return new Date().toLocaleTimeString("en-IN");

      case "get_current_date":
        return new Date().toLocaleDateString("en-IN", {
          weekday: "long", year: "numeric", month: "long", day: "numeric"
        });

      case "calculate":
        return calculateExpression(args.expression);

      case "get_weather":
        return await getWeather(args.city);

      case "search_web": {
        const query = String(args.query || "").trim();
        if (!query) return "No search query was provided.";
        const url = "https://www.google.com/search?q=" + encodeURIComponent(query);
        addLinkMessage("Search the web for: " + query, url);
        return "I prepared a Google search link for: " + query;
      }

      case "open_website": {
        const site = String(args.site || "").toLowerCase();
        const url = WEBSITE_URLS[site];
        if (!url) return "That website is not in the supported website list.";
        addLinkMessage("Tap to open " + site + ":", url);
        return "I prepared a safe link for " + site + ". Tap the OPEN link in the chat.";
      }

      case "save_note": {
        const note = String(args.note || "").trim();
        if (!note) return "The note is empty.";
        const notes = loadNotes();
        notes.push({ text: note, createdAt: new Date().toISOString() });
        saveNotes(notes.slice(-100));
        return "Note saved in this browser.";
      }

      case "list_notes": {
        const notes = loadNotes();
        if (!notes.length) return "There are no saved notes.";
        return notes.map((note, index) => (index + 1) + ". " + note.text).join("\n");
      }

      case "delete_note": {
        const number = Number(args.number);
        const notes = loadNotes();
        if (!Number.isInteger(number) || number < 1 || number > notes.length) {
          return "That note number does not exist.";
        }
        const removed = notes.splice(number - 1, 1)[0];
        saveNotes(notes);
        return "Deleted note: " + removed.text;
      }

      case "set_timer": {
        const seconds = Number(args.seconds);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
          return "Timer length must be between 1 and 3600 seconds.";
        }
        const timerId = window.setTimeout(() => {
          const message = "Your " + seconds + " second timer is complete.";
          addMessage(message, "ai");
          speak(message);
        }, seconds * 1000);
        activeTimers.push(timerId);
        return "Timer started for " + seconds + " seconds.";
      }

      case "get_device_info":
        return {
          platform: navigator.platform || "Not reported",
          language: navigator.language || "Unknown",
          browser: navigator.userAgent,
          screen: window.screen.width + " x " + window.screen.height
        };

      case "get_network_status":
        return navigator.onLine ? "Browser reports that you are online." : "Browser reports that you are offline.";

      case "get_battery_status": {
        if (!navigator.getBattery) return "Battery information is not supported by this browser.";
        const battery = await navigator.getBattery();
        return {
          percentage: Math.round(battery.level * 100) + "%",
          charging: battery.charging
        };
      }

      case "convert_units":
        return convertUnits(args.value, args.from, args.to);

      case "random_number": {
        const min = Number(args.min);
        const max = Number(args.max);
        if (!Number.isInteger(min) || !Number.isInteger(max) || max < min || max - min > 1000000000) {
          return "Please provide valid whole-number limits, with max greater than or equal to min.";
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      default:
        return "Unknown tool: " + name;
    }
  }

  // ---------- GEMINI REQUEST ----------
  async function fetchGemini(contents, onStreamText) {
    const controller = new AbortController();
    currentAbortController = controller;

    const timeout = window.setTimeout(
      () => controller.abort(),
      CONFIG.REQUEST_TIMEOUT_MS
    );

    const url =
      CONFIG.API_BASE +
      CONFIG.MODEL +
      ":streamGenerateContent?alt=sse";

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: CONFIG.SYSTEM_PROMPT }]
          },
          contents,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          toolConfig: {
            functionCallingConfig: { mode: "AUTO" }
          },
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 1024
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || ("HTTP " + response.status);

        if (response.status === 400 || response.status === 401 || response.status === 403) {
          throw new Error("Gemini API error: " + message + ". Check your API key and model access.");
        }

        if (response.status === 429) {
          throw new Error("Gemini rate limit reached. Wait a little and try again.");
        }

        if (response.status >= 500) {
          throw new Error("Gemini service is temporarily unavailable. Please try again.");
        }

        throw new Error(message);
      }

      if (!response.body) {
        throw new Error("Streaming response is not available in this browser.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      const responseParts = [];

      function processSseLine(line) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) return;

        const raw = trimmed.slice(5).trim();
        if (!raw || raw === "[DONE]") return;

        let chunk;
        try {
          chunk = JSON.parse(raw);
        } catch {
          return;
        }

        const parts = chunk.candidates?.[0]?.content?.parts || [];

        for (const part of parts) {
          if (typeof part.text === "string") {
            fullText += part.text;
            responseParts.push({ text: part.text });
            if (onStreamText) onStreamText(fullText);
          }

          if (part.functionCall) {
            responseParts.push({ functionCall: part.functionCall });
          }
        }

        const blockReason = chunk.promptFeedback?.blockReason;
        if (blockReason) {
          throw new Error("The request was blocked: " + blockReason);
        }
      }

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) processSseLine(line);
      }

      if (buffer.trim()) processSseLine(buffer);

      return {
        text: fullText.trim(),
        content: { role: "model", parts: responseParts },
        parts: responseParts
      };
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error("The request took too long and was stopped. Please try again.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
      currentAbortController = null;
    }
  }
   // ---------- AGENT MODE ----------
  async function runAgent(userText, image = null, bubble = null) {
    const userParts = [];

    if (userText) userParts.push({ text: userText });

    if (image) {
      userParts.push({
        inlineData: {
          mimeType: image.mimeType || "image/jpeg",
          data: image.data
        }
      });
    }

    const requestContents = [
      ...history.slice(-CONFIG.MAX_HISTORY_MESSAGES),
      { role: "user", parts: userParts }
    ];

    for (let step = 0; step < CONFIG.MAX_AGENT_STEPS; step++) {
      setStatus(step === 0 ? "THINKING..." : "AGENT WORKING...");

      const result = await fetchGemini(requestContents, (partialText) => {
        updateAssistantBubble(bubble, partialText);
      });

      const calls = result.parts.filter((part) => part.functionCall);

      if (!calls.length) {
        const answer = result.text || "I couldn't generate a response. Please try again.";

        history.push({ role: "user", parts: userParts.filter(p => p.text) });
        history.push({ role: "model", parts: [{ text: answer }] });
        saveHistory();

        return answer;
      }

      // Add Gemini's tool-call turn to the conversation.
      requestContents.push(result.content);

      // Execute each requested tool and send the result back to Gemini.
      const functionResponses = [];

      for (const part of calls) {
        const call = part.functionCall;
        let toolResult;

        try {
          toolResult = await executeTool(call.name, call.args || {});
        } catch (error) {
          toolResult = "Tool error: " + (error.message || "Unknown error");
          console.error("Tool error:", call.name, error);
        }

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { result: toolResult }
          }
        });
      }

      requestContents.push({
        role: "user",
        parts: functionResponses
      });

      if (bubble) bubble.textContent = "J.A.R.V.I.S: Working with tools...";
    }

    throw new Error("Agent reached its tool-call limit. Please ask a shorter question.");
  }

  // ---------- QUICK USER-GESTURE WEBSITE COMMAND ----------
  function handleDirectWebsiteCommand(text) {
    const match = text.toLowerCase().trim().match(/^open\s+(google|youtube|gmail|github|instagram|whatsapp|wikipedia)$/);
    if (!match) return false;

    const url = WEBSITE_URLS[match[1]];
    if (!url) return false;

    // Runs directly from the user's button/Enter action.
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      addLinkMessage("Popup blocked. Tap to open " + match[1] + ":", url);
    } else {
      addMessage("Opening " + match[1] + ".", "ai");
    }

    return true;
  }

  // ---------- SEND MESSAGE ----------
  async function sendMessage(imagePayload = null) {
    if (busy) return;

    const text = imagePayload?.text ?? input?.value.trim() ?? "";
    if (!text && !imagePayload?.image) return;

    if (!apiKey && !askForApiKey()) return;

    busy = true;
    stopVoiceInput();

    if (input) input.value = "";

    addMessage(
      text || "Please describe this image.",
      "user"
    );

    if (!imagePayload?.image && handleDirectWebsiteCommand(text)) {
      busy = false;
      setStatus("SYSTEM READY");
      return;
    }

    activeAssistantBubble = addAssistantBubble();
    activeAssistantBubble.textContent = "J.A.R.V.I.S: Connecting...";

    if (sendBtn) sendBtn.disabled = true;

    try {
      const answer = await runAgent(
        text || "Describe the attached image clearly.",
        imagePayload?.image || null,
        activeAssistantBubble
      );

      updateAssistantBubble(activeAssistantBubble, answer);
      speak(answer);
      setStatus("SYSTEM READY");
    } catch (error) {
      console.error("J.A.R.V.I.S request error:", error);

      updateAssistantBubble(
        activeAssistantBubble,
        "ERROR: " + (error.message || "Something went wrong.")
      );

      setStatus("CONNECTION ERROR");
    } finally {
      busy = false;
      activeAssistantBubble = null;
      if (sendBtn) sendBtn.disabled = false;
      scrollChat();
    }
  }

  // ---------- CLEAR MEMORY ----------
  function clearMemory() {
    const confirmed = window.confirm(
      "Clear chat history and all notes saved by J.A.R.V.I.S on this browser?"
    );

    if (!confirmed) return;

    history = [];
    saveHistory();
    saveNotes([]);
    renderHistory();

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setStatus("MEMORY CLEARED");
  }

  // ---------- NETWORK STATUS ----------
  window.addEventListener("online", () => setStatus("ONLINE"));
  window.addEventListener("offline", () => setStatus("OFFLINE"));

  // ---------- EVENT LISTENERS ----------
  sendBtn?.addEventListener("click", () => sendMessage());

  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  micBtn?.addEventListener("click", startVoiceInput);

  cameraBtn?.addEventListener("click", openCamera);

  captureBtn?.addEventListener("click", captureCameraImage);

  clearBtn?.addEventListener("click", clearMemory);

  // ---------- STARTUP ----------
  renderHistory();

  // Ask for the API key when the app opens if it isn't stored for this tab.
  askForApiKey();

  if (navigator.onLine) {
    setStatus(apiKey ? "SYSTEM ONLINE" : "API KEY REQUIRED");
  } else {
    setStatus("OFFLINE");
  }

  // Stop camera when leaving the page.
  window.addEventListener("pagehide", closeCamera);

  console.log("J.A.R.V.I.S initialized. Agent tools, voice and camera ready.");
})();
