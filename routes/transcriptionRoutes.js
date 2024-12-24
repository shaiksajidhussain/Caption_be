const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const transcriptionController = require('../controllers/transcriptionController');
const fs = require('fs');
const Transcription = require('../models/Transcription');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    cb(null, `${Date.now()}-${sanitizedName}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /mp4|webm|ogg/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only video files are allowed!'));
  }
});

router.post('/upload', upload.single('video'), transcriptionController.uploadVideo);
router.get('/', transcriptionController.getTranscriptions);
router.get('/:id', transcriptionController.getTranscription);

// Route to serve SRT file
router.get('/:id/srt', async (req, res) => {
  try {
    const transcription = await Transcription.findById(req.params.id);
    if (!transcription || !transcription.srtPath) {
      return res.status(404).send('SRT file not found');
    }

    // Generate SRT content from segments
    let srtContent = '';
    transcription.segments.forEach((segment, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${segment.start} --> ${segment.end}\n`;
      srtContent += `${segment.text}\n\n`;
    });

    // Set headers for SRT file
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${transcription._id}.srt"`);
    
    // Send the generated SRT content
    res.send(srtContent);

  } catch (error) {
    console.error('Error serving SRT:', error);
    res.status(500).send('Error retrieving SRT file');
  }
});

// Route to serve video file
router.get('/:id/video', async (req, res) => {
  try {
    const transcription = await Transcription.findById(req.params.id);
    if (!transcription || !transcription.videoPath) {
      return res.status(404).send('Video file not found');
    }

    // Check if file exists
    if (!fs.existsSync(transcription.videoPath)) {
      return res.status(404).send('Video file not found on server');
    }

    // Stream the video file
    const stat = fs.statSync(transcription.videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize-1;
      const chunksize = (end-start)+1;
      const file = fs.createReadStream(transcription.videoPath, {start, end});
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, head);
      fs.createReadStream(transcription.videoPath).pipe(res);
    }
  } catch (error) {
    console.error('Error serving video:', error);
    res.status(500).send('Error retrieving video file');
  }
});

module.exports = router;
