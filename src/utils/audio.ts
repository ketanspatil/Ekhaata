/**
 * Audio processing utilities to record and encode pristine 16kHz 16-bit mono PCM WAV
 * directly from the browser's microphone input.
 */

export interface PcmWavRecorder {
  stop: () => Promise<Blob>;
}

export function startPcmWavRecorder(stream: MediaStream): PcmWavRecorder {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

  const audioCtx = new AudioContextClass();
  const source = audioCtx.createMediaStreamSource(stream);

  // Buffer size 4096 gives smooth, continuous capture with low latency
  const bufferSize = 4096;
  const scriptNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);

  const capturedChunks: Float32Array[] = [];
  let isRecording = true;

  scriptNode.onaudioprocess = (e: AudioProcessingEvent) => {
    if (!isRecording) return;
    const channelData = e.inputBuffer.getChannelData(0);
    // Clone chunk so it isn't overwritten by the audio engine
    capturedChunks.push(new Float32Array(channelData));
  };

  source.connect(scriptNode);
  scriptNode.connect(audioCtx.destination);

  return {
    stop: async (): Promise<Blob> => {
      isRecording = false;

      // Disconnect nodes
      try {
        source.disconnect();
        scriptNode.disconnect();
      } catch {
        // ignore disconnect errors
      }

      const inputSampleRate = audioCtx.sampleRate;
      await audioCtx.close();

      // Merge all captured float buffers
      let totalLength = 0;
      for (const chunk of capturedChunks) {
        totalLength += chunk.length;
      }

      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of capturedChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Resample to 16,000 Hz if needed
      const targetSampleRate = 16000;
      const resampled =
        inputSampleRate === targetSampleRate
          ? merged
          : resampleLinear(merged, inputSampleRate, targetSampleRate);

      // Encode into 16-bit mono PCM WAV
      const wavBuffer = encodeWavBuffer(resampled, targetSampleRate);
      return new Blob([wavBuffer], { type: "audio/wav" });
    },
  };
}

/**
 * Fast, accurate linear interpolation resampler for speech audio
 */
function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originPos = i * ratio;
    const index = Math.floor(originPos);
    const fraction = originPos - index;

    if (index + 1 < input.length) {
      result[i] = input[index] * (1 - fraction) + input[index + 1] * fraction;
    } else if (index < input.length) {
      result[i] = input[index];
    }
  }

  return result;
}

/**
 * Encodes Float32Array samples into a standard 44-byte RIFF/WAVE 16-bit PCM buffer
 */
export function encodeWavBuffer(
  samples: Float32Array,
  sampleRate: number
): ArrayBuffer {
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  /* RIFF header */
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true); // file size - 8
  writeAscii(view, 8, "WAVE");

  /* fmt chunk */
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // subchunk1 size (16 for PCM)
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, numChannels, true); // num channels (1 = mono)
  view.setUint32(24, sampleRate, true); // sample rate (16000)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample (16)

  /* data chunk */
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Write 16-bit PCM samples with clipping protection
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
