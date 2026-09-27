import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'what-is-a-file-format',
    group: 'The basics',
    title: 'What a file format actually is',
    summary: 'The name on the end of a file, and what is really inside it.',
    body: `A file format is an agreed way of laying out information so that a program knows how to read it back. A JPEG photo, a WAV recording and a Word document are all just long rows of bytes; the format is the set of rules that says which bytes mean what.

## The extension is only a label

The letters after the dot in a file's name, such as .jpg or .mp3, are called the extension. Your device uses them to guess which program should open the file. But the extension is only a label on the outside. The real format is decided by how the contents are laid out.

That is why renaming a file does not convert it. Change photo.png to photo.jpg and you still have a PNG, just with a misleading name. Some programs will open it anyway, because they look at the contents, and others will refuse. Converting means actually reading the file and writing the information out again in a different layout.

## Containers and what is inside them

Video and audio add a second layer. A video file such as MP4 or MOV is a **container**: a box that holds a picture track, a sound track and some timing information. The picture and sound inside are stored with a **codec**, a method of compressing them, such as H.264 for video or AAC for sound.

So two files can both end in .mp4 and still hold different codecs, and two files with different extensions can hold exactly the same codec. When a video will not play, or a converter will not take it, the reason is often the container or the codec rather than the file as a whole.

## Why there are so many formats

Formats are designed for different jobs. Some keep every detail, some trade detail for a smaller file, some support transparency or animation, and some are simply what a particular device or program happened to choose. A converter exists to move your content from the format it is in to the one you need.`,
  },
  {
    id: 'why-conversions-lose-things',
    group: 'The basics',
    title: 'Why some conversions lose quality, or cannot be done',
    summary: 'What gets lost on the way, and why it cannot always come back.',
    body: `Converting a file is not like pouring water from one glass into another. Each format can hold some things and not others, and a conversion can only carry across what both formats understand.

## Lossy formats throw detail away

Formats such as JPEG, WebP, MP3, AAC and H.264 video make files smaller by discarding detail you are unlikely to notice. Every time a file is written in one of these formats, a little more is lost. Converting between two lossy formats, or re-saving the same one, costs some quality each time.

It also cannot be undone. Converting an MP3 to a lossless format such as WAV or FLAC gives you a much bigger file, but it does not bring back what the MP3 already threw away. It only preserves what is left.

## Missing features

Sometimes the target format simply has no place for something the original had:

- **Transparency.** JPEG cannot store see-through areas, so they are filled with white.
- **Animation.** PNG, JPEG, WebP and AVIF as written here are still images, so an animated GIF converted to one of them keeps only its first frame.
- **Colours.** A GIF can hold at most 256 colours per frame, so photos and smooth gradients look rougher.
- **Sound.** A GIF has no sound track, so a video turned into a GIF is silent.
- **Layout.** A document converted to PDF is laid out again from its content. Fonts, columns, headers and footers, text boxes and floating shapes do not carry across.

Universal Converter tells you about these losses on the row or in the panel, rather than leaving you to find out later.

## Conversions that cannot be done

Some files cannot be converted here at all, usually because reading them would need a very different kind of program. A few examples: MKV, AVI and WMV video, which use containers this app cannot take apart; Excel and PowerPoint files; and PDFs, which this app only writes. In each case the file is turned away with a sentence explaining why and, where there is one, what to do instead.`,
  },
  {
    id: 'what-universal-converter-can-do',
    group: 'How it works',
    title: 'What Universal Converter can convert',
    summary: 'The tabs, the formats they take, and what they produce.',
    body: `Universal Converter has five tabs. **All** takes anything and sorts each file onto the right tab for you. The other four each handle one kind of file.

## Audio

- **In:** WAV, MP3, M4A and AAC, FLAC, OGG, Opus, AIFF and WebM audio.
- **Out:** MP3, M4A, Opus, FLAC, WAV and AIFF. M4A and Opus depend on your browser supporting them.
- You can trim, change the sample rate, mix to mono and even out the volume. Song details such as title and artist can be copied into MP3 and Opus files.
- Drop a video here to get just its sound.

## Images

- **In:** PNG, JPEG, HEIC and HEIF from an iPhone, WebP, GIF, BMP, AVIF and SVG.
- **Out:** WebP, JPEG, PNG, AVIF where your browser can write it, and GIF.
- You can resize and set the quality. Each row shows an estimate of the new size before you convert. An animated GIF converted to GIF stays animated.

## Video

- **In:** MP4, M4V and MOV.
- **Out:** MP4 with H.264 video and AAC sound, or an animated GIF.
- You can trim, resize and set the quality. Trims begin at the nearest keyframe, a full picture in the video that the frames around it depend on, so a cut may start slightly before the point you chose.
- MP4 output needs a browser with a built-in H.264 video encoder, such as Chrome, Edge or Safari 16.4 or later.

## Files

- **In:** DOCX, DOC, ODT, RTF, TXT, Markdown, HTML, CSV and JSON.
- **Out:** PDF, plain text, HTML and Markdown. CSV and JSON are offered only when the file already has rows and columns, such as a CSV or JSON file.

## Other exports

Some jobs turn one kind of file into another, and each says what it gives up before you start:

- **Save as one PDF.** Each queued picture becomes a page. Transparency is flattened onto white and there is no selectable text.
- **Save the sound only.** Takes the sound track out of a video, as MP3, M4A or WAV.
- **Join into one PDF.** Every queued document in one file, each starting on a new page.`,
  },
  {
    id: 'converting-documents',
    group: 'How it works',
    title: 'Converting documents',
    summary: 'What carries across from Word and other files, and what does not.',
    body: `The Files tab reads a document, works out its structure, and then writes that structure out again in the format you choose. It does not take a picture of each page. That is why the result has real, selectable text, but also why it does not look exactly like the original.

## What carries across

From a Word document (DOCX), the converter keeps:

- headings and paragraphs
- bulleted and numbered lists, including nested ones
- tables
- bold, italic and underlined text
- links
- pictures placed in the text
- page breaks you added yourself

OpenDocument (ODT) and RTF files carry across in a similar way.

## What does not

- **The exact look of the page.** The document is laid out again, so fonts, columns and spacing will differ.
- **Headers, footers, footnotes and comments.** These are left out. Charts, text boxes and anything positioned freely on the page are also left out. Where the file had them, the row says so.
- **Older Word files (DOC).** Only the text comes across, without formatting. Text that was deleted with Track Changes switched on may still appear, because the old format stores it alongside the rest.

## Letters from other alphabets

PDFs are written with standard fonts that every PDF reader already has. These cover Latin alphabets. For Greek, Cyrillic and Hebrew, the app downloads an extra font the first time a document needs it and keeps it for next time. Chinese, Japanese, Korean and Arabic cannot be written yet. Any characters that could not be written are listed on the row, so you know exactly what is missing.

## A few tips

- For a spreadsheet, save it as CSV first and convert that.
- For a slide deck, export it to PDF from the program that made it.
- To edit, split or sign a PDF, use Universal PDF. This app writes PDFs but does not read them.
- Queue several documents and use **Join into one PDF** to combine them into a single file.`,
  },
  {
    id: 'converting-folders',
    group: 'How it works',
    title: 'Converting whole folders',
    summary: 'Drop a folder and get it back in one ZIP, in the same shape.',
    body: `You can give Universal Converter a whole folder instead of picking files one by one. Everything it can convert is converted, and the results come back in the same folder structure you started with.

## How to add a folder

1. Drag the folder onto the drop circle. On a computer, you can also use **or choose a folder** under the circle. Phones only let you pick individual files, so that option does not appear there.
2. The app looks inside the folder and all the folders within it, and sorts each file onto the right tab: images, audio, video or documents.
3. Choose your settings on each tab and convert as usual.

## What happens to files it cannot convert

A folder is treated as "convert what you can in here". Files that are not a picture, a sound, a video or a document the app can read are skipped. You see how many were skipped rather than a long list of names. They are simply left out of the result; nothing happens to the originals.

## Getting the results back

When you download several converted files together, they come as one ZIP file:

- Each converted file sits in the same place in the folder tree as the original. For example, Holiday/Day 1/IMG_0001.heic comes back as Holiday/Day 1/IMG_0001.jpg if you converted to JPEG.
- If everything came from one folder, the ZIP is named after it.
- If two files would end up with the same name, for instance photo.png and photo.heic both becoming photo.jpg, the second is numbered, as in photo (2).jpg, so neither overwrites the other.
- If a folder held several kinds of file, its results are spread across several tabs. A button then lets you download everything from every tab as one ZIP.

The ZIP simply bundles the files together. It does not compress them further, since most converted files are already compressed.`,
  },
  {
    id: 'your-files-stay-on-your-device',
    group: 'Privacy and security',
    title: 'Your files stay on your device',
    summary: 'What is sent to a server, and what never is.',
    body: `Universal Converter does all of its converting on your own device. Your files are never uploaded to be converted.

## Where the work happens

When you add a file, the app running on your device reads it and writes the new version. Pictures are converted with your browser's own image tools. Video uses your browser's built-in video decoder and encoder. Sound is decoded by your browser and written by encoders that run inside the app. Documents are read and laid out by the app itself. Opening an HTML file here does not run any scripts inside it.

The results are saved straight to your device. Your files are held in memory only while the app is open, are not stored by the app, and are gone when you close it. Because nothing is uploaded, there is no size limit and no daily allowance, only the memory of your device.

## Things the app downloads

A few parts of the app are large and only needed occasionally, so they are downloaded from our own site the first time you need them and kept for next time: the FLAC encoder, the decoder for iPhone HEIC photos, and the extra font for Greek, Cyrillic and Hebrew documents. These are downloads of program code. Nothing about your files is sent to fetch them.

## What the app sends

- **Signing in**, if you choose to. Nothing in the app requires an account.
- **An "app opened" note** when you are signed in, so your Universal ID activity is accurate. It says nothing about your files.
- **A "this app is in use" signal** every 45 seconds while the app is open and on screen. It contains the app's name, a random ID made on your device, and your account if you are signed in. It is used to show how many people are using the app.
- **Checking for updates** and fetching the list of changes.

There is no advertising and no third-party tracking.

## Check it yourself

Turn off your internet connection and convert something. It still works, apart from the occasional part above that you have not used before. The app is also open source, so anyone can read exactly what it does.`,
  },
]

export default articles
