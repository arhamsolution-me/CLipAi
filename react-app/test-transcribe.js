const { extractAudioForTranscription } = require('./src/lib/services/video');
const { transcribeAudioToSrt } = require('./src/lib/services/ai');
const path = require('path');
const fs = require('fs');

async function run() {
    const video = path.join(__dirname, 'public/clips/seg_cmsw9zedh001d11t474k75am4.mp4');
    const audio = path.join(__dirname, 'public/clips/test_audio.mp3');
    const srt = path.join(__dirname, 'public/clips/test_subs.srt');

    console.log("Extracting audio...");
    await extractAudioForTranscription(video, audio, 0, 60);

    console.log("Transcribing...");
    require('dotenv').config(); // Load .env
    const success = await transcribeAudioToSrt(audio, srt);
    console.log("Success:", success);

    if (success) {
        console.log(fs.readFileSync(srt, 'utf8'));
    }
}
run();
