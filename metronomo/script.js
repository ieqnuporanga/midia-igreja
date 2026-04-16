// Variáveis globais
let metronomes = [];
let nextId = 1;
let globalChannel = 'C';
let globalVolume = 1; // Volume fixo do sistema
let clickMuted = false; // Mute do click (pad continua tocando)
let selectedTimbre = 'click';
let globalAccentEnabled = false; // Controle global de acentuação
let doubleClickActive = false; // Double Click: BPM dobrado
let audioContext = null;
let intervals = {};
let savedSetlists = [];
let sharedSetlists = [];

// Variáveis para Tap Tempo
let tapTimes = [];
let tapTimeout = null;

// ── PAD CONTÍNUO ──────────────────────────────────────────────
// Usa arquivos MP3 da pasta /pads/ — 12 tons, um por nota.
// Nomes: Pad_-_A.mp3, Pad_-_Ab.mp3, Pad_-_Bb.mp3, etc.

const padState = {};

// Mapa nota → nome do arquivo (usa notação b para bemóis)
const PAD_FILE_MAP = {
    'C':  'Pad - C.mp3',
    'Db': 'Pad - Db.mp3',
    'D':  'Pad - D.mp3',
    'Eb': 'Pad - Eb.mp3',
    'E':  'Pad - E.mp3',
    'F':  'Pad - F.mp3',
    'Gb': 'Pad - Gb.mp3',
    'G':  'Pad - G.mp3',
    'Ab': 'Pad - Ab.mp3',
    'A':  'Pad - A.mp3',
    'Bb': 'Pad - Bb.mp3',
    'B':  'Pad - B.mp3',
};

const PAD_NOTES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

// Nomes de exibição no select (usa bemóis, mais comum na música)
const PAD_NOTE_LABELS = {
    'C':'C', 'Db':'C#', 'D':'D', 'Eb':'D#',
    'E':'E', 'F':'F', 'Gb':'F#', 'G':'G',
    'Ab':'G#', 'A':'A', 'Bb':'A#', 'B':'B'
};

function getPadState(id) {
    if (!padState[id]) {
        padState[id] = {
            note: 'A',
            enabled: false,
            volume: 0.7,
            audioEl: null,
            gainNode: null,
            sourceConnected: false,
        };
    }
    return padState[id];
}

function getPadAudioPath(note) {
    return 'pads/' + (PAD_FILE_MAP[note] || PAD_FILE_MAP['A']);
}

// Pré-carrega o elemento de áudio para a nota (sem tocar ainda)
function loadPadAudio(id) {
    const ps = getPadState(id);
    const path = getPadAudioPath(ps.note);

    // Se já tem o mesmo arquivo carregado, não recarrega
    if (ps.audioEl && ps.audioEl.dataset.note === ps.note) return;

    // Para e descarta o anterior
    if (ps.audioEl) {
        ps.audioEl.pause();
        ps.audioEl = null;
        ps.gainNode = null;
        ps.sourceConnected = false;
    }

    const el = new Audio(path);
    el.loop = true;
    el.dataset.note = ps.note;
    ps.audioEl = el;
}

const PAD_FADE_IN_S  = 1.5;
const PAD_FADE_OUT_S = 1.5;

function startPad(id) {
    const ps = getPadState(id);
    if (!ps.enabled) return;

    if (ps.customAudioEl) {
        startCustomPad(id);
    } else {
        loadPadAudio(id);
        if (!ps.audioEl) return;

        if (!ps.sourceConnected && audioContext) {
            try {
                const src = audioContext.createMediaElementSource(ps.audioEl);
                const gainNode = audioContext.createGain();
                gainNode.gain.value = 0;
                src.connect(gainNode);
                gainNode.connect(audioContext.destination);
                ps.gainNode = gainNode;
                ps.sourceConnected = true;
            } catch(e) { console.warn('Pad audio connect error:', e); }
        }

        if (ps.gainNode) {
            ps.gainNode.gain.cancelScheduledValues(audioContext.currentTime);
            ps.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            ps.gainNode.gain.linearRampToValueAtTime(ps.volume, audioContext.currentTime + PAD_FADE_IN_S);
        }

        ps.audioEl.currentTime = 0;
        ps.audioEl.play().catch(e => console.warn('Pad play error:', e));
    }
    updatePadIndicator(id, true);
}

function stopPad(id, fadeOut = true) {
    const ps = getPadState(id);

    function doStop(audioEl, gainNode) {
        if (!audioEl) return;
        if (fadeOut && gainNode && audioContext) {
            gainNode.gain.cancelScheduledValues(audioContext.currentTime);
            gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + PAD_FADE_OUT_S);
            setTimeout(() => {
                audioEl.pause();
                audioEl.currentTime = 0;
            }, PAD_FADE_OUT_S * 1000);
        } else {
            audioEl.pause();
            audioEl.currentTime = 0;
        }
    }

    doStop(ps.customAudioEl, ps.customGainNode);
    doStop(ps.audioEl, ps.gainNode);
    updatePadIndicator(id, false);
}

function startCustomPad(id) {
    const ps = getPadState(id);
    if (!ps.customAudioEl) return;

    if (!ps.customSourceConnected && audioContext) {
        try {
            const src = audioContext.createMediaElementSource(ps.customAudioEl);
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 0;
            src.connect(gainNode);
            gainNode.connect(audioContext.destination);
            ps.customGainNode = gainNode;
            ps.customSourceConnected = true;
        } catch(e) { console.warn('Custom pad connect error:', e); }
    }

    if (ps.customGainNode) {
        ps.customGainNode.gain.cancelScheduledValues(audioContext.currentTime);
        ps.customGainNode.gain.setValueAtTime(0, audioContext.currentTime);
        ps.customGainNode.gain.linearRampToValueAtTime(ps.volume, audioContext.currentTime + PAD_FADE_IN_S);
    }

    ps.customAudioEl.currentTime = 0;
    ps.customAudioEl.play().catch(e => console.warn('Custom pad play error:', e));
}

