

## ✨ Features

- ✅ Múltiplos metrônomos simultâneos (até 10)
- ✅ Controle individual de BPM (40-300)
- ✅ Play/Pause independente por faixa
- ✅ 5 timbres profissionais de click
- ✅ Compasso personalizável (2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 9/8, 12/8)
- ✅ Tap Tempo
- ✅ Controle estéreo L/R/C
- ✅ Salvar e carregar setlists
- ✅ Exportar/Importar setlists em JSON
- ✅ Atalhos de teclado (1-9, 0, Espaço)
- ✅ **Pad Contínuo** com 12 tons (A, A#/Bb, B, C, C#/Db, D, D#/Eb, E, F, F#/Gb, G, G#/Ab)
- ✅ **Mute do Click** — silencia o metrônomo mantendo o pad tocando
- ✅ Upload de pad personalizado (MP3/WAV próprio por faixa)

## 🎹 Pad Contínuo

Cada faixa possui um pad de fundo independente que toca em loop assim que o play é acionado.

### Como funciona

- O seletor de tom fica entre o botão ▶ e o compasso em cada faixa
- Escolha a nota (C, C#/Db, D... B) e ative com o botão **ON/OFF**
- O pad inicia junto com o click e para quando o metrônomo para
- O volume do pad é **independente** do volume do click
- O pad é sempre **stereo** — nunca segue a configuração L/R/C do click

### Arquivo personalizado

Clique em 🔊 para abrir o painel da faixa e carregue seu próprio arquivo de áudio (MP3, WAV, OGG). O arquivo toca em loop no lugar do pad padrão. Clique em ✕ para voltar ao pad padrão.

### Pasta de pads

Os arquivos padrão ficam em `pads/` na raiz do projeto:

```
pads/
├── Pad_-_A.mp3
├── Pad_-_Ab.mp3
├── Pad_-_Bb.mp3
├── Pad_-_B.mp3
├── Pad_-_C.mp3
├── Pad_-_Db.mp3
├── Pad_-_D.mp3
├── Pad_-_Eb.mp3
├── Pad_-_E.mp3
├── Pad_-_F.mp3
├── Pad_-_Gb.mp3
└── Pad_-_G.mp3
```

## 🔇 Mute do Click

O botão **🔊 Click** fica na barra de controles globais, ao lado do Tap Tempo.

- Clique para mutar o click — o pad continua tocando normalmente
- O botão fica roxo pulsando para indicar que o click está silenciado
- Ideal para usar o pad como fundo musical em pregações, palestras ou ensaios sem metrônomo audível
- Clique novamente para reativar o click

## 🚀 Tecnologias

- **HTML5 + CSS3 + JavaScript** puro — zero dependências
- **Web Audio API** — síntese e roteamento de áudio em tempo real
- **localStorage** — persistência de setlists e configurações
