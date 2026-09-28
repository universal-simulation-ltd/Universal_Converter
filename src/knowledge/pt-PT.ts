import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-file-format',
    group: 'O essencial',
    title: 'O que é realmente um formato de ficheiro',
    summary: 'O nome no fim de um ficheiro, e o que está de facto lá dentro.',
    body: `Um formato de ficheiro é uma forma combinada de organizar informação para que um programa a saiba voltar a ler. Uma fotografia JPEG, uma gravação WAV e um documento do Word são apenas longas filas de bytes; o formato é o conjunto de regras que diz o que significa cada byte.

## A extensão é só uma etiqueta

As letras depois do ponto no nome de um ficheiro, como .jpg ou .mp3, são a extensão. O seu dispositivo usa-as para adivinhar que programa deve abrir o ficheiro. Mas a extensão é só uma etiqueta do lado de fora. O formato real é determinado pela forma como o conteúdo está organizado.

É por isso que mudar o nome de um ficheiro não o converte. Mude fotografia.png para fotografia.jpg e continua a ter um PNG, apenas com um nome enganador. Alguns programas abrem-no na mesma, porque olham para o conteúdo, e outros recusam-no. Converter significa ler realmente o ficheiro e escrever a informação de novo com outra organização.

## Contentores e o que levam dentro

O vídeo e o áudio acrescentam uma segunda camada. Um ficheiro de vídeo como MP4 ou MOV é um **contentor**: uma caixa que guarda uma faixa de imagem, uma faixa de som e alguma informação de tempo. A imagem e o som lá dentro são guardados com um **codec**, um método para os comprimir, como H.264 para vídeo ou AAC para som.

Assim, dois ficheiros podem terminar ambos em .mp4 e conter codecs diferentes, e dois ficheiros com extensões diferentes podem conter exatamente o mesmo codec. Quando um vídeo não reproduz, ou um conversor não o aceita, o motivo é muitas vezes o contentor ou o codec, e não o ficheiro no seu todo.

## Porque é que há tantos formatos

Os formatos são pensados para tarefas diferentes. Uns guardam cada pormenor, outros trocam pormenor por um ficheiro mais pequeno, alguns suportam transparência ou animação, e outros são simplesmente os que um dispositivo ou programa escolheu. Um conversor serve para levar o seu conteúdo do formato em que está para aquele de que precisa.`,
  },
  {
    id: 'why-conversions-lose-things',
    group: 'O essencial',
    title: 'Porque é que algumas conversões perdem qualidade, ou não são possíveis',
    summary: 'O que se perde pelo caminho, e porque nem sempre volta.',
    body: `Converter um ficheiro não é como passar água de um copo para outro. Cada formato consegue guardar algumas coisas e outras não, e uma conversão só pode levar o que ambos os formatos entendem.

## Os formatos com perdas descartam pormenores

Formatos como JPEG, WebP, MP3, AAC e vídeo H.264 tornam os ficheiros mais pequenos descartando pormenores que dificilmente notaria. Sempre que um ficheiro é escrito num destes formatos, perde-se um pouco mais. Converter entre dois formatos com perdas, ou voltar a guardar no mesmo, custa alguma qualidade de cada vez.

E não se pode desfazer. Converter um MP3 para um formato sem perdas como WAV ou FLAC dá-lhe um ficheiro muito maior, mas não recupera o que o MP3 já tinha descartado. Apenas preserva o que resta.

## Funcionalidades em falta

Por vezes, o formato de destino simplesmente não tem lugar para algo que o original tinha:

- **Transparência.** O JPEG não consegue guardar áreas transparentes, por isso são preenchidas a branco.
- **Animação.** PNG, JPEG, WebP e AVIF são escritos aqui como imagens fixas, por isso um GIF animado convertido para um deles mantém apenas a primeira imagem.
- **Cores.** Um GIF comporta no máximo 256 cores por imagem, por isso fotografias e gradientes suaves ficam mais grosseiros.
- **Som.** Um GIF não tem faixa de som, por isso um vídeo transformado em GIF fica mudo.
- **Paginação.** Um documento convertido para PDF é paginado de novo a partir do seu conteúdo. Tipos de letra, colunas, cabeçalhos e rodapés, caixas de texto e formas flutuantes não são mantidos.

O Universal Converter avisa-o destas perdas na linha do ficheiro ou no painel, em vez de o deixar descobri-las mais tarde.

## Conversões que não são possíveis

Alguns ficheiros não podem de todo ser convertidos aqui, normalmente porque lê-los exigiria um programa muito diferente. Alguns exemplos: vídeos MKV, AVI e WMV, cujos contentores esta aplicação não consegue abrir; ficheiros do Excel e do PowerPoint; e PDFs, que esta aplicação apenas escreve. Em cada caso, o ficheiro é recusado com uma frase que explica porquê e, quando existe, o que fazer em alternativa.`,
  },
  {
    id: 'what-universal-converter-can-do',
    group: 'Como funciona',
    title: 'O que o Universal Converter pode converter',
    summary: 'Os separadores, os formatos que aceitam e o que produzem.',
    body: `O Universal Converter tem cinco separadores. **All** (tudo) aceita qualquer coisa e coloca cada ficheiro no separador certo por si. Os outros quatro tratam, cada um, de um tipo de ficheiro.

## Audio (áudio)

- **Entrada:** WAV, MP3, M4A e AAC, FLAC, OGG, Opus, AIFF e áudio WebM.
- **Saída:** MP3, M4A, Opus, FLAC, WAV e AIFF. M4A e Opus dependem de o seu navegador os suportar.
- Pode cortar, alterar a frequência de amostragem, misturar em mono e uniformizar o volume. Dados como o título e o artista podem ser copiados para ficheiros MP3 e Opus.
- Largue aqui um vídeo para ficar só com o som.

## Images (imagens)

- **Entrada:** PNG, JPEG, HEIC e HEIF do iPhone, WebP, GIF, BMP, AVIF e SVG.
- **Saída:** WebP, JPEG, PNG, AVIF quando o navegador o consegue escrever, e GIF.
- Pode redimensionar e ajustar a qualidade. Cada linha mostra uma estimativa do novo tamanho antes de converter. Um GIF animado convertido para GIF continua animado.

## Video (vídeo)

- **Entrada:** MP4, M4V e MOV.
- **Saída:** MP4 com vídeo H.264 e som AAC, ou um GIF animado.
- Pode cortar, redimensionar e ajustar a qualidade. Os cortes começam na imagem-chave mais próxima, uma imagem completa da qual dependem as imagens à volta, por isso um corte pode começar um pouco antes do ponto escolhido.
- A saída em MP4 exige um navegador com codificador de vídeo H.264 integrado, como o Chrome, o Edge ou o Safari 16.4 ou posterior.

## Files (documentos)

- **Entrada:** DOCX, DOC, ODT, RTF, TXT, Markdown, HTML, CSV e JSON.
- **Saída:** PDF, texto simples, HTML e Markdown. CSV e JSON só são propostos quando o ficheiro já tem linhas e colunas, como um ficheiro CSV ou JSON.

## Outras exportações

Algumas tarefas transformam um tipo de ficheiro noutro, e cada uma diz o que sacrifica antes de começar:

- **Save as one PDF.** Cada imagem na fila passa a ser uma página. A transparência é preenchida a branco e não há texto selecionável.
- **Save the sound only.** Retira a faixa de som de um vídeo, em MP3, M4A ou WAV.
- **Join into one PDF.** Todos os documentos da fila num só ficheiro, cada um a começar numa nova página.`,
  },
  {
    id: 'converting-documents',
    group: 'Como funciona',
    title: 'Converter documentos',
    summary: 'O que se mantém do Word e de outros ficheiros, e o que não se mantém.',
    body: `O separador Files lê um documento, identifica a sua estrutura e depois escreve essa estrutura de novo no formato que escolher. Não tira uma fotografia a cada página. É por isso que o resultado tem texto verdadeiro e selecionável, mas também é por isso que não fica exatamente igual ao original.

## O que se mantém

De um documento do Word (DOCX), o conversor mantém:

- títulos e parágrafos
- listas com marcas e numeradas, incluindo as encaixadas
- tabelas
- texto a negrito, itálico e sublinhado
- ligações
- imagens colocadas no texto
- quebras de página que tenha acrescentado

Os ficheiros OpenDocument (ODT) e RTF mantêm-se de forma semelhante.

## O que não se mantém

- **O aspeto exato da página.** O documento é paginado de novo, por isso os tipos de letra, as colunas e os espaçamentos mudam.
- **Cabeçalhos, rodapés, notas de rodapé e comentários.** Ficam de fora, tal como gráficos, caixas de texto e tudo o que esteja posicionado livremente na página. Se o ficheiro os tinha, a linha indica-o.
- **Ficheiros antigos do Word (DOC).** Passa apenas o texto, sem formatação. Texto eliminado com o registo de alterações ativo pode ainda aparecer, porque o formato antigo guarda-o juntamente com o resto.

## Letras de outros alfabetos

Os PDFs são escritos com tipos de letra padrão que qualquer leitor de PDF já tem. Estes abrangem os alfabetos latinos. Para grego, cirílico e hebraico, a aplicação transfere um tipo de letra adicional da primeira vez que um documento precisa dele e guarda-o para a próxima vez. Chinês, japonês, coreano e árabe ainda não podem ser escritos. As letras hebraicas são escritas, mas cada linha é composta da esquerda para a direita, pelo que, por agora, as palavras em hebraico aparecem de trás para a frente no PDF. Os caracteres que não foi possível escrever são indicados na linha, para que saiba exatamente o que falta.

## Algumas dicas

- Para uma folha de cálculo, guarde-a primeiro como CSV e converta esse ficheiro.
- Para uma apresentação, exporte-a para PDF a partir do programa que a criou.
- Para editar, dividir ou assinar um PDF, use o Universal PDF. Esta aplicação escreve PDFs, mas não os lê.
- Coloque vários documentos na fila e use **Join into one PDF** para os juntar num único ficheiro.`,
  },
  {
    id: 'converting-folders',
    group: 'Como funciona',
    title: 'Converter pastas inteiras',
    summary: 'Largue uma pasta e receba-a de volta num único ZIP, com a mesma estrutura.',
    body: `Pode entregar uma pasta inteira ao Universal Converter em vez de escolher os ficheiros um a um. Tudo o que pode ser convertido é convertido, e os resultados voltam com a mesma estrutura de pastas com que começou.

## Como adicionar uma pasta

1. Arraste a pasta para o círculo. Num computador, pode também usar **or choose a folder** (ou escolher uma pasta), por baixo do círculo. Os telemóveis só permitem escolher ficheiros avulsos, por isso essa opção não aparece neles.
2. A aplicação percorre a pasta e todas as subpastas, e coloca cada ficheiro no separador certo: imagens, áudio, vídeo ou documentos.
3. Escolha as definições em cada separador e converta como habitualmente.

## O que acontece aos ficheiros que não consegue converter

Uma pasta é entendida como «converte o que conseguires aqui dentro». Os ficheiros que não sejam uma imagem, um som, um vídeo ou um documento que a aplicação consiga ler são ignorados. Vê quantos foram ignorados, em vez de uma longa lista de nomes. Ficam simplesmente de fora do resultado; nada acontece aos originais.

## Receber os resultados

Quando transfere vários ficheiros convertidos em conjunto, chegam num único ficheiro ZIP:

- Cada ficheiro convertido fica no mesmo sítio da árvore de pastas que o original. Por exemplo, Férias/Dia 1/IMG_0001.heic volta como Férias/Dia 1/IMG_0001.jpg se o converteu para JPEG.
- Se tudo veio de uma única pasta, o ZIP tem o nome dela.
- Se dois ficheiros acabassem com o mesmo nome, por exemplo fotografia.png e fotografia.heic a passarem ambos a fotografia.jpg, o segundo é numerado, como fotografia (2).jpg, para que nenhum substitua o outro.
- Se uma pasta tinha vários tipos de ficheiro, os resultados ficam repartidos por vários separadores. Um botão permite então transferir tudo, de todos os separadores, num único ZIP.

O ZIP limita-se a juntar os ficheiros. Não os comprime mais, uma vez que a maioria dos ficheiros convertidos já está comprimida.`,
  },
  {
    id: 'your-files-stay-on-your-device',
    group: 'Privacidade e segurança',
    title: 'Os seus ficheiros ficam no seu dispositivo',
    summary: 'O que é enviado para um servidor, e o que nunca é.',
    body: `O Universal Converter faz todas as conversões no seu próprio dispositivo. Os seus ficheiros nunca são carregados para serem convertidos.

## Onde o trabalho acontece

Quando adiciona um ficheiro, a aplicação que corre no seu dispositivo lê-o e escreve a nova versão. As imagens são convertidas com as ferramentas de imagem do seu navegador. O vídeo usa o descodificador e o codificador de vídeo integrados no navegador. O som é descodificado pelo navegador e escrito por codificadores que correm dentro da aplicação. Os documentos são lidos e paginados pela própria aplicação. Abrir aqui um ficheiro HTML não executa nenhum dos scripts que contenha.

Os resultados são guardados diretamente no seu dispositivo. Os seus ficheiros ficam em memória apenas enquanto a aplicação está aberta, não são guardados pela aplicação e desaparecem quando a fecha. Como nada é carregado, não há limite de tamanho nem quota diária, apenas a memória do seu dispositivo.

## O que a aplicação transfere

Algumas partes da aplicação são grandes e só são precisas de vez em quando, por isso são transferidas do nosso próprio site da primeira vez que precisa delas e guardadas para a próxima: o codificador FLAC, o descodificador de fotografias HEIC do iPhone e o tipo de letra adicional para documentos em grego, cirílico e hebraico. São transferências de código do programa. Nada dos seus ficheiros é enviado para as obter.

## O que a aplicação envia

- **Iniciar sessão**, se assim o entender. Nada na aplicação exige uma conta.
- **Um aviso de «aplicação aberta»** quando tem sessão iniciada, para que a atividade do seu Universal ID esteja correta. Não diz nada sobre os seus ficheiros.
- **Um sinal de «aplicação em utilização»** a cada 45 segundos enquanto a aplicação está aberta e no ecrã. Contém o nome da aplicação, um identificador aleatório criado no seu dispositivo e a sua conta, se tiver sessão iniciada. Serve para mostrar quantas pessoas usam a aplicação.
- **A procura de atualizações** e a obtenção da lista de novidades.

Não há publicidade nem rastreio por terceiros.

## Confirme por si

Desligue a ligação à internet e converta alguma coisa. Continua a funcionar, exceto as partes ocasionais referidas acima que ainda não tenha usado. A aplicação é também de código aberto, pelo que qualquer pessoa pode ler exatamente o que faz.`,
  },
]

export default articles
