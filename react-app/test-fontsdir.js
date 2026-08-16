const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

const srtPath = 'D:\\clip\\react-app\\public\\clips\\test.srt';
require('fs').writeFileSync(srtPath, '1\n00:00:00,000 --> 00:00:10,000\nHello World\n\n');

const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

// Let's try adding fontsdir!
const fontsDir = 'C:/Windows/Fonts'.replace(/\\/g, '/').replace(/:/g, '\\:');
const forceStyle = `FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=120,Alignment=2`;
const subtitlesDef = `subtitles='${escapedSrtPath}':fontsdir='${fontsDir}':force_style='${forceStyle}'`;

const filterGraph = [
    `[0:v]${subtitlesDef}[final]`
];

console.log("Running ffmpeg...");
ffmpeg('D:\\clip\\react-app\\public\\clips\\seg_cmsw9zedh001d11t474k75am4.mp4')
    .complexFilter(filterGraph)
    .videoCodec('libx264')
    .outputOptions([
        '-map', '[final]',
        '-map', '0:a?',
        '-preset', 'ultrafast', // super fast for testing
        '-crf', '28',
        '-t', '5' // only 5 seconds
    ])
    .on('start', cmd => console.log('CMD:', cmd))
    .on('error', err => console.error('ERROR:', err))
    .on('end', () => console.log('SUCCESS'))
    .save('D:\\clip\\react-app\\public\\clips\\out_test2.mp4');
