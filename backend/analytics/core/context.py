from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd


@dataclass
class Ctx:
    d: pd.DataFrame
    clients: pd.DataFrame
    data_dir: Path
    tables: dict[str, pd.DataFrame] = field(default_factory=dict)

    def csv(self, name: str) -> pd.DataFrame:
        return pd.read_csv(self.data_dir / name)
