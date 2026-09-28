# URBANA

FPS tático realista em primeira pessoa feito com **three.js** (WebGL puro, zero build step), rodando direto no navegador. Mapa urbano de fim de tarde, armas icônicas com texturas procedurais no padrão CS:GO, IA humanoide com máquina de estados e áudio 100% sintetizado em tempo real.

## Como jogar

```bash
node server.js
# abra http://127.0.0.1:8137
```

Clique em **INICIAR MISSÃO** (ou pressione `ENTER`) para capturar o mouse. Sobreviva às ondas de hostis.

> Privacidade total: o servidor escuta apenas em `127.0.0.1`, nenhum dado do jogador é coletado, armazenado ou transmitido.

## Mira e Sensibilidade (padrão CS:GO)

O movimento da câmera reproduz exatamente a matemática do Counter-Strike: os counts brutos do mouse são convertidos em graus com `m_yaw`/`m_pitch` de **0,022°/count** (idêntico ao CS:GO), sem aceleração — a Pointer Lock API entrega deltas já crus (*raw input*). O padrão de fábrica é:

| Parâmetro | Valor | Equivalente |
|---|---|---|
| Sensibilidade no jogo | **1.0** | com mouse 800 DPI = **800 eDPI**, o "ponto de equilíbrio" do cenário profissional (ideal para controlar o recoil da AK-47) |
| m_yaw / m_pitch | 0,022°/count | idêntico ao CS:GO (360° = ~41,4 cm @ 800 DPI) |
| Raw input | Ativado | Pointer Lock entrega deltas brutos, ignorando aceleração do SO |
| Ajuste em jogo | `[` / `]` | ±0,05 (0,05 a 10) — exibido no HUD |

> Para calcular: `sens desejada = 800 / (DPI do seu mouse)` mantém a mesma distância física de giro (800 eDPI).

### Zoom 1:1 realista — `zoom_sensitivity_ratio_mouse 0.818933`

No CS:GO o zoom padrão reduz a sensibilidade focando nas bordas de uma tela 4:3 antiga, o que desalinha flicks curtos no centro da tela. O valor **0,818933** é o coeficiente matemático que iguala a distância focal do primeiro zoom da AWP/Scout ao hip-fire — com ele, arrastar o mouse percorre **exatamente o mesmo arco angular** com e sem zoom, mantendo a memória muscular 100% linear entre qualquer arma.

Neste projeto o fator equivalente é aplicado automaticamente ao mirar (ADS), interpolado suavemente conforme o zoom entra:

```
fator ADS = 0.818933 × (adsFov da arma / fov base 72°)
```

| Arma | adsFov | Fator em ADS | Sens efetiva (sens 1.0) |
|---|---|---|---|
| AK-47 | 58° | 0,818933 × 58/72 ≈ 0,660 | ~0,66 |
| Desert Eagle | 62° | 0,818933 × 62/72 ≈ 0,705 | ~0,70 |
| Sniper (luneta) | 16° | 0,818933 × 16/72 ≈ 0,182 | ~0,18 |

Resultado: um flick para a cabeça percorre o mesmo ângulo no mouse de hip-fire **ou** luneta — flicks iguais, mira igual, spray controlável.

## Operadores e escudo

Antes de entrar em combate você escolhe o operador numa vitrine 3D (o mesmo boneco realista do jogo, girando sob luz de estúdio):

| Operador | Escudo | Perk |
|---|---|---|
| 🛡️ **BOPE** | 50 | +15 de vida — linha de frente |
| 🎭 **FACÇÃO** | 25 | +10% velocidade — agilidade urbana |
| 🎯 **FORÇA DELTA** | 35 | recuo −28% — mira firme |

O **escudo** absorve o dano antes da vida (barra ciano no HUD) e as placas se recarregam entre ondas. O painel **`Q`** mostra o loadout completo com munição e escudo em tempo real.

## Multiplayer co-op (experimental)

Ao escolher o operador você entra automaticamente na **sala co-op**: operadores reais aparecem no mapa como bonecos articulados com nameplate, andam/atiram/falam com você (chat em `T`), e o chip **ONLINE** no topo conta a população da sala. O placar (`TAB`) lista todos os operadores conectados.

- **WebSocket puro (RFC 6455) no mesmo servidor** — zero dependências novas; estados propagados a 12,5 Hz com interpolação suave no cliente
- **Não é P2P**: todo o tráfego passa pelo servidor da partida (o host vê os IPs)

### Jogar pela internet (amigos fora da sua rede)

