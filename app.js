"use strict";


// =========================================================
// SECURE UNBIASED RANDOM NUMBER GENERATOR
// =========================================================

function secureRandomInt(min, max) {
    if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min > max
    ) {
        throw new Error("Invalid random integer range.");
    }

    const range = max - min + 1;
    const uint32Range = 0x100000000;
    const limit = Math.floor(uint32Range / range) * range;
    const randomArray = new Uint32Array(1);

    let randomValue;

    do {
        crypto.getRandomValues(randomArray);
        randomValue = randomArray[0];
    } while (randomValue >= limit);

    return min + (randomValue % range);
}


function rollDie(sides) {
    return secureRandomInt(1, sides);
}


// =========================================================
// SUPABASE AUTHENTICATION / CLOUD SYNC
// Official supabase-js client handles session persistence,
// refresh-token rotation, and automatic token refresh.
// =========================================================

const SUPABASE_URL = "https://owjypjpqpjwieaadmcij.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YEIjvyEdP3_6UbKC_gX7eQ_mdb0IUFx";

const LEGACY_AUTH_STORAGE_KEY = "diceRollerAuthSession";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
        }
    }
);

let currentUser = null;


function panelStorageKey() {
    if (!currentUser || !currentUser.id) {
        return "diceRollerPanels_guest";
    }

    return `diceRollerPanels_${currentUser.id}`;
}


function savePanelsLocally() {
    localStorage.setItem(
        panelStorageKey(),
        JSON.stringify(panels)
    );
}


function loadPanelsLocally() {
    const saved = localStorage.getItem(panelStorageKey());

    if (!saved) {
        return false;
    }

    try {
        const data = JSON.parse(saved);

        if (
            data &&
            data["1"] &&
            data["2"] &&
            data["3"] &&
            data["4"]
        ) {
            panels[1] = data["1"];
            panels[2] = data["2"];
            panels[3] = data["3"];
            panels[4] = data["4"];
            return true;
        }
    } catch (error) {
        console.warn(
            "Could not load local panel settings.",
            error
        );
    }

    return false;
}


function setSyncStatus(text, className = "") {
    const element =
        document.getElementById("sync-status");

    if (!element) {
        return;
    }

    element.textContent = text;
    element.className = "sync-status";

    if (className) {
        element.classList.add(className);
    }
}


function showLoginScreen(message = "") {
    document
        .getElementById("setup-screen")
        .classList.add("hidden");

    document
        .getElementById("config-screen")
        .classList.add("hidden");

    document
        .getElementById("roller-screen")
        .classList.add("hidden");

    document
        .getElementById("login-screen")
        .classList.remove("hidden");

    const messageElement =
        document.getElementById("login-message");

    if (messageElement) {
        messageElement.textContent = message;
    }
}


async function migrateLegacySessionIfPresent() {
    const legacy =
        localStorage.getItem(
            LEGACY_AUTH_STORAGE_KEY
        );

    if (!legacy) {
        return false;
    }

    try {
        const parsed =
            JSON.parse(legacy);

        if (
            !parsed ||
            !parsed.access_token ||
            !parsed.refresh_token
        ) {
            localStorage.removeItem(
                LEGACY_AUTH_STORAGE_KEY
            );
            return false;
        }

        const {
            data,
            error
        } =
            await supabaseClient.auth.setSession({
                access_token:
                    parsed.access_token,
                refresh_token:
                    parsed.refresh_token
            });

        if (error || !data.session) {
            return false;
        }

        localStorage.removeItem(
            LEGACY_AUTH_STORAGE_KEY
        );

        currentUser =
            data.session.user;

        return true;

    } catch (error) {
        console.warn(
            "Legacy session migration failed.",
            error
        );

        return false;
    }
}


async function signInWithPassword(
    email,
    password
) {
    const {
        data,
        error
    } =
        await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

    if (error) {
        throw error;
    }

    if (!data.session || !data.user) {
        throw new Error(
            "Sign in did not return a valid session."
        );
    }

    currentUser =
        data.user;
}


async function signOut() {
    const {
        error
    } =
        await supabaseClient.auth.signOut({
            scope: "local"
        });

    if (error) {
        console.warn(
            "Supabase sign out warning:",
            error
        );
    }

    currentUser = null;

    document
        .getElementById("login-password")
        .value = "";

    setSyncStatus("");
    showLoginScreen();
}


