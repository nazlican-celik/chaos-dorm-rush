/**
 * Chaos Dorm Rush: Daydream Mode - Game Engine File
 * 
 * Targeted Improvements:
 * 1. Pacing: Slower starting speed, slower ramp, safe entity spacing to avoid overlap.
 * 2. Daydream: Magical neon shifts, glow, chimes soundtrack, 5 dream-exclusive items.
 * 3. Guide Overlay: "Know Your Chaos Before You Run" start menu.
 * 4. Web Audio Synthesizer: Procedural lo-fi chords, Daydream chimes, SFX for items.
 * 5. Screen shake, flashing transitions, vignette warnings.
 */

// --- 1. USER ADJUSTABLE GAMEPLAY TUNING ---
// Beginners: You can change these numbers to balance the game speed and scores!
const GAME_TUNING = {
    // Speed variables
    START_SPEED: 3.2,             // Starting movement speed (slow & chill)
    MAX_SPEED: 7.8,               // Maximum cap (never gets faster than this)
    SPEED_RAMP: 0.0003,           // Speed increase per score point (smaller = slower ramp)
    
    // Spawning variables
    MIN_SPACING: 350,             // Minimum spacing in pixels between spawned items
    COOLDOWN_BASE: 550,           // Cooldown divide factor (smaller = longer spawn cooldown)

    // Daydream details
    FOCUS_DRAIN_DAYDREAM: 0.0167,  // Focus drain per frame in daydream mode (approx 1 focus/sec)
    
    // Audio volume
    MASTER_VOLUME: 0.12           // Master volume (0.0 = mute, 1.0 = full blast)
};

// Item Scores & Focus Values Mapping
const ITEM_VALUES = {
    // Good items
    'Coffee': { score: 10, focus: 3, color: '#a57c59' },
    'Notes': { score: 15, focus: 0, color: '#ffffff' },
    'Charger': { score: 20, focus: 5, color: '#ffd166' },
    'WiFi': { score: 25, focus: 0, color: '#4cc9f0' },
    'LuckyStar': { score: 30, focus: 0, color: '#ffb703' }, // Combo boost item
    'Portal': { score: 0, focus: 0, color: '#ff007f' },
    
    // Daydream mode exclusive items
    'DreamCrystal': { score: 40, focus: 0, color: '#9cffd3' },
    'FantasyStar': { score: 50, focus: 0, color: '#ff9cfc' },
    'GlowingKey': { score: 75, focus: 0, color: '#ffd166' },
    'ThoughtBubble': { score: 35, focus: 0, color: '#ffffff' },
    'RealityCheck': { score: 0, focus: 10, color: '#ff5c5c' },
    
    // Obstacles
    'Battery': { focus: -15, color: '#ff5c5c' },
    'Social': { focus: -20, color: '#dd2a7b' },
    'Deadline': { focus: -25, color: '#3a0ca3' },
    'Overthinking': { focus: -10, color: '#4c5270' },
    'SleepDemon': { focus: -5, color: '#4cc9f0' },
    'ProjectGhost': { focus: -15, color: '#ffc6ff' }
};


// --- 2. CANVAS & WEB ENGINE INITIALIZATION ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const guideOverlay = document.getElementById('startGuideOverlay');
const vignette = document.getElementById('lowFocusVignette');
const groundY = 440;        // The Y coordinate where the ground/floor sits

let gameState = 'START';    // 'START', 'PLAYING', 'PAUSED', 'GAME_OVER'
let score = 0;
let combo = 1;
let focus = 100;
let highScore = parseInt(localStorage.getItem('chaosDormRushHighScore')) || 0;

let currentMode = 'STUDY';  // 'STUDY' or 'DAYDREAM'
let daydreamTimer = 0;

let scrollSpeed = GAME_TUNING.START_SPEED;
let collectibleSpawnTimer = 1.0; // Seconds until first collectible
let obstacleSpawnTimer = 2.5;    // Seconds until first obstacle
let portalSpawnTimer = 14.0;     // Seconds until first daydream portal
let frameCount = 0;
let slowTimer = 0;          // Used for the Sleep Demon slowing mechanism

// Visual FX variables
let shakeTime = 0;          // screen shake counter
let flashAlpha = 0;         // screen flash transparency

let player;
let collectibles = [];
let obstacles = [];
let particles = [];
let floatingTexts = [];

// Background scroll coordinates
let bgFarOffset = 0;
let bgMidOffset = 0;
let bgCloseOffset = 0;

// --- 3. WEB AUDIO SYNTHESIZER ENGINE ---
let audioCtx = null;
let masterGainNode = null;
let musicInterval = null;
let isMuted = false;
let musicStep = 0;

// Musical Note loops (frequencies in Hz)
// Reality mode chord progression (A minor -> F Major -> C Major -> G Major)
const realityBass = [220, 220, 220, 220, 174, 174, 174, 174, 261, 261, 261, 261, 196, 196, 196, 196];
const realityMelody = [440, 493, 523, 587, 349, 392, 440, 523, 523, 587, 659, 783, 392, 440, 493, 587];

// Daydream mode sparkling chime arpeggios (C Major Pentatonic)
const daydreamBass = [261, 261, 329, 329, 392, 392, 440, 440];
const daydreamMelody = [523, 659, 783, 880, 987, 880, 783, 659, 1046, 1174, 1318, 1567, 1567, 1318, 1174, 1046];

function initAudio() {
    if (audioCtx) {
        // Resume if suspended (browser security blocks)
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return;
    }
    
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.setValueAtTime(isMuted ? 0 : GAME_TUNING.MASTER_VOLUME, audioCtx.currentTime);
        masterGainNode.connect(audioCtx.destination);
        
        startSequencer();
    } catch(e) {
        console.warn("Audio Context failed to initialize: ", e);
    }
}

function toggleMute() {
    isMuted = !isMuted;
    if (masterGainNode) {
        masterGainNode.gain.setValueAtTime(isMuted ? 0 : GAME_TUNING.MASTER_VOLUME, audioCtx.currentTime);
    }
}

/**
 * Triggers a synth note procedurally.
 * Uses triangle waves for soft low bass, and sine waves for high sparkly chime melodies.
 */
function playNote(freq, type, duration, volume) {
    if (!audioCtx || isMuted || audioCtx.state === 'suspended') return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(masterGainNode);
        
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {
        // Catch any audio buffer bugs
    }
}

