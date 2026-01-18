let micStream: MediaStream | undefined;

export async function startAudioRecorderWorklet(audioRecorderHandler: (pcmData: ArrayBuffer) => void): Promise<[
  AudioWorkletNode,
  AudioContext,
  MediaStream
]> {
  const audioRecorderContext = new AudioContext({ sampleRate: 16000 });
  const workletURL = "/pcm-recorder-processor.js";
  await audioRecorderContext.audioWorklet.addModule(workletURL);
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
  const source = audioRecorderContext.createMediaStreamSource(micStream);
  const audioRecorderNode = new AudioWorkletNode(audioRecorderContext, "pcm-recorder-processor");
  source.connect(audioRecorderNode);
  audioRecorderNode.port.onmessage = (event) => {
    const pcmData = convertFloat32ToPCM(event.data);
    audioRecorderHandler(pcmData);
  };
  return [audioRecorderNode, audioRecorderContext, micStream];
}

export function stopMicrophone(micStream: MediaStream) {
  micStream.getTracks().forEach((track) => track.stop());
  console.log("stopMicrophone(): Microphone stopped.");
}

function convertFloat32ToPCM(inputData: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i++) {
    pcm16[i] = inputData[i] * 0x7fff;
  }
  return pcm16.buffer;
} 