function cloudPayload() {
    return {
        user_id:
            currentUser.id,
        panel1:
            panels[1],
        panel2:
            panels[2],
        panel3:
            panels[3],
        panel4:
            panels[4],
        updated_at:
            new Date().toISOString()
    };
}


async function loadPanelsFromCloud() {
    if (!currentUser) {
        return false;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("user_dice_settings")
            .select(
                "panel1,panel2,panel3,panel4"
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) {
        return false;
    }

    panels[1] =
        data.panel1;

    panels[2] =
        data.panel2;

    panels[3] =
        data.panel3;

    panels[4] =
        data.panel4;

    savePanelsLocally();

    return true;
}


async function savePanelsToCloud() {
    savePanelsLocally();

    if (
        !currentUser ||
        !navigator.onLine
    ) {
        setSyncStatus(
            "Saved on this device",
            "warning"
        );
        return;
    }

    setSyncStatus("Saving…");

    try {
        const {
            error
        } =
            await supabaseClient
                .from("user_dice_settings")
                .upsert(
                    cloudPayload(),
                    {
                        onConflict:
                            "user_id"
                    }
                );

        if (error) {
            throw error;
        }

        setSyncStatus(
            "Saved",
            "saved"
        );

    } catch (error) {
        console.warn(
            "Cloud save failed.",
            error
        );

        setSyncStatus(
            "Saved on this device • cloud unavailable",
            "warning"
        );
    }
}


async function enterAuthenticatedApp() {
    document
        .getElementById("login-screen")
        .classList.add("hidden");

    document
        .getElementById("setup-screen")
        .classList.add("hidden");

    document
        .getElementById("config-screen")
        .classList.add("hidden");

    document
        .getElementById("roller-screen")
        .classList.remove("hidden");

    loadPanelsLocally();
    renderPanels();

    if (!navigator.onLine) {
        setSyncStatus(
            "Offline • using saved panels",
            "warning"
        );
        return;
    }

    setSyncStatus(
        "Loading saved panels…"
    );

    try {
        const loaded =
            await loadPanelsFromCloud();

        if (loaded) {
            renderPanels();

            setSyncStatus(
                "Saved panels loaded",
                "saved"
            );

        } else {
            await savePanelsToCloud();
        }

    } catch (error) {
        console.warn(
            "Cloud load failed.",
            error
        );

        setSyncStatus(
            "Using saved panels on this device",
            "warning"
        );
    }
}


async function handleLogin() {
    const email =
        document
            .getElementById(
                "login-email"
            )
            .value
            .trim();

    const password =
        document
            .getElementById(
                "login-password"
            )
            .value;

    const message =
        document
            .getElementById(
                "login-message"
            );

    if (!email || !password) {
        message.textContent =
            "Enter your email and password.";
        return;
    }

    message.textContent =
        "Signing in…";

    try {
        await signInWithPassword(
            email,
            password
        );

        message.textContent = "";

        document
            .getElementById(
                "login-password"
            )
            .value = "";

        await enterAuthenticatedApp();

    } catch (error) {
        message.textContent =
            error.message ||
            "Sign in failed.";
    }
}


// =========================================================
// INVITATION / PASSWORD SETUP
// =========================================================

function readAuthHash() {
    const hash =
        window.location.hash;

    if (
        !hash ||
        hash.length < 2
    ) {
        return null;
    }

    const params =
        new URLSearchParams(
            hash.slice(1)
        );

    const accessToken =
        params.get("access_token");

    const refreshToken =
        params.get("refresh_token");

    const type =
        params.get("type");

    if (
        !accessToken ||
        !refreshToken
    ) {
        return null;
    }

    return {
        access_token:
            accessToken,
        refresh_token:
            refreshToken,
        type:
            type
    };
}


function clearAuthHash() {
    if (window.location.hash) {
        history.replaceState(
            null,
            document.title,
            window.location.pathname +
                window.location.search
        );
    }
}


async function beginInviteSetup(
    hashSession
) {
    const {
        data,
        error
    } =
        await supabaseClient.auth.setSession({
            access_token:
                hashSession.access_token,
            refresh_token:
                hashSession.refresh_token
        });

    if (
        error ||
        !data.session ||
        !data.user
    ) {
        console.warn(
            "Invite session could not be established.",
            error
        );

        return false;
    }

    currentUser =
        data.user;

    document
        .getElementById("login-screen")
        .classList.add("hidden");

    document
        .getElementById("roller-screen")
        .classList.add("hidden");

    document
        .getElementById("config-screen")
        .classList.add("hidden");

    document
        .getElementById("setup-screen")
        .classList.remove("hidden");

    return true;
}


async function setInvitedUserPassword() {
    const password =
        document
            .getElementById(
                "setup-password"
            )
            .value;

    const confirmPassword =
        document
            .getElementById(
                "setup-password-confirm"
            )
            .value;

    const message =
        document
            .getElementById(
                "setup-message"
            );

    if (password.length < 6) {
        message.textContent =
            "Password must be at least 6 characters.";
        return;
    }

    if (
        password !==
        confirmPassword
    ) {
        message.textContent =
            "The passwords do not match.";
        return;
    }

    message.textContent =
        "Setting password…";

    try {
        const {
            data,
            error
        } =
            await supabaseClient.auth.updateUser({
                password
            });

        if (error) {
            throw error;
        }

        currentUser =
            data.user;

        clearAuthHash();

        document
            .getElementById(
                "setup-password"
            )
            .value = "";

        document
            .getElementById(
                "setup-password-confirm"
            )
            .value = "";

        message.textContent = "";

        document
            .getElementById(
                "setup-screen"
            )
            .classList.add("hidden");

        await enterAuthenticatedApp();

    } catch (error) {
        message.textContent =
            error.message ||
            "Could not set password.";
    }
}


async function initializeAuthenticatedApp() {
    document
        .getElementById("login-screen")
        .classList.add("hidden");

    document
        .getElementById("roller-screen")
        .classList.add("hidden");

    document
        .getElementById("config-screen")
        .classList.add("hidden");

    document
        .getElementById("setup-screen")
        .classList.add("hidden");

    const hashSession =
        readAuthHash();

    if (
        hashSession &&
        (
            hashSession.type === "invite" ||
            hashSession.type === "recovery" ||
            hashSession.type === "signup"
        )
    ) {
        const started =
            await beginInviteSetup(
                hashSession
            );

        if (started) {
            return;
        }

        clearAuthHash();
    }

    let {
        data: {
            session
        },
        error
    } =
        await supabaseClient.auth.getSession();

    if (error) {
        console.warn(
            "Could not read stored Supabase session.",
            error
        );
    }

    if (!session) {
        const migrated =
            await migrateLegacySessionIfPresent();

        if (migrated) {
            const result =
                await supabaseClient.auth.getSession();

            session =
                result.data.session;
        }
    }

    if (session && session.user) {
        currentUser =
            session.user;

        await enterAuthenticatedApp();
        return;
    }

    currentUser = null;
    showLoginScreen();
}


// Keep the UI in sync with genuine auth-state changes.
// Automatic token refreshes are intentionally ignored because
// they should not interrupt the user.
supabaseClient.auth.onAuthStateChange(
    (event, session) => {
        if (
            event === "SIGNED_OUT"
        ) {
            currentUser = null;
            showLoginScreen();
            return;
        }

        if (
            session &&
            session.user
        ) {
            currentUser =
                session.user;
        }
    }
);


// =========================================================
// PANEL DATA
// =========================================================

const panels = {
    1: {
        dice: 1,
        sides: 20,
        modifierType: "plus",
        modifierValue: 7,
        mode: "normal"
    },

    2: {
        dice: 8,
        sides: 6,
        modifierType: "plus",
        modifierValue: 5,
        mode: "normal"
    },

    3: {
        dice: 4,
        sides: 8,
        modifierType: "minus",
        modifierValue: 2,
        mode: "normal"
    },

    4: {
        dice: 3,
        sides: 12,
        modifierType: "none",
        modifierValue: 0,
        mode: "normal"
    }
};


const PANEL_COLORS = {
    1: {
        accent: "#42b86b",
        dark: "#23723f"
    },
    2: {
        accent: "#3d91d8",
        dark: "#245984"
    },
    3: {
        accent: "#e68a35",
        dark: "#94531f"
    },
    4: {
        accent: "#d64f49",
        dark: "#87302c"
    }
};


let activeConfigPanel = null;
let selectedModifierType = "none";
let rememberedModifierValue = 1;


// =========================================================
// HELPERS
// =========================================================

function getSignedModifier(config) {
    if (config.modifierType === "plus") {
        return config.modifierValue;
    }

    if (config.modifierType === "minus") {
        return -config.modifierValue;
    }

    return 0;
}


function getTextModifier(config) {
    if (config.modifierType === "plus") {
        return ` + ${config.modifierValue}`;
    }

    if (config.modifierType === "minus") {
        return ` − ${config.modifierValue}`;
    }

    return "";
}


// =========================================================
// DIE ART
// =========================================================

function getDieSvg(sides, panelNumber) {
    const colorSet = PANEL_COLORS[panelNumber] || PANEL_COLORS[1];
    const accent = colorSet.accent;

    if (sides === 6) {
        return `
            <svg viewBox="0 0 100 100" aria-hidden="true">
                <rect
                    x="13"
                    y="13"
                    width="74"
                    height="74"
                    rx="13"
                    fill="${accent}"
                    stroke="rgba(255,255,255,.68)"
                    stroke-width="2"
                />

                <path
                    d="M22 20 C36 13, 62 13, 78 22"
                    fill="none"
                    stroke="rgba(255,255,255,.32)"
                    stroke-width="3"
                    stroke-linecap="round"
                />

                <path
                    d="M18 35 L82 35 M18 65 L82 65"
                    stroke="rgba(255,255,255,.18)"
                    stroke-width="1.4"
                />

                <text
                    x="50"
                    y="61"
                    text-anchor="middle"
                    font-family="Georgia, serif"
                    font-size="34"
                    font-weight="800"
                    fill="#fff4d8"
                    stroke="rgba(0,0,0,.42)"
                    stroke-width=".7"
                    paint-order="stroke"
                >
                    6
                </text>
            </svg>
        `;
    }


    const shapes = {
        4: {
            points: "50,5 94,88 6,88",
            lines: [
                "M50 5 L50 88",
                "M6 88 L50 48 L94 88"
            ]
        },

        8: {
            points: "50,4 93,50 50,96 7,50",
            lines: [
                "M50 4 L50 96",
                "M7 50 L93 50",
                "M50 4 L7 50 L50 50 L93 50 Z"
            ]
        },

        10: {
            points: "50,3 88,22 96,58 50,97 4,58 12,22",
            lines: [
                "M50 3 L50 97",
                "M12 22 L50 47 L88 22",
                "M4 58 L50 47 L96 58"
            ]
        },

        12: {
            points: "50,4 80,13 96,39 90,70 67,92 33,92 10,70 4,39 20,13",
            lines: [
                "M20 13 L50 35 L80 13",
                "M4 39 L50 35 L96 39",
                "M10 70 L50 35 L90 70",
                "M33 92 L50 35 L67 92"
            ]
        },

        20: {
            points: "50,3 79,12 96,38 91,70 68,93 32,93 9,70 4,38 21,12",
            lines: [
                "M21 12 L50 34 L79 12",
                "M4 38 L50 34 L96 38",
                "M9 70 L50 34 L91 70",
                "M32 93 L50 34 L68 93",
                "M9 70 L50 61 L91 70",
                "M4 38 L50 61 L96 38"
            ]
        },

        100: {
            points: "50,3 80,12 96,38 93,69 72,92 28,92 7,69 4,38 20,12",
            lines: [
                "M20 12 L50 33 L80 12",
                "M4 38 L50 33 L96 38",
                "M7 69 L50 33 L93 69",
                "M28 92 L50 33 L72 92",
                "M7 69 L50 60 L93 69",
                "M4 38 L50 60 L96 38"
            ]
        }
    };


    const spec = shapes[sides];

    return `
        <svg viewBox="0 0 100 100" aria-hidden="true">
            <polygon
                points="${spec.points}"
                fill="${accent}"
                stroke="rgba(255,255,255,.68)"
                stroke-width="2"
                stroke-linejoin="round"
            />

            <path
                d="M26 20 Q50 8 74 20"
                fill="none"
                stroke="rgba(255,255,255,.30)"
                stroke-width="3"
                stroke-linecap="round"
            />

            ${spec.lines.map(line => `
                <path
                    d="${line}"
                    fill="none"
                    stroke="rgba(255,255,255,.24)"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                />
            `).join("")}

            <text
                x="50"
                y="58"
                text-anchor="middle"
                font-family="Georgia, serif"
                font-size="${String(sides).length >= 3 ? 23 : 30}"
                font-weight="800"
                fill="#fff4d8"
                stroke="rgba(0,0,0,.42)"
                stroke-width=".7"
                paint-order="stroke"
            >
                ${sides}
            </text>
        </svg>
    `;
}


// =========================================================
// MAIN PANEL DISPLAY
// =========================================================

function renderPanels() {
    const container = document.getElementById("panels-container");
    container.innerHTML = "";

    for (let panelNumber = 1; panelNumber <= 4; panelNumber++) {
        const config = panels[panelNumber];
        const panel = document.createElement("section");

        panel.className = `dice-panel panel-${panelNumber}`;

        const textModifier = getTextModifier(config);

        let modeText = "";

        if (config.mode === "advantage") {
            modeText = "ADVANTAGE";
        }

        if (config.mode === "disadvantage") {
            modeText = "DISADVANTAGE";
        }

        let visualModifierHtml = "";

        if (config.modifierType === "plus") {
            visualModifierHtml = `
                <span class="visual-symbol">+</span>
                <span class="visual-number">${config.modifierValue}</span>
            `;
        }

        if (config.modifierType === "minus") {
            visualModifierHtml = `
                <span class="visual-symbol">−</span>
                <span class="visual-number">${config.modifierValue}</span>
            `;
        }

        panel.innerHTML = `
            <div class="dice-summary">
                <div>
                    <div class="visual-expression">

                        <div class="die-art">
                            ${getDieSvg(config.sides, panelNumber)}
                        </div>

                        <span class="visual-symbol">×</span>
                        <span class="visual-number">${config.dice}</span>

                        ${visualModifierHtml}

                    </div>

                    <div class="text-config">
                        ${config.dice}d${config.sides}${textModifier}
                    </div>

                    ${
                        modeText
                            ? `
                                <div class="mode-wrap">
                                    <div class="mode-label">
                                        ${modeText}
                                    </div>
                                </div>
                              `
                            : ""
                    }

                </div>
            </div>

            <div class="panel-middle">

                <button
                    type="button"
                    class="configure-button"
                    data-panel="${panelNumber}"
                >
                    CONFIGURE
                </button>

                <div class="result-area">

                    <div
                        class="result"
                        id="result-${panelNumber}"
                    >
                        —
                    </div>

                    <div
                        class="calculation"
                        id="calculation-${panelNumber}"
                    ></div>

                </div>

                <button
                    type="button"
                    class="roll-button"
                    data-panel="${panelNumber}"
                >
                    ROLL
                </button>

            </div>

            <div
                class="individual-rolls"
                id="rolls-${panelNumber}"
            ></div>

            <div
                class="full-width-breakdown"
                id="breakdown-${panelNumber}"
            ></div>
        `;

        container.appendChild(panel);
        displayRememberedRoll(panelNumber);
    }

    addPanelButtonEvents();
}


// =========================================================
// PANEL ROLL MEMORY
// =========================================================

function displayRememberedRoll(panelNumber) {
    const config = panels[panelNumber];
    const memory = config.lastRoll;

    const resultElement =
        document.getElementById(
            `result-${panelNumber}`
        );

    const calculationElement =
        document.getElementById(
            `calculation-${panelNumber}`
        );

    const rollsElement =
        document.getElementById(
            `rolls-${panelNumber}`
        );

    const breakdownElement =
        document.getElementById(
            `breakdown-${panelNumber}`
        );

    if (!memory) {
        resultElement.textContent = "—";
        calculationElement.textContent = "";
        rollsElement.innerHTML = "";
        breakdownElement.textContent = "";
        return;
    }

    resultElement.textContent =
        memory.total;

    rollsElement.innerHTML = "";
    breakdownElement.textContent = "";
    breakdownElement.classList.remove(
        "single-line-breakdown"
    );

    // d20 behavior stays in the existing d20 line.
    if (
        config.sides === 20 &&
        Array.isArray(memory.rolls)
    ) {
        const sign =
            config.modifierType === "plus"
                ? "+"
                : "−";

        if (config.modifierType === "none") {
            calculationElement.textContent = "";
        } else {
            calculationElement.textContent =
                `(${memory.diceResult} ${sign} ${config.modifierValue})`;
        }

        const label =
            document.createElement("span");

        label.className =
            "rolls-label";

        label.textContent =
            config.dice === 1
                ? "Die: "
                : "Dice: ";

        rollsElement.appendChild(label);

        memory.rolls.forEach((roll, index) => {
            const span =
                document.createElement("span");

            span.textContent = roll;

            if (roll === 20) {
                span.classList.add(
                    "natural-20"
                );
            }

            if (roll === 1) {
                span.classList.add(
                    "natural-1"
                );
            }

            rollsElement.appendChild(span);

            if (
                index <
                memory.rolls.length - 1
            ) {
                rollsElement.appendChild(
                    document.createTextNode(", ")
                );
            }
        });

        rollsElement.classList.add(
            "single-line-breakdown"
        );

        requestAnimationFrame(() => {
            if (
                rollsElement.scrollWidth <=
                rollsElement.clientWidth
            ) {
                return;
            }

            const naturalOnes =
                memory.rolls.filter(
                    roll => roll === 1
                ).length;

            const naturalTwenties =
                memory.rolls.filter(
                    roll => roll === 20
                ).length;

            rollsElement.innerHTML = "";

            const prefix =
                document.createElement("span");

            prefix.textContent =
                `${config.dice} ${config.dice === 1 ? "die" : "dice"} : `;

            rollsElement.appendChild(prefix);

            const critParts = [];

            if (naturalOnes > 0) {
                critParts.push({
                    value: "1",
                    count: naturalOnes,
                    className: "natural-1"
                });
            }

            if (naturalTwenties > 0) {
                critParts.push({
                    value: "20",
                    count: naturalTwenties,
                    className: "natural-20"
                });
            }

            if (critParts.length > 0) {
                rollsElement.appendChild(
                    document.createTextNode("(")
                );

                critParts.forEach((part, index) => {
                    const valueSpan =
                        document.createElement("span");

                    valueSpan.textContent =
                        part.value;

                    valueSpan.classList.add(
                        part.className
                    );

                    rollsElement.appendChild(
                        valueSpan
                    );

                    rollsElement.appendChild(
                        document.createTextNode(
                            `x${part.count}`
                        )
                    );

                    if (
                        index <
                        critParts.length - 1
                    ) {
                        rollsElement.appendChild(
                            document.createTextNode(", ")
                        );
                    }
                });

                rollsElement.appendChild(
                    document.createTextNode(") ")
                );
            }

            let resultText =
                `${memory.diceResult}`;

            if (
                config.modifierType !==
                "none"
            ) {
                resultText +=
                    ` ${sign} ${config.modifierValue} = ${memory.total}`;
            }

            rollsElement.appendChild(
                document.createTextNode(
                    resultText
                )
            );

            calculationElement.textContent = "";
        });

        return;
    }

    // Non-d20: use the full-width bottom line so the text is not
    // constrained by the narrow center result column.
    calculationElement.textContent = "";

    const rollList =
        Array.isArray(memory.rolls)
            ? memory.rolls.join(", ")
            : "";

    const modifierText =
        config.modifierType === "none"
            ? ""
            : config.modifierType === "plus"
                ? `\u00A0\u00A0+ ${config.modifierValue}`
                : `\u00A0\u00A0− ${config.modifierValue}`;

    const fullBreakdown =
        `${rollList}${modifierText}\u00A0\u00A0= ${memory.total}`;

    const compactBreakdown =
        `${config.dice} ${config.dice === 1 ? "die" : "dice"} : ${memory.diceResult}${modifierText}\u00A0\u00A0= ${memory.total}`;

    breakdownElement.textContent =
        fullBreakdown;

    breakdownElement.classList.add(
        "single-line-breakdown"
    );

    requestAnimationFrame(() => {
        if (
            breakdownElement.scrollWidth >
            breakdownElement.clientWidth
        ) {
            breakdownElement.textContent =
                compactBreakdown;
        }
    });
}


// =========================================================
// ROLL PANEL
// =========================================================

function rollPanel(panelNumber) {
    const config = panels[panelNumber];
    const rolls = [];

    for (let i = 0; i < config.dice; i++) {
        rolls.push(
            rollDie(config.sides)
        );
    }

    let diceResult;

    if (config.mode === "normal") {
        diceResult = rolls.reduce(
            (sum, value) => sum + value,
            0
        );
    }

    if (config.mode === "advantage") {
        diceResult = Math.max(...rolls);
    }

    if (config.mode === "disadvantage") {
        diceResult = Math.min(...rolls);
    }

    const signedModifier =
        getSignedModifier(config);

    const finalTotal =
        diceResult + signedModifier;

    config.lastRoll = {
        total: finalTotal,
        diceResult: diceResult,
        rolls: rolls
    };

    displayRememberedRoll(panelNumber);

    // Local save happens immediately inside savePanelsToCloud().
    // If online, the same roll memory is then synced to Supabase.
    void savePanelsToCloud();
}


// =========================================================
// MAIN SCREEN BUTTON EVENTS
// =========================================================

function addPanelButtonEvents() {
    document
        .querySelectorAll(".roll-button")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    rollPanel(
                        Number(
                            button.dataset.panel
                        )
                    );
                }
            );
        });


    document
        .querySelectorAll(".configure-button")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => {
                    openConfiguration(
                        Number(
                            button.dataset.panel
                        )
                    );
                }
            );
        });
}


