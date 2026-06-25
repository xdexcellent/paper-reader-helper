from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class VenueRank(SQLModel, table=True):
    __tablename__ = "venue_rank"

    venue_key: str = Field(primary_key=True, max_length=512)
    venue_raw: str = ""

    impact_factor: str = ""
    impact_factor_5y: str = ""
    jcr_sci: str = ""
    jcr_ssci: str = ""
    cas_upgrade: str = ""
    cas_upgrade_top: str = ""
    cas_base: str = ""
    cas_upgrade_small: str = ""
    jci: str = ""
    esi: str = ""
    warn: str = ""
    ei: str = ""
    ahci: str = ""
    cssci: str = ""
    pku: str = ""
    cscd: str = ""
    utd24: str = ""
    ft50: str = ""
    ajg: str = ""
    fms: str = ""
    swufe: str = ""
    cufe: str = ""
    uibe: str = ""
    sdufe: str = ""

    query_status: str = Field(default="pending", max_length=32)
    last_queried_at: datetime | None = None
    error_message: str = ""
