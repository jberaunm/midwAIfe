export async function startAudioPlayerWorklet(): Promise<[AudioWorkletNode, AudioContext]> {
  const audioContext = new AudioContext({ sampleRate: 24000 });
  // Load the processor from public directory
  await audioContext.audioWorklet.addModule("/pcm-player-processor.js");
  const audioPlayerNode = new AudioWorkletNode(audioContext, "pcm-player-processor");
  audioPlayerNode.connect(audioContext.destination);
  return [audioPlayerNode, audioContext];
} 