// =========================================================
// CONFIGURATION SCREEN
// =========================================================

function openConfiguration(panelNumber) {
    activeConfigPanel = panelNumber;

    const config =
        panels[panelNumber];

    document.getElementById(
        "config-title"
    ).textContent =
        `Panel ${panelNumber} Configuration`;

    document.getElementById(
        "config-dice"
    ).value =
        config.dice;

    document.getElementById(
        "config-sides"
    ).value =
        config.sides;

    selectedModifierType =
        config.modifierType;

    rememberedModifierValue =
        config.modifierValue > 0
            ? config.modifierValue
            : Math.max(
                rememberedModifierValue,
                1
            );

    document.getElementById(
        "config-modifier"
    ).value =
        rememberedModifierValue;

    document.getElementById(
        "config-mode"
    ).value =
        config.mode;

    updateModifierUI();
    updateRollModeUI();

    document.getElementById(
        "roller-screen"
    ).classList.add(
        "hidden"
    );

    document.getElementById(
        "config-screen"
    ).classList.remove(
        "hidden"
    );
}


// =========================================================
// MODIFIER TYPE BUTTONS
// =========================================================

document
    .querySelectorAll(
        ".modifier-type-button"
    )
    .forEach(button => {
        button.addEventListener(
            "click",
            () => {
                selectedModifierType =
                    button.dataset.modifierType;

                if (
                    selectedModifierType !==
                    "none"
                ) {
                    const currentValue =
                        Number(
                            document.getElementById(
                                "config-modifier"
                            ).value
                        );

                    if (
                        Number.isInteger(
                            currentValue
                        ) &&
                        currentValue >= 1 &&
                        currentValue <= 99
                    ) {
                        rememberedModifierValue =
                            currentValue;
                    }
                }

                updateModifierUI();
            }
        );
    });


