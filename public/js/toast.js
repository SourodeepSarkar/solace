const ICONS = {
    success: "bx bx-check-circle",
    error: "bx bx-error-circle",
    info: "bx bx-info-circle"
};

export function toast(message, type = "info", duration = 3800) {
    const stack = document.getElementById("toastStack");
    if (!stack) { console.log(`[${type}] ${message}`); return; }

    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<i class='${ICONS[type] || ICONS.info}'></i><span>${message}</span>`;
    stack.appendChild(el);

    setTimeout(() => {
        el.classList.add("leaving");
        setTimeout(() => el.remove(), 250);
    }, duration);
}
