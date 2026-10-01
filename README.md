<p align="center">
  <img src="docs/banner.svg" alt="URBANA, FPS tático" width="100%">
</p>

<p align="center">
  <a href="https://diogokranzz.github.io/URBANA/">▶ JOGAR AGORA NO ENDEREÇO OFICIAL</a>
</p>

FPS tático urbano em português do Brasil, feito com three.js puro e Node.js sem nenhuma dependência externa em tempo de execução. O jogo roda direto no navegador com ondas de IA armada, carros dirigíveis com turbo e fogo no escapamento, multiplayer cooperativo por WebSocket e áudio sintetizado em tempo real, sem nenhum arquivo de som. Também instala no celular como aplicativo, funciona offline depois da primeira visita, tem controles de toque com joystick virtual e um seletor de qualidade gráfica no menu.

<img src="docs/divider.svg" width="100%">

## Visão geral do projeto

URBANA é um jogo de tiro em primeira pessoa ambientado em um cruzamento urbano de madrugada. O jogador escolhe um operador entre três classes, enfrenta ondas crescentes de hostis controlados por IA e pode entrar em qualquer carro da cena para dirigir, atropelar inimigos ou usar o turbo para escapar de uma encurralada. O mapa tem prédios com janelas acesas, vitrines de loja iluminadas, letreiros de neon, postes de luz com cone de luz no ar, fachadas com escadas de incêndio, ar-condicionado e canos, grafite nas paredes, lixeiras, sacos de lixo, paletes, cones, containers, muros perimetrais, faixas de pedestres, asfalto molhado com poças que espelham as luzes e a skyline da cidade ao fundo.

A cena é noturna e cinematográfica: o céu tem estrelas e o brilho alaranjado da cidade no horizonte, a névoa volumétrica azulada separa os planos, as luzes dos postes e dos letreiros se espalham pelo chão molhado e a viatura no cruzamento pisca o giroflex. O clima é ajustado por mapas de ambiente, pós-processamento com bloom, gradação de cor, aberração cromática, vinheta e grão de filme, o que aproxima o jogo do visual de um vídeo de gameplay realista.

Todos os recursos do jogo são gerados por código: as texturas são desenhadas em canvas no carregamento, os sons são sintetizados com WebAudio e os bonecos são construídos por geometria procedural. Não existe download de assets externos, o que mantém o jogo leve, rápido de abrir e fácil de hospedar.

O projeto segue a norma da língua portuguesa do Brasil em toda a interface, nos textos e no código, e não contém nenhum comentário em nenhum arquivo.

<img src="docs/divider.svg" width="100%">

## Como executar

É necessário ter o Node.js 18 ou superior instalado.

1. Abra o terminal na pasta do projeto.
2. Execute o comando: node server.js
3. Abra o endereço: localhost na porta 8137 no navegador, com o protocolo http.

O servidor escuta apenas em 127.0.0.1 por padrão, ou seja, ninguém fora da sua máquina acessa o jogo. Para liberar o acesso na rede local, use a variável de ambiente URBANA_HOST com o valor 0.0.0.0 antes do comando, e em hospedagens de nuvem a porta é lida automaticamente da variável de ambiente PORT, que serviços como Render e Railway definem sozinhos.

A porta padrão é 8137 e o WebSocket do multiplayer responde na rota /ws do mesmo endereço, sem depender de bibliotecas externas. Se o jogo estiver publicado em um site estático e o servidor do multiplayer rodar em outro endereço, basta definir a chave de servidor personalizado no armazenamento local do navegador, com o nome urbana e o sufixo de servidor, apontando para o endereço do servidor.

<img src="docs/divider.svg" width="100%">

## Controles

1. W A S D: mover.
2. Mouse: mirar, botão esquerdo atira e botão direito mira refinada.
3. SHIFT: correr a pé e turbo quando estiver dirigindo.
4. CTRL ou C: agachar.
5. ESPAÇO: pular.
6. R: recarregar a arma.
7. G ou 4: granada.
8. Teclas 1, 2 e 3: trocar entre AK, Deagle e Sniper.
9. Teclas 4 e 5: MP5 e Pump.
10. X: instalar ou remover o supressor da Deagle.
11. Q: painel de loadout.
12. E: entrar ou sair do carro mais próximo.
13. V: câmera em terceira pessoa.
14. TAB: placar.
15. T: chat do multiplayer.
16. ESC: pausar.

No celular o jogo traz controles próprios de toque, descritos na seção seguinte.

<img src="docs/divider.svg" width="100%">

## Controles de toque no celular

