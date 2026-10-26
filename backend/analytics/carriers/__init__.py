"""Carriers pipeline step. Replaced by the owning resource's plan."""
import pandas as pd

from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    return {}
