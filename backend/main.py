from fastapi import FastAPI, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid
import json
import re
from pydantic import BaseModel
from datetime import datetime
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RAW_DIR = "../data/raw"
PARSED_DIR = "../data/parsed"
PUBLIC_DIR = "../public"  # Add public directory for static assets
os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(PARSED_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)

class TextContent(BaseModel):
    content: str

class ParsedData(BaseModel):
    columns: list
    edges: list

def parse_dialogue(text: str):
    dialogue = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        speaker_match = re.match(r"^([A-Z\s]+):\s*(.*)", line)
        if speaker_match:
            speaker = speaker_match.group(1).strip()
            dialogue_text = speaker_match.group(2).strip()
            if dialogue_text:
                dialogue.append({"speaker": speaker, "text": dialogue_text})
        elif len(line) > 20:
            dialogue.append({"speaker": "NARRATION", "text": line})
    return dialogue

def parse_daily_covids_wake_transcript():
    """Parse the daily_covids_wake.txt file into notes for each paragraph, with sequential edges."""
    file_path = "../data/raw/daily_covids_wake.txt"
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.strip().split('\n')
    
    # Exclusion list for columns that should not generate nodes or edges
    excluded_columns = {"Background Reading", "Site Index"}
    
    # Find where the actual conversation starts
    start_index = 0
    for i, line in enumerate(lines):
        if re.match(r'^[a-z]+\s+[a-z]+$', line.lower()):
            start_index = i
            break
    
    conversation_lines = lines[start_index:]
    
    columns = [
        {'id': 'column-1', 'title': 'Michael Barbaro', 'notes': []},
        {'id': 'column-2', 'title': 'Stephen Macedo', 'notes': []},
        {'id': 'column-3', 'title': 'Frances Lee', 'notes': []},
        {'id': 'column-4', 'title': '', 'notes': []},  # Empty fourth column
    ]
    column_map = {}  # speaker name -> column
    notes = []
    note_id_counter = 1
    current_speaker = None
    current_paragraph = []
    
    for line in conversation_lines + ['']:
        line = line.rstrip()
        # Speaker name line
        speaker_match = re.match(r'^([a-z]+\s+[a-z]+)$', line.lower())
        if speaker_match:
            # Flush any paragraph in progress
            if current_speaker and current_paragraph:
                paragraph = '\n'.join(current_paragraph).strip()
                if paragraph:
                    speaker_title = ' '.join(word.capitalize() for word in current_speaker.split())
                    # Skip excluded columns
                    if speaker_title not in excluded_columns:
                        if speaker_title not in column_map:
                            column = {
                                'id': f'column-{len(columns) + 1}',
                                'title': speaker_title,
                                'notes': []
                            }
                            columns.append(column)
                            column_map[speaker_title] = column
                        else:
                            column = column_map[speaker_title]
                        note = {
                            'id': f'note-{note_id_counter}',
                            'content': paragraph,
                            'columnId': column['id']
                        }
                        column['notes'].append(note)
                        notes.append(note)
                        note_id_counter += 1
                current_paragraph = []
            current_speaker = speaker_match.group(1)
        elif line == '':
            # Blank line: flush paragraph if any
            if current_speaker and current_paragraph:
                paragraph = '\n'.join(current_paragraph).strip()
                if paragraph:
                    speaker_title = ' '.join(word.capitalize() for word in current_speaker.split())
                    # Skip excluded columns
                    if speaker_title not in excluded_columns:
                        if speaker_title not in column_map:
                            column = {
                                'id': f'column-{len(columns) + 1}',
                                'title': speaker_title,
                                'notes': []
                            }
                            columns.append(column)
                            column_map[speaker_title] = column
                        else:
                            column = column_map[speaker_title]
                        note = {
                            'id': f'note-{note_id_counter}',
                            'content': paragraph,
                            'columnId': column['id']
                        }
                        column['notes'].append(note)
                        notes.append(note)
                        note_id_counter += 1
                current_paragraph = []
        else:
            # Content line
            if current_speaker:
                if not (line.startswith('[') or line.startswith('(') or line.startswith('archived recording')):
                    current_paragraph.append(line)
    
    # Create sequential edges between notes
    edges = []
    for i in range(len(notes) - 1):
        source_note = notes[i]
        target_note = notes[i + 1]
        
        # Determine if nodes are from the same speaker
        same_speaker = source_note['columnId'] == target_note['columnId']
        
        # Randomly choose between standard, ellipsis, yes, and no edge types
        edge_type = random.choice(['smoothstep', 'ellipsis', 'yes', 'no'])
        
        # Smart handle selection based on speaker relationship and positions
        if same_speaker:
            # Same speaker: use bottom of source, top of target (vertical flow)
            source_handle = 'bottom'
            target_handle = 'top'
        else:
            # Different speakers: determine best handles based on relative positions
            source_column_idx = int(source_note['columnId'].replace('column-', '')) - 1
            target_column_idx = int(target_note['columnId'].replace('column-', '')) - 1
            
            if source_column_idx < target_column_idx:
                # Source is to the left of target: right → left
                source_handle = 'right'
                target_handle = 'left'
            else:
                # Source is to the right of target: left → right
                source_handle = 'left'
                target_handle = 'right'
        
        edges.append({
            'id': f'edge-{i + 1}',
            'source': source_note['id'],
            'target': target_note['id'],
            'sourceHandle': source_handle,
            'targetHandle': target_handle,
            'type': edge_type
        })

    return {
        'columns': columns,
        'edges': edges
    }