function playSFX(type) {
    if (!audioCtx || isMuted || audioCtx.state === 'suspended') return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(masterGainNode);
        
        if (type === 'collect') {
            // Rising chime ping
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);
        } else if (type === 'hit') {
            // Low alert buzz
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(220, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(80, audioCtx.currentTime + 0.22);
            gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.25);
        } else if (type === 'portal') {
            // Swirling synth riser sweep
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1300, audioCtx.currentTime + 0.5);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.5);
        } else if (type === 'gameover') {
            // Descending sad chiptune
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(196.0, audioCtx.currentTime);
            osc.frequency.setValueAtTime(146.83, audioCtx.currentTime + 0.22);
            osc.frequency.setValueAtTime(110.0, audioCtx.currentTime + 0.44);
            osc.frequency.setValueAtTime(73.42, audioCtx.currentTime + 0.66);
            gain.gain.setValueAtTime(0.45, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.95);
        } else if (type === 'jump') {
            // Quick upward chirp
            osc.type = 'sine';
            osc.frequency.setValueAtTime(349, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(698, audioCtx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.1);
        }
    } catch(e) {
        // Sound buffer error catcher
    }
}

function startSequencer() {
    if (musicInterval) clearInterval(musicInterval);
    
    // Beats loop: ticks every 250 milliseconds (120 BPM tempo)
    musicInterval = setInterval(() => {
        if (gameState !== 'PLAYING') return; 
        
        if (currentMode === 'DAYDREAM') {
            // Play Daydream Mode Theme
            let bassFreq = daydreamBass[musicStep % daydreamBass.length];
            playNote(bassFreq * 0.5, 'triangle', 0.22, 0.25);
            
            // Dream chime melody
            if (musicStep % 2 === 0) {
                let melFreq = daydreamMelody[(musicStep + 2) % daydreamMelody.length];
                playNote(melFreq, 'sine', 0.18, 0.18);
            } else {
                let melFreq = daydreamMelody[musicStep % daydreamMelody.length] * 1.5;
                playNote(melFreq, 'sine', 0.12, 0.12);
            }
        } else {
            // Play Study Mode Theme (chill lo-fi bass and chords)
            if (musicStep % 2 === 0) {
                let bassFreq = realityBass[Math.floor(musicStep / 2) % realityBass.length];
                playNote(bassFreq * 0.5, 'triangle', 0.45, 0.45);
            }
            
            if (musicStep % 4 === 0) {
                let melFreq = realityMelody[Math.floor(musicStep / 4) % realityMelody.length];
                playNote(melFreq, 'sine', 0.6, 0.2);
            }
        }
        
        musicStep++;
    }, 250);
}

// --- 4. SHAPES DRAWING UTILITIES ---
function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
}

// --- 5. PLAYER CHARACTER ---
class Player {
    constructor() {
        this.x = 100;
        this.width = 50;
        this.height = 80;
        this.y = groundY - this.height;
        this.vy = 0;
        this.gravity = 0.65;
        this.jumpForce = -14.5;
        this.isGrounded = true;
        this.isSliding = false;
    }

    update() {
        // Toggle sliding height
        if (keys['ArrowDown'] && this.isGrounded) {
            if (!this.isSliding) {
                this.isSliding = true;
                this.width = 80;
                this.height = 40;
                this.y = groundY - this.height;
            }
        } else {
            if (this.isSliding) {
                this.isSliding = false;
                this.width = 50;
                this.height = 80;
                this.y = groundY - this.height;
            }
        }

        // Fast fall if pressing ArrowDown in mid-air
        if (keys['ArrowDown'] && !this.isGrounded) {
            this.vy += 1.5;
        }

        // Jump trigger
        if ((keys[' '] || keys['ArrowUp']) && this.isGrounded && !this.isSliding) {
            this.vy = this.jumpForce;
            this.isGrounded = false;
            playSFX('jump');
        }

        // Physics engine
        this.vy += this.gravity;
        this.y += this.vy;

        if (this.y >= groundY - this.height) {
            this.y = groundY - this.height;
            this.vy = 0;
            this.isGrounded = true;
        }
    }

    draw(ctx, frameCount, daydreamActive) {
        ctx.save();
        
        // Reset canvas draw state to bypass any leaks
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        if (ctx.filter) ctx.filter = "none";

        // Draw a magical glowing pink aura behind the player (underneath them)
        if (daydreamActive) {
            ctx.save();
            ctx.shadowColor = '#ff007f';
            ctx.shadowBlur = 25;
            ctx.fillStyle = 'rgba(255, 0, 127, 0.35)'; // strong bright neon pink backing glow
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height / 2, Math.max(this.width, this.height) / 2 + 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.translate(this.x, this.y);

        if (this.isSliding) {
            // Draw sliding student
            ctx.fillStyle = daydreamActive ? '#ff007f' : '#9cffd3'; // Vibrant neon pink in daydream mode!
            drawRoundedRect(ctx, 10, 10, 60, 25, 8);
            
            ctx.fillStyle = '#6558a8';
            drawRoundedRect(ctx, 0, 12, 12, 20, 4);

            ctx.fillStyle = '#ffe0bd';
            ctx.beginPath();
            ctx.arc(70, 20, 10, 0, Math.PI * 2);
            ctx.fill();

            // Glasses
            ctx.strokeStyle = '#322b54';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(68, 18, 4, 0, Math.PI * 2);
            ctx.arc(74, 18, 4, 0, Math.PI * 2);
            ctx.stroke();

            // Slide legs
            ctx.fillStyle = '#322b54';
            ctx.fillRect(0, 18, 10, 8);
        } else {
            // Draw standing student
            ctx.fillStyle = '#6558a8';
            drawRoundedRect(ctx, 0, 20, 10, 40, 4);

            ctx.fillStyle = daydreamActive ? '#ff007f' : '#9cb4ff'; // Vibrant neon pink in daydream mode!
            drawRoundedRect(ctx, 8, 10, 34, 55, 10);

            ctx.fillStyle = '#ffe0bd';
            ctx.beginPath();
            ctx.arc(38, 22, 11, 0, Math.PI * 2);
            ctx.fill();

            // Glasses
            ctx.strokeStyle = '#322b54';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(36, 20, 4, 0, Math.PI * 2);
            ctx.arc(43, 20, 4, 0, Math.PI * 2);
            ctx.stroke();

            // Running legs
            ctx.fillStyle = '#322b54';
            if (this.isGrounded) {
                // Modulate walk cycle rate if slowed by Sleep Demon
                let walkRate = slowTimer > 0 ? 0.08 : 0.2;
                let walkOffset1 = Math.sin(frameCount * walkRate) * 8;
                let walkOffset2 = Math.sin(frameCount * walkRate + Math.PI) * 8;
                ctx.fillRect(16, 65, 6, 10 + walkOffset1);
                ctx.fillRect(28, 65, 6, 10 + walkOffset2);
            } else {
                ctx.fillRect(16, 65, 6, 8);
                ctx.fillRect(28, 65, 6, 5);
            }
        }

        ctx.restore();
    }
}

// --- 6. COLLECTIBLES CLASS ---
class Collectible {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.width = 30;  // Fair 30px hitbox width
        this.height = 30; // Fair 30px hitbox height
        this.collected = false;