Em telas com toque o jogo mostra seus próprios controles: um joystick virtual no canto esquerdo para mover, uma área de olhar na metade direita para girar a câmera e uma fileira de botões com as ações principais, a saber ACELERA, RÉ, TURBO, CARRO, PULAR, RECARGA, GRANADA, CÂMERA e ARSENAL. Tudo funciona ao mesmo tempo, então dá para dirigir, girar a câmera e acionar o turbo com os dois polegares. Dentro do carro o joystick acelera e faz ré, o botão CARRO sai do veículo e o turbo mantém as chamas no escapamento. O modo de toque liga sozinho em aparelhos com tela sensível e some no computador, onde seguem valendo teclado e mouse.

<img src="docs/divider.svg" width="100%">

## Qualidade gráfica

O menu inicial tem um seletor de qualidade com cinco níveis. A baixa desliga sombras, névoa e pós-processamento e usa resolução reduzida, a média traz sombras simples, bloom mais curto e resolução intermediária, e a alta entrega o visual completo com sombras suaves, névoa, bloom de dois raios e resolução máxima, pensada para computadores fortes. A ultra mantém o pacote da alta com razão de pixels no teto e um pouco mais de bloom. A competitivo é o modo de leitura: zera grão, vinheta e aberração cromática, seca o bloom, corta partículas e decais e desliga sombras e névoa para o cenário ficar limpo e o custo cair. A média e a alta também reduzem a quantidade de luzes pontuais acesas na cena, o que alivia a placa de vídeo sem apagar o clima da madrugada. Em celulares e telas pequenas a baixa entra sozinha na primeira visita, e a escolha fica salva no navegador para as próximas partidas.

<img src="docs/divider.svg" width="100%">

## Arma, mira, impactos e acessibilidade

A arma em primeira pessoa não é mais um bloco fixo na câmera. O comportamento vem de quatro camadas que rodam em cima de dados: aproximação da mira, balanço com inércia, recuo com recuperação e colisão com o cenário. Cada arma tem seu próprio perfil no arquivo de dados, com tempo de entrada e saída da mira, curva de aceleração, sensibilidade reduzida, intensidade de balanço, respiração, peso, padrão de recuo e limites de recolhimento. Mira, respiração e recuo param de brigar entre si porque cada camada escreve em uma faixa separada, e nada usa interpolação linear: as curvas de entrada e saída são independentes e suavizadas. Quando uma parede, caixa ou porta aparece na frente, a arma se recolhe, sobe e inclina de forma progressiva, a câmera continua livre e o deslocamento segue sendo permitido.

As miras são sistemas ópticos, não desenhos na tela. A holográfica tem estrutura metálica com parafusos, vidro com transparência, brilho e sujeira discreta, um retículo projetado por dentro da lente que acompanha o ponto de impacto e se ajusta à luz do ambiente, além de paralaxe controlada: quando a arma gira em relação ao olho, o retículo se desloca dentro da lente em vez de ficar colado no vidro. O retículo pisca de leve a cada disparo e a lente some suavemente quando a mira sai do campo de visão. A luneta e o anel da pump usam o mesmo sistema com parâmetros próprios.

O laser é um componente separado: sai do acessório, acompanha a arma, para em qualquer obstáculo, fica mais fraco em metal e vidro, ganha feixe opcional em ambiente com fumaça e some junto com a arma se não estiver equipado. O clarão do disparo tem camada principal, elementos secundários, fumaça, faíscas e uma luz temporária que acende a arma, as luvas e o cenário por alguns milésimos de segundo, com intensidade que pode ser reduzida nas opções.

Os impactos respondem ao material atingido. Concreto, gesso, tijolo, metal, madeira, vidro, plástico, tecido, asfalto e superfície orgânica têm cada um seu decal, sua poeira, suas lascas, seu número de faíscas, seu clarão, sua faixa de áudio e sua penetração. Decais e partículas vêm de reservatórios fixos: nada é criado nem destruído no meio da partida, e cada decal tem limite por área e desaparece com fade em vez de ser apagado de uma vez. O áudio do disparo é em camadas, com estalo, corpo mecânico, cauda externa e uma reverberação por convolução que muda conforme o ambiente. O jogo mede o quanto o jogador está cercado por paredes oito vezes por segundo e troca entre rua, beco, sala e galpão, aplicando também abafamento quando o som precisa atravessar obstáculo.