```bash
URBANA_HOST=0.0.0.0 node server.js   # libera na rede — proteja com firewall/túnel
```

Para a internet pública, recomendado: tunnel SSH (`ssh -R`) ou um VPS + reverse proxy com TLS (`wss://`). O CSP do jogo já permite WebSocket somente para a própria origem.

## Controles

| Tecla | Ação |
|---|---|
| `W A S D` | Mover |
| Mouse | Mirar |
| Botão direito | Mira de precisão (ADS) |
| `SHIFT` | Correr |
| `CTRL` / `C` | Agachar |
| `ESPAÇO` | Pular |
| `R` | Recarregar |
| `1` | AK-47 (principal, automática) |
| `2` | Desert Eagle .50 (semi, com silenciador) |
| `4` | MP5-SD (submetralhadora suprimida, 800 RPM) |
| `5` | Pump 12 (escopeta, 8 projéteis por disparo) |
| `Q` | Painel de loadout (armas, munição e escudo ao vivo) |
| `T` | Chat do co-op |
| `3` | Sniper de precisão (bolt-action, luneta) |
| `G` / `6` | Granada de fragmentação |
| `X` | Remover / instalar o supressor da Desert Eagle (animação em tempo real) |
| `TAB` | Placar da missão (segurar) |
| `[` / `]` | Sensibilidade do mouse − / + (±0,05) |
| `V` | Alternar câmera 1ª/3ª pessoa |
| `ENTER` | Confirmar nos menus |
| `ESC` | Pausar |

## Arsenal

| Arma | Calibre | Cadência | Dano | Mag | Particularidades |
|---|---|---|---|---|---|
| **AK-47** | 7.62×39mm | 600 RPM | 34 (×2,8 cabeça) | 30 | Madeira de verdade (veios procedurais), receptor de aço azulado, carregador banana curvo, freio de boca oblíquo, mira holo |
| **DESERT EAGLE** | .50 AE | 240 RPM | 62 (×2,4 cabeça) | 7 | Slide massivo facetado, cano hexagonal, **supressor removível** (tecla `X`: mão desrosqueia o tubo em tempo real; aberto dispara o estampo real do .50 AE, silenciado dispara o "pfft" abafado), miras de ferro alinhadas ao ADS |
| **SNIPER** | .338 Lapua | 45 RPM | 99 (um tiro, um abate) | 5 | Bolt-action animado, luneta grande com objetiva e torreta, **overlay de luneta com retícula mil-dot**, bipé, corpo de polímero verde, spread de 0,0002 rad em ADS |
| **GRANADA** | frag | — | 180 no epicentro | 4 | Corpo com ranhuras de fragmentação, colher e pino, física com quique, **explosão com bola de fogo, onda de choque e dano em área** |

### Áudio realista (síntese procedural)

Cada tiro é composto em 4 camadas para soar como munição real, não "tiro de brinquedo":

1. **Crack** — ruído bandpass agudo curtíssimo (o estouro supersônico)
2. **Punch** — onda senoidal grave que "bate no peito" (120 Hz na AK, 78 Hz no sniper)
3. **Body** — ruído médio ressonante do mecanismo
4. **Tail** — reflexos urbanos com eco decrescente (o sniper tem eco duplo de longa distância)

A Deagle silenciada substitui tudo por um sopro abafado + click metálico do slide. Explosões, recargas (3 estágios), passos, ricochetes, heartbeat e o vento ambiente são igualmente sintetizados — **zero arquivos de áudio**.

## Personagens

Os operadores são humanos articulados (~1,8 m) construídos por uma fábrica de meshes com duas variantes:

- **Policial tático** — uniforme azul-petróleo, capacete balístico com óculos, colete, crachá dourado, luvas táticas e rádio
- **Bandido de capuz** — moletom com capuz sobre a face sombreada, balaclava, camuflado rasgado, correias no peito, pele diferente

Ambos têm ombros esféricos, pescoço, nariz, quadril, mãos e botas separadas — com animação procedural de caminhada (pernas alternadas, braços balançando), braço direito apontando a arma ao atacar e respiração no idle.

## Interface