function padHandleFile(id, file) {
    if (!file || !file.type.startsWith('audio')) return;
    const ps = getPadState(id);

    // Descarta arquivo anterior
    if (ps.customAudioEl) {
        ps.customAudioEl.pause();
        ps.customAudioEl = null;
        ps.customGainNode = null;
        ps.customSourceConnected = false;
    }

    const url = URL.createObjectURL(file);
    const el = new Audio(url);
    el.loop = true;
    ps.customAudioEl = el;

    // Atualiza UI
    const drop = document.getElementById('pad-drop-' + id);
    const info = document.getElementById('pad-file-info-' + id);
    const nameEl = document.getElementById('pad-file-name-' + id);
    if (drop) drop.style.display = 'none';
    if (info) info.style.display = 'flex';
    if (nameEl) nameEl.textContent = file.name;

    // Se o metrônomo está tocando, inicia já
    const metro = metronomes.find(m => m.id === id);
    if (metro && metro.isPlaying && ps.enabled) {
        // Para o pad padrão primeiro
        if (ps.audioEl) { ps.audioEl.pause(); ps.audioEl.currentTime = 0; }
        startCustomPad(id);
    }
}

function padRemoveFile(id) {
    const ps = getPadState(id);
    if (ps.customAudioEl) {
        ps.customAudioEl.pause();
        ps.customAudioEl = null;
        ps.customGainNode = null;
        ps.customSourceConnected = false;
    }

    const drop = document.getElementById('pad-drop-' + id);
    const info = document.getElementById('pad-file-info-' + id);
    if (drop) drop.style.display = 'block';
    if (info) info.style.display = 'none';

    // Retoma pad padrão se estiver tocando
    const metro = metronomes.find(m => m.id === id);
    if (metro && metro.isPlaying && ps.enabled) startPad(id);
}

function updatePadIndicator(id, isPlaying) {
    const sel = document.querySelector(`.pad-note-select[data-pad-id="${id}"]`);
    if (!sel) return;
    if (isPlaying) {
        sel.style.borderColor = '#a78bfa';
        sel.style.boxShadow = '0 0 6px rgba(167,139,250,0.5)';
    } else {
        sel.style.borderColor = '';
        sel.style.boxShadow = '';
    }
}

function togglePadPanel(id) {
    document.querySelectorAll('.pad-panel').forEach(p => {
        if (p.dataset.padId != id) p.classList.remove('pad-panel-open');
    });
    const panel = document.getElementById('pad-panel-' + id);
    if (panel) panel.classList.toggle('pad-panel-open');
}

function setPadNote(id, note) {
    const ps = getPadState(id);
    const wasPlaying = ps.audioEl && !ps.audioEl.paused;

    // Para o atual com fade rápido se estiver tocando
    if (wasPlaying) stopPad(id);

    ps.note = note;
    ps.audioEl = null;      // força recarga do novo arquivo
    ps.gainNode = null;
    ps.sourceConnected = false;

    loadPadAudio(id);

    // Retoma se estava tocando
    const metro = metronomes.find(m => m.id === id);
    if (wasPlaying && metro && metro.isPlaying && ps.enabled) {
        startPad(id);
    }

    // Persiste a mudança de tom
    saveLastConfig();
}

function togglePadEnabled(id) {
    const ps = getPadState(id);
    setPadEnabled(id, !ps.enabled);
}

function setPadEnabled(id, enabled) {
    const ps = getPadState(id);
    ps.enabled = enabled;

    const toggleBtn = document.getElementById('pad-toggle-' + id);
    if (toggleBtn) {
        toggleBtn.textContent = enabled ? '🟣 ON' : '⚫ OFF';
        toggleBtn.className = 'pad-toggle-btn' + (enabled ? ' pad-toggle-on' : '');
    }

    const metro = metronomes.find(m => m.id === id);
    if (metro && metro.isPlaying) {
        if (enabled) startPad(id);
        else stopPad(id);
    }

    saveLastConfig();
}

function setPadVolume(id, val) {
    const ps = getPadState(id);
    ps.volume = val / 100;
    document.getElementById('pad-vol-val-' + id).textContent = val + '%';
    if (ps.gainNode && audioContext) {
        ps.gainNode.gain.setTargetAtTime(ps.volume, audioContext.currentTime, 0.05);
    }
    if (ps.customGainNode && audioContext) {
        ps.customGainNode.gain.setTargetAtTime(ps.volume, audioContext.currentTime, 0.05);
    }

    saveLastConfig();
}

function buildPadNoteOptions() {
    return PAD_NOTES.map(n =>
        `<option value="${n}">${PAD_NOTE_LABELS[n]}</option>`
    ).join('');
}