O HUD ganhou uma área de acessibilidade e ajuste de interface no menu inicial: escala e opacidade do HUD, safe zone para telas curvas e proporções largas, escala da mira, intensidade do tremor, do clarão e do balanço da arma, balanço de passo, visibilidade do laser, escala de sensibilidade e interruptores para mira, bússola, minimapa, indicadores, laser, sangue e efeitos de vida baixa. Tudo é salvo no navegador e pode ser restaurado para o padrão com um clique.

<img src="docs/divider.svg" width="100%">

## O carro, o turbo e o escapamento

Aperte E perto de qualquer carro para assumir a direção. O boneco do jogador senta no banco do motorista, as mãos vão ao volante, que gira de verdade com a direção, e a câmera segue o carro em perseguição com o velocímetro no canto da tela. O carro acelera até cerca de 75 km/h no modo normal, faz ré e colide com postes, hidrantes e muros por toda a área da lataria, não só pelo centro.

Segurando SHIFT com W pressionado o turbo entra em ação: os dois canos do escapamento na traseira cospem chamas com núcleo amarelo e halo laranja em tremulação, o som do motor ganha um assobio de turbina com o estalo da ignição, o campo de visão abre, o velocímetro acende em laranja e o teto de velocidade sobe para cerca de 108 km/h.

<p align="center">
  <img src="docs/gameplay.gif" alt="Carro acelerando com o turbo soltando chamas pelo escapamento" width="100%">
</p>

Atropelar hostis em alta velocidade derruba os inimigos com ragdoll capotando, respingo de sangue, som de impacto na lataria e tremor de câmera, rendendo pontos de abate.

<img src="docs/divider.svg" width="100%">

## Ondas de IA

Os hostis chegam em ondas de dificuldade crescente, todos armados, com pontaria, visão, strafe, recarga, granadas e comportamento de cobertura. A IA desliza lateralmente em paredes, troca o lado do desvio quando fica presa e refaz o destino quando necessário, sem nenhum teleporte. Entre uma onda e outra existe um intervalo curto, o escudo do operador é recarregado e o placar soma bônus de limpeza da onda.

Ao morrer aparece a deathcard K.I.A. com o dossiê da missão e o botão REIMPLANTAR, que devolve o jogador ao combate com vida, escudo e munição restaurados, mantendo a onda atual.

<img src="docs/divider.svg" width="100%">

## Operadores

1. BOPE: colete pesado, cinquenta de escudo extra e postura de choque.
2. FACÇÃO: movimentação ágil e silenciosa, hostis demoram a notar o jogador.
3. FORÇA DELTA: recuo reduzido e mira firme, feita para operação noturna.

A escolha muda a vida máxima, o escudo, a velocidade, o recuo e o material do boneco em terceira pessoa.

<img src="docs/divider.svg" width="100%">

## Multiplayer cooperativo

O servidor Node.js embutido roda uma sala cooperativa por WebSocket puro seguindo a norma RFC 6455, sem dependências. Jogadores remotos aparecem como bonecos completos com placas de nome, interpolação suave e caminhada procedural, os tiros remotos rendem tracers, clarão e áudio com pan espacial, e o chat fica na tecla T.

A antifraude é inteiramente no servidor: limite de velocidade com correção de posição, limite de cadência de tiro por arma, limite de dano alegado, taxa de mensagens com token bucket, sanitização de nomes, teto de conexões por IP e cabeçalhos de segurança como CSP, nosniff e bloqueio de frames. Nada é gravado em disco, as salas vivem apenas na memória.

O progresso da sessão continua vivo na interface durante o combate, e a melhor marca alcançada fica salva no próprio navegador, pronta para ser batida.

<img src="docs/divider.svg" width="100%">

## Arquitetura do código