        // Fetch specs from metadata
        const spec = ITEM_VALUES[type];
        this.scoreVal = spec.score;
        this.focusVal = spec.focus;
        this.color = spec.color;
    }

    update(speed) {
        this.x -= speed;
    }

    draw(ctx, frameCount) {
        ctx.save();
        
        // Reset canvas draw state to bypass any leaks
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        if (ctx.filter) ctx.filter = "none";

        ctx.translate(this.x, this.y);

        // Bobbing hover effect
        let hoverY = Math.sin(frameCount * 0.1 + this.x * 0.05) * 4;
        ctx.translate(0, hoverY);

        let cx = this.width / 2;
        let cy = this.height / 2;
        let radius = 20; // Default badge radius
        let glowSize = 10;

        // Badge parameters
        let badgeColor = 'rgba(0, 180, 255, 0.22)';
        let borderColor = '#00b4ff';
        let glowColor = '#00b4ff';
        let labelText = '';

        switch (this.type) {
            // Good Items: Blue/Cyan color scheme
            case 'Coffee':
                badgeColor = 'rgba(0, 180, 255, 0.22)';
                borderColor = '#00b4ff';
                glowColor = '#00b4ff';
                labelText = '+10 Coffee';
                break;
            case 'Notes':
                badgeColor = 'rgba(76, 201, 240, 0.22)';
                borderColor = '#4cc9f0';
                glowColor = '#4cc9f0';
                glowSize = 6;
                labelText = '+15 Notes';
                break;
            case 'Charger':
                badgeColor = 'rgba(0, 210, 255, 0.25)';
                borderColor = '#00d2ff';
                glowColor = '#00d2ff';
                labelText = '+20 Charger';
                break;
            case 'WiFi':
                badgeColor = 'rgba(58, 134, 255, 0.25)';
                borderColor = '#3a86ff';
                glowColor = '#3a86ff';
                labelText = '+25 Wi-Fi';
                break;
            case 'LuckyStar':
                badgeColor = 'rgba(0, 255, 212, 0.3)';
                borderColor = '#00f5d4';
                glowColor = '#00f5d4';
                glowSize = 15;
                labelText = 'Combo x2';
                break;
            
            // Daydream Portal: Purple/Magenta color scheme
            case 'Portal':
                badgeColor = 'rgba(217, 44, 165, 0.35)';
                borderColor = '#d92ca5';
                glowColor = '#d92ca5';
                glowSize = 20;
                radius = 24; // Portal is slightly larger but not oversized
                labelText = 'DAYDREAM';
                break;
            
            // Dream-only Items: Teal/Pink magical color scheme
            case 'DreamCrystal':
                badgeColor = 'rgba(156, 255, 211, 0.32)';
                borderColor = '#9cffd3';
                glowColor = '#9cffd3';
                labelText = '+40 Crystal';
                break;
            case 'FantasyStar':
                badgeColor = 'rgba(255, 156, 252, 0.35)';
                borderColor = '#ff9cfc';
                glowColor = '#ff9cfc';
                labelText = '+50 Star';
                break;
            case 'GlowingKey':
                badgeColor = 'rgba(156, 255, 211, 0.32)';
                borderColor = '#9cffd3';
                glowColor = '#9cffd3';
                labelText = '+75 Key';
                break;
            case 'ThoughtBubble':
                badgeColor = 'rgba(255, 180, 240, 0.3)';
                borderColor = '#ffb3ff';
                glowColor = '#ffb3ff';
                labelText = '+35 Thought';
                break;
            case 'RealityCheck':
                badgeColor = 'rgba(255, 92, 92, 0.35)';
                borderColor = '#ff5c5c';
                glowColor = '#ff5c5c';
                glowSize = 15;
                labelText = 'EXIT DREAM';
                break;
        }

        // 1. Draw solid dark circle first to guarantee opacity and high contrast
        ctx.fillStyle = '#120d24';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Draw colored translucent badge on top, with outer glow
        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowSize;
        ctx.fillStyle = badgeColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 3. Render emoji symbol centered inside the hitbox
        ctx.font = '28px sans-serif'; // Reduced to 28px for fair visual icon size
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        let emoji = '☕';
        switch (this.type) {
            case 'Coffee': emoji = '☕'; break;
            case 'Notes': emoji = '📚'; break;
            case 'Charger': emoji = '🔌'; break;
            case 'WiFi': emoji = '📶'; break;
            case 'LuckyStar': emoji = '⭐'; break;
            case 'Portal': emoji = '🌀'; break;
            case 'DreamCrystal': emoji = '💎'; break;
            case 'FantasyStar': emoji = '✨'; break;
            case 'GlowingKey': emoji = '🔑'; break;
            case 'ThoughtBubble': emoji = '💭'; break;
            case 'RealityCheck': emoji = '⏰'; break;
        }
        ctx.fillText(emoji, cx, cy);

        // 4. Render larger, bold, high-contrast label underneath
        ctx.font = 'bold 12px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Draw dark shadow text outline for high legibility
        ctx.strokeStyle = '#120d24';
        ctx.lineWidth = 3.5;
        ctx.strokeText(labelText, cx, cy + radius + 10);

        // Draw the text color fill
        ctx.fillStyle = borderColor;
        ctx.fillText(labelText, cx, cy + radius + 10);

        ctx.restore();
    }
}

