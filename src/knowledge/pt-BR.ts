import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-file-format',
    group: 'O básico',
    title: 'O que é realmente um formato de arquivo',
    summary: 'O nome no fim de um arquivo, e o que de fato existe dentro dele.',
    body: `Um formato de arquivo é um jeito combinado de organizar informações para que um programa saiba lê-las de volta. Uma foto JPEG, uma gravação WAV e um documento do Word são apenas longas fileiras de bytes; o formato é o conjunto de regras que diz o que cada byte significa.

## A extensão é só uma etiqueta

As letras depois do ponto no nome de um arquivo, como .jpg ou .mp3, são a extensão. Seu dispositivo as usa para adivinhar qual programa deve abrir o arquivo. Mas a extensão é só uma etiqueta do lado de fora. O formato real é definido pela forma como o conteúdo está organizado.

É por isso que renomear um arquivo não o converte. Mude foto.png para foto.jpg e você continua tendo um PNG, só que com um nome enganoso. Alguns programas vão abri-lo mesmo assim, porque olham o conteúdo, e outros vão recusá-lo. Converter significa ler o arquivo de verdade e escrever as informações de novo com outra organização.

## Contêineres e o que vai dentro deles

Vídeo e áudio acrescentam uma segunda camada. Um arquivo de vídeo como MP4 ou MOV é um **contêiner**: uma caixa que guarda uma trilha de imagem, uma trilha de som e algumas informações de tempo. A imagem e o som lá dentro são gravados com um **codec**, um método para comprimi-los, como H.264 para vídeo ou AAC para som.

Assim, dois arquivos podem terminar em .mp4 e conter codecs diferentes, e dois arquivos com extensões diferentes podem conter exatamente o mesmo codec. Quando um vídeo não toca, ou um conversor não o aceita, o motivo costuma ser o contêiner ou o codec, e não o arquivo como um todo.

## Por que existem tantos formatos

Os formatos são criados para tarefas diferentes. Alguns guardam cada detalhe, outros trocam detalhe por um arquivo menor, alguns suportam transparência ou animação, e outros são simplesmente os que um dispositivo ou programa escolheu. Um conversor existe para levar seu conteúdo do formato em que está para o formato de que você precisa.`,
  },
  {
    id: 'why-conversions-lose-things',
    group: 'O básico',
    title: 'Por que algumas conversões perdem qualidade, ou não podem ser feitas',
    summary: 'O que se perde no caminho, e por que nem sempre volta.',
    body: `Converter um arquivo não é como passar água de um copo para outro. Cada formato consegue guardar algumas coisas e outras não, e uma conversão só pode levar o que os dois formatos entendem.

## Formatos com perdas descartam detalhes

Formatos como JPEG, WebP, MP3, AAC e vídeo H.264 deixam os arquivos menores descartando detalhes que você dificilmente notaria. Cada vez que um arquivo é gravado em um desses formatos, um pouco mais se perde. Converter entre dois formatos com perdas, ou salvar de novo no mesmo, custa um pouco de qualidade a cada vez.

E isso não tem volta. Converter um MP3 para um formato sem perdas como WAV ou FLAC gera um arquivo bem maior, mas não traz de volta o que o MP3 já descartou. Só preserva o que restou.

## Recursos que faltam

Às vezes o formato de destino simplesmente não tem lugar para algo que o original tinha:

- **Transparência.** JPEG não consegue guardar áreas transparentes, então elas são preenchidas de branco.
- **Animação.** PNG, JPEG, WebP e AVIF são gravados aqui como imagens estáticas, então um GIF animado convertido para um deles mantém só o primeiro quadro.
- **Cores.** Um GIF comporta no máximo 256 cores por quadro, então fotos e degradês suaves ficam mais grosseiros.
- **Som.** Um GIF não tem trilha de som, então um vídeo transformado em GIF fica mudo.
- **Diagramação.** Um documento convertido para PDF é diagramado de novo a partir do conteúdo. Fontes, colunas, cabeçalhos e rodapés, caixas de texto e formas flutuantes não são mantidos.

O Universal Converter avisa sobre essas perdas na linha do arquivo ou no painel, em vez de deixar você descobrir depois.

## Conversões que não podem ser feitas

Alguns arquivos não podem ser convertidos aqui de jeito nenhum, geralmente porque lê-los exigiria um programa muito diferente. Alguns exemplos: vídeos MKV, AVI e WMV, cujos contêineres este app não consegue abrir; arquivos do Excel e do PowerPoint; e PDFs, que este app apenas cria. Em cada caso, o arquivo é recusado com uma frase explicando o motivo e, quando existe, o que fazer em vez disso.`,
  },
  {
    id: 'what-universal-converter-can-do',
    group: 'Como funciona',
    title: 'O que o Universal Converter pode converter',
    summary: 'As abas, os formatos que aceitam e o que produzem.',
    body: `O Universal Converter tem cinco abas. **All** (tudo) aceita qualquer coisa e coloca cada arquivo na aba certa para você. As outras quatro cuidam, cada uma, de um tipo de arquivo.

## Audio (áudio)

- **Entrada:** WAV, MP3, M4A e AAC, FLAC, OGG, Opus, AIFF e áudio WebM.
- **Saída:** MP3, M4A, Opus, FLAC, WAV e AIFF. M4A e Opus dependem do suporte do seu navegador.
- Você pode cortar, mudar a taxa de amostragem, converter para mono e equalizar o volume. Informações como título e artista podem ser copiadas para arquivos MP3 e Opus.
- Solte um vídeo aqui para ficar só com o som.

## Images (imagens)

- **Entrada:** PNG, JPEG, HEIC e HEIF do iPhone, WebP, GIF, BMP, AVIF e SVG.
- **Saída:** WebP, JPEG, PNG, AVIF quando o navegador consegue gravá-lo, e GIF.
- Você pode redimensionar e ajustar a qualidade. Cada linha mostra uma estimativa do novo tamanho antes de converter. Um GIF animado convertido para GIF continua animado.

## Video (vídeo)

- **Entrada:** MP4, M4V e MOV.
- **Saída:** MP4 com vídeo H.264 e som AAC, ou um GIF animado.
- Você pode cortar, redimensionar e ajustar a qualidade. Os cortes começam no quadro-chave mais próximo, uma imagem completa da qual dependem os quadros ao redor, então um corte pode começar um pouco antes do ponto escolhido.
- A saída em MP4 exige um navegador com codificador de vídeo H.264 embutido, como Chrome, Edge ou Safari 16.4 ou posterior.

## Files (documentos)

- **Entrada:** DOCX, DOC, ODT, RTF, TXT, Markdown, HTML, CSV e JSON.
- **Saída:** PDF, texto simples, HTML e Markdown. CSV e JSON só aparecem quando o arquivo já tem linhas e colunas, como um arquivo CSV ou JSON.

## Outras exportações

Algumas tarefas transformam um tipo de arquivo em outro, e cada uma diz o que sacrifica antes de começar:

- **Save as one PDF.** Cada imagem da fila vira uma página. A transparência é preenchida de branco e não há texto selecionável.
- **Save the sound only.** Tira a trilha de som de um vídeo, em MP3, M4A ou WAV.
- **Join into one PDF.** Todos os documentos da fila em um só arquivo, cada um começando em uma nova página.`,
  },
  {
    id: 'converting-documents',
    group: 'Como funciona',
    title: 'Converter documentos',
    summary: 'O que é mantido do Word e de outros arquivos, e o que não é.',
    body: `A aba Files lê um documento, descobre sua estrutura e depois escreve essa estrutura de novo no formato que você escolher. Ela não tira uma foto de cada página. Por isso o resultado tem texto de verdade, selecionável, mas também por isso não fica exatamente igual ao original.

## O que é mantido

De um documento do Word (DOCX), o conversor mantém:

- títulos e parágrafos
- listas com marcadores e numeradas, inclusive aninhadas
- tabelas
- texto em negrito, itálico e sublinhado
- links
- imagens inseridas no texto
- quebras de página que você mesmo adicionou

Arquivos OpenDocument (ODT) e RTF são mantidos de forma parecida.

## O que não é mantido

- **A aparência exata da página.** O documento é diagramado de novo, então fontes, colunas e espaçamentos mudam.
- **Cabeçalhos, rodapés, notas de rodapé e comentários.** Ficam de fora, assim como gráficos, caixas de texto e tudo o que estiver posicionado livremente na página. Se o arquivo tinha isso, a linha avisa.
- **Arquivos antigos do Word (DOC).** Só o texto é levado, sem formatação. Texto excluído com o controle de alterações ativado ainda pode aparecer, porque o formato antigo o guarda junto com o resto.

## Letras de outros alfabetos

Os PDFs são criados com fontes padrão que todo leitor de PDF já tem. Elas cobrem os alfabetos latinos. Para grego, cirílico e hebraico, o app baixa uma fonte extra na primeira vez que um documento precisa dela e a guarda para as próximas vezes. Chinês, japonês, coreano e árabe ainda não podem ser escritos. Os caracteres que não puderam ser escritos aparecem listados na linha, para você saber exatamente o que está faltando.

## Algumas dicas

- Para uma planilha, salve-a primeiro como CSV e converta esse arquivo.
- Para uma apresentação, exporte-a para PDF no programa que a criou.
- Para editar, dividir ou assinar um PDF, use o Universal PDF. Este app cria PDFs, mas não os lê.
- Coloque vários documentos na fila e use **Join into one PDF** para juntá-los em um único arquivo.`,
  },
  {
    id: 'converting-folders',
    group: 'Como funciona',
    title: 'Converter pastas inteiras',
    summary: 'Solte uma pasta e receba de volta um único ZIP, com a mesma estrutura.',
    body: `Você pode entregar uma pasta inteira ao Universal Converter em vez de escolher os arquivos um por um. Tudo o que pode ser convertido é convertido, e os resultados voltam com a mesma estrutura de pastas do começo.

## Como adicionar uma pasta

1. Arraste a pasta até o círculo. No computador, você também pode usar **or choose a folder** (ou escolher uma pasta), embaixo do círculo. Os celulares só permitem escolher arquivos avulsos, então essa opção não aparece neles.
2. O app olha dentro da pasta e de todas as subpastas, e coloca cada arquivo na aba certa: imagens, áudio, vídeo ou documentos.
3. Escolha as configurações em cada aba e converta como de costume.

## O que acontece com os arquivos que ele não consegue converter

Uma pasta é entendida como "converta o que der aqui dentro". Arquivos que não são uma imagem, um som, um vídeo ou um documento que o app consiga ler são ignorados. Você vê quantos foram ignorados, em vez de uma longa lista de nomes. Eles simplesmente ficam fora do resultado; nada acontece com os originais.

## Recebendo os resultados

Quando você baixa vários arquivos convertidos juntos, eles vêm em um único arquivo ZIP:

- Cada arquivo convertido fica no mesmo lugar da árvore de pastas que o original. Por exemplo, Férias/Dia 1/IMG_0001.heic volta como Férias/Dia 1/IMG_0001.jpg se você converteu para JPEG.
- Se tudo veio de uma única pasta, o ZIP leva o nome dela.
- Se dois arquivos acabassem com o mesmo nome, por exemplo foto.png e foto.heic virando foto.jpg, o segundo é numerado, como foto (2).jpg, para que um não substitua o outro.
- Se uma pasta tinha vários tipos de arquivo, os resultados ficam espalhados por várias abas. Aí um botão permite baixar tudo, de todas as abas, em um único ZIP.

O ZIP apenas junta os arquivos. Ele não os comprime mais, já que a maioria dos arquivos convertidos já está comprimida.`,
  },
  {
    id: 'your-files-stay-on-your-device',
    group: 'Privacidade e segurança',
    title: 'Seus arquivos ficam no seu dispositivo',
    summary: 'O que é enviado a um servidor, e o que nunca é.',
    body: `O Universal Converter faz todas as conversões no seu próprio dispositivo. Seus arquivos nunca são enviados para serem convertidos.

## Onde o trabalho acontece

Quando você adiciona um arquivo, o app que roda no seu dispositivo o lê e grava a nova versão. As imagens são convertidas com as ferramentas de imagem do seu navegador. O vídeo usa o decodificador e o codificador de vídeo embutidos no navegador. O som é decodificado pelo navegador e gravado por codificadores que rodam dentro do app. Os documentos são lidos e diagramados pelo próprio app. Abrir um arquivo HTML aqui não executa nenhum script que ele contenha.

Os resultados são salvos direto no seu dispositivo. Seus arquivos ficam na memória apenas enquanto o app está aberto, não são armazenados pelo app e somem quando você o fecha. Como nada é enviado, não há limite de tamanho nem cota diária, só a memória do seu dispositivo.

## O que o app baixa

Algumas partes do app são grandes e só são usadas de vez em quando, então são baixadas do nosso próprio site na primeira vez que você precisa delas e guardadas para a próxima: o codificador FLAC, o decodificador de fotos HEIC do iPhone e a fonte extra para documentos em grego, cirílico e hebraico. São downloads de código do programa. Nada dos seus arquivos é enviado para obtê-los.

## O que o app envia

- **Entrar na conta**, se você quiser. Nada no app exige uma conta.
- **Um aviso de "app aberto"** quando você está conectado, para que a atividade do seu Universal ID fique correta. Ele não diz nada sobre seus arquivos.
- **Um sinal de "app em uso"** a cada 45 segundos enquanto o app está aberto e na tela. Ele contém o nome do app, um identificador aleatório criado no seu dispositivo e a sua conta, se você estiver conectado. Serve para mostrar quantas pessoas usam o app.
- **A verificação de atualizações** e a busca da lista de novidades.

Não há publicidade nem rastreamento de terceiros.

## Confira você mesmo

Desligue a internet e converta alguma coisa. Continua funcionando, exceto pelas partes ocasionais citadas acima que você ainda não usou. O app também é de código aberto, então qualquer pessoa pode ler exatamente o que ele faz.`,
  },
]

export default articles
