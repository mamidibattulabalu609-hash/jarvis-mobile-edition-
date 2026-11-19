
// ===== 3. TOOLS (THE HANDS) — 15 TOOLS =====

async function handleTools(text) {
    const t = text.toLowerCase().trim();

    // 1. Time
    if (/\b(time|clock)\b/.test(t)) {
        return "Current time: " + new Date().toLocaleTimeString();
    }

    // 2. Date
    if (/\b(date|today)\b/.test(t)) {
        return "Today's date: " + new Date().toLocaleDateString();
    }

    // 3. Day
    if (/\b(day|weekday)\b/.test(t)) {
        return "Today is " + new Date().toLocaleDateString(
            "en-US", { weekday: "long" }
        );
    }

    // 4. Open Google
    if (t.includes("open google")) {
        window.open("https://www.google.com", "_blank");
        return "Opening Google.";
    }

    // 5. Open YouTube
    if (t.includes("open youtube")) {
        window.open("https://www.youtube.com", "_blank");
        return "Opening YouTube.";
    }

    // 6. Open Gmail
    if (t.includes("open gmail")) {
        window.open("https://mail.google.com", "_blank");
        return "Opening Gmail.";
    }

    // 7. Open Facebook
    if (t.includes("open facebook")) {
        window.open("https://www.facebook.com", "_blank");
        return "Opening Facebook.";
    }

    // 8. Open Instagram
    if (t.includes("open instagram")) {
        window.open("https://www.instagram.com", "_blank");
        return "Opening Instagram.";
    }

    // 9. Open WhatsApp
    if (t.includes("open whatsapp")) {
        window.open("https://web.whatsapp.com", "_blank");
        return "Opening WhatsApp.";
    }

    // 10. Search Google
    if (t.startsWith("search for ")) {
        const query = t.replace("search for ", "").trim();

        window.open(
            "https://www.google.com/search?q=" +
            encodeURIComponent(query),
            "_blank"
        );

        return "Searching Google for " + query;
    }

    // 11. Search YouTube
    if (t.startsWith("play ")) {
        const query = t.replace("play ", "").trim();

        window.open(
            "https://www.youtube.com/results?search_query=" +
            encodeURIComponent(query),
            "_blank"
        );

        return "Searching YouTube for " + query;
    }

    // 12. Calculator
    if (t.startsWith("calculate ")) {
        const expression = t.replace("calculate ", "").trim();

        if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
            return "Sorry, invalid mathematical expression.";
        }

        try {
            const result = Function(
                '"use strict"; return (' + expression + ')'
            )();

            if (!Number.isFinite(result)) {
                return "Invalid calculation.";
            }

            return "The answer is " + result;
        } catch {
            return "Sorry, I could not calculate that.";
        }
    }

    // 13. Battery
    if (t.includes("battery")) {
        if (!navigator.getBattery) {
            return "Battery information is not supported on this device.";
        }

        try {
            const battery = await navigator.getBattery();

            return "Battery level: " +
                Math.round(battery.level * 100) + "%";
        } catch {
            return "Unable to access battery information.";
        }
    }

    // 14. Internet status
    if (t.includes("internet") || t.includes("connection")) {
        return navigator.onLine
            ? "Internet connection appears to be online."
            : "Your device appears to be offline.";
    }

    // 15. Greeting
    if (/\b(hello|hi|hey)\b/.test(t)) {
        return "Hello! JARVIS is online. How can I help you?";
    }

    // No tool matched
    return null;
}
