const mongoose = require('mongoose');

const TranscriptionSchema = new mongoose.Schema({
  fileName: String,
  videoPath: String,
  text: String,
  srtPath: String,
  language: String,
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  duration: Number,
  segments: [{
    start: String,
    end: String,
    text: String,
    start_seconds: Number,
    end_seconds: Number
  }],
  wordCount: Number,
  segmentCount: Number,
  averageConfidence: Number,
  error: String,
}, {
  timestamps: true
});

module.exports = mongoose.model('Transcription', TranscriptionSchema);
