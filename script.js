
// ==========================================
// J.A.R.V.I.S. TOOL ROUTER
// Corrected Version
// ==========================================

async function handleTools(text) {

    const t = String(text || "").toLowerCase().trim();

    // ======================================
    // 1. TIME
    // ======================================

    if (
        /\btime\b/i.test(t) ||
        t.includes("సమయం")
    ) {
        return "The time is " +
            new Date().toLocaleTimeString() +
            ", Boss.";
    }

    // ======================================
    // 2. WEATHER
    // ======================================

    if (
        t.includes("weather") ||
        t.includes("వాతావరణం")
    ) {
        if (!navigator.geolocation) {
            return "Geolocation is not supported, Boss.";
        }

        return new Promise((resolve) => {

            navigator.geolocation.getCurrentPosition(
                async (position) => {

                    try {

                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;

                        const url =
                            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`;

                        const response = await fetch(url);

                        if (!response.ok) {
                            throw new Error("Weather API error");
                        }

                        const data = await response.json();

                        const temperature =
                            data.current.temperature_2m;

                        resolve(
                            `Current temperature is ${temperature} degrees Celsius, Boss.`
                        );

                    } catch (error) {

                        resolve("Weather service error, Boss.");

                    }
                },

                () => {
                    resolve(
                        "Please allow location permission for weather, Boss."
                    );
                }
            );
        });
    }

    // ======================================
    // 3. TIMER
    // ======================================

    const timerMatch = t.match(
        /(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i
    );

    if (
        t.includes("timer") &&
        timerMatch
    ) {

        const amount = parseInt(timerMatch[1], 10);
        const unit = timerMatch[2].toLowerCase();

        let factor = 1000;

        if (/minute|min/.test(unit)) {
            factor = 60000;
        }

        if (/hour|hr/.test(unit)) {
            factor = 3600000;
        }

        const duration = amount * factor;

        setTimeout(() => {

            const message = "Timer done, Boss.";

            if ("speechSynthesis" in window) {
                const speech = new SpeechSynthesisUtterance(message);
                speechSynthesis.speak(speech);
            }

        }, duration);

        return `Timer set for ${amount} ${unit}, Boss.`;
    }

    // ======================================
    // 4. TRANSLATE TO TELUGU
    // ======================================

    if (t.includes("translate")) {

        const q = text
            .replace(/translate( this)?/i, "")
            .trim() || "hello";

        try {

            const url =
                "https://api.mymemory.translated.net/get?" +
                new URLSearchParams({
                    q: q,
                    langpair: "en|te"
                });

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error("Translation API error");
            }

            const data = await response.json();

            return "In Telugu: " +
                data.responseData.translatedText;

        } catch (error) {

            return "Translation error, Boss.";

        }
    }

    // ======================================
    // 5. YOUTUBE PLAY
    // ======================================

    if (
        t.includes("play") ||
        t.includes("youtube")
    ) {

        const q = text
            .replace(/^(play|youtube|search)\s*/i, "")
            .trim();

        if (!q) {
            return "Please tell me what to play, Boss.";
        }

        const url =
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(q);

        window.open(url, "_blank");

        return "Searching YouTube for " + q + ", Boss.";
    }

    // ======================================
    // NO TOOL MATCH
    // ======================================

    return null;
}