// --- 7. OBSTACLES CLASS ---
class Obstacle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.hit = false;

        const spec = ITEM_VALUES[type];
        this.focusVal = spec.focus;
        this.color = spec.color;

        // Consistent hitbox size across all obstacles for fair gameplay
        this.width = 32;
        this.height = 32;
    }

    update(speed) {
        this.x -= speed;
    }

    draw(ctx, frameCount) {
        ctx.save();
        
        // Reset canvas draw state to bypass any leaks
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        if (ctx.filter) ctx.filter = "none";

        ctx.translate(this.x, this.y);

        let cx = this.width / 2;
        let cy = this.height / 2;
        let radius = 22; // Badge size slightly larger than hitbox for readability
        let glowSize = 12;

        // Hover/shake animations
        if (this.type === 'Social' || this.type === 'Overthinking' || this.type === 'ProjectGhost') {
            let floatY = Math.sin(frameCount * 0.08) * 3;
            ctx.translate(0, floatY);
        } else if (this.type === 'Deadline') {
            let shakeX = Math.sin(frameCount * 0.5) * 2;
            ctx.translate(shakeX, 0);
        }

        // Obstacles always use a clear red/pink warning border/badge
        let badgeColor = 'rgba(255, 92, 92, 0.28)'; // soft red
        let borderColor = '#ff5c5c'; // warning red border
        let glowColor = '#ff5c5c';
        let labelText = '';

        switch (this.type) {
            case 'Battery':
                badgeColor = 'rgba(255, 92, 92, 0.28)';
                borderColor = '#ff5c5c';
                glowColor = '#ff5c5c';
                labelText = '-15 Battery';
                break;
            case 'Social':
                badgeColor = 'rgba(255, 112, 166, 0.28)';
                borderColor = '#ff70a6'; // Pink warning border
                glowColor = '#ff70a6';
                labelText = '-20 Social';
                break;
            case 'Deadline':
                badgeColor = 'rgba(255, 42, 95, 0.28)';
                borderColor = '#ff2a5f'; // Strong danger red/pink border
                glowColor = '#ff2a5f';
                glowSize = 18;
                labelText = '-25 Deadline';
                break;
            case 'Overthinking':
                badgeColor = 'rgba(255, 92, 92, 0.28)';
                borderColor = '#ff5c5c';
                glowColor = '#ff5c5c';
                labelText = '-10 Cloud';
                break;
            case 'SleepDemon':
                badgeColor = 'rgba(255, 76, 201, 0.28)';
                borderColor = '#ff4cc9'; // Magenta warning border
                glowColor = '#ff4cc9';
                labelText = '-5 Slowness';
                break;
            case 'ProjectGhost':
                badgeColor = 'rgba(255, 198, 255, 0.28)';
                borderColor = '#ffc6ff'; // Soft pink warning border
                glowColor = '#ffc6ff';
                labelText = '-15 Ghost';
                break;
        }

        // 1. Draw solid dark circle first to guarantee opacity and high contrast
        ctx.fillStyle = '#120d24';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Draw colored warning badge on top, with outer glow
        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = glowSize;
        ctx.fillStyle = badgeColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // 3. Render emoji symbol centered
        ctx.font = '30px sans-serif'; // Reduced to 30px for fair visual icon size
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let emoji = '🪫';
        switch (this.type) {
            case 'Battery': emoji = '🪫'; break;
            case 'Social': emoji = '📱'; break;
            case 'Deadline': emoji = '📅'; break;
            case 'Overthinking': emoji = '☁️'; break;
            case 'SleepDemon': emoji = '😴'; break;
            case 'ProjectGhost': emoji = '👻'; break;
        }
        ctx.fillText(emoji, cx, cy);

        // 4. Render larger, bold, high-contrast label underneath
        ctx.font = 'bold 12px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Draw dark shadow text outline for high legibility
        ctx.strokeStyle = '#120d24';
        ctx.lineWidth = 3.5;
        ctx.strokeText(labelText, cx, cy + radius + 10);

        // Draw the text color fill
        ctx.fillStyle = borderColor;
        ctx.fillText(labelText, cx, cy + radius + 10);

        ctx.restore();
    }
}