function buildPadHTML(id) {
    const ps = getPadState(id);
    const noteOpts = buildPadNoteOptions();

    return `
    <div class="pad-cell">
        <div class="pad-select-row">
            <select class="pad-note-select" data-pad-id="${id}"
                    onchange="setPadNote(${id}, this.value)"
                    title="Tom do pad">
                ${noteOpts}
            </select>
            <button class="pad-toggle-btn${ps.enabled ? ' pad-toggle-on' : ''}"
                    id="pad-toggle-${id}"
                    onclick="togglePadEnabled(${id})"
                    title="Ativar/desativar pad">${ps.enabled ? '🟣 ON' : '⚫ OFF'}</button>
            <button class="pad-panel-btn"
                    onclick="togglePadPanel(${id})"
                    title="Configurações do pad">🔊</button>
        </div>

        <div class="pad-panel" id="pad-panel-${id}" data-pad-id="${id}">
            <div class="pad-panel-inner">

                <div class="pad-panel-toprow">
                    <span class="pad-panel-title">🎹 Pad Contínuo <span class="pad-stereo-badge">⟷ STEREO</span></span>
                    <button class="pad-panel-close" onclick="togglePadPanel(${id})">✕</button>
                </div>

                <div class="pad-section-label">Volume</div>
                <div class="pad-vol-row">
                    <input type="range" min="0" max="100" value="${Math.round(ps.volume * 100)}"
                           oninput="setPadVolume(${id}, this.value)" style="flex:1">
                    <span class="pad-vol-val" id="pad-vol-val-${id}">${Math.round(ps.volume * 100)}%</span>
                </div>

                <div class="pad-section-label" style="margin-top:10px">Arquivo Personalizado</div>
                <div id="pad-drop-${id}" class="pad-drop-zone"
                     onclick="document.getElementById('pad-file-input-${id}').click()"
                     ondragover="event.preventDefault();this.classList.add('pad-drop-hover')"
                     ondragleave="this.classList.remove('pad-drop-hover')"
                     ondrop="event.preventDefault();this.classList.remove('pad-drop-hover');padHandleFile(${id}, event.dataTransfer.files[0])">
                    <input type="file" id="pad-file-input-${id}" accept="audio/*" style="display:none"
                           onchange="padHandleFile(${id}, this.files[0])">
                    🎵 Carregar MP3/WAV próprio
                </div>
                <div id="pad-file-info-${id}" class="pad-file-info" style="display:none">
                    <span class="pad-file-name" id="pad-file-name-${id}">—</span>
                    <button onclick="padRemoveFile(${id})" class="pad-file-remove" title="Remover arquivo">✕</button>
                </div>

            </div>
        </div>
    </div>
    `;
}
// ── FIM PAD ───────────────────────────────────────────────────

// Variável para lembrar último metrônomo usado com espaço
let lastSpacebarMetronome = null;

// Detectar se storage está disponível
const hasClaudeStorage = typeof window.storage !== 'undefined';

// Funções de storage com fallback para localStorage
async function storageSet(key, value, shared = false) {
    if (hasClaudeStorage) {
        try {
            return await window.storage.set(key, value, shared);
        } catch (e) {
            console.log('Erro storage:', e);
            return null;
        }
    } else {
        localStorage.setItem(key, value);
        return { key, value, shared };
    }
}

async function storageGet(key, shared = false) {
    if (hasClaudeStorage) {
        try {
            return await window.storage.get(key, shared);
        } catch (e) {
            return null;
        }
    } else {
        const value = localStorage.getItem(key);
        return value ? { key, value, shared } : null;
    }
}

async function storageDelete(key, shared = false) {
    if (hasClaudeStorage) {
        try {
            return await window.storage.delete(key, shared);
        } catch (e) {
            return null;
        }
    } else {
        localStorage.removeItem(key);
        return { key, deleted: true, shared };
    }
}

async function storageList(prefix, shared = false) {
    if (hasClaudeStorage) {
        try {
            return await window.storage.list(prefix, shared);
        } catch (e) {
            return { keys: [] };
        }
    } else {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
                keys.push(key);
            }
        }
        return { keys };
    }
}

// Inicializar
async function init() {
    try {
        console.log('🚀 Iniciando metrônomo...');
        
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✅ Contexto de áudio criado');
        } catch (e) {
            console.log('❌ Erro ao criar contexto de áudio:', e);
        }

        document.addEventListener('click', function() {
            if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume();
            }
        }, { once: true });

        // Remover controle de volume (agora é fixo)
        // const volumeSlider = document.getElementById('volumeSlider');
        // if (volumeSlider) {
        //     volumeSlider.addEventListener('input', function() {
        //         globalVolume = this.value / 100;
        //     });
        // }

        document.addEventListener('keydown', function(e) {
            if (document.activeElement.tagName === 'INPUT' || 
                document.activeElement.tagName === 'SELECT' ||
                document.activeElement.tagName === 'TEXTAREA') {
                return;
            }

            const key = e.key;
            
            // Espaço para play/pause do metrônomo atual (último tocado ou primeiro)
            if (key === ' ' || key === 'Spacebar') {
                e.preventDefault(); // Prevenir scroll da página
                
                // Verificar se há metrônomo tocando
                const playingMetronome = metronomes.find(m => m.isPlaying);
                
                if (playingMetronome) {
                    // Se há um tocando, pausar e lembrar qual era
                    lastSpacebarMetronome = playingMetronome.id;
                    toggleMetronome(playingMetronome.id);
                } else if (lastSpacebarMetronome) {
                    // Se lembrar do último, tocar ele novamente
                    const lastMetronome = metronomes.find(m => m.id === lastSpacebarMetronome);
                    if (lastMetronome) {
                        toggleMetronome(lastSpacebarMetronome);
                    } else {
                        // Se o último não existe mais, tocar o primeiro
                        lastSpacebarMetronome = metronomes[0].id;
                        toggleMetronome(metronomes[0].id);
                    }
                } else if (metronomes.length > 0) {
                    // Se não lembra de nenhum, tocar o primeiro e lembrar
                    lastSpacebarMetronome = metronomes[0].id;
                    toggleMetronome(metronomes[0].id);
                }
                return;
            }
            
            // Teclas numéricas para metrônomos específicos
            const num = parseInt(key);
            if (num >= 1 && num <= 9) {
                if (metronomes[num - 1]) {
                    toggleMetronome(metronomes[num - 1].id);
                }
            } else if (key === '0' && metronomes[9]) {
                toggleMetronome(metronomes[9].id);
            }
        });

        await loadSavedSetlists();
        await loadSharedSetlists();

        console.log('📦 Carregando última configuração...');
        const lastConfig = await loadLastConfig();
        console.log('lastConfig:', lastConfig);
        
        if (lastConfig && Array.isArray(lastConfig) && lastConfig.length > 0) {
            metronomes = lastConfig;
            nextId = Math.max(...metronomes.map(m => m.id)) + 1;
            console.log('✅ Configuração carregada:', metronomes.length, 'metrônomos');
        } else {
            console.log('➕ Criando metrônomos padrão...');
            addMetronome();
            addMetronome();
            addMetronome();
            console.log('✅ Metrônomos criados:', metronomes.length);
        }
        
        console.log('🎨 Renderizando interface...');
        renderMetronomes();
        renderSetlistManager();
        console.log('✅ Inicialização completa!');
    } catch (error) {
        console.error('💥 ERRO FATAL na inicialização:', error);
        console.error('Stack:', error.stack);
        // Tentar inicializar de forma básica
        try {
            addMetronome();
            addMetronome();
            addMetronome();
            renderMetronomes();
        } catch (e2) {
            console.error('💥 Falha total:', e2);
        }
    }
}

