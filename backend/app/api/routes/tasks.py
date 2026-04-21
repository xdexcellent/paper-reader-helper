"""Task status polling API."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.task_queue import BackgroundTaskQueue, TaskInfo

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskResponse(BaseModel):
    id: str
    type: str
    paper_id: int | None
    status: str
    progress_message: str
    created_at: str
    completed_at: str | None
    error: str | None


def _task_to_response(t: TaskInfo) -> TaskResponse:
    return TaskResponse(
        id=t.id,
        type=t.type,
        paper_id=t.paper_id,
        status=t.status.value,
        progress_message=t.progress_message,
        created_at=t.created_at.isoformat(),
        completed_at=t.completed_at.isoformat() if t.completed_at else None,
        error=t.error,
    )


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: str) -> TaskResponse:
    queue = BackgroundTaskQueue()
    task = queue.get_task(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return _task_to_response(task)


@router.get("", response_model=list[TaskResponse])
def list_tasks() -> list[TaskResponse]:
    queue = BackgroundTaskQueue()
    return [_task_to_response(t) for t in queue.list_tasks()]
