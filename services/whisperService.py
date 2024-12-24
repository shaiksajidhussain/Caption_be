import sys
import json
import os
from datetime import timedelta
import torch
import whisper
import warnings
import subprocess

# Suppress warnings
warnings.filterwarnings('ignore')

def format_timestamp(seconds):
    td = timedelta(seconds=seconds)
    hours = td.seconds//3600
    minutes = (td.seconds//60)%60
    seconds = td.seconds%60
    milliseconds = td.microseconds//1000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{milliseconds:03d}"

def create_timestamped_text(segments):
    timestamped_text = []
    for segment in segments:
        timestamped_text.append({
            "start": format_timestamp(segment['start']),
            "end": format_timestamp(segment['end']),
            "text": segment['text'].strip(),
            "start_seconds": float(segment['start']),
            "end_seconds": float(segment['end'])
        })
    return timestamped_text

def transcribe_video(video_path, transcription_id):
    try:
        if not check_ffmpeg():
            print(json.dumps({"error": "FFmpeg is required but not found"}))
            sys.exit(1)

        video_path = os.path.normpath(video_path)
        print(json.dumps({"status": "Starting transcription..."}))

        if not os.path.exists(video_path):
            print(json.dumps({"error": f"Video file not found at: {video_path}"}))
            sys.exit(1)

        # Load model
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = whisper.load_model("base", device=device)
        
        print(json.dumps({"status": "Model loaded, transcribing..."}))
        
        # Transcribe with more options
        result = model.transcribe(
            video_path,
            fp16=False,
            language='en',
            verbose=False
        )
        
        # Create SRT file
        srt_dir = os.path.dirname(video_path)
        srt_path = os.path.join(srt_dir, f"{transcription_id}.srt")
        
        # Create timestamped segments
        timestamped_segments = create_timestamped_text(result["segments"])
        
        # Prepare response
        response = {
            "text": result["text"],
            "srtPath": srt_path,
            "duration": float(sum([segment["end"] - segment["start"] for segment in result["segments"]])),
            "language": result["language"],
            "segments": timestamped_segments,
            "wordCount": len(result["text"].split()),
            "segmentCount": len(result["segments"])
        }
        
        print(json.dumps(response))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

def check_ffmpeg():
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        print(json.dumps({"status": "FFmpeg check passed"}))
        return True
    except Exception as e:
        print(json.dumps({"error": f"FFmpeg not found: {str(e)}"}))
        return False

if __name__ == "__main__":
    try:
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Missing arguments"}))
            sys.exit(1)
        
        video_path = sys.argv[1]
        transcription_id = sys.argv[2]
        
        print(json.dumps({"status": "Starting process", "video": video_path, "id": transcription_id}))
        transcribe_video(video_path, transcription_id)
        
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
