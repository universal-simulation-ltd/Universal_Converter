import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-file-format',
    group: 'Les bases',
    title: 'Ce qu’est vraiment un format de fichier',
    summary: 'Le nom au bout d’un fichier, et ce qu’il contient réellement.',
    body: `Un format de fichier est une manière convenue d’organiser des informations pour qu’un programme sache les relire. Une photo JPEG, un enregistrement WAV et un document Word ne sont que de longues suites d’octets ; le format est l’ensemble des règles qui disent ce que signifie chaque octet.

## L’extension n’est qu’une étiquette

Les lettres après le point dans le nom d’un fichier, comme .jpg ou .mp3, forment l’extension. Votre appareil s’en sert pour deviner quel programme doit ouvrir le fichier. Mais l’extension n’est qu’une étiquette collée à l’extérieur. Le vrai format dépend de l’organisation du contenu.

C’est pourquoi renommer un fichier ne le convertit pas. Renommez photo.png en photo.jpg et vous avez toujours un PNG, simplement avec un nom trompeur. Certains programmes l’ouvriront quand même, parce qu’ils examinent le contenu, d’autres le refuseront. Convertir, c’est réellement lire le fichier et réécrire ses informations selon une autre organisation.

## Les conteneurs et leur contenu

La vidéo et l’audio ajoutent un second niveau. Un fichier vidéo comme MP4 ou MOV est un **conteneur** : une boîte qui renferme une piste d’image, une piste de son et des informations de minutage. L’image et le son à l’intérieur sont enregistrés avec un **codec**, une méthode de compression, comme H.264 pour la vidéo ou AAC pour le son.

Deux fichiers peuvent donc se terminer tous deux par .mp4 et contenir des codecs différents, et deux fichiers aux extensions différentes peuvent contenir exactement le même codec. Quand une vidéo refuse de se lire, ou qu’un convertisseur ne l’accepte pas, la raison tient souvent au conteneur ou au codec plutôt qu’au fichier dans son ensemble.

## Pourquoi il existe tant de formats

Les formats sont conçus pour des usages différents. Certains conservent tous les détails, d’autres échangent des détails contre un fichier plus léger, certains gèrent la transparence ou l’animation, et d’autres sont simplement ceux qu’un appareil ou un programme a choisis. Un convertisseur sert à faire passer votre contenu du format où il se trouve à celui dont vous avez besoin.`,
  },
  {
    id: 'why-conversions-lose-things',
    group: 'Les bases',
    title: 'Pourquoi certaines conversions perdent en qualité, ou sont impossibles',
    summary: 'Ce qui se perd en route, et pourquoi cela ne revient pas toujours.',
    body: `Convertir un fichier, ce n’est pas verser de l’eau d’un verre dans un autre. Chaque format peut contenir certaines choses et pas d’autres, et une conversion ne peut transmettre que ce que les deux formats comprennent.

## Les formats avec perte suppriment des détails

Des formats comme JPEG, WebP, MP3, AAC et la vidéo H.264 allègent les fichiers en supprimant des détails que vous remarqueriez difficilement. Chaque fois qu’un fichier est écrit dans l’un de ces formats, un peu plus se perd. Convertir d’un format avec perte à un autre, ou réenregistrer dans le même, coûte un peu de qualité à chaque fois.

Et ce n’est pas réversible. Convertir un MP3 dans un format sans perte comme WAV ou FLAC donne un fichier bien plus gros, mais ne restitue pas ce que le MP3 avait déjà supprimé. Cela ne fait que préserver ce qui reste.

## Des fonctions absentes

Parfois, le format cible n’a tout simplement pas de place pour quelque chose que l’original possédait :

- **La transparence.** JPEG ne sait pas enregistrer les zones transparentes, qui sont donc remplies de blanc.
- **L’animation.** PNG, JPEG, WebP et AVIF sont écrits ici comme des images fixes ; un GIF animé converti dans l’un d’eux ne garde que sa première image.
- **Les couleurs.** Un GIF contient au plus 256 couleurs par image, si bien que les photos et les dégradés doux paraissent plus grossiers.
- **Le son.** Un GIF n’a pas de piste sonore ; une vidéo transformée en GIF est donc muette.
- **La mise en page.** Un document converti en PDF est remis en page à partir de son contenu. Les polices, colonnes, en-têtes et pieds de page, zones de texte et formes flottantes ne sont pas conservés.

Universal Converter vous signale ces pertes sur la ligne du fichier ou dans le panneau, plutôt que de vous laisser les découvrir plus tard.

## Les conversions impossibles

Certains fichiers ne peuvent pas du tout être convertis ici, généralement parce que les lire demanderait un programme très différent. Quelques exemples : les vidéos MKV, AVI et WMV, dont les conteneurs ne peuvent pas être ouverts par cette application ; les fichiers Excel et PowerPoint ; et les PDF, que cette application sait seulement écrire. Dans chaque cas, le fichier est refusé avec une phrase qui explique pourquoi et, quand elle existe, la marche à suivre.`,
  },
  {
    id: 'what-universal-converter-can-do',
    group: 'Fonctionnement',
    title: 'Ce que Universal Converter peut convertir',
    summary: 'Les onglets, les formats qu’ils acceptent et ce qu’ils produisent.',
    body: `Universal Converter comporte cinq onglets. **All** (tout) accepte n’importe quoi et range chaque fichier dans le bon onglet à votre place. Les quatre autres traitent chacun un type de fichier.

## Audio

- **Entrée :** WAV, MP3, M4A et AAC, FLAC, OGG, Opus, AIFF et audio WebM.
- **Sortie :** MP3, M4A, Opus, FLAC, WAV et AIFF. M4A et Opus dépendent de la prise en charge par votre navigateur.
- Vous pouvez couper, changer la fréquence d’échantillonnage, passer en mono et égaliser le volume. Les informations comme le titre et l’artiste peuvent être copiées dans les fichiers MP3 et Opus.
- Déposez une vidéo ici pour n’en garder que le son.

## Images

- **Entrée :** PNG, JPEG, HEIC et HEIF d’iPhone, WebP, GIF, BMP, AVIF et SVG.
- **Sortie :** WebP, JPEG, PNG, AVIF si votre navigateur sait l’écrire, et GIF.
- Vous pouvez redimensionner et régler la qualité. Chaque ligne affiche une estimation de la nouvelle taille avant la conversion. Un GIF animé converti en GIF reste animé.

## Vidéo

- **Entrée :** MP4, M4V et MOV.
- **Sortie :** MP4 avec vidéo H.264 et son AAC, ou GIF animé.
- Vous pouvez couper, redimensionner et régler la qualité. Une coupe commence à l’image clé la plus proche, une image complète dont dépendent les images voisines ; elle peut donc débuter un peu avant le point choisi.
- La sortie MP4 exige un navigateur doté d’un encodeur vidéo H.264 intégré, comme Chrome, Edge ou Safari 16.4 ou plus récent.

## Files (documents)

- **Entrée :** DOCX, DOC, ODT, RTF, TXT, Markdown, HTML, CSV et JSON.
- **Sortie :** PDF, texte brut, HTML et Markdown. CSV et JSON ne sont proposés que si le fichier contient déjà des lignes et des colonnes, comme un fichier CSV ou JSON.

## Autres exports

Certaines opérations transforment un type de fichier en un autre, et chacune indique ce qu’elle sacrifie avant de commencer :

- **Save as one PDF.** Chaque image de la file devient une page. La transparence est remplacée par du blanc et le texte n’est pas sélectionnable.
- **Save the sound only.** Extrait la piste sonore d’une vidéo, en MP3, M4A ou WAV.
- **Join into one PDF.** Tous les documents de la file dans un seul fichier, chacun commençant sur une nouvelle page.`,
  },
  {
    id: 'converting-documents',
    group: 'Fonctionnement',
    title: 'Convertir des documents',
    summary: 'Ce qui est conservé depuis Word et d’autres fichiers, et ce qui ne l’est pas.',
    body: `L’onglet Files lit un document, en dégage la structure, puis réécrit cette structure dans le format choisi. Il ne photographie pas chaque page. C’est pourquoi le résultat contient du vrai texte sélectionnable, mais aussi pourquoi il ne ressemble pas exactement à l’original.

## Ce qui est conservé

D’un document Word (DOCX), le convertisseur garde :

- les titres et les paragraphes
- les listes à puces et numérotées, y compris imbriquées
- les tableaux
- le texte en gras, en italique et souligné
- les liens
- les images placées dans le texte
- les sauts de page que vous avez ajoutés vous-même

Les fichiers OpenDocument (ODT) et RTF sont conservés de manière similaire.

## Ce qui ne l’est pas

- **L’aspect exact de la page.** Le document est remis en page, donc les polices, les colonnes et les espacements diffèrent.
- **Les en-têtes, pieds de page, notes de bas de page et commentaires.** Ils sont omis, tout comme les graphiques, les zones de texte et tout ce qui est positionné librement sur la page. Si le fichier en contenait, la ligne l’indique.
- **Les anciens fichiers Word (DOC).** Seul le texte est repris, sans mise en forme. Un texte supprimé avec le suivi des modifications activé peut encore apparaître, car l’ancien format le conserve avec le reste.

## Les lettres d’autres alphabets

Les PDF sont écrits avec des polices standard que tout lecteur PDF possède déjà. Elles couvrent les alphabets latins. Pour le grec, le cyrillique et l’hébreu, l’application télécharge une police supplémentaire la première fois qu’un document en a besoin et la garde pour la suite. Le chinois, le japonais, le coréen et l’arabe ne peuvent pas encore être écrits. Les caractères qui n’ont pas pu être écrits sont indiqués sur la ligne, pour que vous sachiez exactement ce qui manque.

## Quelques conseils

- Pour un tableur, enregistrez-le d’abord en CSV, puis convertissez ce fichier.
- Pour une présentation, exportez-la en PDF depuis le programme qui l’a créée.
- Pour modifier, découper ou signer un PDF, utilisez Universal PDF. Cette application écrit des PDF mais ne les lit pas.
- Placez plusieurs documents dans la file et utilisez **Join into one PDF** pour les réunir en un seul fichier.`,
  },
  {
    id: 'converting-folders',
    group: 'Fonctionnement',
    title: 'Convertir des dossiers entiers',
    summary: 'Déposez un dossier et récupérez-le dans un seul ZIP, avec la même organisation.',
    body: `Vous pouvez confier un dossier entier à Universal Converter au lieu de choisir les fichiers un par un. Tout ce qui peut être converti l’est, et les résultats vous reviennent avec la même arborescence qu’au départ.

## Ajouter un dossier

1. Faites glisser le dossier sur le cercle de dépôt. Sur un ordinateur, vous pouvez aussi utiliser **or choose a folder** (ou choisir un dossier) sous le cercle. Les téléphones ne permettent de choisir que des fichiers isolés, donc cette option n’y apparaît pas.
2. L’application parcourt le dossier et tous ses sous-dossiers, et range chaque fichier dans le bon onglet : images, audio, vidéo ou documents.
3. Choisissez vos réglages dans chaque onglet et convertissez comme d’habitude.

## Les fichiers qui ne peuvent pas être convertis

Un dossier est compris comme « convertir ce qui peut l’être ». Les fichiers qui ne sont ni une image, ni un son, ni une vidéo, ni un document lisible par l’application sont ignorés. Vous voyez combien ont été ignorés plutôt qu’une longue liste de noms. Ils sont simplement exclus du résultat ; les originaux ne subissent rien.

## Récupérer les résultats

Quand vous téléchargez plusieurs fichiers convertis ensemble, ils arrivent dans un seul fichier ZIP :

- Chaque fichier converti se trouve au même endroit de l’arborescence que l’original. Par exemple, Vacances/Jour 1/IMG_0001.heic revient sous la forme Vacances/Jour 1/IMG_0001.jpg si vous avez converti en JPEG.
- Si tout provient d’un seul dossier, le ZIP porte son nom.
- Si deux fichiers devaient porter le même nom, par exemple photo.png et photo.heic devenant tous deux photo.jpg, le second est numéroté, comme photo (2).jpg, pour qu’aucun n’écrase l’autre.
- Si un dossier contenait plusieurs types de fichiers, ses résultats sont répartis sur plusieurs onglets. Un bouton permet alors de tout télécharger, depuis tous les onglets, dans un seul ZIP.

Le ZIP ne fait que regrouper les fichiers. Il ne les compresse pas davantage, puisque la plupart des fichiers convertis le sont déjà.`,
  },
  {
    id: 'your-files-stay-on-your-device',
    group: 'Confidentialité et sécurité',
    title: 'Vos fichiers restent sur votre appareil',
    summary: 'Ce qui est envoyé à un serveur, et ce qui ne l’est jamais.',
    body: `Universal Converter effectue toutes ses conversions sur votre propre appareil. Vos fichiers ne sont jamais envoyés pour être convertis.

## Où se fait le travail

Quand vous ajoutez un fichier, l’application qui tourne sur votre appareil le lit et écrit la nouvelle version. Les images sont converties avec les outils d’image de votre navigateur. La vidéo utilise le décodeur et l’encodeur vidéo intégrés à votre navigateur. Le son est décodé par votre navigateur et écrit par des encodeurs qui tournent dans l’application. Les documents sont lus et mis en page par l’application elle-même. Ouvrir un fichier HTML ici n’exécute aucun des scripts qu’il contient.

Les résultats sont enregistrés directement sur votre appareil. Vos fichiers ne sont gardés en mémoire que pendant que l’application est ouverte, ne sont pas conservés par l’application et disparaissent quand vous la fermez. Comme rien n’est envoyé, il n’y a ni limite de taille ni quota quotidien, seulement la mémoire de votre appareil.

## Ce que l’application télécharge

Quelques éléments de l’application sont volumineux et rarement utiles ; ils sont donc téléchargés depuis notre propre site la première fois que vous en avez besoin, puis conservés pour la suite : l’encodeur FLAC, le décodeur des photos HEIC d’iPhone et la police supplémentaire pour les documents en grec, cyrillique et hébreu. Il s’agit de téléchargements de code. Rien de vos fichiers n’est envoyé pour les obtenir.

## Ce que l’application envoie

- **La connexion**, si vous le souhaitez. Rien dans l’application n’exige de compte.
- **Une note « application ouverte »** lorsque vous êtes connecté, pour que l’activité de votre Universal ID soit exacte. Elle ne dit rien de vos fichiers.
- **Un signal « application en cours d’utilisation »** toutes les 45 secondes tant que l’application est ouverte et affichée. Il contient le nom de l’application, un identifiant aléatoire créé sur votre appareil et votre compte si vous êtes connecté. Il sert à indiquer combien de personnes utilisent l’application.
- **La recherche de mises à jour** et la récupération de la liste des nouveautés.

Il n’y a ni publicité ni suivi par des tiers.

## Vérifiez par vous-même

Coupez votre connexion internet et convertissez un fichier. Cela fonctionne toujours, à l’exception des éléments occasionnels ci-dessus que vous n’avez encore jamais utilisés. L’application est aussi open source : chacun peut lire exactement ce qu’elle fait.`,
  },
]

export default articles