// Função Tap Tempo
function tapTempo() {
    const now = Date.now();
    tapTimes.push(now);
    
    // Limpar tap timeout anterior
    if (tapTimeout) {
        clearTimeout(tapTimeout);
    }
    
    // Resetar após 2 segundos sem tap
    tapTimeout = setTimeout(() => {
        tapTimes = [];
        document.getElementById('tapBpmDisplay').textContent = '--';
    }, 2000);
    
    // Precisa de pelo menos 2 taps para calcular
    if (tapTimes.length >= 2) {
        // Calcular intervalos entre taps
        const intervals = [];
        for (let i = 1; i < tapTimes.length; i++) {
            intervals.push(tapTimes[i] - tapTimes[i - 1]);
        }
        
        // Média dos intervalos
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        
        // Converter para BPM (60000ms = 1 minuto)
        let bpm = Math.round(60000 / avgInterval);
        
        // Limitar entre 40-300
        bpm = Math.max(40, Math.min(300, bpm));
        
        // Mostrar BPM calculado
        document.getElementById('tapBpmDisplay').textContent = bpm;
        
        // Aplicar no metrônomo ativo ou primeiro
        const activeMetronome = metronomes.find(m => m.isPlaying) || metronomes[0];
        if (activeMetronome) {
            updateMetronome(activeMetronome.id, 'bpm', bpm);
        }
    }
    
    // Manter apenas últimos 4 taps
    if (tapTimes.length > 4) {
        tapTimes.shift();
    }
    
    // Feedback visual
    const btn = document.getElementById('tapTempoBtn');
    btn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        btn.style.transform = 'scale(1)';
    }, 100);
}

async function saveLastConfig() {
    try {
        const config = {
            metronomes: metronomes.map(m => {
                const ps = padState[m.id];
                return {
                    id: m.id,
                    name: m.name,
                    bpm: m.bpm,
                    timeSignature: m.timeSignature,
                    beats: m.beats,
                    padNote: ps ? ps.note : 'A',
                    padEnabled: ps ? ps.enabled : false,
                    padVolume: ps ? ps.volume : 0.7
                };
            }),
            globalAccentEnabled: globalAccentEnabled
        };
        await storageSet('last-config', JSON.stringify(config), false);
    } catch (error) {
        console.log('Erro ao salvar:', error);
    }
}

async function loadLastConfig() {
    try {
        const result = await storageGet('last-config', false);
        if (result && result.value) {
            const config = JSON.parse(result.value);
            
            // Suportar formato antigo (array) e novo (objeto)
            if (Array.isArray(config)) {
                return config.map(m => ({
                    ...m,
                    isPlaying: false,
                    currentBeat: 0
                }));
            } else {
                // Formato novo com globalAccentEnabled
                globalAccentEnabled = config.globalAccentEnabled !== undefined ? config.globalAccentEnabled : true;
                
                // Atualizar UI do botão
                const btn = document.getElementById('globalAccentToggle');
                if (btn) {
                    btn.className = globalAccentEnabled ? 'global-accent-toggle enabled' : 'global-accent-toggle disabled';
                    btn.title = globalAccentEnabled ? 'Desabilitar acentuação global' : 'Habilitar acentuação global';
                }
                
                const loadedMetronomes = config.metronomes.map(m => ({
                    ...m,
                    isPlaying: false,
                    currentBeat: 0
                }));
                // Restaurar padState
                config.metronomes.forEach(m => {
                    const ps = getPadState(m.id);
                    ps.note    = m.padNote    !== undefined ? m.padNote    : 'A';
                    ps.enabled = m.padEnabled !== undefined ? m.padEnabled : false;
                    ps.volume  = m.padVolume  !== undefined ? m.padVolume  : 0.7;
                });
                return loadedMetronomes;
            }
        }
    } catch (error) {
        console.log('Sem config anterior');
    }
    return null;
}

async function saveSetlist() {
    const name = prompt('Digite um nome para este setlist:');
    if (!name) return;

    try {
        const setlistData = {
            name: name,
            date: new Date().toISOString(),
            metronomes: metronomes.map(m => {
                const ps = padState[m.id];
                return {
                    id: m.id,
                    name: m.name,
                    bpm: m.bpm,
                    timeSignature: m.timeSignature,
                    beats: m.beats,
                    padNote: ps ? ps.note : 'A',
                    padEnabled: ps ? ps.enabled : false,
                    padVolume: ps ? ps.volume : 0.7
                };
            }),
            globalSettings: {
                channel: globalChannel,
                volume: globalVolume,
                timbre: selectedTimbre,
                accentEnabled: globalAccentEnabled
            }
        };

        const setlistId = 'setlist-' + Date.now();
        await storageSet(setlistId, JSON.stringify(setlistData), false);
        
        alert('Setlist "' + name + '" salvo!');
        await loadSavedSetlists();
        renderSetlistManager();
    } catch (error) {
        alert('Erro: ' + error.message);
    }
}

