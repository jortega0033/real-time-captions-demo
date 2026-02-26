// required dom elements
const video = document.querySelector('video');
const captions = document.getElementById('captions');
const startButton = document.getElementById('btn-start-recording');
const stopButton = document.getElementById('btn-stop-recording');

// set initial state of application variables
let socket;
let recorder;
captions.style.display = 'none';

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
  socket.send(JSON.stringify({ type: 'Terminate' }));
  socket.close();
  socket = null;

  recorder.camera.stop();
  recorder.destroy();
  recorder = null;
}

//Starts real-time session and trasncription
startButton.onclick = async function () {
  this.disabled = true;
  this.innerText = 'Camera Loading...'

  const isLocal = window.location.hostname === 'localhost'
  const url = isLocal ? 'http://localhost:8000/' : 'https://broken-smoke-9608.fly.dev/'
  
  const response = await fetch(url); // get temp session token from server.js (backend)
  const data = await response.json();

  if(data.error){
    alert(data.error)
  }

  const { token } = data;

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
  recorder.stopRecording(stopRecordingCallback);
  startButton.disabled = false;
};