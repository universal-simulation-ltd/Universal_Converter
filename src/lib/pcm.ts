// The Float32 → Int16 conversion moved to @unisim/media 0.4.0 alongside the MP3
// encoder that was its main consumer (§10.6). The measured facts that make it
// non-obvious — the asymmetric 32767/32768 scaling, and rounding rather than
// truncating — are documented at its new home in packages/media/src/pcm.ts, and
// are now covered by that package's self-tests.
export { toInt16, channelToInt16 } from '@unisim/media'
