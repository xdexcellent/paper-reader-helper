"""In-process background task queue using threading.

Avoids the need for Celery/Redis while still providing async task execution.
"""

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class TaskInfo:
    id: str
    type: str
    paper_id: int | None = None
    status: TaskStatus = TaskStatus.QUEUED
    progress_message: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None
    error: str | None = None


class BackgroundTaskQueue:
    """Simple singleton task queue backed by a thread pool."""

    _instance: "BackgroundTaskQueue | None" = None

    def __new__(cls) -> "BackgroundTaskQueue":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._tasks = {}
            cls._instance._lock = threading.Lock()
        return cls._instance

    _tasks: dict[str, TaskInfo]
    _lock: threading.Lock

    def submit(
        self,
        task_type: str,
        func: Callable[[], Any],
        paper_id: int | None = None,
    ) -> str:
        """Submit a task for background execution. Returns task_id."""
        task_id = str(uuid.uuid4())[:8]
        task = TaskInfo(id=task_id, type=task_type, paper_id=paper_id)

        with self._lock:
            self._tasks[task_id] = task

        thread = threading.Thread(
            target=self._run_task, args=(task_id, func), daemon=True
        )
        thread.start()
        return task_id

    def get_task(self, task_id: str) -> TaskInfo | None:
        with self._lock:
            return self._tasks.get(task_id)

    def list_tasks(self, limit: int = 20) -> list[TaskInfo]:
        with self._lock:
            tasks = sorted(
                self._tasks.values(),
                key=lambda t: t.created_at,
                reverse=True,
            )
            return tasks[:limit]

    def has_active_task(self, task_type: str, paper_id: int | None = None) -> bool:
        with self._lock:
            for task in self._tasks.values():
                if task.type != task_type:
                    continue
                if paper_id is not None and task.paper_id != paper_id:
                    continue
                if task.status in {TaskStatus.QUEUED, TaskStatus.RUNNING}:
                    return True
            return False

    def _run_task(self, task_id: str, func: Callable[[], Any]) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            task.status = TaskStatus.RUNNING
            task.progress_message = "正在执行..."

        try:
            func()
            with self._lock:
                task = self._tasks[task_id]
                task.status = TaskStatus.COMPLETED
                task.progress_message = "已完成"
                task.completed_at = datetime.now(timezone.utc)
        except Exception as e:
            logger.exception("Background task %s failed", task_id)
            with self._lock:
                task = self._tasks[task_id]
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.progress_message = f"失败: {e}"
                task.completed_at = datetime.now(timezone.utc)
