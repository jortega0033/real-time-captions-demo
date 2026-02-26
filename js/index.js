// required dom elements
const video = document.querySelector('video');
const captions = document.getElementById('captions');
const startButton = document.getElementById('btn-start-recording');
const stopButton = document.getElementById('btn-stop-recording');

// set initial state of application variables
let socket;
let recorder;
captions.style.display = 'none';

const setIdleUiState = () => {
  startButton.disabled = false;
  startButton.innerText = 'Start Recording';
  stopButton.disabled = true;
};

// Gets access to the webcam and microphone
const captureCamera = (callback) => {
  navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 1480, height: 720 } })
    .then(camera => {
      callback(camera)
    })
    .catch(error => {
      alert('Unable to capture your camera. Please check console logs.');
      console.error(error);
    }
  );
}

// Stops recording and ends real-time session. 
const stopRecordingCallback = () => {
  if (socket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'Terminate' }));
    }
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    socket = null;
  }

  if (recorder) {
    if (recorder.camera) {
      recorder.camera.stop();
    }
    recorder.destroy();
    recorder = null;
  }
}

const getTempToken = async (url) => {
  let response = await fetch(url, { method: 'GET' });

  if (response.status === 405) {
    response = await fetch(url, { method: 'POST' });
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Token endpoint did not return JSON. Confirm your backend is running on port 8000.');
  }

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Token request failed (${response.status})`);
  }

  if (!data?.token) {
    throw new Error('Token response missing token field.');
  }

  return data.token;
}

//Starts real-time session and trasncription
startButton.onclick = async function () {
  this.disabled = true;
  this.innerText = 'Camera Loading...'

  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const url = isLocal ? 'http://localhost:8001/' : 'https://broken-smoke-9608.fly.dev/'

  let token;
  try {
    token = await getTempToken(url);
  } catch (error) {
    alert(error.message || 'Unable to start session.');
    setIdleUiState();
    return;
  }

  // establish wss with AssemblyAI (AAI) using v3 streaming endpoint
  socket = await new WebSocket(
    `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&encoding=pcm_s16le&token=${token}`,
  );

  // handle incoming messages to display captions on screen
  let latestTranscript = '';
  socket.onmessage = (message) => {
    const res = JSON.parse(message.data);
    if (res.type === 'Turn') {
      latestTranscript = (res.transcript || '').trim();
      captions.innerText = latestTranscript;
      return;
    }
    if (res.type === 'Termination') {
      captions.innerText = '';
    }
  };

  socket.onerror = (event) => {
    console.error(event);
    socket.close();
  }
  
  socket.onclose = event => {
    console.log(event);
    captions.innerText = ''

    if (event.code === 1008 && event.reason?.toLowerCase().includes('invalid api key')) {
      alert('AssemblyAI rejected the connection: invalid API key. Check API_KEY in .env and restart `npm run start`.');
      setIdleUiState();
    }

    socket = null;
  }

  socket.onopen = () => {
    captureCamera(function(camera) {
        startButton.innerText = 'Start Recording'
        video.controls = false;
        video.muted = true;
        video.volume = 0;
        video.srcObject = camera;

        captions.style.display = '';

        // once socket is open, create a new recorder object and start recording (specifications must match real-time requirements)
        recorder = new RecordRTC(camera, {
            type: 'audio',
            mimeType: 'audio/webm;codecs=pcm', // endpoint requires 16bit PCM audio
            recorderType: StereoAudioRecorder,
            timeSlice: 250, // set 250 ms intervals of data that sends to AAI
            desiredSampRate: 16000,
            numberOfAudioChannels: 1, // real-time requires only one channel
            bufferSize: 4096,
            audioBitsPerSecond: 128000,
            ondataavailable: (blob) => {
              const reader = new FileReader();
              reader.onload = () => {
                const base64data = reader.result;

                // audio data must be sent as binary PCM bytes on v3
                if (socket) {
                  const binaryString = atob(base64data.split('base64,')[1]);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  socket.send(bytes.buffer);
                }
              };
              reader.readAsDataURL(blob);
            },
        });

        recorder.startRecording();

        // release camera on stopRecording
        recorder.camera = camera;
        stopButton.disabled = false;
    });
  }
};

stopButton.onclick = function() {
  this.disabled = true;
  if (!recorder) {
    stopRecordingCallback();
    setIdleUiState();
    return;
  }

  recorder.stopRecording(stopRecordingCallback);
  setIdleUiState();
};