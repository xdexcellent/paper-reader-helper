import logging
import re
from sqlmodel import Session, create_engine, select
from app.models.paper import Paper
from app.models.paper_content import PaperContent
from app.services.section_extractor import SectionExtractor
from app.core.config import settings

# Setup DB connection
engine = create_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    echo=False,
    connect_args={"check_same_thread": False},
)

def inspect_markdown(paper_id: int):
    with Session(engine) as session:
        content = session.exec(
            select(PaperContent).where(PaperContent.paper_id == paper_id)
        ).first()
        
        if not content or not content.full_markdown:
            print("No markdown found.")
            return

        markdown = content.full_markdown
        print(f"Total markdown length: {len(markdown)}")
        
        # Print all headers
        headers = re.findall(r'^(#+)\s+(.+)$', markdown, flags=re.MULTILINE)
        print("--- Headers found ---")
        for i, (hashes, title) in enumerate(headers):
            print(f"{hashes} {title}")
            if i > 20:
                print("... (truncated)")
                break
                
        # Try extraction
        extractor = SectionExtractor()
        sections = extractor.extract(markdown)
        print("\n--- Extracted parts lengths ---")
        for k, v in sections.items():
            print(f"{k}: {len(v)} chars")

if __name__ == "__main__":
    inspect_markdown(13)
