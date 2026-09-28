import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-file-format',
    group: 'Le basi',
    title: 'Che cos’è davvero un formato di file',
    summary: 'Il nome alla fine di un file, e che cosa c’è davvero dentro.',
    body: `Un formato di file è un modo concordato di organizzare le informazioni perché un programma sappia rileggerle. Una foto JPEG, una registrazione WAV e un documento Word sono solo lunghe file di byte; il formato è l’insieme di regole che dice che cosa significa ogni byte.

## L’estensione è solo un’etichetta

Le lettere dopo il punto nel nome di un file, come .jpg o .mp3, sono l’estensione. Il tuo dispositivo le usa per indovinare quale programma deve aprire il file. Ma l’estensione è solo un’etichetta esterna. Il formato vero dipende da come è organizzato il contenuto.

Ecco perché rinominare un file non lo converte. Se rinomini foto.png in foto.jpg hai ancora un PNG, solo con un nome ingannevole. Alcuni programmi lo apriranno comunque, perché guardano il contenuto, altri lo rifiuteranno. Convertire significa leggere davvero il file e riscriverne le informazioni con un’altra organizzazione.

## I contenitori e ciò che contengono

Video e audio aggiungono un secondo livello. Un file video come MP4 o MOV è un **contenitore**: una scatola che racchiude una traccia d’immagine, una traccia audio e alcune informazioni di temporizzazione. Immagine e suono all’interno sono salvati con un **codec**, un metodo per comprimerli, come H.264 per il video o AAC per l’audio.

Quindi due file possono finire entrambi in .mp4 e contenere codec diversi, e due file con estensioni diverse possono contenere esattamente lo stesso codec. Quando un video non si riproduce, o un convertitore non lo accetta, il motivo è spesso il contenitore o il codec più che il file nel suo insieme.

## Perché esistono così tanti formati

I formati nascono per scopi diversi. Alcuni conservano ogni dettaglio, altri scambiano dettaglio con un file più piccolo, alcuni supportano trasparenza o animazione, altri sono semplicemente quelli scelti da un certo dispositivo o programma. Un convertitore serve a portare i tuoi contenuti dal formato in cui si trovano a quello che ti serve.`,
  },
  {
    id: 'why-conversions-lose-things',
    group: 'Le basi',
    title: 'Perché alcune conversioni perdono qualità, o non si possono fare',
    summary: 'Che cosa si perde lungo la strada, e perché non sempre torna.',
    body: `Convertire un file non è come versare acqua da un bicchiere all’altro. Ogni formato può contenere alcune cose e non altre, e una conversione può trasferire solo ciò che entrambi i formati capiscono.

## I formati con perdita scartano dettagli

Formati come JPEG, WebP, MP3, AAC e il video H.264 rimpiccioliscono i file scartando dettagli che difficilmente noteresti. Ogni volta che un file viene scritto in uno di questi formati, se ne perde un po’ di più. Convertire tra due formati con perdita, o salvare di nuovo nello stesso, costa un po’ di qualità ogni volta.

E non si può tornare indietro. Convertire un MP3 in un formato senza perdita come WAV o FLAC produce un file molto più grande, ma non restituisce ciò che l’MP3 aveva già scartato. Conserva solo quello che resta.

## Funzioni mancanti

A volte il formato di destinazione semplicemente non ha posto per qualcosa che l’originale aveva:

- **Trasparenza.** JPEG non può salvare le aree trasparenti, che vengono quindi riempite di bianco.
- **Animazione.** PNG, JPEG, WebP e AVIF qui vengono scritti come immagini fisse, quindi una GIF animata convertita in uno di questi conserva solo il primo fotogramma.
- **Colori.** Una GIF contiene al massimo 256 colori per fotogramma, quindi foto e sfumature morbide appaiono più grezze.
- **Suono.** Una GIF non ha traccia audio, quindi un video trasformato in GIF è muto.
- **Impaginazione.** Un documento convertito in PDF viene impaginato di nuovo a partire dal suo contenuto. Caratteri, colonne, intestazioni e piè di pagina, caselle di testo e forme mobili non vengono mantenuti.

Universal Converter ti segnala queste perdite sulla riga del file o nel pannello, invece di lasciartele scoprire più tardi.

## Conversioni impossibili

Alcuni file non si possono proprio convertire qui, di solito perché leggerli richiederebbe un programma molto diverso. Qualche esempio: i video MKV, AVI e WMV, i cui contenitori quest’app non sa aprire; i file Excel e PowerPoint; e i PDF, che quest’app sa solo scrivere. In ogni caso il file viene rifiutato con una frase che spiega il perché e, quando esiste, che cosa fare invece.`,
  },
  {
    id: 'what-universal-converter-can-do',
    group: 'Come funziona',
    title: 'Che cosa può convertire Universal Converter',
    summary: 'Le schede, i formati che accettano e ciò che producono.',
    body: `Universal Converter ha cinque schede. **All** (tutto) accetta qualsiasi cosa e mette ogni file nella scheda giusta al posto tuo. Le altre quattro gestiscono ciascuna un tipo di file.

## Audio

- **In entrata:** WAV, MP3, M4A e AAC, FLAC, OGG, Opus, AIFF e audio WebM.
- **In uscita:** MP3, M4A, Opus, FLAC, WAV e AIFF. M4A e Opus dipendono dal supporto del tuo browser.
- Puoi tagliare, cambiare la frequenza di campionamento, passare a mono e uniformare il volume. Dati come titolo e artista possono essere copiati nei file MP3 e Opus.
- Trascina qui un video per averne solo l’audio.

## Images (immagini)

- **In entrata:** PNG, JPEG, HEIC e HEIF dell’iPhone, WebP, GIF, BMP, AVIF e SVG.
- **In uscita:** WebP, JPEG, PNG, AVIF se il tuo browser sa scriverlo, e GIF.
- Puoi ridimensionare e regolare la qualità. Ogni riga mostra una stima della nuova dimensione prima della conversione. Una GIF animata convertita in GIF resta animata.

## Video

- **In entrata:** MP4, M4V e MOV.
- **In uscita:** MP4 con video H.264 e audio AAC, oppure una GIF animata.
- Puoi tagliare, ridimensionare e regolare la qualità. I tagli partono dal fotogramma chiave più vicino, un’immagine completa da cui dipendono i fotogrammi vicini, quindi un taglio può iniziare poco prima del punto scelto.
- L’uscita MP4 richiede un browser con un codificatore video H.264 integrato, come Chrome, Edge o Safari 16.4 o successivi.

## Files (documenti)

- **In entrata:** DOCX, DOC, ODT, RTF, TXT, Markdown, HTML, CSV e JSON.
- **In uscita:** PDF, testo semplice, HTML e Markdown. CSV e JSON sono proposti solo quando il file ha già righe e colonne, come un file CSV o JSON.

## Altre esportazioni

Alcune operazioni trasformano un tipo di file in un altro, e ognuna dice che cosa sacrifica prima di iniziare:

- **Save as one PDF.** Ogni immagine in coda diventa una pagina. La trasparenza viene riempita di bianco e il testo non è selezionabile.
- **Save the sound only.** Estrae la traccia audio da un video, come MP3, M4A o WAV.
- **Join into one PDF.** Tutti i documenti in coda in un unico file, ciascuno a partire da una nuova pagina.`,
  },
  {
    id: 'converting-documents',
    group: 'Come funziona',
    title: 'Convertire documenti',
    summary: 'Che cosa si conserva da Word e da altri file, e che cosa no.',
    body: `La scheda Files legge un documento, ne ricava la struttura e poi riscrive quella struttura nel formato che scegli. Non fotografa ogni pagina. Per questo il risultato ha testo vero e selezionabile, ma anche per questo non ha esattamente lo stesso aspetto dell’originale.

## Che cosa si conserva

Da un documento Word (DOCX), il convertitore mantiene:

- titoli e paragrafi
- elenchi puntati e numerati, anche annidati
- tabelle
- testo in grassetto, corsivo e sottolineato
- link
- immagini inserite nel testo
- interruzioni di pagina aggiunte da te

I file OpenDocument (ODT) e RTF si conservano in modo simile.

## Che cosa no

- **L’aspetto esatto della pagina.** Il documento viene impaginato di nuovo, quindi caratteri, colonne e spaziature cambiano.
- **Intestazioni, piè di pagina, note e commenti.** Vengono tralasciati, così come grafici, caselle di testo e tutto ciò che è posizionato liberamente sulla pagina. Se il file li conteneva, la riga lo segnala.
- **I vecchi file Word (DOC).** Passa solo il testo, senza formattazione. Il testo eliminato con le revisioni attive può ancora comparire, perché il vecchio formato lo conserva insieme al resto.

## Lettere di altri alfabeti

I PDF vengono scritti con caratteri standard che ogni lettore PDF possiede già. Coprono gli alfabeti latini. Per greco, cirillico ed ebraico, l’app scarica un carattere aggiuntivo la prima volta che un documento ne ha bisogno e lo conserva per le volte successive. Cinese, giapponese, coreano e arabo non si possono ancora scrivere. Le lettere ebraiche vengono scritte, ma ogni riga è composta da sinistra a destra, quindi per ora le parole in ebraico nel PDF risultano al contrario. I caratteri che non è stato possibile scrivere sono elencati sulla riga, così sai esattamente che cosa manca.

## Qualche consiglio

- Per un foglio di calcolo, salvalo prima come CSV e converti quello.
- Per una presentazione, esportala in PDF dal programma con cui l’hai creata.
- Per modificare, dividere o firmare un PDF, usa Universal PDF. Quest’app scrive PDF ma non li legge.
- Metti in coda più documenti e usa **Join into one PDF** per unirli in un unico file.`,
  },
  {
    id: 'converting-folders',
    group: 'Come funziona',
    title: 'Convertire cartelle intere',
    summary: 'Trascina una cartella e riaverla in un unico ZIP, con la stessa struttura.',
    body: `Puoi dare a Universal Converter una cartella intera invece di scegliere i file uno alla volta. Tutto ciò che si può convertire viene convertito, e i risultati tornano con la stessa struttura di cartelle di partenza.

## Come aggiungere una cartella

1. Trascina la cartella sul cerchio. Su un computer puoi anche usare **or choose a folder** (oppure scegli una cartella) sotto il cerchio. I telefoni permettono di scegliere solo singoli file, quindi lì questa opzione non compare.
2. L’app esamina la cartella e tutte le sue sottocartelle, e mette ogni file nella scheda giusta: immagini, audio, video o documenti.
3. Scegli le impostazioni in ogni scheda e converti come al solito.

## Che cosa succede ai file che non può convertire

Una cartella viene intesa come «converti quello che puoi qui dentro». I file che non sono un’immagine, un suono, un video o un documento che l’app sa leggere vengono saltati. Vedi quanti sono stati saltati invece di un lungo elenco di nomi. Restano semplicemente fuori dal risultato; agli originali non succede nulla.

## Riavere i risultati

Quando scarichi insieme più file convertiti, arrivano in un unico file ZIP:

- Ogni file convertito si trova nello stesso punto dell’albero di cartelle dell’originale. Per esempio, Vacanze/Giorno 1/IMG_0001.heic torna come Vacanze/Giorno 1/IMG_0001.jpg se l’hai convertito in JPEG.
- Se tutto proveniva da un’unica cartella, lo ZIP ne porta il nome.
- Se due file finissero con lo stesso nome, per esempio foto.png e foto.heic che diventano entrambi foto.jpg, il secondo viene numerato, come foto (2).jpg, così nessuno sovrascrive l’altro.
- Se una cartella conteneva più tipi di file, i suoi risultati sono distribuiti su più schede. Un pulsante ti permette allora di scaricare tutto, da tutte le schede, in un unico ZIP.

Lo ZIP si limita a raccogliere i file. Non li comprime ulteriormente, dato che la maggior parte dei file convertiti è già compressa.`,
  },
  {
    id: 'your-files-stay-on-your-device',
    group: 'Privacy e sicurezza',
    title: 'I tuoi file restano sul tuo dispositivo',
    summary: 'Che cosa viene inviato a un server, e che cosa mai.',
    body: `Universal Converter esegue tutte le conversioni sul tuo dispositivo. I tuoi file non vengono mai caricati per essere convertiti.

## Dove avviene il lavoro

Quando aggiungi un file, l’app in esecuzione sul tuo dispositivo lo legge e scrive la nuova versione. Le immagini vengono convertite con gli strumenti per immagini del tuo browser. Il video usa il decodificatore e il codificatore video integrati nel browser. L’audio viene decodificato dal browser e scritto da codificatori che girano nell’app. I documenti vengono letti e impaginati dall’app stessa. Aprire qui un file HTML non esegue nessuno degli script che contiene.

I risultati vengono salvati direttamente sul tuo dispositivo. I tuoi file restano in memoria solo finché l’app è aperta, l’app non li conserva e spariscono quando la chiudi. Poiché non viene caricato nulla, non c’è un limite di dimensione né una quota giornaliera, solo la memoria del tuo dispositivo.

## Che cosa scarica l’app

Alcune parti dell’app sono grandi e servono solo ogni tanto, quindi vengono scaricate dal nostro sito la prima volta che ti servono e conservate per le volte successive: il codificatore FLAC, il decodificatore per le foto HEIC dell’iPhone e il carattere aggiuntivo per i documenti in greco, cirillico ed ebraico. Sono download di codice del programma. Per ottenerli non viene inviato nulla dei tuoi file.

## Che cosa invia l’app

- **L’accesso**, se scegli di farlo. Niente nell’app richiede un account.
- **Una nota di «app aperta»** quando hai effettuato l’accesso, perché l’attività del tuo Universal ID sia corretta. Non dice nulla dei tuoi file.
- **Un segnale di «app in uso»** ogni 45 secondi mentre l’app è aperta e visibile. Contiene il nome dell’app, un identificativo casuale creato sul tuo dispositivo e il tuo account se hai effettuato l’accesso. Serve a mostrare quante persone usano l’app.
- **Il controllo degli aggiornamenti** e il recupero dell’elenco delle novità.

Non ci sono pubblicità né tracciamento di terze parti.

## Verificalo tu stesso

Disattiva la connessione a internet e converti qualcosa. Funziona lo stesso, tranne le parti occasionali indicate sopra che non hai ancora usato. L’app è anche open source, quindi chiunque può leggere esattamente che cosa fa.`,
  },
]

export default articles
