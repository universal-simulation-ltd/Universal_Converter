import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-file-format',
    group: 'Lo básico',
    title: 'Qué es realmente un formato de archivo',
    summary: 'El nombre al final de un archivo, y lo que hay de verdad dentro.',
    body: `Un formato de archivo es una forma acordada de organizar la información para que un programa sepa leerla. Una foto JPEG, una grabación WAV y un documento de Word son solo largas filas de bytes; el formato es el conjunto de reglas que indica qué significa cada byte.

## La extensión es solo una etiqueta

Las letras que siguen al punto en el nombre de un archivo, como .jpg o .mp3, son la extensión. Su dispositivo las usa para adivinar qué programa debe abrir el archivo. Pero la extensión es solo una etiqueta por fuera. El formato real lo decide cómo está organizado el contenido.

Por eso cambiar el nombre de un archivo no lo convierte. Si cambia foto.png por foto.jpg, sigue teniendo un PNG, solo que con un nombre engañoso. Algunos programas lo abrirán igualmente, porque miran el contenido, y otros lo rechazarán. Convertir significa leer de verdad el archivo y volver a escribir la información con otra organización.

## Contenedores y lo que llevan dentro

El vídeo y el audio añaden una segunda capa. Un archivo de vídeo como MP4 o MOV es un **contenedor**: una caja que guarda una pista de imagen, una pista de sonido y algo de información de tiempos. La imagen y el sonido de dentro se guardan con un **códec**, un método para comprimirlos, como H.264 para el vídeo o AAC para el sonido.

Así, dos archivos pueden terminar en .mp4 y contener códecs distintos, y dos archivos con extensiones distintas pueden contener exactamente el mismo códec. Cuando un vídeo no se reproduce, o un conversor no lo acepta, el motivo suele ser el contenedor o el códec, más que el archivo en conjunto.

## Por qué hay tantos formatos

Los formatos se diseñan para tareas distintas. Unos conservan cada detalle, otros cambian detalle por un archivo más pequeño, algunos admiten transparencia o animación, y otros son simplemente los que eligió un dispositivo o un programa concreto. Un conversor existe para llevar su contenido del formato en que está al que usted necesita.`,
  },
  {
    id: 'why-conversions-lose-things',
    group: 'Lo básico',
    title: 'Por qué algunas conversiones pierden calidad, o no se pueden hacer',
    summary: 'Qué se pierde por el camino, y por qué no siempre se recupera.',
    body: `Convertir un archivo no es como pasar agua de un vaso a otro. Cada formato puede guardar unas cosas y otras no, y una conversión solo puede trasladar lo que ambos formatos entienden.

## Los formatos con pérdida descartan detalle

Formatos como JPEG, WebP, MP3, AAC y el vídeo H.264 reducen el tamaño descartando detalles que difícilmente notaría. Cada vez que un archivo se escribe en uno de estos formatos, se pierde un poco más. Convertir entre dos formatos con pérdida, o volver a guardar en el mismo, cuesta algo de calidad cada vez.

Además, no se puede deshacer. Convertir un MP3 a un formato sin pérdida como WAV o FLAC le da un archivo mucho más grande, pero no recupera lo que el MP3 ya había descartado. Solo conserva lo que queda.

## Funciones que faltan

A veces el formato de destino simplemente no tiene sitio para algo que tenía el original:

- **Transparencia.** JPEG no puede guardar zonas transparentes, así que se rellenan de blanco.
- **Animación.** PNG, JPEG, WebP y AVIF se escriben aquí como imágenes fijas, así que un GIF animado convertido a uno de ellos conserva solo su primer fotograma.
- **Colores.** Un GIF admite como máximo 256 colores por fotograma, así que las fotos y los degradados suaves se ven más toscos.
- **Sonido.** Un GIF no tiene pista de sonido, así que un vídeo convertido en GIF queda mudo.
- **Diseño de página.** Un documento convertido a PDF se vuelve a maquetar a partir de su contenido. Las fuentes, columnas, encabezados y pies de página, cuadros de texto y formas flotantes no se conservan.

Universal Converter le avisa de estas pérdidas en la fila del archivo o en el panel, en lugar de dejar que las descubra más tarde.

## Conversiones que no se pueden hacer

Algunos archivos no se pueden convertir aquí en absoluto, normalmente porque leerlos requeriría un programa muy distinto. Algunos ejemplos: los vídeos MKV, AVI y WMV, cuyos contenedores esta aplicación no puede abrir; los archivos de Excel y PowerPoint; y los PDF, que esta aplicación solo escribe. En cada caso, el archivo se rechaza con una frase que explica el motivo y, cuando existe, qué hacer en su lugar.`,
  },
  {
    id: 'what-universal-converter-can-do',
    group: 'Cómo funciona',
    title: 'Qué puede convertir Universal Converter',
    summary: 'Las pestañas, los formatos que aceptan y lo que producen.',
    body: `Universal Converter tiene cinco pestañas. **All** (todo) acepta cualquier cosa y coloca cada archivo en la pestaña adecuada por usted. Las otras cuatro se ocupan cada una de un tipo de archivo.

## Audio

- **Entrada:** WAV, MP3, M4A y AAC, FLAC, OGG, Opus, AIFF y audio WebM.
- **Salida:** MP3, M4A, Opus, FLAC, WAV y AIFF. M4A y Opus dependen de que su navegador los admita.
- Puede recortar, cambiar la frecuencia de muestreo, pasar a mono e igualar el volumen. Datos como el título y el artista pueden copiarse en archivos MP3 y Opus.
- Suelte un vídeo aquí para obtener solo su sonido.

## Images (imágenes)

- **Entrada:** PNG, JPEG, HEIC y HEIF de iPhone, WebP, GIF, BMP, AVIF y SVG.
- **Salida:** WebP, JPEG, PNG, AVIF si su navegador puede escribirlo, y GIF.
- Puede cambiar el tamaño y ajustar la calidad. Cada fila muestra una estimación del nuevo tamaño antes de convertir. Un GIF animado convertido a GIF sigue animado.

## Video (vídeo)

- **Entrada:** MP4, M4V y MOV.
- **Salida:** MP4 con vídeo H.264 y sonido AAC, o un GIF animado.
- Puede recortar, cambiar el tamaño y ajustar la calidad. Los recortes empiezan en el fotograma clave más cercano, una imagen completa de la que dependen los fotogramas de alrededor, así que un corte puede empezar algo antes del punto elegido.
- La salida MP4 necesita un navegador con codificador de vídeo H.264 integrado, como Chrome, Edge o Safari 16.4 o posterior.

## Files (documentos)

- **Entrada:** DOCX, DOC, ODT, RTF, TXT, Markdown, HTML, CSV y JSON.
- **Salida:** PDF, texto sin formato, HTML y Markdown. CSV y JSON solo se ofrecen cuando el archivo ya tiene filas y columnas, como un archivo CSV o JSON.

## Otras exportaciones

Algunas tareas convierten un tipo de archivo en otro, y cada una indica lo que sacrifica antes de empezar:

- **Save as one PDF.** Cada imagen de la cola se convierte en una página. La transparencia se rellena de blanco y el texto no es seleccionable.
- **Save the sound only.** Extrae la pista de sonido de un vídeo, como MP3, M4A o WAV.
- **Join into one PDF.** Todos los documentos de la cola en un solo archivo, cada uno empezando en una página nueva.`,
  },
  {
    id: 'converting-documents',
    group: 'Cómo funciona',
    title: 'Convertir documentos',
    summary: 'Qué se conserva de Word y de otros archivos, y qué no.',
    body: `La pestaña Files lee un documento, averigua su estructura y luego vuelve a escribir esa estructura en el formato que usted elija. No hace una foto de cada página. Por eso el resultado tiene texto real y seleccionable, pero también por eso no se ve exactamente igual que el original.

## Qué se conserva

De un documento de Word (DOCX), el conversor mantiene:

- títulos y párrafos
- listas con viñetas y numeradas, incluidas las anidadas
- tablas
- texto en negrita, cursiva y subrayado
- enlaces
- imágenes colocadas en el texto
- saltos de página que usted haya añadido

Los archivos OpenDocument (ODT) y RTF se conservan de forma parecida.

## Qué no se conserva

- **El aspecto exacto de la página.** El documento se vuelve a maquetar, así que las fuentes, las columnas y los espacios cambian.
- **Encabezados, pies de página, notas al pie y comentarios.** Se omiten, igual que los gráficos, los cuadros de texto y todo lo que esté colocado libremente en la página. Si el archivo los tenía, la fila lo indica.
- **Archivos antiguos de Word (DOC).** Solo se traslada el texto, sin formato. El texto eliminado con el control de cambios activado puede seguir apareciendo, porque el formato antiguo lo guarda junto al resto.

## Letras de otros alfabetos

Los PDF se escriben con fuentes estándar que todo lector de PDF ya tiene. Cubren los alfabetos latinos. Para el griego, el cirílico y el hebreo, la aplicación descarga una fuente adicional la primera vez que un documento la necesita y la guarda para la próxima vez. El chino, el japonés, el coreano y el árabe todavía no se pueden escribir. Las letras hebreas sí se escriben, pero cada línea se compone de izquierda a derecha, así que por ahora las palabras en hebreo salen al revés en el PDF. Los caracteres que no se han podido escribir se indican en la fila, para que sepa exactamente qué falta.

## Algunos consejos

- Para una hoja de cálculo, guárdela primero como CSV y convierta ese archivo.
- Para una presentación, expórtela a PDF desde el programa que la creó.
- Para editar, dividir o firmar un PDF, use Universal PDF. Esta aplicación escribe PDF, pero no los lee.
- Ponga varios documentos en la cola y use **Join into one PDF** para unirlos en un solo archivo.`,
  },
  {
    id: 'converting-folders',
    group: 'Cómo funciona',
    title: 'Convertir carpetas enteras',
    summary: 'Suelte una carpeta y recíbala en un solo ZIP, con la misma estructura.',
    body: `Puede darle a Universal Converter una carpeta entera en lugar de elegir los archivos uno a uno. Se convierte todo lo que se puede, y los resultados vuelven con la misma estructura de carpetas con la que empezó.

## Cómo añadir una carpeta

1. Arrastre la carpeta al círculo. En un ordenador también puede usar **or choose a folder** (o elegir una carpeta), debajo del círculo. Los teléfonos solo permiten elegir archivos sueltos, así que esa opción no aparece en ellos.
2. La aplicación mira dentro de la carpeta y de todas sus subcarpetas, y coloca cada archivo en la pestaña adecuada: imágenes, audio, vídeo o documentos.
3. Elija los ajustes en cada pestaña y convierta como siempre.

## Qué pasa con los archivos que no puede convertir

Una carpeta se entiende como «convierte lo que puedas de aquí». Los archivos que no son una imagen, un sonido, un vídeo o un documento que la aplicación sepa leer se omiten. Verá cuántos se han omitido en lugar de una larga lista de nombres. Simplemente quedan fuera del resultado; a los originales no les pasa nada.

## Recibir los resultados

Cuando descarga varios archivos convertidos a la vez, llegan en un solo archivo ZIP:

- Cada archivo convertido ocupa el mismo lugar en el árbol de carpetas que el original. Por ejemplo, Vacaciones/Día 1/IMG_0001.heic vuelve como Vacaciones/Día 1/IMG_0001.jpg si lo convirtió a JPEG.
- Si todo venía de una sola carpeta, el ZIP lleva su nombre.
- Si dos archivos acabaran con el mismo nombre, por ejemplo foto.png y foto.heic convertidos ambos en foto.jpg, el segundo se numera, como foto (2).jpg, para que ninguno sobrescriba al otro.
- Si una carpeta tenía varios tipos de archivo, sus resultados quedan repartidos en varias pestañas. Entonces un botón le permite descargar todo lo de todas las pestañas en un solo ZIP.

El ZIP solo agrupa los archivos. No los comprime más, ya que la mayoría de los archivos convertidos ya están comprimidos.`,
  },
  {
    id: 'your-files-stay-on-your-device',
    group: 'Privacidad y seguridad',
    title: 'Sus archivos se quedan en su dispositivo',
    summary: 'Qué se envía a un servidor y qué nunca se envía.',
    body: `Universal Converter hace todas las conversiones en su propio dispositivo. Sus archivos nunca se suben para convertirlos.

## Dónde se hace el trabajo

Cuando añade un archivo, la aplicación que se ejecuta en su dispositivo lo lee y escribe la nueva versión. Las imágenes se convierten con las herramientas de imagen de su navegador. El vídeo usa el descodificador y el codificador de vídeo integrados en su navegador. El sonido lo descodifica su navegador y lo escriben codificadores que funcionan dentro de la aplicación. Los documentos los lee y maqueta la propia aplicación. Abrir aquí un archivo HTML no ejecuta ninguno de los scripts que contenga.

Los resultados se guardan directamente en su dispositivo. Sus archivos solo se mantienen en memoria mientras la aplicación está abierta, la aplicación no los almacena y desaparecen al cerrarla. Como no se sube nada, no hay límite de tamaño ni cupo diario, solo la memoria de su dispositivo.

## Lo que descarga la aplicación

Algunas partes de la aplicación son grandes y solo se necesitan de vez en cuando, así que se descargan de nuestro propio sitio la primera vez que las necesita y se guardan para la próxima: el codificador FLAC, el descodificador de fotos HEIC de iPhone y la fuente adicional para documentos en griego, cirílico y hebreo. Son descargas de código del programa. No se envía nada de sus archivos para obtenerlas.

## Qué envía la aplicación

- **Iniciar sesión**, si usted lo decide. Nada en la aplicación exige una cuenta.
- **Un aviso de «aplicación abierta»** cuando ha iniciado sesión, para que la actividad de su Universal ID sea correcta. No dice nada de sus archivos.
- **Una señal de «aplicación en uso»** cada 45 segundos mientras la aplicación está abierta y en pantalla. Contiene el nombre de la aplicación, un identificador aleatorio creado en su dispositivo y su cuenta si ha iniciado sesión. Sirve para mostrar cuántas personas usan la aplicación.
- **La búsqueda de actualizaciones** y la descarga de la lista de novedades.

No hay publicidad ni seguimiento de terceros.

## Compruébelo usted mismo

Desconecte internet y convierta algo. Sigue funcionando, salvo las partes ocasionales mencionadas arriba que todavía no haya usado. La aplicación además es de código abierto, así que cualquiera puede leer exactamente lo que hace.`,
  },
]

export default articles
