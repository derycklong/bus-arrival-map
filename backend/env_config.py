import os
from dotenv import load_dotenv

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_PATH = os.path.join(PROJECT_DIR, "data", ".env")

if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH, override=True)


def get_lta_account_key() -> str | None:
    return os.environ.get("LTA_DATAMALL_ACCOUNT_KEY")