async function shareSetlist() {
    if (!hasClaudeStorage) {
        alert('⚠️ "Exportar JSON" para compartilhar manualmente.');
        return;
    }
    
    const name = prompt('Nome para compartilhar:');
    if (!name) return;

    try {
        const setlistData = {
            name: name,
            author: prompt('Seu nome (opcional):') || 'Anônimo',
            date: new Date().toISOString(),
            metronomes: metronomes.map(m => ({
                id: m.id,
                name: m.name,
                bpm: m.bpm,
                timeSignature: m.timeSignature,
                beats: m.beats
            })),
            globalSettings: {
                channel: globalChannel,
                volume: globalVolume,
                timbre: selectedTimbre,
                accentEnabled: globalAccentEnabled
            }
        };

        const shareId = 'shared-' + Date.now();
        await storageSet(shareId, JSON.stringify(setlistData), true);
        
        alert('Setlist compartilhado!');
        await loadSharedSetlists();
        renderSetlistManager();
    } catch (error) {
        alert('Erro: ' + error.message);
    }
}

async function loadSavedSetlists() {
    try {
        const result = await storageList('setlist-', false);
        if (result && result.keys) {
            savedSetlists = [];
            for (const key of result.keys) {
                const data = await storageGet(key, false);
                if (data && data.value) {
                    savedSetlists.push({
                        key: key,
                        data: JSON.parse(data.value)
                    });
                }
            }
            savedSetlists.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
        }
    } catch (error) {
        console.log('Erro ao listar setlists:', error);
    }
}

async function loadSharedSetlists() {
    if (!hasClaudeStorage) {
        sharedSetlists = [];
        return;
    }
    
    try {
        const result = await storageList('shared-', true);
        if (result && result.keys) {
            sharedSetlists = [];
            for (const key of result.keys) {
                const data = await storageGet(key, true);
                if (data && data.value) {
                    sharedSetlists.push({
                        key: key,
                        data: JSON.parse(data.value)
                    });
                }
            }
            sharedSetlists.sort((a, b) => new Date(b.data.date) - new Date(a.data.date));
        }
    } catch (error) {
        console.log('Erro setlists compartilhados:', error);
    }
}

async function loadSetlist(key, isShared = false) {
    try {
        const result = await storageGet(key, isShared);
        if (result && result.value) {
            const setlistData = JSON.parse(result.value);
            
            metronomes.forEach(m => {
                if (m.isPlaying) stopMetronome(m.id);
            });
            
            metronomes = setlistData.metronomes.map(m => ({
                ...m,
                isPlaying: false,
                currentBeat: 0
            }));
            nextId = Math.max(...metronomes.map(m => m.id)) + 1;
            
            if (setlistData.globalSettings) {
                globalChannel = setlistData.globalSettings.channel || 'C';
                globalVolume = setlistData.globalSettings.volume || 0.7;
                selectedTimbre = setlistData.globalSettings.timbre || 'click';
                globalAccentEnabled = setlistData.globalSettings.accentEnabled !== undefined ? 
                    setlistData.globalSettings.accentEnabled : true;
                
                // Atualizar botão de acentuação global
                const accentBtn = document.getElementById('globalAccentToggle');
                if (accentBtn) {
                    accentBtn.className = globalAccentEnabled ? 'global-accent-toggle enabled' : 'global-accent-toggle disabled';
                    accentBtn.title = globalAccentEnabled ? 'Desabilitar acentuação global' : 'Habilitar acentuação global';
                }
                
                // Não precisa mais atualizar volumeSlider
                const timbreSelect = document.getElementById('timbreSelect');
                if (timbreSelect) timbreSelect.value = selectedTimbre;
                
                document.querySelectorAll('.channel-btn').forEach(btn => {
                    btn.className = 'channel-btn inactive';
                });
                const activeBtn = Array.from(document.querySelectorAll('.channel-btn'))
                    .find(btn => btn.textContent === globalChannel);
                if (activeBtn) activeBtn.className = 'channel-btn active';
            }
            
            // Restaurar padState de cada metrônomo
            setlistData.metronomes.forEach(m => {
                const id = m.id;
                const ps = getPadState(id);
                ps.note    = m.padNote    !== undefined ? m.padNote    : 'A';
                ps.enabled = m.padEnabled !== undefined ? m.padEnabled : false;
                ps.volume  = m.padVolume  !== undefined ? m.padVolume  : 0.7;
            });

            renderMetronomes();
            alert('Setlist carregado!');
        }
    } catch (error) {
        alert('Erro ao carregar: ' + error.message);
    }
}

async function deleteSetlist(key) {
    if (!confirm('Deletar este setlist?')) return;
    
    try {
        await storageDelete(key, false);
        await loadSavedSetlists();
        renderSetlistManager();
        alert('Setlist deletado!');
    } catch (error) {
        alert('Erro: ' + error.message);
    }
}

