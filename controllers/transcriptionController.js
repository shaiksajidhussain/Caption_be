const Transcription = require('../models/Transcription');
const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs');

exports.uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    // Clean the filename
    const cleanFileName = req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
    
    // Create absolute paths
    const uploadDir = path.join(__dirname, '..', 'uploads');
    const newPath = path.join(uploadDir, cleanFileName);
    
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Move file to uploads directory
    fs.renameSync(req.file.path, newPath);

    const transcription = new Transcription({
      fileName: req.file.originalname,
      videoPath: newPath,
      language: 'en',
      status: 'processing'
    });

    await transcription.save();

    const options = {
      mode: 'json',
      pythonPath: 'python',
      scriptPath: path.join(__dirname, '..', 'services'),
      args: [newPath, transcription._id.toString()]
    };

    PythonShell.run('whisperService.py', options)
      .then(async (messages) => {
        // Get the last message which contains our result
        const result = messages[messages.length - 1];
        
        // Update transcription with all the data including segments
        const updateData = {
          text: result.text,
          srtPath: result.srtPath,
          duration: result.duration,
          language: result.language,
          segments: result.segments.map(segment => ({
            start: segment.start,
            end: segment.end,
            text: segment.text,
            start_seconds: segment.start_seconds,
            end_seconds: segment.end_seconds
          })),
          wordCount: result.wordCount,
          segmentCount: result.segmentCount,
          status: 'completed'
        };

        // Log the segments for debugging
        console.log('Segments received:', result.segments.length);
        console.log('First segment:', result.segments[0]);

        await Transcription.findByIdAndUpdate(
          transcription._id,
          updateData,
          { new: true }
        );
      })
      .catch(async (err) => {
        console.error('Python error:', err);
        await Transcription.findByIdAndUpdate(
          transcription._id,
          {
            status: 'failed',
            error: err.toString()
          }
        );
      });

    res.status(201).json({
      message: 'Video uploaded and processing started',
      transcriptionId: transcription._id
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Error uploading video' });
  }
};

exports.startTranscription = async (transcriptionId, res) => {
  try {
    const transcription = await Transcription.findById(transcriptionId);
    
    // Verify file exists
    if (!fs.existsSync(transcription.videoPath)) {
      throw new Error(`Video file not found at ${transcription.videoPath}`);
    }

    transcription.status = 'processing';
    await transcription.save();

    const options = {
      mode: 'json',
      pythonPath: 'python',
      scriptPath: path.join(__dirname, '..', 'services'),
      args: [
        transcription.videoPath,
        transcriptionId.toString()
      ]
    };

    console.log('Starting transcription with options:', options);

    PythonShell.run('whisperService.py', options)
      .then(async (messages) => {
        console.log('Python messages:', messages);
        
        const result = messages.find(msg => msg && msg.text);
        
        if (!result) {
          throw new Error('No valid result from Python script');
        }

        transcription.text = result.text;
        transcription.srtPath = result.srtPath;
        transcription.duration = result.duration;
        transcription.language = result.language;
        transcription.status = 'completed';
        await transcription.save();
      })
      .catch(async (err) => {
        console.error('Python error:', err);
        transcription.status = 'failed';
        transcription.error = err.toString();
        await transcription.save();
      });

    res.status(201).json({
      message: 'Video uploaded and processing started',
      transcriptionId: transcription._id
    });

  } catch (error) {
    console.error('Transcription error:', error);
    if (res && !res.headersSent) {
      res.status(500).json({ message: 'Error processing transcription' });
    }
  }
};

exports.getTranscriptions = async (req, res) => {
  try {
    const transcriptions = await Transcription.find()
      .sort({ createdAt: -1 })
      .select('-__v');
    res.json(transcriptions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transcriptions' });
  }
};

exports.getTranscription = async (req, res) => {
  try {
    const transcription = await Transcription.findById(req.params.id);
    if (!transcription) {
      return res.status(404).json({ message: 'Transcription not found' });
    }
    res.json(transcription);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transcription' });
  }
};
