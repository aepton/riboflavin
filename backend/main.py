from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import re
from datetime import datetime
from pydantic import BaseModel

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

class SaveDataRequest(BaseModel):
    columns: list
    edges: list

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
    column_map = {
        'Michael Barbaro': columns[0],
        'Stephen Macedo': columns[1], 
        'Frances Lee': columns[2]
    }  # speaker name -> column
    notes = []
    note_id_counter = 1
    current_speaker = None
    current_paragraph = []
    
    for line in conversation_lines + ['']:
        line = line.rstrip()
        # Speaker name line
        speaker_match = re.match(r'^([a-z]+\s+[a-z]+)$', line.lower())
        if speaker_match or line == '':
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
                        column['notes'].append({n: note[n] for n in ['id', 'content']})
                        notes.append(note)
                        note_id_counter += 1
            if speaker_match:
                current_speaker = speaker_match.group(1)
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
        
        # Other possibilities are ellipsis, yes, and no edge types
        edge_type = 'smoothstep'
        
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

@app.get("/")
def read_root():
    return {"message": "Riboflavin Backend API"}

@app.post("/api/parse-daily-covids-wake")
def parse_daily_covids_wake():
    """Parse the daily_covids_wake.txt file and save to both parsed and public directories"""
    try:
        parsed_data = parse_daily_covids_wake_transcript()
        
        # Save to public directory (for frontend static loading)
        public_file_path = os.path.join(PUBLIC_DIR, "daily_covids_wake_parsed.json")
        with open(public_file_path, 'w', encoding='utf-8') as f:
            json.dump(parsed_data, f, indent=2, ensure_ascii=False)
        
        return {"message": "Data parsed and saved successfully", "data": parsed_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-data")
def save_data(request: SaveDataRequest):
    """Save the provided data to a timestamped file in the same format as the existing data"""
    try:
        columns = request.columns
        edges = request.edges
        
        # Generate a timestamp
        timestamp = datetime.now().strftime('%Y-%m-%d-%H-%M-%S')
        
        # Save to parsed directory
        parsed_file_path = os.path.join(PARSED_DIR, f"daily_covids_wake_parsed_{timestamp}.json")
        with open(parsed_file_path, 'w', encoding='utf-8') as f:
            json.dump({
                'columns': columns,
                'edges': edges
            }, f, indent=2, ensure_ascii=False)
        
        return {"message": f"Data saved successfully to {parsed_file_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

    """
    parsed_data = parse_daily_covids_wake_transcript()
    
    # Save to public directory (for frontend static loading)
    public_file_path = os.path.join(PUBLIC_DIR, "daily_covids_wake_parsed.json")
    with open(public_file_path, 'w', encoding='utf-8') as f:
        json.dump(parsed_data, f, indent=2, ensure_ascii=False)
    """