function exportSetlist() {
    const setlistData = {
        name: prompt('Nome do setlist:') || 'Meu Setlist',
        date: new Date().toISOString(),
        metronomes: metronomes.map(m => {
            const ps = padState[m.id];
            return {
                name: m.name,
                bpm: m.bpm,
                timeSignature: m.timeSignature,
                beats: m.beats,
                padNote:    ps ? ps.note    : 'A',
                padEnabled: ps ? ps.enabled : false,
                padVolume:  ps ? ps.volume  : 0.7
            };
        }),

        globalSettings: {
            channel: globalChannel,
            volume: globalVolume,
            timbre: selectedTimbre,
            accentEnabled: globalAccentEnabled
        }
    };
    
    const json = JSON.stringify(setlistData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = setlistData.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importSetlist() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const setlistData = JSON.parse(event.target.result);
                
                metronomes.forEach(m => {
                    if (m.isPlaying) stopMetronome(m.id);
                });
                
                metronomes = setlistData.metronomes.map((m, index) => ({
                    id: index + 1,
                    name: m.name,
                    bpm: m.bpm,
                    timeSignature: m.timeSignature,
                    beats: m.beats,
                    isPlaying: false,
                    currentBeat: 0
                }));
                nextId = metronomes.length + 1;

                // Restaura configurações de pad de cada faixa
                setlistData.metronomes.forEach((m, index) => {
                    const id = index + 1;
                    const ps = getPadState(id);
                    ps.note    = m.padNote    !== undefined ? m.padNote    : 'A';
                    ps.enabled = m.padEnabled !== undefined ? m.padEnabled : false;
                    ps.volume  = m.padVolume  !== undefined ? m.padVolume  : 0.7;
                });
                
                if (setlistData.globalSettings) {
                    globalChannel = setlistData.globalSettings.channel || 'C';
                    globalVolume = setlistData.globalSettings.volume || 0.7;
                    selectedTimbre = setlistData.globalSettings.timbre || 'click';
                    globalAccentEnabled = setlistData.globalSettings.accentEnabled !== undefined ? 
                        setlistData.globalSettings.accentEnabled : true;
                    
                    // Atualizar botão de acentuação global
                    const accentBtn = document.getElementById('globalAccentToggle');
                    if (accentBtn) {
                        accentBtn.className = globalAccentEnabled ? 'global-accent-toggle enabled' : 'global-accent-toggle disabled';
                        accentBtn.title = globalAccentEnabled ? 'Desabilitar acentuação global' : 'Habilitar acentuação global';
                    }
                    
                    const timbreSelect = document.getElementById('timbreSelect');
                    if (timbreSelect) timbreSelect.value = selectedTimbre;
                }
                
                renderMetronomes();
                alert('Setlist importado!');
            } catch (error) {
                alert('Erro ao importar: ' + error.message);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function renderSetlistManager() {
    const container = document.getElementById('setlistManager');
    if (!container) return;
    
    let html = '<div class="setlist-section">';
    html += '<h3>💾 Meus Setlists</h3>';
    
    if (savedSetlists.length === 0) {
        html += '<p class="empty-message">Nenhum setlist salvo</p>';
    } else {
        savedSetlists.forEach(setlist => {
            const date = new Date(setlist.data.date).toLocaleDateString('pt-BR');
            html += `
                <div class="setlist-item">
                    <div class="setlist-info">
                        <strong>${setlist.data.name}</strong>
                        <small>${setlist.data.metronomes.length} músicas • ${date}</small>
                    </div>
                    <div class="setlist-actions">
                        <button onclick="loadSetlist('${setlist.key}')" class="btn-load">Carregar</button>
                        <button onclick="deleteSetlist('${setlist.key}')" class="btn-delete">×</button>
                    </div>
                </div>
            `;
        });
    }
    html += '</div>';
    
    html += '<div class="setlist-section">';
    html += '<h3>🌐 Setlists Compartilhados</h3>';
    
    if (!hasClaudeStorage) {
        html += '<p class="empty-message">⚠️ "Exportar/Importar JSON"</p>';
    } else if (sharedSetlists.length === 0) {
        html += '<p class="empty-message">Nenhum compartilhado</p>';
    } else {
        sharedSetlists.slice(0, 10).forEach(setlist => {
            const date = new Date(setlist.data.date).toLocaleDateString('pt-BR');
            html += `
                <div class="setlist-item shared">
                    <div class="setlist-info">
                        <strong>${setlist.data.name}</strong>
                        <small>Por ${setlist.data.author} • ${setlist.data.metronomes.length} músicas • ${date}</small>
                    </div>
                    <div class="setlist-actions">
                        <button onclick="loadSetlist('${setlist.key}', true)" class="btn-load">Carregar</button>
                    </div>
                </div>
            `;
        });
    }
    html += '</div>';
    
    container.innerHTML = html;
}

function setGlobalChannel(channel) {
    globalChannel = channel;
    document.querySelectorAll('.channel-btn').forEach(btn => {
        btn.className = 'channel-btn inactive';
    });
    event.target.className = 'channel-btn active';
    saveLastConfig();
}

function toggleGlobalAccent() {
    globalAccentEnabled = !globalAccentEnabled;
    
    const btn = document.getElementById('globalAccentToggle');
    if (btn) {
        if (globalAccentEnabled) {
            btn.className = 'global-accent-toggle enabled';
            btn.title = 'Desabilitar acentuação.';
        } else {
            btn.className = 'global-accent-toggle disabled';
            btn.title = 'Habilitar acentuação.';
        }
    }
    
    saveLastConfig();
}

function addMetronome() {
    if (metronomes.length >= 10) return;

    metronomes.push({
        id: nextId++,
        name: 'Música ' + (metronomes.length + 1),
        bpm: 120,
        timeSignature: '4/4',
        beats: 4,
        isPlaying: false,
        currentBeat: 0
    });

    renderMetronomes();
    saveLastConfig();
}

function removeMetronome(id) {
    if (metronomes.length <= 1) return;
    stopMetronome(id);
    metronomes = metronomes.filter(m => m.id !== id);
    renderMetronomes();
    saveLastConfig();
}

function updateMetronome(id, field, value) {
    const metronome = metronomes.find(m => m.id === id);
    if (!metronome) return;

    if (field === 'bpm') {
        value = Math.max(40, Math.min(doubleClickActive ? 600 : 300, parseInt(value) || 120));
    }
    if (field === 'timeSignature') {
        const parts = value.split('/');
        metronome.beats = parseInt(parts[0]) || 4;
    }

    metronome[field] = value;

    if (metronome.isPlaying && (field === 'bpm' || field === 'timeSignature')) {
        stopMetronome(id);
        startMetronome(id);
    }

    renderMetronomes();
    saveLastConfig();
}

function toggleMetronome(id) {
    const metronome = metronomes.find(m => m.id === id);
    if (!metronome) return;

    if (metronome.isPlaying) {
        stopMetronome(id);
    } else {
        startMetronome(id);
    }
}

function startMetronome(id) {
    const metronome = metronomes.find(m => m.id === id);
    if (!metronome || metronome.isPlaying) return;

    metronomes.forEach(m => {
        if (m.id !== id && m.isPlaying) {
            stopMetronome(m.id);
        }
    });

    metronome.isPlaying = true;
    metronome.currentBeat = 0;

    const interval = 60000 / metronome.bpm;

    // Iniciar pad contínuo se habilitado
    startPad(id);

    playSound(metronome);
    updateBeatIndicator(id, 0);

    intervals[id] = setInterval(() => {
        metronome.currentBeat = (metronome.currentBeat + 1) % metronome.beats;
        playSound(metronome);
        updateBeatIndicator(id, metronome.currentBeat);
    }, interval);

    renderMetronomes();
}

function stopMetronome(id) {
    const metronome = metronomes.find(m => m.id === id);
    if (!metronome) return;

    if (intervals[id]) {
        clearInterval(intervals[id]);
        delete intervals[id];
    }

    metronome.isPlaying = false;
    metronome.currentBeat = 0;
    updateBeatIndicator(id, -1);

    // Parar pad contínuo
    stopPad(id);

    renderMetronomes();
}

function toggleClickMute() {
    clickMuted = !clickMuted;
    const btn = document.getElementById('clickMuteBtn');
    if (clickMuted) {
        btn.textContent = '🔇 Click';
        btn.classList.add('click-muted');
        btn.title = 'Click mutado — clique para ativar';
    } else {
        btn.textContent = '🔊 Click';
        btn.classList.remove('click-muted');
        btn.title = 'Mutar o click';
    }
}

function toggleDoubleClick() {
    doubleClickActive = !doubleClickActive;
    const btn = document.getElementById('doubleClickBtn');

    metronomes.forEach(m => {
        if (doubleClickActive) {
            // Guarda o BPM original e dobra
            m._originalBpm = m.bpm;
            m.bpm = m._originalBpm * 2; // sem limite — originalBpm já é <= 300
        } else {
            // Restaura o BPM original
            if (m._originalBpm !== undefined) {
                m.bpm = m._originalBpm;
                delete m._originalBpm;
            }
        }
        // Reinicia o intervalo se estiver tocando
        if (m.isPlaying) {
            clearInterval(intervals[m.id]);
            const interval = 60000 / m.bpm;
            intervals[m.id] = setInterval(() => {
                m.currentBeat = (m.currentBeat + 1) % m.beats;
                playSound(m);
                updateBeatIndicator(m.id, m.currentBeat);
            }, interval);
        }
    });

    if (doubleClickActive) {
        btn.classList.add('double-click-active');
        btn.title = 'Double Click ativo — clique para desativar';
    } else {
        btn.classList.remove('double-click-active');
        btn.title = 'Double Click: dobra o BPM de todos os metrônomos';
    }

    renderMetronomes();

    // Atualizar o atributo max dos inputs de BPM conforme o modo
    document.querySelectorAll('.bpm-input').forEach(input => {
        input.max = doubleClickActive ? 600 : 300;
    });
}

function changeTimbre(timbre) {
    selectedTimbre = timbre;
    saveLastConfig();
}

function playSound(metronome) {
    if (!audioContext) return;

    // Usar globalAccentEnabled ao invés de verificar metrônomo individual
    const isFirstBeat = globalAccentEnabled && metronome.currentBeat === 0;

    switch (selectedTimbre) {
        case 'click':
            playClickSound(isFirstBeat);
            break;
        case 'soft':
            playSoftClickSound(isFirstBeat);
            break;
        case 'electronic':
            playElectronicSound(isFirstBeat);
            break;
        case 'multitrack':
            playMultitrackSound(isFirstBeat);
            break;
        case 'warm':
            playWarmToneSound(isFirstBeat);
            break;
        default:
            playClickSound(isFirstBeat);
    }
}

function playClickSound(isFirstBeat) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const pannerNode = audioContext.createStereoPanner();

    oscillator.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(audioContext.destination);

    const frequency = isFirstBeat ? 1200 : 800;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'square';

    setupPanAndVolume(pannerNode, gainNode, isFirstBeat, 0.08, 0.25, 0.18);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.08);
}

