(() => {
    // Minimal client-side logic
    function $(id) {
        return document.getElementById(id);
    }
    window.addEventListener("message", (event) => {
        const msg = event.data;
        if (msg.command === "updateState") {
            updateState(msg.data);
        } else if (msg.command === "tokenUpdate") {
            applyToken(msg.data);
        }
    });

    function updateState(state) {
        // Token
        if (state.tokenUsage && state.tokenUsage.percentage != null) {
            applyToken(state.tokenUsage);
        } else {
            $("token-model").textContent = "No requests yet";
            setProgress(0);
        }

        // Inline/FIM/NES
        $("inline-val").textContent = state.inlineEnabled ? "Included" : "Disabled";
        $("fim-val").textContent = state.fimEnabled ? "Enabled" : "Disabled";
        $("nes-val").textContent = state.nesEnabled ? "Enabled" : "Disabled";

        // Providers
        const list = $("providers-list");
        list.innerHTML = "";
        if (state.providers) {
            for (const [k, v] of Object.entries(state.providers)) {
                const div = document.createElement("div");
                div.className = "provider-item";
                div.innerHTML = `<div>${capitalize(k)}</div><div class="small">${v}</div>`;
                list.appendChild(div);
            }
        }
    }

    function applyToken(data) {
        const modelName = data.modelName || "Model";
        const percent = Number.isFinite(data.percentage)
            ? data.percentage
            : 0;
        const promptTokens =
            typeof data.promptTokens === "number" ? data.promptTokens : 0;
        const maxInputTokens =
            typeof data.maxInputTokens === "number" ? data.maxInputTokens : 0;
        const suffix = maxInputTokens
            ? ` (${promptTokens}/${maxInputTokens})`
            : promptTokens
                ? ` (${promptTokens})`
                : "";
        $("token-model").textContent =
            `${modelName} — ${percent.toFixed(1)}%${suffix}`;
        setProgress(Math.max(0, Math.min(100, percent)));
    }

    function setProgress(pct) {
        const bar = $("bar");
        bar.style.width = `${pct}%`;
    }

    function capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    // Buttons
    window.managePaid = () => {
        vscode.postMessage({ command: "managePaidRequests" });
    };
    window.refresh = () => {
        vscode.postMessage({ command: "refresh" });
    };

    // Post init ready
    const vscode = acquireVsCodeApi
        ? acquireVsCodeApi()
        : { postMessage: () => { } };
    // Request initial state
    setTimeout(() => {
        vscode.postMessage({ command: "ready" });
    }, 50);
})();