// --- 8. FLOATING FX (PARTICLES & FLOATING TEXTS) ---
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 4 + 2.5;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8 - 2.5;
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.015;
        this.color = color;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.12; 
        this.alpha -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.alpha = 1;
        this.decay = 0.02;
    }

    update() {
        this.y -= 1.4;
        this.alpha -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 15px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 4;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// --- 9. KEYBOARD INPUT EVENT HANDLER ---
const keys = {};

window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
    }
    
    keys[e.key] = true;

    // SPACE or ENTER: handles triggers
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        if (gameState === 'START') {
            startGame();
        }
    }

    // P: toggles pause
    if (e.key.toLowerCase() === 'p') {
        if (gameState === 'PLAYING' || gameState === 'PAUSED') {
            togglePause();
        }
    }

    // R: restarts
    if (e.key.toLowerCase() === 'r' && gameState === 'GAME_OVER') {
        resetGame();
    }

    // M: toggle mute
    if (e.key.toLowerCase() === 'm') {
        toggleMute();
        // Spawns float notification over player
        if (gameState === 'PLAYING') {
            floatingTexts.push(new FloatingText(player.x + 25, player.y - 12, isMuted ? "MUSIC MUTED" : "MUSIC ACTIVE", '#ffd166'));
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// AABB Collision bounds checker
function checkCollision(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}
// Helper to check if it's safe to spawn another entity (minimum 350px gap)
function checkSpacingSafe() {
    let allEntities = [...collectibles, ...obstacles];
    if (allEntities.length === 0) return true;
    
    // Find rightmost entity
    let rightmost = allEntities.reduce((max, entity) => entity.x > max.x ? entity : max, allEntities[0]);
    return (canvas.width - rightmost.x >= GAME_TUNING.MIN_SPACING);
}

function resetCollectibleTimer() {
    // Collectible range: 1.5s - 2.2s at start, speeds up later
    let min = score < 1000 ? 1.5 : 1.1;
    let max = score < 1000 ? 2.2 : 1.7;
    collectibleSpawnTimer = min + Math.random() * (max - min);
}

function resetObstacleTimer() {
    // Obstacle range: 2.5s - 3.5s at start, speeds up later
    let min = score < 1000 ? 2.5 : 1.8;
    let max = score < 1000 ? 3.5 : 2.8;
    obstacleSpawnTimer = min + Math.random() * (max - min);
}

function resetPortalTimer() {
    // Portal range: 12s - 18s
    portalSpawnTimer = 12 + Math.random() * 6;
}

function spawnCollectible() {
    let yPos = Math.random() < 0.5 ? 300 : 390;
    let type = 'DreamCrystal';
    
    if (currentMode === 'DAYDREAM') {
        let typeRand = Math.random();
        if (typeRand < 0.3) type = 'DreamCrystal';       // 30%
        else if (typeRand < 0.58) type = 'FantasyStar';   // 28%
        else if (typeRand < 0.8) type = 'ThoughtBubble';  // 22%
        else if (typeRand < 0.92) type = 'GlowingKey';    // 12%
        else type = 'RealityCheck';                       // 8%
    } else {
        let typeRand = Math.random();
        if (typeRand < 0.35) type = 'Coffee';
        else if (typeRand < 0.65) type = 'Notes';
        else if (typeRand < 0.85) type = 'Charger';
        else if (typeRand < 0.95) type = 'WiFi';
        else type = 'LuckyStar';
    }
    
    collectibles.push(new Collectible(canvas.width, yPos, type));
}

function spawnObstacle() {
    let typeRand = Math.random();
    let type = 'Battery';
    let yPos = groundY - 32; // Default ground-level hazard Y (groundY - 32)
    
    if (typeRand < 0.22) {
        type = 'Battery';
        yPos = groundY - 32;
    } else if (typeRand < 0.44) {
        type = 'Social';
        yPos = 340; // Floating hazard (can slide under)
    } else if (typeRand < 0.6) {
        type = 'Deadline';
        yPos = groundY - 32;
    } else if (typeRand < 0.75) {
        type = 'Overthinking';
        yPos = 340; // Floating hazard (can slide under)
    } else if (typeRand < 0.88) {
        type = 'SleepDemon';
        yPos = groundY - 32;
    } else {
        type = 'ProjectGhost';
        yPos = groundY - 32;
    }
    
    obstacles.push(new Obstacle(canvas.width, yPos, type));
}

function spawnPortal() {
    if (currentMode === 'STUDY') {
        let yPos = Math.random() < 0.5 ? 300 : 390;
        collectibles.push(new Collectible(canvas.width, yPos, 'Portal'));
    }
    resetPortalTimer();
}

// --- 10. SPONTANEOUS SPAWN ENGINE ---
function spawnEntities() {
    // Tick down timers in seconds (assuming approx 60fps)
    collectibleSpawnTimer -= 1 / 60;
    obstacleSpawnTimer -= 1 / 60;
    portalSpawnTimer -= 1 / 60;

    // Check collectible spawn
    if (collectibleSpawnTimer <= 0) {
        if (checkSpacingSafe()) {
            spawnCollectible();
            resetCollectibleTimer();
        } else {
            collectibleSpawnTimer = 0.2; // Delay check slightly
        }
    }

    // Check obstacle spawn - ONLY in STUDY mode!
    if (currentMode === 'STUDY') {
        if (obstacleSpawnTimer <= 0) {
            if (checkSpacingSafe()) {
                spawnObstacle();
                resetObstacleTimer();
            } else {
                obstacleSpawnTimer = 0.2;
            }
        }
    } else {
        // Keep obstacle spawn timer at 1.0s in daydream mode so it is ready upon exit
        obstacleSpawnTimer = 1.0;
    }

    // Check portal spawn - ONLY in STUDY mode!
    if (currentMode === 'STUDY') {
        if (portalSpawnTimer <= 0) {
            if (checkSpacingSafe()) {
                spawnPortal();
            } else {
                portalSpawnTimer = 0.2;
            }
        }
    } else {
        // Keep portal spawn timer at 10.0s during daydream mode
        portalSpawnTimer = 10.0;
    }
}

// --- 11. ITEM HIT TRIGGERS & SCORING PIPELINE ---
function triggerCollection(item) {
    playSFX('collect');

    if (item.type === 'LuckyStar') {
        combo += 2; // double combo step boost!
    } else {
        combo++;
    }

    let multiplier = (currentMode === 'DAYDREAM') ? 2 : 1;
    let scoreGain = item.scoreVal * multiplier * combo;
    score += scoreGain;

    if (item.focusVal > 0) {
        focus = Math.min(100, focus + item.focusVal);
    }

    if (item.type === 'Portal') {
        activateDaydreamMode();
    }

    if (item.type === 'RealityCheck') {
        exitDaydreamMode(true);
    }

    // Sparkles burst
    let centerX = item.x + item.width / 2;
    let centerY = item.y + item.height / 2;
    for (let i = 0; i < 10; i++) {
        particles.push(new Particle(centerX, centerY, item.color));
    }

    // Float notification text
    let floatName = item.type;
    if (item.type === 'WiFi') floatName = 'Wi-Fi';
    else if (item.type === 'LuckyStar') floatName = 'Lucky Star';
    else if (item.type === 'DreamCrystal') floatName = 'Dream Crystal';
    else if (item.type === 'FantasyStar') floatName = 'Fantasy Star';
    else if (item.type === 'GlowingKey') floatName = 'Glowing Key';
    else if (item.type === 'ThoughtBubble') floatName = 'Thought Bubble';
    else if (item.type === 'RealityCheck') floatName = 'Reality Check';

    let text = `+${scoreGain} ${floatName}`;
    if (item.focusVal > 0) {
        text += ` (+${item.focusVal} Focus)`;
    }
    if (item.type === 'Portal') {
        text = "DAYDREAM MODE!";
    }
    floatingTexts.push(new FloatingText(centerX, item.y - 12, text, item.color));
}

function triggerHit(obs) {
    playSFX('hit');
    shakeTime = 10; // Trigger screen shake FX
    
    focus = Math.max(0, focus + obs.focusVal);

    if (obs.type === 'Social' || obs.type === 'ProjectGhost') {
        combo = 1; // reset multiplier
    }

    // Trigger Sleep Demon slow-mo debuff
    if (obs.type === 'SleepDemon') {
        slowTimer = 160; // slows gameplay speed for 160 frames (approx 2.6s)
    }

    // Spark particles
    let centerX = obs.x + obs.width / 2;
    let centerY = obs.y + obs.height / 2;
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(centerX, centerY, obs.color));
    }

    // Float warnings
    let floatName = obs.type;
    if (obs.type === 'Battery') floatName = 'Low Battery';
    else if (obs.type === 'Social') floatName = 'Social Trap';
    else if (obs.type === 'Deadline') floatName = 'Deadline Monster';
    else if (obs.type === 'Overthinking') floatName = 'Overthinking Cloud';
    else if (obs.type === 'SleepDemon') floatName = 'Sleep Demon';
    else if (obs.type === 'ProjectGhost') floatName = 'Project Ghost';

    let text = `${obs.focusVal} Focus (${floatName})`;
    if (obs.type === 'Social' || obs.type === 'ProjectGhost') {
        text += " (Combo Reset!)";
    } else if (obs.type === 'SleepDemon') {
        text += " (SLOWNESS!)";
    }
    
    floatingTexts.push(new FloatingText(centerX, obs.y - 12, text, '#ff5c5c'));

    if (focus <= 0) {
        gameOver();
    }
}

