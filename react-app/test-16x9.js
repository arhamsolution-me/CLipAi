const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegStatic);

const filterGraph = [
    `[0:v]drawtext=fontfile='C:/Windows/Fonts/arialbd.ttf':text='Hello World':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=h/2[final]`
];

console.log("Running ffmpeg...");
ffmpeg('D:\\clip\\react-app\\public\\clips\\seg_cmsw9zedh001d11t474k75am4.mp4')
    .complexFilter(filterGraph)
    .videoCodec('libx264')
    .outputOptions([
        '-map', '[final]',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-t', '2'
    ])
    .on('start', cmd => console.log('CMD:', cmd))
    .on('error', err => console.error('ERROR:', err.message))
    .on('end', () => console.log('SUCCESS'))
    .save('D:\\clip\\react-app\\public\\clips\\out_16x9_test.mp4');
