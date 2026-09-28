import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-file-format',
    group: 'Grundlagen',
    title: 'Was ein Dateiformat eigentlich ist',
    summary: 'Die Endung am Dateinamen und was wirklich in der Datei steckt.',
    body: `Ein Dateiformat ist eine vereinbarte Art, Informationen anzuordnen, damit ein Programm sie wieder lesen kann. Ein JPEG-Foto, eine WAV-Aufnahme und ein Word-Dokument sind nur lange Reihen von Bytes; das Format ist das Regelwerk, das festlegt, welches Byte was bedeutet.

## Die Endung ist nur ein Etikett

Die Buchstaben nach dem Punkt im Dateinamen, etwa .jpg oder .mp3, heißen Dateiendung. Ihr Gerät errät daran, welches Programm die Datei öffnen soll. Die Endung ist aber nur ein Etikett auf der Außenseite. Das tatsächliche Format ergibt sich daraus, wie der Inhalt aufgebaut ist.

Deshalb wird eine Datei durch Umbenennen nicht umgewandelt. Benennen Sie foto.png in foto.jpg um, haben Sie immer noch eine PNG-Datei, nur mit irreführendem Namen. Manche Programme öffnen sie trotzdem, weil sie den Inhalt prüfen, andere verweigern sie. Umwandeln heißt, die Datei wirklich zu lesen und die Informationen in einem anderen Aufbau neu zu schreiben.

## Container und ihr Inhalt

Bei Video und Audio kommt eine zweite Ebene hinzu. Eine Videodatei wie MP4 oder MOV ist ein **Container**: eine Hülle mit einer Bildspur, einer Tonspur und einigen Zeitangaben. Bild und Ton darin sind mit einem **Codec** gespeichert, einem Verfahren zur Komprimierung, etwa H.264 für Video oder AAC für Ton.

Zwei Dateien können also beide auf .mp4 enden und unterschiedliche Codecs enthalten, und zwei Dateien mit verschiedenen Endungen können genau denselben Codec enthalten. Wenn ein Video nicht abspielt oder ein Konverter es nicht annimmt, liegt es oft am Container oder am Codec und nicht an der Datei als Ganzes.

## Warum es so viele Formate gibt

Formate sind für unterschiedliche Aufgaben gemacht. Manche bewahren jedes Detail, andere tauschen Details gegen eine kleinere Datei, manche unterstützen Transparenz oder Animation, und manche hat ein bestimmtes Gerät oder Programm einfach so gewählt. Ein Konverter bringt Ihre Inhalte aus dem Format, in dem sie vorliegen, in das Format, das Sie brauchen.`,
  },
  {
    id: 'why-conversions-lose-things',
    group: 'Grundlagen',
    title: 'Warum manche Umwandlungen Qualität kosten oder nicht möglich sind',
    summary: 'Was unterwegs verloren geht und warum es nicht immer zurückkommt.',
    body: `Eine Datei umzuwandeln ist nicht so, als würde man Wasser von einem Glas ins andere gießen. Jedes Format kann manche Dinge speichern und andere nicht, und eine Umwandlung kann nur übertragen, was beide Formate verstehen.

## Verlustbehaftete Formate verwerfen Details

Formate wie JPEG, WebP, MP3, AAC und H.264-Video machen Dateien kleiner, indem sie Details verwerfen, die Ihnen kaum auffallen. Jedes Mal, wenn eine Datei in einem dieser Formate geschrieben wird, geht etwas mehr verloren. Eine Umwandlung zwischen zwei verlustbehafteten Formaten oder erneutes Speichern im selben Format kostet jedes Mal etwas Qualität.

Rückgängig machen lässt sich das nicht. Wandeln Sie eine MP3 in ein verlustfreies Format wie WAV oder FLAC um, erhalten Sie eine viel größere Datei, aber was die MP3 bereits verworfen hat, kommt nicht zurück. Es wird nur bewahrt, was noch da ist.

## Fehlende Funktionen

Manchmal hat das Zielformat schlicht keinen Platz für etwas, das das Original hatte:

- **Transparenz.** JPEG kann keine durchsichtigen Bereiche speichern, daher werden sie weiß gefüllt.
- **Animation.** PNG, JPEG, WebP und AVIF werden hier als Standbilder geschrieben; ein animiertes GIF behält bei der Umwandlung in eines davon nur sein erstes Einzelbild.
- **Farben.** Ein GIF fasst höchstens 256 Farben pro Einzelbild, deshalb wirken Fotos und weiche Verläufe gröber.
- **Ton.** Ein GIF hat keine Tonspur, ein in ein GIF umgewandeltes Video ist also stumm.
- **Layout.** Ein in PDF umgewandeltes Dokument wird aus seinem Inhalt neu gesetzt. Schriften, Spalten, Kopf- und Fußzeilen, Textfelder und frei platzierte Formen werden nicht übernommen.

Universal Converter weist Sie in der Zeile der Datei oder im Bedienfeld auf solche Verluste hin, statt Sie sie später selbst entdecken zu lassen.

## Umwandlungen, die nicht möglich sind

Manche Dateien lassen sich hier gar nicht umwandeln, meist weil ihr Lesen ein ganz anderes Programm erfordern würde. Einige Beispiele: MKV-, AVI- und WMV-Videos, deren Container diese App nicht zerlegen kann; Excel- und PowerPoint-Dateien; und PDFs, die diese App nur schreibt. In jedem Fall wird die Datei mit einem Satz abgelehnt, der den Grund nennt und, wo es einen gibt, den besseren Weg.`,
  },
  {
    id: 'what-universal-converter-can-do',
    group: 'So funktioniert es',
    title: 'Was Universal Converter umwandeln kann',
    summary: 'Die Registerkarten, die Formate, die sie annehmen, und was sie erzeugen.',
    body: `Universal Converter hat fünf Registerkarten. **All** (alles) nimmt alles an und sortiert jede Datei für Sie auf die passende Registerkarte. Die anderen vier kümmern sich jeweils um eine Dateiart.

## Audio

- **Eingabe:** WAV, MP3, M4A und AAC, FLAC, OGG, Opus, AIFF und WebM-Audio.
- **Ausgabe:** MP3, M4A, Opus, FLAC, WAV und AIFF. M4A und Opus hängen davon ab, ob Ihr Browser sie unterstützt.
- Sie können kürzen, die Abtastrate ändern, auf Mono umstellen und die Lautstärke angleichen. Angaben wie Titel und Interpret lassen sich in MP3- und Opus-Dateien übernehmen.
- Ziehen Sie ein Video hierher, um nur seinen Ton zu erhalten.

## Images (Bilder)

- **Eingabe:** PNG, JPEG, HEIC und HEIF vom iPhone, WebP, GIF, BMP, AVIF und SVG.
- **Ausgabe:** WebP, JPEG, PNG, AVIF, sofern Ihr Browser es schreiben kann, und GIF.
- Sie können die Größe ändern und die Qualität einstellen. Jede Zeile zeigt vor der Umwandlung eine Schätzung der neuen Größe. Ein animiertes GIF bleibt bei der Umwandlung in GIF animiert.

## Video

- **Eingabe:** MP4, M4V und MOV.
- **Ausgabe:** MP4 mit H.264-Video und AAC-Ton oder ein animiertes GIF.
- Sie können kürzen, die Größe ändern und die Qualität einstellen. Ein Schnitt beginnt am nächstgelegenen Schlüsselbild, einem vollständigen Bild, von dem die umliegenden Einzelbilder abhängen; er kann also etwas vor der gewählten Stelle anfangen.
- Die MP4-Ausgabe braucht einen Browser mit eingebautem H.264-Video-Encoder, etwa Chrome, Edge oder Safari ab 16.4.

## Files (Dokumente)

- **Eingabe:** DOCX, DOC, ODT, RTF, TXT, Markdown, HTML, CSV und JSON.
- **Ausgabe:** PDF, reiner Text, HTML und Markdown. CSV und JSON werden nur angeboten, wenn die Datei bereits Zeilen und Spalten hat, etwa eine CSV- oder JSON-Datei.

## Weitere Exporte

Manche Aufgaben machen aus einer Dateiart eine andere, und jede sagt vorher, was sie dafür aufgibt:

- **Save as one PDF.** Jedes Bild in der Warteschlange wird zu einer Seite. Transparenz wird weiß gefüllt, und es gibt keinen markierbaren Text.
- **Save the sound only.** Holt die Tonspur aus einem Video, als MP3, M4A oder WAV.
- **Join into one PDF.** Alle Dokumente der Warteschlange in einer Datei, jedes auf einer neuen Seite beginnend.`,
  },
  {
    id: 'converting-documents',
    group: 'So funktioniert es',
    title: 'Dokumente umwandeln',
    summary: 'Was aus Word und anderen Dateien übernommen wird und was nicht.',
    body: `Die Registerkarte Files liest ein Dokument, ermittelt seinen Aufbau und schreibt diesen Aufbau dann im gewünschten Format neu. Sie fotografiert nicht jede Seite ab. Deshalb enthält das Ergebnis echten, markierbaren Text, sieht aber auch nicht genau wie das Original aus.

## Was übernommen wird

Aus einem Word-Dokument (DOCX) übernimmt der Konverter:

- Überschriften und Absätze
- Aufzählungen und nummerierte Listen, auch verschachtelte
- Tabellen
- fetten, kursiven und unterstrichenen Text
- Links
- im Text platzierte Bilder
- Seitenumbrüche, die Sie selbst eingefügt haben

OpenDocument- (ODT) und RTF-Dateien werden ähnlich übernommen.

## Was nicht übernommen wird

- **Das genaue Aussehen der Seite.** Das Dokument wird neu gesetzt, daher weichen Schriften, Spalten und Abstände ab.
- **Kopf- und Fußzeilen, Fußnoten und Kommentare.** Sie werden weggelassen, ebenso Diagramme, Textfelder und alles, was frei auf der Seite platziert ist. Enthielt die Datei so etwas, steht es in der Zeile.
- **Ältere Word-Dateien (DOC).** Nur der Text wird übernommen, ohne Formatierung. Mit aktivierter Änderungsnachverfolgung gelöschter Text kann noch erscheinen, weil das alte Format ihn zusammen mit dem Rest speichert.

## Buchstaben anderer Alphabete

PDFs werden mit Standardschriften geschrieben, die jeder PDF-Reader bereits kennt. Sie decken lateinische Alphabete ab. Für Griechisch, Kyrillisch und Hebräisch lädt die App beim ersten Dokument, das es braucht, eine zusätzliche Schrift herunter und behält sie für das nächste Mal. Chinesisch, Japanisch, Koreanisch und Arabisch können noch nicht geschrieben werden. Hebräische Buchstaben werden geschrieben, jede Zeile wird aber von links nach rechts gesetzt, sodass hebräische Wörter im PDF derzeit rückwärts erscheinen. Zeichen, die nicht geschrieben werden konnten, werden in der Zeile aufgeführt, damit Sie genau wissen, was fehlt.

## Einige Tipps

- Speichern Sie eine Tabelle zuerst als CSV und wandeln Sie diese um.
- Exportieren Sie eine Präsentation aus dem Programm, mit dem sie erstellt wurde, als PDF.
- Zum Bearbeiten, Aufteilen oder Unterschreiben eines PDFs verwenden Sie Universal PDF. Diese App schreibt PDFs, liest sie aber nicht.
- Legen Sie mehrere Dokumente in die Warteschlange und nutzen Sie **Join into one PDF**, um sie zu einer Datei zusammenzufügen.`,
  },
  {
    id: 'converting-folders',
    group: 'So funktioniert es',
    title: 'Ganze Ordner umwandeln',
    summary: 'Einen Ordner hineinziehen und ihn als ein ZIP mit gleicher Struktur zurückbekommen.',
    body: `Sie können Universal Converter einen ganzen Ordner geben, statt die Dateien einzeln auszuwählen. Alles, was sich umwandeln lässt, wird umgewandelt, und die Ergebnisse kommen in derselben Ordnerstruktur zurück, mit der Sie begonnen haben.

## Einen Ordner hinzufügen

1. Ziehen Sie den Ordner auf den Kreis. Am Computer können Sie auch **or choose a folder** (oder einen Ordner wählen) unter dem Kreis verwenden. Auf Telefonen lassen sich nur einzelne Dateien auswählen, dort erscheint diese Option daher nicht.
2. Die App durchsucht den Ordner mit allen Unterordnern und sortiert jede Datei auf die passende Registerkarte: Bilder, Audio, Video oder Dokumente.
3. Wählen Sie auf jeder Registerkarte Ihre Einstellungen und wandeln Sie wie gewohnt um.

## Was mit Dateien passiert, die nicht umgewandelt werden können

Ein Ordner wird als „wandle um, was hier drin geht“ verstanden. Dateien, die kein Bild, kein Ton, kein Video und kein von der App lesbares Dokument sind, werden übersprungen. Sie sehen, wie viele übersprungen wurden, statt einer langen Namensliste. Sie fehlen einfach im Ergebnis; den Originalen geschieht nichts.

## Die Ergebnisse erhalten

Wenn Sie mehrere umgewandelte Dateien zusammen herunterladen, kommen sie als eine ZIP-Datei:

- Jede umgewandelte Datei liegt an derselben Stelle im Ordnerbaum wie das Original. Aus Urlaub/Tag 1/IMG_0001.heic wird zum Beispiel Urlaub/Tag 1/IMG_0001.jpg, wenn Sie in JPEG umgewandelt haben.
- Stammt alles aus einem einzigen Ordner, trägt das ZIP dessen Namen.
- Würden zwei Dateien denselben Namen bekommen, etwa foto.png und foto.heic, die beide zu foto.jpg werden, wird die zweite nummeriert, zum Beispiel foto (2).jpg, damit keine die andere überschreibt.
- Enthielt ein Ordner mehrere Dateiarten, verteilen sich die Ergebnisse auf mehrere Registerkarten. Eine Schaltfläche lädt dann alles von allen Registerkarten als ein ZIP herunter.

Das ZIP bündelt die Dateien nur. Es komprimiert sie nicht weiter, da die meisten umgewandelten Dateien bereits komprimiert sind.`,
  },
  {
    id: 'your-files-stay-on-your-device',
    group: 'Datenschutz und Sicherheit',
    title: 'Ihre Dateien bleiben auf Ihrem Gerät',
    summary: 'Was an einen Server geht und was nie.',
    body: `Universal Converter erledigt alle Umwandlungen auf Ihrem eigenen Gerät. Ihre Dateien werden zum Umwandeln nie hochgeladen.

## Wo die Arbeit stattfindet

Wenn Sie eine Datei hinzufügen, liest die App auf Ihrem Gerät sie und schreibt die neue Fassung. Bilder werden mit den Bildwerkzeugen Ihres Browsers umgewandelt. Video nutzt den eingebauten Video-Decoder und -Encoder Ihres Browsers. Ton wird von Ihrem Browser decodiert und von Encodern geschrieben, die in der App laufen. Dokumente liest und setzt die App selbst. Das Öffnen einer HTML-Datei hier führt keines der darin enthaltenen Skripte aus.

Die Ergebnisse werden direkt auf Ihrem Gerät gespeichert. Ihre Dateien liegen nur so lange im Arbeitsspeicher, wie die App geöffnet ist, werden von der App nicht gespeichert und sind nach dem Schließen weg. Da nichts hochgeladen wird, gibt es weder eine Größengrenze noch ein Tageskontingent, nur den Arbeitsspeicher Ihres Geräts.

## Was die App herunterlädt

Einige Teile der App sind groß und werden nur gelegentlich gebraucht. Sie werden deshalb beim ersten Bedarf von unserer eigenen Website geladen und für das nächste Mal behalten: der FLAC-Encoder, der Decoder für iPhone-HEIC-Fotos und die zusätzliche Schrift für griechische, kyrillische und hebräische Dokumente. Dabei wird nur Programmcode heruntergeladen. Nichts von Ihren Dateien wird dafür gesendet.

## Was die App sendet

- **Die Anmeldung**, falls Sie sich dafür entscheiden. Nichts in der App erfordert ein Konto.
- **Eine Meldung „App geöffnet“**, wenn Sie angemeldet sind, damit die Aktivität Ihrer Universal ID stimmt. Sie enthält nichts über Ihre Dateien.
- **Ein Signal „App in Benutzung“** alle 45 Sekunden, solange die App geöffnet und sichtbar ist. Es enthält den Namen der App, eine zufällige, auf Ihrem Gerät erzeugte Kennung und Ihr Konto, falls Sie angemeldet sind. Damit wird angezeigt, wie viele Menschen die App nutzen.
- **Die Suche nach Updates** und das Abrufen der Liste der Neuerungen.

Es gibt keine Werbung und kein Tracking durch Dritte.

## Prüfen Sie es selbst

Trennen Sie die Internetverbindung und wandeln Sie etwas um. Es funktioniert trotzdem, abgesehen von den oben genannten gelegentlichen Teilen, die Sie noch nie benutzt haben. Die App ist außerdem Open Source, sodass jeder genau nachlesen kann, was sie tut.`,
  },
]

export default articles
