
// ===== 3. TOOLS (THE HANDS) =====

async function handleTools(text) {
    const t = String(text || "").toLowerCase().trim();

    // ===== 1. TIME =====
    if (
        /\b(time|clock)\b/.test(t) ||
        t.includes("సమయం")
    ) {
        return "The time is " +
            new Date().toLocaleTimeString() +
            ", Boss.";
    }

    // ===== 2. WEATHER =====
    if (
        t.includes("weather") ||
        t.includes("temperature") ||
        t.includes("వాతావరణం")
    ) {
        if (!navigator.geolocation) {
            return "Geolocation is not supported, Boss.";
        }

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    resolve,
                    reject,
                    { enableHighAccuracy: false, timeout: 10000 }
                );
            });

            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            const url =
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&timezone=auto`;

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("Weather API failed");
            }

            const data = await response.json();
            const weather = data.current;

            return `Current temperature is ${weather.temperature_2m}°C.
Feels like ${weather.apparent_temperature}°C.
Humidity is ${weather.relative_humidity_2m}%.
Weather code: ${weather.weather_code}.
Boss.`;

        } catch (error) {
            console.error("Weather error:", error);

            return "I could not get weather information. Please check your location permission and internet connection, Boss.";
        }
    }

    // ===== 3. TIMER =====

    const timerMatch = t.match(
        /\b(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i
    );

    if (timerMatch && (
        t.includes("timer") ||
        t.includes("remind") ||
        t.includes("alarm") ||
        t.includes("set")
    )) {
        const amount = parseInt(timerMatch[1], 10);
        const unit = timerMatch[2].toLowerCase();

        let factor = 1000;

        if (/^(minutes?|mins?)$/.test(unit)) {
            factor = 60000;
        } else if (/^(hours?|hrs?)$/.test(unit)) {
            factor = 3600000;
        }

        const duration = amount * factor;

        if (!Number.isSafeInteger(duration) || duration <= 0) {
            return "Please provide a valid timer duration, Boss.";
        }

        setTimeout(() => {
            const message = "Boss, your timer is complete.";

            if (typeof speak === "function") {
                speak(message);
            } else if ("speechSynthesis" in window) {
                const utterance = new SpeechSynthesisUtterance(message);
                speechSynthesis.speak(utterance);
            } else {
                alert(message);
            }
        }, duration);

        return `Timer set for ${amount} ${unit}, Boss.`;
    }

    // ===== 4. TRANSLATE TO TELUGU =====

    if (
        t.startsWith("translate") ||
        t.startsWith("translation")
    ) {
        const q = text.replace(
            /^translate(?:\s+this)?\s*/i,
            ""
        ).trim();

        if (!q) {
            return "Please tell me what to translate, Boss.";
        }

        try {
            const params = new URLSearchParams({
                q: q,
                langpair: "autodetect|te"
            });

            const response = await fetch(
                "https://api.mymemory.translated.net/get?" +
                params.toString()
            );

            if (!response.ok) {
                throw new Error("Translation API failed");
            }

            const data = await response.json();

            if (
                data.responseStatus !== 200 ||
                !data.responseData?.translatedText
            ) {
                return "Translation is unavailable, Boss.";
            }

            return "In Telugu: " +
                data.responseData.translatedText;

        } catch (error) {
            console.error("Translation error:", error);
            return "Translation error, Boss.";
        }
    }

    // ===== 5. YOUTUBE SEARCH =====

    if (
        t.includes("youtube") ||
        t.startsWith("play ")
    ) {
        const q = text.replace(
            /^(play|youtube|play youtube|search youtube)\s*/i,
            ""
        ).trim();

        if (!q) {
            return "What should I search on YouTube, Boss?";
        }

        const url =
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(q);

        window.open(url, "_blank");

        return `Searching YouTube for ${q}, Boss.`;
    }

    // ===== NO TOOL MATCH =====

    return null;
}