function playSoftClickSound(isFirstBeat) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const pannerNode = audioContext.createStereoPanner();
    const filterNode = audioContext.createBiquadFilter();

    oscillator.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(audioContext.destination);

    const frequency = isFirstBeat ? 800 : 600;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';

    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(2000, audioContext.currentTime);
    filterNode.Q.setValueAtTime(0.5, audioContext.currentTime);

    setupPanAndVolume(pannerNode, gainNode, isFirstBeat, 0.12, 0.15, 0.12);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.12);
}

function playElectronicSound(isFirstBeat) {
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const pannerNode = audioContext.createStereoPanner();
    const filterNode = audioContext.createBiquadFilter();

    oscillator1.connect(filterNode);
    oscillator2.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(audioContext.destination);

    if (isFirstBeat) {
        oscillator1.frequency.setValueAtTime(1000, audioContext.currentTime);
        oscillator2.frequency.setValueAtTime(2000, audioContext.currentTime);
    } else {
        oscillator1.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator2.frequency.setValueAtTime(800, audioContext.currentTime);
    }

    oscillator1.type = 'sine';
    oscillator2.type = 'triangle';

    filterNode.type = 'bandpass';
    filterNode.frequency.setValueAtTime(1200, audioContext.currentTime);
    filterNode.Q.setValueAtTime(2, audioContext.currentTime);

    setupPanAndVolume(pannerNode, gainNode, isFirstBeat, 0.1, 0.18, 0.14);

    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.1);
    oscillator2.stop(audioContext.currentTime + 0.1);
}