1. server.js: servidor estático endurecido com rate limit, bloqueio de dotfiles e resolução canônica de caminhos, além da sala multiplayer com antifraude.
2. src/main.js: loop principal, entrada, câmera, HUD, bússola, ondas, granadas, carro com turbo, atropelamento e telas de menu e morte.
3. src/world.js: construção do mapa, céu noturno, névoa, luz do luar com sombras, postes com cone de luz, neon, props de rua, carros e colisores.
4. src/textures.js: fábrica de texturas procedurais em canvas, com asfalto molhado, concreto, tijolo, calçada, metal corrugado, módulos de fachada com janelas, letreiros, grafite e mapas de relevo e rugosidade.
5. src/render.js: pipeline de pós-processamento próprio, com alvo em ponto flutuante, bloom separável, mapeamento ACES, gradação de cor, aberração cromática, vinheta e grão.
6. src/entities.js: fábrica de bonecos operadores, jogador e IA inimiga com ragdoll.
7. src/weapons.js: viewmodel em primeira pessoa, balística, troca de arma, supressor e inspeção, agora ligado aos módulos de configuração e ao controlador de animação.
8. src/config/weapon-data.js: dados de todas as armas, curvas de suavização, perfis de recuo, ópticas, laser e limites do viewmodel.
9. src/config/surfaces.js: tabela dos materiais do cenário com decal, poeira, lascas, faíscas, clarão, áudio e penetração de cada um.
10. src/config/settings.js: presets gráficos, opções do jogador, armazenamento local e aplicação das variáveis de acessibilidade no CSS.
11. src/weapon/layers.js: as quatro camadas procedurais da arma, com mira, balanço, recuo e colisão.
12. src/weapon/anim-controller.js: orquestra as camadas e a linha de eventos da recarga, da troca e da inspeção.
13. src/weapon/attachments.js: mira holográfica, luneta, anel da pump e módulo de laser.
14. src/audio.js: síntese de todos os sons, do estouro das armas ao motor do carro, com reverberação por convolução, abafamento por oclusão e camadas por superfície.
15. src/fx.js: tracers, clarões de disparo, impactos por superfície, sangue, cápsulas ejetadas, fumaça e explosões, tudo com reservatórios de pool.
16. tests/nucleo.test.mjs: testes determinísticos dos dados das armas, das superfícies, dos presets e das camadas procedurais, rodados com node tests/nucleo.test.mjs.
17. src/physics.js: colisão AABB, movimento de cápsula com step up, balística por segmento e identificação do material de cada colisor.
18. src/net.js: cliente de WebSocket com reconexão automática e interpolação de jogadores remotos.
19. index.html: telas, HUD, bússola, velocímetro, painel de acessibilidade e estilos.
20. vendor/three.module.js: biblioteca three.js r160 vendada localmente, mantida intacta por ser código de terceiros.
21. manifest.json: manifesto do aplicativo web com nome, cores e ícones.
22. sw.js: service worker que guarda o jogo em cache para funcionar sem internet.
23. O pequeno script de registro do service worker, que também checa atualizações em segundo plano.

<img src="docs/divider.svg" width="100%">

## Testes

Os sistemas determinísticos do jogo têm uma suíte própria, sem dependências externas, que roda no Node: dados das armas, tabela de superfícies, presets gráficos, opções do jogador, curvas de suavização, camadas de mira, balanço, recuo e colisão, além da linha completa de eventos da recarga. Basta rodar `node tests/nucleo.test.mjs` na raiz do projeto. No momento são 225 verificações, e qualquer regressão nos dados ou nas camadas procedurais aparece antes de subir para o site.

<img src="docs/divider.svg" width="100%">

## Publicação

O jogo está publicado e sempre no ar no GitHub Pages, no endereço https://diogokranzz.github.io/URBANA/ , servido pelo branch de publicação deste repositório.

A publicação é automática: a cada envio para o branch principal, o GitHub Actions valida todos os arquivos JavaScript e republica o site sozinho, sem nenhum passo manual. O site também carrega capa de compartilhamento, título e descrição, então o link aparece bonito e com imagem de preview no WhatsApp, no Discord e em redes sociais.

Nesse cenário estático o modo individual funciona por completo; o multiplayer exige um servidor Node.js ativo, então para manter o multiplayer no ar com salas e chat é preciso uma hospedagem que rode Node, como Render ou Railway. O projeto já está pronto para isso: o comando de start é node server.js, a porta vem da variável de ambiente PORT e o host liberado vem de URBANA_HOST. Localmente, basta rodar node server.js e o multiplayer volta a funcionar na rede da sua máquina.

O pacote publicado também é um aplicativo web progressivo: inclui o manifesto, o service worker e os ícones, então o site publicado pode ser instalado no celular pela opção do navegador e as partidas individuais continuam funcionando sem internet depois da primeira visita.

<img src="docs/divider.svg" width="100%">

## Licença

<p align="center">
  <a href="./LICENSE">
    <img src="docs/license.svg" alt="Licença autoral de Diogo Kranz" width="520">
  </a>
</p>

Projeto feito por Diogo Kranz. Todos os direitos estão reservados ao autor, que é o único detentor do projeto e de tudo que o compõe. É proibido copiar, reproduzir, redistribuir, vender, modificar ou criar obras derivadas, no todo ou em parte, sem autorização prévia e por escrito do autor.

Quem quiser usar qualquer parte deste projeto precisa de permissão expressa de Diogo Kranz, e o texto completo da autorização e das restrições está no arquivo da [licença completa do projeto](./LICENSE).

Todos os direitos reservados a Diogo Kranz.
