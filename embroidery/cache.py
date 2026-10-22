"""Process-local, bounded storage of immutable object stitch plans."""
from collections import OrderedDict
import hashlib
import json
from threading import Lock


class ObjectPlanCache:
    """LRU bounded by both object variants and retained needle points.

    Routing is contextual: the preceding exit and following entry hint can
    change a plan without changing its object. Include both, and the hoop and
    trim settings, in addition to the complete resolved object payload. Fabric
    defaults and lock overrides have already been resolved by geometryPayload.
    Cache values contain no mutable references to request or response data.
    """
    def __init__(self, max_entries=256, max_points=200_000):
        self.max_entries, self.max_points = max_entries, max_points
        self._entries = OrderedDict()
        self._points = 0
        self._lock = Lock()

    def plan(self, obj, at, target, settings, planner):
        payload = json.dumps((obj, settings, at, target), sort_keys=True,
                             separators=(',', ':'), allow_nan=False).encode()
        key = hashlib.sha256(payload).digest()
        with self._lock:
            found = self._entries.get(key)
            if found is not None:
                self._entries.move_to_end(key)
                return found[0]
        # Do not hold the process-wide lock during compilation. Concurrent
        # misses may compute twice; their immutable plans are interchangeable.
        planned = planner(obj, at, target)
        frozen = tuple(tuple((tuple(tuple(p) for p in path), limit)
                             for path, limit in run) for run in planned)
        count = sum(len(path) for run in frozen for path, _ in run)
        if count > self.max_points or self.max_entries <= 0:
            return frozen
        with self._lock:
            previous = self._entries.pop(key, None)
            if previous is not None:
                self._points -= previous[1]
            self._entries[key] = (frozen, count)
            self._points += count
            while len(self._entries) > self.max_entries or self._points > self.max_points:
                _, (_, size) = self._entries.popitem(last=False)
                self._points -= size
        return frozen

    def clear(self):
        with self._lock:
            self._entries.clear()
            self._points = 0
