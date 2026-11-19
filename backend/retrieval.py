from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"

def load_chunks():
    chunks = []
    for path in sorted(DATA_DIR.glob("*.txt")):
        text = path.read_text(encoding="utf-8")

        for paragraph in text.split("\n\n"):
            paragraph = paragraph.strip()
            if paragraph:
                chunks.append({
                    "source": path.name,
                    "text": paragraph,
                })
    return chunks

def make_words(text):
    cleaned = text.lower()
    for mark in "?!,./:()-":
        cleaned = cleaned.replace(mark, " ")
    return cleaned.split()

def find_chunks(question):
    question_words = make_words(question)
    found = []
    for chunk in load_chunks() :
        content_words = make_words(chunk["text"])
        for word in question_words:
            if len(word) > 1 and word in content_words:
                found.append(chunk)
                break
        if len(found) == 3:
            break
    return found