function updateModifierUI() {
    document
        .querySelectorAll(
            ".modifier-type-button"
        )
        .forEach(button => {
            button.classList.toggle(
                "selected",
                button.dataset.modifierType ===
                    selectedModifierType
            );
        });


    const modifierGroup =
        document.getElementById(
            "modifier-value-group"
        );

    const modifierInput =
        document.getElementById(
            "config-modifier"
        );


    if (
        selectedModifierType ===
        "none"
    ) {
        const currentValue =
            Number(
                modifierInput.value
            );

        if (
            Number.isInteger(
                currentValue
            ) &&
            currentValue >= 1 &&
            currentValue <= 99
        ) {
            rememberedModifierValue =
                currentValue;
        }

        modifierGroup.classList.add(
            "hidden"
        );

    } else {
        modifierGroup.classList.remove(
            "hidden"
        );

        modifierInput.value =
            rememberedModifierValue;
    }
}


// =========================================================
// ROLL MODE VISIBILITY
// =========================================================

document
    .getElementById(
        "config-sides"
    )
    .addEventListener(
        "change",
        updateRollModeUI
    );

document
    .getElementById(
        "config-dice"
    )
    .addEventListener(
        "input",
        updateRollModeUI
    );


function updateRollModeUI() {
    const sides =
        Number(
            document.getElementById(
                "config-sides"
            ).value
        );

    const dice =
        Number(
            document.getElementById(
                "config-dice"
            ).value
        );

    const modeGroup =
        document.getElementById(
            "roll-mode-group"
        );

    const modeSelect =
        document.getElementById(
            "config-mode"
        );


    if (
        sides === 20 &&
        Number.isInteger(dice) &&
        dice >= 2
    ) {
        modeGroup.classList.remove(
            "hidden"
        );
    } else {
        modeSelect.value =
            "normal";

        modeGroup.classList.add(
            "hidden"
        );
    }

    document.getElementById(
        "config-warning"
    ).textContent =
        "";
}


