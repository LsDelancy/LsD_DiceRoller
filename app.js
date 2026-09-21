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
        `;

        container.appendChild(panel);
    }

    addPanelButtonEvents();
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

    const signedModifier = getSignedModifier(config);

    const finalTotal =
        diceResult + signedModifier;

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


    resultElement.textContent =
        finalTotal;


    if (config.modifierType === "none") {
        calculationElement.textContent = "";
    } else {
        const sign =
            config.modifierType === "plus"
                ? "+"
                : "−";

        calculationElement.textContent =
            `(${diceResult} ${sign} ${config.modifierValue})`;
    }


    rollsElement.innerHTML = "";


    if (config.sides === 20) {
        const label =
            document.createElement("span");

        label.className =
            "rolls-label";

        label.textContent =
            config.dice === 1
                ? "Die: "
                : "Dice: ";

        rollsElement.appendChild(label);


        rolls.forEach((roll, index) => {
            const span =
                document.createElement("span");

            span.textContent =
                roll;

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
                rolls.length - 1
            ) {
                rollsElement.appendChild(
                    document.createTextNode(
                        ", "
                    )
                );
            }
        });
    }
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
        () => {

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
        }
    );


// =========================================================
// START APP
// =========================================================

renderPanels();
