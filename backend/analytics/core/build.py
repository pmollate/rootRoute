"""Core pipeline step (owner B). Filled in Tasks B5 and B6."""
import pandas as pd

from analytics.core.context import Ctx


def build(ctx: Ctx) -> dict[str, pd.DataFrame]:
    return {"clients": ctx.clients}