// --- 12. MODE CHANGING EVENTS ---
function activateDaydreamMode() {
    currentMode = 'DAYDREAM';
    daydreamTimer = 15.0;
    flashAlpha = 0.55; // visual flash burst
    playSFX('portal');

    // Clear existing obstacles on transition so the player does not instantly hit old hazards
    obstacles = [];

    // Shower screen in magical sparks
    for (let i = 0; i < 35; i++) {
        let px = Math.random() * canvas.width;
        let py = Math.random() * canvas.height;
        particles.push(new Particle(px, py, '#ff007f'));
        particles.push(new Particle(px, py, '#00f5d4'));
        particles.push(new Particle(px, py, '#ff9cfc'));
    }
}

function exitDaydreamMode(isEarly = false) {
    currentMode = 'STUDY';
    daydreamTimer = 0;
    flashAlpha = 0.45;
    
    let label = isEarly ? "REALITY CHECK! (Early Exit)" : "REALITY CHECK!";
    floatingTexts.push(new FloatingText(player.x + 25, player.y - 15, label, '#ff9cfc'));
}

// --- 13. PARALLAX COZY BACKGROUND DRAW ---
function drawBackground() {
    ctx.save();

    // Reset canvas draw state at the beginning of background drawing to prevent any leak from previous frames
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    if (ctx.filter) ctx.filter = "none";

    let skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    
    if (currentMode === 'DAYDREAM') {
        // Magical neon pastel shift gradient
        skyGradient.addColorStop(0, '#ff9cfc');
        skyGradient.addColorStop(0.3, '#c5a3ff');
        skyGradient.addColorStop(0.6, '#9cffd3');
        skyGradient.addColorStop(0.85, '#b2fffc');
        skyGradient.addColorStop(1, '#ffb3ff');
    } else {
        // Chill nighttime study room gradient
        skyGradient.addColorStop(0, '#0f0c1b');
        skyGradient.addColorStop(0.6, '#1a1437');
        skyGradient.addColorStop(1, '#2c225a');
    }
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentMode === 'DAYDREAM') {
        // Magical floating bubbles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        for (let i = 0; i < 6; i++) {
            let bubbleX = ((bgFarOffset + i * 200) % (canvas.width + 100)) - 50;
            let bubbleY = 120 + Math.sin(frameCount * 0.02 + i) * 60;
            ctx.beginPath();
            ctx.arc(bubbleX, bubbleY, 20 + i * 6, 0, Math.PI * 2);
            ctx.fill();
            // Highlight reflection dot
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.arc(bubbleX - 5, bubbleY - 5, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        }

        // Sparkling background stars
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 8; i++) {
            let starX = (i * 130 + bgFarOffset * 0.5) % canvas.width;
            let starY = 40 + Math.sin(frameCount * 0.03 + i) * 20;
            let size = Math.abs(Math.sin(frameCount * 0.05 + i)) * 6 + 2;
            ctx.fillRect(starX - size/2, starY, size, 1.5);
            ctx.fillRect(starX, starY - size/2, 1.5, size);
        }
    }

    // --- FAR LAYER (silhouettes: bookshelves, desks - scrolls 15% rate) ---
    bgFarOffset -= (slowTimer > 0 ? scrollSpeed * 0.4 : scrollSpeed) * 0.15;
    if (bgFarOffset <= -canvas.width) {
        bgFarOffset = 0;
    }
    // Reduced transparency (opacity increased from 0.15 to 0.35) for better daydream contrast
    ctx.fillStyle = currentMode === 'DAYDREAM' ? 'rgba(255, 126, 253, 0.35)' : 'rgba(50, 43, 84, 0.3)';
    for (let xOffset = bgFarOffset; xOffset < canvas.width * 2; xOffset += canvas.width) {
        ctx.fillRect(xOffset + 50, 150, 100, 290);
        ctx.fillRect(xOffset + 250, 100, 120, 340);
        ctx.fillRect(xOffset + 500, 200, 150, 240);
        ctx.fillRect(xOffset + 750, 120, 80, 320);
    }

    // --- MID LAYER (silhouettes: cozy window glowing grids - scrolls 40% rate) ---
    bgMidOffset -= (slowTimer > 0 ? scrollSpeed * 0.4 : scrollSpeed) * 0.4;
    if (bgMidOffset <= -480) {
        bgMidOffset = 0;
    }
    
    for (let x = bgMidOffset; x < canvas.width + 480; x += 480) {
        // Window glow glow
        ctx.save();
        ctx.fillStyle = currentMode === 'DAYDREAM' ? 'rgba(255, 255, 255, 0.55)' : '#ffe8a3';
        ctx.shadowColor = currentMode === 'DAYDREAM' ? '#ff9cfc' : '#ffe8a3';
        ctx.shadowBlur = currentMode === 'DAYDREAM' ? 16 : 4;
        ctx.fillRect(x + 120, 120, 140, 160);
        ctx.restore();
        
        ctx.fillStyle = currentMode === 'DAYDREAM' ? '#ffb3ff' : '#45387a';
        ctx.fillRect(x + 115, 115, 150, 10); 
        ctx.fillRect(x + 115, 275, 150, 10); 
        ctx.fillRect(x + 115, 115, 10, 170); 
        ctx.fillRect(x + 255, 115, 10, 170); 
        ctx.fillRect(x + 185, 115, 10, 170); 
        ctx.fillRect(x + 115, 195, 150, 10); 

        // Light bulb strings details
        ctx.strokeStyle = currentMode === 'DAYDREAM' ? '#00f5d4' : '#ffd166';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 50, 80);
        ctx.quadraticCurveTo(x + 60, 130, x + 120, 80);
        ctx.stroke();
        
        ctx.fillStyle = currentMode === 'DAYDREAM' ? '#ffffff' : '#ffe0bd';
        for (let i = 1; i <= 5; i++) {
            let t = i / 6;
            let bx = (1 - t) * (1 - t) * (x - 50) + 2 * (1 - t) * t * (x + 60) + t * t * (x + 120);
            let by = (1 - t) * (1 - t) * 80 + 2 * (1 - t) * t * 130 + t * t * 80;
            ctx.beginPath();
            ctx.arc(bx, by + 3, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- BASEGROUND FLOOR (scrolls 100% rate) ---
    bgCloseOffset -= (slowTimer > 0 ? scrollSpeed * 0.4 : scrollSpeed);
    if (bgCloseOffset <= -60) {
        bgCloseOffset = 0;
    }
    
    // Darker floorboards and perspective lines in Daydream Mode for higher contrast
    ctx.fillStyle = currentMode === 'DAYDREAM' ? '#3c0531' : '#221a3a';
    ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
    
    ctx.strokeStyle = currentMode === 'DAYDREAM' ? '#8f0c76' : '#332757';
    ctx.lineWidth = 2;
    for (let x = bgCloseOffset; x < canvas.width + 60; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x - 20, canvas.height);
        ctx.stroke();
    }

    ctx.fillStyle = currentMode === 'DAYDREAM' ? '#5c094d' : '#3a2e5e';
    ctx.fillRect(0, groundY - 12, canvas.width, 12);

    ctx.restore();
}