// =========================================================
// SAVE CONFIGURATION
// =========================================================

document
    .getElementById(
        "set-config-button"
    )
    .addEventListener(
        "click",
        async () => {

            const dice =
                Number(
                    document.getElementById(
                        "config-dice"
                    ).value
                );

            const sides =
                Number(
                    document.getElementById(
                        "config-sides"
                    ).value
                );

            const mode =
                document.getElementById(
                    "config-mode"
                ).value;


            if (
                !Number.isInteger(dice) ||
                dice < 1 ||
                dice > 99
            ) {
                alert(
                    "Number of dice must be from 1 to 99."
                );
                return;
            }


            const allowedSides =
                [4, 6, 8, 10, 12, 20, 100];

            if (
                !allowedSides.includes(
                    sides
                )
            ) {
                alert(
                    "Choose a valid die type."
                );
                return;
            }


            let modifierValue = 0;

            if (
                selectedModifierType !==
                "none"
            ) {
                modifierValue =
                    Number(
                        document.getElementById(
                            "config-modifier"
                        ).value
                    );

                if (
                    !Number.isInteger(
                        modifierValue
                    ) ||
                    modifierValue < 1 ||
                    modifierValue > 99
                ) {
                    alert(
                        "Modifier value must be from 1 to 99."
                    );
                    return;
                }

                rememberedModifierValue =
                    modifierValue;
            }


            if (
                sides !== 20 &&
                mode !== "normal"
            ) {
                alert(
                    "Advantage and Disadvantage require a d20."
                );
                return;
            }


            if (
                sides === 20 &&
                mode !== "normal" &&
                dice < 2
            ) {
                alert(
                    "Advantage and Disadvantage require at least 2 dice."
                );
                return;
            }


            panels[
                activeConfigPanel
            ] = {
                dice: dice,
                sides: sides,
                modifierType:
                    selectedModifierType,
                modifierValue:
                    modifierValue,
                mode:
                    sides === 20
                        ? mode
                        : "normal"
            };


            document
                .getElementById(
                    "config-screen"
                )
                .classList.add(
                    "hidden"
                );


            document
                .getElementById(
                    "roller-screen"
                )
                .classList.remove(
                    "hidden"
                );


            renderPanels();
            await savePanelsToCloud();
        }
    );


// =========================================================
// LOGIN / LOGOUT EVENTS
// =========================================================

document
    .getElementById("login-button")
    .addEventListener("click", handleLogin);

document
    .getElementById("login-password")
    .addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                handleLogin();
            }
        }
    );

document
    .getElementById("logout-button")
    .addEventListener("click", signOut);


document
    .getElementById("setup-button")
    .addEventListener("click", setInvitedUserPassword);

document
    .getElementById("setup-password-confirm")
    .addEventListener(
        "keydown",
        event => {
            if (event.key === "Enter") {
                setInvitedUserPassword();
            }
        }
    );

window.addEventListener(
    "online",
    async () => {
        if (currentUser) {
            await savePanelsToCloud();
        }
    }
);

window.addEventListener(
    "offline",
    () => {
        if (currentUser) {
            setSyncStatus(
                "Offline • changes save on this device",
                "warning"
            );
        }
    }
);


// =========================================================
// START APP
// =========================================================

initializeAuthenticatedApp();
