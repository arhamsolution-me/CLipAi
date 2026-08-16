const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

const srtPath = 'D:\\clip\\react-app\\public\\clips\\test.srt';
require('fs').writeFileSync(srtPath, '1\n00:00:00,000 --> 00:00:10,000\nHello World\n\n');

const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
const forceStyle = `FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=120,Alignment=2`;
const subtitlesDef = `subtitles='${escapedSrtPath}':force_style='${forceStyle}'`;

const filterGraph = [
    `[0:v]${subtitlesDef}[final]`
];

console.log("Running ffmpeg...");
ffmpeg('D:\\clip\\react-app\\public\\clips\\seg_cmsw9zeao001b11t4hrysre0v.mp4')
    .complexFilter(filterGraph)
    .videoCodec('libx264')
    .outputOptions([
        '-map', '[final]',
        '-map', '0:a?',
        '-preset', 'veryfast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-avoid_negative_ts', 'make_zero'
    ])
    .audioCodec('aac')
    .on('start', cmd => console.log('CMD:', cmd))
    .on('error', err => console.error('ERROR:', err))
    .on('end', () => console.log('SUCCESS'))
    .save('D:\\clip\\react-app\\public\\clips\\out_test.mp4');