// --- 14. UI DISPLAY OVERLAY ---
function drawHUD() {
    ctx.save();

    // Reset canvas draw state to bypass any leaks and ensure UI is fully opaque
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    if (ctx.filter) ctx.filter = "none";

    // 1. Focus bar (sanity)
    ctx.fillStyle = 'rgba(26, 21, 44, 0.6)';
    ctx.strokeStyle = 'rgba(177, 159, 251, 0.25)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, 20, 30, 204, 20, 6);
    
    if (focus > 0) {
        let barColor = '#00f5d4'; // Safe green-teal
        if (currentMode === 'DAYDREAM') {
            barColor = '#ff007f'; // Dreamy hot pink
        } else if (focus < 30) {
            barColor = '#ff5c5c'; // Dangerous red
        } else if (focus < 60) {
            barColor = '#ffd166'; // Warning yellow
        }
        
        ctx.fillStyle = barColor;
        let barWidth = (focus / 100) * 200;
        drawRoundedRect(ctx, 22, 32, barWidth, 16, 4);
    }
    
    ctx.fillStyle = '#f1ecff';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FOCUS / SANITY', 20, 22);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(focus)}%`, 220, 22);

    // 2. Score points
    ctx.fillStyle = '#f1ecff';
    ctx.font = '600 18px Outfit, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${score}`, canvas.width - 20, 38);

    ctx.font = '500 12px Outfit, sans-serif';
    ctx.fillStyle = '#a39bb8';
    ctx.fillText(`BEST: ${highScore}`, canvas.width - 20, 56);

    // 3. Multiplier combos
    if (combo > 1) {
        ctx.save();
        ctx.translate(canvas.width - 120, 80);
        let scale = 1 + Math.sin(frameCount * 0.2) * 0.05;
        ctx.scale(scale, scale);
        
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 20px Outfit, sans-serif';
        ctx.textAlign = 'right';
        ctx.shadowColor = '#ffd166';
        ctx.shadowBlur = 8;
        ctx.fillText(`Combo x${combo}`, 0, 0);
        ctx.restore();
    }

    // 4. Music on/off mute display
    ctx.fillStyle = '#a39bb8';
    ctx.font = '600 11px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`MUSIC [M]: ${isMuted ? 'MUTED' : 'PLAYING'}`, 20, canvas.height - 20);

    // 5. Daydream Mode banner
    ctx.save();
    ctx.textAlign = 'center';
    
    if (currentMode === 'DAYDREAM') {
        ctx.fillStyle = 'rgba(255, 0, 127, 0.15)';
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, canvas.width / 2 - 100, 20, 200, 30, 8);
        ctx.stroke();

        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 10;
        ctx.font = 'bold 13px Outfit, sans-serif';
        ctx.fillText(`DAYDREAM: ${Math.ceil(daydreamTimer)}s`, canvas.width / 2, 40);
        
        // Progress bar indicator of countdown timer
        ctx.fillStyle = 'rgba(255, 0, 127, 0.2)';
        ctx.fillRect(canvas.width / 2 - 80, 55, 160, 5);
        ctx.fillStyle = '#ff007f';
        ctx.fillRect(canvas.width / 2 - 80, 55, (daydreamTimer / 15.0) * 160, 5);
    } else {
        ctx.fillStyle = 'rgba(177, 159, 251, 0.1)';
        ctx.strokeStyle = 'rgba(177, 159, 251, 0.3)';
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, canvas.width / 2 - 80, 20, 160, 30, 8);
        ctx.stroke();

        ctx.fillStyle = '#b19ffb';
        ctx.font = 'bold 13px Outfit, sans-serif';
        ctx.fillText('STUDY MODE', canvas.width / 2, 40);
    }
    ctx.restore();

    // 6. Spawn counters (Debug Info)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    drawRoundedRect(ctx, canvas.width - 155, canvas.height - 32, 135, 20, 4);
    ctx.fillStyle = '#9cffd3';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ITEMS: ${collectibles.length} | OBS: ${obstacles.length}`, canvas.width - 87, canvas.height - 18);

    ctx.restore();
}

// --- 15. SCREEN OVERLAYS ---
function drawStartScreen() {
    drawBackground();

    // Dark screen overlay
    ctx.fillStyle = 'rgba(15, 12, 27, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    let titleY = 170 + Math.sin(frameCount * 0.05) * 8;
    
    ctx.fillStyle = '#ff9cfc';
    ctx.shadowColor = '#b19ffb';
    ctx.shadowBlur = 20;
    ctx.font = '800 44px Outfit, sans-serif';
    ctx.fillText('CHAOS DORM RUSH', canvas.width / 2, titleY);
    
    ctx.font = '800 24px Outfit, sans-serif';
    ctx.fillStyle = '#00f5d4';
    ctx.shadowColor = '#00f5d4';
    ctx.shadowBlur = 10;
    ctx.fillText('DAYDREAM MODE', canvas.width / 2, titleY + 40);
    ctx.shadowBlur = 0; 

    // Character preview models
    player.x = canvas.width / 2 - 25;
    player.y = 265;
    player.isSliding = false;
    player.isGrounded = true;
    player.draw(ctx, frameCount, false);

    // Blinking prompt text
    if (Math.floor(frameCount / 30) % 2 === 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 18px Outfit, sans-serif';
        ctx.fillText('Press SPACE to Start', canvas.width / 2, 400);
    }

    ctx.fillStyle = '#a39bb8';
    ctx.font = '500 14px Outfit, sans-serif';
    ctx.fillText(`Best Record: ${highScore}`, canvas.width / 2, 440);
}

function drawPauseScreen() {
    ctx.fillStyle = 'rgba(15, 12, 27, 0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 15;
    ctx.font = '800 48px Outfit, sans-serif';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 20);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 18px Outfit, sans-serif';
    ctx.fillText('Press P to Resume', canvas.width / 2, canvas.height / 2 + 30);
}

function drawGameOverScreen() {
    ctx.fillStyle = 'rgba(40, 10, 20, 0.86)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5c5c';
    ctx.shadowColor = '#ff5c5c';
    ctx.shadowBlur = 20;
    ctx.font = '800 52px Outfit, sans-serif';
    ctx.fillText('GAME OVER', canvas.width / 2, 180);
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#a39bb8';
    ctx.font = '500 16px Outfit, sans-serif';
    ctx.fillText('Your focus fully drained!', canvas.width / 2, 220);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 24px Outfit, sans-serif';
    ctx.fillText(`Final Score: ${score}`, canvas.width / 2, 280);

    if (score >= highScore && score > 0) {
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 16px Outfit, sans-serif';
        ctx.fillText('★ NEW HIGH SCORE! ★', canvas.width / 2, 315);
    } else {
        ctx.fillStyle = '#a39bb8';
        ctx.font = '500 16px Outfit, sans-serif';
        ctx.fillText(`Best Score: ${highScore}`, canvas.width / 2, 315);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 18px Outfit, sans-serif';
    ctx.fillText('Press R to Restart', canvas.width / 2, 380);
}

// --- 16. OBJECT COLLISION ENGINE ---
function updateEntities() {
    // Determine dynamic speed adjusted if sleep demon slowing is active
    let currentSpeed = scrollSpeed;
    if (slowTimer > 0) {
        slowTimer--;
        currentSpeed = scrollSpeed * 0.4; // slow to 40% speed
    }

    // Update collectibles
    for (let i = collectibles.length - 1; i >= 0; i--) {
        let item = collectibles[i];
        item.update(currentSpeed);

        if (!item.collected && checkCollision(player, item)) {
            item.collected = true;
            triggerCollection(item);
            collectibles.splice(i, 1);
            continue;
        }

        if (item.x + item.width < 0) {
            collectibles.splice(i, 1);
        }
    }

    // Update obstacles
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];
        obs.update(currentSpeed);

        if (!obs.hit && checkCollision(player, obs)) {
            obs.hit = true;
            triggerHit(obs);
            obstacles.splice(i, 1);
            continue;
        }

        if (obs.x + obs.width < 0) {
            obstacles.splice(i, 1);
        }
    }

    // Particles physics
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.update();
        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }

    // Text floatings
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.update();
        if (ft.alpha <= 0) {
            floatingTexts.splice(i, 1);
        }
    }
}

// --- 17. MAIN HEARTBEAT LOOP ---
function gameLoop() {
    requestAnimationFrame(gameLoop);

    frameCount++;

    // Low Focus pulse warning vignette triggers below 30 focus
    if (focus < 30 && gameState === 'PLAYING') {
        vignette.classList.add('active');
    } else {
        vignette.classList.remove('active');
    }

    if (gameState === 'START') {
        drawStartScreen();
    } else if (gameState === 'PLAYING') {
        // --- 1. GAMEPLAY UPDATE CALCS ---
        player.update();
        
        // Speed scaling (increments very slowly, cap at MAX_SPEED)
        scrollSpeed = GAME_TUNING.START_SPEED + (score * GAME_TUNING.SPEED_RAMP);
        scrollSpeed = Math.min(scrollSpeed, GAME_TUNING.MAX_SPEED);
        
        if (currentMode === 'DAYDREAM') {
            daydreamTimer -= 0.0167; // sub delta second per frame at 60fps
            focus = Math.max(0, focus - GAME_TUNING.FOCUS_DRAIN_DAYDREAM);
            
            if (daydreamTimer <= 0) {
                exitDaydreamMode(false);
            }

            if (focus <= 0) {
                gameOver();
            }
        }

        spawnEntities();
        updateEntities();

        // --- 2. CANVAS DRAWING PIPELINE ---
        ctx.save();
        
        // Apply screen shake if hit occurred
        if (shakeTime > 0) {
            shakeTime--;
            let dx = (Math.random() - 0.5) * 8;
            let dy = (Math.random() - 0.5) * 8;
            ctx.translate(dx, dy);
        }

        drawBackground();
        
        // Items
        for (let item of collectibles) {
            item.draw(ctx, frameCount);
        }
        for (let obs of obstacles) {
            obs.draw(ctx, frameCount);
        }

        // Draw Player
        player.draw(ctx, frameCount, currentMode === 'DAYDREAM');

        // Draw burst particles
        for (let p of particles) {
            p.draw(ctx);
        }

        // Draw floating text
        for (let ft of floatingTexts) {
            ft.draw(ctx);
        }

        ctx.restore();

        // Screen flashes (white portal burst transitions)
        if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            flashAlpha -= 0.04;
        }

        drawHUD();

    } else if (gameState === 'PAUSED') {
        // Frozen scene render
        drawBackground();
        for (let item of collectibles) {
            item.draw(ctx, frameCount);
        }
        for (let obs of obstacles) {
            obs.draw(ctx, frameCount);
        }
        player.draw(ctx, frameCount, currentMode === 'DAYDREAM');
        for (let p of particles) {
            p.draw(ctx);
        }
        for (let ft of floatingTexts) {
            ft.draw(ctx);
        }
        drawHUD();
        drawPauseScreen();

    } else if (gameState === 'GAME_OVER') {
        drawGameOverScreen();
    }
}

// --- 18. GAME MANAGEMENT ROUTINES ---
function init() {
    player = new Player();
    resetGameValues();
    requestAnimationFrame(gameLoop);
}

function resetGameValues() {
    score = 0;
    combo = 1;
    focus = 100;
    currentMode = 'STUDY';
    daydreamTimer = 0;
    scrollSpeed = GAME_TUNING.START_SPEED;
    collectibleSpawnTimer = 1.0; // Spawns first item at 1.0s
    obstacleSpawnTimer = 2.5;    // Spawns first obstacle at 2.5s
    portalSpawnTimer = 14.0;     // Spawns first portal at 14.0s
    slowTimer = 0;
    shakeTime = 0;
    flashAlpha = 0;
    
    collectibles = [];
    obstacles = [];
    particles = [];
    floatingTexts = [];
}

function startGame() {
    resetGameValues();
    player.x = 100;
    player.y = groundY - player.height;
    player.vy = 0;
    
    // Hide guide overlay
    guideOverlay.classList.add('hidden');
    
    // Boot music context safely
    try {
        initAudio();
    } catch(e) {
        console.warn("Audio Context failed to initialize, starting game anyway: ", e);
    }
    
    gameState = 'PLAYING';
}

function resetGame() {
    resetGameValues();
    player = new Player();
    
    // Hide overlay just in case
    guideOverlay.classList.add('hidden');
    
    gameState = 'PLAYING';
}

function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
    }
}

function gameOver() {
    gameState = 'GAME_OVER';
    playSFX('gameover');
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('chaosDormRushHighScore', highScore);
    }
}

// Click listener for Start overlay buttons
document.getElementById('startButton').addEventListener('click', () => {
    if (gameState === 'START') {
        startGame();
    }
});

// Fire up engine initialization
init();