function playMultitrackSound(isFirstBeat) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const pannerNode = audioContext.createStereoPanner();
    const filterNode = audioContext.createBiquadFilter();

    oscillator.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(audioContext.destination);

    const frequency = isFirstBeat ? 880 : 440;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'triangle';

    filterNode.type = 'highpass';
    filterNode.frequency.setValueAtTime(300, audioContext.currentTime);
    filterNode.Q.setValueAtTime(0.7, audioContext.currentTime);

    setupPanAndVolume(pannerNode, gainNode, isFirstBeat, 0.15, 0.16, 0.13);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
}

function playWarmToneSound(isFirstBeat) {
    const oscillator1 = audioContext.createOscillator();
    const oscillator2 = audioContext.createOscillator();
    const oscillator3 = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const pannerNode = audioContext.createStereoPanner();
    const filterNode = audioContext.createBiquadFilter();

    oscillator1.connect(filterNode);
    oscillator2.connect(filterNode);
    oscillator3.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(audioContext.destination);

    const baseFreq = isFirstBeat ? 440 : 330;
    oscillator1.frequency.setValueAtTime(baseFreq, audioContext.currentTime);
    oscillator2.frequency.setValueAtTime(baseFreq * 1.5, audioContext.currentTime);
    oscillator3.frequency.setValueAtTime(baseFreq * 2, audioContext.currentTime);

    oscillator1.type = 'sine';
    oscillator2.type = 'triangle';
    oscillator3.type = 'sine';

    filterNode.type = 'lowpass';
    filterNode.frequency.setValueAtTime(1500, audioContext.currentTime);
    filterNode.Q.setValueAtTime(1, audioContext.currentTime);

    setupPanAndVolume(pannerNode, gainNode, isFirstBeat, 0.18, 0.14, 0.11);

    oscillator1.start(audioContext.currentTime);
    oscillator2.start(audioContext.currentTime);
    oscillator3.start(audioContext.currentTime);
    oscillator1.stop(audioContext.currentTime + 0.18);
    oscillator2.stop(audioContext.currentTime + 0.18);
    oscillator3.stop(audioContext.currentTime + 0.18);
}

function setupPanAndVolume(pannerNode, gainNode, isFirstBeat, duration, firstVolume = 0.25, secondVolume = 0.18) {
    let panValue = 0;
    if (globalChannel === 'L') panValue = -1;
    if (globalChannel === 'R') panValue = 1;
    pannerNode.pan.setValueAtTime(panValue, audioContext.currentTime);

    const volume = clickMuted ? 0 : (isFirstBeat ? firstVolume : secondVolume) * globalVolume;
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
}

function updateBeatIndicator(id, currentBeat) {
    const indicators = document.querySelectorAll('[data-id="' + id + '"] .beat-dot');
    indicators.forEach((dot, index) => {
        dot.className = 'beat-dot';
        if (index === currentBeat) {
            // Usar globalAccentEnabled para determinar se mostra accent ou active
            dot.className = 'beat-dot ' + ((index === 0 && globalAccentEnabled) ? 'accent' : 'active');
        }
    });
}

function renderMetronomes() {
    const list = document.getElementById('metronomeList');
    if (!list) return;
    
    list.innerHTML = '';

    metronomes.forEach((m, index) => {
        const item = document.createElement('div');
        item.className = 'metronome-item' + (m.isPlaying ? ' playing' : '');
        item.setAttribute('data-id', m.id);

        let beatIndicators = '';
        for (let i = 0; i < m.beats; i++) {
            let dotClass = 'beat-dot';
            if (m.isPlaying && i === m.currentBeat) {
                // Usar globalAccentEnabled para determinar se mostra accent ou active
                dotClass += ((i === 0 && globalAccentEnabled) ? ' accent' : ' active');
            }
            beatIndicators += '<div class="' + dotClass + '"></div>';
        }

        item.innerHTML = `
            <div class="item-number">${index + 1}</div>
            <div class="name-row">
                <input type="text" class="music-input" placeholder="Nome da música..." 
                       value="${m.name}" onchange="updateMetronome(${m.id}, 'name', this.value)">
                <div class="bmp-container">
                    <input type="number" class="bpm-input" min="40" max="300" 
                           value="${m.bpm}" onchange="updateMetronome(${m.id}, 'bpm', this.value)">
                    <span class="bpm-label">BPM</span>
                </div>
            </div>
            <div class="controls-row">
                <button class="play-btn ${m.isPlaying ? 'pause' : 'play'}" 
                        onclick="toggleMetronome(${m.id})">
                    ${m.isPlaying ? '⏸' : '▶'}
                </button>
                ${buildPadHTML(m.id)}
                <select class="time-select" onchange="updateMetronome(${m.id}, 'timeSignature', this.value)">
                    <option value="2/4" ${m.timeSignature === '2/4' ? 'selected' : ''}>2/4</option>
                    <option value="3/4" ${m.timeSignature === '3/4' ? 'selected' : ''}>3/4</option>
                    <option value="4/4" ${m.timeSignature === '4/4' ? 'selected' : ''}>4/4</option>
                    <option value="5/4" ${m.timeSignature === '5/4' ? 'selected' : ''}>5/4</option>
                    <option value="6/8" ${m.timeSignature === '6/8' ? 'selected' : ''}>6/8</option>
                    <option value="7/8" ${m.timeSignature === '7/8' ? 'selected' : ''}>7/8</option>
                    <option value="9/8" ${m.timeSignature === '9/8' ? 'selected' : ''}>9/8</option>
                    <option value="12/8" ${m.timeSignature === '12/8' ? 'selected' : ''}>12/8</option>
                </select>
                <div class="beat-indicators">
                    ${beatIndicators}
                </div>
            </div>
            <div class="remove-cell">
                ${metronomes.length > 1 ? 
                    `<button class="remove-btn" onclick="removeMetronome(${m.id})">×</button>` : ''
                }
            </div>
        `;

        list.appendChild(item);

        // Restaurar valor selecionado do pad note select
        const padSel = item.querySelector('.pad-note-select');
        if (padSel) {
            const ps = getPadState(m.id);
            padSel.value = ps.note;
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
