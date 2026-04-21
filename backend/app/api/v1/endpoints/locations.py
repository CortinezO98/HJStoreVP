from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.db.session import get_db
from app.core.deps import require_admin, get_current_user
from app.models.models import Location, LocationType, User
from app.schemas.schemas import LocationCreate, LocationUpdate, LocationOut

router = APIRouter(prefix="/locations", tags=["Ubicaciones"])


@router.get("", response_model=List[LocationOut])
def list_locations(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return db.query(Location).filter(Location.active == True).all()


@router.post("", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(
    data: LocationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    loc = Location(**data.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.put("/{location_id}", response_model=LocationOut)
def update_location(
    location_id: int,
    data: LocationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Ubicación no encontrada")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(loc, k, v)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_location(
    location_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Ubicación no encontrada")
    loc.active = False
    db.commit()
