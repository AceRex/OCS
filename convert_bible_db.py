import json
import sqlite3
import os

def convert_to_sqlite():
    db_path = 'src/Bible/bibles.db'
    temp_db_path = 'src/Bible/bibles_temp.db'
    
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)
    
    conn = sqlite3.connect(temp_db_path)
    c = conn.cursor()
    
    # Create normalized schema
    # Books table to avoid repeating book names
    c.execute('''
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY,
            name TEXT,
            abbrev TEXT
        )
    ''')
    
    # Verses table
    c.execute('''
        CREATE TABLE IF NOT EXISTS verses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version TEXT,
            book_id INTEGER,
            chapter INTEGER,
            verse INTEGER,
            text TEXT,
            FOREIGN KEY(book_id) REFERENCES books(id)
        )
    ''')

    versions = {}
    bible_dir = 'src/Bible'
    for filename in os.listdir(bible_dir):
        if filename.startswith('en_') and filename.endswith('.json'):
            version_code = filename[3:-5]
            versions[version_code] = os.path.join(bible_dir, filename)

    print("Starting conversion...")

    for version_code, file_path in versions.items():
        if not os.path.exists(file_path):
            print(f"Skipping {version_code}: File not found")
            continue

        print(f"Processing {version_code}...")
        with open(file_path, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
            
            # Populate Books (only once, assuming structure matches)
            # We assume the book order/names are consistent across these specific JSONs from the same source
            if version_code == 'kjv': # Use KJV as the reference for books
                for i, book in enumerate(data):
                    c.execute('INSERT OR IGNORE INTO books (id, name, abbrev) VALUES (?, ?, ?)', 
                              (i, book['name'], book['abbrev']))

            # Populate Verses
            for book_idx, book in enumerate(data):
                for chapter_idx, chapter in enumerate(book['chapters']):
                    for verse_idx, verse_text in enumerate(chapter):
                        c.execute('''
                            INSERT INTO verses (version, book_id, chapter, verse, text) 
                            VALUES (?, ?, ?, ?, ?)
                        ''', (version_code, book_idx, chapter_idx + 1, verse_idx + 1, verse_text))
    
    conn.commit()
    conn.close()

    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError as e:
            print(f"Error removing old DB: {e}")
    
    os.rename(temp_db_path, db_path)
    
    # Size comparison
    sqlite_size = os.path.getsize(db_path)
    json_size = sum(os.path.getsize(f) for f in versions.values() if os.path.exists(f))
    
    print(f"\nconversion complete.")
    print(f"Total JSON size: {json_size / 1024 / 1024:.2f} MB")
    print(f"SQLite DB size:  {sqlite_size / 1024 / 1024:.2f} MB")
    print(f"Space Saved:     {(json_size - sqlite_size) / 1024 / 1024:.2f} MB")

if __name__ == '__main__':
    convert_to_sqlite()