- **Menu interativo 3D** — keycaps que inclinam seguindo o cursor e **afundam quando você pressiona a tecla real** no teclado, com SFX de interface; câmera orbitando a cidade ao fundo; parallax da logo
- **Kill banner 3D** — "HOSTIL ELIMINADO / TIRO NA CABEÇA" com pop em perspectiva (sem killfeed duplicado)
- **Deathcard 3D** — dossiê K.I.A. com causa da morte, tilt seguindo o mouse, cross médico pulsante, queda de câmera cinematográfica antes do cartão (a arma some da tela)
- **Placar (TAB)** — seus abates × abates dos hostis, onda atual e pontuação
- **Luneta** — overlay circular com retícula mil-dot quando o sniper mira
- HUD tático: minimapa rotativo, bússola, vida/munição, crosshair dinâmico, hitmarkers, vinhetas de dano e vida baixa

## O mundo

- Cidade com **cruzamento central real**: asfalto com agregado/remendos/manchas de óleo, **calçadas elevadas com meio-fio**, faixas tracejadas, laterais contínuas e **4 faixas de pedestre continentais fora do núcleo do cruzamento**
- **4 prédios por andar** com fachadas texturizadas (escorridos de água, montantes, peitoril), **janelas acesas aleatórias via emissiveMap alinhado**, vitrines de loja com interior iluminado, telhados com parapeito, ACs e antenas
- **Carros realistas**: carroceria com capô/porta-malas, para-brisa inclinado, vidros transparentes, para-choques, grade cromada, faróis acesos, lanternas, espelhos, placa, pneus com calotas — posições validadas matematicamente contra todos os colisores (nada atravessa parede)
- Postes com braço curvado e lente emissiva, hidrantes, bancas de jornal, containers nos pátios, sandbags, tambores e paletes como cobertura
- Céu com shader de **pôr do sol** (glow + disco no horizonte), névoa quente, sol baixo dourado com sombras longas

## Segurança (blindagem)

O servidor estático inclui hardening completo:

- **Escuta apenas em `127.0.0.1`** por padrão — inacessível pela rede (até alguém subir com `URBANA_HOST=0.0.0.0`)
- **CSP restritiva**: `script-src 'self'`, sem objetos, sem frames, sem `base-uri`, `form-action 'none'`
- **Anti path-traversal**: resolução canônica + `realpathSync` + prefixo da raiz
- **Allow-list de extensões** e bloqueio de dotfiles (`.git`, `.env`...)
- **Rate limiting** de 240 req/min por IP (handshakes WebSocket incluídos)
- Cabeçalhos `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` bloqueando câmera/microfone/geolocalização
- **`Cache-Control: no-store`** — nenhuma resposta fica em cache compartilhado
- Métodos não-GET/HEAD rejeitados; nenhum dado do jogador sai da máquina

### Anti-cheat da rede (100% no servidor)

O cliente **nunca** é confiado: o servidor valida tudo e expulsa (`kick`) com motivo:

| Trapaça | Defesa |
|---|---|
| Speedhack / teleporte | deslocamento > limite físico em 200 ms é revertido (`snap`); 20 violações = kick |
| Aimbot implausível | pitch travado em ±1,5 rad |
| Rapidfire | cadência mínima por arma (`SHOT_MIN`); violações descartadas, 15 = kick |
| Dano forjado | alegação limitada a 45 por hit, 9 hits/s |
| Flood de mensagens | 55 msgs/s sustentadas; acima disso = kick |
| Mensagem gigante | > 2 KB rejeitada; buffer > 16 KB = kick |
| Nome com XSS/injection | sanitizado (sem `<`, tags, controle) e limitado a 14 chars |
| Cross-site WS hijacking | handshake só em `/ws` com `Origin` = `Host` |
| Conexões em massa | máx. 4 sockets simultâneos por IP |
| Sonho de enxame | salas vivem só na RAM; nada é persistido em disco |

## Arquitetura

```
index.html      — página, HUD, overlays (menu, luneta, placar, deathcard)
logo.svg        — logo 3D (mira red dot com bisel dourado) + favicon
server.js       — servidor estático endurecido (Node puro)
vendor/         — three.js r160
src/
  main.js       — loop, ondas, input, HUD, minimapa, 3ª pessoa, placar, morte
  world.js      — cidade procedural, luzes, texturas, colisores
  physics.js    — raycast segmento↔AABB, cápsula com step-up
  weapons.js    — AK/Deagle/Sniper/granada: viewmodels, recuo, ADS, recarga
  entities.js   — fábrica de operadores + IA (patrulha→alerta→ataque→cobertura)
  fx.js         — tracers, sangue de 3 camadas, decals, explosões, casings
  audio.js      — todos os sons sintetizados na hora
```

Sem dependências externas em runtime. Todo o conteúdo — texturas de madeira e metal, sangue, sons de tiro — é gerado por código na inicialização.
