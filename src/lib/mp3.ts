// MP3 encoding moved to @unisim/media 0.4.0 (§10.6's "LAME/audio extraction").
//
// Converter and Universal Compress carried byte-identical `encodeMp3`
// implementations — same 115200 chunk, same loop, same copied comment — and
// Universal Recorder a third, cruder one that truncated instead of rounding on
// the way to int16. There is one implementation now.
//
// This module stays as a re-export rather than being deleted so the app's own
// import sites don't all have to move in the same commit, and so this note is
// where somebody looking for the encoder will land.
export {
  encodeMp3, nearestLameRate, MP3_BITRATES, LAME_RATES,
  type Mp3Bitrate, type Mp3ProgressFn,
} from '@unisim/media'