def parse_transcript_to_notes(text_content: str):
    """Parse transcript text into columns and notes"""
    lines = text_content.strip().split('\n')
    columns = []
    edges = []
    current_column = None
    note_id_counter = 1
    
    # Speaker name normalization mapping
    speaker_mapping = {}
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Check if line starts with a speaker name (capitalized word followed by colon)
        speaker_match = re.match(r'^([A-Z][A-Z\s]+):\s*(.*)', line)
        if speaker_match:
            speaker_name = speaker_match.group(1).strip()
            content = speaker_match.group(2).strip()
            
            # Normalize speaker name
            if speaker_name not in speaker_mapping:
                # Check if this is a variation of an existing speaker
                normalized_name = None
                for existing_name in speaker_mapping.values():
                    if (speaker_name.lower() in existing_name.lower() or 
                        existing_name.lower() in speaker_name.lower() or
                        speaker_name.split()[-1].lower() == existing_name.split()[-1].lower()):
                        normalized_name = existing_name
                        break
                
                if normalized_name is None:
                    normalized_name = speaker_name
                
                speaker_mapping[speaker_name] = normalized_name
            
            normalized_speaker = speaker_mapping[speaker_name]
            
            # Find or create column for this speaker
            column = None
            for col in columns:
                if col['title'] == normalized_speaker:
                    column = col
                    break
            
            if not column:
                column = {
                    'id': f'column-{len(columns) + 1}',
                    'title': normalized_speaker,
                    'notes': []
                }
                columns.append(column)
            
            # Create note
            note = {
                'id': f'note-{note_id_counter}',
                'content': content,
                'columnId': column['id']
            }
            column['notes'].append(note)
            note_id_counter += 1
    
    # Create edges linking notes sequentially across columns
    all_notes = []
    for column in columns:
        all_notes.extend(column['notes'])
    
    # Sort notes by their order in the transcript
    for i in range(len(all_notes) - 1):
        edges.append({
            'id': f'edge-{i + 1}',
            'source': all_notes[i]['id'],
            'target': all_notes[i + 1]['id'],
            'type': 'smoothstep'
        })
    
    return {
        'columns': columns,
        'edges': edges
    }

@app.post("/upload-raw")
async def upload_raw(text: str = Form(...)):
    file_id = str(uuid.uuid4())
    raw_path = os.path.join(RAW_DIR, f"{file_id}.txt")
    parsed_path = os.path.join(PARSED_DIR, f"{file_id}.json")
    with open(raw_path, "w", encoding="utf-8") as f:
        f.write(text)
    parsed = parse_dialogue(text)
    with open(parsed_path, "w", encoding="utf-8") as f:
        json.dump(parsed, f, ensure_ascii=False, indent=2)
    return {"parsed_filename": f"{file_id}.json"}

@app.get("/parsed/{filename}")
async def get_parsed(filename: str):
    parsed_path = os.path.join(PARSED_DIR, filename)
    if not os.path.exists(parsed_path):
        return JSONResponse(status_code=404, content={"error": "File not found"})
    return FileResponse(parsed_path, media_type="application/json")

@app.get("/")
def read_root():
    return {"message": "Riboflavin Backend API"}

@app.get("/api/parsed-data")
def get_parsed_data():
    """Get the parsed data from the JSON file"""
    try:
        data_file = "data/parsed_data.json"
        if os.path.exists(data_file):
            with open(data_file, 'r') as f:
                data = json.load(f)
            return data
        else:
            return {"columns": [], "edges": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading parsed data: {str(e)}")

@app.post("/api/save-text")
def save_text(text_content: TextContent):
    """Save raw text content and parse it into notes"""
    try:
        # Create data directory if it doesn't exist
        os.makedirs("data", exist_ok=True)
        
        # Save raw text
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        raw_file = f"data/raw_text_{timestamp}.txt"
        with open(raw_file, 'w') as f:
            f.write(text_content.content)
        
        # Parse the text into notes
        parsed_data = parse_transcript_to_notes(text_content.content)
        
        # Save parsed data
        parsed_file = "data/parsed_data.json"
        with open(parsed_file, 'w') as f:
            json.dump(parsed_data, f, indent=2)
        
        return {
            "message": "Text saved and parsed successfully",
            "raw_file": raw_file,
            "parsed_file": parsed_file,
            "parsed_data": parsed_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving text: {str(e)}")

@app.post("/api/parse-daily-covids-wake")
def parse_daily_covids_wake():
    """Parse the daily_covids_wake.txt file and save to both parsed and public directories"""
    try:
        parsed_data = parse_daily_covids_wake_transcript()
        
        # Save to parsed directory (for backup)
        parsed_file_path = os.path.join(PARSED_DIR, "daily_covids_wake_parsed.json")
        with open(parsed_file_path, 'w', encoding='utf-8') as f:
            json.dump(parsed_data, f, indent=2, ensure_ascii=False)
        
        # Save to public directory (for frontend static loading)
        public_file_path = os.path.join(PUBLIC_DIR, "daily_covids_wake_parsed.json")
        with open(public_file_path, 'w', encoding='utf-8') as f:
            json.dump(parsed_data, f, indent=2, ensure_ascii=False)
        
        return {"message": "Data parsed and saved successfully", "data": parsed_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/daily-covids-wake")
def get_daily_covids_wake():
    """Get the parsed daily_covids_wake data"""
    try:
        data_file = "../data/daily_covids_wake_parsed.json"
        if os.path.exists(data_file):
            with open(data_file, 'r') as f:
                data = json.load(f)
            return data
        else:
            # Parse the file if it doesn't exist
            parsed_data = parse_daily_covids_wake_transcript()
            
            # Save parsed data
            with open(data_file, 'w') as f:
                json.dump(parsed_data, f, indent=2)
            
            return parsed_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading daily covids wake data: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 